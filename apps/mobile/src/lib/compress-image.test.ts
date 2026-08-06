import { describe, it, expect, vi, beforeEach } from 'vitest'
import { compressImageForUpload } from './compress-image'

// Hoisted fakes — vi.mock factories run before any top-level code, so the
// File class and the size map must live inside vi.hoisted (same pattern as
// mutation-queue.test.ts).
const { sizes, FakeFile, manipMock } = vi.hoisted(() => {
  // Fake expo-file-system.File: `.size`/`.exists` come from a map the test
  // controls, mirroring the real class's surface.
  const sizes = new Map<string, number>()
  class FakeFile {
    uri: string
    constructor(uri: string) {
      this.uri = uri
    }
    get exists(): boolean {
      return sizes.has(this.uri)
    }
    get size(): number {
      return sizes.get(this.uri) ?? 0
    }
  }
  return { sizes, FakeFile, manipMock: vi.fn() }
})

vi.mock('expo-file-system', () => ({
  File: FakeFile,
}))

// Fake expo-image-manipulator. First call (no actions) reports the original
// dimensions; every later call "encodes" an output whose size follows the
// JPEG rule — higher compress value → larger file.
vi.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: manipMock,
}))

const ORIGINAL = 'file:///big.jpg'

beforeEach(() => {
  sizes.clear()
  manipMock.mockReset()
  sizes.set(ORIGINAL, 500 * 1024) // a 500KB source, well over budget
  manipMock.mockImplementation(async (_uri: string, actions: unknown[], opts?: { compress?: number }) => {
    if (!actions || actions.length === 0) {
      return { uri: `${_uri}#info`, width: 2000, height: 1500 }
    }
    const q = opts?.compress ?? 1
    const outUri = `file:///out-${q}.jpg`
    // size = 5KB + q*100KB → q0.9=95KB, q0.8=85KB, q0.7=75KB (first fit)
    sizes.set(outUri, 5000 + Math.round(q * 100_000))
    return { uri: outUri, width: 1000, height: 750 }
  })
})

describe('compressImageForUpload', () => {
  it('returns the original untouched when already within budget', async () => {
    sizes.set('file:///small.jpg', 40 * 1024)
    const result = await compressImageForUpload('file:///small.jpg')
    expect(result).toBe('file:///small.jpg')
    expect(manipMock).not.toHaveBeenCalled()
  })

  it('walks the quality ladder and returns the first encode under 80KB', async () => {
    const result = await compressImageForUpload(ORIGINAL)
    // q0.9 (95KB) and q0.8 (85KB) exceed budget; q0.7 (75KB) is the first fit.
    expect(result).toBe('file:///out-0.7.jpg')
    // The ladder stepped: it tried 0.8 before settling on 0.7.
    expect(manipMock).toHaveBeenCalledWith(
      ORIGINAL,
      [{ resize: { width: 1600, height: 1200 } }],
      { compress: 0.8, format: 'jpeg' },
    )
  })

  it('caps the long edge at 1600px (no upscale, no oversized re-encode)', async () => {
    sizes.set(ORIGINAL, 500 * 1024)
    const result = await compressImageForUpload(ORIGINAL)
    // First resize must be the 1600px cap, not the original 2000px.
    expect(manipMock).toHaveBeenCalledWith(
      ORIGINAL,
      [{ resize: { width: 1600, height: 1200 } }],
      expect.objectContaining({ compress: 0.9 }),
    )
    expect(result).toBe('file:///out-0.7.jpg')
  })

  it('falls back to the smallest encode when even min quality exceeds budget', async () => {
    // All qualities produce >80KB — the dimension ladder runs and the
    // smallest result is returned as a best-effort fallback.
    manipMock.mockImplementation(async (_uri: string, actions: unknown[], opts?: { compress?: number }) => {
      if (!actions || actions.length === 0) {
        return { uri: `${_uri}#info`, width: 2000, height: 1500 }
      }
      const q = opts?.compress ?? 1
      const outUri = `file:///out-${q}.jpg`
      sizes.set(outUri, 5000 + Math.round(q * 300_000)) // q0.5 → 155KB, never fits
      return { uri: outUri, width: 1000, height: 750 }
    })

    const result = await compressImageForUpload(ORIGINAL)
    expect(result).not.toBe(ORIGINAL)
    expect(result.startsWith('file:///out-')).toBe(true)
    // The dimension ladder engaged (resizes below the initial 1600px cap).
    const resizedWidths = manipMock.mock.calls
      .filter(([, actions]) => actions.length > 0)
      .map(([, actions]) => (actions[0] as { resize: { width: number } }).resize.width)
    expect(resizedWidths[0]).toBe(1600)
    expect(Math.min(...resizedWidths)).toBeLessThan(1600)
  })

  it('returns the original on manipulation failure (best-effort, never blocks upload)', async () => {
    manipMock.mockRejectedValue(new Error('native manipulator crashed'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const result = await compressImageForUpload(ORIGINAL)
      expect(result).toBe(ORIGINAL)
    } finally {
      warn.mockRestore()
    }
  })
})
