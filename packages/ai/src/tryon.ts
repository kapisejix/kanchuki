import { getSecret } from '@kanchuki/db'
import { PIECE_TAGGABLE_CATEGORIES } from '@kanchuki/shared'
import { uploadBuffer, publicUrl, copyUrlToR2 } from './r2.js'
import { ssrfSafeFetch, readCappedBuffer } from './safe-fetch.js'

// ─── Configuration & Key Resolvers ─────────────────────────────

export async function resolveFalKey(): Promise<string | null> {
  const secret = await getSecret('FAL_API_KEY').catch(() => null)
  return (
    secret ||
    (await getSecret('FAL_KEY').catch(() => null)) ||
    process.env['FAL_API_KEY'] ||
    process.env['FAL_KEY'] ||
    null
  )
}

async function getVtoneApiUrl(): Promise<string> {
  return (await getSecret('VTONE_API_URL')) ?? ''
}

async function getVtoneSharedSecret(): Promise<string | undefined> {
  return getSecret('VTONE_SHARED_SECRET')
}

const VTONE_CALL_TIMEOUT_MS = (() => {
  const raw = process.env['VTONE_CALL_TIMEOUT_MS']
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30 * 60 * 1000
})()

const R2_TRYON_PREFIX = 'tryon-results'
const R2_TRAINING_PREFIX = 'training-data'

// ─── Types ─────────────────────────────────────────────────────

export interface TryOnRequest {
  customerPhotoUrl: string
  productPhotoUrl: string
  productCategory?: string | null
  pieceGarmentUrls?: { upper?: string; lower?: string }
  /**
   * Direct category override (admin on-model tool). When set, it wins
   * over the heuristic mapping in resolveVtoneCategory.
   */
  vtoneCategory?: VtoneCategory
}

export type VtoneCategory = 'tops' | 'bottoms' | 'one-pieces'

export interface TryOnResult {
  jobId: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  outputUrls: string[]
  errorMessage: string | null
  engine: 'fal-fashn' | 'vton'
}

// ─── R2 paths ─────────────────────────────────────────────────

export function tryonResultR2Key(jobId: string): string {
  return `${R2_TRYON_PREFIX}/${jobId}/result.jpg`
}

// ─── Category Mapping & Helpers ────────────────────────────────

// Indian long top categories that should enable long_top in FASHN
const LONG_TOP_CATEGORIES = new Set([
  'Kurta',
  'Sherwani',
  'Long Kurti',
  'Kurti',
  'Tunic',
  'Kameez',
  'Achkan',
  'Indo-Western',
  'Nehru Jacket',
])

export function isLongTopCategory(category: string | null | undefined): boolean {
  if (!category) return false
  return (
    LONG_TOP_CATEGORIES.has(category) ||
    /kurta|kurti|sherwani|tunic|kameez|achkan/i.test(category)
  )
}

