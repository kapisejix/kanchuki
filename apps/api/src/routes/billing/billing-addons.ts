// billing-addons.ts — one-time addon packs (payment link + order + verification) (split from apps/api/src/routes/billing.ts — body byte-identical)
import { createHmac } from 'node:crypto';
import { type QuotaResourceType, getSecret, prisma } from '@kanchuki/db';
import { ADDON_PRICING } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { hexEquals, razorpay } from './billing-helpers.js';
export const billingAddonRoutes: FastifyPluginAsync = async (server) => {
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

    // Fetch payment details from Razorpay to verify amount + capture status
    // before crediting anything — a mismatch or uncaptured payment must not
    // fall through to the credit step below.
    try {
      const payment = await razorpay<{ amount: number; status: string }>(
        `/payments/${razorpay_payment_id}`,
      );
      if (payment.amount !== purchase.amount_inr || payment.status !== 'captured') {
        request.log.error(
          {
            razorpay_payment_id,
            expected: purchase.amount_inr,
            actual: payment.amount,
            status: payment.status,
          },
          'Payment amount/status mismatch on addon callback — not crediting',
        );
        await prisma.quotaAddonPurchase.update({
          where: { id: purchase.id },
          data: { status: 'FAILED', razorpay_payment_id },
        });
        return reply.redirect(
          `${process.env.WEB_URL ?? 'http://localhost:3000'}/billing/addon-success?status=failed`,
        );
      }
    } catch (err) {
      request.log.error({ razorpay_payment_id, err }, 'Failed to fetch payment details');
      await prisma.quotaAddonPurchase.update({
        where: { id: purchase.id },
        data: { status: 'FAILED', razorpay_payment_id },
      });
      return reply.redirect(
        `${process.env.WEB_URL ?? 'http://localhost:3000'}/billing/addon-success?status=failed`,
      );
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
};
