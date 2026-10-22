// billing-addons.ts — one-time addon packs (payment link + order + verification) (split from apps/api/src/routes/billing.ts — body byte-identical)
import { type QuotaResourceType, type SubscriptionPlan, getSecret, prisma } from '@kanchuki/db';
import { ADDON_PRICING } from '@kanchuki/shared';
import * as Sentry from '@sentry/node';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hasFeatureForPlan } from '../../lib/features.js';
import { notFound, validationError } from '../../plugins/error-handler.js';
import {
  getEffectiveLimit,
  razorpay,
  verifyOrderSignature,
  verifyPaymentLinkSignature,
} from './billing-helpers.js';
// The callback credits only a limited resource (limit !== -1, row exists); a pack
// bought otherwise would take payment and credit nothing.
async function canCredit(retailerId: string, plan: SubscriptionPlan): Promise<boolean> {
  const eff = await getEffectiveLimit(retailerId, 'TRY_ON_GENERATION', plan);
  return !!eff && eff.limit !== -1;
}
export const billingAddonRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /billing/addon-pricing ──────────────────────────────────
  // Returns available addon packs with their prices. No auth needed for pricing.
  server.get('/addon-pricing', async () => ({
    data: ADDON_PRICING,
  }));
  // ─── GET /billing/try-on-packs ───────────────────────────────────
  // Owner-only (default-deny staff allowlist). Active admin packs this retailer's
  // plan may buy; [] when none or when the plan lacks VIRTUAL_TRY_ON_V2.
  server.get('/try-on-packs', async (request) => {
    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: { plan: true },
    });
    // [] unless the pack would actually credit (limited resource) - never sell nothing.
    if (
      !retailer ||
      !(await hasFeatureForPlan(retailer.plan, 'VIRTUAL_TRY_ON_V2')) ||
      !(await canCredit(request.retailerId, retailer.plan))
    ) {
      return { data: [] };
    }
    const rows = await prisma.resourcePack.findMany({
      where: {
        resource_type: 'TRY_ON_GENERATION',
        is_active: true,
        price_paise: { gt: 0 },
        pack_size: { gt: 0 },
        OR: [{ plans: { isEmpty: true } }, { plans: { has: retailer.plan } }],
      },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        label: r.label,
        pack_size: r.pack_size,
        price_paise: r.price_paise,
      })),
    };
  });
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
          'TRY_ON_GENERATION',
        ] as const),
        pack_index: z.number().int().min(0).optional(),
        pack_id: z.string().min(1).max(64).optional(),
      })
      .parse(request.body);

    const isTryOn = body.resource_type === 'TRY_ON_GENERATION';
    // Legacy types: hardcoded ADDON_PRICING by index. Try-on: admin ResourcePack by id.
    // ponytail: mixed sources; migrate the legacy five to the DB table when needed.
    let pack: { label: string; pack_size: number; price_paise: number } | undefined;
    if (isTryOn) {
      if (!body.pack_id) throw validationError('pack_id is required', 'pack_id');
    } else {
      pack =
        body.pack_index === undefined
          ? undefined
          : ADDON_PRICING[body.resource_type as keyof typeof ADDON_PRICING]?.[body.pack_index];
      if (!pack) throw validationError('Invalid resource_type or pack_index');
    }

    // Get retailer info for the payment link customer
    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: { phone: true, shop_name: true, plan: true },
    });
    if (!retailer) throw notFound('Retailer');

    if (isTryOn) {
      // Every refusal here is a 404 (invisible, like the try-on routes) and
      // happens before Razorpay is called or a purchase row exists.
      if (!(await hasFeatureForPlan(retailer.plan, 'VIRTUAL_TRY_ON_V2'))) throw notFound('Product');
      if (!(await canCredit(request.retailerId, retailer.plan))) throw notFound('Product');
      const row = await prisma.resourcePack.findFirst({
        where: {
          id: body.pack_id,
          resource_type: 'TRY_ON_GENERATION',
          is_active: true,
          OR: [{ plans: { isEmpty: true } }, { plans: { has: retailer.plan } }],
        },
      });
      if (!row) throw notFound('Product');
      if (row.price_paise <= 0 || row.pack_size <= 0) {
        request.log.error({ pack_id: row.id }, 'Try-on pack has a non-positive price or size');
        throw notFound('Product');
      }
      pack = row;
    }
    if (!pack) throw notFound('Product'); // unreachable; narrows the type

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
        metadata: {
          resource_type: body.resource_type,
          quantity: pack.pack_size,
          ...(isTryOn ? { pack_id: body.pack_id } : {}),
        },
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
        razorpay_payment_link_status: z.string().optional(),
        razorpay_signature: z.string().optional(),
      })
      .parse(request.query);

    const { razorpay_payment_id, razorpay_payment_link_id, razorpay_signature } = query;

    if (!razorpay_payment_id || !razorpay_payment_link_id || !razorpay_signature) {
      return reply.status(400).send({
        error: { code: 'INVALID_CALLBACK', message: 'Missing payment parameters', status: 400 },
      });
    }

    // Verify the Payment Link signature (server-side, key secret; empty secret = fail).
    const sigOk = await verifyPaymentLinkSignature({
      linkId: razorpay_payment_link_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
      referenceId: query.razorpay_payment_link_reference_id,
      status: query.razorpay_payment_link_status,
    });

    if (!sigOk) {
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
    const webUrl = process.env.WEB_URL ?? 'http://localhost:3000';
    let payment: { amount: number; status: string };
    try {
      payment = await razorpay<{ amount: number; status: string }>(
        `/payments/${razorpay_payment_id}`,
      );
    } catch (err) {
      // The signature above already proved this link went through Razorpay, so a failed
      // LOOKUP says nothing about the payment. It must not become a terminal FAILED: this
      // callback only finds PENDING rows, so a replay could never credit it (RC-071).
      request.log.error(
        { razorpay_payment_id, err },
        'Failed to fetch payment details - left PENDING, replay the callback',
      );
      Sentry.captureException(err, {
        tags: { area: 'addon-callback' },
        extra: { purchase_id: purchase.id, razorpay_payment_id },
      });
      return reply.redirect(`${webUrl}/billing/addon-success?status=error`);
    }
    if (payment.amount !== purchase.amount_inr || payment.status !== 'captured') {
      // Definitive: the wrong amount, or Razorpay says the payment failed. Anything else
      // (authorized, created...) can still capture, so the purchase stays PENDING.
      const definitive = payment.amount !== purchase.amount_inr || payment.status === 'failed';
      request.log.error(
        {
          razorpay_payment_id,
          expected: purchase.amount_inr,
          actual: payment.amount,
          status: payment.status,
        },
        'Payment amount/status mismatch on addon callback — not crediting',
      );
      if (definitive) {
        // CAS on PENDING: a concurrent callback that already completed it must not be
        // overwritten with FAILED.
        await prisma.quotaAddonPurchase.updateMany({
          where: { id: purchase.id, status: 'PENDING' },
          data: { status: 'FAILED', razorpay_payment_id },
        });
      }
      return reply.redirect(
        `${webUrl}/billing/addon-success?status=${definitive ? 'failed' : 'error'}`,
      );
    }

    // Credit the addon to the retailer's usage counter
    const effective = await getEffectiveLimit(purchase.retailer_id, purchase.resource_type);

    // Claim + credit in ONE transaction: the conditional PENDING -> COMPLETED flip
    // is the compare-and-set, so concurrent/replayed callbacks credit once. If the
    // credit throws, the claim rolls back with it and the purchase stays PENDING
    // (a later callback replay can still credit it).
    const period = effective?.period;
    const now = new Date();
    const start =
      period === 'DAY'
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
        : period === 'MONTH'
          ? new Date(now.getFullYear(), now.getMonth(), 1)
          : new Date(0);
    const shouldCredit = !!effective && effective.limit !== -1;
    let claimed: boolean;
    try {
      claimed = await prisma.$transaction(async (tx) => {
        const res = await tx.quotaAddonPurchase.updateMany({
          where: { id: purchase.id, status: 'PENDING' },
          data: { status: 'COMPLETED', razorpay_payment_id, completed_at: new Date() },
        });
        if (res.count !== 1) return false;
        if (shouldCredit) {
          await tx.usageCounter.upsert({
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
          });
        }
        return true;
      });
    } catch (err) {
      request.log.error(
        { err, purchase_id: purchase.id, razorpay_payment_id },
        'PAID addon purchase NOT credited - left PENDING, needs replay or manual credit',
      );
      // A log line is not an alert: money was taken and nothing was credited.
      Sentry.captureException(err, {
        tags: { area: 'addon-credit' },
        extra: { purchase_id: purchase.id, razorpay_payment_id },
      });
      return reply.redirect(
        `${process.env.WEB_URL ?? 'http://localhost:3000'}/billing/addon-success?status=error`,
      );
    }
    if (!claimed) {
      request.log.info({ purchase_id: purchase.id }, 'Addon callback already processed');
      return reply.redirect(
        `${process.env.WEB_URL ?? 'http://localhost:3000'}/billing/addon-success?status=success`,
      );
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

    // HMAC-SHA256(order_id + "|" + payment_id, key_secret); empty secret = fail
    if (!(await verifyOrderSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature))) {
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
