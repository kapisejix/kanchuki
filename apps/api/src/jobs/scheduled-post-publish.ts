// scheduled-post-publish.ts — F-043 Social Post Scheduler, Task 2: the publish
// tick + the daily token-health pass. Spec: docs/tasks/pending/post-scheduler.md
// §2 D1–D9, §4a (reason strings), §5.2.
//
// Tick (every 5 min): READY rows due now are claimed with a compare-and-swap
// (READY → PUBLISHING, RC-036 pattern — only the caller that flips the row
// publishes), published through the same Meta primitives + SocialPost row
// writers the Composer fan-out uses (idempotent on client_post_id), original
// photos only. Retries 3× with backoff, 2 h grace then MISSED.
//
// Failure text: ONLY a MetaApiError is mapped, and only to the curated §4a
// strings below — a raw Graph/DB message never reaches scheduled_posts.error.
import { prisma } from '@kanchuki/db';
import { hasFeature } from '../lib/features.js';
import {
  MetaApiError,
  publishFacebookCarousel,
  publishInstagramCarousel,
  publishPhotoPost,
} from '../lib/meta-graph.js';
import { checkQuota, incrementUsage } from '../lib/quota.js';
import { AppError } from '../plugins/error-handler.js';
import {
  accountToken,
  createPostedRowWithRetry,
} from '../routes/retailers/retailers-social/retailers-social-fanout-rows.js';
import { publishInstagramPhoto } from '../routes/retailers/retailers-social/retailers-social-helpers.js';

export const GRACE_MS = 2 * 60 * 60 * 1000;
export const MAX_ATTEMPTS = 3;
// wait before attempt N+1, indexed by attempts already made (1, 2)
export const BACKOFF_MS = [0, 5 * 60 * 1000, 15 * 60 * 1000];
const STALE_PUBLISHING_MS = 30 * 60 * 1000;
const BATCH = 20;

export const REASON = {
  TOKEN: 'Facebook connection expired. Reconnect to resume posting.',
  ACCESS: 'You no longer have access to this Page.',
  IG_UNLINKED: 'Instagram account is not linked to a Facebook Page.',
  RATE: 'Posting limit reached. Will retry automatically.',
  MEDIA: 'A photo was rejected. Replace it and retry.',
  PLAN: 'Scheduling is not available on your plan.',
  UNKNOWN: "Post failed. We'll retry. If it keeps failing, contact support.",
  INVALID: 'Post failed. If it keeps failing, contact support.',
  NO_PHOTOS: 'This post has no photos left. Edit it and retry.',
  MISSED: 'The posting window passed. Retry to post it now.',
} as const;

export interface Failure {
  reason: string;
  retry: boolean;
  /** pause_reason to put on the plan, or null to leave it running */
  pause: string | null;
}

const NAME = { FACEBOOK: 'Facebook', INSTAGRAM: 'Instagram' } as const;
type Platform = keyof typeof NAME;

/** Meta error → retailer-readable failure. Anything not a MetaApiError is UNKNOWN. */
export function classifyFailure(err: unknown, platform: Platform): Failure {
  const unknown: Failure = { reason: REASON.UNKNOWN, retry: true, pause: null };
  if (!(err instanceof MetaApiError)) return unknown;
  const { code, subcode } = err.fb ?? {};
  const tokenDead =
    code === 190 || code === 102 || [458, 459, 460, 463, 467].includes(subcode ?? 0);
  if (tokenDead) {
    return {
      reason: REASON.TOKEN,
      retry: false,
      pause: `Paused — ${NAME[platform]} token expired`,
    };
  }
  if (code === 10 || (code !== undefined && code >= 200 && code <= 299)) {
    return {
      reason: REASON.ACCESS,
      retry: false,
      pause: `Paused — no access to the ${NAME[platform]} Page`,
    };
  }
  if (err.code === 'ACCOUNT_NOT_FOUND') {
    return { reason: REASON.IG_UNLINKED, retry: false, pause: 'Paused — Instagram not linked' };
  }
  if (code !== undefined && [4, 17, 32, 613].includes(code)) {
    return { reason: REASON.RATE, retry: true, pause: null };
  }
  const s = subcode ?? 0;
  // Only a known media-specific signal says "photo rejected"; code 100 alone is
  // Graph's generic "invalid parameter" and can be anything.
  const media =
    code === 9004 ||
    (code !== undefined && code >= 36000 && code <= 36003) ||
    (s >= 2207000 && s < 2208000);
  if (media) return { reason: REASON.MEDIA, retry: false, pause: null };
  // A bad request will not fix itself — fail now with the generic text.
  if (code === 100) return { reason: REASON.INVALID, retry: false, pause: null };
  return unknown;
}

