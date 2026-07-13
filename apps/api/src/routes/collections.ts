import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@kanchuki/db'
import { generateCollectionSlug, addDays } from '@kanchuki/shared'
import { notFound, validationError } from '../plugins/error-handler.js'
import { MATCH_SIMILARITY_THRESHOLD, MIN_CONFIDENCE_FOR_MATCHING } from '@kanchuki/ai'
import { Prisma } from '@kanchuki/db'

const CreateCollectionSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  product_ids: z.array(z.string()).min(1).max(50),
  customer_id: z.string().optional(),
  expires_days: z.number().int().min(1).max(90).default(30),
})

export const collectionRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /collections ──────────────────────────────────────────
  server.post('/', async (request, reply) => {
    const body = CreateCollectionSchema.safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    const { title, description, product_ids, customer_id, expires_days } = body.data
    const retailerId = request.retailerId

    // Verify products belong to this retailer
    const products = await prisma.product.findMany({
      where: { id: { in: product_ids }, retailer_id: retailerId, deleted_at: null },
      select: { id: true },
    })
    if (products.length !== product_ids.length) {
      throw validationError('One or more products not found in your catalog')
    }

    // Verify customer if provided
    if (customer_id) {
      const customer = await prisma.customer.findFirst({
        where: { id: customer_id, retailer_id: retailerId, deleted_at: null },
      })
      if (!customer) throw notFound('Customer')
    }

    // Generate unique slug (retry on collision)
    let slug = generateCollectionSlug(title)
    let attempts = 0
    while (attempts < 5) {
      const exists = await prisma.collection.findUnique({ where: { slug } })
      if (!exists) break
      slug = generateCollectionSlug(title)
      attempts++
    }

    const collection = await prisma.collection.create({
      data: {
        retailer_id: retailerId,
        customer_id: customer_id ?? null,
        title,
        description: description ?? null,
        slug,
        expires_at: addDays(new Date(), expires_days),
        products: {
          create: product_ids.map((product_id, sort_order) => ({ product_id, sort_order })),
        },
      },
      include: {
        products: {
          include: {
            product: {
              include: { photos: { where: { is_primary: true }, take: 1 } },
            },
          },
        },
      },
    })

    const webUrl = `${process.env['WEB_URL'] ?? ''}/c/${slug}`
    return reply.status(201).send({ data: { ...collection, url: webUrl } })
  })

  // ─── GET /collections ───────────────────────────────────────────
  server.get('/', async (request) => {
    const query = z
      .object({
        status: z.enum(['ACTIVE', 'EXPIRED', 'ARCHIVED']).optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      })
      .safeParse(request.query)
    if (!query.success) throw validationError('Invalid query')

    const { status, cursor, limit } = query.data

    const collections = await prisma.collection.findMany({
      where: {
        retailer_id: request.retailerId,
        deleted_at: null,
        ...(status ? { status } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      include: {
        _count: { select: { products: true } },
      },
      orderBy: { created_at: 'desc' },
      take: limit + 1,
    })

    const webBase = process.env['WEB_URL'] ?? ''
    const hasMore = collections.length > limit
    const page = hasMore ? collections.slice(0, limit) : collections

    return {
      data: page.map((c) => ({
        ...c,
        product_count: c._count.products,
        url: `${webBase}/c/${c.slug}`,
      })),
      pagination: { cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null, has_more: hasMore },
    }
  })

  // ─── GET /collections/:id ───────────────────────────────────────
  server.get('/:id', async (request) => {
    const { id } = request.params as { id: string }

    const collection = await prisma.collection.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
      include: {
        products: {
          orderBy: { sort_order: 'asc' },
          include: {
            product: {
              include: { photos: { where: { is_primary: true }, take: 1 }, section: { select: { name: true } } },
            },
          },
        },
        enquiries: { orderBy: { created_at: 'desc' }, take: 50 },
        _count: { select: { views: true } },
      },
    })
    if (!collection) throw notFound('Collection')

    return {
      data: {
        ...collection,
        url: `${process.env['WEB_URL'] ?? ''}/c/${collection.slug}`,
      },
    }
  })

  // ─── GET /collections/:id/analytics ────────────────────────────
  server.get('/:id/analytics', async (request) => {
    const { id } = request.params as { id: string }

    const collection = await prisma.collection.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
      select: {
        id: true, title: true, slug: true,
        view_count: true, unique_viewer_count: true,
        enquiry_count: true, favorite_count: true,
      },
    })
    if (!collection) throw notFound('Collection')

    // Top products by enquiry
    const topProducts = await prisma.collectionEnquiry.groupBy({
      by: ['product_id'],
      where: { collection_id: id },
      _count: { product_id: true },
      orderBy: { _count: { product_id: 'desc' } },
      take: 5,
    })

    return { data: { ...collection, top_products: topProducts } }
  })

  // ─── PATCH /collections/:id/enquiries/:enquiryId ───────────────
  server.patch('/:id/enquiries/:enquiryId', async (request) => {
    const { id, enquiryId } = request.params as { id: string; enquiryId: string }

    const body = z
      .object({ status: z.enum(['NEW', 'SEEN', 'REPLIED', 'CLOSED']) })
      .safeParse(request.body)
    if (!body.success) throw validationError('Invalid status')

    // Verify collection belongs to retailer
    const collection = await prisma.collection.findFirst({
      where: { id, retailer_id: request.retailerId },
    })
    if (!collection) throw notFound('Collection')

    const updated = await prisma.collectionEnquiry.update({
      where: { id: enquiryId },
      data: { status: body.data.status },
    })
    return { data: updated }
  })

  // ─── POST /collections/auto-suggest ─────────────────────────────
  // AI-auto-build a personalized collection for a specific customer
  // based on their Fashion DNA preference vector.
  server.post('/auto-suggest', async (request, reply) => {
    const body = z
      .object({
        customer_id: z.string(),
        title: z.string().min(1).max(200).optional(),
        limit: z.number().int().min(1).max(24).default(12),
        category: z.string().optional(),
        price_max: z.coerce.number().int().min(0).optional(),
      })
      .safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    const { customer_id, title, limit, category, price_max } = body.data
    const retailerId = request.retailerId

    // Verify customer belongs to this retailer
    const customer = await prisma.customer.findFirst({
      where: { id: customer_id, retailer_id: retailerId, deleted_at: null },
    })
    if (!customer) throw notFound('Customer')

    let productIds: string[] = []
    let dna_used = false

    // Step 1: Try DNA-guided matching
    // preference_vector is Unsupported("vector(1536)") — use $queryRaw to read it
    type DNARow = {
      preference_vector: string | null
      confidence_score: number | null
    }
    const dnaRows = await prisma.$queryRaw<DNARow[]>`
      SELECT
        preference_vector::text,
        confidence_score
      FROM customer_fashion_dna
      WHERE customer_id = ${customer_id}
      LIMIT 1
    `
    const dnaRow = dnaRows[0]

    if (dnaRow?.preference_vector && (dnaRow.confidence_score ?? 0) >= MIN_CONFIDENCE_FOR_MATCHING) {
      dna_used = true

      type RawMatchRow = { id: string; match_score: number }

      const conditions = [
        `p.retailer_id = '${retailerId}'`,
        `p.deleted_at IS NULL`,
        `p.status = 'AVAILABLE'`,
      ]
      if (price_max != null) conditions.push(`p.price_min <= ${price_max}`)
      if (category) conditions.push(`p.category = '${category.replace(/'/g, "''")}'`)

      const rows = await prisma.$queryRaw<RawMatchRow[]>`
        SELECT
          p.id,
          (1 - (pe.embedding <=> ${Prisma.raw(`'${dnaRow.preference_vector}'`)})) AS match_score
        FROM products p
        JOIN product_embeddings pe ON p.id = pe.product_id
        WHERE ${Prisma.raw(conditions.join(' AND '))}
        ORDER BY match_score DESC
        LIMIT ${limit * 2}
      `

      productIds = rows
        .filter((r) => Number(r.match_score) > MATCH_SIMILARITY_THRESHOLD)
        .slice(0, limit)
        .map((r) => r.id)
    }

    // Fall back to explicit preferences
    if (productIds.length === 0) {
      const prefColors = customer.pref_colors ?? []
      const prefOccasions = customer.pref_occasions ?? []
      const prefFabrics = customer.pref_fabrics ?? []

      const orConditions: Prisma.ProductWhereInput[] = []
      if (prefColors.length > 0) {
        orConditions.push({ primary_color: { in: prefColors } })
        orConditions.push({ secondary_colors: { hasSome: prefColors } })
      }
      if (prefOccasions.length > 0) orConditions.push({ occasions: { hasSome: prefOccasions } })
      if (prefFabrics.length > 0) orConditions.push({ fabric_estimate: { in: prefFabrics } })

      const fallbackProducts = await prisma.product.findMany({
        where: {
          retailer_id: retailerId,
          deleted_at: null,
          status: 'AVAILABLE',
          ...(orConditions.length > 0 ? { OR: orConditions } : {}),
          ...(price_max != null ? { price_min: { lte: price_max } } : {}),
          ...(category ? { category } : {}),
        },
        take: limit,
        orderBy: { created_at: 'desc' },
        select: { id: true },
      })
      productIds = fallbackProducts.map((p) => p.id)
    }

    if (productIds.length === 0) {
      // Not enough signal for auto-suggest — return empty result
      return reply.status(200).send({ data: { collection: null, reason: 'insufficient_preference_data' } })
    }

    // Step 2: Create the collection with matched products
    const collectionTitle = title ?? `AI Picks for ${customer.name}`

    // Generate unique slug
    let slug = generateCollectionSlug(collectionTitle)
    let attempts = 0
    while (attempts < 5) {
      const exists = await prisma.collection.findUnique({ where: { slug } })
      if (!exists) break
      slug = generateCollectionSlug(collectionTitle)
      attempts++
    }

    const collection = await prisma.collection.create({
      data: {
        retailer_id: retailerId,
        customer_id,
        title: collectionTitle,
        description: `AI-curated collection for ${customer.name} based on their preferences`,
        slug,
        expires_at: addDays(new Date(), 30),
        products: {
          create: productIds.map((product_id, sort_order) => ({ product_id, sort_order })),
        },
      },
      include: {
        products: {
          include: {
            product: {
              include: { photos: { where: { is_primary: true }, take: 1 } },
            },
          },
        },
      },
    })

    const webUrl = `${process.env['WEB_URL'] ?? ''}/c/${slug}`
    return reply.status(201).send({
      data: {
        ...collection,
        url: webUrl,
        product_count: productIds.length,
        dna_used,
      },
    })
  })

  // ─── DELETE /collections/:id ────────────────────────────────────
  server.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const existing = await prisma.collection.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    })
    if (!existing) throw notFound('Collection')

    await prisma.collection.update({
      where: { id },
      data: { deleted_at: new Date(), status: 'ARCHIVED' },
    })
    return reply.status(204).send()
  })
}
