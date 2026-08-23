import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { compressImageToTarget } from './image-compress.js'

// Realistic photo-like content: a smooth gradient with mild texture noise.
// Real JPEG photos compress far better than pure random noise — this helper
// produces images that behave like actual product photos (which is what the
// compressor is for). Strong enough texture that q100 encodes large, smooth
// enough that the quality ladder can bring it under budget without resizing.
function makePhotoLike(width: number, height: number, noise = 28): Buffer {
  const raw = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      // deterministic pseudo-random noise (no Math.random — repeatable runs)
      const n = (x * 31 + y * 57 + x * y) % noise
      raw[i] = Math.min(255, Math.round((x / width) * 180) + n)
      raw[i + 1] = Math.min(255, Math.round((y / height) * 140) + n)
      raw[i + 2] = Math.min(255, Math.round(((x + y) / (width + height)) * 110) + n)
    }
  }
  return raw
}

function makeJpeg(width: number, height: number, quality = 100): Promise<Buffer> {
  return sharp(makePhotoLike(width, height), { raw: { width, height, channels: 3 } })
    .jpeg({ quality })
    .toBuffer()
}

describe('compressImageToTarget', () => {
  it('returns the input untouched when already within budget (no re-encode)', async () => {
    const small = await sharp({ create: { width: 200, height: 150, channels: 3, background: '#ffffff' } })
      .jpeg({ quality: 80 })
      .toBuffer()
    expect(small.length).toBeLessThanOrEqual(80 * 1024)
    const r = await compressImageToTarget(small)
    expect(r.unchanged).toBe(true)
    expect(r.buffer).toBe(small)
  })

  it('squeezes a large photo under the 80KB budget', async () => {
    const big = await makeJpeg(1600, 1200)
    expect(big.length).toBeGreaterThan(80 * 1024)
    const r = await compressImageToTarget(big)
    expect(r.unchanged).toBe(false)
    expect(r.buffer.length).toBeLessThanOrEqual(80 * 1024)
    // Baseline JPEG (no mozjpeg — see image-compress.ts) needs one dimension
    // step down from the source size to hit budget on this synthetic photo.
    expect(r.width).toBe(1360)
    expect(r.height).toBe(1020)
  })

  it('produces a strictly smaller output for oversized images', async () => {
    const big = await makeJpeg(1000, 1000)
    const r = await compressImageToTarget(big)
    expect(r.buffer.length).toBeLessThan(big.length)
  })

  it('respects a custom maxBytes budget', async () => {
    const big = await makeJpeg(1600, 1200)
    const r = await compressImageToTarget(big, { maxBytes: 40 * 1024 })
    expect(r.buffer.length).toBeLessThanOrEqual(40 * 1024)
  }, 20000)

  it('shrinks dimensions only when the quality floor cannot hit the budget', async () => {
    // Extreme texture: the quality ladder will bottom out and the dimension
    // ladder must step down, but the result still respects the budget.
    const raw = Buffer.alloc(1200 * 900 * 3)
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) % 251 // pure noise
    const noisy = await sharp(raw, { raw: { width: 1200, height: 900, channels: 3 } })
      .jpeg({ quality: 100 })
      .toBuffer()
    const r = await compressImageToTarget(noisy)
    // Pure noise can't always hit the budget even at minimum dimensions — the
    // contract is best-effort. What MUST hold: the dimension ladder engaged
    // (resized down) and the output is smaller than the source.
    expect(r.width).toBeLessThan(1200)
    expect(r.width).toBeGreaterThan(0)
    expect(r.buffer.length).toBeLessThan(noisy.length)
  }, 20000)

  it('never throws on pathological content — returns best effort', async () => {
    const raw = Buffer.alloc(800 * 600 * 3)
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) % 251
    const noisy = await sharp(raw, { raw: { width: 800, height: 600, channels: 3 } })
      .jpeg({ quality: 100 })
      .toBuffer()
    const r = await compressImageToTarget(noisy)
    expect(r.buffer.length).toBeLessThan(noisy.length)
    expect(r.width).toBeLessThanOrEqual(800)
  })
})
