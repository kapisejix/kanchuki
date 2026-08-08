import { describe, expect, it } from 'vitest';
import { pickSharpest, scoreSharpness } from './image-quality.js';

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
