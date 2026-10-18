// F-045 PR-7: client half of selfie analysis - photo prep + the three API calls.
//
// Every call returns a value and never throws. Statuses become plain copy here, once:
// the API's own sentences never reach the screen, and a reply that is not a clear
// success is never shown as one (RC-059/060).
import { MY_STYLE_CONSENT, type MyStyleProfile } from '@kanchuki/shared'

const BASE = '/api/my-style'
// Matches the server-side downscale, so the upload is never bigger than the model sees.
const MAX_EDGE = 1568
const START_TIMEOUT_MS = 30_000
const POLL_TIMEOUT_MS = 10_000

/** Re-encode any photo the browser can decode as a <=1568px JPEG (the API refuses HEIC). */
export async function prepareUpload(file: Blob): Promise<Blob> {
  const unreadable = () => new Error('unreadable')
  if (typeof createImageBitmap !== 'function') throw unreadable()
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file) // honours EXIF orientation
  } catch {
    throw unreadable() // e.g. HEIC on a browser that cannot decode it
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw unreadable()
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85),
  )
  if (!blob) throw unreadable()
  return blob
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

/** fetch with a timeout; `outer` (sheet closed) aborts it too. */
async function timedFetch(url: string, init: RequestInit, ms: number, outer?: AbortSignal) {
  const ctrl = new AbortController()
  const stop = () => ctrl.abort()
  const timer = setTimeout(stop, ms)
  outer?.addEventListener('abort', stop)
  try {
    return await fetch(url, { ...init, credentials: 'include', signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
    outer?.removeEventListener('abort', stop)
  }
}

const START_ERRORS: Record<number, string> = {
  402: "You've reached this month's limit for photo reads. It resets next month.",
  409: 'Your last photo is still being read. Please wait a moment.',
  503: 'Photo reading is not available right now. Please try later.',
  404: 'Photo reading is switched off for now. Please try later.',
  413: 'That photo is too large. Please take a smaller one.',
  422: "We couldn't use that photo. Please take a clear photo and try again.",
}
const GENERIC = 'Something went wrong. Please try again.'

export type StartResult =
  | { kind: 'started'; jobId: string }
  | { kind: 'unauthorized' }
  | { kind: 'error'; message: string }
  | { kind: 'aborted' }

export async function startAnalysis(photo: Blob, signal?: AbortSignal): Promise<StartResult> {
  const form = new FormData()
  form.append('photo', photo, 'photo.jpg')
  try {
    const res = await timedFetch(
      `${BASE}/analyze?consent_version=${encodeURIComponent(MY_STYLE_CONSENT.version)}`,
      { method: 'POST', body: form }, // no content-type: the browser adds the boundary
      START_TIMEOUT_MS,
      signal,
    )
    if (res.status === 401) return { kind: 'unauthorized' }
    if (!res.ok) return { kind: 'error', message: START_ERRORS[res.status] ?? GENERIC }
    const json = (await res.json().catch(() => null)) as { data?: { job_id?: string } } | null
    const jobId = json?.data?.job_id
    return jobId ? { kind: 'started', jobId } : { kind: 'error', message: GENERIC }
  } catch (e) {
    if (isAbort(e) && signal?.aborted) return { kind: 'aborted' }
    return {
      kind: 'error',
      message: 'Could not send your photo. Please check your connection and try again.',
    }
  }
}

const FAILED: Record<string, string> = {
  no_person: "We couldn't see a person in that photo. Please stand in the frame and try again.",
  face_not_clear: "We couldn't see your face clearly. Face the light and try again.",
  multiple_people: 'Please take a photo with only you in it and try again.',
  too_dark: 'That photo is too dark. Please use better light and try again.',
  read_failed: 'We could not read that photo. Please try again.',
  expired: 'That took too long and the photo was dropped. Please try again.',
}

export type PollResult =
  | { kind: 'processing' }
  | { kind: 'ready'; profile: MyStyleProfile }
  | { kind: 'failed'; message: string }
  | { kind: 'unauthorized' }
  | { kind: 'gone' }
  | { kind: 'error' }
  | { kind: 'aborted' }

export async function pollAnalysis(jobId: string, signal?: AbortSignal): Promise<PollResult> {
  try {
    const res = await timedFetch(
      `${BASE}/analyze/${encodeURIComponent(jobId)}`,
      { method: 'GET' },
      POLL_TIMEOUT_MS,
      signal,
    )
    if (res.status === 401) return { kind: 'unauthorized' }
    if (res.status === 404) return { kind: 'gone' }
    if (!res.ok) return { kind: 'error' }
    const json = (await res.json().catch(() => null)) as {
      data?: { status?: string; profile?: MyStyleProfile; reason?: string }
    } | null
    const d = json?.data
    if (d?.status === 'processing') return { kind: 'processing' }
    if (d?.status === 'ready') {
      return d.profile ? { kind: 'ready', profile: d.profile } : { kind: 'error' }
    }
    if (d?.status === 'failed') {
      return {
        kind: 'failed',
        message: FAILED[d.reason ?? ''] ?? 'We could not read that photo. Please try again.',
      }
    }
    if (d?.status === 'cancelled') {
      return { kind: 'failed', message: 'Your style data was cleared, so this photo was not used.' }
    }
    return { kind: 'error' }
  } catch (e) {
    return isAbort(e) && signal?.aborted ? { kind: 'aborted' } : { kind: 'error' }
  }
}

/** "Clear my data". Only {data:{ok:true}} counts as cleared. */
export async function clearProfile(): Promise<'ok' | 'unauthorized' | 'error'> {
  try {
    const res = await timedFetch(`${BASE}/profile/clear`, { method: 'POST' }, START_TIMEOUT_MS)
    if (res.status === 401) return 'unauthorized'
    if (!res.ok) return 'error'
    const json = (await res.json().catch(() => null)) as { data?: { ok?: boolean } } | null
    return json?.data?.ok === true ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}