// Categories that are a 2+ piece outfit but have only ONE product photo
// shot as a set — mapped to one-pieces in try-on models
const MULTIPIECE_AS_OVERALL = new Set([
  'Ladies Suit',
  'Readymade Suit',
  "Men's Kurta Pajama",
  'Lehenga',
  'Saree',
  'Anarkali Suit',
  'Sharara Suit',
  'Gown',
  'Dress',
  'Jumpsuit',
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

/** Map Kanchuki category to virtual try-on category. */
export function resolveVtoneCategory(category: string | null | undefined): VtoneCategory {
  if (!category) return 'tops'
  if (MULTIPIECE_AS_OVERALL.has(category) || /suit|saree|lehenga|gown|dress|jumpsuit|anarkali/i.test(category)) {
    return 'one-pieces'
  }
  if (/pant|trouser|jeans|skirt|dhoti|salwar|pyjama|pajama|palazzo|churidar|legging/i.test(category)) {
    return 'bottoms'
  }
  return 'tops'
}

// ─── Fal.ai FASHN v1.5 Inference ───────────────────────────────

const FAL_BASE = 'https://queue.fal.run'

/**
 * Executes a single FASHN v1.5 Try-On task via fal.ai.
 * Preserves garment details, textures, and Indian ethnic drape characteristics.
 */
async function callFalFashnOnce(
  apiKey: string,
  personImageUrl: string,
  garmentImageUrl: string,
  category: VtoneCategory,
  options?: { isLongTop?: boolean },
): Promise<TryOnResult> {
  const modelEndpoint = 'fal-ai/fashn/tryon-v1.5'
  const submitUrl = `${FAL_BASE}/${modelEndpoint}`

  const input = {
    model_image: personImageUrl,
    garment_image: garmentImageUrl,
    category,
    mode: 'quality',
    long_top: options?.isLongTop ?? (category === 'tops'),
    garment_photo_type: 'auto',
    nsfw_filter: true,
    cover_feet: false,
    adjust_hands: true,
    restore_background: true,
  }

  const submitRes = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(30_000),
  })

  if (!submitRes.ok) {
    const errorText = await submitRes.text().catch(() => '')
    throw new Error(`Fal.ai FASHN submission failed (${submitRes.status}): ${errorText}`)
  }

  const submitData = (await submitRes.json()) as {
    request_id?: string
    status_url?: string
    response_url?: string
    images?: { url: string }[]
    image?: { url: string }
  }

  // Fast-path: already resolved
  if (submitData.images?.[0]?.url) {
    return {
      jobId: `fashn-${Date.now()}`,
      status: 'completed',
      outputUrls: [submitData.images[0].url],
      errorMessage: null,
      engine: 'fal-fashn',
    }
  }
  if (submitData.image?.url) {
    return {
      jobId: `fashn-${Date.now()}`,
      status: 'completed',
      outputUrls: [submitData.image.url],
      errorMessage: null,
      engine: 'fal-fashn',
    }
  }

  const requestId = submitData.request_id
  const statusUrl = submitData.status_url || `${FAL_BASE}/${modelEndpoint}/requests/${requestId}/status`
  const responseUrl = submitData.response_url || `${FAL_BASE}/${modelEndpoint}/requests/${requestId}`

  // Poll for completion (FASHN usually finishes in 8–15s)
  const startTime = Date.now()
  const timeoutMs = 180_000
  const deadline = startTime + timeoutMs

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))

    try {
      const statusRes = await fetch(statusUrl, {
        headers: { Authorization: `Key ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      })

      if (statusRes.ok) {
        const statusJson = (await statusRes.json()) as { status?: string; error?: string }
        if (statusJson.status === 'COMPLETED') {
          const finalRes = await fetch(responseUrl, {
            headers: { Authorization: `Key ${apiKey}` },
            signal: AbortSignal.timeout(10_000),
          })
          const finalData = (await finalRes.json()) as {
            images?: { url: string }[]
            image?: { url: string }
          }
          const resultUrl = finalData.images?.[0]?.url || finalData.image?.url
          if (!resultUrl) throw new Error('No output image in Fal.ai FASHN completed response')

          return {
            jobId: `fashn-${requestId || Date.now()}`,
            status: 'completed',
            outputUrls: [resultUrl],
            errorMessage: null,
            engine: 'fal-fashn',
          }
        }
        if (statusJson.status === 'FAILED' || statusJson.status === 'ERROR') {
          throw new Error(`Fal.ai FASHN generation failed: ${statusJson.error ?? 'Unknown error'}`)
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Fal.ai FASHN generation failed')) throw err
      // Transient network blip during polling, continue next iteration
    }
  }

  throw new Error('Fal.ai FASHN try-on timed out after 3 minutes')
}

/**
 * Trigger FASHN Try-On via fal.ai with multi-piece outfit chaining support.
 */
async function triggerFalFashn(apiKey: string, request: TryOnRequest): Promise<TryOnResult> {
  const { upper: upperPhotoUrl, lower: lowerPhotoUrl } = request.pieceGarmentUrls ?? {}
  if (upperPhotoUrl && lowerPhotoUrl && isPieceTaggableCategory(request.productCategory)) {
    // Multi-piece: tops first, then chain bottoms onto result
    const upperResult = await callFalFashnOnce(apiKey, request.customerPhotoUrl, upperPhotoUrl, 'tops', {
      isLongTop: isLongTopCategory(request.productCategory),
    })
    const intermediateUrl = await saveTryOnResultToR2(
      `tryon-chain-${Date.now()}`,
      upperResult.outputUrls[0]!,
    )
    return callFalFashnOnce(apiKey, intermediateUrl, lowerPhotoUrl, 'bottoms')
  }

  const category = request.vtoneCategory ?? resolveVtoneCategory(request.productCategory)
  const isLongTop = isLongTopCategory(request.productCategory)
  return callFalFashnOnce(apiKey, request.customerPhotoUrl, request.productPhotoUrl, category, { isLongTop })
}

// ─── Legacy Fashion V-Tone Inference (Fallback) ────────────────

async function callVTONOnce(
  personImageUrl: string,
  garmentImageUrl: string,
  category: VtoneCategory,
): Promise<TryOnResult> {
  const sharedSecret = await getVtoneSharedSecret()
  const res = await fetch(`${await getVtoneApiUrl()}/try-on`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sharedSecret ? { 'X-Vtone-Key': sharedSecret } : {}),
    },
    signal: AbortSignal.timeout(VTONE_CALL_TIMEOUT_MS),
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

async function triggerVTON(request: TryOnRequest): Promise<TryOnResult> {
  const { upper: upperPhotoUrl, lower: lowerPhotoUrl } = request.pieceGarmentUrls ?? {}
  if (upperPhotoUrl && lowerPhotoUrl && isPieceTaggableCategory(request.productCategory)) {
    const upperResult = await callVTONOnce(request.customerPhotoUrl, upperPhotoUrl, 'tops')
    const intermediateUrl = await saveTryOnResultToR2(
      `tryon-chain-${Date.now()}`,
      upperResult.outputUrls[0]!,
    )
    return callVTONOnce(intermediateUrl, lowerPhotoUrl, 'bottoms')
  }

  const category = request.vtoneCategory ?? resolveVtoneCategory(request.productCategory)
  return callVTONOnce(request.customerPhotoUrl, request.productPhotoUrl, category)
}

// ─── Download helper ──────────────────────────────────────────

async function downloadBufferFromUrl(url: string): Promise<Buffer> {
  const res = await ssrfSafeFetch(url)
  if (!res.ok) throw new Error(`Failed to fetch result image: ${res.status}`)
  return readCappedBuffer(res)
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Trigger a virtual try-on.
 * Prioritizes FASHN v1.5 via Fal.ai if FAL_KEY / FAL_API_KEY is configured,
 * otherwise falls back to self-hosted Fashion V-Tone (VTONE_API_URL).
 */
export async function triggerTryOn(request: TryOnRequest): Promise<TryOnResult> {
  if (isUnsupportedTryOnCategory(request.productCategory)) {
    throw new Error(`Try-on not supported for category "${request.productCategory}" (draping unsupported for MVP)`)
  }

  const falKey = await resolveFalKey()
  if (falKey) {
    console.log('[TryOn] Using FASHN v1.5 via Fal.ai engine')
    return await triggerFalFashn(falKey, request)
  }

  const vtoneUrl = await getVtoneApiUrl()
  if (vtoneUrl) {
    console.log('[TryOn] Using self-hosted Fashion V-Tone engine')
    return await triggerVTON(request)
  }

  throw new Error(
    'Virtual try-on engine is not configured. Set FAL_KEY (Admin → Integrations) or VTONE_API_URL.',
  )
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
