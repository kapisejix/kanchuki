import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUpdateManyPhoto = vi.fn()
const mockUpdateProduct = vi.fn()
const mockTagProductImageUrls = vi.fn()
const mockAddEmbeddingJob = vi.fn()

// F-010 quota gate (checkQuota/incrementUsage) — no plan_limits/override row
// in these fixtures, so effectiveLimit() resolves null and every call is a
// fail-open no-op, same as the unseeded-table behavior in production today.
const mockFindUniqueOverride = vi.fn().mockResolvedValue(null)
const mockFindUniqueOrThrowRetailer = vi.fn().mockResolvedValue({ plan: 'STARTER' })
const mockFindUniquePlanLimit = vi.fn().mockResolvedValue(null)
const mockUpsertUsageCounter = vi.fn().mockResolvedValue({})

vi.mock('@kanchuki/db', () => ({
  prisma: {
    productPhoto: { updateMany: mockUpdateManyPhoto },
    product: { update: mockUpdateProduct },
    retailer: { findUniqueOrThrow: mockFindUniqueOrThrowRetailer },
    retailerLimitOverride: { findUnique: mockFindUniqueOverride },
    planLimit: { findUnique: mockFindUniquePlanLimit },
    usageCounter: { upsert: mockUpsertUsageCounter },
  },
  Prisma: {},
}))

vi.mock('@kanchuki/ai', () => ({
  tagProductImageUrls: mockTagProductImageUrls,
  // Best-effort cleanup is called with auto_cleanup=true (default) but
  // doesn't need to do anything in unit tests — the tagging assertions
  // are what we're actually testing.
  fetchImageBuffer: vi.fn().mockRejectedValue(new Error('mock: no network')),
  uploadBuffer: vi.fn().mockResolvedValue(undefined),
  cleanupProductPhoto: vi.fn().mockResolvedValue(Buffer.from('')),
}))

vi.mock('./index.js', () => ({
  addEmbeddingJob: mockAddEmbeddingJob,
}))

const { handleTagProduct } = await import('./tag-product.js')

const baseData = {
  product_id: 'prod_1',
  retailer_id: 'retailer_1',
  photo_url: 'https://cdn.example.com/front.jpg',
  r2_key: 'retailer_1/prod_1/front.jpg',
}

const fakeTags = {
  category: 'Kurti',
  product_type: 'Readymade',
  primary_color: 'Pink',
  secondary_colors: [],
  fabric_estimate: 'Cotton',
  pattern: 'Printed',
  embellishments: [],
  neck_style: 'Round Neck',
  sleeve_type: 'Full Sleeve',
  occasions: ['Casual'],
  price_range_estimate: null,
  design_number_visible: null,
  is_catalog_image: false,
  search_tags: ['pink kurti'],
  confidence_notes: null,
}

beforeEach(() => {
  mockUpdateManyPhoto.mockReset().mockResolvedValue({ count: 1 })
  mockUpdateProduct.mockReset().mockResolvedValue({})
  mockTagProductImageUrls.mockReset()
  mockAddEmbeddingJob.mockReset().mockResolvedValue(undefined)
  mockFindUniqueOverride.mockReset().mockResolvedValue(null)
  mockFindUniqueOrThrowRetailer.mockReset().mockResolvedValue({ plan: 'STARTER' })
  mockFindUniquePlanLimit.mockReset().mockResolvedValue(null)
  mockUpsertUsageCounter.mockReset().mockResolvedValue({})
})

describe('handleTagProduct', () => {
  it('tags the primary photo only', async () => {
    mockTagProductImageUrls.mockResolvedValue(fakeTags)

    await handleTagProduct(baseData)

    expect(mockTagProductImageUrls).toHaveBeenCalledWith([baseData.photo_url])
  })

  it('writes tags to product and marks primary photo tagged, then queues embedding', async () => {
    mockTagProductImageUrls.mockResolvedValue(fakeTags)

    await handleTagProduct(baseData)

    expect(mockUpdateProduct).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: expect.objectContaining({
        ai_tagged: true,
        ai_tag_error: null,
        category: 'Kurti',
        primary_color: 'Pink',
      }),
    })

    expect(mockUpdateManyPhoto).toHaveBeenNthCalledWith(2, {
      where: { product_id: 'prod_1', is_primary: true },
      data: expect.objectContaining({ ai_tagged: true }),
    })

    expect(mockAddEmbeddingJob).toHaveBeenCalledWith({
      product_id: 'prod_1',
      retailer_id: 'retailer_1',
    })
  })

  it('includes design_number metadata only when visible on tag', async () => {
    mockTagProductImageUrls.mockResolvedValue({
      ...fakeTags,
      design_number_visible: 'DN-2201',
    })

    await handleTagProduct(baseData)

    expect(mockUpdateProduct).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: expect.objectContaining({
        metadata: { design_number: 'DN-2201', is_catalog_image: false },
      }),
    })
  })

  it('marks product failed and rethrows when tagging fails', async () => {
    mockTagProductImageUrls.mockRejectedValue(new Error('Claude timed out'))

    await expect(handleTagProduct(baseData)).rejects.toThrow('Claude timed out')

    expect(mockUpdateProduct).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: { ai_tagged: false, ai_tag_error: 'Claude timed out' },
    })
    expect(mockAddEmbeddingJob).not.toHaveBeenCalled()
  })
})
