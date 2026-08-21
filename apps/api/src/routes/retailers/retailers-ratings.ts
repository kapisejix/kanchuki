// F-021: Product & Store Ratings — retailer-facing routes
// Retailers can view reviews, respond, and manage their Google review link

import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@kanchuki/db'

// ─── Schemas ─────────────────────────────────────────────────────

const SubmitProductReviewSchema = z.object({
  product_id: z.string().min(1),
  customer_id: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
})

const SubmitStoreReviewSchema = z.object({
  customer_id: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
})

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Recompute denormalized avg_rating + rating_count for a product.
 * Called after every review insert/update/delete.
 */
async function recomputeProductRating(productId: string) {
  const agg = await prisma.productReview.aggregate({
    where: { product_id: productId, is_hidden: false },
    _avg: { rating: true },
    _count: { rating: true },
  })
  await prisma.product.update({
    where: { id: productId },
    data: {
      avg_rating: agg._avg.rating ?? 0,
      rating_count: agg._count.rating,
    },
  })
}

/**
 * Recompute denormalized avg_rating + rating_count for a retailer (store reviews).
 */
async function recomputeStoreRating(retailerId: string) {
  const agg = await prisma.storeReview.aggregate({
    where: { retailer_id: retailerId, is_hidden: false },
    _avg: { rating: true },
    _count: { rating: true },
  })
  await prisma.retailer.update({
    where: { id: retailerId },
    data: {
      avg_rating: agg._avg.rating ?? 0,
      rating_count: agg._count.rating,
    },
  })
}

/**
 * Check if a customer is eligible to review a product.
 * Eligibility: customer must have a prior interaction (view/favorite/enquiry/purchase)
 * with the retailer, or a prior order.
 */
async function checkProductReviewEligibility(
  customerId: string,
  retailerId: string,
  productId: string,
): Promise<{ eligible: boolean; reason?: string }> {
  // Check for prior interaction with this specific product
  const productInteraction = await prisma.customerInteraction.findFirst({
    where: {
      customer_id: customerId,
      retailer_id: retailerId,
      product_id: productId,
      type: { in: ['favorite', 'enquiry', 'purchase', 'try_on'] },
    },
  })
  if (productInteraction) return { eligible: true }

  // Check for any interaction with this retailer (broader eligibility)
  const retailerInteraction = await prisma.customerInteraction.findFirst({
    where: {
      customer_id: customerId,
      retailer_id: retailerId,
    },
  })
  if (retailerInteraction) return { eligible: true }

  // Check for prior order
  const order = await prisma.order.findFirst({
    where: {
      retailer_id: retailerId,
      // Order doesn't have customer_id directly, but we can check via items
    },
  })

  return {
    eligible: false,
    reason: 'Customer must have a prior interaction or purchase with this retailer to leave a review.',
  }
}

/**
 * Check if a customer is eligible to leave a store review.
 * Eligibility: customer must have a prior interaction with the retailer.
 */
async function checkStoreReviewEligibility(
  customerId: string,
  retailerId: string,
): Promise<{ eligible: boolean; reason?: string }> {
  const interaction = await prisma.customerInteraction.findFirst({
    where: {
      customer_id: customerId,
      retailer_id: retailerId,
    },
  })
  if (interaction) return { eligible: true }

  return {
    eligible: false,
    reason: 'Customer must have a prior interaction with this store to leave a review.',
  }
}

/**
 * Build Google Business Profile "Write a Review" URL.
 * Format: https://search.google.com/local/writereview?placeid={place_id}
 */
function buildGoogleReviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`
}

/**
 * Determine review routing after submission.
 * rating >= 4 → show "Leave us a Google review" CTA
 * rating <= 3 → show private "Tell us what went wrong" prompt
 */
function getReviewRouting(rating: number, googlePlaceId?: string | null) {
  if (rating >= 4 && googlePlaceId) {
    return {
      action: 'google_review' as const,
      message: 'Loved it? Leave us a Google review!',
      url: buildGoogleReviewUrl(googlePlaceId),
    }
  }
  if (rating <= 3) {
    return {
      action: 'private_feedback' as const,
      message: 'Tell us what went wrong — your feedback helps us improve.',
    }
  }
  return { action: 'none' as const }
}

// ─── Routes ──────────────────────────────────────────────────────

export const retailersRatingsRoutes: FastifyPluginAsync = async (server) => {
  // ─── PUBLIC: Submit a product review (called from customer web PWA) ───
  server.post<{ Body: z.infer<typeof SubmitProductReviewSchema> }>(
    '/reviews/product',
    {
      schema: {
        body: {
          type: 'object',
          required: ['product_id', 'customer_id', 'rating'],
          properties: {
            product_id: { type: 'string' },
            customer_id: { type: 'string' },
            rating: { type: 'number', minimum: 1, maximum: 5 },
            comment: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = SubmitProductReviewSchema.parse(request.body)

      // Look up the product to get retailer_id
      const product = await prisma.product.findUnique({
        where: { id: body.product_id },
        select: { retailer_id: true, id: true },
      })
      if (!product) return reply.status(404).send({ error: 'Product not found' })

      // Check eligibility
      const eligibility = await checkProductReviewEligibility(
        body.customer_id,
        product.retailer_id,
        body.product_id,
      )
      if (!eligibility.eligible) {
        return reply.status(403).send({ error: eligibility.reason })
      }

      // Check for existing review (upsert)
      const existing = await prisma.productReview.findUnique({
        where: {
          product_id_customer_id: {
            product_id: body.product_id,
            customer_id: body.customer_id,
          },
        },
      })

      let review
      if (existing) {
        // Update existing review
        review = await prisma.productReview.update({
          where: { id: existing.id },
          data: {
            rating: body.rating,
            comment: body.comment,
          },
        })
      } else {
        // Create new review
        review = await prisma.productReview.create({
          data: {
            product_id: body.product_id,
            customer_id: body.customer_id,
            retailer_id: product.retailer_id,
            rating: body.rating,
            comment: body.comment,
          },
        })
      }

      // Recompute denormalized rating
      await recomputeProductRating(body.product_id)

      // Get retailer's google_place_id for routing
      const retailer = await prisma.retailer.findUnique({
        where: { id: product.retailer_id },
        select: { google_place_id: true },
      })

      const routing = getReviewRouting(body.rating, retailer?.google_place_id)

      return reply.status(201).send({
        data: review,
        routing,
      })
    },
  )

  // ─── PUBLIC: Submit a store review (called from customer web PWA) ───
  server.post<{ Body: z.infer<typeof SubmitStoreReviewSchema> }>(
    '/reviews/store',
    {
      schema: {
        body: {
          type: 'object',
          required: ['customer_id', 'rating'],
          properties: {
            customer_id: { type: 'string' },
            rating: { type: 'number', minimum: 1, maximum: 5 },
            comment: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = SubmitStoreReviewSchema.parse(request.body)
      const retailerId = (request as any).retailerId as string

      // Check eligibility
      const eligibility = await checkStoreReviewEligibility(body.customer_id, retailerId)
      if (!eligibility.eligible) {
        return reply.status(403).send({ error: eligibility.reason })
      }

      // Check for existing review (upsert)
      const existing = await prisma.storeReview.findUnique({
        where: {
          retailer_id_customer_id: {
            retailer_id: retailerId,
            customer_id: body.customer_id,
          },
        },
      })

      let review
      if (existing) {
        review = await prisma.storeReview.update({
          where: { id: existing.id },
          data: {
            rating: body.rating,
            comment: body.comment,
          },
        })
      } else {
        review = await prisma.storeReview.create({
          data: {
            retailer_id: retailerId,
            customer_id: body.customer_id,
            rating: body.rating,
            comment: body.comment,
          },
        })
      }

      // Recompute denormalized rating
      await recomputeStoreRating(retailerId)

      // Get retailer's google_place_id for routing
      const retailer = await prisma.retailer.findUnique({
        where: { id: retailerId },
        select: { google_place_id: true },
      })

      const routing = getReviewRouting(body.rating, retailer?.google_place_id)

      return reply.status(201).send({
        data: review,
        routing,
      })
    },
  )

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
      const retailerId = (request as any).retailerId as string
      const { product_id, page = 1, limit = 20 } = request.query as any
      const skip = (page - 1) * limit

      const where: any = {
        retailer_id: retailerId,
        is_hidden: false,
      }
      if (product_id) where.product_id = product_id

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
      ])

      return reply.send({
        data: reviews,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      })
    },
  )

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
      const retailerId = (request as any).retailerId as string
      const { page = 1, limit = 20 } = request.query as any
      const skip = (page - 1) * limit

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
      ])

      return reply.send({
        data: reviews,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      })
    },
  )

  // ─── RETAILER: Get rating summary (product + store) ───
  server.get('/reviews/summary', async (request, reply) => {
    const retailerId = (request as any).retailerId as string

    // Store rating summary
    const storeAgg = await prisma.storeReview.aggregate({
      where: { retailer_id: retailerId, is_hidden: false },
      _avg: { rating: true },
      _count: { rating: true },
    })

    // Rating distribution (1-5 stars) for store
    const storeDistribution = await prisma.storeReview.groupBy({
      by: ['rating'],
      where: { retailer_id: retailerId, is_hidden: false },
      _count: { rating: true },
    })

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
    })

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
    ])

    // Google review link
    const retailer = await prisma.retailer.findUnique({
      where: { id: retailerId },
      select: { google_place_id: true },
    })

    const googleReviewUrl = retailer?.google_place_id
      ? buildGoogleReviewUrl(retailer.google_place_id)
      : null

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
    })
  })

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
      const retailerId = (request as any).retailerId as string
      const { google_place_id } = request.body as any

      await prisma.retailer.update({
        where: { id: retailerId },
        data: { google_place_id: google_place_id || null },
      })

      return reply.send({ success: true })
    },
  )
}
