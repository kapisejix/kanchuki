import { prisma } from '@kanchuki/db';
// billing-subscription.ts — retailer subscription lifecycle + invoice history (split from apps/api/src/routes/billing.ts — body byte-identical)
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';
import {
  type Plan,
  type RazorpaySubscription,
  getPlanPricing,
  razorpay,
  razorpayPlanId,
} from './billing-helpers.js';

const CreateSubscriptionSchema = z.object({
  plan: z.enum(['STARTER', 'GROWTH', 'PRO']),
});

export const billingSubscriptionRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /billing/subscription ──────────────────────────────────
  server.get('/subscription', async (request) => {
    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: {
        plan: true,
        plan_status: true,
        trial_ends_at: true,
        plan_expires_at: true,
      },
    });
    if (!retailer) throw notFound('Retailer');

    const subscription = await prisma.subscription.findFirst({
      where: { retailer_id: request.retailerId },
      orderBy: { created_at: 'desc' },
    });

    return { data: { ...retailer, subscription } };
  });
  // ─── POST /billing/subscription ─────────────────────────────────
  server.post('/subscription', async (request, reply) => {
    const body = CreateSubscriptionSchema.safeParse(request.body);
    if (!body.success) {
      throw validationError(body.error.issues[0]?.message ?? 'Validation failed');
    }
    const { plan } = body.data;

    const planId = await razorpayPlanId(plan);
    if (!planId) {
      throw validationError(`Razorpay plan not configured for ${plan}`);
    }

    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: { trial_ends_at: true },
    });
    if (!retailer) throw notFound('Retailer');

    // A Subscription row stays 'TRIAL' until Razorpay's first charge — that
    // status alone isn't proof there's no live subscription yet. Gating only
    // on plan_status === 'ACTIVE' let a retailer tap a second/third plan
    // while still in trial and create another real Razorpay subscription
    // each time, with nothing cancelling the earlier one — GET /subscription
    // then returns whichever row was created last, so the "selected" plan
    // flips unpredictably. Block on ANY non-cancelled row instead.
    const existingSubscription = await prisma.subscription.findFirst({
      where: { retailer_id: request.retailerId, status: { in: ['TRIAL', 'ACTIVE'] } },
    });
    if (existingSubscription) {
      throw validationError('You already have a subscription in progress. Cancel it before changing plans.');
    }

    // Model A (switch takes effect next cycle, no proration — see
    // docs/PRO-REQUIREMENTS.md §6 Billing Rules): a plan SWITCH cancels the
    // old Razorpay subscription first (POST /billing/cancel), which defers
    // to Razorpay's own period end rather than cancelling immediately. If
    // the new subscription were then started ~now (the old trial-only
    // floor), it would overlap and double-charge the retailer during the
    // old plan's remaining paid period. Floor the new start_at at the most
    // recent subscription's current_period_end too, so the new plan begins
    // exactly when the old one's paid period actually ends. A first-ever
    // subscribe has no prior row, so this floor is 0 and behaves as before.
    const priorSubscription = await prisma.subscription.findFirst({
      where: { retailer_id: request.retailerId },
      orderBy: { created_at: 'desc' },
      select: { current_period_end: true },
    });
    const priorPeriodEnd = priorSubscription?.current_period_end?.getTime() ?? 0;

    // First charge lands when the 14-day trial runs out (or now if already over)
    const trialEnd = retailer.trial_ends_at?.getTime() ?? 0;
    const startAt = Math.max(trialEnd, priorPeriodEnd, Date.now() + 5 * 60 * 1000); // Razorpay needs a future ts

    const rzpSub = await razorpay<RazorpaySubscription>('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        plan_id: planId,
        total_count: 120, // monthly only, 10 years
        customer_notify: 1,
        start_at: Math.floor(startAt / 1000),
        notes: { retailer_id: request.retailerId, plan },
      }),
    });

    const now = new Date();
    const pricing = await getPlanPricing(plan);
    await prisma.$transaction([
      prisma.subscription.create({
        data: {
          retailer_id: request.retailerId,
          plan,
          status: 'TRIAL',
          billing_period: 'monthly',
          amount_inr: pricing.monthly,
          razorpay_subscription_id: rzpSub.id,
          razorpay_plan_id: planId,
          current_period_start: now,
          current_period_end: new Date(startAt),
        },
      }),
      prisma.retailer.update({
        where: { id: request.retailerId },
        data: { razorpay_subscription_id: rzpSub.id },
      }),
    ]);

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'create',
        resource_type: 'Subscription',
        resource_id: rzpSub.id,
        metadata: { plan, billing_period: 'monthly' },
        ip_address: request.ip,
      },
    });

    return reply.status(201).send({
      data: { razorpay_subscription_id: rzpSub.id, checkout_url: rzpSub.short_url },
    });
  });
  // ─── POST /billing/cancel ──────────────────────────────────────
  // Cancel the active subscription. Cancels in Razorpay and marks DB.
  server.post('/cancel', async (request) => {
    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: { razorpay_subscription_id: true, plan_status: true },
    });
    if (!retailer) throw notFound('Retailer');
    if (!retailer.razorpay_subscription_id || retailer.plan_status === 'CANCELLED') {
      throw validationError('No active subscription to cancel');
    }

    try {
      // Cancel at Razorpay — subscriptions can't be cancelled immediately;
      // Razorpay cancels at period end unless ?cancel_at_cycle_end=0 is passed.
      await razorpay(`/subscriptions/${retailer.razorpay_subscription_id}/cancel`, {
        method: 'POST',
      });
    } catch (err) {
      request.log.warn(
        { rzp_subscription: retailer.razorpay_subscription_id, err },
        'Razorpay cancel failed — proceeding with local cancel',
      );
    }

    await prisma.$transaction([
      prisma.subscription.updateMany({
        where: { retailer_id: request.retailerId, status: { not: 'CANCELLED' } },
        data: { status: 'CANCELLED', cancelled_at: new Date() },
      }),
      prisma.retailer.update({
        where: { id: request.retailerId },
        data: {
          plan_status: 'CANCELLED',
          razorpay_subscription_id: null,
          // Keep existing plan limits until period end — retailer still has access
        },
      }),
    ]);

    request.log.info({ retailer_id: request.retailerId }, 'Subscription cancelled');

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'delete',
        resource_type: 'Subscription',
        resource_id: request.retailerId,
        metadata: { cancelled: true },
        ip_address: request.ip,
      },
    });

    return { data: { plan_status: 'CANCELLED', cancelled_at: new Date().toISOString() } };
  });
  // ─── GET /billing/invoices ──────────────────────────────────────
  server.get('/invoices', async (request) => {
    const payments = await prisma.subscriptionPayment.findMany({
      where: { retailer_id: request.retailerId },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return { data: payments };
  });
};
