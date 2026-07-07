import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@kanchuki/db'
import { notFound, validationError } from '../plugins/error-handler.js'

const UpdateRetailerSchema = z.object({
  shop_name: z.string().min(1).max(200).optional(),
  owner_name: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  gstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format')
    .optional(),
  categories: z.array(z.string().max(50)).max(10).optional(),
})

const StoreSectionSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['rack', 'shelf', 'section', 'floor', 'box']),
  parent_id: z.string().optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
})

export const retailerRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /retailers/me ──────────────────────────────────────────
  server.get('/me', async (request) => {
    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId, deleted_at: null },
    })
    if (!retailer) throw notFound('Retailer')

    const [productCount, customerCount] = await Promise.all([
      prisma.product.count({
        where: { retailer_id: request.retailerId, deleted_at: null },
      }),
      prisma.customer.count({
        where: { retailer_id: request.retailerId, deleted_at: null },
      }),
    ])

    return {
      data: {
        ...retailer,
        usage: { product_count: productCount, customer_count: customerCount },
      },
    }
  })

  // ─── PUT /retailers/me ──────────────────────────────────────────
  server.put('/me', async (request) => {
    const body = UpdateRetailerSchema.safeParse(request.body)
    if (!body.success) {
      throw validationError(body.error.issues[0]?.message ?? 'Validation failed')
    }

    const updated = await prisma.retailer.update({
      where: { id: request.retailerId },
      data: body.data,
    })

    return { data: updated }
  })

  // ─── GET /retailers/me/stats ────────────────────────────────────
  server.get('/me/stats', async (request) => {
    const retailerId = request.retailerId
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [
      totalProducts,
      totalCustomers,
      activeCollections,
      monthViews,
      monthEnquiries,
      topViewed,
      topEnquired,
    ] = await Promise.all([
      prisma.product.count({ where: { retailer_id: retailerId, deleted_at: null, status: 'AVAILABLE' } }),
      prisma.customer.count({ where: { retailer_id: retailerId, deleted_at: null } }),
      prisma.collection.count({ where: { retailer_id: retailerId, status: 'ACTIVE', deleted_at: null } }),
      prisma.collectionView.count({
        where: { retailer_id: retailerId, created_at: { gte: monthStart } },
      }),
      prisma.collectionEnquiry.count({
        where: { retailer_id: retailerId, created_at: { gte: monthStart } },
      }),
      prisma.customerInteraction.groupBy({
        by: ['product_id'],
        where: { retailer_id: retailerId, type: 'view', product_id: { not: null } },
        _count: { product_id: true },
        orderBy: { _count: { product_id: 'desc' } },
        take: 5,
      }),
      prisma.customerInteraction.groupBy({
        by: ['product_id'],
        where: { retailer_id: retailerId, type: 'enquiry', product_id: { not: null } },
        _count: { product_id: true },
        orderBy: { _count: { product_id: 'desc' } },
        take: 5,
      }),
    ])

    const productIds = [...topViewed, ...topEnquired].map((g) => g.product_id as string)
    const products = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: {
            id: true,
            category: true,
            primary_color: true,
            photos: { where: { is_primary: true }, select: { url: true }, take: 1 },
          },
        })
      : []
    const productMap = new Map(
      products.map((p) => [
        p.id,
        { id: p.id, category: p.category, primary_color: p.primary_color, photo_url: p.photos[0]?.url ?? null },
      ]),
    )

    const toRanked = (groups: typeof topViewed) =>
      groups
        .filter((g) => productMap.has(g.product_id as string))
        .map((g) => ({ product: productMap.get(g.product_id as string), count: g._count.product_id }))

    return {
      data: {
        total_products_available: totalProducts,
        total_customers: totalCustomers,
        active_collections: activeCollections,
        views_this_month: monthViews,
        enquiries_this_month: monthEnquiries,
        top_viewed_products: toRanked(topViewed),
        top_enquired_products: toRanked(topEnquired),
      },
    }
  })

  // ─── GET /retailers/me/plan ─────────────────────────────────────
  server.get('/me/plan', async (request) => {
    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: {
        plan: true,
        plan_status: true,
        trial_ends_at: true,
        plan_expires_at: true,
        max_products: true,
        max_customers: true,
        try_on_credits: true,
      },
    })
    if (!retailer) throw notFound('Retailer')
    return { data: retailer }
  })

  // ─── PATCH /retailers/me/onboarding ────────────────────────────
  server.patch('/me/onboarding', async (request) => {
    const body = z
      .object({
        step: z.number().int().min(0).max(6),
        completed: z.boolean().optional(),
      })
      .safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    const updated = await prisma.retailer.update({
      where: { id: request.retailerId },
      data: {
        onboarding_step: body.data.step,
        ...(body.data.completed === true ? { onboarding_completed: true } : {}),
      },
      select: { onboarding_step: true, onboarding_completed: true },
    })
    return { data: updated }
  })

  // ─── Store Sections ─────────────────────────────────────────────

  server.get('/me/sections', async (request) => {
    const sections = await prisma.storeSection.findMany({
      where: { retailer_id: request.retailerId },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    })
    return { data: sections }
  })

  server.post('/me/sections', async (request, reply) => {
    const body = StoreSectionSchema.safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    const section = await prisma.storeSection.create({
      data: { retailer_id: request.retailerId, ...body.data },
    })
    return reply.status(201).send({ data: section })
  })

  server.put('/me/sections/:id', async (request) => {
    const { id } = request.params as { id: string }
    const body = StoreSectionSchema.partial().safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    const existing = await prisma.storeSection.findFirst({
      where: { id, retailer_id: request.retailerId },
    })
    if (!existing) throw notFound('Section')

    const updated = await prisma.storeSection.update({
      where: { id },
      data: body.data,
    })
    return { data: updated }
  })

  server.delete('/me/sections/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const inUse = await prisma.product.count({
      where: { section_id: id, retailer_id: request.retailerId, deleted_at: null },
    })
    if (inUse > 0) {
      throw validationError('Section has products assigned. Reassign them first.')
    }

    await prisma.storeSection.delete({ where: { id } })
    return reply.status(204).send()
  })
}
