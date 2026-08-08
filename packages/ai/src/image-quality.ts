// Sharpness scoring for auto-picking the primary product photo (Laplacian
// variance — the classic no-ML blur metric; see docs/photo-feature/
// multi-photo-catalog-pipeline-2026-08-07.md §3). Pure function over a
// decoded image buffer, used by the pro photo-cleanup route to flag the
// sharpest cleaned shot as the product's primary/thumbnail.

// Lazy import: sharp's native dlopen can crash on Windows+pnpm. Deferring the
// import to first-use avoids the crash when loading modules that merely import
// this file but never call image functions (same pattern as detector.ts).
// Type-only import — no runtime dlopen, so importing this module stays cheap.
import type { SharpConstructor } from 'sharp';

let _sharp: SharpConstructor | null = null;
async function getSharp(): Promise<SharpConstructor> {
  if (!_sharp) {
    const mod = await import('sharp');
    _sharp = (mod.default ?? mod) as SharpConstructor;
  }
  return _sharp;
}

/**
 * Laplacian variance of an image buffer — higher = sharper/more detail.
 * Computed on the grayscale pixels with a 3×3 Laplacian kernel, returned as
 * the mean of the squared responses (variance). Downscales very large images
 * first so the score stays comparable across photo sizes without costing a
 * full decode at native resolution.
 */
export async function scoreSharpness(imageBuffer: Buffer): Promise<number> {
  const s = await getSharp();
  const { data, info } = await s(imageBuffer)
    .greyscale()
    .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const px = data as Uint8Array<ArrayBuffer>;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    const rowPrev = (y - 1) * width;
    const rowNext = (y + 1) * width;
    for (let x = 1; x < width - 1; x++) {
      // Indexes are all inside bounds by the loop guards above — the `as
      // number` casts satisfy noUncheckedIndexedAccess on the byte array.
      const center = px[row + x] as number;
      const up = px[rowPrev + x] as number;
      const down = px[rowNext + x] as number;
      const left = px[row + x - 1] as number;
      const right = px[row + x + 1] as number;
      const lap = 4 * center - up - down - left - right;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  return Math.round((sumSq / n) * 100) / 100;
}

/**
 * Pick the sharpest of several scored photos — deterministic tie-break by
 * index (earlier photo wins) so the result never depends on array order.
 */
export function pickSharpest(photos: { score: number }[]): number {
  let best = 0;
  for (let i = 1; i < photos.length; i++) {
    if ((photos[i]?.score ?? 0) > (photos[best]?.score ?? 0)) best = i;
  }
  return best;
}

/**
 * Average WCAG-style relative luminance of an image buffer (0 = black,
 * 1 = white). Downscales to a 32×32 grid first so classifying a large photo
 * costs almost nothing (a few ms, no full decode). Used by the auto-contrast
 * background picker (dark garment → light backdrop and vice versa).
 * NOTE: measures the whole FRAME — most accurate on pro-mode shots where the
 * garment fills the frame edge-to-edge (see the capture screen's framing
 * guide); the camera flow instead classifies via the AI-detected color name
 * (shared classifyColorTone), which knows the garment, not the backdrop.
 */
export async function imageLuminance(imageBuffer: Buffer): Promise<number> {
  const s = await getSharp();
  const { data, info } = await s(imageBuffer)
    .resize({ width: 32, height: 32, fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const px = data as Uint8Array<ArrayBuffer>;
  const { width, height } = info;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i + 2 < px.length; i += 3) {
    r += px[i] as number;
    g += px[i + 1] as number;
    b += px[i + 2] as number;
    n++;
  }
  if (n === 0 || width === 0 || height === 0) return 0.5;
  const linear = (total: number): number => {
    const s2 = total / n / 255;
    return s2 <= 0.03928 ? s2 / 12.92 : Math.pow((s2 + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * Frame-level dark/light classification for the auto-contrast background
 * picker — same tone bands as the shared classifyColorTone helper:
 *   - true  (luminance < 0.35) → dark frame → wants a LIGHT backdrop
 *   - false (luminance > 0.6)  → light frame → wants a DARK backdrop
 *   - null  (mid-tone) → keep the default background
 */
export async function isDarkImage(imageBuffer: Buffer): Promise<boolean | null> {
  const luminance = await imageLuminance(imageBuffer);
  if (luminance < 0.35) return true;
  if (luminance > 0.6) return false;
  return null;
}
