import { downloadBuffer, uploadBuffer, publicUrl, getUploadPresignedUrl } from './r2.js'
import { R2_PATHS } from '@kanchuki/shared'

// ─── Configuration ─────────────────────────────────────────────
// Priority: self-hosted CatVTON (primary) → FASHN API (fallback)
// CatVTON is ~$0.005/try-on (17x cheaper) but needs a GPU server.
// FASHN is $0.075/try-on but requires zero infrastructure.

const CATVTON_API_URL = process.env['CATVTON_API_URL'] ?? ''           // e.g. http://localhost:8000
const FASHN_API_BASE = 'https://api.fashn.ai/v1'
const FASHN_API_KEY = process.env['FASHN_API_KEY'] ?? ''
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
  engine: 'catvton' | 'fashn'
}

// ─── R2 paths ─────────────────────────────────────────────────

export function tryonResultR2Key(jobId: string): string {
  return `${R2_TRYON_PREFIX}/${jobId}/result.jpg`
}

// ─── CatVTON (self-hosted, primary) ────────────────────────────

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
    headers: { 'Content-Type': 'application/json' },
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

// ─── FASHN API (cloud fallback) ────────────────────────────────

async function triggerFASHN(request: TryOnRequest): Promise<TryOnResult> {
  const res = await fetch(`${FASHN_API_BASE}/run`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${FASHN_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_name: 'tryon-max',
      inputs: {
        product_image: request.productPhotoUrl,
        model_image: request.customerPhotoUrl,
      },
      generation_mode: 'fast',
      output_format: 'jpeg',
      resolution: '1k',
    }),
  })

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '')
    throw new Error(`FASHN API error (${res.status}): ${errorBody}`)
  }

  const body = (await res.json()) as { id: string }
  return {
    jobId: body.id,
    status: 'queued',
    outputUrls: [],
    errorMessage: null,
    engine: 'fashn',
  }
}

async function pollFASHN(jobId: string): Promise<TryOnResult> {
  const res = await fetch(`${FASHN_API_BASE}/status/${jobId}`, {
    headers: {
      'Authorization': `Bearer ${FASHN_API_KEY}`,
    },
  })

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '')
    throw new Error(`FASHN status error (${res.status}): ${errorBody}`)
  }

  const body = (await res.json()) as {
    status: string
    output?: string[]
    error?: string
  }

  return {
    jobId,
    status: body.status as TryOnResult['status'],
    outputUrls: body.output ?? [],
    errorMessage: body.error ?? null,
    engine: 'fashn',
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
 * Trigger a virtual try-on.
 *
 * Strategy:
 * 1. Try self-hosted CatVTON (sync, instant result)
 * 2. If CatVTON is not configured or fails, fall back to FASHN API (async, needs polling)
 * 3. If FASHN is not configured either, throw
 */
export async function triggerTryOn(request: TryOnRequest): Promise<TryOnResult> {
  // Primary: CatVTON (self-hosted, ~$0.005/try-on)
  if (CATVTON_API_URL) {
    try {
      console.log('[TryOn] Using CatVTON engine')
      return await triggerCatVTON(request)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[TryOn] CatVTON failed, falling back to FASHN: ${message}`)
      // Fall through to FASHN fallback
    }
  }

  // Fallback: FASHN API (cloud, ~$0.075/try-on)
  if (FASHN_API_KEY) {
    console.log('[TryOn] Using FASHN API engine')
    return await triggerFASHN(request)
  }

  throw new Error(
    'No try-on engine available. Set CATVTON_API_URL for self-hosted CatVTON, ' +
    'or FASHN_API_KEY for FASHN cloud API.',
  )
}

/**
 * Poll a try-on job status.
 * CatVTON results are synchronous so this only polls FASHN (async) jobs.
 * If the job was from CatVTON, it's already completed.
 */
export async function pollTryOn(jobId: string): Promise<TryOnResult> {
  // If it's a CatVTON job, it was completed synchronously — no polling needed
  if (jobId.startsWith('catvton-')) {
    return {
      jobId,
      status: 'completed',
      outputUrls: [],  // Caller should already have the result from triggerTryOn
      errorMessage: null,
      engine: 'catvton',
    }
  }

  // FASHN jobs need polling
  return await pollFASHN(jobId)
}

/**
 * Save try-on result from FASHN to R2 for persistence.
 * CatVTON results are already uploaded to R2 by the Python service,
 * so this only applies to FASHN fallback results.
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
