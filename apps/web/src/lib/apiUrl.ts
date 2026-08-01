// Server-side fetches to the api service.
//
// API_URL (plain, non-NEXT_PUBLIC var) is read at RUNTIME, so changing it on
// Railway fixes /c/[slug], /store/[slug], /api/* proxy routes WITHOUT a web
// rebuild — the API domain has changed before (supportive-love-production-
// 293a → -9d37) and a stale build-time value silently broke every customer
// page with "Collection Not Found".
//
// NEXT_PUBLIC_API_URL is inlined at BUILD time and is the var the browser
// needs, so it stays as the server-side fallback. The server checks API_URL
// first so one runtime env var can override a stale baked-in build.
// `||` (not `??`) so a defined-but-empty API_URL="" falls through instead of
// becoming the base URL and breaking every server fetch.
export const API_URL =
  process.env['API_URL'] || process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'
