import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { WatermarkInputError, watermark } from './watermark.js';

function makeJpeg(
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: color },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
}

function makeLogoPng(
  width: number,
  height: number,
  color = { r: 255, g: 255, b: 255 },
): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: color },
  })
    .png()
    .toBuffer();
}

/** Mean RGB of the given (top-left) region of a decoded image. */
async function meanRgb(
  buf: Buffer,
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<{ r: number; g: number; b: number }> {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let py = y; py < Math.min(info.height, y + h); py++) {
    for (let px = x; px < Math.min(info.width, x + w); px++) {
      const i = (py * info.width + px) * ch;
      r += data.readUInt8(i);
      g += data.readUInt8(i + 1);
      b += data.readUInt8(i + 2);
      n++;
    }
  }
  return { r: r / n, g: g / n, b: b / n };
}

describe('watermark', () => {
  it('returns a valid baseline JPEG with unchanged source dimensions', async () => {
    const src = await makeJpeg(120, 80, { r: 10, g: 40, b: 200 });
    const logo = await makeLogoPng(30, 15);
    const result = await watermark(src, logo, { opacity: 0.35, scale: 0.25 });
    expect(result.width).toBe(120);
    expect(result.height).toBe(80);
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(120);
    expect(meta.height).toBe(80);
  });

  it('alpha-composites the logo (bottom-right corner is visibly lighter)', async () => {
    // Bright blue source, solid white logo → the corner holding the logo must
    // be noticeably lighter than the untouched top-left corner.
    const src = await makeJpeg(160, 100, { r: 0, g: 0, b: 180 });
    const logo = await makeLogoPng(40, 20);
    const result = await watermark(src, logo, { opacity: 0.4, scale: 0.25 }); // 40px wide logo, bottom-right
    const corner = await meanRgb(result.buffer, 110, 75, 45, 20);
    const untouched = await meanRgb(result.buffer, 5, 5, 20, 10);
    // White @ 0.4 over blue lifts all channels; blue channel saturates so
    // compare luminance-ish: red channel gain is the cleanest signal.
    expect(corner.r).toBeGreaterThan(untouched.r + 40);
    expect(corner.g).toBeGreaterThan(untouched.g + 40);
  });

  it('respects an alternate gravity (logo moves to the top-left)', async () => {
    const src = await makeJpeg(160, 100, { r: 0, g: 0, b: 180 });
    const logo = await makeLogoPng(40, 20);
    const se = await watermark(src, logo, { opacity: 0.5, scale: 0.25, gravity: 'southeast' });
    const nw = await watermark(src, logo, { opacity: 0.5, scale: 0.25, gravity: 'northwest' });
    const seTopLeft = await meanRgb(se.buffer, 5, 5, 20, 10);
    const nwTopLeft = await meanRgb(nw.buffer, 5, 5, 20, 10);
    expect(nwTopLeft.r).toBeGreaterThan(seTopLeft.r + 40);
  });

  it('rejects an oversized source (decompression-bomb guard) before decoding', async () => {
    const src = await makeJpeg(160, 100, { r: 10, g: 40, b: 200 }); // 16,000 px
    const logo = await makeLogoPng(20, 10);
    await expect(watermark(src, logo, { maxPixels: 1_000 })).rejects.toThrow(WatermarkInputError);
  });

  it('rejects garbage / empty inputs', async () => {
    const src = await makeJpeg(60, 40, { r: 10, g: 40, b: 200 });
    const logo = await makeLogoPng(10, 10);
    await expect(watermark(Buffer.from('not-an-image'), logo)).rejects.toThrow(WatermarkInputError);
    await expect(watermark(src, Buffer.from('nope'))).rejects.toThrow(WatermarkInputError);
    await expect(watermark(Buffer.alloc(0), logo)).rejects.toThrow(WatermarkInputError);
  });
});
