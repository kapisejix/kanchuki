import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above top-level consts, so the mock fn must
// be created via vi.hoisted() or the factory hits "Cannot access before
// initialization".
const { mockRemoveBackground } = vi.hoisted(() => ({ mockRemoveBackground: vi.fn() }));

// Mock the heavy @imgly background-removal model — the unit test controls the
// cutout output directly instead of running real inference. cleanupProductPhoto
// consumes `removeBackground(image, config)` as `await blob.arrayBuffer()`.
vi.mock('@imgly/background-removal-node', () => ({
  removeBackground: mockRemoveBackground,
}));

import { cleanupProductPhoto } from './detector.js';

// A 48x64 RGBA PNG with an opaque grey vertical bar in the middle and
// transparent sides — a deterministic stand-in for a garment cutout. The
// shadow layer blurs the bar's own alpha shape, offset downward.
async function makeCutoutPng(): Promise<Buffer> {
  const mod = await import('sharp');
  const sharp = mod.default ?? mod;
  const px = Buffer.alloc(48 * 64 * 4);
  for (let y = 0; y < 64; y++) {
    for (let x = 16; x < 32; x++) {
      const i = (y * 48 + x) * 4;
      px[i] = 200;
      px[i + 1] = 200;
      px[i + 2] = 200;
      px[i + 3] = 255;
    }
  }
  return sharp(px, { raw: { width: 48, height: 64, channels: 4 } })
    .png()
    .toBuffer();
}

async function withCutout(): Promise<Buffer> {
  const cutout = await makeCutoutPng();
  mockRemoveBackground.mockResolvedValue(new Blob([cutout], { type: 'image/png' }));
  // Source input only needs to be a valid image — removeBackground is mocked,
  // so its pixels never matter.
  return makeCutoutPng();
}

beforeEach(() => {
  mockRemoveBackground.mockReset();
});

describe('cleanupProductPhoto — F-030 shadow', () => {
  it('composites a soft shadow under the cutout when addShadow is true (white backdrop)', async () => {
    const source = await withCutout();

    const withShadow = await cleanupProductPhoto(source, undefined, true);
    const withoutShadow = await cleanupProductPhoto(source, undefined, false);

    // Both outputs are valid JPEGs.
    expect(withShadow.subarray(0, 2).toString('hex')).toBe('ffd8');
    expect(withoutShadow.subarray(0, 2).toString('hex')).toBe('ffd8');
    // The shadow pass must actually change the composited bytes — a blurred,
    // faded black silhouette offset below the cutout darkens the white field.
    expect(withShadow.equals(withoutShadow)).toBe(false);
  });

  it('defaults to no shadow when addShadow is omitted — backward compatible', async () => {
    const source = await withCutout();

    const noArg = await cleanupProductPhoto(source);
    const explicitFalse = await cleanupProductPhoto(source, undefined, false);

    // Identical pipeline — byte-identical output. This locks in that existing
    // callers (extract-spin-frames, tag-product with add_shadow unset) are
    // unaffected by the new optional parameter.
    expect(noArg.equals(explicitFalse)).toBe(true);
  });

  it('keeps shadow when a custom background is composited behind it', async () => {
    // Background fetch will fail (ssrfSafeFetch blocks non-http protocols
    // synchronously) — cleanupProductPhoto falls back to the white backdrop,
    // and the shadow must survive that fallback.
    const source = await withCutout();

    const withShadow = await cleanupProductPhoto(source, 'file:///etc/passwd', true);
    const withoutShadow = await cleanupProductPhoto(source, 'file:///etc/passwd', false);

    expect(withShadow.subarray(0, 2).toString('hex')).toBe('ffd8');
    expect(withShadow.equals(withoutShadow)).toBe(false);
  });
});
