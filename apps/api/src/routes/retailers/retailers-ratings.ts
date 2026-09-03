// F-021: Product & Store Ratings — retailer-facing routes
// Retailers can view reviews, respond, and manage their Google review link
//
// Review SUBMISSION lives only in public-reviews.ts (customer identified by
// phone, no retailer auth) — a retailer-authenticated submit route with an
// arbitrary customer_id in the body would let a retailer fabricate reviews
// attributed to any customer. Do not re-add POST /reviews/product|store here.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Build Google Business Profile "Write a Review" URL.
 * Format: https://search.google.com/local/writereview?placeid={place_id}
 */
function buildGoogleReviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

// ─── Routes ──────────────────────────────────────────────────────

export const retailersRatingsRoutes: FastifyPluginAsync = async (server) => {
  // ─── RETAILER: List product reviews for their products ───
  server.get(
    '/reviews/products',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            product_id: { type: 'string' },
            page: { type: 'number', minimum: 1 },
            limit: { type: 'number', minimum: 1, maximum: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const retailerId = (request as any).retailerId as string;
      const { product_id, page = 1, limit = 20 } = request.query as any;
      const skip = (page - 1) * limit;

      const where: any = {
        retailer_id: retailerId,
        is_hidden: false,
      };
      if (product_id) where.product_id = product_id;

      const [reviews, total] = await Promise.all([
        prisma.productReview.findMany({
          where,
          include: {
            product: { select: { id: true, name: true, primary_color: true } },
            customer: { select: { id: true, name: true } },
          },
          orderBy: { created_at: 'desc' },
          skip,
          take: limit,
        }),
        prisma.productReview.count({ where }),
      ]);

      return reply.send({
        data: reviews,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    },
  );

  // ─── RETAILER: List store reviews ───
  server.get(
    '/reviews/store',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', minimum: 1 },
            limit: { type: 'number', minimum: 1, maximum: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const retailerId = (request as any).retailerId as string;
      const { page = 1, limit = 20 } = request.query as any;
      const skip = (page - 1) * limit;

      const [reviews, total] = await Promise.all([
        prisma.storeReview.findMany({
          where: {
            retailer_id: retailerId,
            is_hidden: false,
          },
          include: {
            customer: { select: { id: true, name: true } },
          },
          orderBy: { created_at: 'desc' },
          skip,
          take: limit,
        }),
        prisma.storeReview.count({
          where: { retailer_id: retailerId, is_hidden: false },
        }),
      ]);

      return reply.send({
        data: reviews,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    },
  );

  // ─── RETAILER: Get rating summary (product + store) ───
  server.get('/reviews/summary', async (request, reply) => {
    const retailerId = (request as any).retailerId as string;

    // Store rating summary
    const storeAgg = await prisma.storeReview.aggregate({
      where: { retailer_id: retailerId, is_hidden: false },
      _avg: { rating: true },
      _count: { rating: true },
    });

    // Rating distribution (1-5 stars) for store
    const storeDistribution = await prisma.storeReview.groupBy({
      by: ['rating'],
      where: { retailer_id: retailerId, is_hidden: false },
      _count: { rating: true },
    });

    // Top reviewed products
    const topProducts = await prisma.product.findMany({
      where: {
        retailer_id: retailerId,
        rating_count: { gt: 0 },
      },
      select: {
        id: true,
        name: true,
        avg_rating: true,
        rating_count: true,
        primary_color: true,
      },
      orderBy: { rating_count: 'desc' },
      take: 5,
    });

    // Recent reviews (last 5 product + store combined)
    const [recentProductReviews, recentStoreReviews] = await Promise.all([
      prisma.productReview.findMany({
        where: { retailer_id: retailerId, is_hidden: false },
        include: {
          product: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
        },
        orderBy: { created_at: 'desc' },
        take: 5,
      }),
      prisma.storeReview.findMany({
        where: { retailer_id: retailerId, is_hidden: false },
        include: {
          customer: { select: { id: true, name: true } },
        },
        orderBy: { created_at: 'desc' },
        take: 5,
      }),
    ]);

    // Google review link
    const retailer = await prisma.retailer.findUnique({
      where: { id: retailerId },
      select: { google_place_id: true },
    });

    const googleReviewUrl = retailer?.google_place_id
      ? buildGoogleReviewUrl(retailer.google_place_id)
      : null;

    return reply.send({
      data: {
        store: {
          avg_rating: storeAgg._avg.rating ?? 0,
          rating_count: storeAgg._count.rating,
          distribution: [1, 2, 3, 4, 5].map((star) => ({
            star,
            count: storeDistribution.find((d) => d.rating === star)?._count.rating ?? 0,
          })),
        },
        top_products: topProducts,
        recent_reviews: [
          ...recentProductReviews.map((r) => ({
            ...r,
            type: 'product' as const,
          })),
          ...recentStoreReviews.map((r) => ({
            ...r,
            type: 'store' as const,
            product: null,
          })),
        ]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 10),
        google_review_url: googleReviewUrl,
      },
    });
  });

  // ─── RETAILER: Update Google Place ID ───
  server.patch<{ Body: { google_place_id: string | null } }>(
    '/reviews/google-place',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            google_place_id: { type: ['string', 'null'] },
          },
        },
      },
    },
    async (request, reply) => {
      const retailerId = (request as any).retailerId as string;
      const { google_place_id } = request.body as any;

      await prisma.retailer.update({
        where: { id: retailerId },
        data: { google_place_id: google_place_id || null },
      });

      return reply.send({ success: true });
    },
  );
};
