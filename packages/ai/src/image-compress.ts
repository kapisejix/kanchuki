/**
 * Quality-first image compressor: re-encode a JPEG/PNG/WebP to fit under a
 * byte budget (default 80KB) while keeping the highest quality possible.
 *
 * Strategy (quality-first, resize only when quality alone can't get there):
 *   1. If the source is already within budget, return it untouched (no
 *      re-encode, no quality loss).
 *   2. Cap the long edge at `maxDimension` (default 1600px) — catalog/web
 *      display never needs more, and it's the cheapest quality-preserving win.
 *   3. Walk a quality ladder (88 → 48) and take the first encode that fits.
 *   4. If nothing fits at the current dimensions, shrink the long edge ~15%
 *      and repeat the ladder — down to a 640px floor so we never give up.
 *   5. Fall back to the smallest encode produced even if it still exceeds the
 *      budget (never throw on a pathological image).
 *
 * Output is always JPEG (flattened onto white when the source has alpha) —
 * every consumer in this app (Next Image, expo-image, try-on) reads JPEG.
 */
export interface CompressImageOptions {
  /** Byte budget the result must fit under. Default 80 * 1024. */
  maxBytes?: number
  /** Long-edge cap in px. Default 1600. */
  maxDimension?: number
  /** Starting JPEG quality (0-100). Default 88. */
  startQuality?: number
  /** Lowest JPEG quality we'll try before shrinking dimensions. Default 48. */
  minQuality?: number
  /** Floor for the resized long edge in px. Default 640. */
  minDimension?: number
}

export interface CompressImageResult {
  buffer: Buffer
  width: number
  height: number
  quality: number
  /** True when the source was returned untouched (already within budget). */
  unchanged: boolean
}

// Lazy import — same reason as detector.ts: sharp's native dlopen can crash
// on Windows+pnpm when loaded eagerly by a module the API imports broadly.
let _sharp: any = null
async function getSharp() {
  if (!_sharp) {
    const mod = await import('sharp')
    _sharp = mod.default ?? mod
  }
  return _sharp
}

const DEFAULT_QUALITY_STEP = 7

export async function compressImageToTarget(
  input: Buffer,
  options: CompressImageOptions = {},
): Promise<CompressImageResult> {
  const maxBytes = options.maxBytes ?? 80 * 1024
  const maxDimension = options.maxDimension ?? 1600
  const startQuality = options.startQuality ?? 88
  const minQuality = options.minQuality ?? 48
  const minDimension = options.minDimension ?? 640

  const s = await getSharp()

  // Already within budget — don't re-encode (re-encoding a near-80KB image
  // at high quality can even grow it; untouched is strictly better).
  if (input.length <= maxBytes) {
    const { width = 0, height = 0 } = await s(input).metadata()
    return { buffer: input, width, height, quality: 100, unchanged: true }
  }

  const meta = await s(input).metadata()
  let width = meta.width ?? 0
  let height = meta.height ?? 0

  const encode = async (w: number, h: number, q: number): Promise<Buffer> =>
    s(input)
      .resize(w, h, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: q, mozjpeg: true })
      .toBuffer()

  let best: { buffer: Buffer; w: number; h: number; q: number } | null = null

  // Dimension ladder: start at the source size (or maxDimension if larger),
  // shrink 15% each pass until the floor.
  const initialLongEdge = Math.max(width, height)
  let dim = Math.min(initialLongEdge, maxDimension)

  while (dim >= minDimension) {
    const scale = dim / initialLongEdge
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))

    // Quality ladder: from startQuality down to minQuality.
    for (let q = startQuality; q >= minQuality; q -= DEFAULT_QUALITY_STEP) {
      const buffer = await encode(w, h, q)
      // Keep the smallest encode so far regardless of budget (fallback).
      if (!best || buffer.length < best.buffer.length) {
        best = { buffer, w, h, q }
      }
      if (buffer.length <= maxBytes) {
        return { buffer, width: w, height: h, quality: q, unchanged: false }
      }
    }

    dim = Math.round(dim * 0.85)
  }

  // Nothing fit — return the smallest thing we produced.
  const fallback = best!
  return {
    buffer: fallback.buffer,
    width: fallback.w,
    height: fallback.h,
    quality: fallback.q,
    unchanged: false,
  }
}
