// F-036 Phase B — "new arrivals" Web Push to shoppers who visited a store.
//
// One daily digest per store, not one push per upload: a bulk onboarding run adds
// hundreds of products, and the spec's cap is 2 pushes/store/week (§6). The cap is
// a Redis counter with a 7-day TTL set on the first send — if Redis loses it the
// worst case is one extra push, never a missed consent check.
//
// Who receives is resolved HERE, at send time: an active subscription whose account
// is not deleted and has a CustomerStoreVisit for the store with is_muted = false,
// and whose subscribing passport session is still live (logout on that device, or a
// 180-day idle expiry, stops its pushes). Muting a store therefore takes effect on
// the next run with no extra write.
//
// Payload: shop name, a product COUNT and the storefront path. Public catalog data
// only — never the shopper's phone or name (a push is shown on a lock screen).
//
// Collections are deliberately not pushed: most are 1:1 WhatsApp picks with no
// public flag, so a push would show one customer's pick to every visitor.
import { prisma } from '@kanchuki/db';
import webpush from 'web-push';
import { getRedis } from './queue.js';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const CAP_PER_WEEK = 2;
const CAP_TTL_SEC = 7 * 24 * 60 * 60;

// The server POSTs to whatever endpoint a browser hands it, so only the real push
// services are accepted (SSRF). Hostname suffixes, https only.
const PUSH_HOST_SUFFIXES = [
  'fcm.googleapis.com', // Chrome, Edge (Android + desktop), Samsung Internet
  'push.services.mozilla.com', // Firefox
  'push.apple.com', // Safari / iOS home-screen apps (web.push.apple.com)
  'notify.windows.com', // legacy Edge
];

export function isAllowedPushEndpoint(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '') return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

/** Public key the browser subscribes with, or null when push is not configured. */
export function getVapidPublicKey(): string | null {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  return VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY ? VAPID_PUBLIC_KEY : null;
}

function configureVapid(): boolean {
  const publicKey = getVapidPublicKey();
  if (!publicKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@kanchuki.com',
    publicKey,
    process.env.VAPID_PRIVATE_KEY as string,
  );
  return true;
}

/** Fixed-window weekly cap. Returns false once the store has used its sends. */
async function takeCapSlot(retailerId: string): Promise<boolean> {
  const redis = getRedis();
  const key = `cpush:cap:${retailerId}`;
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, CAP_TTL_SEC);
  return n <= CAP_PER_WEEK;
}

export interface NewArrivalsResult {
  skipped?: 'no_vapid';
  stores: number;
  sent: number;
  disabled: number;
  capped: number;
}

export async function handleNewArrivalsPush(now = new Date()): Promise<NewArrivalsResult> {
  const result: NewArrivalsResult = { stores: 0, sent: 0, disabled: 0, capped: 0 };
  if (!configureVapid()) return { ...result, skipped: 'no_vapid' };

  const groups = await prisma.product.groupBy({
    by: ['retailer_id'],
    where: {
      created_at: { gte: new Date(now.getTime() - WINDOW_MS) },
      deleted_at: null,
      status: 'AVAILABLE',
    },
    _count: { _all: true },
  });

  // ponytail: sequential sends — fine for pilot-size fan-out; batch with
  // Promise.allSettled in chunks if one store ever has thousands of subscribers.
  for (const group of groups) {
    const retailer = await prisma.retailer.findUnique({
      where: { id: group.retailer_id },
      select: { shop_name: true, public_slug: true, is_suspended: true, deleted_at: true },
    });
    if (!retailer?.public_slug || retailer.is_suspended || retailer.deleted_at) continue;

    const subs = await prisma.customerPushSubscription.findMany({
      where: {
        disabled_at: null,
        passport_session: { revoked_at: null, expires_at: { gt: now } },
        customer_account: {
          deleted_at: null,
          store_visits: { some: { retailer_id: group.retailer_id, is_muted: false } },
        },
      },
      select: { endpoint: true, p256dh: true, auth: true },
    });
    if (!subs.length) continue;
    if (!(await takeCapSlot(group.retailer_id))) {
      result.capped++;
      continue;
    }

    const count = group._count._all;
    const payload = JSON.stringify({
      title: retailer.shop_name,
      body: `${count} new item${count === 1 ? '' : 's'} added`,
      url: `/${retailer.public_slug}`,
      tag: `arrivals-${group.retailer_id}`,
    });

    const dead: string[] = [];
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 24 * 60 * 60, timeout: 10_000 },
        );
        result.sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410 = the browser dropped the subscription; anything else is transient.
        if (status === 404 || status === 410) dead.push(sub.endpoint);
      }
    }
    if (dead.length) {
      // Soft-disable (no DELETE grant for the app role, RC-049).
      await prisma.customerPushSubscription.updateMany({
        where: { endpoint: { in: dead }, disabled_at: null },
        data: { disabled_at: new Date() },
      });
      result.disabled += dead.length;
    }
    result.stores++;
  }
  return result;
}
