import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate }
  },
}))

const { tagProductImages, tagProductImageUrl, tagProductImageUrls, imageHash } = await import(
  './tagger.js'
)

function toolUseResponse(input: Record<string, unknown>) {
  return { content: [{ type: 'tool_use', input }] }
}

beforeEach(() => {
  mockCreate.mockReset()
})

describe('imageHash', () => {
  it('is deterministic for identical buffers', () => {
    const a = imageHash(Buffer.from('same-bytes'))
    const b = imageHash(Buffer.from('same-bytes'))
    expect(a).toBe(b)
  })

  it('differs for different buffers', () => {
    const a = imageHash(Buffer.from('one'))
    const b = imageHash(Buffer.from('two'))
    expect(a).not.toBe(b)
  })
})

describe('tagProductImages', () => {
  it('rejects empty image array', async () => {
    await expect(tagProductImages([])).rejects.toThrow('At least one image required')
  })

  it('rejects more than 2 images', async () => {
    const img = { buffer: Buffer.from('x'), mediaType: 'image/jpeg' as const }
    await expect(tagProductImages([img, img, img])).rejects.toThrow('Max 2 images')
  })

  it('sends single image block + single-photo prompt for one image', async () => {
    mockCreate.mockResolvedValue(
      toolUseResponse({
        category: 'Kurti',
        primary_color: 'Pink',
        occasions: ['Casual'],
        search_tags: ['pink kurti'],
        is_catalog_image: false,
      }),
    )

    const result = await tagProductImages([{ buffer: Buffer.from('front'), mediaType: 'image/jpeg' }])

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const call = mockCreate.mock.calls[0][0]
    const content = call.messages[0].content
    expect(content).toHaveLength(2) // 1 image + 1 text
    expect(content[0].type).toBe('image')
    expect(content[1].text).toMatch(/Analyze this Indian ethnic fashion product image/)

    expect(result.category).toBe('Kurti')
    expect(result.primary_color).toBe('Pink')
    expect(result.secondary_colors).toEqual([])
    expect(result.fabric_estimate).toBeNull()
  })

  it('sends both image blocks + front/back prompt for two images', async () => {
    mockCreate.mockResolvedValue(
      toolUseResponse({
        category: 'Saree',
        primary_color: 'Maroon',
        occasions: ['Wedding'],
        search_tags: ['maroon saree'],
        is_catalog_image: false,
      }),
    )

    await tagProductImages([
      { buffer: Buffer.from('front'), mediaType: 'image/jpeg' },
      { buffer: Buffer.from('back'), mediaType: 'image/png' },
    ])

    const call = mockCreate.mock.calls[0][0]
    const content = call.messages[0].content
    expect(content).toHaveLength(3) // 2 images + 1 text
    expect(content[0].source.media_type).toBe('image/jpeg')
    expect(content[1].source.media_type).toBe('image/png')
    expect(content[2].text).toMatch(/front and back photos/)
  })

  it('throws when Claude does not return a tool_use block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'no tool call' }] })

    await expect(
      tagProductImages([{ buffer: Buffer.from('x'), mediaType: 'image/jpeg' }]),
    ).rejects.toThrow('Claude did not return tool use result')
  })

  it('defaults missing optional fields to null/[]/false', async () => {
    mockCreate.mockResolvedValue(
      toolUseResponse({
        category: 'Saree',
        primary_color: 'Blue',
        occasions: [],
        search_tags: [],
        is_catalog_image: undefined,
      }),
    )

    const result = await tagProductImages([{ buffer: Buffer.from('x'), mediaType: 'image/jpeg' }])
    expect(result.product_type).toBeNull()
    expect(result.embellishments).toEqual([])
    expect(result.is_catalog_image).toBe(false)
  })
})

describe('tagProductImageUrl(s)', () => {
  beforeEach(() => {
    mockCreate.mockResolvedValue(
      toolUseResponse({
        category: 'Lehenga',
        primary_color: 'Gold',
        occasions: ['Festive'],
        search_tags: ['gold lehenga'],
        is_catalog_image: true,
      }),
    )
  })

  it('fetches a single url and tags it', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => new TextEncoder().encode('front-bytes').buffer,
    }) as unknown as typeof fetch

    const result = await tagProductImageUrl('https://cdn.example.com/front.jpg')
    expect(result.category).toBe('Lehenga')
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('fetches both front+back urls and tags together', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => new TextEncoder().encode('bytes').buffer,
    }) as unknown as typeof fetch

    await tagProductImageUrls([
      'https://cdn.example.com/front.jpg',
      'https://cdn.example.com/back.jpg',
    ])

    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    const content = mockCreate.mock.calls[0][0].messages[0].content
    expect(content).toHaveLength(3)
  })

  it('throws when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch

    await expect(tagProductImageUrl('https://cdn.example.com/missing.jpg')).rejects.toThrow(
      'Failed to fetch image for tagging: 404',
    )
  })
})