type Outcome = 'posted' | 'failed' | 'retry' | 'lost';

export async function handleSchedulePublishTick(now = new Date()) {
  const stats = { missed: 0, posted: 0, failed: 0, retry: 0, lost: 0 };

  // Past the grace window → MISSED (retailer can Retry from the status card).
  const missed = await prisma.scheduledPost.updateMany({
    where: { status: 'READY', scheduled_at: { lt: new Date(now.getTime() - GRACE_MS) } },
    data: { status: 'MISSED', error: REASON.MISSED },
  });
  stats.missed = missed.count;

  // A worker that died mid-publish leaves PUBLISHING forever. The SocialPost
  // lookup in publishOne makes re-queueing safe (no double post).
  await prisma.scheduledPost.updateMany({
    where: {
      status: 'PUBLISHING',
      last_attempt_at: { lt: new Date(now.getTime() - STALE_PUBLISHING_MS) },
    },
    data: { status: 'READY' },
  });

  const due = await prisma.scheduledPost.findMany({
    where: { status: 'READY', scheduled_at: { lte: now }, plan: { status: 'ACTIVE' } },
    orderBy: { scheduled_at: 'asc' },
    take: BATCH,
    select: { id: true, retailer_id: true, attempts: true, last_attempt_at: true },
  });

  for (const row of due) {
    const wait = BACKOFF_MS[Math.min(row.attempts, BACKOFF_MS.length - 1)] ?? 0;
    if (row.last_attempt_at && now.getTime() - row.last_attempt_at.getTime() < wait) continue;
    const outcome = await publishOne(row.id, row.retailer_id, now);
    stats[outcome === 'posted' ? 'posted' : outcome]++;
  }
  return stats;
}

