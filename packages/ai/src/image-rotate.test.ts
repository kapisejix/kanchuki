import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { rotateImage } from './image-rotate.js'

function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 120, b: 60 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer()
}

describe('rotateImage', () => {
  it('rotates 90° and swaps width/height', async () => {
    const src = await makeJpeg(100, 60)
    const result = await rotateImage(src, 90)
    expect(result.width).toBe(60)
    expect(result.height).toBe(100)
    const meta = await sharp(result.buffer).metadata()
    expect(meta.width).toBe(60)
    expect(meta.height).toBe(100)
  })

  it('rotates 180° and keeps width/height unchanged', async () => {
    const src = await makeJpeg(100, 60)
    const result = await rotateImage(src, 180)
    expect(result.width).toBe(100)
    expect(result.height).toBe(60)
  })

  it('rotates 270° and swaps width/height', async () => {
    const src = await makeJpeg(100, 60)
    const result = await rotateImage(src, 270)
    expect(result.width).toBe(60)
    expect(result.height).toBe(100)
  })

  it('rotate 0 returns a valid same-dimension JPEG', async () => {
    const src = await makeJpeg(100, 60)
    const result = await rotateImage(src, 0)
    expect(result.width).toBe(100)
    expect(result.height).toBe(60)
    const meta = await sharp(result.buffer).metadata()
    expect(meta.format).toBe('jpeg')
  })
})
