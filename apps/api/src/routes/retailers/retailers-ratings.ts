// F-021: Product & Store Ratings — retailer-facing routes
// Retailers can view reviews, respond, and manage their Google review link
//
// Review SUBMISSION lives only in public-reviews.ts (customer identified by
// phone, no retailer auth) — a retailer-authenticated submit route with an
// arbitrary customer_id in the body would let a retailer fabricate reviews
// attributed to any customer. Do not re-add POST /reviews/product|store here.

import { type Prisma, prisma } from '@kanchuki/db';
import { buildGoogleReviewUrl, extractPlaceId } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  placeExists,
  placesConfigured,
  searchPlaces,
  takeDailySearch,
} from '../../lib/google-places.js';
import { AppError, notFound, validationError } from '../../plugins/error-handler.js';

// Accepts a raw place id or a pasted Google Maps link; null/'' clears it.
const GooglePlaceBody = z.object({ google_place_id: z.string().trim().max(2000).nullable() });
const SearchQuery = z.object({ q: z.string().trim().min(2).max(120) });

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
      const retailerId = request.retailerId;
      const {
        product_id,
        page = 1,
        limit = 20,
      } = request.query as {
        product_id?: string;
        page?: number;
        limit?: number;
      };
      const skip = (page - 1) * limit;

      const where: Prisma.ProductReviewWhereInput = {
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
      const retailerId = request.retailerId;
      const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number };
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
    const retailerId = request.retailerId;

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
  // Owner-only by default-deny (not in any staff/support allowlist). Takes an id or a
  // pasted Maps link, stores only the extracted id, and — when the Places key is set —
  // refuses an id Google doesn't know (a dead link would reach every happy customer).
  server.patch('/reviews/google-place', async (request, reply) => {
    const retailerId = request.retailerId;
    const body = GooglePlaceBody.safeParse(request.body);
    if (!body.success) throw validationError('Send a Place ID or a Google Maps link');

    const raw = body.data.google_place_id;
    let placeId: string | null = null;
    if (raw) {
      placeId = extractPlaceId(raw);
      if (!placeId) {
        throw validationError(
          "Couldn't find a Place ID in that. Search for your shop by name, or paste the full Google Maps link.",
        );
      }
      if (placesConfigured() && !(await placeExists(placeId))) {
        throw validationError('Google does not know that Place ID. Search for your shop by name.');
      }
    }

    await prisma.retailer.update({
      where: { id: retailerId },
      data: { google_place_id: placeId },
    });
    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: retailerId,
        action: 'update',
        resource_type: 'Retailer',
        resource_id: retailerId,
        metadata: { google_place_id: placeId ? 'set' : 'cleared' },
        ip_address: request.ip,
      },
    });

    return reply.send({ success: true, google_place_id: placeId });
  });

  // ─── RETAILER: Find the shop on Google (Places Text Search) ───
  // Keyed on retailerId, not request.ip (RC-099: the web proxy collapses IPs).
  server.get(
    '/me/google-place/search',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: 60 * 1000,
          keyGenerator: (req: { retailerId?: string; ip: string }) => req.retailerId ?? req.ip,
        },
      },
    },
    async (request) => {
      if (!placesConfigured()) {
        throw new AppError('NOT_CONFIGURED', 'Google search is not available yet', 501);
      }
      const q = SearchQuery.safeParse(request.query);
      if (!q.success) throw validationError('Type at least 2 letters of your shop name');

      const retailer = await prisma.retailer.findUnique({
        where: { id: request.retailerId },
        select: { latitude: true, longitude: true },
      });
      if (!retailer) throw notFound('Retailer');

      await takeDailySearch(request.retailerId);
      const near =
        retailer.latitude != null && retailer.longitude != null
          ? { latitude: retailer.latitude, longitude: retailer.longitude }
          : null;
      return { data: await searchPlaces(q.data.q, near) };
    },
  );
};
