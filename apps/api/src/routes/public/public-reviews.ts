// F-021: Public review submission — customer-facing endpoints
// RC-098 (H4-3): the reviewer is the signed-in shopper (passport session). The body
// never supplies an identity, and a review never reads or writes the retailer CRM
// (Customer). The review carries its own display_name.

import { createHash } from 'node:crypto';
import { type Prisma, prisma } from '@kanchuki/db';
import { buildGoogleReviewUrl, normalizeIndianPhone } from '@kanchuki/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { notFound } from '../../plugins/error-handler.js';
import { getPassportSession, passportCookieId } from './passport/passport-helpers.js';

// ─── Schemas ─────────────────────────────────────────────────────

const SubmitProductReviewSchema = z.object({
  product_id: z.string().min(1),
  display_name: z.string().trim().min(1).max(80).optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

const SubmitStoreReviewSchema = z.object({
  retailer_id: z.string().min(1),
  display_name: z.string().trim().min(1).max(80).optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

// What the shopper gets back about their own review. Explicit so no account id leaks.
const REVIEW_SELECT = {
  id: true,
  rating: true,
  comment: true,
  display_name: true,
  created_at: true,
} as const;

// RC-099: key the limit on the passport session, not request.ip. The web proxy forwards
// no client IP (RC-084 / T2.5 F1), so an IP key is one bucket for every shopper.
// No cookie -> falls back to the IP.
function reviewLimitKey(request: FastifyRequest): string {
  const sid = passportCookieId(request.headers.cookie ?? '');
  return sid ? `sess:${createHash('sha256').update(sid).digest('hex')}` : `ip:${request.ip}`;
}

// Public write with a rating recompute behind it: cap it per session (H4-3).
const REVIEW_RATE_LIMIT = {
  rateLimit: { max: 10, timeWindow: 60 * 1000, keyGenerator: reviewLimitKey },
};

// RC-099: max NEW reviews per account per rolling 24 h (product + store combined).
const MAX_NEW_REVIEWS_PER_DAY = 20;

const NO_SESSION = { error: { code: 'NO_SESSION', message: 'Sign in to leave a review' } };
const OWN_STORE = {
  error: { code: 'OWN_STORE_REVIEW', message: "You can't review your own store" },
};
const DAILY_LIMIT = {
  error: {
    code: 'DAILY_REVIEW_LIMIT',
    message: 'Too many new reviews today. Try again tomorrow.',
  },
};

// ─── Helpers ─────────────────────────────────────────────────────

async function reviewerAccount(request: FastifyRequest) {
  const session = await getPassportSession(request.headers.cookie || '');
  if (!session || session.customer_account.deleted_at) return null;
  return session.customer_account;
}

// Stops the owner rating their own store; a friend or relative is not caught (RC-099).
function isOwnStore(
  accountPhone: string | null,
  retailer: { phone: string | null; whatsapp_number: string | null },
) {
  const mine = normalizeIndianPhone(accountPhone ?? '');
  return (
    mine !== '' &&
    [retailer.phone, retailer.whatsapp_number].some((p) => p && normalizeIndianPhone(p) === mine)
  );
}

async function overDailyCap(db: Prisma.TransactionClient, accountId: string) {
  const where = {
    customer_account_id: accountId,
    created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  };
  const [p, s] = await Promise.all([
    db.productReview.count({ where }),
    db.storeReview.count({ where }),
  ]);
  return p + s >= MAX_NEW_REVIEWS_PER_DAY;
}

// RC-102: count and write under one per-account advisory lock, so two parallel first-time
// reviews cannot both read 19 and both insert. Returns null when over the cap; edits skip it.
async function saveUnderDailyCap<T>(
  accountId: string,
  isEdit: (db: Prisma.TransactionClient) => Promise<boolean>,
  save: (db: Prisma.TransactionClient) => Promise<T>,
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`review-cap:${accountId}`}, 0))`;
    if (!(await isEdit(tx)) && (await overDailyCap(tx, accountId))) return null;
    return save(tx);
  });
}

async function recomputeProductRating(productId: string) {
  const agg = await prisma.productReview.aggregate({
    where: { product_id: productId, is_hidden: false },
    _avg: { rating: true },
    _count: { rating: true },
  });
  await prisma.product.update({
    where: { id: productId },
    data: {
      avg_rating: agg._avg.rating ?? 0,
      rating_count: agg._count.rating,
    },
  });
}

async function recomputeStoreRating(retailerId: string) {
  const agg = await prisma.storeReview.aggregate({
    where: { retailer_id: retailerId, is_hidden: false },
    _avg: { rating: true },
    _count: { rating: true },
  });
  await prisma.retailer.update({
    where: { id: retailerId },
    data: {
      avg_rating: agg._avg.rating ?? 0,
      rating_count: agg._count.rating,
    },
  });
}

// Google only lets the customer write their own review, signed in to Google, so we
// just hand them the store's write-review page — for any rating, once we have a place id.
// Low ratings also get the private-feedback note.
function getReviewRouting(rating: number, googlePlaceId?: string | null) {
  return {
    action: googlePlaceId ? ('google_review' as const) : ('none' as const),
    ...(googlePlaceId && {
      message: 'Also post on Google',
      url: buildGoogleReviewUrl(googlePlaceId),
    }),
    ...(rating <= 3 && {
      feedback_message: 'Tell us what went wrong. Your feedback helps us improve.',
    }),
  };
}

// ─── Routes ──────────────────────────────────────────────────────

export const publicReviewsRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /public/reviews/product ──────────────────────────────
  // Signed-in shopper submits (or edits) their review of a product.
  server.post(
    '/reviews/product',
    {
      config: REVIEW_RATE_LIMIT,
      schema: {
        body: {
          type: 'object',
          required: ['product_id', 'rating'],
          properties: {
            product_id: { type: 'string' },
            display_name: { type: 'string' },
            rating: { type: 'number', minimum: 1, maximum: 5 },
            comment: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const account = await reviewerAccount(request);
      if (!account) return reply.status(401).send(NO_SESSION);

      const body = SubmitProductReviewSchema.parse(request.body);

      // Look up the product to get retailer_id
      const product = await prisma.product.findUnique({
        where: { id: body.product_id },
        select: { retailer_id: true, id: true },
      });
      if (!product) throw notFound('Product');

      const retailer = await prisma.retailer.findUnique({
        where: { id: product.retailer_id },
        select: { phone: true, whatsapp_number: true, google_place_id: true },
      });
      if (retailer && isOwnStore(account.phone, retailer)) {
        return reply.status(403).send(OWN_STORE);
      }

      const key = {
        product_id_customer_account_id: {
          product_id: product.id,
          customer_account_id: account.id,
        },
      };
      // Edits never count against the daily cap, so check "is this an edit" first.
      // One review per account per product; a shopper only ever edits their own.
      const review = await saveUnderDailyCap(
        account.id,
        async (db) => !!(await db.productReview.findUnique({ where: key, select: { id: true } })),
        (db) =>
          db.productReview.upsert({
            where: key,
            create: {
              product_id: product.id,
              retailer_id: product.retailer_id,
              customer_account_id: account.id,
              rating: body.rating,
              comment: body.comment,
              display_name: body.display_name ?? account.name ?? null,
            },
            update: {
              rating: body.rating,
              comment: body.comment,
              ...(body.display_name ? { display_name: body.display_name } : {}),
            },
            select: REVIEW_SELECT,
          }),
      );
      if (!review) return reply.status(429).send(DAILY_LIMIT);

      // Recompute denormalized rating
      await recomputeProductRating(product.id);

      const routing = getReviewRouting(body.rating, retailer?.google_place_id);

      return reply.status(201).send({ data: review, routing });
    },
  );

  // ─── POST /public/reviews/store ────────────────────────────────
  // Signed-in shopper submits (or edits) their review of a store.
  server.post(
    '/reviews/store',
    {
      config: REVIEW_RATE_LIMIT,
      schema: {
        body: {
          type: 'object',
          required: ['retailer_id', 'rating'],
          properties: {
            retailer_id: { type: 'string' },
            display_name: { type: 'string' },
            rating: { type: 'number', minimum: 1, maximum: 5 },
            comment: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const account = await reviewerAccount(request);
      if (!account) return reply.status(401).send(NO_SESSION);

      const body = SubmitStoreReviewSchema.parse(request.body);

      // Verify retailer exists
      const retailer = await prisma.retailer.findUnique({
        where: { id: body.retailer_id, deleted_at: null },
        select: { id: true, phone: true, whatsapp_number: true, google_place_id: true },
      });
      if (!retailer) throw notFound('Retailer');
      if (isOwnStore(account.phone, retailer)) return reply.status(403).send(OWN_STORE);

      const key = {
        retailer_id_customer_account_id: {
          retailer_id: retailer.id,
          customer_account_id: account.id,
        },
      };
      const review = await saveUnderDailyCap(
        account.id,
        async (db) => !!(await db.storeReview.findUnique({ where: key, select: { id: true } })),
        (db) =>
          db.storeReview.upsert({
            where: key,
            create: {
              retailer_id: retailer.id,
              customer_account_id: account.id,
              rating: body.rating,
              comment: body.comment,
              display_name: body.display_name ?? account.name ?? null,
            },
            update: {
              rating: body.rating,
              comment: body.comment,
              ...(body.display_name ? { display_name: body.display_name } : {}),
            },
            select: REVIEW_SELECT,
          }),
      );
      if (!review) return reply.status(429).send(DAILY_LIMIT);

      // Recompute denormalized rating
      await recomputeStoreRating(retailer.id);

      const routing = getReviewRouting(body.rating, retailer.google_place_id);

      return reply.status(201).send({ data: review, routing });
    },
  );

  // ─── GET /public/reviews/product/:productId ────────────────────
  // Public: list visible reviews for a product (for display on product detail).
  server.get(
    '/reviews/product/:productId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['productId'],
          properties: { productId: { type: 'string' } },
        },
      },
      config: {
        cacheControl: 'public, max-age=120, s-maxage=120, stale-while-revalidate=600',
      },
    },
    async (request, reply) => {
      const { productId } = request.params as { productId: string };

      reply.header(
        'Cache-Control',
        'public, max-age=120, s-maxage=120, stale-while-revalidate=600',
      );

      const reviews = await prisma.productReview.findMany({
        where: { product_id: productId, is_hidden: false },
        select: {
          id: true,
          rating: true,
          comment: true,
          created_at: true,
          display_name: true,
          // legacy phone-keyed rows (pre-139) still carry the CRM name
          customer: { select: { name: true } },
        },
        orderBy: { created_at: 'desc' },
        take: 20,
      });

      return {
        data: reviews.map((r) => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          created_at: r.created_at,
          customer_name: r.display_name ?? r.customer?.name ?? '',
        })),
      };
    },
  );
};
