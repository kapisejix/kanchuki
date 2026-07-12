import { createHash } from 'node:crypto'
import { removeBackground } from '@imgly/background-removal-node'
import { PIECE_TAGGABLE_CATEGORIES } from '@kanchuki/shared'
import { objectExists, uploadBuffer, publicUrl, copyUrlToR2 } from './r2.js'

// ─── Configuration ─────────────────────────────────────────────
// CatVTON self-hosted: ~$0.005/try-on, requires a GPU server.
// Deploy via services/tryon/Dockerfile or services/tryon/Dockerfile.runpod.

const CATVTON_API_URL = process.env['CATVTON_API_URL'] ?? ''           // e.g. http://localhost:8000
const RUNPOD_API_KEY = process.env['RUNPOD_API_KEY'] ?? ''             // required when CATVTON_API_URL is a RunPod endpoint
const R2_TRYON_PREFIX = 'tryon-results'
const R2_PREPROCESSED_PREFIX = 'tryon-preprocessed'
// Admin-only training-data copies (F-103). Separate bucket prefix from every
// customer-facing/retailer-facing path above — nothing in this codebase
// serves URLs under this prefix back to a client, and it is not covered by
// the tryon-results 24h-expiry cron. See docs/SECURITY.md §3b.
const R2_TRAINING_PREFIX = 'training-data'

// ─── Types ─────────────────────────────────────────────────────

export interface TryOnRequest {
  customerPhotoUrl: string   // URL of customer's full-body photo
  productPhotoUrl: string    // URL of product/garment photo (single-photo fallback)
  productCategory?: string | null  // AI-tagged category, drives CatVTON cloth_type (see resolveClothType)
  /** Separate upper/lower piece photos, if the retailer tagged them (ProductPhoto.piece_type).
   *  When both are present for a PIECE_TAGGABLE_CATEGORIES product, triggers real two-call
   *  chaining instead of the single-photo "overall" fallback. */
  pieceGarmentUrls?: { upper?: string; lower?: string }
}

export type ClothType = 'upper' | 'lower' | 'overall'

export interface TryOnResult {
  jobId: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  outputUrls: string[]
  errorMessage: string | null
  /** Which engine produced this result */
  engine: 'catvton'
}

// ─── R2 paths ─────────────────────────────────────────────────

export function tryonResultR2Key(jobId: string): string {
  return `${R2_TRYON_PREFIX}/${jobId}/result.jpg`
}

// ─── CatVTON (self-hosted) ─────────────────────────────────────

/** True if the URL points to a RunPod serverless endpoint */
function isRunPodUrl(url: string): boolean {
  return url.includes('api.runpod.ai') || url.includes('api.runpod.io')
}

// Categories that are a 2+ piece outfit (kameez+salwar, choli+skirt, kurta+pajama,
// or a saree's continuous drape) but have only ONE product photo shot as a set —
// no piece-tagged photo available (see resolveClothType's fallback below vs.
// isPieceTaggableCategory's real two-call chaining path).
const MULTIPIECE_AS_OVERALL = new Set([
  'Ladies Suit', 'Readymade Suit', "Men's Kurta Pajama", 'Lehenga', 'Saree',
])

// Categories where a retailer can tag separate upper/lower piece photos
// (ProductPhoto.piece_type) — excludes Saree, which has no natural upper/lower
// split. Shared with mobile UI gating; see @kanchuki/shared.
const PIECE_TAGGABLE = new Set<string>(PIECE_TAGGABLE_CATEGORIES)

export function isPieceTaggableCategory(category: string | null | undefined): boolean {
  return !!category && PIECE_TAGGABLE.has(category)
}

// Draping physics unsupported for MVP (PRO-REQUIREMENTS.md F-102) — excluded
// from CatVTON entirely rather than sent through a mask that can't represent it.
const UNSUPPORTED_CATEGORIES = new Set(['Dupatta'])

export function isUnsupportedTryOnCategory(category: string | null | undefined): boolean {
  return !!category && UNSUPPORTED_CATEGORIES.has(category)
}

/** Single-photo fallback cloth_type — used when no piece-tagged photos exist. */
export function resolveClothType(category: string | null | undefined): ClothType {
  if (!category) return 'upper'
  if (MULTIPIECE_AS_OVERALL.has(category)) return 'overall'
  return 'upper'
}

function preprocessedR2Key(sourceUrl: string): string {
  const hash = createHash('sha256').update(sourceUrl).digest('hex').slice(0, 32)
  return `${R2_PREPROCESSED_PREFIX}/${hash}.png`
}

/**
 * Strip the background from a raw retailer product photo before it goes to
 * CatVTON. Raw uploads are rarely bg-clean (see PRO-REQUIREMENTS.md F-102) —
 * this is the input-quality gate root-caused as the main driver of low-match
 * try-on results. Output is cached in R2 by content hash of the source URL,
 * so re-try-oning the same product doesn't reprocess every call.
 */
async function removeBackgroundAndCache(productPhotoUrl: string): Promise<string> {
  const key = preprocessedR2Key(productPhotoUrl)
  // ponytail: cache is presence-only (key = hash of source URL), no TTL/
  // invalidation — fine since the same product photo always maps to the
  // same output. Add invalidation if retailers start replacing photos in
  // place at the same URL.
  if (await objectExists(key)) return publicUrl(key)

  const blob = await removeBackground(productPhotoUrl)
  const buffer = Buffer.from(await blob.arrayBuffer())
  await uploadBuffer(key, buffer, 'image/png')
  return publicUrl(key)
}

