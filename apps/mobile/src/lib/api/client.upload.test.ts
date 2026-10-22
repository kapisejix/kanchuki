import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  compress: vi.fn(),
  sizes: new Map<string, number>(),
}))

vi.mock('expo-router', () => ({ router: { replace: vi.fn() } }))
vi.mock('expo-file-system/legacy', () => ({}))
vi.mock('expo-file-system', () => ({
  File: class {
    constructor(public uri: string) {}
    get size() {
      return m.sizes.get(this.uri) ?? 0
    }
  },
}))
vi.mock('../auth-events', () => ({ emitAuthChange: vi.fn() }))
vi.mock('../storage', () => ({ getItem: vi.fn(), setItem: vi.fn(), deleteItem: vi.fn() }))
vi.mock('../request-cache', () => ({ cachedJsonRequest: vi.fn(), clearRequestCache: vi.fn() }))
vi.mock('../compress-image', () => ({ compressImageForUpload: m.compress }))

import { prepareImageForUpload } from './client'

beforeEach(() => {
  m.compress.mockReset()
  m.sizes.clear()
  m.sizes.set('file:///raw.jpg', 900_000)
  m.sizes.set('file:///small.jpg', 70_000)
})

describe('prepareImageForUpload', () => {
  it('returns the COMPRESSED file and its size, not the original size', async () => {
    m.compress.mockResolvedValue('file:///small.jpg')
    expect(await prepareImageForUpload('file:///raw.jpg', 'image/jpeg')).toEqual({
      uri: 'file:///small.jpg',
      size: 70_000,
    })
  })

  it('falls back to the original file and its size when compression throws', async () => {
    m.compress.mockRejectedValue(new Error('boom'))
    expect(await prepareImageForUpload('file:///raw.jpg', 'image/jpeg')).toEqual({
      uri: 'file:///raw.jpg',
      size: 900_000,
    })
  })

  it('does not compress when opted out or not a jpeg', async () => {
    expect(await prepareImageForUpload('file:///raw.jpg', 'image/jpeg', { compress: false })).toEqual({
      uri: 'file:///raw.jpg',
      size: 900_000,
    })
    expect(await prepareImageForUpload('file:///raw.jpg', 'video/mp4')).toEqual({
      uri: 'file:///raw.jpg',
      size: 900_000,
    })
    expect(m.compress).not.toHaveBeenCalled()
  })
})
