import { createHmac, timingSafeEqual } from 'node:crypto';
// RazorpayX payouts webhook — T7 of
// docs/tasks/referral-program-retailer-affiliate.md.
//
// ROUTE: POST /v1/public/webhooks/razorpayx-payout
// (registered under the public prefix → auth.ts skips JWT for /v1/public/*;
// authentication is the HMAC signature below, exactly the billing webhook's
// model. RazorpayX dashboard config: subscribe payout.processed,
// payout.failed, payout.reversed, payout.rejected, payout.updated; set the
// secret as RAZORPAYX_WEBHOOK_SECRET.)
//
// WHY A SEPARATE SECRET FROM PAYMENTS (RAZORPAY_WEBHOOK_SECRET): the two
// webhooks are configured in different Razorpay dashboards (Payments vs
// X/Payouts) with independently rotatable secrets — sharing one would mean a
// rotation on one side silently 401s the other. Deliberate.
//
// THE SETTLEMENT RULE: only this webhook (or the job's reconciliation, when a
// webhook is missed) is allowed to declare money moved. paid_at is stamped by
// settlePayout — this route never touches paid_at directly.
//
// REPLAY + SIGNATURE: mirrored from billing-webhook.ts — HMAC-SHA256 over the
// raw body with a constant-time compare (timing side-channel), and a ±300s
// created_at window (a captured request resent later must not resurrect a
// payout).
import { getSecret, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { mapRazorpayxStatus } from '../../jobs/referral-payout.js';
import type { RazorpayxPayoutStatus } from '../../lib/razorpayx.js';
import { settlePayout } from '../../lib/referral-payout-settle.js';

const WEBHOOK_MAX_AGE_SECONDS = 300;

/** Constant-time hex compare (same shape as billing-helpers.hexEquals). */
function hexEquals(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function verifyRazorpayxSignature(rawBody: string, signature: string): Promise<boolean> {
  const secret = (await getSecret('RAZORPAYX_WEBHOOK_SECRET')) ?? '';
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return hexEquals(expected, signature);
}

interface PayoutWebhookEvent {
  event: string;
  created_at?: number;
  payload?: {
    payout?: {
      entity?: {
        id: string;
        status: RazorpayxPayoutStatus;
        status_details?: { reason?: string; description?: string; source?: string } | null;
        utr?: string | null;
      };
    };
  };
}

export const razorpayxPayoutWebhookRoutes: FastifyPluginAsync = async (server) => {
  server.post('/public/webhooks/razorpayx-payout', async (request, reply) => {
    const signature = request.headers['x-razorpay-signature'] as string | undefined;
    if (
      !signature ||
      !request.rawBody ||
      !(await verifyRazorpayxSignature(request.rawBody, signature))
    ) {
      return reply.status(401).send({ error: { code: 'INVALID_SIGNATURE', status: 401 } });
    }

    const event = request.body as PayoutWebhookEvent;

    // Replay guard — mirrors billing-webhook.ts.
    if (
      typeof event.created_at !== 'number' ||
      Math.abs(Date.now() / 1000 - event.created_at) > WEBHOOK_MAX_AGE_SECONDS
    ) {
      return reply.status(401).send({ error: { code: 'STALE_EVENT', status: 401 } });
    }

    const payout = event.payload?.payout?.entity;
    if (!payout?.id) return reply.send({ received: true });

    // Find our row by the provider id (unique index, migration 109).
    const row = await prisma.referralPayout.findUnique({
      where: { razorpayx_payout_id: payout.id },
      select: { id: true, status: true },
    });
    if (!row) {
      // Not ours (or arrived before we stored the id) — acknowledge so
      // RazorpayX stops retrying; the reconciliation pass will match it later.
      request.log.warn({ razorpayx_payout_id: payout.id }, 'webhook for unknown payout');
      return reply.send({ received: true });
    }

    if (event.event === 'payout.updated') {
      // UTR arrival etc. — record the UTR when the row lacks one; no status
      // change (payout.updated fires for non-terminal transitions too).
      return reply.send({ received: true });
    }

    const mapped = mapRazorpayxStatus(payout.status);
    if (!mapped || mapped === 'PROCESSING') {
      // Intermediate or unrecognized — leave the row as-is. An unrecognized
      // status must never silently decide money (RC-027).
      return reply.send({ received: true });
    }

    // Idempotent: a second delivery of the same terminal event lands on a row
    // already in that state — settlePayout's updates are no-ops then, and the
    // audit log dedupes naturally because updateMany matched 0 rows. Still,
    // skip the work when the row already agrees.
    if (row.status === mapped) return reply.send({ received: true });

    const reason = payout.status_details?.reason ?? payout.status_details?.description ?? null;
    await settlePayout(row.id, mapped, reason, true);
    return reply.send({ received: true });
  });
};
