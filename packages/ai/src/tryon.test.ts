import { describe, expect, it } from 'vitest'
import { isUnsupportedTryOnCategory, isPieceTaggableCategory } from './tryon.js'

describe('isUnsupportedTryOnCategory', () => {
  it('flags Dupatta as unsupported, everything else as supported', () => {
    expect(isUnsupportedTryOnCategory('Dupatta')).toBe(true)
    expect(isUnsupportedTryOnCategory('Kurti')).toBe(false)
    expect(isUnsupportedTryOnCategory(null)).toBe(false)
  })
})

describe('isPieceTaggableCategory', () => {
  it('flags real 2-piece outfits as taggable', () => {
    expect(isPieceTaggableCategory('Ladies Suit')).toBe(true)
    expect(isPieceTaggableCategory('Readymade Suit')).toBe(true)
    expect(isPieceTaggableCategory("Men's Kurta Pajama")).toBe(true)
    expect(isPieceTaggableCategory('Lehenga')).toBe(true)
  })

  it('excludes Saree (continuous drape, no upper/lower split) and single-piece categories', () => {
    expect(isPieceTaggableCategory('Saree')).toBe(false)
    expect(isPieceTaggableCategory('Kurti')).toBe(false)
    expect(isPieceTaggableCategory(null)).toBe(false)
  })
})
