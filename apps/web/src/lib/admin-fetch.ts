// Shared admin-panel fetch headers. Every mutating admin route (POST/PUT/
// PATCH/DELETE) requires an x-csrf-token header matching the csrf-token
// cookie the API sets on login (see apps/api/src/routes/admin.ts). That
// cookie is httpOnly, so credentials: 'include' on the fetch call is what
// actually sends it back — omitting it (as most admin pages historically
// did, copy-pasting a local getHeaders()) makes every write 403.
const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

let cachedCsrfToken: string | null = null
let csrfFetchPromise: Promise<string> | null = null

function adminKey(): string {
  return sessionStorage.getItem('admin_key') ?? ''
}

async function ensureCsrfToken(): Promise<string> {
  if (cachedCsrfToken) return cachedCsrfToken
  if (csrfFetchPromise) return csrfFetchPromise

  csrfFetchPromise = (async () => {
    const res = await fetch(`${API_URL}/v1/admin/csrf-token`, {
      headers: { 'x-admin-key': adminKey() },
      credentials: 'include',
    })
    if (!res.ok) throw new Error(`CSRF token fetch failed: HTTP ${res.status}`)
    const json = await res.json()
    cachedCsrfToken = json.data.csrf_token as string
    return cachedCsrfToken
  })()

  return csrfFetchPromise
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
