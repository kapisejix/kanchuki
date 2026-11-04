// F-021: Product & Store Ratings — admin moderation routes
// Admin can list, flag, hide, and delete reviews across all retailers

import { type Prisma, getPurgePrisma, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { nullOnMissing } from '../../lib/prisma-errors.js';
import { notFound } from '../../plugins/error-handler.js';
import { adminAuthPreHandler, requireSuperAdmin } from '../admin-auth.js';

export const adminRatingsRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/reviews — list all reviews (product + store) with filters ───
  server.get(
    '/reviews',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['product', 'store', 'all'] },
            retailer_id: { type: 'string' },
            flagged: { type: 'boolean' },
            hidden: { type: 'boolean' },
            min_rating: { type: 'number' },
            max_rating: { type: 'number' },
            // ponytail: merged window = page*limit rows per source, so cap page (max 10k rows each).
            // Past that, narrow with filters; keyset/UNION pagination if reviews ever outgrow it.
            page: { type: 'number', minimum: 1, maximum: 100 },
            limit: { type: 'number', minimum: 1, maximum: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      const {
        type = 'all',
        retailer_id,
        flagged,
        hidden,
        min_rating,
        max_rating,
        page = 1,
        limit = 20,
      } = request.query as {
        type?: 'all' | 'product' | 'store';
        retailer_id?: string;
        flagged?: boolean;
        hidden?: boolean;
        min_rating?: number;
        max_rating?: number;
        page?: number;
        limit?: number;
      };
      const skip = (page - 1) * limit;

      const productWhere: Prisma.ProductReviewWhereInput = {};
      const storeWhere: Prisma.StoreReviewWhereInput = {};

      if (retailer_id) {
        productWhere.retailer_id = retailer_id;
        storeWhere.retailer_id = retailer_id;
      }
      if (flagged !== undefined) {
        productWhere.is_flagged = flagged;
        storeWhere.is_flagged = flagged;
      }
      if (hidden !== undefined) {
        productWhere.is_hidden = hidden;
        storeWhere.is_hidden = hidden;
      }
      if (min_rating !== undefined || max_rating !== undefined) {
        // Built structurally rather than naming the filter type: the product and
        // store rating columns may differ (Int vs Float), so one shared named
        // type would not be assignable to both.
        const ratingFilter = {
          ...(min_rating !== undefined ? { gte: min_rating } : {}),
          ...(max_rating !== undefined ? { lte: max_rating } : {}),
        };
        productWhere.rating = ratingFilter;
        storeWhere.rating = ratingFilter;
      }

      type ProductReviewRow = Prisma.ProductReviewGetPayload<{
        include: {
          product: { select: { id: true; name: true } };
          customer: { select: { id: true; name: true } };
          retailer: { select: { id: true; shop_name: true } };
        };
      }>;
      type StoreReviewRow = Prisma.StoreReviewGetPayload<{
        include: {
          customer: { select: { id: true; name: true } };
          retailer: { select: { id: true; shop_name: true } };
        };
      }>;
      let productReviews: ProductReviewRow[] = [];
      let storeReviews: StoreReviewRow[] = [];
      let productTotal = 0;
      let storeTotal = 0;

      if (type === 'product' || type === 'all') {
        [productReviews, productTotal] = await Promise.all([
          prisma.productReview.findMany({
            where: productWhere,
            include: {
              product: { select: { id: true, name: true } },
              customer: { select: { id: true, name: true } },
              retailer: { select: { id: true, shop_name: true } },
            },
            orderBy: { created_at: 'desc' },
            // ponytail: merged page needs top skip+limit of each source; deep pages fetch more
            take: skip + limit,
          }),
          prisma.productReview.count({ where: productWhere }),
        ]);
      }

      if (type === 'store' || type === 'all') {
        [storeReviews, storeTotal] = await Promise.all([
          prisma.storeReview.findMany({
            where: storeWhere,
            include: {
              customer: { select: { id: true, name: true } },
              retailer: { select: { id: true, shop_name: true } },
            },
            orderBy: { created_at: 'desc' },
            take: skip + limit,
          }),
          prisma.storeReview.count({ where: storeWhere }),
        ]);
      }

      // Merge and sort by date
      const allReviews = [
        ...productReviews.map((r) => ({ ...r, _type: 'product' as const })),
        ...storeReviews.map((r) => ({ ...r, _type: 'store' as const })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return reply.send({
        data: allReviews.slice(skip, skip + limit),
        pagination: {
          page,
          limit,
          total: productTotal + storeTotal,
          pages: Math.ceil((productTotal + storeTotal) / limit),
        },
        counts: {
          product: productTotal,
          store: storeTotal,
        },
      });
    },
  );

  // ─── GET /admin/reviews/stats — aggregate review stats ───
  server.get('/reviews/stats', async (_request, reply) => {
    const [productCount, storeCount, flaggedProducts, flaggedStore, hiddenProducts, hiddenStore] =
      await Promise.all([
        prisma.productReview.count({ where: { is_hidden: false } }),
        prisma.storeReview.count({ where: { is_hidden: false } }),
        prisma.productReview.count({ where: { is_flagged: true, is_hidden: false } }),
        prisma.storeReview.count({ where: { is_flagged: true, is_hidden: false } }),
        prisma.productReview.count({ where: { is_hidden: true } }),
        prisma.storeReview.count({ where: { is_hidden: true } }),
      ]);

    const productAvg = await prisma.productReview.aggregate({
      where: { is_hidden: false },
      _avg: { rating: true },
    });
    const storeAvg = await prisma.storeReview.aggregate({
      where: { is_hidden: false },
      _avg: { rating: true },
    });

    return reply.send({
      data: {
        total_reviews: productCount + storeCount,
        product_reviews: productCount,
        store_reviews: storeCount,
        avg_product_rating: productAvg._avg.rating ?? 0,
        avg_store_rating: storeAvg._avg.rating ?? 0,
        flagged: flaggedProducts + flaggedStore,
        hidden: hiddenProducts + hiddenStore,
      },
    });
  });

  // ─── GET /admin/reviews/retailers — shops that have reviews (for the filter picker) ───
  server.get('/reviews/retailers', async (_request, reply) => {
    const [p, s] = await Promise.all([
      prisma.productReview.groupBy({ by: ['retailer_id'] }),
      prisma.storeReview.groupBy({ by: ['retailer_id'] }),
    ]);
    const ids = [...new Set([...p, ...s].map((r) => r.retailer_id))];
    const data = await prisma.retailer.findMany({
      where: { id: { in: ids } },
      select: { id: true, shop_name: true },
      orderBy: { shop_name: 'asc' },
    });
    return reply.send({ data });
  });

  // ─── PATCH /admin/reviews/:type/:id/flag — flag a review ───
  server.patch<{ Params: { type: string; id: string } }>(
    '/reviews/:type/:id/flag',
    {
      schema: {
        params: {
          type: 'object',
          required: ['type', 'id'],
          properties: {
            type: { type: 'string', enum: ['product', 'store'] },
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { type, id } = request.params as { type: string; id: string };

      if (type === 'product') {
        const review = await prisma.productReview
          .update({
            where: { id },
            data: { is_flagged: true },
          })
          .catch(nullOnMissing);
        if (!review) throw notFound('Review');

        const adminId = request.adminId ?? 'system';
        await prisma.auditLog.create({
          data: {
            actor_type: 'admin',
            actor_id: adminId,
            action: 'review_flagged',
            resource_type: 'ProductReview',
            resource_id: id,
            metadata: { rating: review.rating, product_id: review.product_id },
          },
        });

        return reply.send({ data: review });
      }

      const review = await prisma.storeReview
        .update({
          where: { id },
          data: { is_flagged: true },
        })
        .catch(nullOnMissing);
      if (!review) throw notFound('Review');

      const adminId = request.adminId ?? 'system';
      await prisma.auditLog.create({
        data: {
          actor_type: 'admin',
          actor_id: adminId,
          action: 'review_flagged',
          resource_type: 'StoreReview',
          resource_id: id,
          metadata: { rating: review.rating, retailer_id: review.retailer_id },
        },
      });

      return reply.send({ data: review });
    },
  );

  // ─── PATCH /admin/reviews/:type/:id/hide — soft-hide a review ───
  server.patch<{ Params: { type: string; id: string } }>(
    '/reviews/:type/:id/hide',
    {
      schema: {
        params: {
          type: 'object',
          required: ['type', 'id'],
          properties: {
            type: { type: 'string', enum: ['product', 'store'] },
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { type, id } = request.params as { type: string; id: string };

      if (type === 'product') {
        const review = await prisma.productReview
          .update({
            where: { id },
            data: { is_hidden: true },
          })
          .catch(nullOnMissing);
        if (!review) throw notFound('Review');

        // Recompute denormalized rating
        const agg = await prisma.productReview.aggregate({
          where: { product_id: review.product_id, is_hidden: false },
          _avg: { rating: true },
          _count: { rating: true },
        });
        await prisma.product.update({
          where: { id: review.product_id },
          data: { avg_rating: agg._avg.rating ?? 0, rating_count: agg._count.rating },
        });

        const adminId = request.adminId ?? 'system';
        await prisma.auditLog.create({
          data: {
            actor_type: 'admin',
            actor_id: adminId,
            action: 'review_hidden',
            resource_type: 'ProductReview',
            resource_id: id,
            metadata: { product_id: review.product_id },
          },
        });

        return reply.send({ data: review });
      }

      const review = await prisma.storeReview
        .update({
          where: { id },
          data: { is_hidden: true },
        })
        .catch(nullOnMissing);
      if (!review) throw notFound('Review');

      // Recompute denormalized store rating
      const agg = await prisma.storeReview.aggregate({
        where: { retailer_id: review.retailer_id, is_hidden: false },
        _avg: { rating: true },
        _count: { rating: true },
      });
      await prisma.retailer.update({
        where: { id: review.retailer_id },
        data: { avg_rating: agg._avg.rating ?? 0, rating_count: agg._count.rating },
      });

      const adminId = request.adminId ?? 'system';
      await prisma.auditLog.create({
        data: {
          actor_type: 'admin',
          actor_id: adminId,
          action: 'review_hidden',
          resource_type: 'StoreReview',
          resource_id: id,
          metadata: { retailer_id: review.retailer_id },
        },
      });

      return reply.send({ data: review });
    },
  );

  // ─── PATCH /admin/reviews/:type/:id/unhide — restore a hidden review ───
  server.patch<{ Params: { type: string; id: string } }>(
    '/reviews/:type/:id/unhide',
    {
      schema: {
        params: {
          type: 'object',
          required: ['type', 'id'],
          properties: {
            type: { type: 'string', enum: ['product', 'store'] },
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { type, id } = request.params as { type: string; id: string };

      if (type === 'product') {
        const review = await prisma.productReview
          .update({
            where: { id },
            data: { is_hidden: false, is_flagged: false },
          })
          .catch(nullOnMissing);
        if (!review) throw notFound('Review');

        const agg = await prisma.productReview.aggregate({
          where: { product_id: review.product_id, is_hidden: false },
          _avg: { rating: true },
          _count: { rating: true },
        });
        await prisma.product.update({
          where: { id: review.product_id },
          data: { avg_rating: agg._avg.rating ?? 0, rating_count: agg._count.rating },
        });

        await prisma.auditLog.create({
          data: {
            actor_type: 'admin',
            actor_id: request.adminId ?? 'system',
            action: 'review_unhidden',
            resource_type: 'ProductReview',
            resource_id: id,
            metadata: { product_id: review.product_id },
          },
        });

        return reply.send({ data: review });
      }

      const review = await prisma.storeReview
        .update({
          where: { id },
          data: { is_hidden: false, is_flagged: false },
        })
        .catch(nullOnMissing);
      if (!review) throw notFound('Review');

      const agg = await prisma.storeReview.aggregate({
        where: { retailer_id: review.retailer_id, is_hidden: false },
        _avg: { rating: true },
        _count: { rating: true },
      });
      await prisma.retailer.update({
        where: { id: review.retailer_id },
        data: { avg_rating: agg._avg.rating ?? 0, rating_count: agg._count.rating },
      });

      await prisma.auditLog.create({
        data: {
          actor_type: 'admin',
          actor_id: request.adminId ?? 'system',
          action: 'review_unhidden',
          resource_type: 'StoreReview',
          resource_id: id,
          metadata: { retailer_id: review.retailer_id },
        },
      });

      return reply.send({ data: review });
    },
  );

  // ─── DELETE /admin/reviews/:type/:id — permanent delete (Super Admin; hide is the reversible option) ───
  // kanchuki_app has no DELETE on review tables (RC-049) → scoped purge role + allow_hard_delete, as in growth-promotions.
  server.delete<{ Params: { type: 'product' | 'store'; id: string } }>(
    '/reviews/:type/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['type', 'id'],
          properties: {
            type: { type: 'string', enum: ['product', 'store'] },
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      requireSuperAdmin(request);
      const { type, id } = request.params;
      const purgeDb = getPurgePrisma();

      if (type === 'product') {
        const review = await prisma.productReview.findUnique({ where: { id } });
        if (!review) throw notFound('Review');
        await purgeDb.$transaction([
          purgeDb.$executeRawUnsafe(`SET LOCAL app.allow_hard_delete = 'true';`),
          purgeDb.productReview.delete({ where: { id } }),
        ]);
        const agg = await prisma.productReview.aggregate({
          where: { product_id: review.product_id, is_hidden: false },
          _avg: { rating: true },
          _count: { rating: true },
        });
        await prisma.product.update({
          where: { id: review.product_id },
          data: { avg_rating: agg._avg.rating ?? 0, rating_count: agg._count.rating },
        });
        await prisma.auditLog.create({
          data: {
            actor_type: 'admin',
            actor_id: request.adminId ?? 'system',
            action: 'review_deleted',
            resource_type: 'ProductReview',
            resource_id: id,
            metadata: { rating: review.rating, product_id: review.product_id },
          },
        });
        return reply.status(204).send();
      }

      const review = await prisma.storeReview.findUnique({ where: { id } });
      if (!review) throw notFound('Review');
      await purgeDb.$transaction([
        purgeDb.$executeRawUnsafe(`SET LOCAL app.allow_hard_delete = 'true';`),
        purgeDb.storeReview.delete({ where: { id } }),
      ]);
      const agg = await prisma.storeReview.aggregate({
        where: { retailer_id: review.retailer_id, is_hidden: false },
        _avg: { rating: true },
        _count: { rating: true },
      });
      await prisma.retailer.update({
        where: { id: review.retailer_id },
        data: { avg_rating: agg._avg.rating ?? 0, rating_count: agg._count.rating },
      });
      await prisma.auditLog.create({
        data: {
          actor_type: 'admin',
          actor_id: request.adminId ?? 'system',
          action: 'review_deleted',
          resource_type: 'StoreReview',
          resource_id: id,
          metadata: { rating: review.rating, retailer_id: review.retailer_id },
        },
      });
      return reply.status(204).send();
    },
  );

  // ─── PATCH /admin/reviews/:type/:id/unflag — dismiss a flag (review stays visible) ───
  server.patch<{ Params: { type: 'product' | 'store'; id: string } }>(
    '/reviews/:type/:id/unflag',
    {
      schema: {
        params: {
          type: 'object',
          required: ['type', 'id'],
          properties: {
            type: { type: 'string', enum: ['product', 'store'] },
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { type, id } = request.params;
      const data = { is_flagged: false };
      const review =
        type === 'product'
          ? await prisma.productReview.update({ where: { id }, data }).catch(nullOnMissing)
          : await prisma.storeReview.update({ where: { id }, data }).catch(nullOnMissing);
      if (!review) throw notFound('Review');

      await prisma.auditLog.create({
        data: {
          actor_type: 'admin',
          actor_id: request.adminId ?? 'system',
          action: 'review_unflagged',
          resource_type: type === 'product' ? 'ProductReview' : 'StoreReview',
          resource_id: id,
          metadata: { rating: review.rating },
        },
      });

      return reply.send({ data: review });
    },
  );
};
