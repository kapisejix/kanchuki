import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma, SizeChartCategory, type CustomerMeasurement, type SizeChartRow } from '@kanchuki/db'
import { notFound, validationError } from '../plugins/error-handler.js'

// ─── Schemas ─────────────────────────────────────────────────

const RowSchema = z.object({
  size_label: z.string().min(1).max(20),
  sort_order: z.number().int().min(0),
  bust_min_cm: z.number().min(20).max(200).optional(),
  bust_max_cm: z.number().min(20).max(200).optional(),
  waist_min_cm: z.number().min(20).max(200).optional(),
  waist_max_cm: z.number().min(20).max(200).optional(),
  hip_min_cm: z.number().min(20).max(200).optional(),
  hip_max_cm: z.number().min(20).max(200).optional(),
  length_min_cm: z.number().min(20).max(150).optional(),
  length_max_cm: z.number().min(20).max(150).optional(),
})

const UpsertSizeChartSchema = z.object({
  category: z.nativeEnum(SizeChartCategory),
  name: z.string().min(1).max(100).optional(),
  rows: z
    .array(RowSchema)
    .min(1)
    .max(20)
    .refine(
      (rows) => new Set(rows.map((r) => r.size_label)).size === rows.length,
      'Size labels must be unique within a chart',
    ),
})

// ─── Lookup logic (pure — see size-chart.test.ts) ───────────────
// Axes checked per category, per F-102c sample chart shapes.
const AXES_BY_CATEGORY: Record<SizeChartCategory, Array<'bust' | 'waist' | 'hip' | 'length'>> = {
  UPPER: ['bust', 'waist', 'hip'],
  LOWER: ['waist', 'hip', 'length'],
}

function axisValue(measurement: CustomerMeasurement, axis: 'bust' | 'waist' | 'hip' | 'length') {
  switch (axis) {
    case 'bust':
      return measurement.bust_cm
    case 'waist':
      return measurement.pant_waist_cm ?? measurement.waist_cm
    case 'hip':
      return measurement.pant_hip_cm ?? measurement.hip_cm
    case 'length':
      return measurement.inseam_cm
  }
}

function rowRange(row: SizeChartRow, axis: 'bust' | 'waist' | 'hip' | 'length') {
  switch (axis) {
    case 'bust':
      return [row.bust_min_cm, row.bust_max_cm] as const
    case 'waist':
      return [row.waist_min_cm, row.waist_max_cm] as const
    case 'hip':
      return [row.hip_min_cm, row.hip_max_cm] as const
    case 'length':
      return [row.length_min_cm, row.length_max_cm] as const
  }
}

// Exact containing row wins; otherwise the row with the smallest total
// out-of-range distance across available axes (nearest size).
export function findRecommendedSize(
  rows: SizeChartRow[],
  category: SizeChartCategory,
  measurement: CustomerMeasurement,
): SizeChartRow | null {
  if (rows.length === 0) return null
  const axes = AXES_BY_CATEGORY[category].filter((axis) => axisValue(measurement, axis) != null)
  if (axes.length === 0) return null

  let best: SizeChartRow | null = null
  let bestDistance = Infinity

  for (const row of rows) {
    let distance = 0
    let comparable = 0
    for (const axis of axes) {
      const value = axisValue(measurement, axis)
      const [min, max] = rowRange(row, axis)
      if (value == null || min == null || max == null) continue
      comparable++
      if (value < min) distance += min - value
      else if (value > max) distance += value - max
    }
    if (comparable === 0) continue
    if (distance < bestDistance) {
      bestDistance = distance
      best = row
    }
  }
  return best
}

// ─── Routes ──────────────────────────────────────────────────

export const sizeChartRoutes: FastifyPluginAsync = async (server) => {
  // ─── PUT /size-charts ────────────────────────────────────────
  // Upsert: replaces all rows for retailer_id + category in one call.
  server.put('/', async (request, reply) => {
    const retailerId = request.retailerId

    const body = UpsertSizeChartSchema.safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')
    const { category, name, rows } = body.data

    const chart = await prisma.$transaction(async (tx) => {
      const chart = await tx.sizeChart.upsert({
        where: { retailer_id_category: { retailer_id: retailerId, category } },
        create: { retailer_id: retailerId, category, name: name ?? 'Default' },
        update: { name: name ?? undefined },
      })
      await tx.sizeChartRow.deleteMany({ where: { size_chart_id: chart.id } })
      await tx.sizeChartRow.createMany({
        data: rows.map((row) => ({ ...row, size_chart_id: chart.id })),
      })
      return tx.sizeChart.findUniqueOrThrow({
        where: { id: chart.id },
        include: { rows: { orderBy: { sort_order: 'asc' } } },
      })
    })

    return reply.send({ data: chart })
  })

  // ─── GET /size-charts ────────────────────────────────────────
  server.get('/', async (request) => {
    const retailerId = request.retailerId
    const charts = await prisma.sizeChart.findMany({
      where: { retailer_id: retailerId },
      include: { rows: { orderBy: { sort_order: 'asc' } } },
    })
    return { data: charts }
  })

  // ─── GET /size-charts/recommend ──────────────────────────────
  // Matches a customer's latest measurement against the retailer's
  // chart for the given category. No AI/GPU — plain range lookup.
  server.get('/recommend', async (request) => {
    const retailerId = request.retailerId
    const query = z
      .object({ customer_id: z.string().min(1), category: z.nativeEnum(SizeChartCategory) })
      .safeParse(request.query)
    if (!query.success) throw validationError(query.error.issues[0]?.message ?? 'Invalid')
    const { customer_id, category } = query.data

    const [chart, measurement] = await Promise.all([
      prisma.sizeChart.findUnique({
        where: { retailer_id_category: { retailer_id: retailerId, category } },
        include: { rows: true },
      }),
      prisma.customerMeasurement.findFirst({
        where: { customer_id, retailer_id: retailerId },
        orderBy: { created_at: 'desc' },
      }),
    ])
    if (!chart) throw notFound('Size chart')
    if (!measurement) throw notFound('Customer measurement')

    const recommendation = findRecommendedSize(chart.rows, category, measurement)
    if (!recommendation) throw notFound('Matching size')

    return { data: { size_label: recommendation.size_label, row_id: recommendation.id } }
  })
}
