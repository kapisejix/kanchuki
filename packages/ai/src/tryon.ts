import { createHash } from 'node:crypto'
import { removeBackground } from '@imgly/background-removal-node'
import { objectExists, uploadBuffer, publicUrl } from './r2.js'

// ─── Configuration ─────────────────────────────────────────────
// CatVTON self-hosted: ~$0.005/try-on, requires a GPU server.
// Deploy via services/tryon/Dockerfile or services/tryon/Dockerfile.runpod.

const CATVTON_API_URL = process.env['CATVTON_API_URL'] ?? ''           // e.g. http://localhost:8000
const RUNPOD_API_KEY = process.env['RUNPOD_API_KEY'] ?? ''             // required when CATVTON_API_URL is a RunPod endpoint
const R2_TRYON_PREFIX = 'tryon-results'
const R2_PREPROCESSED_PREFIX = 'tryon-preprocessed'

// ─── Types ─────────────────────────────────────────────────────

export interface TryOnRequest {
  customerPhotoUrl: string   // URL of customer's full-body photo
  productPhotoUrl: string    // URL of product/garment photo
}

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
 * Trigger a try-on via self-hosted CatVTON microservice.
 * Supports two deployment modes:
 * 1. Self-hosted FastAPI server — sends to /try-on (sync)
 * 2. RunPod serverless — sends to /runsync with { input: { ... } } wrapper
 * Returns immediately with the completed result (sync, ~35-45s).
 */
async function triggerCatVTON(request: TryOnRequest): Promise<TryOnResult> {
  const garmentImageUrl = await removeBackgroundAndCache(request.productPhotoUrl)

  const isRunPod = isRunPodUrl(CATVTON_API_URL)
  const endpoint = isRunPod
    ? `${CATVTON_API_URL}/runsync`
    : `${CATVTON_API_URL}/try-on`

  const body = isRunPod
    ? {
        input: {
          person_image_url: request.customerPhotoUrl,
          garment_image_url: garmentImageUrl,
        },
      }
    : {
        person_image_url: request.customerPhotoUrl,
        garment_image_url: garmentImageUrl,
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
