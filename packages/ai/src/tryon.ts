import { PIECE_TAGGABLE_CATEGORIES } from '@kanchuki/shared'
import { uploadBuffer, publicUrl, copyUrlToR2 } from './r2.js'

// ─── Configuration ─────────────────────────────────────────────
// Fashion V-Tone v1.5 (Apache 2.0, maskless, CPU-capable)
// Deploy via services/fashion-vtone/Dockerfile
// ~$0.0003/try-on on CPU, ~10-30s on GPU

const VTONE_API_URL = process.env['VTONE_API_URL'] ?? ''
const R2_TRYON_PREFIX = 'tryon-results'
const R2_TRAINING_PREFIX = 'training-data'

// ─── Types ─────────────────────────────────────────────────────

export interface TryOnRequest {
  customerPhotoUrl: string
  productPhotoUrl: string
  productCategory?: string | null
  pieceGarmentUrls?: { upper?: string; lower?: string }
}

export type VtoneCategory = 'tops' | 'bottoms' | 'one-pieces'

export interface TryOnResult {
  jobId: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  outputUrls: string[]
  errorMessage: string | null
  engine: 'vton'
}

// ─── R2 paths ─────────────────────────────────────────────────

export function tryonResultR2Key(jobId: string): string {
  return `${R2_TRYON_PREFIX}/${jobId}/result.jpg`
}

// ─── Category Mapping ──────────────────────────────────────────
// Maps Kanchuki's AI-tagged categories to V-Tone categories.
// V-Tone uses: tops, bottoms, one-pieces

// Categories that are a 2+ piece outfit but have only ONE product photo
// shot as a set — no piece-tagged photo available.
const MULTIPIECE_AS_OVERALL = new Set([
  'Ladies Suit', 'Readymade Suit', "Men's Kurta Pajama", 'Lehenga', 'Saree',
])

// Categories where a retailer can tag separate upper/lower piece photos.
const PIECE_TAGGABLE = new Set<string>(PIECE_TAGGABLE_CATEGORIES)

export function isPieceTaggableCategory(category: string | null | undefined): boolean {
  return !!category && PIECE_TAGGABLE.has(category)
}

// Draping physics unsupported for MVP — excluded from try-on entirely.
const UNSUPPORTED_CATEGORIES = new Set(['Dupatta'])

export function isUnsupportedTryOnCategory(category: string | null | undefined): boolean {
  return !!category && UNSUPPORTED_CATEGORIES.has(category)
}

/** Map Kanchuki category to V-Tone category. */
function resolveVtoneCategory(category: string | null | undefined): VtoneCategory {
  if (!category) return 'tops'
  if (MULTIPIECE_AS_OVERALL.has(category)) return 'one-pieces'
  return 'tops'
}

// ─── V-Tone Inference ──────────────────────────────────────────

/**
 * One V-Tone inference call.
 * Maskless — no background removal needed, handles raw product photos.
 * Returns sync (10-30s on GPU, 30-60s on CPU).
 */
async function callVTONOnce(
  personImageUrl: string,
  garmentImageUrl: string,
  category: VtoneCategory,
): Promise<TryOnResult> {
  const res = await fetch(`${VTONE_API_URL}/try-on`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      person_image_url: personImageUrl,
      garment_image_url: garmentImageUrl,
      category,
    }),
  })

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '')
    throw new Error(`V-Tone error (${res.status}): ${errorBody}`)
  }

  const body_ = (await res.json()) as { status: string; result_url: string; error?: string }
  if (body_.status === 'failed') {
    throw new Error(`V-Tone inference failed: ${body_.error ?? 'unknown error'}`)
  }

  return {
    jobId: `vton-${Date.now()}`,
    status: 'completed',
    outputUrls: [body_.result_url],
    errorMessage: null,
    engine: 'vton',
  }
}

/**
 * Trigger a try-on via Fashion V-Tone v1.5.
 * Two paths:
 * - Piece-tagged multi-piece outfit (upper + lower photos both present):
 *   two sequential calls — tops first, then bottoms composited onto the result.
 * - Everything else: single call with mapped V-Tone category.
 */
async function triggerVTON(request: TryOnRequest): Promise<TryOnResult> {
  if (isUnsupportedTryOnCategory(request.productCategory)) {
    throw new Error(`Try-on not supported for category "${request.productCategory}" (draping unsupported for MVP)`)
  }

  const { upper: upperPhotoUrl, lower: lowerPhotoUrl } = request.pieceGarmentUrls ?? {}
  if (upperPhotoUrl && lowerPhotoUrl && isPieceTaggableCategory(request.productCategory)) {
    // Multi-piece: tops first, then chain bottoms onto result
    const upperResult = await callVTONOnce(request.customerPhotoUrl, upperPhotoUrl, 'tops')
    const intermediateUrl = await saveTryOnResultToR2(
      `tryon-chain-${Date.now()}`,
      upperResult.outputUrls[0]!,
    )
    return callVTONOnce(intermediateUrl, lowerPhotoUrl, 'bottoms')
  }

  // Single photo path
  const category = resolveVtoneCategory(request.productCategory)
  return callVTONOnce(request.customerPhotoUrl, request.productPhotoUrl, category)
}

// ─── Download helper ──────────────────────────────────────────

async function downloadBufferFromUrl(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch result image: ${res.status}`)
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Trigger a virtual try-on via Fashion V-Tone v1.5.
 * Apache 2.0 licensed, maskless, CPU-capable.
 * Throws if VTONE_API_URL is not configured.
 */
export async function triggerTryOn(request: TryOnRequest): Promise<TryOnResult> {
  if (!VTONE_API_URL) {
    throw new Error(
      'Try-on engine not configured. Set VTONE_API_URL to your Fashion V-Tone service endpoint.',
    )
  }

  console.log('[TryOn] Using V-Tone v1.5 engine')
  return await triggerVTON(request)
}

/**
 * Save try-on result image to R2 for persistence.
 */
export async function saveTryOnResultToR2(
  jobId: string,
  outputUrl: string,
): Promise<string> {
  const buffer = await downloadBufferFromUrl(outputUrl)
  const r2Key = tryonResultR2Key(jobId)
  await uploadBuffer(r2Key, buffer, 'image/jpeg')
  return publicUrl(r2Key)
}

/**
 * Persist a training-consent copy of a completed try-on's photos under the
 * admin-only R2_TRAINING_PREFIX. Only called when the customer explicitly
 * opted in (TryOnJob.consent_to_training).
 */
export async function saveTrainingConsentCopy(
  jobId: string,
  customerPhotoUrl: string,
  garmentPhotoUrl: string,
  resultUrl: string | null,
): Promise<{ customerPhotoR2Key: string; garmentPhotoR2Key: string; resultR2Key: string | null }> {
  const customerPhotoR2Key = `${R2_TRAINING_PREFIX}/${jobId}/customer.jpg`
  const garmentPhotoR2Key = `${R2_TRAINING_PREFIX}/${jobId}/garment.jpg`
  const resultR2Key = resultUrl ? `${R2_TRAINING_PREFIX}/${jobId}/result.jpg` : null

  await copyUrlToR2(customerPhotoUrl, customerPhotoR2Key, 'image/jpeg')
  await copyUrlToR2(garmentPhotoUrl, garmentPhotoR2Key, 'image/jpeg')
  if (resultUrl && resultR2Key) {
    await copyUrlToR2(resultUrl, resultR2Key, 'image/jpeg')
  }

  return { customerPhotoR2Key, garmentPhotoR2Key, resultR2Key }
}
