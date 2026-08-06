/**
 * Client-side quality-first image compressor — the mobile twin of
 * packages/ai/src/image-compress.ts. Shrinks a picked/captured image to fit
 * under a byte budget (default 80KB) before it PUTs to R2, so new uploads
 * never need the server-side batch pass.
 *
 * Strategy (quality-first, resize only when quality alone can't get there):
 *   1. Already within budget → return the original untouched (no re-encode).
 *   2. Cap the long edge at `maxDimension` (default 1600px).
 *   3. Walk a compress-quality ladder (0.9 → 0.5) and take the first encode
 *      that fits.
 *   4. If nothing fits at the current dimensions, shrink the long edge ~15%
 *      and repeat — down to a 640px floor.
 *   5. Fall back to the smallest encode produced; on ANY error return the
 *      original (a retailer's upload must never fail because of this).
 *
 * Output is always JPEG (consistent with the server compressor).
 */
import * as ImageManipulator from 'expo-image-manipulator'
import { File } from 'expo-file-system'

export interface CompressImageOptions {
  /** Byte budget the result must fit under. Default 80 * 1024. */
  maxBytes?: number
  /** Long-edge cap in px. Default 1600. */
  maxDimension?: number
  /** Starting JPEG compress level (0-1). Default 0.9. */
  startCompress?: number
  /** Lowest JPEG compress level before shrinking dimensions. Default 0.5. */
  minCompress?: number
  /** Floor for the resized long edge in px. Default 640. */
  minDimension?: number
}

export async function compressImageForUpload(
  uri: string,
  options: CompressImageOptions = {},
): Promise<string> {
  const maxBytes = options.maxBytes ?? 80 * 1024
  const maxDimension = options.maxDimension ?? 1600
  const startCompress = options.startCompress ?? 0.9
  const minCompress = options.minCompress ?? 0.5
  const minDimension = options.minDimension ?? 640

  try {
    const file = new File(uri)
    // Already within budget — don't re-encode (re-encoding can even grow a
    // near-budget image at high quality; untouched is strictly better).
    if (!file.exists || file.size <= maxBytes) return uri

    // Read original dimensions (also normalizes to a JPEG base copy).
    const info = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 1,
      format: ImageManipulator.SaveFormat.JPEG,
    })
    const originalWidth = info.width
    const originalHeight = info.height
    if (!originalWidth || !originalHeight) return uri

    const longEdge = Math.max(originalWidth, originalHeight)
    let dim = Math.min(longEdge, maxDimension)
    let best: string | null = null
    let bestSize = Number.POSITIVE_INFINITY

    // Dimension ladder: shrink 15% each pass until the floor.
    while (dim >= minDimension) {
      const scale = dim / longEdge
      const w = Math.max(1, Math.round(originalWidth * scale))
      const h = Math.max(1, Math.round(originalHeight * scale))

      // Quality ladder in integer tenths (0.9 → 0.5) — avoids float drift.
      for (
        let t = Math.round(startCompress * 10);
        t >= Math.round(minCompress * 10);
        t -= 1
      ) {
        const q = t / 10
        const out = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: w, height: h } }],
          { compress: q, format: ImageManipulator.SaveFormat.JPEG },
        )
        const size = new File(out.uri).size
        // Track the smallest encode as a fallback regardless of budget.
        if (size < bestSize) {
          bestSize = size
          best = out.uri
        }
        if (size <= maxBytes) return out.uri
      }

      dim = Math.round(dim * 0.85)
    }

    return best ?? uri
  } catch (err) {
    // Best-effort: compression must never block an upload.
    console.warn('compressImageForUpload failed — uploading original:', err)
    return uri
  }
}
