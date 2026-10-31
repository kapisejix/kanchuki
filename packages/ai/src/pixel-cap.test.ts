// H5-3 / RC-141 — every decode of an untrusted image refuses a decompression bomb instead of
// decoding it. A solid PNG just over MAX_IMAGE_PIXELS is a few KB on disk and ~120 MB decoded.
import { MAX_IMAGE_PIXELS } from '@kanchuki/shared';
import sharp from 'sharp';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const { mockRunVisionExtract } = vi.hoisted(() => ({ mockRunVisionExtract: vi.fn() }));
vi.mock('./providers.js', () => ({ runVisionExtract: mockRunVisionExtract }));

const { compressImageToTarget } = await import('./image-compress.js');
const { analyzeStyleImage } = await import('./my-style-vision.js');
const { normalizePhoto, renderSlide, renderCollage, SLIDE_TEMPLATES } = await import(
  './schedule-templates.js'
);

const solid = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#aa8866' } })
    .png()
    .toBuffer();

let bomb: Buffer;
let ok: Buffer;
beforeAll(async () => {
  const side = Math.ceil(Math.sqrt(MAX_IMAGE_PIXELS)) + 1;
  bomb = await solid(side, side);
  ok = await solid(800, 600);
}, 60_000);

const PIXEL_LIMIT = /pixel limit/i;
const slide = (photo: Buffer, logo: Buffer | null = null) => ({
  photo,
  pricePaise: 150000,
  storeName: 'Test Store',
  festival: null,
  logo,
});

describe('decode sites refuse a pixel bomb', () => {
  it('compressImageToTarget (compress cron + upload routes)', async () => {
    await expect(compressImageToTarget(bomb, { maxBytes: 1000 })).rejects.toThrow(PIXEL_LIMIT);
  });
  it('analyzeStyleImage (My Style selfie) never reaches the model', async () => {
    await expect(analyzeStyleImage(bomb, 'image/png')).rejects.toThrow(PIXEL_LIMIT);
    expect(mockRunVisionExtract).not.toHaveBeenCalled();
  });
  it('normalizePhoto', async () => {
    await expect(normalizePhoto(bomb)).rejects.toThrow(PIXEL_LIMIT);
  });
  it.each(SLIDE_TEMPLATES)('renderSlide %s (photo)', async (template) => {
    await expect(renderSlide(template, slide(bomb))).rejects.toThrow(PIXEL_LIMIT);
  });
  it('renderSlide logo_corner (logo)', async () => {
    await expect(renderSlide('logo_corner', slide(ok, bomb))).rejects.toThrow(PIXEL_LIMIT);
  });
  it('renderCollage', async () => {
    await expect(renderCollage([ok, bomb], 'Test Store')).rejects.toThrow(PIXEL_LIMIT);
  });
});

describe('normal photos are unaffected', () => {
  it('still renders', async () => {
    expect((await normalizePhoto(ok)).length).toBeGreaterThan(0);
    expect((await renderCollage([ok, ok], 'Test Store')).length).toBeGreaterThan(0);
    expect((await compressImageToTarget(ok, { maxBytes: 1000 })).buffer.length).toBeGreaterThan(0);
  });
});
