import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma, Prisma } from '@kanchuki/db'
import { createId } from '@paralleldrive/cuid2'
import { getUploadPresignedUrl, publicUrl } from '@kanchuki/ai'
import { R2_PATHS } from '@kanchuki/shared'
import { addTaggingJob, addEmbeddingJob } from '../jobs/index.js'
import { notFound, planLimitExceeded, validationError, forbidden } from '../plugins/error-handler.js'

// ─── On-Demand ISR Revalidation ───────────────────────────────────
// After a product status change, purge the ISR cache for every collection
// link page that includes this product, so the badge updates instantly.

const WEB_URL = process.env['WEB_URL'] ?? ''
const REVALIDATION_SECRET = process.env['REVALIDATION_SECRET'] ?? ''

async function revalidateCollectionsForProduct(productId: string): Promise<void> {
  if (!WEB_URL || !REVALIDATION_SECRET) return // not configured — skip

  try {
    // Find all active collections containing this product
    const collectionProducts = await prisma.collectionProduct.findMany({
      where: { product_id: productId },
      include: {
        collection: {
          select: { slug: true },
        },
      },
    })

    const slugs = [...new Set(collectionProducts.map((cp) => cp.collection.slug))]
    if (slugs.length === 0) return

    // Revalidate each collection page (fire-and-forget — batch in parallel)
    await Promise.allSettled(
      slugs.map((slug) =>
        fetch(`${WEB_URL}/api/revalidate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret: REVALIDATION_SECRET, collection_slug: slug }),
          signal: AbortSignal.timeout(5000), // 5s timeout per request
        }),
      ),
    )
  } catch {
    // Revalidation is best-effort — never crash the status update
  }
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number]

const CreateProductSchema = z.object({
  photo_r2_key: z.string().min(1),
  photo_url: z.string().url(),
  back_photo_r2_key: z.string().min(1).optional(),
  back_photo_url: z.string().url().optional(),
  price_min: z.number().int().min(0).max(100_000_000).optional(), // paise
  price_max: z.number().int().min(0).max(100_000_000).optional(),
  mrp: z.number().int().min(0).max(100_000_000).optional(),
  category: z.string().max(100).optional(),
  product_type: z.string().max(50).optional(),
  primary_color: z.string().max(50).optional(),
  secondary_colors: z.array(z.string().max(50)).max(10).optional(),
  fabric_estimate: z.string().max(100).optional(),
  pattern: z.string().max(100).optional(),
  embellishments: z.array(z.string().max(100)).max(10).optional(),
  neck_style: z.string().max(100).optional(),
  sleeve_type: z.string().max(100).optional(),
  occasions: z.array(z.string().max(100)).max(10).optional(),
  search_tags: z.array(z.string().max(100)).max(20).optional(),
  section_id: z.string().optional(),
  location_notes: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['AVAILABLE', 'SOLD', 'RESERVED', 'NOT_SURE']).optional(),
})

const UpdateProductSchema = CreateProductSchema.partial().omit({
  photo_r2_key: true,
  photo_url: true,
  back_photo_r2_key: true,
  back_photo_url: true,
})

const ListProductsQuerySchema = z.object({
  status: z.enum(['AVAILABLE', 'SOLD', 'RESERVED', 'NOT_SURE']).optional(),
  category: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const productRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /products/upload-url ──────────────────────────────────
  server.post('/upload-url', async (request, reply) => {
    const body = z
      .object({
        filename: z.string().min(1).max(255),
        content_type: z.enum(ALLOWED_MIME_TYPES),
        size_bytes: z.number().int().min(1).max(10_000_000), // max 10MB
      })
      .safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    const { content_type, size_bytes } = body.data
    if (size_bytes > 10_000_000) throw validationError('File too large (max 10MB)', 'size_bytes')

    const productId = createId()
    const ext = content_type === 'image/jpeg' ? 'jpg' : content_type === 'image/png' ? 'png' : 'webp'
    const filename = `${createId()}.${ext}`
    const r2Key = R2_PATHS.productPhoto(request.retailerId, productId, filename)

    const uploadUrl = await getUploadPresignedUrl(r2Key, content_type, 300)

    return reply.status(200).send({
      data: {
        upload_url: uploadUrl,
        r2_key: r2Key,
        public_url: publicUrl(r2Key),
        product_id: productId, // pre-reserved for product creation
        expires_in: 300,
      },
    })
  })

  // ─── POST /products ─────────────────────────────────────────────
  server.post('/', async (request, reply) => {
    const retailerId = request.retailerId

    // Check plan limits
    const retailer = await prisma.retailer.findUniqueOrThrow({
      where: { id: retailerId },
      select: { max_products: true },
    })
    const currentCount = await prisma.product.count({
      where: { retailer_id: retailerId, deleted_at: null },
    })
    if (currentCount >= retailer.max_products) {
      throw planLimitExceeded('products')
    }

    const body = CreateProductSchema.safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    const { photo_r2_key, photo_url, back_photo_r2_key, back_photo_url, metadata, ...rest } =
      body.data

    // Verify section belongs to this retailer
    if (rest.section_id) {
      const section = await prisma.storeSection.findFirst({
        where: { id: rest.section_id, retailer_id: retailerId },
      })
      if (!section) throw forbidden('Section does not belong to your store')
    }

    const product = await prisma.product.create({
      data: {
        retailer_id: retailerId,
        metadata: metadata !== undefined ? (metadata as Prisma.InputJsonValue) : undefined,
        ...rest,
        photos: {
          create: [
            { url: photo_url, r2_key: photo_r2_key, is_primary: true, retailer_id: retailerId },
            ...(back_photo_url && back_photo_r2_key
              ? [
                  {
                    url: back_photo_url,
                    r2_key: back_photo_r2_key,
                    is_primary: false,
                    sort_order: 1,
                    retailer_id: retailerId,
                  },
                ]
              : []),
          ],
        },
      },
      include: { photos: true, section: { select: { name: true } } },
    })

    // Queue AI tagging job (async — don't block response)
    await addTaggingJob({
      product_id: product.id,
      retailer_id: retailerId,
      photo_url,
      r2_key: photo_r2_key,
      back_photo_url,
    })

    return reply.status(201).send({ data: product })
  })

  // ─── GET /products ──────────────────────────────────────────────
  server.get('/', async (request) => {
    const query = ListProductsQuerySchema.safeParse(request.query)
    if (!query.success) throw validationError(query.error.issues[0]?.message ?? 'Invalid query')

    const { status, category, cursor, limit } = query.data

    const products = await prisma.product.findMany({
      where: {
        retailer_id: request.retailerId,
        deleted_at: null,
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      include: {
        photos: { where: { is_primary: true }, take: 1 },
        section: { select: { name: true } },
      },
      orderBy: { created_at: 'desc' },
      take: limit + 1,
    })

    const hasMore = products.length > limit
    const page = hasMore ? products.slice(0, limit) : products

    return {
      data: page.map((p) => ({
        ...p,
        primary_photo_url: p.photos[0]?.url ?? null,
        photos: undefined, // strip raw photos, use primary_photo_url
      })),
      pagination: {
        cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        has_more: hasMore,
      },
    }
  })

  // ─── GET /products/:id ──────────────────────────────────────────
  server.get('/:id', async (request) => {
    const { id } = request.params as { id: string }

    const product = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
      include: {
        photos: { orderBy: { sort_order: 'asc' } },
        variants: true,
        section: { select: { name: true } },
      },
    })
    if (!product) throw notFound('Product')

    return { data: product }
  })

  // ─── PUT /products/:id ──────────────────────────────────────────
  server.put('/:id', async (request) => {
    const { id } = request.params as { id: string }

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    })
    if (!existing) throw notFound('Product')

    const body = UpdateProductSchema.safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    const { metadata, ...rest } = body.data
    const updated = await prisma.product.update({
      where: { id },
      data: { metadata: metadata !== undefined ? (metadata as Prisma.InputJsonValue) : undefined, ...rest },
      include: { photos: true, section: { select: { name: true } } },
    })

    // Re-embed if searchable fields changed
    const embeddingFields = ['category', 'primary_color', 'fabric_estimate', 'occasions', 'search_tags']
    const needsReembed = embeddingFields.some((f) => f in body.data)
    if (needsReembed) {
      await addEmbeddingJob({ product_id: id, retailer_id: request.retailerId })
    }

    return { data: updated }
  })

  // ─── PATCH /products/:id/status ─────────────────────────────────
  server.patch('/:id/status', async (request) => {
    const { id } = request.params as { id: string }
    const body = z
      .object({ status: z.enum(['AVAILABLE', 'SOLD', 'RESERVED', 'NOT_SURE']) })
      .safeParse(request.body)
    if (!body.success) throw validationError('Invalid status')

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    })
    if (!existing) throw notFound('Product')

    const updated = await prisma.product.update({
      where: { id },
      data: { status: body.data.status },
      select: { id: true, status: true },
    })

    // Fire-and-forget: revalidate collection link pages that include this product
    // so status changes (AVAILABLE → SOLD / RESERVED) appear instantly instead of
    // waiting up to 60s for ISR revalidation.
    void revalidateCollectionsForProduct(id)

    return { data: updated }
  })

  // ─── DELETE /products/:id ───────────────────────────────────────
  server.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    })
    if (!existing) throw notFound('Product')

    await prisma.product.update({
      where: { id },
      data: { deleted_at: new Date() },
    })
    return reply.status(204).send()
  })

  // ─── POST /products/:id/photos ──────────────────────────────────
  server.post('/:id/photos', async (request, reply) => {
    const { id } = request.params as { id: string }

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
      include: { _count: { select: { photos: true } } },
    })
    if (!existing) throw notFound('Product')
    if (existing._count.photos >= 10) throw validationError('Maximum 10 photos per product')

    const body = z
      .object({
        r2_key: z.string().min(1),
        url: z.string().url(),
        is_primary: z.boolean().optional(),
        content_type: z.enum(ALLOWED_MIME_TYPES as unknown as [AllowedMime, ...AllowedMime[]]),
      })
      .safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    const photo = await prisma.productPhoto.create({
      data: {
        product_id: id,
        retailer_id: request.retailerId,
        r2_key: body.data.r2_key,
        url: body.data.url,
        is_primary: body.data.is_primary ?? false,
      },
    })
    return reply.status(201).send({ data: photo })
  })

  // ─── POST /products/:id/variants ─────────────────────────────────
  // Same design, different color — a real photo per color, never an AI recolor.
  server.post('/:id/variants', async (request, reply) => {
    const { id } = request.params as { id: string }

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
      include: { _count: { select: { variants: true } } },
    })
    if (!existing) throw notFound('Product')
    if (existing._count.variants >= 20) throw validationError('Maximum 20 color variants per product')

    const body = z
      .object({
        color: z.string().min(1).max(50),
        r2_key: z.string().min(1),
        url: z.string().url(),
        price_override: z.number().int().min(0).max(100_000_000).optional(),
      })
      .safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    const variant = await prisma.productVariant.create({
      data: {
        product_id: id,
        retailer_id: request.retailerId,
        color: body.data.color,
        photo_url: body.data.url,
        price_override: body.data.price_override,
        is_ai_preview: false,
      },
    })
    return reply.status(201).send({ data: variant })
  })

  // ─── GET /products/:id/variants ──────────────────────────────────
  server.get('/:id/variants', async (request) => {
    const { id } = request.params as { id: string }

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    })
    if (!existing) throw notFound('Product')

    const variants = await prisma.productVariant.findMany({
      where: { product_id: id, retailer_id: request.retailerId },
      orderBy: { created_at: 'asc' },
    })
    return { data: variants }
  })

  // ─── DELETE /products/:id/variants/:variantId ────────────────────
  server.delete('/:id/variants/:variantId', async (request, reply) => {
    const { id, variantId } = request.params as { id: string; variantId: string }

    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, product_id: id, retailer_id: request.retailerId },
    })
    if (!variant) throw notFound('Variant')

    await prisma.productVariant.delete({ where: { id: variantId } })
    return reply.status(204).send()
  })
}
