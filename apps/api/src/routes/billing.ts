import { createHmac, timingSafeEqual } from 'node:crypto';
import { type QuotaResourceType, getSecret, prisma } from '@kanchuki/db';
import { ADDON_PRICING, PLAN_LIMITS, PLAN_PRICING } from '@kanchuki/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../plugins/error-handler.js';

type Plan = 'STARTER' | 'GROWTH' | 'PRO';
type Period = 'monthly' | 'annual';

// Razorpay plan ids are created once in the Razorpay dashboard and mapped here
const RAZORPAY_PLAN_IDS: Record<Plan, Record<Period, string | undefined>> = {
  STARTER: {
    monthly: process.env.RAZORPAY_PLAN_STARTER_MONTHLY,
    annual: process.env.RAZORPAY_PLAN_STARTER_ANNUAL,
  },
  GROWTH: {
    monthly: process.env.RAZORPAY_PLAN_GROWTH_MONTHLY,
    annual: process.env.RAZORPAY_PLAN_GROWTH_ANNUAL,
  },
  PRO: {
    monthly: process.env.RAZORPAY_PLAN_PRO_MONTHLY,
    annual: process.env.RAZORPAY_PLAN_PRO_ANNUAL,
  },
};

// ponytail: raw fetch instead of razorpay SDK — we need 2 endpoints, SDK adds a dep
async function razorpay<T>(path: string, init?: RequestInit): Promise<T> {
  const keyId = (await getSecret('RAZORPAY_KEY_ID')) ?? '';
  const keySecret = (await getSecret('RAZORPAY_KEY_SECRET')) ?? '';
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Razorpay ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

/** Constant-time compare for hex-encoded HMAC signatures — avoids a timing side-channel. */
function hexEquals(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function verifyWebhookSignature(rawBody: string, signature: string): Promise<boolean> {
  const secret = (await getSecret('RAZORPAY_WEBHOOK_SECRET')) ?? '';
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return hexEquals(expected, signature);
}

function periodEnd(start: Date, period: Period): Date {
  const end = new Date(start);
  if (period === 'annual') end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return end;
}

// Admin-editable via PUT /admin/plan-pricing (plan_pricing table). Missing
// row (nothing edited yet) falls back to the shared-package default so
// pricing never breaks before an admin touches the new table.
async function getPlanPricing(plan: Plan): Promise<{ monthly: number; annual: number }> {
  const row = await prisma.planPricing.findUnique({ where: { plan } });
  if (row) return { monthly: row.monthly_paise, annual: row.annual_paise };
  return PLAN_PRICING[plan];
}

function jsonLimits(plan: Plan) {
  const limits = PLAN_LIMITS[plan];
  // Infinity is not valid JSON — serialize unlimited as null
  const orNull = (n: number) => (Number.isFinite(n) ? n : null);
  return {
    ...limits,
    max_products: orNull(limits.max_products),
    max_customers: orNull(limits.max_customers),
    max_collection_links_per_month: orNull(limits.max_collection_links_per_month),
  };
}

const CreateSubscriptionSchema = z.object({
  plan: z.enum(['STARTER', 'GROWTH', 'PRO']),
  billing_period: z.enum(['monthly', 'annual']).default('monthly'),
});

interface RazorpaySubscription {
  id: string;
  status: string;
  short_url: string;
  current_start?: number;
  current_end?: number;
  notes?: Record<string, string>;
}

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}

export const billingRoutes: FastifyPluginAsync = async (server) => {
  // Razorpay signs the raw body — keep it. Parser is encapsulated to /v1/billing.
  server.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req: FastifyRequest, body, done) => {
      req.rawBody = body as string;
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // ─── GET /billing/plans ─────────────────────────────────────────
  server.get('/plans', async () => ({
    data: await Promise.all(
      (Object.keys(PLAN_PRICING) as Plan[]).map(async (plan) => ({
        plan,
        pricing: await getPlanPricing(plan),
        limits: jsonLimits(plan),
      })),
    ),
  }));

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
    const { plan, billing_period } = body.data;

    const planId = RAZORPAY_PLAN_IDS[plan][billing_period];
    if (!planId) {
      throw validationError(`Razorpay plan not configured for ${plan} ${billing_period}`);
    }

    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: { trial_ends_at: true, razorpay_subscription_id: true, plan_status: true },
    });
    if (!retailer) throw notFound('Retailer');
    if (retailer.plan_status === 'ACTIVE' && retailer.razorpay_subscription_id) {
      throw validationError('Subscription already active. Cancel it before changing plans.');
    }

    // First charge lands when the 14-day trial runs out (or now if already over)
    const trialEnd = retailer.trial_ends_at?.getTime() ?? 0;
    const startAt = Math.max(trialEnd, Date.now() + 5 * 60 * 1000); // Razorpay needs a future ts

    const rzpSub = await razorpay<RazorpaySubscription>('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        plan_id: planId,
        total_count: billing_period === 'annual' ? 10 : 120,
        customer_notify: 1,
        start_at: Math.floor(startAt / 1000),
        notes: { retailer_id: request.retailerId, plan, billing_period },
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
          billing_period,
          amount_inr: pricing[billing_period],
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
        metadata: { plan, billing_period },
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

  // ─── GET /billing/addon-pricing ──────────────────────────────────
  // Returns available addon packs with their prices. No auth needed for pricing.
  server.get('/addon-pricing', async () => ({
    data: ADDON_PRICING,
  }));

  // ─── POST /billing/addon-checkout ──────────────────────────────
  // Creates a Razorpay Payment Link + Order for an addon purchase.
  // The payment link's short_url is opened in the user's browser for checkout.
  // On completion, the callback_url handles verification and crediting.
  server.post('/addon-checkout', async (request) => {
    const body = z
      .object({
        resource_type: z.enum([
          'PRODUCT_UPLOAD',
          'AI_TAGGING_CALL',
          'TRY_ON',
          'IMAGE_CROP',
          'BG_REMOVAL',
          'API_REQUEST',
        ] as const),
        pack_index: z.number().int().min(0),
      })
      .parse(request.body);

    const packs = ADDON_PRICING[body.resource_type];
    const pack = packs?.[body.pack_index];
    if (!pack) {
      throw validationError('Invalid resource_type or pack_index');
    }

    // Get retailer info for the payment link customer
    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: { phone: true, shop_name: true },
    });
    if (!retailer) throw notFound('Retailer');

    // Create a Razorpay Payment Link — generates a hosted checkout URL
    // that the retailer opens in their browser on any device.
    const publicHost = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `${request.protocol}://${request.host}`;
    const callbackUrl = `${publicHost.replace(/\/+$/, '')}/v1/billing/addon-callback`;

    const paymentLink = await razorpay<{
      id: string;
      short_url: string;
      status: string;
    }>('/payment_links', {
      method: 'POST',
      body: JSON.stringify({
        amount: pack.price_paise,
        currency: 'INR',
        accept_partial: false,
        description: pack.label,
        customer: {
          name: retailer.shop_name,
          contact: retailer.phone,
        },
        notify: { sms: false, email: false },
        callback_url: callbackUrl,
        callback_method: 'get',
        notes: {
          retailer_id: request.retailerId,
          resource_type: body.resource_type,
          quantity: pack.pack_size,
          type: 'addon_purchase',
        },
      }),
    });

    // Create pending QuotaAddonPurchase record
    const addonPurchase = await prisma.quotaAddonPurchase.create({
      data: {
        retailer_id: request.retailerId,
        resource_type: body.resource_type as QuotaResourceType,
        quantity: pack.pack_size,
        amount_inr: pack.price_paise,
        status: 'PENDING',
        razorpay_order_id: paymentLink.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'create',
        resource_type: 'QuotaAddonPurchase',
        resource_id: addonPurchase.id,
        metadata: { resource_type: body.resource_type, quantity: pack.pack_size },
        ip_address: request.ip,
      },
    });

    return {
      data: {
        checkout_url: paymentLink.short_url,
        resource_type: body.resource_type,
        quantity: pack.pack_size,
        label: pack.label,
        amount_paise: pack.price_paise,
      },
    };
  });

  // ─── GET /billing/addon-callback ───────────────────────────────
  // Razorpay Payment Link callback. After successful payment the browser
  // redirects here with query params. We verify and credit the addon.
  // This is a GET endpoint (no JWT) because Razorpay redirects via GET.
  server.get('/addon-callback', async (request, reply) => {
    const query = z
      .object({
        razorpay_payment_id: z.string().optional(),
        razorpay_payment_link_id: z.string().optional(),
        razorpay_payment_link_reference_id: z.string().optional(),
        razorpay_signature: z.string().optional(),
      })
      .parse(request.query);

    const { razorpay_payment_id, razorpay_payment_link_id, razorpay_signature } = query;

    if (!razorpay_payment_id || !razorpay_payment_link_id || !razorpay_signature) {
      return reply.status(400).send({
        error: { code: 'INVALID_CALLBACK', message: 'Missing payment parameters', status: 400 },
      });
    }

    // Verify the Payment Link signature
    const secret = (await getSecret('RAZORPAY_KEY_SECRET')) ?? '';
    const expected = createHmac('sha256', secret)
      .update(`${razorpay_payment_link_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (!hexEquals(expected, razorpay_signature)) {
      request.log.warn({ razorpay_payment_link_id }, 'Payment link callback signature mismatch');
      return reply.status(401).send({
        error: {
          code: 'INVALID_SIGNATURE',
          message: 'Payment link verification failed',
          status: 401,
        },
      });
    }

    // Find the pending purchase by payment_link_id (stored in razorpay_order_id)
    const purchase = await prisma.quotaAddonPurchase.findFirst({
      where: {
        razorpay_order_id: razorpay_payment_link_id,
        status: 'PENDING',
      },
    });

    if (!purchase) {
      request.log.warn({ razorpay_payment_link_id }, 'No pending purchase found for payment link');
      return reply.redirect(
        `${process.env.WEB_URL ?? 'http://localhost:3000'}/billing/addon-success?status=unknown`,
      );
    }

    // Fetch payment details from Razorpay to verify amount matches
    try {
      const payment = await razorpay<{ amount: number; status: string }>(
        `/payments/${razorpay_payment_id}`,
      );
      if (payment.amount !== purchase.amount_inr) {
        request.log.error(
          { razorpay_payment_id, expected: purchase.amount_inr, actual: payment.amount },
          'Payment amount mismatch on addon callback',
        );
      }
    } catch (err) {
      request.log.error({ razorpay_payment_id, err }, 'Failed to fetch payment details');
    }

    // Credit the addon to the retailer's usage counter
    const effective = await (async () => {
      const override = await prisma.retailerLimitOverride.findUnique({
        where: {
          retailer_id_resource_type: {
            retailer_id: purchase.retailer_id,
            resource_type: purchase.resource_type,
          },
        },
      });
      if (override) return { limit: override.limit_per_period, period: override.period };

      const retailer = await prisma.retailer.findUniqueOrThrow({
        where: { id: purchase.retailer_id },
        select: { plan: true },
      });
      const planLimit = await prisma.planLimit.findUnique({
        where: {
          plan_resource_type: {
            plan: retailer.plan,
            resource_type: purchase.resource_type,
          },
        },
      });
      return planLimit ? { limit: planLimit.limit_per_period, period: planLimit.period } : null;
    })();

    if (effective && effective.limit !== -1) {
      const period = effective.period;
      const now = new Date();
      const start =
        period === 'DAY'
          ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
          : period === 'MONTH'
            ? new Date(now.getFullYear(), now.getMonth(), 1)
            : new Date(0);

      await prisma.$transaction([
        prisma.usageCounter.upsert({
          where: {
            retailer_id_resource_type_period_start: {
              retailer_id: purchase.retailer_id,
              resource_type: purchase.resource_type,
              period_start: start,
            },
          },
          create: {
            retailer_id: purchase.retailer_id,
            resource_type: purchase.resource_type,
            period_start: start,
            count: -purchase.quantity,
          },
          update: { count: { decrement: purchase.quantity } },
        }),
        prisma.quotaAddonPurchase.update({
          where: { id: purchase.id },
          data: {
            status: 'COMPLETED',
            razorpay_payment_id,
            completed_at: new Date(),
          },
        }),
      ]);
    } else {
      await prisma.quotaAddonPurchase.update({
        where: { id: purchase.id },
        data: {
          status: 'COMPLETED',
          razorpay_payment_id,
          completed_at: new Date(),
        },
      });
    }

    request.log.info(
      {
        retailer_id: purchase.retailer_id,
        resource_type: purchase.resource_type,
        quantity: purchase.quantity,
      },
      'Addon purchase completed via payment link callback',
    );

    // Redirect to a success page
    return reply.redirect(
      `${process.env.WEB_URL ?? 'http://localhost:3000'}/billing/addon-success?status=success`,
    );
  });

  // ─── POST /billing/create-order (one-time payment, e.g. add-on credits) ─
  server.post('/create-order', async (request) => {
    const body = z
      .object({ amount_paise: z.number().int().min(100).max(10_000_00) })
      .parse(request.body);

    const order = await razorpay<{ id: string; amount: number; currency: string; receipt: string }>(
      '/orders',
      {
        method: 'POST',
        body: JSON.stringify({
          amount: body.amount_paise,
          currency: 'INR',
          receipt: `addon_${request.retailerId}_${Date.now()}`,
          notes: { retailer_id: request.retailerId },
        }),
      },
    );

    return {
      data: {
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        key_id: await getSecret('RAZORPAY_KEY_ID'),
      },
    };
  });

  // ─── POST /billing/verify-payment ──────────────────────────────
  // Verify Razorpay payment signature. Called from the mobile/web client
  // after a successful Razorpay Standard Checkout payment.
  server.post('/verify-payment', async (request) => {
    const body = z
      .object({
        razorpay_order_id: z.string(),
        razorpay_payment_id: z.string(),
        razorpay_signature: z.string(),
      })
      .parse(request.body);

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    // HMAC-SHA256(order_id + "|" + payment_id, key_secret)
    const expected = createHmac('sha256', (await getSecret('RAZORPAY_KEY_SECRET')) ?? '')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (!hexEquals(expected, razorpay_signature)) {
      throw validationError('Payment signature verification failed');
    }

    // Payment verified — webhook handler records subscription.charged events.
    // One-time add-on fulfillment (e.g. extra try-on credits) happens separately.
    return {
      data: {
        verified: true,
        razorpay_order_id,
        razorpay_payment_id,
      },
    };
  });

  // ─── POST /billing/webhook (Razorpay → server, no JWT) ──────────
  server.post('/webhook', async (request, reply) => {
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
        payment?: {
          entity: { id: string; order_id?: string; amount: number; status: string };
        };
      };
    };

    // Replay protection: reject stale events (signature alone doesn't prevent
    // a captured request from being resent later, e.g. to resurrect a cancelled plan)
    const WEBHOOK_MAX_AGE_SECONDS = 300;
    if (
      typeof event.created_at !== 'number' ||
      Math.abs(Date.now() / 1000 - event.created_at) > WEBHOOK_MAX_AGE_SECONDS
    ) {
      return reply.status(401).send({ error: { code: 'STALE_EVENT', status: 401 } });
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
        const end = rzpSub.current_end
          ? new Date(rzpSub.current_end * 1000)
          : periodEnd(start, subscription.billing_period as Period);

        await prisma.$transaction([
          prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: 'ACTIVE', current_period_start: start, current_period_end: end },
          }),
          prisma.retailer.update({
            where: { id: retailerId },
            data: {
              plan,
              plan_status: 'ACTIVE',
              plan_expires_at: end,
              max_products: Number.isFinite(limits.max_products) ? limits.max_products : 999999,
              max_customers: Number.isFinite(limits.max_customers) ? limits.max_customers : 999999,
              try_on_credits: limits.try_on_credits,
            },
          }),
          ...(event.event === 'subscription.charged' && event.payload.payment
            ? [
                prisma.subscriptionPayment.create({
                  data: {
                    subscription_id: subscription.id,
                    retailer_id: retailerId,
                    amount_inr: event.payload.payment.entity.amount,
                    status: 'success',
                    razorpay_payment_id: event.payload.payment.entity.id,
                    razorpay_order_id: event.payload.payment.entity.order_id,
                    paid_at: new Date(),
                  },
                }),
              ]
            : []),
        ]);
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

      case 'subscription.cancelled':
      case 'subscription.completed': {
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

      default:
        request.log.info({ event: event.event }, 'unhandled razorpay event');
    }

    return reply.send({ received: true });
  });
};
