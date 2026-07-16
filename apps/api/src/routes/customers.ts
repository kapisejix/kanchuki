import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createHash } from 'crypto'
import { prisma, Prisma } from '@kanchuki/db'
import { normalizeIndianPhone, R2_PATHS } from '@kanchuki/shared'
import { getUploadPresignedUrl } from '@kanchuki/ai'
import { notFound, planLimitExceeded, validationError } from '../plugins/error-handler.js'
import { addMeasurementJob, addFashionDNAJob } from '../jobs/index.js'
import { MATCH_SIMILARITY_THRESHOLD, MIN_CONFIDENCE_FOR_MATCHING, formatPreferenceVector } from '@kanchuki/ai'

const ManualMeasurementSchema = z.object({
  height_cm: z.number().min(50).max(250),
  bust_cm: z.number().min(20).max(200).optional(),
  waist_cm: z.number().min(20).max(200).optional(),
  hip_cm: z.number().min(20).max(200).optional(),
  pant_waist_cm: z.number().min(20).max(200).optional(),
  pant_hip_cm: z.number().min(20).max(200).optional(),
  inseam_cm: z.number().min(20).max(150).optional(),
})

const PhotoMeasurementInitSchema = z.object({
  height_cm: z.number().min(50).max(250),
  consent_given: z.literal(true, {
    message: 'Customer consent is required before capturing measurement photos',
  }),
})

const CustomerSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(10).max(15),
  email: z.string().email().max(320).optional(),
  address_line1: z.string().max(200).optional(),
  address_line2: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().max(10).optional(),
  pref_colors: z.array(z.string().max(50)).max(20).optional().default([]),
  pref_styles: z.array(z.string().max(100)).max(10).optional().default([]),
  pref_fabrics: z.array(z.string().max(100)).max(10).optional().default([]),
  pref_occasions: z.array(z.string().max(100)).max(10).optional().default([]),
  budget_min: z.number().int().min(0).max(100_000_000).optional(),
  budget_max: z.number().int().min(0).max(100_000_000).optional(),
  notes: z.string().max(2000).optional(),
})

