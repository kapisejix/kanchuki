// Server-side fetches to the api service. NEXT_PUBLIC_API_URL is the var
// actually set on Railway (also needed client-side) — API_URL was a
// server-only duplicate that was never configured, silently falling back
// to localhost:3001 in prod and breaking every /c/[slug], /store/[slug]
// etc. route. Check NEXT_PUBLIC_API_URL first so one env var covers both.
export const API_URL =
  process.env['NEXT_PUBLIC_API_URL'] ?? process.env['API_URL'] ?? 'http://localhost:3001'
