import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUpdateManyPhoto = vi.fn()
const mockUpdateProduct = vi.fn()
const mockTagProductImageUrls = vi.fn()
const mockAddEmbeddingJob = vi.fn()

vi.mock('@kanchuki/db', () => ({
  prisma: {
    productPhoto: { updateMany: mockUpdateManyPhoto },
    product: { update: mockUpdateProduct },
  },
  Prisma: {},
}))

vi.mock('@kanchuki/ai', () => ({
  tagProductImageUrls: mockTagProductImageUrls,
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
})

describe('handleTagProduct', () => {
  it('tags with front photo only when no back photo present', async () => {
    mockTagProductImageUrls.mockResolvedValue(fakeTags)

    await handleTagProduct(baseData)

    expect(mockTagProductImageUrls).toHaveBeenCalledWith([baseData.photo_url])
  })

  it('tags with front+back photos when back photo present', async () => {
    mockTagProductImageUrls.mockResolvedValue(fakeTags)

    await handleTagProduct({ ...baseData, back_photo_url: 'https://cdn.example.com/back.jpg' })

    expect(mockTagProductImageUrls).toHaveBeenCalledWith([
      baseData.photo_url,
      'https://cdn.example.com/back.jpg',
    ])
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
