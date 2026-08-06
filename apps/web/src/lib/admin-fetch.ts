// Shared admin-panel fetch headers. Every mutating admin route (POST/PUT/
// PATCH/DELETE) requires an x-csrf-token header matching the csrf-token
// cookie the API sets on login (see apps/api/src/routes/admin.ts). That
// cookie is httpOnly, so credentials: 'include' on the fetch call is what
// actually sends it back — omitting it (as most admin pages historically
// did, copy-pasting a local getHeaders()) makes every write 403.
const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

let cachedCsrfToken: string | null = null
let csrfFetchPromise: Promise<string> | null = null
// The admin_key the cached token was fetched with. The csrf-token cookie and
// the response token are set together on each GET /csrf-token call, so the
// cached pair is only valid for the session key it was minted under — if the
// admin re-logs-in after a bounce (new JWT), the old cached pair must not be
// reused (the old cookie may be gone, so mutations would 403 on CSRF).
let cachedCsrfKey = ''

function adminKey(): string {
  return sessionStorage.getItem('admin_key') ?? ''
}

async function ensureCsrfToken(): Promise<string> {
  const key = adminKey()
  if (cachedCsrfToken && cachedCsrfKey === key) return cachedCsrfToken
  if (csrfFetchPromise) return csrfFetchPromise

  csrfFetchPromise = (async () => {
    const res = await fetch(`${API_URL}/v1/admin/csrf-token`, {
      headers: { 'x-admin-key': key },
      credentials: 'include',
    })
    if (!res.ok) throw new Error(`CSRF token fetch failed: HTTP ${res.status}`)
    const json = await res.json()
    cachedCsrfToken = json.data.csrf_token as string
    cachedCsrfKey = key
    return cachedCsrfToken
  })()

  return csrfFetchPromise
}

// Drop the cached CSRF token so the next mutating call re-fetches a fresh
// cookie+token pair. Call on login and logout — the previous session's
// cached pair would otherwise ride along across a re-login and can mismatch
// the current csrf-token cookie.
export function resetAdminFetchCache(): void {
  cachedCsrfToken = null
  csrfFetchPromise = null
  cachedCsrfKey = ''
}

/** Headers + credentials for a read-only (GET) admin request. */
export function adminGetOptions(): RequestInit {
  return { headers: { 'x-admin-key': adminKey() }, credentials: 'include' }
}

/** Headers + credentials for a mutating (POST/PUT/PATCH/DELETE) admin request. */
export async function adminMutateOptions(): Promise<RequestInit> {
  const csrf = await ensureCsrfToken()
  return {
    headers: {
      'x-admin-key': adminKey(),
      'Content-Type': 'application/json',
      'x-csrf-token': csrf,
    },
    credentials: 'include',
  }
}
