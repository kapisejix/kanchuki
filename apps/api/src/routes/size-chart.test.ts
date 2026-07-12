import { describe, it, expect } from 'vitest'
import { SizeChartCategory, type CustomerMeasurement, type SizeChartRow } from '@kanchuki/db'
import { findRecommendedSize } from './size-chart.js'

function row(overrides: Partial<SizeChartRow>): SizeChartRow {
  return {
    id: overrides.size_label ?? 'row',
    size_chart_id: 'chart_1',
    size_label: 'M',
    sort_order: 0,
    bust_min_cm: null,
    bust_max_cm: null,
    waist_min_cm: null,
    waist_max_cm: null,
    hip_min_cm: null,
    hip_max_cm: null,
    length_min_cm: null,
    length_max_cm: null,
    ...overrides,
  }
}

function measurement(overrides: Partial<CustomerMeasurement>): CustomerMeasurement {
  return {
    id: 'm1',
    customer_id: 'c1',
    retailer_id: 'r1',
    source: 'MANUAL',
    height_cm: 165,
    bust_cm: null,
    waist_cm: null,
    hip_cm: null,
    pant_waist_cm: null,
    pant_hip_cm: null,
    inseam_cm: null,
    front_photo_r2_key: null,
    back_photo_r2_key: null,
    photo_deleted_at: null,
    created_at: new Date(),
    ...overrides,
  } as CustomerMeasurement
}

const upperRows = [
  row({ id: 'S', size_label: 'S', sort_order: 1, bust_min_cm: 80, bust_max_cm: 88, waist_min_cm: 64, waist_max_cm: 72, hip_min_cm: 88, hip_max_cm: 96 }),
  row({ id: 'M', size_label: 'M', sort_order: 2, bust_min_cm: 89, bust_max_cm: 96, waist_min_cm: 73, waist_max_cm: 80, hip_min_cm: 97, hip_max_cm: 104 }),
  row({ id: 'L', size_label: 'L', sort_order: 3, bust_min_cm: 97, bust_max_cm: 104, waist_min_cm: 81, waist_max_cm: 88, hip_min_cm: 105, hip_max_cm: 112 }),
]

describe('findRecommendedSize', () => {
  it('picks the row that exactly contains the measurement', () => {
    const m = measurement({ bust_cm: 92, waist_cm: 76, hip_cm: 100 })
    expect(findRecommendedSize(upperRows, SizeChartCategory.UPPER, m)?.size_label).toBe('M')
  })

  it('picks the nearest row when measurement falls between sizes', () => {
    const m = measurement({ bust_cm: 106, waist_cm: 90, hip_cm: 114 }) // just over L
    expect(findRecommendedSize(upperRows, SizeChartCategory.UPPER, m)?.size_label).toBe('L')
  })

  it('uses pant_waist/pant_hip over waist/hip for LOWER category', () => {
    const lowerRows = [
      row({ id: 'S', size_label: 'S', sort_order: 1, waist_min_cm: 64, waist_max_cm: 72, hip_min_cm: 88, hip_max_cm: 96, length_min_cm: 95, length_max_cm: 98 }),
      row({ id: 'M', size_label: 'M', sort_order: 2, waist_min_cm: 73, waist_max_cm: 80, hip_min_cm: 97, hip_max_cm: 104, length_min_cm: 98, length_max_cm: 101 }),
    ]
    const m = measurement({ waist_cm: 65, pant_waist_cm: 76, pant_hip_cm: 100, inseam_cm: 99 })
    expect(findRecommendedSize(lowerRows, SizeChartCategory.LOWER, m)?.size_label).toBe('M')
  })

  it('returns null when the measurement has no comparable axis values', () => {
    const m = measurement({})
    expect(findRecommendedSize(upperRows, SizeChartCategory.UPPER, m)).toBeNull()
  })

  it('returns null for an empty chart', () => {
    const m = measurement({ bust_cm: 92, waist_cm: 76, hip_cm: 100 })
    expect(findRecommendedSize([], SizeChartCategory.UPPER, m)).toBeNull()
  })
})
