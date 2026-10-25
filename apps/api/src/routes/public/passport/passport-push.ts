// passport-push.ts — F-036 Phase B: browser Web Push subscribe / unsubscribe.
//
// A subscription is only ever stored for a verified passport session (spec §5).
// Which stores may notify it is decided at send time (jobs/customer-push.ts) from
// CustomerStoreVisit, so there is no per-store row to keep in step here.
// Every change writes a ConsentEvent (DPDP audit, same log as store mute).
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getVapidPublicKey, isAllowedPushEndpoint } from '../../../jobs/customer-push.js';
import { CURRENT_NOTICE_VERSION, getPassportSession } from './passport-helpers.js';

const SubscribeSchema = z.object({
  endpoint: z.string().max(1024).refine(isAllowedPushEndpoint, 'Unsupported push service'),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(64),
  }),
});

const UnsubscribeSchema = z.object({ endpoint: z.string().min(1).max(1024) });

const LIMIT = { config: { rateLimit: { max: 10, timeWindow: 60 * 1000 } } };

export const passportPushRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /passport/push/key ────────────────────────────────────
  // VAPID public key. 404 when push is not configured, so the UI hides the offer.
  server.get('/push/key', async (_request, reply) => {
    const key = getVapidPublicKey();
    if (!key) {
      return reply
        .status(404)
        .send({ error: { code: 'PUSH_DISABLED', message: 'Push is not configured' } });
    }
    return reply.status(200).send({ public_key: key });
  });

  // ─── POST /passport/push/subscribe ─────────────────────────────
  server.post('/push/subscribe', LIMIT, async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply
        .status(401)
        .send({ error: { code: 'NO_SESSION', message: 'Not authenticated' } });
    }
    if (!getVapidPublicKey()) {
      return reply
        .status(404)
        .send({ error: { code: 'PUSH_DISABLED', message: 'Push is not configured' } });
    }
    const body = SubscribeSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send({ error: { code: 'INVALID_BODY', message: 'Invalid push subscription' } });
    }

    const { endpoint, keys } = body.data;
    const accountId = session.customer_account_id;
    // Same browser, new sign-in: the endpoint moves to the account signed in now —
    // but only with that browser's own keys. A caller who merely knows another
    // account's endpoint cannot rebind it (and so cannot blind its pushes).
    const existing = await prisma.customerPushSubscription.findUnique({
      where: { endpoint },
      select: { customer_account_id: true, p256dh: true, auth: true },
    });
    if (
      existing &&
      existing.customer_account_id !== accountId &&
      (existing.p256dh !== keys.p256dh || existing.auth !== keys.auth)
    ) {
      return reply.status(409).send({
        error: { code: 'ENDPOINT_TAKEN', message: 'Subscription belongs to another device' },
      });
    }
    await prisma.customerPushSubscription.upsert({
      where: { endpoint },
      create: {
        customer_account_id: accountId,
        passport_session_id: session.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      update: {
        customer_account_id: accountId,
        passport_session_id: session.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        last_seen_at: new Date(),
        disabled_at: null,
      },
    });
    await prisma.consentEvent.create({
      data: {
        customer_account_id: accountId,
        kind: 'PUSH_SUBSCRIBED',
        notice_version: CURRENT_NOTICE_VERSION,
      },
    });
    return reply.status(200).send({ ok: true });
  });

  // ─── POST /passport/push/unsubscribe ───────────────────────────
  // Scoped to the signed-in account: one shopper cannot switch off another's device.
  server.post('/push/unsubscribe', LIMIT, async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply
        .status(401)
        .send({ error: { code: 'NO_SESSION', message: 'Not authenticated' } });
    }
    const body = UnsubscribeSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send({ error: { code: 'INVALID_BODY', message: 'Invalid push subscription' } });
    }

    const accountId = session.customer_account_id;
    const { count } = await prisma.customerPushSubscription.updateMany({
      where: { endpoint: body.data.endpoint, customer_account_id: accountId, disabled_at: null },
      data: { disabled_at: new Date() },
    });
    if (count > 0) {
      await prisma.consentEvent.create({
        data: {
          customer_account_id: accountId,
          kind: 'PUSH_UNSUBSCRIBED',
          notice_version: CURRENT_NOTICE_VERSION,
        },
      });
    }
    return reply.status(200).send({ ok: true });
  });
};
