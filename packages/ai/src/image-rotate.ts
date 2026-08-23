/**
 * Rotates an image buffer by a multiple of 90 degrees, re-encoding as JPEG.
 * Used both for the post-save product-photo rotate route (apps/api) and
 * nowhere else client-side — the pre-save add-product flow rotates locally
 * via expo-image-manipulator instead, since that photo hasn't reached R2 yet.
 */

// Lazy import — same reason as image-compress.ts/detector.ts: sharp's native
// dlopen can crash on Windows+pnpm when loaded eagerly.
let _sharp: any = null
async function getSharp() {
  if (!_sharp) {
    const mod = await import('sharp')
    _sharp = mod.default ?? mod
  }
  return _sharp
}

export async function rotateImage(
  input: Buffer,
  degrees: number,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const s = await getSharp()
  const { data, info } = await s(input)
    .rotate(degrees)
    // Baseline JPEG — see image-compress.ts for why mozjpeg/progressive is
    // off (blanks out in expo-image's grid-thumbnail disk cache).
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true })
  return { buffer: data, width: info.width, height: info.height }
}
