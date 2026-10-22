# Kanchuki — Build Log (part 7)

> Continuation of [`../BUILD-LOG.md`](../BUILD-LOG.md) — started 2026-10-22 because part 6 passed the 150k-char doc limit. Same format: newest entries appended at the bottom.

---

## 2026-10-22 - Web security headers: HSTS, Permissions-Policy, CSP (Report-Only)

**Branch:** `fix/security-headers` (off `main`) · `apps/web/next.config.mjs` only. No migration, no API or mobile change. Hardening, not a bug fix, so no RC entry.

| Piece | Detail |
|---|---|
| Headers added | `Strict-Transport-Security: max-age=31536000` (no `includeSubDomains`) · `Permissions-Policy: camera=(), microphone=(), geolocation=(self)` · `Content-Security-Policy-Report-Only`. Existing `nosniff` / `X-Frame-Options: DENY` / `Referrer-Policy` kept. |
| Origins, checked in code | MSG91 widget script `verify.msg91.com` + fallback `verify.phone91.com` (`src/lib/msg91-widget.ts`) → `*.msg91.com` / `*.phone91.com` in script/style/connect/frame (the widget's own XHR hosts are unknown until reports arrive). Razorpay checkout.js is **not** used by web. Sentry has no tunnel, so the browser posts to the DSN host. Browser presigned PUTs (admin background images, photo-cleanup test) → `*.r2.cloudflarestorage.com`; images `*.r2.dev` + `NEXT_PUBLIC_R2_PUBLIC_URL` + `api.qrserver.com` (survey QR). Admin pages call `NEXT_PUBLIC_API_URL` from the browser. Fonts are self-hosted by `next/font`. Geolocation is used by My Style / nearby stores, getUserMedia nowhere. |
| Env-derived | API, R2 public and Sentry origins come from `NEXT_PUBLIC_*` at `next build` (Next bakes `headers()` into the build), so changing them on Railway needs a rebuild, like every `NEXT_PUBLIC_*`. `report-uri` is derived from `NEXT_PUBLIC_SENTRY_DSN` (`https://<host>/api/<project>/security/?sentry_key=<key>`); with no DSN there is no `report-uri` and violations only show in the console. |
| Deliberate gaps | `script-src 'unsafe-inline'` because App Router emits inline bootstrap scripts; a nonce CSP needs middleware and makes every page dynamic. `'unsafe-eval'` and `ws:` only when `NODE_ENV !== 'production'`. Enforce (rename to `Content-Security-Policy`) only after the Sentry reports are clean. |
| Verified locally | `pnpm build` green. `next start -p 3123`: `/`, `/stores`, `/pricing`, `/faq`, `/for-retailers`, `/survey`, `/admin`, `/my-style`, `/offline`, `/sw.js`, manifest all 200 with the new headers. Headless Chrome on 7 pages: zero CSP report-only violations (local API was not running, so data-backed views were only partly exercised). `next lint`: no new findings. |
| Not verified | No deployed build, no real Sentry report, MSG91 OTP flow not exercised under the policy. Local `pnpm start` fails on Windows (`${PORT:-3000}` is not expanded); Railway is unaffected. |