async function publishOne(id: string, retailerId: string, now: Date): Promise<Outcome> {
  // CAS claim: exactly one caller flips READY → PUBLISHING and owns the publish.
  const claim = await prisma.scheduledPost.updateMany({
    where: { id, retailer_id: retailerId, status: 'READY' },
    data: { status: 'PUBLISHING', attempts: { increment: 1 }, last_attempt_at: now },
  });
  if (claim.count !== 1) return 'lost';

  const post = await prisma.scheduledPost.findFirstOrThrow({
    where: { id, retailer_id: retailerId },
    include: { plan: { include: { account: true } }, items: { orderBy: { position: 'asc' } } },
  });
  const { plan } = post;
  const account = plan.account;
  const platform = plan.platform as Platform;

  const fail = async (f: Failure, refund = false): Promise<Outcome> => {
    const retry = f.retry && post.attempts < MAX_ATTEMPTS;
    await prisma.scheduledPost.updateMany({
      where: { id, retailer_id: retailerId, status: 'PUBLISHING' },
      data: {
        status: retry ? 'READY' : 'FAILED',
        error: f.reason,
        ...(refund ? { attempts: { decrement: 1 } } : {}),
      },
    });
    if (f.pause) {
      await prisma.postSchedulePlan.updateMany({
        where: { id: plan.id, retailer_id: retailerId, status: 'ACTIVE' },
        data: { status: 'PAUSED', pause_reason: f.pause },
      });
    }
    return retry ? 'retry' : 'failed';
  };

  try {
    // Re-checked at publish time so a downgrade / switch-off stops the queue.
    const retailer = await prisma.retailer.findUniqueOrThrow({
      where: { id: retailerId },
      select: { plan_status: true, is_suspended: true },
    });
    const planOk =
      !retailer.is_suspended &&
      (retailer.plan_status === 'ACTIVE' || retailer.plan_status === 'TRIAL');
    if (!planOk || !(await hasFeature(retailerId, 'SOCIAL_SCHEDULER'))) {
      return await fail({ reason: REASON.PLAN, retry: false, pause: null });
    }
    try {
      await checkQuota(retailerId, 'SCHEDULED_POST');
    } catch (err) {
      if (err instanceof AppError) {
        return await fail({ reason: REASON.PLAN, retry: false, pause: null });
      }
      throw err;
    }

    if (!account.is_active) {
      // Connection is gone — nothing was attempted, so don't burn an attempt.
      return await fail(
        { reason: REASON.TOKEN, retry: false, pause: `Paused — ${NAME[platform]} token expired` },
        true,
      );
    }

    const productIds = post.items.map((i) => i.product_id);
    const photos = await prisma.productPhoto.findMany({
      where: { retailer_id: retailerId, product_id: { in: productIds } },
      select: { id: true, product_id: true, url: true, is_primary: true },
    });
    const media: Array<{ product_id: string; photo_id: string; kind: 'photo'; url: string }> = [];
    for (const item of post.items) {
      const own = photos.filter((p) => p.product_id === item.product_id);
      const photo =
        own.find((p) => p.id === item.photo_id) ?? own.find((p) => p.is_primary) ?? own[0];
      if (photo) {
        media.push({
          product_id: item.product_id,
          photo_id: photo.id,
          kind: 'photo',
          url: photo.url,
        });
      }
    }
    if (media.length === 0) {
      return await fail({ reason: REASON.NO_PHOTOS, retry: false, pause: null });
    }

    // Idempotency backstop: a previous attempt may have gone live and died
    // before the row/link write — adopt that row, never publish twice.
    let live: { id: string } | null = await prisma.socialPost.findFirst({
      where: {
        retailer_id: retailerId,
        social_account_id: account.id,
        client_post_id: post.client_post_id,
        status: 'POSTED',
      },
      select: { id: true },
    });

    if (!live) {
      const token = accountToken(account.access_token_encrypted);
      const urls = media.map((m) => m.url);
      const first = urls[0] as string;
      const single = urls.length === 1;
      let externalId: string;
      let externalUrl: string | null;
      if (platform === 'INSTAGRAM') {
        const r = single
          ? await publishInstagramPhoto(account.platform_account_id, token, first, post.caption)
          : await publishInstagramCarousel(account.platform_account_id, token, urls, post.caption);
        externalId = r.postId;
        externalUrl = r.permalink || null;
      } else {
        const r = single
          ? await publishPhotoPost(account.platform_account_id, token, first, post.caption)
          : await publishFacebookCarousel(account.platform_account_id, token, urls, post.caption);
        externalId = r.postId;
        externalUrl = `https://www.facebook.com/${account.platform_account_id}/posts/${r.postId}`;
      }

      // The post IS live from here. A row-write failure must never become a
      // retry (that would double-post) — mark POSTED regardless.
      try {
        const { post: row } = await createPostedRowWithRetry({
          retailer_id: retailerId,
          social_account_id: account.id,
          platform: account.platform,
          post_type: single ? 'SINGLE_PRODUCT' : 'CAROUSEL',
          product_ids: [...new Set(productIds)],
          caption: post.caption,
          media: media as unknown as object[],
          link_url: null,
          link_type: 'none',
          client_post_id: post.client_post_id,
          status: 'POSTED',
          external_post_id: externalId,
          external_post_url: externalUrl,
          error_message: null,
        });
        live = { id: row.id };
      } catch (err) {
        console.error('[schedule-publish] post is live but row write failed', id, err);
      }
    }

    await prisma.scheduledPost.updateMany({
      where: { id, retailer_id: retailerId, status: 'PUBLISHING' },
      data: { status: 'POSTED', social_post_id: live?.id ?? null, error: null },
    });
    // Counted on success only (D9). Never fails a live post.
    try {
      await incrementUsage(retailerId, 'SCHEDULED_POST');
    } catch (err) {
      console.error('[schedule-publish] usage increment failed', id, err);
    }
    return 'posted';
  } catch (err) {
    // Raw message only ever goes to the server log (finding 4).
    console.error(
      '[schedule-publish] attempt failed',
      id,
      err instanceof Error ? err.message : err,
    );
    return fail(classifyFailure(err, platform));
  }
}

/** Daily: an ACTIVE plan whose connection is dead (account deactivated or
 * token past expiry) is paused up front instead of failing at its next slot. */
export async function handleScheduleTokenHealth(now = new Date()) {
  let paused = 0;
  for (const platform of ['FACEBOOK', 'INSTAGRAM'] as const) {
    const res = await prisma.postSchedulePlan.updateMany({
      where: {
        status: 'ACTIVE',
        platform,
        OR: [{ account: { is_active: false } }, { account: { token_expires_at: { lte: now } } }],
      },
      data: { status: 'PAUSED', pause_reason: `Paused — ${NAME[platform]} token expired` },
    });
    paused += res.count;
  }
  return { paused };
}
