// F-021: Product & Store Ratings — admin moderation routes
// Admin can list, flag, hide, and delete reviews across all retailers

import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '@kanchuki/db'
import { notFound } from '../../plugins/error-handler.js'
import { adminAuthPreHandler } from '../admin-auth.js'

export const adminRatingsRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler)

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
            page: { type: 'number', minimum: 1 },
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
      } = request.query as any
      const skip = (page - 1) * limit

      const productWhere: any = {}
      const storeWhere: any = {}

      if (retailer_id) {
        productWhere.retailer_id = retailer_id
        storeWhere.retailer_id = retailer_id
      }
      if (flagged !== undefined) {
        productWhere.is_flagged = flagged
        storeWhere.is_flagged = flagged
      }
      if (hidden !== undefined) {
        productWhere.is_hidden = hidden
        storeWhere.is_hidden = hidden
      }
      if (min_rating !== undefined || max_rating !== undefined) {
        const ratingFilter: any = {}
        if (min_rating !== undefined) ratingFilter.gte = min_rating
        if (max_rating !== undefined) ratingFilter.lte = max_rating
        productWhere.rating = ratingFilter
        storeWhere.rating = ratingFilter
      }

      let productReviews: any[] = []
      let storeReviews: any[] = []
      let productTotal = 0
      let storeTotal = 0

      if (type === 'product' || type === 'all') {
        ;[productReviews, productTotal] = await Promise.all([
          prisma.productReview.findMany({
            where: productWhere,
            include: {
              product: { select: { id: true, name: true } },
              customer: { select: { id: true, name: true } },
              retailer: { select: { id: true, shop_name: true } },
            },
            orderBy: { created_at: 'desc' },
            skip,
            take: limit,
          }),
          prisma.productReview.count({ where: productWhere }),
        ])
      }

      if (type === 'store' || type === 'all') {
        ;[storeReviews, storeTotal] = await Promise.all([
          prisma.storeReview.findMany({
            where: storeWhere,
            include: {
              customer: { select: { id: true, name: true } },
              retailer: { select: { id: true, shop_name: true } },
            },
            orderBy: { created_at: 'desc' },
            skip,
            take: limit,
          }),
          prisma.storeReview.count({ where: storeWhere }),
        ])
      }

      // Merge and sort by date
      const allReviews = [
        ...productReviews.map((r) => ({ ...r, _type: 'product' as const })),
        ...storeReviews.map((r) => ({ ...r, _type: 'store' as const })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      return reply.send({
        data: allReviews.slice(0, limit),
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
      })
    },
  )

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
      ])

    const productAvg = await prisma.productReview.aggregate({
      where: { is_hidden: false },
      _avg: { rating: true },
    })
    const storeAvg = await prisma.storeReview.aggregate({
      where: { is_hidden: false },
      _avg: { rating: true },
    })

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
    })
  })

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
      const { type, id } = request.params as { type: string; id: string }

      if (type === 'product') {
        const review = await prisma.productReview.update({
          where: { id },
          data: { is_flagged: true },
        }).catch(() => null)
        if (!review) throw notFound('Review')

        const adminId = request.adminId ?? 'system'
        await prisma.auditLog.create({
          data: {
            actor_type: 'admin',
            actor_id: adminId,
            action: 'review_flagged',
            resource_type: 'ProductReview',
            resource_id: id,
            metadata: { rating: review.rating, product_id: review.product_id },
          },
        })

        return reply.send({ data: review })
      }

      const review = await prisma.storeReview.update({
        where: { id },
        data: { is_flagged: true },
      }).catch(() => null)
      if (!review) throw notFound('Review')

      const adminId = request.adminId ?? 'system'
      await prisma.auditLog.create({
        data: {
          actor_type: 'admin',
          actor_id: adminId,            action: 'review_flagged',
            resource_type: 'StoreReview',
            resource_id: id,
            metadata: { rating: review.rating, retailer_id: review.retailer_id },
        },
      })

      return reply.send({ data: review })
    },
  )

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
      const { type, id } = request.params as { type: string; id: string }

      if (type === 'product') {
        const review = await prisma.productReview.update({
          where: { id },
          data: { is_hidden: true },
        }).catch(() => null)
        if (!review) throw notFound('Review')

        // Recompute denormalized rating
        const agg = await prisma.productReview.aggregate({
          where: { product_id: review.product_id, is_hidden: false },
          _avg: { rating: true },
          _count: { rating: true },
        })
        await prisma.product.update({
          where: { id: review.product_id },
          data: { avg_rating: agg._avg.rating ?? 0, rating_count: agg._count.rating },
        })

        const adminId = request.adminId ?? 'system'
        await prisma.auditLog.create({
          data: {
            actor_type: 'admin',
            actor_id: adminId,
            action: 'review_hidden',
            resource_type: 'ProductReview',
            resource_id: id,
            metadata: { product_id: review.product_id },
          },
        })

        return reply.send({ data: review })
      }

      const review = await prisma.storeReview.update({
        where: { id },
        data: { is_hidden: true },
      }).catch(() => null)
      if (!review) throw notFound('Review')

      // Recompute denormalized store rating
      const agg = await prisma.storeReview.aggregate({
        where: { retailer_id: review.retailer_id, is_hidden: false },
        _avg: { rating: true },
        _count: { rating: true },
      })
      await prisma.retailer.update({
        where: { id: review.retailer_id },
        data: { avg_rating: agg._avg.rating ?? 0, rating_count: agg._count.rating },
      })

      const adminId = request.adminId ?? 'system'
      await prisma.auditLog.create({
        data: {
          actor_type: 'admin',
          actor_id: adminId,            action: 'review_hidden',
            resource_type: 'StoreReview',
            resource_id: id,
            metadata: { retailer_id: review.retailer_id },
        },
      })

      return reply.send({ data: review })
    },
  )

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
      const { type, id } = request.params as { type: string; id: string }

      if (type === 'product') {
        const review = await prisma.productReview.update({
          where: { id },
          data: { is_hidden: false, is_flagged: false },
        }).catch(() => null)
        if (!review) throw notFound('Review')

        const agg = await prisma.productReview.aggregate({
          where: { product_id: review.product_id, is_hidden: false },
          _avg: { rating: true },
          _count: { rating: true },
        })
        await prisma.product.update({
          where: { id: review.product_id },
          data: { avg_rating: agg._avg.rating ?? 0, rating_count: agg._count.rating },
        })

        return reply.send({ data: review })
      }

      const review = await prisma.storeReview.update({
        where: { id },
        data: { is_hidden: false, is_flagged: false },
      }).catch(() => null)
      if (!review) throw notFound('Review')

      const agg = await prisma.storeReview.aggregate({
        where: { retailer_id: review.retailer_id, is_hidden: false },
        _avg: { rating: true },
        _count: { rating: true },
      })
      await prisma.retailer.update({
        where: { id: review.retailer_id },
        data: { avg_rating: agg._avg.rating ?? 0, rating_count: agg._count.rating },
      })

      return reply.send({ data: review })
    },
  )
}
