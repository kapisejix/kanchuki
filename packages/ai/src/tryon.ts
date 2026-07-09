import { downloadBuffer, uploadBuffer, publicUrl } from './r2.js'

// ─── Configuration ─────────────────────────────────────────────
// CatVTON self-hosted: ~$0.005/try-on, requires a GPU server.
// Deploy via services/tryon/Dockerfile or services/tryon/Dockerfile.runpod.

const CATVTON_API_URL = process.env['CATVTON_API_URL'] ?? ''           // e.g. http://localhost:8000
const RUNPOD_API_KEY = process.env['RUNPOD_API_KEY'] ?? ''             // required when CATVTON_API_URL is a RunPod endpoint
const R2_TRYON_PREFIX = 'tryon-results'

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

/**
 * Trigger a try-on via self-hosted CatVTON microservice.
 * Supports two deployment modes:
 * 1. Self-hosted FastAPI server — sends to /try-on (sync)
 * 2. RunPod serverless — sends to /runsync with { input: { ... } } wrapper
 * Returns immediately with the completed result (sync, ~35-45s).
 */
async function triggerCatVTON(request: TryOnRequest): Promise<TryOnResult> {
  const isRunPod = isRunPodUrl(CATVTON_API_URL)
  const endpoint = isRunPod
    ? `${CATVTON_API_URL}/runsync`
    : `${CATVTON_API_URL}/try-on`

  const body = isRunPod
    ? {
        input: {
          person_image_url: request.customerPhotoUrl,
          garment_image_url: request.productPhotoUrl,
        },
      }
    : {
        person_image_url: request.customerPhotoUrl,
        garment_image_url: request.productPhotoUrl,
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
 * Poll a try-on job status.
 * CatVTON results are synchronous so no polling is needed — the result
 * is already available from triggerTryOn().
 */
export async function pollTryOn(jobId: string): Promise<TryOnResult> {
  return {
    jobId,
    status: 'completed',
    outputUrls: [],
    errorMessage: null,
    engine: 'catvton',
  }
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
