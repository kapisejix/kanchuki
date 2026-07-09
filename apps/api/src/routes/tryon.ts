import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@kanchuki/db'
import { createId } from '@paralleldrive/cuid2'
import { getUploadPresignedUrl, triggerTryOn, publicUrl } from '@kanchuki/ai'
import { R2_PATHS } from '@kanchuki/shared'
import { addTryOnJob } from '../jobs/index.js'
import { notFound, planLimitExceeded, validationError } from '../plugins/error-handler.js'

// ─── Schemas ─────────────────────────────────────────────────

const InitiateTryOnSchema = z.object({
  product_id: z.string().min(1),
  customer_photo_r2_key: z.string().min(1),
  measurement_id: z.string().optional(),
})

// ─── Routes ──────────────────────────────────────────────────

export const tryOnRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /try-on/initiate ────────────────────────────────────
  // Shopkeeper-initiated try-on: customer photo already uploaded to R2.
  // Checks credits, creates TryOnJob record, queues processing.
  server.post('/initiate', async (request, reply) => {
    const retailerId = request.retailerId

    // Check try-on credits
    const retailer = await prisma.retailer.findUniqueOrThrow({
      where: { id: retailerId },
      select: { try_on_credits: true },
    })
    if (retailer.try_on_credits <= 0) {
      throw planLimitExceeded('try-on credits')
    }

    const body = InitiateTryOnSchema.safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    const { product_id, customer_photo_r2_key, measurement_id } = body.data

    // Verify product belongs to this retailer
    const product = await prisma.product.findFirst({
      where: { id: product_id, retailer_id: retailerId, deleted_at: null },
      select: { id: true },
    })
    if (!product) throw notFound('Product')

    // Decrement credit
    await prisma.retailer.update({
      where: { id: retailerId },
      data: { try_on_credits: { decrement: 1 } },
    })

    // Create TryOnJob record
    const jobId = createId()
    const tryOnJob = await prisma.tryOnJob.create({
      data: {
        id: jobId,
        retailer_id: retailerId,
        product_id,
        measurement_id: measurement_id ?? null,
        customer_photo_r2_key,
        status: 'QUEUED',
        api_provider: 'catvton',
        queued_at: new Date(),
      },
    })

    // Queue async processing
    await addTryOnJob({
      try_on_job_id: tryOnJob.id,
      retailer_id: retailerId,
      product_id,
      customer_photo_r2_key,
      measurement_id: measurement_id ?? null,
    })

    return reply.status(201).send({
      data: {
        id: tryOnJob.id,
        status: 'QUEUED',
      },
    })
  })

  // ─── POST /try-on/upload-url ──────────────────────────────────
  // Get presigned URL to upload customer photo for try-on.
  // Used by both in-store (shopkeeper app) and remote (customer web).
  server.post('/upload-url', async (request, reply) => {
    const retailerId = request.retailerId

    const body = z
      .object({
        content_type: z.enum(['image/jpeg', 'image/png', 'image/webp'] as const),
        size_bytes: z.number().int().min(1).max(10_000_000),
      })
      .safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    const { content_type, size_bytes } = body.data
    if (size_bytes > 10_000_000) throw validationError('File too large (max 10MB)', 'size_bytes')

    const jobId = createId()
    const ext = content_type === 'image/jpeg' ? 'jpg' : content_type === 'image/png' ? 'png' : 'webp'
    const filename = `customer-${createId()}.${ext}`
    const r2Key = R2_PATHS.tryonInput(jobId)

    const uploadUrl = await getUploadPresignedUrl(r2Key, content_type, 600) // 10 min

    return reply.status(200).send({
      data: {
        upload_url: uploadUrl,
        r2_key: r2Key,
        public_url: publicUrl(r2Key),
        job_id: jobId,
        expires_in: 600,
      },
    })
  })

  // ─── GET /try-on/jobs/:id ─────────────────────────────────────
  // Poll try-on job status and result.
  server.get('/jobs/:id', async (request) => {
    const { id } = request.params as { id: string }
    const retailerId = request.retailerId

    const job = await prisma.tryOnJob.findFirst({
      where: { id, retailer_id: retailerId },
      select: {
        id: true,
        product_id: true,
        status: true,
        result_url: true,
        error_message: true,
        api_job_id: true,
        queued_at: true,
        started_at: true,
        completed_at: true,
        measurement_id: true,
      },
    })
    if (!job) throw notFound('Try-on job')

    return { data: job }
  })

  // ─── GET /try-on/jobs ─────────────────────────────────────────
  // List try-on jobs for this retailer (recent first).
  server.get('/jobs', async (request) => {
    const retailerId = request.retailerId
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(50).default(20),
        cursor: z.string().optional(),
      })
      .safeParse(request.query)
    if (!query.success) throw validationError('Invalid query')

    const { limit, cursor } = query.data

    const jobs = await prisma.tryOnJob.findMany({
      where: {
        retailer_id: retailerId,
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { queued_at: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        product_id: true,
        status: true,
        result_url: true,
        error_message: true,
        queued_at: true,
        completed_at: true,
      },
    })

    const hasMore = jobs.length > limit
    const page = hasMore ? jobs.slice(0, limit) : jobs

    return {
      data: page,
      pagination: { cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null, has_more: hasMore },
    }
  })

  // ─── POST /try-on/remote ─────────────────────────────────────
  // Customer-initiated try-on from the web collection page (no auth).
  // The customer photo is uploaded by the customer, not the shopkeeper.
  // Accepts base64 data URIs — body limit set to 15MB to handle large photos.
  // Note: Auth is skipped in the auth plugin for routes starting with /try-on/remote
  server.post('/remote', { bodyLimit: 15 * 1024 * 1024 }, async (request, reply) => {
    const body = z
      .object({
        collection_slug: z.string().min(1),
        product_id: z.string().min(1),
        customer_photo_url: z.string().url(),
        viewer_token: z.string().optional(),
      })
      .safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    const { collection_slug, product_id, customer_photo_url, viewer_token } = body.data

    // Look up the collection to verify it exists and get the retailer
    const collection = await prisma.collection.findFirst({
      where: { slug: collection_slug, status: 'ACTIVE', deleted_at: null },
      select: { id: true, retailer_id: true },
    })
    if (!collection) throw notFound('Collection')

    // Verify product is in this collection
    const collectionProduct = await prisma.collectionProduct.findFirst({
      where: { collection_id: collection.id, product_id },
    })
    if (!collectionProduct) throw validationError('Product not found in this collection')

    // Check retailer has try-on credits
    const retailer = await prisma.retailer.findUniqueOrThrow({
      where: { id: collection.retailer_id },
      select: { try_on_credits: true },
    })
    if (retailer.try_on_credits <= 0) {
      throw validationError('Retailer has no try-on credits remaining')
    }

    // Decrement credit
    await prisma.retailer.update({
      where: { id: collection.retailer_id },
      data: { try_on_credits: { decrement: 1 } },
    })

    // Create TryOnJob record with customer photo URL (base64 data URL for remote flow)
    const jobId = createId()
    const tryOnJob = await prisma.tryOnJob.create({
      data: {
        id: jobId,
        retailer_id: collection.retailer_id,
        product_id,
        customer_photo_r2_key: customer_photo_url, // store URL directly for remote flow
        status: 'QUEUED',
        api_provider: 'catvton',
        queued_at: new Date(),
      },
    })

    // Queue async processing
    await addTryOnJob({
      try_on_job_id: tryOnJob.id,
      retailer_id: collection.retailer_id,
      product_id,
      customer_photo_r2_key: customer_photo_url, // pass URL directly for remote
      is_remote: true,
    })

    return reply.status(201).send({
      data: {
        id: tryOnJob.id,
        status: 'QUEUED',
      },
    })
  })

  // ─── GET /try-on/remote/:id ───────────────────────────────────
  // Customer polls try-on result (no auth, just job ID).
  server.get('/remote/:id', async (request) => {
    const { id } = request.params as { id: string }

    const job = await prisma.tryOnJob.findUnique({
      where: { id },
      select: {
        id: true,
        product_id: true,
        status: true,
        result_url: true,
        error_message: true,
        queued_at: true,
        completed_at: true,
      },
    })
    if (!job) throw notFound('Try-on job')

    return { data: job }
  })
}
