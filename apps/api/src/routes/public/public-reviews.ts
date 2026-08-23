// F-021: Public review submission — customer-facing endpoints
// Customers identify by phone (same pattern as QR contact gate / enquiry).
// No retailer auth required — phone + product_id is the identity.

import { prisma } from '@kanchuki/db'
import type { FastifyPluginAsync } from 'fastify'
import { createHash } from 'crypto'
import { z } from 'zod'
import { normalizeIndianPhone } from '@kanchuki/shared'
import { notFound } from '../../plugins/error-handler.js'

// ─── Schemas ─────────────────────────────────────────────────────

const SubmitProductReviewSchema = z.object({
  product_id: z.string().min(1),
  phone: z.string().min(10).max(15),
  name: z.string().min(1).max(200).optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
})

const SubmitStoreReviewSchema = z.object({
  retailer_id: z.string().min(1),
  phone: z.string().min(10).max(15),
  name: z.string().min(1).max(200).optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
})

// ─── Helpers ─────────────────────────────────────────────────────

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

function buildGoogleReviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`
}

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

/**
 * Find or create a customer by phone for a given retailer.
 * Same upsert pattern as the QR contact gate (public-retailers.ts).
 */
async function findOrCreateCustomer(
  retailerId: string,
  phone: string,
  name?: string,
) {
  const normalized = normalizeIndianPhone(phone)
  const phone_hash = createHash('sha256').update(normalized).digest('hex')

  return prisma.customer.upsert({
    where: {
      retailer_id_phone: { retailer_id: retailerId, phone: normalized },
    },
    create: {
      retailer_id: retailerId,
      name: name ?? 'Customer',
      phone: normalized,
      phone_hash,
      source: 'MANUAL',
    },
    update: name ? { name } : {},
    select: { id: true },
  })
}

/**
 * Check if a customer is eligible to review a product.
 * Eligibility: customer must have a prior interaction or order with this retailer.
 */
async function checkProductReviewEligibility(
  customerId: string,
  retailerId: string,
  productId: string,
  customerPhone: string,
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
    where: { customer_id: customerId, retailer_id: retailerId },
  })
  if (retailerInteraction) return { eligible: true }

  // Check for prior order from THIS customer (Order has no customer_id — an
  // anonymous checkout snapshots customer_phone as free-form input, not
  // normalized like Customer.phone — so match on the bare 10-digit tail via
  // `contains` rather than an exact string, or a +91/leading-0 variant of the
  // same number would wrongly look ineligible). Not just retailer_id, or any
  // phone becomes "eligible" once the store has one order from anyone.
  const order = await prisma.order.findFirst({
    where: { retailer_id: retailerId, customer_phone: { contains: customerPhone } },
  })
  if (order) return { eligible: true }

  return {
    eligible: false,
    reason: 'You need to browse or purchase from this store before leaving a review.',
  }
}

async function checkStoreReviewEligibility(
  customerId: string,
  retailerId: string,
  customerPhone: string,
): Promise<{ eligible: boolean; reason?: string }> {
  const interaction = await prisma.customerInteraction.findFirst({
    where: { customer_id: customerId, retailer_id: retailerId },
  })
  if (interaction) return { eligible: true }

  const order = await prisma.order.findFirst({
    where: { retailer_id: retailerId, customer_phone: { contains: customerPhone } },
  })
  if (order) return { eligible: true }

  return {
    eligible: false,
    reason: 'You need to browse or purchase from this store before leaving a review.',
  }
}

// ─── Routes ──────────────────────────────────────────────────────

export const publicReviewsRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /public/reviews/product ──────────────────────────────
  // Customer submits a product review. Identified by phone + product_id.
  server.post(
    '/reviews/product',
    {
      schema: {
        body: {
          type: 'object',
          required: ['product_id', 'phone', 'rating'],
          properties: {
            product_id: { type: 'string' },
            phone: { type: 'string' },
            name: { type: 'string' },
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
      if (!product) throw notFound('Product')

      // Find or create the customer
      const customer = await findOrCreateCustomer(
        product.retailer_id,
        body.phone,
        body.name,
      )

      // Check eligibility
      const eligibility = await checkProductReviewEligibility(
        customer.id,
        product.retailer_id,
        body.product_id,
        normalizeIndianPhone(body.phone),
      )
      if (!eligibility.eligible) {
        return reply.status(403).send({ error: eligibility.reason })
      }

      // Upsert review (one per customer per product)
      const existing = await prisma.productReview.findUnique({
        where: {
          product_id_customer_id: {
            product_id: body.product_id,
            customer_id: customer.id,
          },
        },
      })

      let review
      if (existing) {
        review = await prisma.productReview.update({
          where: { id: existing.id },
          data: { rating: body.rating, comment: body.comment },
        })
      } else {
        review = await prisma.productReview.create({
          data: {
            product_id: body.product_id,
            customer_id: customer.id,
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

      return reply.status(201).send({ data: review, routing })
    },
  )

  // ─── POST /public/reviews/store ────────────────────────────────
  // Customer submits a store review. Identified by phone + retailer_id.
  server.post(
    '/reviews/store',
    {
      schema: {
        body: {
          type: 'object',
          required: ['retailer_id', 'phone', 'rating'],
          properties: {
            retailer_id: { type: 'string' },
            phone: { type: 'string' },
            name: { type: 'string' },
            rating: { type: 'number', minimum: 1, maximum: 5 },
            comment: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = SubmitStoreReviewSchema.parse(request.body)

      // Verify retailer exists
      const retailer = await prisma.retailer.findUnique({
        where: { id: body.retailer_id, deleted_at: null },
        select: { id: true, google_place_id: true },
      })
      if (!retailer) throw notFound('Retailer')

      // Find or create the customer
      const customer = await findOrCreateCustomer(
        body.retailer_id,
        body.phone,
        body.name,
      )

      // Check eligibility
      const eligibility = await checkStoreReviewEligibility(
        customer.id,
        body.retailer_id,
        normalizeIndianPhone(body.phone),
      )
      if (!eligibility.eligible) {
        return reply.status(403).send({ error: eligibility.reason })
      }

      // Upsert review (one per customer per retailer)
      const existing = await prisma.storeReview.findUnique({
        where: {
          retailer_id_customer_id: {
            retailer_id: body.retailer_id,
            customer_id: customer.id,
          },
        },
      })

      let review
      if (existing) {
        review = await prisma.storeReview.update({
          where: { id: existing.id },
          data: { rating: body.rating, comment: body.comment },
        })
      } else {
        review = await prisma.storeReview.create({
          data: {
            retailer_id: body.retailer_id,
            customer_id: customer.id,
            rating: body.rating,
            comment: body.comment,
          },
        })
      }

      // Recompute denormalized rating
      await recomputeStoreRating(body.retailer_id)

      const routing = getReviewRouting(body.rating, retailer.google_place_id)

      return reply.status(201).send({ data: review, routing })
    },
  )

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
      const { productId } = request.params as { productId: string }

      reply.header('Cache-Control', 'public, max-age=120, s-maxage=120, stale-while-revalidate=600')

      const reviews = await prisma.productReview.findMany({
        where: { product_id: productId, is_hidden: false },
        select: {
          id: true,
          rating: true,
          comment: true,
          created_at: true,
          customer: { select: { name: true } },
        },
        orderBy: { created_at: 'desc' },
        take: 20,
      })

      return {
        data: reviews.map((r) => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          created_at: r.created_at,
          customer_name: r.customer.name,
        })),
      }
    },
  )
}
