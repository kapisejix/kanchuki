import { prisma } from '@kanchuki/db';
import { PLAN_LIMITS, orUnlimited } from '@kanchuki/shared';
import * as Sentry from '@sentry/node';
// billing-webhook.ts — Razorpay webhook → subscription/payment + GST invoice (split from apps/api/src/routes/billing.ts — body byte-identical)
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { addGenerateGstInvoiceJob } from '../../jobs/generate-gst-invoice.js';
import { allocateInvoiceNumber } from '../../lib/gst-invoice-number.js';
import { computeSubscriptionGst } from '../../lib/gst.js';
import {
  RAZORPAY_EVENT_TTL_SEC,
  claimRazorpayEvent,
  releaseRazorpayEvent,
} from '../../lib/razorpay-event-dedupe.js';
import { completeAddonPurchase } from './billing-addons.js';
import {
  type Plan,
  type RazorpaySubscription,
  periodEnd,
  resolveStateCode,
  verifyWebhookSignature,
} from './billing-helpers.js';

export const billingWebhookRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /billing/webhook (Razorpay → server, no JWT) ──────────
  // A 5xx (thrown handler, failed add-on credit) releases the event id so Razorpay's
  // retry is processed instead of answered as a duplicate.
  const releaseOnFailure = {
    onResponse: async (request: FastifyRequest, reply: FastifyReply) => {
      const eventId = request.headers['x-razorpay-event-id'];
      if (reply.statusCode >= 500 && typeof eventId === 'string') {
        await releaseRazorpayEvent(eventId);
      }
    },
  };
  server.post('/webhook', releaseOnFailure, async (request, reply) => {
    const signature = request.headers['x-razorpay-signature'] as string | undefined;
    if (
      !signature ||
      !request.rawBody ||
      !(await verifyWebhookSignature(request.rawBody, signature))
    ) {
      return reply.status(401).send({ error: { code: 'INVALID_SIGNATURE', status: 401 } });
    }

    const event = request.body as {
      event: string;
      created_at?: number;
      payload: {
        subscription?: { entity: RazorpaySubscription & { plan_id: string } };
        payment_link?: { entity: { id: string; status?: string } };
        payment?: {
          entity: {
            id: string;
            order_id?: string;
            amount: number;
            status: string;
            currency?: string;
          };
        };
        refund?: {
          entity: { id: string; payment_id: string; amount: number; status?: string };
        };
      };
    };

    // Replay protection (signature alone doesn't stop a captured request being resent,
    // e.g. to resurrect a cancelled plan). Bug hunt #7: the old 300 s age window also
    // rejected Razorpay's own retries, which keep the original created_at for up to 24 h,
    // so a 6-minute outage lost subscription.charged / refund.processed for good. Now:
    // dedupe on the event id (same on every retry) + a 48 h outer age bound.
    if (
      typeof event.created_at !== 'number' ||
      Math.abs(Date.now() / 1000 - event.created_at) > RAZORPAY_EVENT_TTL_SEC
    ) {
      return reply.status(401).send({ error: { code: 'STALE_EVENT', status: 401 } });
    }
    const eventId = request.headers['x-razorpay-event-id'];
    if (typeof eventId === 'string' && !(await claimRazorpayEvent(eventId))) {
      request.log.info({ event_id: eventId, event: event.event }, 'razorpay event replay ignored');
      return reply.send({ received: true, duplicate: true });
    }

    // ─── Add-on packs (bug hunt #6) ─────────────────────────────
    // The browser callback alone credited add-ons, so closing the tab before the
    // redirect left a paid purchase PENDING forever. Same verify + CAS credit as the
    // callback; whichever arrives second gets 'already'. Above the subscription lookup
    // for the same reason as refunds: this payload has no subscription entity.
    if (event.event === 'payment_link.paid') {
      const linkId = event.payload?.payment_link?.entity?.id;
      const payment = event.payload?.payment?.entity;
      if (!linkId || !payment) {
        request.log.warn({ event: event.event }, 'payment_link.paid without link/payment entity');
        return reply.send({ received: true });
      }
      const purchase = await prisma.quotaAddonPurchase.findFirst({
        where: { razorpay_order_id: linkId, status: 'PENDING' },
      });
      if (!purchase) {
        // Already completed by the callback, or not an add-on link.
        return reply.send({ received: true });
      }
      const outcome = await completeAddonPurchase(purchase, payment.id, payment, request.log);
      // 'error' = credit txn failed, purchase still PENDING: 500 so Razorpay retries.
      if (outcome === 'error') {
        return reply.status(500).send({ error: { code: 'ADDON_CREDIT_FAILED', status: 500 } });
      }
      return reply.send({ received: true });
    }

    // ─── Refunds (§5A.1) ────────────────────────────────────────
    // `refund.processed` only: `refund.created` and `refund.failed` do not mean
    // money moved back, and the ledger must not record a reversal that never
    // happened. `refund.speed_changed` is webhook noise.
    // Handled HERE, above the subscription lookup and its `if (!rzpSub)` early
    // return, and that placement is the whole point: a refund event carries
    // `payload.refund` plus the payment it reverses and need not carry
    // `payload.subscription` at all. Left in the switch below it would have
    // been dropped by that early return — silently, as an HTTP 200, which is
    // the shape that makes a missing handler look like a working one.
    if (event.event === 'refund.processed') {
      const refund = event.payload?.refund?.entity;
      const paymentId = refund?.payment_id;
      if (!refund || !paymentId) {
        request.log.warn({ event: event.event }, 'refund.processed without a refund entity');
        return reply.send({ received: true });
      }

      // Razorpay amounts are paise, the same unit the row stores in
      // `amount_inr` (misleading name — see the column comment; T5/T6 read it
      // as paise too).
      const row = await prisma.subscriptionPayment.findUnique({
        where: { razorpay_payment_id: paymentId },
        select: { id: true, amount_inr: true, status: true },
      });

      if (!row) {
        // A refund against a charge this server never recorded — an add-on
        // payment, or a subscription.charged we missed. Nothing to reverse,
        // and said out loud rather than swallowed: this is exactly the case
        // that surfaces later as "the ledger disagrees with the dashboard".
        request.log.warn(
          { razorpay_payment_id: paymentId, refund_id: refund.id },
          'refund.processed for an unknown payment row',
        );
        return reply.send({ received: true });
      }

      // PARTIAL refunds are logged, never applied — and this is a decision, not
      // an omission. The row has one whole-month flag and no column that could
      // hold a refunded amount, and T5/T6 both read that flag as "this month
      // was paid for": flipping it on a ₹1 refund would erase a month the
      // retailer mostly paid for, while leaving it on a full reversal would
      // keep earning commission on money that was handed back. Only full
      // coverage flips it. **Decided 2026-09-24 (owner):** partial refunds are
      // not applied, on the basis that a plan charge is refunded in full or not
      // at all in practice — so this is a settled rule, not a placeholder. If
      // partials ever do appear, the answer is a `refunded_amount` column
      // (migration 117 — 116 is RC-033) and a pro-rata rule, not a quiet flip of
      // this flag.
      if (refund.amount < row.amount_inr) {
        request.log.warn(
          {
            razorpay_payment_id: paymentId,
            refund_id: refund.id,
            refund_amount: refund.amount,
            payment_amount: row.amount_inr,
          },
          'partial refund ignored — the payment row records whole months only',
        );
        return reply.send({ received: true });
      }

      // Idempotent: Razorpay redelivers (at-least-once), and `status` is a
      // scalar with no second state to move to — so the guard is the WHERE.
      // A replay matches 0 rows instead of rewriting the same value.
      const applied = await prisma.subscriptionPayment.updateMany({
        where: { razorpay_payment_id: paymentId, status: { not: 'refunded' } },
        data: { status: 'refunded' },
      });
      request.log.info(
        {
          razorpay_payment_id: paymentId,
          refund_id: refund.id,
          previously: row.status,
          applied: applied.count,
        },
        applied.count === 1 ? 'refund applied' : 'refund replayed — already recorded',
      );
      return reply.send({ received: true });
    }

    const rzpSub = event.payload?.subscription?.entity;
    if (!rzpSub) return reply.send({ received: true });

    const subscription = await prisma.subscription.findUnique({
      where: { razorpay_subscription_id: rzpSub.id },
    });
    if (!subscription) {
      request.log.warn({ rzp_subscription: rzpSub.id }, 'webhook for unknown subscription');
      return reply.send({ received: true });
    }

    const retailerId = subscription.retailer_id;
    const plan = subscription.plan as Plan;
    const limits = PLAN_LIMITS[plan];

    switch (event.event) {
      case 'subscription.activated':
      case 'subscription.charged': {
        const start = rzpSub.current_start ? new Date(rzpSub.current_start * 1000) : new Date();
        const end = rzpSub.current_end ? new Date(rzpSub.current_end * 1000) : periodEnd(start);

        // A payment row + GST invoice is created ONLY for subscription.charged
        // that carries a payment entity. subscription.activated (sent
        // separately by Razorpay) just flips status — it must never allocate
        // an invoice number.
        const payment =
          event.event === 'subscription.charged' ? (event.payload.payment?.entity ?? null) : null;

        // Never grant access on a payment that is not exactly the plan's charge:
        // captured, in INR, and equal to base + 18% GST (the stored
        // `subscription.amount_inr` is the base; the Razorpay plan is created at
        // the same gross by admin-plans.ts). Anything else would also produce a
        // wrong GST invoice, which splits the base and GST out of this amount.
        // Refused payments get HTTP 200 so Razorpay does not retry a decision
        // already made.
        const expectedGross = computeSubscriptionGst({ basePaise: subscription.amount_inr }).gross;
        if (
          payment &&
          (payment.status !== 'captured' ||
            (payment.currency !== undefined && payment.currency !== 'INR') ||
            payment.amount !== expectedGross)
        ) {
          const details = {
            razorpay_payment_id: payment.id,
            subscription_id: subscription.id,
            status: payment.status,
            currency: payment.currency,
            amount: payment.amount,
            expected: expectedGross,
          };
          request.log.error(
            details,
            'subscription.charged payment failed verification — not activating',
          );
          // Captured = the retailer has paid and is not activated. A log line nobody
          // reads is how RC-071 lost paid purchases, so this one alerts.
          if (payment.status === 'captured') {
            Sentry.captureMessage(
              'Captured subscription payment refused: amount/currency mismatch',
              {
                level: 'error',
                tags: { area: 'billing-webhook' },
                extra: details,
              },
            );
          }
          return reply.send({ received: true });
        }

        // Look up retailer state + platform GST profile for the invoice split.
        const [retailer, gstProfile] = await Promise.all([
          prisma.retailer.findUnique({ where: { id: retailerId }, select: { state: true } }),
          prisma.platformGstProfile.findUnique({ where: { id: 'singleton' } }),
        ]);
        const buyerStateCode = retailer?.state ? resolveStateCode(retailer.state) : null;
        const gst = computeSubscriptionGst({
          basePaise: subscription.amount_inr,
          buyerStateCode,
          sellerStateCode: gstProfile?.state_code ?? null,
        });
        // GST invoice format wants the coded place of supply ("27-Maharashtra");
        // fall back to the raw state name, then null.
        const placeOfSupply = buyerStateCode
          ? `${buyerStateCode}-${retailer?.state}`
          : (retailer?.state ?? null);

        // One transaction: status updates + (for a charge) idempotent payment
        // insert with the invoice number allocated INSIDE the same txn, so a
        // rollback never burns a number.
        const newPaymentId = await prisma.$transaction(async (tx) => {
          await tx.subscription.update({
            where: { id: subscription.id },
            data: { status: 'ACTIVE', current_period_start: start, current_period_end: end },
          });
          await tx.retailer.update({
            where: { id: retailerId },
            data: {
              plan,
              plan_status: 'ACTIVE',
              plan_expires_at: end,
              max_products: orUnlimited(limits.max_products),
              max_customers: orUnlimited(limits.max_customers),
            },
          });

          if (!payment) return null;

          // Idempotent on razorpay_payment_id — Razorpay redelivers
          // subscription.charged (at-least-once). A duplicate must not throw
          // and must not allocate a second invoice number.
          const existing = await tx.subscriptionPayment.findUnique({
            where: { razorpay_payment_id: payment.id },
            select: { id: true },
          });
          if (existing) return null;

          const invoiceNo = await allocateInvoiceNumber(
            gstProfile?.invoice_prefix ?? 'KAN',
            new Date(),
            tx,
          );

          const created = await tx.subscriptionPayment.create({
            data: {
              subscription_id: subscription.id,
              retailer_id: retailerId,
              amount_inr: payment.amount,
              status: 'success',
              razorpay_payment_id: payment.id,
              razorpay_order_id: payment.order_id,
              paid_at: new Date(),
              // GST columns — computed above with real state codes
              amount_excluding_gst: gst.basePaise,
              gst_amount: gst.gstTotal,
              gst_rate: gst.rate,
              cgst_amount: gst.cgst || null,
              sgst_amount: gst.sgst || null,
              igst_amount: gst.igst || null,
              sac_code: gst.sac,
              place_of_supply: placeOfSupply,
              gst_invoice_number: invoiceNo,
            },
            select: { id: true },
          });
          return created.id;
        });

        // Enqueue GST invoice PDF generation (async — never block the webhook).
        if (newPaymentId) {
          addGenerateGstInvoiceJob({ payment_id: newPaymentId }).catch((err) => {
            console.error('[billing] Failed to enqueue GST invoice job:', err);
          });
        }
        break;
      }

      case 'subscription.halted':
      case 'subscription.pending': {
        await prisma.$transaction([
          prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: 'PAST_DUE' },
          }),
          prisma.retailer.update({
            where: { id: retailerId },
            data: { plan_status: 'PAST_DUE' },
          }),
        ]);
        break;
      }

      // RC-033: a term that finished and one that was cancelled are different
      // events (a completed subscription means Razorpay exhausted its cycles —
      // the retailer paid and stopped, which is not churn). They shared one
      // block until now, and T5 keys an irreversible referral clawback off the
      // result. Both still move BOTH columns: `plan_status` is what the
      // retailer and admin surfaces read, so leaving it CANCELLED here would
      // only relocate the collapse.
      case 'subscription.cancelled': {
        await prisma.$transaction([
          prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: 'CANCELLED', cancelled_at: new Date() },
          }),
          prisma.retailer.update({
            where: { id: retailerId },
            data: { plan_status: 'CANCELLED', razorpay_subscription_id: null },
          }),
        ]);
        break;
      }

      case 'subscription.completed': {
        await prisma.$transaction([
          prisma.subscription.update({
            where: { id: subscription.id },
            // `cancelled_at` stays null: nothing was cancelled, and stamping
            // it here would make the two states indistinguishable again in
            // the one field a reader might reach for.
            data: { status: 'COMPLETED' },
          }),
          prisma.retailer.update({
            where: { id: retailerId },
            data: { plan_status: 'COMPLETED', razorpay_subscription_id: null },
          }),
        ]);
        break;
      }

      default:
        request.log.info({ event: event.event }, 'unhandled razorpay event');
    }

    return reply.send({ received: true });
  });
};
