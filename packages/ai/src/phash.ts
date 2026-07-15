// Perceptual-hash duplicate detection for F-001d bulk onboarding — flags a
// crop as "looks like something already catalogued" (same rack shot twice,
// or already present via a supplier PDF import) without blocking save.

let _sharp: any = null
async function getSharp() {
  if (!_sharp) {
    const mod = await import('sharp')
    _sharp = mod.default ?? mod
  }
  return _sharp
}

/**
 * Average-hash (aHash): resize to 8x8 grayscale, threshold against the mean,
 * pack into a 64-bit hex string.
 */
export async function computePhash(imageBuffer: Buffer): Promise<string> {
  const s = await getSharp()
  const { data } = await s(imageBuffer)
    .resize(8, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  let sum = 0
  for (let i = 0; i < data.length; i++) sum += data[i]!
  const mean = sum / data.length

  let hash = 0n
  for (let i = 0; i < data.length; i++) {
    hash = (hash << 1n) | (data[i]! >= mean ? 1n : 0n)
  }
  return hash.toString(16).padStart(16, '0')
}

export function hammingDistance(a: string, b: string): number {
  let v = BigInt(`0x${a}`) ^ BigInt(`0x${b}`)
  let dist = 0
  while (v > 0n) {
    dist += Number(v & 1n)
    v >>= 1n
  }
  return dist
}

// ponytail: fixed 64-bit aHash + fixed threshold — swap for DCT-based pHash
// if the false-positive/negative rate on real catalogs turns out to matter.
export const DUPLICATE_HAMMING_THRESHOLD = 8
