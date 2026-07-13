import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@kanchuki/db'
import { Prisma } from '@kanchuki/db'
import { embedSearchQuery, formatVectorLiteral } from '@kanchuki/ai'
import { extractBudgetFromQuery, normalizeSearchQuery } from '@kanchuki/shared'
import { validationError } from '../plugins/error-handler.js'

const SearchSchema = z.object({
  query: z.string().min(1).max(500),
  filters: z
    .object({
      status: z.array(z.enum(['AVAILABLE', 'SOLD', 'RESERVED', 'NOT_SURE'])).optional(),
      category: z.string().optional(),
      price_max: z.number().int().min(0).optional(),
      price_min: z.number().int().min(0).optional(),
      occasions: z.array(z.string()).optional(),
    })
    .optional(),
  limit: z.number().int().min(1).max(30).default(12),
})

export const searchRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /search ───────────────────────────────────────────────
  // Semantic + structured hybrid search using pgvector
  server.post('/', async (request) => {
    const body = SearchSchema.safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    const { query, filters, limit } = body.data
    const retailerId = request.retailerId

    // Extract budget from natural language
    const budgetFromQuery = extractBudgetFromQuery(query)
    const priceMax = filters?.price_max ?? budgetFromQuery.max ?? null
    const priceMin = filters?.price_min ?? budgetFromQuery.min ?? null

    // Check if retailer has any embeddings (needed for vector search)
    const embeddingCount = await prisma.productEmbedding.count({
      where: { retailer_id: retailerId },
    })

    let results: Array<{
      id: string
      category: string | null
      primary_color: string | null
      price_min: number | null
      price_max: number | null
      status: string
      section: { name: string } | null
      search_tags: string[]
      occasions: string[]
      primary_photo_url: string | null
      similarity?: number
    }>

    if (embeddingCount > 0) {
      // ── Semantic vector search ─────────────────────────────────
      const normalizedQuery = normalizeSearchQuery(query)
      const queryVector = await embedSearchQuery(normalizedQuery)
      const vectorLiteral = formatVectorLiteral(queryVector)

      type RawRow = {
        id: string
        category: string | null
        primary_color: string | null
        price_min: number | null
        price_max: number | null
        status: string
        section_id: string | null
        search_tags: string[]
        occasions: string[]
        similarity: number
      }

      const rows = await prisma.$queryRaw<RawRow[]>`
        SELECT
          p.id,
          p.category,
          p.primary_color,
          p.price_min,
          p.price_max,
          p.status,
          p.section_id,
          p.search_tags,
          p.occasions,
          (1 - (pe.embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)})) AS similarity
        FROM products p
        JOIN product_embeddings pe ON p.id = pe.product_id
        WHERE p.retailer_id = ${retailerId}
          AND p.deleted_at IS NULL
          AND p.status::text = ANY(${Prisma.raw(
            `ARRAY[${(filters?.status ?? ['AVAILABLE']).map((s) => `'${s}'`).join(',')}]::text[]`,
          )})
          ${priceMax !== null ? Prisma.raw(`AND p.price_min <= ${priceMax}`) : Prisma.empty}
          ${priceMin !== null ? Prisma.raw(`AND p.price_min >= ${priceMin}`) : Prisma.empty}
          ${filters?.category ? Prisma.raw(`AND p.category = '${filters.category.replace(/'/g, "''")}'`) : Prisma.empty}
        ORDER BY similarity DESC
        LIMIT ${limit * 2}
      `

      // Filter low-confidence results and fetch photos
      const filtered = rows.filter((r) => r.similarity > 0.35).slice(0, limit)
      const productIds = filtered.map((r) => r.id)

      const photos = await prisma.productPhoto.findMany({
        where: { product_id: { in: productIds }, is_primary: true },
        select: { product_id: true, url: true },
      })
      const sections = await prisma.storeSection.findMany({
        where: { id: { in: filtered.map((r) => r.section_id).filter((id): id is string => id !== null) } },
        select: { id: true, name: true },
      })

      const photoMap = new Map(photos.map((ph) => [ph.product_id, ph.url]))
      const sectionMap = new Map(sections.map((s) => [s.id, s]))

      results = filtered.map((r) => ({
        ...r,
        section: r.section_id ? (sectionMap.get(r.section_id) ?? null) : null,
        primary_photo_url: photoMap.get(r.id) ?? null,
      }))
    } else {
      // ── Fallback: tag-based filter search (no embeddings yet) ──
      const normalizedQuery = normalizeSearchQuery(query).toLowerCase()
      const queryWords = normalizedQuery.split(/\s+/).filter((w) => w.length > 1)

      const products = await prisma.product.findMany({
        where: {
          retailer_id: retailerId,
          deleted_at: null,
          status: { in: (filters?.status ?? ['AVAILABLE']) as ['AVAILABLE'] },
          ...(filters?.category ? { category: filters.category } : {}),
          ...(priceMax !== null ? { price_min: { lte: priceMax } } : {}),
          ...(priceMin !== null ? { price_min: { gte: priceMin } } : {}),
          OR: queryWords.map((word) => ({
            search_tags: { has: word },
          })),
        },
        include: {
          photos: { where: { is_primary: true }, take: 1 },
          section: { select: { name: true } },
        },
        take: limit,
      })

      results = products.map((p) => ({
        ...p,
        primary_photo_url: p.photos[0]?.url ?? null,
        photos: undefined,
      }))
    }

    // Build query interpretation for UI
    const colorKeywords = ['pink', 'red', 'blue', 'green', 'yellow', 'white', 'black', 'maroon',
      'mustard', 'peach', 'purple', 'orange', 'navy', 'cream', 'ivory', 'wine', 'teal']
    const fabricKeywords = ['cotton', 'silk', 'georgette', 'chiffon', 'chanderi', 'rayon', 'net']
    const occasionKeywords = ['wedding', 'party', 'casual', 'office', 'festive', 'sangeet', 'mehendi', 'pooja']

    const lower = query.toLowerCase()
    return {
      data: results,
      query_interpretation: {
        detected_colors: colorKeywords.filter((c) => lower.includes(c)),
        detected_fabrics: fabricKeywords.filter((f) => lower.includes(f)),
        detected_occasions: occasionKeywords.filter((o) => lower.includes(o)),
        detected_budget_max: priceMax,
      },
    }
  })
}
