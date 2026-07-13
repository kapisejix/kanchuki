/**
 * Request cache + deduplication for API calls.
 *
 * - **Deduplication**: If two callers request the same URL + method + body
 *   simultaneously, only one actual fetch fires. The second caller gets the
 *   same promise.
 * - **GET cache**: Successful GET responses are cached in memory for a
 *   configurable TTL (default 30s) so screens that mount after a recent
 *   fetch skip the network entirely.
 * - **Timeout**: Every request gets an AbortController-backed timeout
 *   (default 10s — generous for 3G).
 * - **No offline queue** yet — that's Phase 1 work.
 */

const inflight = new Map<string, Promise<unknown>>()
const cache = new Map<string, { data: unknown; ts: number }>()

/** Default TTL for cached GET responses (30s).  Set to 0 to disable. */
const DEFAULT_GET_TTL_MS = 30_000

/** Default timeout per request (10s — fits 3G budget). */
const DEFAULT_TIMEOUT_MS = 10_000

function cacheKey(
  url: string,
  method: string,
  body?: BodyInit | null,
): string {
  return `${method}:${url}:${body ?? ''}`
}

// Error thrown by cachedJsonRequest — api.ts catches it by checking .code/.status
// (avoiding a circular import between the two modules).
class RequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'RequestError'
  }
}

/**
 * Thin wrapper around `fetch` that adds:
 * - timeout (AbortController)
 * - GET response caching (in-memory, configurable TTL)
 * - in-flight request deduplication (one fetch per unique URL+method+body)
 *
 * Does **not** change the return shape — callers still get `Response`.
 */
export async function cachedFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number; getCacheTtlMs?: number } = {},
): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase()
  const body = init.body
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const getTtl = init.getCacheTtlMs ?? DEFAULT_GET_TTL_MS
  const key = cacheKey(url, method, body as string | null)

  // ── GET cache hit ───────────────────────────────────────────────
  if (method === 'GET' && getTtl > 0) {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.ts < getTtl) {
      return new Response(JSON.stringify(hit.data), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
  }

  // ── Deduplication — return in-flight promise if same key ────────
  if (inflight.has(key)) {
    const resp = (await inflight.get(key)) as Response
    return resp.clone()
  }

  // ── Build the actual fetch with timeout ─────────────────────────
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const fetchPromise = (async () => {
    try {
      const response = await fetch(url, { ...init, signal: controller.signal })

      // Cache successful GET responses
      if (method === 'GET' && getTtl > 0 && response.ok) {
        const cloned = response.clone()
        try {
          const data = await cloned.json()
          cache.set(key, { data, ts: Date.now() })
        } catch { /* non-JSON response — don't cache */ }
      }

      // Mutations invalidate the whole GET cache — otherwise a refetch
      // triggered right after a POST/PUT/PATCH/DELETE can still be served
      // stale data from this cache even though react-query thinks it refetched.
      if (method !== 'GET' && response.ok) {
        cache.clear()
      }

      return response
    } finally {
      clearTimeout(timer)
      inflight.delete(key)
    }
  })()

  inflight.set(key, fetchPromise)
  return fetchPromise
}

/** Syntactic sugar: wrapped JSON request that returns `T` directly. */
export async function cachedJsonRequest<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number; getCacheTtlMs?: number } = {},
): Promise<T> {
  const response = await cachedFetch(url, init)
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string }
    }
    throw new RequestError(
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? `Request failed (${response.status})`,
      response.status,
    )
  }

  // 204 No Content (DELETE, etc.) — return undefined instead of parsing empty body
  if (response.status === 204) return undefined as T

  // Safely parse JSON body — some endpoints might return 200 with empty body
  try {
    return (await response.json()) as T
  } catch {
    // Empty or malformed response body — return undefined for void endpoints,
    // throw for everything else so callers get a meaningful error
    throw new RequestError(
      'PARSE_ERROR',
      `Invalid JSON response from ${url} (status ${response.status})`,
      response.status,
    )
  }
}

/** Clear the entire request cache (useful after logout or mutation). */
export function clearRequestCache(): void {
  cache.clear()
  inflight.clear()
}
