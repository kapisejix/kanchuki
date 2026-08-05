import { request } from './client'

export type SizeChartCategory = 'UPPER' | 'LOWER'

export type SizeChartRow = {
  size_label: string
  sort_order: number
  bust_min_cm?: number
  bust_max_cm?: number
  waist_min_cm?: number
  waist_max_cm?: number
  hip_min_cm?: number
  hip_max_cm?: number
  length_min_cm?: number
  length_max_cm?: number
}

export const sizeChartApi = {
  list: () =>
    request<{ data: { id: string; category: SizeChartCategory; rows: SizeChartRow[] }[] }>(
      '/v1/size-charts',
      { getCacheTtlMs: 30_000 },
    ),

  save: (category: SizeChartCategory, rows: SizeChartRow[]) =>
    request<{ data: unknown }>('/v1/size-charts', {
      method: 'PUT',
      body: JSON.stringify({ category, rows }),
    }),

  recommend: (customerId: string, category: SizeChartCategory) =>
    request<{ data: { size_label: string; row_id: string } }>(
      `/v1/size-charts/recommend?customer_id=${customerId}&category=${category}`,
    ),
}
