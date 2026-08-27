import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  isUnsupportedTryOnCategory,
  isPieceTaggableCategory,
  isLongTopCategory,
  resolveVtoneCategory,
  triggerTryOn,
} from './tryon.js'

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

describe('isLongTopCategory', () => {
  it('identifies Indian long top garments for FASHN long_top parameter', () => {
    expect(isLongTopCategory('Kurta')).toBe(true)
    expect(isLongTopCategory('Sherwani')).toBe(true)
    expect(isLongTopCategory('Long Kurti')).toBe(true)
    expect(isLongTopCategory('Men Kurta')).toBe(true)
    expect(isLongTopCategory('Tunic')).toBe(true)
    expect(isLongTopCategory('T-Shirt')).toBe(false)
    expect(isLongTopCategory('Jeans')).toBe(false)
    expect(isLongTopCategory(null)).toBe(false)
  })
})

describe('resolveVtoneCategory', () => {
  it('maps suits, sarees, lehengas, and gowns to one-pieces', () => {
    expect(resolveVtoneCategory('Saree')).toBe('one-pieces')
    expect(resolveVtoneCategory('Lehenga')).toBe('one-pieces')
    expect(resolveVtoneCategory('Ladies Suit')).toBe('one-pieces')
    expect(resolveVtoneCategory('Anarkali Suit')).toBe('one-pieces')
    expect(resolveVtoneCategory('Gown')).toBe('one-pieces')
  })

  it('maps bottoms correctly', () => {
    expect(resolveVtoneCategory('Salwar')).toBe('bottoms')
    expect(resolveVtoneCategory('Pajama')).toBe('bottoms')
    expect(resolveVtoneCategory('Palazzo')).toBe('bottoms')
    expect(resolveVtoneCategory('Jeans')).toBe('bottoms')
    expect(resolveVtoneCategory('Trousers')).toBe('bottoms')
  })

  it('maps tops and general garments to tops', () => {
    expect(resolveVtoneCategory('Kurta')).toBe('tops')
    expect(resolveVtoneCategory('Shirt')).toBe('tops')
    expect(resolveVtoneCategory(null)).toBe('tops')
  })
})

