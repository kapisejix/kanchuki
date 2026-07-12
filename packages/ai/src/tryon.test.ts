import { describe, expect, it } from 'vitest'
import { resolveClothType, isUnsupportedTryOnCategory, isPieceTaggableCategory } from './tryon.js'

describe('resolveClothType', () => {
  it('maps single-piece and unknown categories to upper', () => {
    expect(resolveClothType('Kurti')).toBe('upper')
    expect(resolveClothType('Blouse')).toBe('upper')
    expect(resolveClothType('Other')).toBe('upper')
    expect(resolveClothType(null)).toBe('upper')
    expect(resolveClothType(undefined)).toBe('upper')
  })

  it('maps multi-piece-shot-as-a-set categories to overall', () => {
    expect(resolveClothType('Ladies Suit')).toBe('overall')
    expect(resolveClothType('Readymade Suit')).toBe('overall')
    expect(resolveClothType("Men's Kurta Pajama")).toBe('overall')
    expect(resolveClothType('Lehenga')).toBe('overall')
    expect(resolveClothType('Saree')).toBe('overall')
  })
})

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