export const customerRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /customers ────────────────────────────────────────────
  server.post('/', async (request, reply) => {
    const retailerId = request.retailerId

    const retailer = await prisma.retailer.findUniqueOrThrow({
      where: { id: retailerId },
      select: { max_customers: true },
    })
    const count = await prisma.customer.count({
      where: { retailer_id: retailerId, deleted_at: null },
    })
    if (count >= retailer.max_customers) throw planLimitExceeded('customers')

    const body = CustomerSchema.safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    const normalizedPhone = normalizeIndianPhone(body.data.phone)
    const phone_hash = createHash('sha256').update(normalizedPhone).digest('hex')

    // Check for duplicate
    const existing = await prisma.customer.findFirst({
      where: { retailer_id: retailerId, phone: normalizedPhone, deleted_at: null },
    })
    if (existing) throw validationError('A customer with this phone number already exists', 'phone')

    const customer = await prisma.customer.create({
      data: {
        retailer_id: retailerId,
        ...body.data,
        phone: normalizedPhone,
        phone_hash,
      },
    })
    return reply.status(201).send({ data: customer })
  })

  // ─── GET /customers ─────────────────────────────────────────────
  server.get('/', async (request) => {
    const query = z
      .object({
        search: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .safeParse(request.query)
    if (!query.success) throw validationError('Invalid query')

    const { search, cursor, limit } = query.data

    const customers = await prisma.customer.findMany({
      where: {
        retailer_id: request.retailerId,
        deleted_at: null,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
              ],
            }
          : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { name: 'asc' },
      take: limit + 1,
    })

    const hasMore = customers.length > limit
    return {
      data: hasMore ? customers.slice(0, limit) : customers,
      pagination: {
        cursor: hasMore ? (customers[limit - 1]?.id ?? null) : null,
        has_more: hasMore,
      },
    }
  })

  // ─── GET /customers/:id ─────────────────────────────────────────
  server.get('/:id', async (request) => {
    const { id } = request.params as { id: string }

    const customer = await prisma.customer.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
      include: {
        interactions: {
          orderBy: { created_at: 'desc' },
          take: 20,
          include: { product: { select: { id: true, primary_color: true, category: true } } },
        },
        fashion_dna: {
          select: {
            color_affinities: true,
            style_affinities: true,
            confidence_score: true,
            interaction_count: true,
          },
        },
      },
    })
    if (!customer) throw notFound('Customer')

    return { data: customer }
  })

  // ─── PUT /customers/:id ─────────────────────────────────────────
  server.put('/:id', async (request) => {
    const { id } = request.params as { id: string }

    const existing = await prisma.customer.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    })
    if (!existing) throw notFound('Customer')

    const body = CustomerSchema.partial().safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    // Normalize phone if changed
    const data = body.data.phone
      ? {
          ...body.data,
          phone: normalizeIndianPhone(body.data.phone),
          phone_hash: createHash('sha256')
            .update(normalizeIndianPhone(body.data.phone))
            .digest('hex'),
        }
      : body.data

    const updated = await prisma.customer.update({ where: { id }, data })
    return { data: updated }
  })

  // ─── DELETE /customers/:id ──────────────────────────────────────
  server.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const existing = await prisma.customer.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    })
    if (!existing) throw notFound('Customer')

    await prisma.customer.update({
      where: { id },
      data: { deleted_at: new Date() },
    })
    return reply.status(204).send()
  })

  // ─── POST /customers/:id/interactions ──────────────────────────
  server.post('/:id/interactions', async (request, reply) => {
    const { id } = request.params as { id: string }

    const existing = await prisma.customer.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    })
    if (!existing) throw notFound('Customer')

    const body = z
      .object({
        type: z.enum(['view', 'favorite', 'enquiry', 'purchase', 'try_on']),
        product_id: z.string().optional(),
        collection_id: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    const { metadata, ...rest } = body.data
    const interaction = await prisma.customerInteraction.create({
      data: {
        customer_id: id,
        retailer_id: request.retailerId,
        ...rest,
        metadata: metadata !== undefined ? (metadata as Prisma.InputJsonValue) : undefined,
      },
    })

    // Update last visit if purchase
    if (body.data.type === 'purchase') {
      await prisma.customer.update({
        where: { id },
        data: { last_visit_at: new Date() },
      })
    }

    // Queue Fashion DNA update — interaction activity changes preferences
    await addFashionDNAJob({
      customer_id: id,
      retailer_id: request.retailerId,
    }).catch(() => {
      // Non-critical — DNA update is best-effort
    })

    return reply.status(201).send({ data: interaction })
  })

  // ─── POST /customers/:id/measurements ───────────────────────────
  // Manual (inch-tape) path — writes straight to CustomerMeasurement.
  server.post('/:id/measurements', async (request, reply) => {
    const { id } = request.params as { id: string }

    const existing = await prisma.customer.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    })
    if (!existing) throw notFound('Customer')

    const body = ManualMeasurementSchema.safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    const measurement = await prisma.customerMeasurement.create({
      data: {
        customer_id: id,
        retailer_id: request.retailerId,
        source: 'MANUAL',
        ...body.data,
      },
    })
    return reply.status(201).send({ data: measurement })
  })

  // ─── POST /customers/:id/measurements/photo-upload-url ──────────
  // Photo path step 1: reserve a measurement row + presigned front/back PUT URLs.
  server.post('/:id/measurements/photo-upload-url', async (request, reply) => {
    const { id } = request.params as { id: string }

    const existing = await prisma.customer.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    })
    if (!existing) throw notFound('Customer')

    const body = PhotoMeasurementInitSchema.safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    const measurement = await prisma.customerMeasurement.create({
      data: {
        customer_id: id,
        retailer_id: request.retailerId,
        source: 'PHOTO',
        height_cm: body.data.height_cm,
        consent_given: true,
        consent_at: new Date(),
      },
    })

    const front_r2_key = R2_PATHS.measurementPhoto(id, measurement.id, 'front')
    const back_r2_key = R2_PATHS.measurementPhoto(id, measurement.id, 'back')

    let front_upload_url: string
    let back_upload_url: string
    try {
      ;[front_upload_url, back_upload_url] = await Promise.all([
        getUploadPresignedUrl(front_r2_key, 'image/jpeg', 300),
        getUploadPresignedUrl(back_r2_key, 'image/jpeg', 300),
      ])
    } catch {
      // Clean up the measurement row if presigned URL generation fails
      await prisma.customerMeasurement.delete({ where: { id: measurement.id } }).catch(() => {})
      throw validationError('Photo storage is not configured. Please contact support.')
    }

    await prisma.customerMeasurement.update({
      where: { id: measurement.id },
      data: { front_photo_r2_key: front_r2_key, back_photo_r2_key: back_r2_key },
    })

    return reply.status(201).send({
      data: {
        measurement_id: measurement.id,
        front_upload_url,
        back_upload_url,
        expires_in: 300,
      },
    })
  })

  // ─── POST /customers/:id/measurements/:measurementId/extract ────
  // Photo path step 2: front+back uploaded to R2 — queue MediaPipe extraction.
  server.post('/:id/measurements/:measurementId/extract', async (request, reply) => {
    const { id, measurementId } = request.params as { id: string; measurementId: string }

    const measurement = await prisma.customerMeasurement.findFirst({
      where: { id: measurementId, customer_id: id, retailer_id: request.retailerId },
    })
    if (!measurement) throw notFound('Measurement')
    if (measurement.source !== 'PHOTO' || !measurement.front_photo_r2_key || !measurement.back_photo_r2_key) {
      throw validationError('Measurement has no pending photo upload')
    }
    if (measurement.photo_deleted_at) {
      throw validationError('Photos for this measurement were already processed')
    }

    await addMeasurementJob({
      measurement_id: measurement.id,
      front_r2_key: measurement.front_photo_r2_key,
      back_r2_key: measurement.back_photo_r2_key,
      height_cm: measurement.height_cm,
    })

    return reply.status(202).send({ data: { measurement_id: measurement.id, status: 'queued' } })
  })

  // ─── GET /customers/:id/measurements ─────────────────────────────
  server.get('/:id/measurements', async (request) => {
    const { id } = request.params as { id: string }

    const existing = await prisma.customer.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    })
    if (!existing) throw notFound('Customer')

    const measurements = await prisma.customerMeasurement.findMany({
      where: { customer_id: id, retailer_id: request.retailerId },
      orderBy: { created_at: 'desc' },
      take: 10,
    })
    return { data: measurements }
  })

  // ─── GET /customers/:id/matches ───────────────────────────────────
  // AI-matched products based on Fashion DNA preference vector.
  // Returns top 12 products sorted by match_score.
  // Falls back to explicit preference matching if DNA confidence is low.
  server.get('/:id/matches', async (request) => {
    const { id } = request.params as { id: string }
    const retailerId = request.retailerId

    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(50).default(12),
        category: z.string().optional(),
        price_max: z.coerce.number().int().min(0).optional(),
      })
      .safeParse(request.query)
    if (!query.success) throw validationError('Invalid query')

    const { limit, category, price_max } = query.data

    // Also verify customer belongs to this retailer
    const customer = await prisma.customer.findFirst({
      where: { id, retailer_id: retailerId, deleted_at: null },
    })
    if (!customer) throw notFound('Customer')

    let matchedProductIds: string[] = []
    let dna_used = false
    let dna_confidence = 0

    // Step 1: Check if customer has a DNA record with enough confidence
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
      WHERE customer_id = ${id}
      LIMIT 1
    `
    const dnaRow = dnaRows[0]
    dna_confidence = dnaRow?.confidence_score ?? 0

    if (dnaRow?.preference_vector && dna_confidence >= MIN_CONFIDENCE_FOR_MATCHING) {
      // ── Path A: DNA-guided vector similarity search ──────────────
      dna_used = true

      type RawMatchRow = {
        id: string
        match_score: number
      }

      const conditions = [
        Prisma.sql`p.retailer_id = ${retailerId}`,
        Prisma.sql`p.deleted_at IS NULL`,
        Prisma.sql`p.status = 'AVAILABLE'`,
      ]
      if (price_max != null) conditions.push(Prisma.sql`p.price_min <= ${price_max}`)
      if (category) conditions.push(Prisma.sql`p.category = ${category}`)

      const rows = await prisma.$queryRaw<RawMatchRow[]>`
        SELECT
          p.id,
          (1 - (pe.embedding <=> ${dnaRow.preference_vector}::vector)) AS match_score
        FROM products p
        JOIN product_embeddings pe ON p.id = pe.product_id
        WHERE ${Prisma.join(conditions, ' AND ')}
        ORDER BY match_score DESC
        LIMIT ${limit * 2}
      `

      matchedProductIds = rows
        .filter((r) => Number(r.match_score) > MATCH_SIMILARITY_THRESHOLD)
        .slice(0, limit)
        .map((r) => r.id)
    }

    if (matchedProductIds.length === 0) {
      // ── Path B (fallback): find products matching explicit preferences ──
      const prefColors = customer.pref_colors ?? []
      const prefOccasions = customer.pref_occasions ?? []
      const prefFabrics = customer.pref_fabrics ?? []

      const orConditions: Prisma.ProductWhereInput[] = []

      if (prefColors.length > 0) {
        orConditions.push({ primary_color: { in: prefColors } })
        orConditions.push({ secondary_colors: { hasSome: prefColors } })
      }
      if (prefOccasions.length > 0) {
        orConditions.push({ occasions: { hasSome: prefOccasions } })
      }
      if (prefFabrics.length > 0) {
        orConditions.push({ fabric_estimate: { in: prefFabrics } })
      }

      const fallbackProducts = await prisma.product.findMany({
        where: {
          retailer_id: retailerId,
          deleted_at: null,
          status: 'AVAILABLE',
          ...(price_max != null ? { price_min: { lte: price_max } } : {}),
          ...(category ? { category } : {}),
          ...(orConditions.length > 0 ? { OR: orConditions } : {}),
        },
        take: limit,
        orderBy: { created_at: 'desc' },
        select: { id: true },
      })
      matchedProductIds = fallbackProducts.map((p) => p.id)
    }

    // Fetch full product data for matched IDs
    if (matchedProductIds.length === 0) {
      return { data: { products: [], dna_used, dna_confidence } }
    }

    const products = await prisma.product.findMany({
      where: { id: { in: matchedProductIds }, retailer_id: retailerId },
      include: {
        photos: { where: { is_primary: true }, take: 1 },
        section: { select: { name: true } },
      },
      orderBy: { created_at: 'desc' },
    })

    // Preserve the order from similarity ranking
    const productMap = new Map(products.map((p) => [p.id, p]))
    const ordered = matchedProductIds
      .map((id) => productMap.get(id))
      .filter((p): p is NonNullable<typeof p> => p != null)

    return {
      data: {
        products: ordered.map((p) => ({
          ...p,
          primary_photo_url: p.photos[0]?.url ?? null,
          photos: undefined,
        })),
        dna_used,
        dna_confidence,
      },
    }
  })
}
