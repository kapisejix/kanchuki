// Auto-split from api.ts (1138 lines, mirrors the api/routes split pattern) —
// request()/token/upload plumbing shared by every domain module in this dir.
import { router } from 'expo-router'
import { File } from 'expo-file-system'
import * as LegacyFileSystem from 'expo-file-system/legacy'
import { getItem, setItem, deleteItem } from '../storage'
import { cachedJsonRequest, clearRequestCache } from '../request-cache'
import { compressImageForUpload } from '../compress-image'

export const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3001'

export function getToken(): Promise<string | null> {
  return getItem('auth_token')
}

export function setToken(token: string): Promise<void> {
  return setItem('auth_token', token)
}

export function clearToken(): Promise<void> {
  return deleteItem('auth_token')
}

export { clearRequestCache }

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// Single-flight refresh — concurrent 401s share one refresh call instead of
// each racing to burn the same refresh_token.
let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = await getItem('refresh_token')
      if (!refreshToken) return null
      try {
        const res = await fetch(`${API_URL}/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
        if (!res.ok) return null
        const { data } = (await res.json()) as {
          data: { access_token: string; refresh_token: string }
        }
        await setToken(data.access_token)
        await setItem('refresh_token', data.refresh_token)
        return data.access_token
      } catch {
        return null
      }
    })()
  }
  const token = await refreshPromise
  refreshPromise = null
  return token
}

export async function request<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number; getCacheTtlMs?: number } = {},
  isRetry = false,
): Promise<T> {
  const token = await getToken()
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string> | undefined),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const method = (options.method ?? 'GET').toUpperCase()

  try {
    const data = await cachedJsonRequest<T>(`${API_URL}${path}`, {
      ...options,
      headers,
      timeoutMs: options.timeoutMs ?? 10_000,
      // Cache GET responses for 15s by default — stale-while-revalidate
      // pattern via react-query handles the rest
      getCacheTtlMs: method === 'GET' ? (options.getCacheTtlMs ?? 15_000) : 0,
    })
    return data
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(
        'TIMEOUT',
        `Request timed out (${path}). Check that the API server is running at ${API_URL} and try again.`,
        408,
      )
    }
    // Handle errors from request-cache.ts (RequestError has .code/.status)
    const cacheErr = err as { code?: string; status?: number }
    const code = err instanceof ApiError ? err.code : cacheErr.code
    const status = err instanceof ApiError ? err.status : cacheErr.status

    // Expired access token — refresh once and retry the original request
    if (status === 401 && code === 'UNAUTHORIZED' && !isRetry) {
      const newToken = await refreshAccessToken()
      if (newToken) return request<T>(path, options, true)
      await clearToken()
      await deleteItem('refresh_token')
      clearRequestCache()
      router.replace('/auth/phone')
    }

    if (err instanceof ApiError) throw err
    if (code && status) {
      throw new ApiError(code, err instanceof Error ? err.message : 'Request failed', status)
    }
    // Re-wrap raw fetch errors as ApiError. Name the exact URL the device
    // tried — a bare "Network request failed" gives no clue whether the app
    // is pointed at a LAN IP, localhost, or prod (env precedence gotcha:
    // apps/mobile/.env.local overrides .env, see docs/photo-feature/progress-update.md).
    throw new ApiError(
      'NETWORK_ERROR',
      `Network request failed to ${API_URL}${path}. Check that the API server is running and this device can reach it.`,
      status ?? 0,
    )
  }
}

// ─── Upload helper (direct to R2) ─────────────────────────────────

// Reads a local/picker image URI into a Blob using expo-file-system.
// React Native's fetch() does NOT support file:// or content:// URIs, which
// is what ImagePicker returns. expo-file-system.File handles these natively.
//
// IMPORTANT: We return the File directly because React Native's Blob constructor
// does NOT support ArrayBuffer as a BlobPart. Attempting new Blob([arrayBuffer])
// throws: "Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported".
// File implements the Blob interface so it works as the body of a PUT fetch().
export async function readLocalImage(uri: string, _timeoutMs = 15_000): Promise<Blob> {
  try {
    const file = new File(uri)
    if (!file.exists) {
      throw new Error('File does not exist at the specified path')
    }
    return file
  } catch (err) {
    throw new ApiError(
      'READ_FAILED',
      err instanceof Error ? err.message : 'Could not read the selected photo. Please try a different photo.',
      500,
    )
  }
}

// PUTs the local file straight through native upload machinery (NSURLSession /
// OkHttp), not RN's fetch(). expo-file-system's `File` only *implements* the
// Blob interface — it isn't a real `instanceof Blob` wired into RN's native
// Blob registry, so fetch(..., { body: file }) can resolve 200 while silently
// sending truncated/empty bytes. R2 still stores the declared Content-Type
// regardless of body validity, so the corruption only surfaces later as
// "cannot identify image file" when something tries to decode the object.
export async function uploadImageToR2(
  localUri: string,
  uploadUrl: string,
  contentType: string,
  timeoutMs = 30_000,
  onProgress?: (fraction: number) => void,
  options?: { compress?: boolean },
): Promise<void> {
  // Client-side ≤80KB compression (quality-first, see compress-image.ts).
  // Deliberately restricted to image/jpeg: the compressor always outputs
  // JPEG, so compressing a PNG/WebP call would store JPEG bytes under a
  // PNG/WebP content type. Every main product/photo/category/try-on flow
  // already hardcodes 'image/jpeg' — those get compressed. PNG/WebP sources
  // (and non-images like PDFs/videos) upload untouched, preserving their
  // alpha/format; the server-side batch pass catches them later.
  // Opt-outs (measurement photos, KYC docs) keep full detail — same
  // exclusion the server-side batch pass uses. Best-effort: a compression
  // failure uploads the original rather than failing the retailer's upload.
  let uploadUri = localUri
  if (contentType === 'image/jpeg' && (options?.compress ?? true)) {
    try {
      uploadUri = await compressImageForUpload(localUri)
    } catch (err) {
      console.warn('Image compression failed — uploading original:', err)
    }
  }

  let result: LegacyFileSystem.FileSystemUploadResult | undefined | null
  try {
    const uploadPromise = onProgress
      ? LegacyFileSystem.createUploadTask(
          uploadUrl,
          uploadUri,
          {
            httpMethod: 'PUT',
            uploadType: LegacyFileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: { 'Content-Type': contentType },
          },
          (data) => {
            if (data.totalBytesExpectedToSend > 0) {
              onProgress(data.totalBytesSent / data.totalBytesExpectedToSend)
            }
          },
        ).uploadAsync()
      : LegacyFileSystem.uploadAsync(uploadUrl, uploadUri, {
          httpMethod: 'PUT',
          uploadType: LegacyFileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { 'Content-Type': contentType },
        })

    result = await Promise.race([
      uploadPromise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new ApiError('TIMEOUT', 'Image upload timed out. Check your connection.', 408)),
          timeoutMs,
        ),
      ),
    ])
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw new ApiError(
      'UPLOAD_FAILED',
      err instanceof Error ? err.message : 'Image upload failed',
      500,
    )
  }

  if (!result || result.status < 200 || result.status >= 300) {
    throw new ApiError('UPLOAD_FAILED', 'Image upload failed', result?.status ?? 0)
  }
}