/**
 * One CatVTON inference call. Supports two deployment modes:
 * 1. Self-hosted FastAPI server — sends to /try-on (sync)
 * 2. RunPod serverless — sends to /runsync with { input: { ... } } wrapper
 * Returns immediately with the completed result (sync, ~35-45s).
 */
async function callCatVTONOnce(
  personImageUrl: string,
  garmentPhotoUrl: string,
  clothType: ClothType,
): Promise<TryOnResult> {
  const garmentImageUrl = await removeBackgroundAndCache(garmentPhotoUrl)

  const isRunPod = isRunPodUrl(CATVTON_API_URL)
  const endpoint = isRunPod
    ? `${CATVTON_API_URL}/runsync`
    : `${CATVTON_API_URL}/try-on`

  const body = isRunPod
    ? {
        input: {
          person_image_url: personImageUrl,
          garment_image_url: garmentImageUrl,
          cloth_type: clothType,
        },
      }
    : {
        person_image_url: personImageUrl,
        garment_image_url: garmentImageUrl,
        cloth_type: clothType,
      }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(isRunPod ? { Authorization: `Bearer ${RUNPOD_API_KEY}` } : {}),
    },
    signal: AbortSignal.timeout(120_000),  // 2 min timeout
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '')
    throw new Error(`CatVTON error (${res.status}): ${errorBody}`)
  }

  const raw = (await res.json()) as Record<string, unknown>

  // Parse RunPod serverless response format
  if (isRunPod) {
    // RunPod runsync returns: { "output": { "result_url": "...", ... } } or { "error": "..." }
    if (raw.error) {
      throw new Error(`CatVTON inference failed: ${String(raw.error)}`)
    }
    const output = raw.output as Record<string, unknown> | undefined
    const resultUrl = output?.result_url as string | undefined
    if (!resultUrl) {
      throw new Error('CatVTON inference returned no result_url')
    }
    return {
      jobId: `catvton-${Date.now()}`,
      status: 'completed',
      outputUrls: [resultUrl],
      errorMessage: null,
      engine: 'catvton',
    }
  }

  // Parse self-hosted FastAPI response format
  const body_ = raw as { status: string; result_url: string; error?: string }
  if (body_.status === 'failed') {
    throw new Error(`CatVTON inference failed: ${body_.error ?? 'unknown error'}`)
  }

  return {
    jobId: `catvton-${Date.now()}`,
    status: 'completed',
    outputUrls: [body_.result_url],
    errorMessage: body_.error ?? null,
    engine: 'catvton',
  }
}

/**
 * Trigger a try-on via self-hosted CatVTON. Two paths:
 * - Piece-tagged multi-piece outfit (upper + lower photos both present, category
 *   is PIECE_TAGGABLE): two sequential calls per PRO-REQUIREMENTS.md F-102 —
 *   upper first, then lower composited onto the upper result (chained, not
 *   onto the original customer photo). The intermediate result is persisted to
 *   R2 first: RunPod's base64 data-URI result can't be re-downloaded by the
 *   next call's person_image_url (its Python side does requests.get(), which
 *   can't fetch data: URIs), so it needs a real HTTPS URL before chaining.
 * - Everything else: single call, cloth_type from resolveClothType (whole-photo
 *   "overall" for multi-piece-shot-as-one-photo categories, "upper" otherwise).
 */
async function triggerCatVTON(request: TryOnRequest): Promise<TryOnResult> {
  if (isUnsupportedTryOnCategory(request.productCategory)) {
    throw new Error(`Try-on not supported for category "${request.productCategory}" (draping unsupported for MVP)`)
  }

  const { upper: upperPhotoUrl, lower: lowerPhotoUrl } = request.pieceGarmentUrls ?? {}
  if (upperPhotoUrl && lowerPhotoUrl && isPieceTaggableCategory(request.productCategory)) {
    const upperResult = await callCatVTONOnce(request.customerPhotoUrl, upperPhotoUrl, 'upper')
    const intermediateUrl = await saveTryOnResultToR2(
      `tryon-chain-${Date.now()}`,
      upperResult.outputUrls[0]!,
    )
    return callCatVTONOnce(intermediateUrl, lowerPhotoUrl, 'lower')
  }

  const clothType = resolveClothType(request.productCategory)
  return callCatVTONOnce(request.customerPhotoUrl, request.productPhotoUrl, clothType)
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
 * Trigger a virtual try-on via CatVTON self-hosted engine.
 * Throws if CATVTON_API_URL is not configured.
 */
export async function triggerTryOn(request: TryOnRequest): Promise<TryOnResult> {
  if (!CATVTON_API_URL) {
    throw new Error(
      'No try-on engine configured. Set CATVTON_API_URL to your self-hosted CatVTON endpoint ' +
      '(e.g. http://localhost:8000 for local or https://api.runpod.ai/v2/{endpoint_id} for RunPod).',
    )
  }

  console.log('[TryOn] Using CatVTON engine')
  return await triggerCatVTON(request)
}

/**
 * Save try-on result image to R2 for persistence.
 * Downloads the result from the output URL and uploads it to R2.
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
 * opted in (TryOnJob.consent_to_training) — see docs/PRO-REQUIREMENTS.md
 * F-103. Returns the R2 keys for the caller to record in
 * TrainingPhotoConsent; does not touch the database itself (this package
 * has no Prisma dependency, matching the rest of tryon.ts).
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
