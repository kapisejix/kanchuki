import { downloadBuffer, uploadBuffer, publicUrl, getUploadPresignedUrl } from './r2.js'
import { R2_PATHS } from '@kanchuki/shared'

const FASHN_API_BASE = 'https://api.fashn.ai/v1'
const FASHN_API_KEY = process.env['FASHN_API_KEY'] ?? ''
const R2_TRYON_PREFIX = 'tryon-results'

// ─── Types ─────────────────────────────────────────────────────

export interface TryOnRequest {
  customerPhotoUrl: string   // URL of customer's full-body photo (must be accessible by FASHN)
  productPhotoUrl: string    // URL of product/garment photo
}

export interface TryOnResult {
  jobId: string              // FASHN's job ID
  status: 'queued' | 'processing' | 'completed' | 'failed'
  outputUrls: string[]       // Result image URLs (FASHN-hosted, temporary)
  errorMessage: string | null
}

// ─── R2 paths ─────────────────────────────────────────────────

export function tryonResultR2Key(jobId: string): string {
  return `${R2_TRYON_PREFIX}/${jobId}/result.jpg`
}

// ─── Trigger FASHN try-on ──────────────────────────────────────

export async function triggerTryOn(request: TryOnRequest): Promise<TryOnResult> {
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
      generation_mode: 'fast',    // ~10s, good enough for MVP
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
  }
}

// ─── Poll FASHN job status ────────────────────────────────────

export async function pollTryOn(jobId: string): Promise<TryOnResult> {
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
  }
}

// ─── Download helper ──────────────────────────────────────────

async function downloadBufferFromUrl(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch result image: ${res.status}`)
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// ─── Download FASHN result to R2 ──────────────────────────────

export async function saveTryOnResultToR2(
  fashnJobId: string,
  outputUrl: string,
  localJobId: string,
): Promise<string> {
  const buffer = await downloadBufferFromUrl(outputUrl)
  const r2Key = tryonResultR2Key(localJobId)
  await uploadBuffer(r2Key, buffer, 'image/jpeg')
  return publicUrl(r2Key)
}
