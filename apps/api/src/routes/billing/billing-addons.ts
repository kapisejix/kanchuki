// billing-addons.ts — one-time addon packs (payment link + order + verification) (split from apps/api/src/routes/billing.ts — body byte-identical)
import {
  type QuotaAddonPurchase,
  type QuotaResourceType,
  type SubscriptionPlan,
  prisma,
} from '@kanchuki/db';
import { ADDON_PRICING } from '@kanchuki/shared';
import * as Sentry from '@sentry/node';
import type { FastifyBaseLogger, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addGenerateGstInvoiceJob } from '../../jobs/generate-gst-invoice.js';
import { hasFeatureForPlan } from '../../lib/features.js';
import { allocateInvoiceNumber } from '../../lib/gst-invoice-number.js';
import { computeInclusiveGst } from '../../lib/gst.js';
import { notFound, validationError } from '../../plugins/error-handler.js';
import {
  getEffectiveLimit,
  razorpay,
  resolveStateCode,
  verifyPaymentLinkSignature,
} from './billing-helpers.js';
// The callback credits only a limited resource (limit !== -1, row exists); a pack
// bought otherwise would take payment and credit nothing. Checked for EVERY pack type at
// checkout (bug hunt #5: only try-on was checked, so an unlimited-plan retailer could buy
// "Extra 100 crops" and get an invoice for nothing).
async function canCredit(
  retailerId: string,
  plan: SubscriptionPlan,
  resourceType: QuotaResourceType = 'TRY_ON_GENERATION',
): Promise<boolean> {
  const eff = await getEffectiveLimit(retailerId, resourceType, plan);
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
    } else if (
      !(await canCredit(request.retailerId, retailer.plan, body.resource_type as QuotaResourceType))
    ) {
      throw validationError('This pack is not available on your plan', 'resource_type');
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
    // fall through to the credit step.
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

    const outcome = await completeAddonPurchase(
      purchase,
      razorpay_payment_id,
      payment,
      request.log,
    );
    const status =
      outcome === 'credited' || outcome === 'already'
        ? 'success'
        : outcome === 'failed'
          ? 'failed'
          : 'error';
    return reply.redirect(`${webUrl}/billing/addon-success?status=${status}`);
  });
};

/**
 * Verify a Razorpay payment against a PENDING add-on purchase, then claim + credit +
 * invoice it in one transaction. Shared by the browser callback and the
 * `payment_link.paid` webhook (bug hunt #6: a retailer who closed the tab before the
 * redirect paid and got nothing). The PENDING -> COMPLETED CAS makes the two paths (and
 * replays of either) credit once.
 *  - credited: this call completed it
 *  - already:  another delivery completed it first
 *  - failed:   wrong amount or Razorpay says failed (purchase marked FAILED)
 *  - pending:  not captured yet (authorized...) — left PENDING
 *  - error:    credit transaction threw — left PENDING, alerted, safe to replay
 */
export async function completeAddonPurchase(
  purchase: QuotaAddonPurchase,
  razorpay_payment_id: string,
  payment: { amount: number; status: string },
  log: FastifyBaseLogger,
): Promise<'credited' | 'already' | 'failed' | 'pending' | 'error'> {
  if (payment.amount !== purchase.amount_inr || payment.status !== 'captured') {
    // Definitive: the wrong amount, or Razorpay says the payment failed. Anything else
    // (authorized, created...) can still capture, so the purchase stays PENDING.
    const definitive = payment.amount !== purchase.amount_inr || payment.status === 'failed';
    log.error(
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
    return definitive ? 'failed' : 'pending';
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

  // GST split for the invoice. amount_inr is the GST-INCLUSIVE gross charged.
  const [buyer, gstProfile] = await Promise.all([
    prisma.retailer.findUnique({ where: { id: purchase.retailer_id }, select: { state: true } }),
    prisma.platformGstProfile.findUnique({ where: { id: 'singleton' } }),
  ]);
  const buyerStateCode = buyer?.state ? resolveStateCode(buyer.state) : null;
  const gst = computeInclusiveGst({
    grossPaise: purchase.amount_inr,
    buyerStateCode,
    sellerStateCode: gstProfile?.state_code ?? null,
  });

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
      // The pack was paid for whether or not it credited anything, so it is always
      // invoiced. The number is allocated INSIDE this txn: a rollback burns none.
      const invoiceNo = await allocateInvoiceNumber(
        gstProfile?.invoice_prefix ?? 'KAN',
        new Date(),
        tx,
      );
      await tx.quotaAddonPurchase.update({
        where: { id: purchase.id },
        data: {
          gst_invoice_number: invoiceNo,
          amount_excluding_gst: gst.basePaise,
          gst_amount: gst.gstTotal,
          gst_rate: gst.rate,
          cgst_amount: gst.cgst || null,
          sgst_amount: gst.sgst || null,
          igst_amount: gst.igst || null,
          sac_code: gst.sac,
          place_of_supply: buyerStateCode
            ? `${buyerStateCode}-${buyer?.state}`
            : (buyer?.state ?? null),
        },
      });
      return true;
    });
  } catch (err) {
    log.error(
      { err, purchase_id: purchase.id, razorpay_payment_id },
      'PAID addon purchase NOT credited - left PENDING, needs replay or manual credit',
    );
    // A log line is not an alert: money was taken and nothing was credited.
    Sentry.captureException(err, {
      tags: { area: 'addon-credit' },
      extra: { purchase_id: purchase.id, razorpay_payment_id },
    });
    return 'error';
  }
  if (!claimed) {
    log.info({ purchase_id: purchase.id }, 'Addon purchase already processed');
    return 'already';
  }

  // PDF is async and never blocks the callback; the hourly invoice sweep re-queues
  // any purchase that has a number but no PDF yet.
  addGenerateGstInvoiceJob({ addon_purchase_id: purchase.id }).catch((err) => {
    log.error({ err, purchase_id: purchase.id }, 'Failed to enqueue add-on GST invoice');
  });

  log.info(
    {
      retailer_id: purchase.retailer_id,
      resource_type: purchase.resource_type,
      quantity: purchase.quantity,
    },
    'Addon purchase completed',
  );
  return 'credited';
}
