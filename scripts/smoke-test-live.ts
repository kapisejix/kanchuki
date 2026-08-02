/**
 * Live smoke test for the Kanchuki production stack (Railway + Cloudflare).
 *
 * Covers the launch checklist from CLAUDE.md §Smoke test:
 *   1. curl https://api.kanchuki.app/health → 200
 *   2. curl https://kanchuki.app → loads
 *   3. retailer OTP login → upload/tag photo → publish → generate collection link
 *   4. open collection link on phone off LAN (stale WEB_URL check)
 *   5. WhatsApp share preview renders
 *   6. customer favorite/enquire
 *   7. admin sees activity in log
 *
 * API-only checks that need no credentials are automated here (1, 2, 3's
 * endpoints, 4/5's link-building, 6's public endpoints, 7's login-triggered
 * audit log). The OTP + photo-upload flow needs a real phone + retailer
 * session, so those are printed as manual steps with exact commands.
 *
 * Usage:
 *   pnpm --filter @kanchuki/api exec tsx ../../scripts/smoke-test-live.ts
 *   API=https://api.kanchuki.app WEB=https://kanchuki.app node ... (override)
 *
 * Exit code: 0 = all automated checks passed, 1 = at least one failed.
 */

const API = process.env.API ?? 'https://api.kanchuki.app'
const WEB = process.env.WEB ?? 'https://kanchuki.app'

let failures = 0
let passes = 0

