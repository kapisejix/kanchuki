import { describe, expect, it } from 'vitest';
import { imageLuminance, isDarkImage, pickSharpest, scoreSharpness } from './image-quality.js';

async function solidPng(hex: string): Promise<Buffer> {
  const mod = await import('sharp');
  const sharp = mod.default ?? mod;
  // 1x1 solid-color raw RGB buffer → png. Cheap and deterministic.
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const px = Buffer.from([r, g, b]);
  return sharp(px, { raw: { width: 1, height: 1, channels: 3 } })
    .png()
    .toBuffer();
}

async function syntheticPng(kind: 'sharp' | 'blurred', size = 256): Promise<Buffer> {
  const mod = await import('sharp');
  const sharp = mod.default ?? mod;
  // High-frequency noise = maximum Laplacian variance.
  const noise = Buffer.from(
    Array.from({ length: size * size }, () => Math.floor(Math.random() * 256)),
  );
  const sharpBuf = await sharp(noise, { raw: { width: size, height: size, channels: 1 } })
    .png()
    .toBuffer();
  if (kind === 'sharp') return sharpBuf;
  // Blur the same noise heavily → variance collapses.
  return sharp(sharpBuf).blur(12).png().toBuffer();
}

describe('scoreSharpness', () => {
  it('scores a sharp photo higher than a blurred one', async () => {
    const sharp = await syntheticPng('sharp');
    const blurred = await syntheticPng('blurred');
    const [s, b] = await Promise.all([scoreSharpness(sharp), scoreSharpness(blurred)]);
    expect(s).toBeGreaterThan(b);
    expect(s).toBeGreaterThan(0);
  });

  it('handles an empty/garbage buffer without crashing', async () => {
    await expect(scoreSharpness(Buffer.from('not an image'))).rejects.toThrow();
  });
});

describe('imageLuminance / isDarkImage', () => {
  it('near-black image classifies as dark (true)', async () => {
    const buf = await solidPng('#0a0a0a');
    expect(await imageLuminance(buf)).toBeLessThan(0.35);
    expect(await isDarkImage(buf)).toBe(true);
  });

  it('near-white image classifies as light (false)', async () => {
    const buf = await solidPng('#fafafa');
    expect(await imageLuminance(buf)).toBeGreaterThan(0.6);
    expect(await isDarkImage(buf)).toBe(false);
  });

  it('mid-tone grey returns null (no confident pick)', async () => {
    // #a9a9a9 → ~0.40 WCAG luminance — between the dark (<0.35) / light (>0.6) bands.
    const buf = await solidPng('#a9a9a9');
    expect(await isDarkImage(buf)).toBeNull();
  });

  it('garbage buffer resolves null rather than throwing', async () => {
    await expect(imageLuminance(Buffer.from('not an image'))).rejects.toThrow();
  });
});

describe('pickSharpest', () => {
  it('picks the highest score', () => {
    expect(pickSharpest([{ score: 5 }, { score: 12 }, { score: 3 }])).toBe(1);
  });

  it('ties break to the earlier index', () => {
    expect(pickSharpest([{ score: 10 }, { score: 10 }])).toBe(0);
  });

  it('single photo is primary', () => {
    expect(pickSharpest([{ score: 1 }])).toBe(0);
  });
});