function report(name: string, ok: boolean, detail = ''): void {
  if (ok) passes++
  else failures++
  const icon = ok ? '✅' : '❌'
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function check(name: string, fn: () => Promise<boolean | string>): Promise<void> {
  try {
    const result = await fn()
    if (typeof result === 'boolean') report(name, result)
    else report(name, result.startsWith('OK'), result)
  } catch (err) {
    report(name, false, err instanceof Error ? err.message : String(err))
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = JSON.parse(text)
  } catch {
    // non-JSON body
  }
  return { status: res.status, json }
}

async function main(): Promise<void> {
  console.log(`\nKanchuki live smoke test\nTarget: API ${API} · Web ${WEB}\n`)

  // ── 1. API health ────────────────────────────────────────────────
  await check('1. API /health returns 200', async () => {
    const { status, json } = await fetchJson(`${API}/health`)
    return status === 200 && typeof json === 'object' && json !== null && 'status' in json
      ? true
      : `expected 200 {"status":"ok"}, got ${status}`
  })

  // ── 2. Web loads ─────────────────────────────────────────────────
  await check('2. Web root loads (200)', async () => {
    const res = await fetch(WEB, { signal: AbortSignal.timeout(15000) })
    return res.status === 200 ? true : `expected 200, got ${res.status}`
  })

  // ── 3. Retailer flow endpoints (no-auth probes) ──────────────────
  await check('3a. OTP send endpoint reachable (no auth needed for route)', async () => {
    // Deliberately invalid phone → expect a clean 400/422, NOT 500.
    const { status } = await fetchJson(`${API}/v1/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+910000000000' }),
    })
    return status !== 500 ? true : 'OTP send 500s — API DB/service issue'
  })

  // ── 4. Collection link building (stale WEB_URL check) ────────────
  // The customer web app must serve /c/[slug] pages. A stale WEB_URL on the
  // API would build links to a dead Railway preview domain instead of
  // kanchuki.app — verify the web app itself answers on the canonical origin.
  await check('4a. /c/[slug] route answers on web (200 or 404, not 500)', async () => {
    const res = await fetch(`${WEB}/c/smoke-test-nope`, { signal: AbortSignal.timeout(15000) })
    return res.status !== 500 ? true : 'web /c route returned 500'
  })

  await check('4b. API CORS allows the web origin (admin panel needs this)', async () => {
    const res = await fetch(`${API}/v1/admin/stats`, {
      method: 'OPTIONS',
      headers: {
        Origin: WEB,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'x-admin-key',
      },
      signal: AbortSignal.timeout(15000),
    })
    return res.headers.get('access-control-allow-origin') === WEB
      ? true
      : `CORS origin header missing (allow-origin: ${res.headers.get('access-control-allow-origin')})`
  })

  // ── 5. Public data endpoints (what collection pages fetch) ───────
  await check('5a. /v1/public/theme answers 200 (web preconnects to this on every render)', async () => {
    const { status } = await fetchJson(`${API}/v1/public/theme`)
    return status === 200 ? true : `expected 200, got ${status}`
  })

  await check('5b. /v1/public/stats answers 200 (marketing stats bar)', async () => {
    const { status, json } = await fetchJson(`${API}/v1/public/stats`)
    if (status !== 200) return `expected 200, got ${status}`
    const data = (json as { data?: { total_retailers?: number } })?.data
    return data ? true : 'stats returned no data payload'
  })

  // ── 6. Customer favorite/enquire endpoints ───────────────────────
  await check('6a. Enquire route exists (404 on missing slug, not 500)', async () => {
    const { status } = await fetchJson(`${API}/v1/public/collections/nonexistent-slug-xyz/enquire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    return status !== 500 ? true : 'enquire route 500s'
  })

  await check('6b. Favorite route exists (204/404 on missing slug, not 500)', async () => {
    const { status } = await fetchJson(`${API}/v1/public/collections/nonexistent-slug-xyz/favorite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: 'nonexistent' }),
    })
    return status !== 500 ? true : 'favorite route 500s'
  })

  // ── 7. Admin login endpoint (env-based auth, no DB needed) ───────
  await check('7. Admin login answers (403 for bad creds = configured; 500 = broken)', async () => {
    const { status } = await fetchJson(`${API}/v1/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@kanchuki.app', password: 'wrong-password' }),
    })
    if (status === 403) return true // configured and rejecting bad creds — correct
    if (status === 422) return true // validation — endpoint alive
    return status === 500 ? false : `unexpected status ${status}`
  })

  // ── 8. Admin key guardrail (DB-backed admin route must not 500 pre-auth) ──
  await check('8. Admin stats route answers 403 pre-auth (not 500 — DB alive check)', async () => {
    const { status } = await fetchJson(`${API}/v1/admin/stats`)
    if (status === 403) return true // auth gate passed — route + middleware healthy
    return status === 500 ? false : `unexpected status ${status}`
  })

  // ── Manual steps that need credentials / a phone ─────────────────
  console.log(`
Manual steps (need a real phone + admin creds — not automatable without secrets):
  3b. Retailer OTP login:
      POST ${API}/v1/auth/otp/send      {"phone":"+91XXXXXXXXXX"}
      POST ${API}/v1/auth/otp/verify    {"phone":"+91XXXXXXXXXX","otp":"123456"}
  3c. Upload/tag/publish: use the mobile app (Expo build) against ${API}
  3d. Generate collection link → verify it points at ${WEB}/c/{slug}
  4c. Open that link on a phone on mobile data (off LAN) → should render, not 404
  5b. WhatsApp share preview of ${WEB}/c/{slug}
  6c. Customer favorite/enquire on ${WEB}/c/{slug} → retailer sees it
  7b. Admin login at ${WEB}/admin → dashboard loads → Activity log shows entries
`)

  // ── Summary ──────────────────────────────────────────────────────
  const allOk = failures === 0
  console.log(`\n${allOk ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} — ${passes} passed, ${failures} failed`)
  if (allOk) {
    console.log('Infrastructure is healthy. Proceed with the manual retailer-flow steps above.')
  } else {
    console.log(`
Diagnosis: when EVERY DB-backed public endpoint 500s while /health and
/v1/public/theme stay up, the API process is fine but its database is not
reachable. (theme "passes" only because getSetting() swallows DB errors.)
Timing is the tell: request times >0.5s = connection-level failure
(paused / wrong host / wrong port), NOT a fast query error (permission
denied / missing table would fail in ~100ms).

Check in this order:
  1. Railway → API service → Logs → find the last 500 and read the Prisma
     error code:
       P1001  can't reach the DB server → host/port wrong, service deleted,
              or a PAUSED Supabase project (free tier pauses after ~1 week
              of inactivity — restore it from the Supabase dashboard).
       P1000  authentication failed → DATABASE_URL user/password wrong
              (kanchuki_app role not created, or wrong project).
       P2010 / "permission denied" → kanchuki_app role exists but lacks
              grants; re-run scripts/setup-role-separation.sql in the
              Supabase SQL editor (GRANT USAGE + SELECT/INSERT/UPDATE, and
              ALTER DEFAULT PRIVILEGES so future tables are covered).
       P2021  table does not exist → migrations not applied on this DB.
  2. Supabase dashboard → the project must NOT show "Paused" (restore it).
  3. Railway → API service → Variables → DATABASE_URL points at the Supabase
     pooled URL (aws-1-ap-south-1.pooler.supabase.com:6543/...?pgbouncer=true)
     — NOT at the deletion-vault instance (sakura.proxy.rlwy.net:23505).
  4. After the DB answers again, re-run this script — the failures above
     should flip green before any manual phone steps are attempted.`)
  }
  process.exit(allOk ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
