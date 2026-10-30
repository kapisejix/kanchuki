# 00 — Hacker report (merge of H1–H8)

Date: 2026-10-26. Branch `fix/team-otp-fail-closed-rc085`. Sources: `H1-auth-sessions.md` … `H7-mobile-app.md`, `H8-infra-secrets.md`. Cross-refs: `SC-ai-era-checklist-gaps.md`, T1.8, T2.5, T2.6, T2.8.
Method: code/config review plus local Fastify `inject()` harnesses. Nothing was run against production. "Plausible" means the code path is certain but no live request proved it.

## Executive summary (for the owner)

1. **Rotate every database password today.** Five Supabase role passwords, including the `postgres` superuser, are in the public git history (H8-1, SC-1). Rotation is the fix; no code change helps.
2. Five auth bugs are already fixed on this branch (RC-085..RC-089), but they are **not deployed yet**.
3. Three High bugs are still open: a URL-encoding trick that gets past the Super-Admin gate (H3-1), a public form that pulls any shopper's phone into another store's customer list (H4-1), and an AI Studio quota with no limit, so free accounts get unlimited paid AI images (H6-1).
4. Most other findings are staff/delegate overreach, cost abuse (SMS, AI), or private photos (Aadhaar KYC, try-on) stored in a public bucket. Each fix is small.
5. Several severities depend on dashboard settings only you can see; see "Owner checks". Keep the repo private or unpushed until batch 1 ships (SC-2).

## Status per finding

| ID | Sev | Status |
| --- | --- | --- |
| H1-1 Team OTP/reset fail open to `123456` | Critical | Fixed (RC-085), not deployed |
| H1-2 Team login skips admin rate limit | High | Fixed (RC-087), not deployed |
| H1-3 Plaintext OTP in prod logs | High | Fixed (RC-086), not deployed. Owner-action: purge/limit Railway log retention |
| H1-4 Retailer OTP brute force, no daily cap, spoofable IP key | Medium | Open |
| H1-5 `OTP_TEST_BYPASS` wildcard, no prod guard | Medium | Fixed (RC-088), not deployed. Owner-action: confirm bypass unset in prod |
| H1-6 Admin JWT forgeable with empty `ADMIN_API_KEY` | Medium | Fixed (RC-089), not deployed. Owner-action: confirm key set, ≥32 chars |
| H1-7 Apple review code has no attempt limit | Medium | Open (only while `REVIEW_*` vars are set) |
| H1-8 One shared admin password, no 2FA, no revocation | Low | Open |
| H1-9 MSG91 widget token replay | Low | Open (could not verify) |
| H2-1 … H2-6 | Med/Low | Open |
| H3-1 Percent-encoded path skips Super-Admin gate | High | Fixed (RC-090), not deployed |
| H3-2 Admin gate deny-list, `SUPPORT_MANAGER` full power | Medium | Fixed (RC-091), not deployed |
| H3-3 Admin gate trusts JWT role, no DB re-check | Medium | Fixed (RC-092), not deployed. Follow-up open: `team-helpers.ts:76` `verifyAdminSession` still trusts the JWT role |
| H4-1 Leads route trusts body `customer_account_id` | High | Fixed (RC-093), not deployed |
| H4-2 `/v1/customers` leaks `phone_hash` + `customer_account_id` | Medium | Fixed (RC-096), not deployed |
| H4-3 Anonymous reviews | Medium | Fixed (RC-098, RC-099), not deployed. Owner-action: apply migration 139 |
| H4-4 Legacy lead form overwrites customers, forges consent | Medium | Fixed (RC-094), not deployed |
| H4-5 Passport events accept any `retailer_id` | Low | Fixed (RC-095), not deployed. Known gap: store-level events can still be attributed to any real retailer |
| H4-6 `near-me` exposes login phone | Low | Fixed (RC-097), not deployed |
| H4-7, H4-8 | Low | Open |
| H5-1 … H5-5 | Med/Low | Open (H5-1 Owner-action) |
| H6-1 STUDIO_SHOOT quota fails open on missing `plan_limits` row | High | Fixed (RC-103), not deployed. `METERED` guard in `effectiveLimit` / `effectiveCustomerLimit` covers check, all reserve functions and both status readers; studio-shoot route 10/min. **Owner-action BEFORE deploy:** seed `STUDIO_SHOOT`, `BG_REMOVAL`, `IMAGE_CROP` (and `TRY_ON_GENERATION` if missing) for all three plans in Admin → Plan Limits, or those features refuse everyone |
| H6-2 Burst overshoots an AI cap | Medium | Partly fixed (RC-102): reserve-at-enqueue for Studio Shoot, My Style, try-on, social templates, POST /products, growth AI routes. Tagging and catalog-import AI checks left on check-then-increment. Mock tests only; scratch-DB run pending; migration 145 not applied in prod |
| H6-3, H6-4 | Low | Open |
| H7-1 … H7-4 | Med/Low | Open (H7-1, H7-4 Owner-action) |
| H8-1 … H8-6 | Crit/Med/Low | Open (H8-1 Owner-action only) |
| SC-1 / SC-2 (supply-chain report) | P0 | Open, Owner-action (rotate; make repo private) |

## Ranked open findings (H1–H8)

Effort: S ≤ ½ day, M ≤ 2 days, L > 2 days. Owner = needs a dashboard/config action or decision before or instead of code.

| # | ID | Sev | Issue | Effort | Owner |
| --- | --- | --- | --- | --- | --- |
| 1 | H8-1 | Critical | `postgres` superuser + `vault_app` passwords (plus app/migrator/purge, SC-1) in public git history, commits `541f312f`, `f624324a` | S | y |
| 2 | ~~H3-1~~ | High | Percent-encoded path segment skips the Super-Admin gate (Confirmed, local harness). Fixed RC-090, not deployed | S | n |
| 3 | ~~H4-1~~ | High | Leads route trusts body `customer_account_id`: any store pulls a shopper's phone and forges consent. Fixed RC-093, not deployed | S | n |
| 4 | ~~H6-1~~ | High | STUDIO_SHOOT quota fails open on a missing `plan_limits` row: unlimited paid AI for free accounts. Fixed RC-103, not deployed (seed Plan Limits first) | S | y |
| 5 | H8-2 | Medium | V-Tone (Hetzner, port 8000, plain HTTP): auth fails open when its secret is unset; `/try-on` fetches any URL (SSRF) | S | y |
| 6 | H5-1 | Medium | Aadhaar KYC scans and try-on results in the public R2 bucket | M | y |
| 7 | H7-1 | Medium | MSG91 widget credentials public: SMS pumping / OTP bombing that skips every API limit | S | y |
| 8 | ~~H3-2~~ | Medium | Admin gate is a deny-list; `SUPPORT_MANAGER` gets full standard-admin power (Confirmed, local harness). Fixed RC-091, not deployed | S | y (role decision) |
| 9 | ~~H3-3~~ | Medium | Admin gate trusts the team JWT role with no DB re-check. Fixed RC-092, not deployed (follow-up open: `team-helpers.ts:76`) | S | n |
| 10 | ~~H4-2~~ | Medium | `/v1/customers` leaks `phone_hash` + `customer_account_id` to masked staff. Fixed RC-096, not deployed | S | n |
| 11 | ~~H4-3~~ | Medium | Anonymous reviews: fake ratings, overwrite a real review, rename CRM customers. Fixed RC-098/099, not deployed (needs migration 139) | M | n |
| 12 | ~~H4-4~~ | Medium | Legacy lead form overwrites existing customers and forges consent. Fixed RC-094, not deployed | S | n |
| 13 | H6-2 | Medium | Check-at-route / count-at-job-end lets a burst overshoot any AI cap. Partly fixed RC-102 | M | n |
| 14 | H5-2 | Medium | detect-items and catalog presigns write unverified bytes to the public CDN | M | n |
| 15 | H5-3 | Medium | No pixel cap: decompression bomb against compress cron, ffmpeg, templates, My Style | S | n |
| 16 | H2-1 | Medium | Cross-tenant products injected into own A/B variant collection | S | n |
| 17 | H2-2 | Medium | Support session / catalog delegate reach bulk-delete and WhatsApp bulk-send | S | y (delegate scope) |
| 18 | H1-4 | Medium | Retailer OTP: no daily cap, per-IP key spoofable (T1.8 F4) | S | y (trustProxy) |
| 19 | H1-7 | Medium | Apple review code has no attempt limit | S | y (unset vars after review) |
| 20 | H8-3 | Low | CORS regex allows any `*.kanchuki.app` over plain `http` with credentials (Confirmed, local harness) | S | n |
| 21 | H4-8 | Low | Shopper OTP send has no per-route limit (SMS pumping) | S | n |
| 22 | H6-3 | Low | `plan-lapse` never lapses an ACTIVE plan whose paid period ended | S | n |
| 23 | H6-4 | Low | Self-referral check bypassed by a second phone with no GSTIN | M | n |
| 24 | H2-3 | Low | Delegates spend paid-AI quota (RC-068 shape outside try-on) | S | n |
| 25 | H2-4 | Low | Product update skips section/category/background ownership checks | S | n |
| 26 | H2-5 | Low | `GET /retailers/me` over-shares to staff and delegates | S | n |
| 27 | H2-6 | Low | Duplicate-phone error lets staff probe whether a number is a customer | S | n |
| 28 | ~~H4-5~~ | Low | Passport wishlist / recently-viewed / events accept any `retailer_id`. Fixed RC-095, not deployed | S | n |
| 29 | ~~H4-6~~ | Low | `near-me` exposes the retailer's login phone. Fixed RC-097, not deployed | S | n |
| 30 | H4-7 | Low | Passport session ids stored in plaintext | M | y (migration revokes sessions) |
| 31 | H5-4 | Low | SSRF blocklist gaps in `ssrfSafeFetch` | S | n |
| 32 | H7-2 | Low | OAuth code and staff-invite token go over a hijackable custom scheme | M | n |
| 33 | H7-4 | Low | Release keystores in the repo working tree | S | y |
| 34 | H8-4 | Low | `/health` (anonymous) returns raw DB/Redis error text (host, port) during an outage | S | n |
| 35 | H8-5 | Low | Redis TLS depends on the prod URL scheme; DEPLOY.md documents plaintext `redis://` | S | y |
| 36 | H8-6 | Low | CI: no `permissions:` block; third-party action pinned by tag in the job holding `RAILWAY_TOKEN` | S | n |
| 37 | H1-8 | Low | One shared admin password, no 2FA, no session revocation | L | y (design) |
| 38 | H1-9 | Low | MSG91 widget token replay (could not verify) | S | y (MSG91) |
| 39 | H5-5 | Low | Ken Burns raw `fetch(photo.url)` fallback (hardening, not exploitable) | S | n |
| 40 | H7-3 | Low | No certificate pinning (informational, not exploitable) | — | n |

**Reconciled 2026-10-29 against the CLAUDE.md RC tracker.** Rows 2, 3, 4, 8, 9, 10, 11, 12, 28, 29 below are Fixed locally (RC-090 … RC-098, RC-103), not deployed; row 13 (H6-2) is partly fixed (RC-102). They are kept for history and excluded from the totals.

**Totals (open): Critical 1, High 0, Medium 10, Low 19 = 30** (was 40; 10 fixed). H6-2 is counted as open until RC-102 is verified on a real DB. Dependency CVEs: see `H8-infra-secrets.md` §CVE (not in these counts). SC-1, SC-2 (P0, owner) tracked in the SC report.

## Owner checks (dashboard-only facts that set the severity)

| # | Check | Decides |
| --- | --- | --- |
| 1 | Supabase: rotate `postgres`, `kanchuki_app`, `kanchuki_migrator`, `kanchuki_purge`, `vault_app` passwords with generated random values (not a pattern); update Railway env; read Supabase pooler/auth logs for unknown IPs since 2026-07-26 | H8-1, SC-1 |
| 2 | GitHub: make `kapisejix/kanchuki` private; check GHCR package `kanchuki-tryon` visibility | SC-2, all |
| 3 | Railway: purge/limit log retention (old logs hold OTPs) | H1-3 / RC-086 |
| 4 | Railway prod env: `OTP_TEST_BYPASS` unset, `REVIEW_PHONE`/`REVIEW_OTP` unset outside App Review, `ADMIN_API_KEY` ≥32 chars | H1-5, H1-6, H1-7 |
| 5 | Staging request with `X-Forwarded-For: 203.0.113.7`: does Railway's edge overwrite or append? Then set `trustProxy` to the hop count | T1.8 F4, T2.5 F1, H1-4, H4-8 |
| 6 | R2: is the bucket public (r2.dev or custom domain)? Any WAF/deny rule on `kyc/` and `tryon/`? | H5-1 |
| 7 | R2: lifecycle rule expiring `uploads/pending/` | H5 A4 |
| 8 | Admin → Plan Limits: `STUDIO_SHOOT`, `BG_REMOVAL`, `IMAGE_CROP` rows exist for all three plans | H6-1 (set **before** the fail-closed guard deploys) |
| 9 | MSG91: widget per-number/per-IP limits, India-only routing, rotate the widget token | H7-1, H1-9 |
| 10 | EAS: credentials hold the release signing key, so the in-tree keystores can be deleted | H7-4 |
| 11 | Hetzner: `VTONE_SHARED_SECRET` set on the V-Tone box; firewall port 8000 to known IPs or put Caddy (TLS) in front | H8-2 |
| 12 | Railway API env: `REDIS_URL` scheme is `rediss://` (TLS) | H8-5 |
| 13 | Edge headers: HSTS on `kanchuki.app` (`curl -sI`) | T2.8 F4 |
| 14 | Decide `SUPPORT_MANAGER` scope and catalog-delegate delete scope | H3-2, H2-2 |

## Attack chains

```mermaid
flowchart LR
  subgraph A["Chain A: free unlimited paid AI"]
    A1[Any phone number] --> A2[OTP signup: 14-day STARTER trial]
    A2 --> A3[No STUDIO_SHOOT plan_limits row: quota fails open, H6-1]
    A3 --> A4[Parallel burst: counted only at job end, H6-2]
    A4 --> A5[FLUX/Gemini bill spike; RC-081 is an alert, not a cap]
    A2 -.-> A6[Plan never lapses if ACTIVE, H6-3]
  end
  subgraph B["Chain B: SMS pumping"]
    B1[Public repo, SC-2] --> B2[MSG91 widget id + token in app bundle, H7-1]
    B2 --> B3[Call MSG91 directly: no API limits apply]
    B4[Spoofed X-Forwarded-For, T1.8 F4] --> B5[New IP per request on OTP send, H1-4, H4-8]
    B3 --> B6[SMS credit burned / victim OTP-bombed]
    B5 --> B6
  end
  subgraph C["Chain C: full data theft"]
    C1[Public repo history, SC-2] --> C2[DB passwords incl. postgres superuser, H8-1, SC-1]
    C2 --> C3[Connect to Supabase pooler: internet-reachable by design]
    C3 --> C4[Bypass RLS + role separation: all retailers, shopper phones, KYC rows, vault]
    C3 --> C5[Read KYC/try-on R2 keys, fetch from public bucket, H5-1]
  end
```

Chain C works only if the passwords were never rotated; owner check 1 closes it. Chain B's API half closes with the `trustProxy` decision plus per-route limits; the widget half needs MSG91-side limits.

## Fix order (each batch = one PR, smallest blast radius first)

| Batch | Contents | Owner action first? |
| --- | --- | --- |
| 0 | Rotate DB passwords, make repo private, purge logs (owner checks 1–3). No code | **Yes, owner only** |
| 1 | Deploy this branch as is (RC-085..RC-089), already fixed and tested | Owner check 4 before deploy |
| 2 | Admin gate: H3-1 (classify on matched route), H3-3 (DB role re-read), H3-2 (allow-list) | H3-2 needs the role decision; H3-1/H3-3 can ship alone |
| 3 | Public-form trust: H4-1, H4-4, H4-3, H4-5 (session-derived ids, no body ids) + H4-2, H4-6 masking | No |
| 4 | Quotas: H6-1 fail-closed guard, H6-2 reserve-at-route, H6-3 lapse, H2-3 delegate role check | **Yes:** owner check 8 before deploy, or every studio shoot starts failing |
| 5 | SMS/OTP limits: H1-4 daily cap, H4-8 per-route limit, H1-7 attempt limit, `trustProxy` hop count | Owner check 5 |
| 6 | Uploads: H5-3 pixel cap, H5-2 verify bytes, H5-4 SSRF blocklist, H5-5 | No |
| 7 | Private media: H5-1 move `kyc/`, `tryon/` to a private bucket + signed GET | Owner checks 6–7; may need a data move |
| 8 | Staff scope: H2-1, H2-2, H2-4, H2-5, H2-6 | H2-2 delegate decision |
| 9 | Infra: H8-3 CORS regex, H8-4 `/health`, H8-6 CI permissions/pins, H8-2 V-Tone fail-closed + URL allow-list | H8-2: owner check 11 (secret set) before fail-closed ships |
| 10 | Mobile: H7-2 App Links for OAuth/invite, H7-4 remove keystores, H7-1 widget rotation | Owner checks 9–10 |
| 11 | Design items: H1-8 admin 2FA/revocation, H4-7 hashed passport sessions (migration), H6-4 referral | Owner approval (migration, design) |

Not done: no finding was re-verified at runtime during the merge; statuses come from each H report.

## T1-T3 status (checked 2026-10-29)

Source: each T report's own status text plus the CLAUDE.md RC tracker. Code was not re-read, so "open" means "the report says proposed, not applied, and no RC covers it".

Fixed:
- T2.5 F2, F3, F4 (web proxy: reviews path encoding, multi-cookie, cache headers): RC-084, applied 2026-10-25.
- T1.3 F1 (`customers.ts` masked-staff `phone_hash` leak): same root as H4-2, fixed by RC-096, not deployed.
- T1.1: `lint` scripts added to `packages/ai` and `packages/shared`, safe fixes applied. ai still 42 errors, shared 2 (deferred P2).

Open, P1: none left. Batch 4 is applied locally (below).

Fixed 2026-10-29 (Batch 4 mobile behaviour, local, not deployed, not committed):
- T3.5-a (onboarding swallows the 422 GSTIN error): RC-114. Only onboarding was swept for the `catch {}` shape.
- T3.7-a and T3.7-b (never detects offline, Mark Sold queued every failure and retried 4xx forever): RC-115. The detector was the bigger fault: with no offline signal the replay queue never ran at all. Adds `expo-network`, a native module, so it **needs an EAS rebuild** before the OTA/binary that includes it ships. The queue-file-survives-logout part of b was already fixed by RC-107.
- T3.7-c (keyboard covers inputs): RC-116. Also fixed the Edit Collection dialog, found by the new guard arm.
- T3.5-a follow-up (the `catch {}` sweep RC-114 left open): RC-117. The rule moved into `showError` itself, so every screen that calls it now shows a 4xx reason; the inline copies in help-support, staff, settings, plan-select, aggregators, templates and try-on are deleted, and the OTP-resend and try-on-payment bare catches call `showError`. Left on purpose: Facebook/Instagram/social connect (native SDK errors) and `auth/phone.tsx`. Falsified by reverting the `showError` line (4xx test goes red). Not device-tested; assumes API 4xx messages are user-readable.
- Verified: mobile vitest 258 pass (38 of 39 files at the time; the 39th, `__tests__/smoke/rc-screens.test.tsx`, was `__DEV__ is not defined`, now fixed, see the follow-up below). Not verified: any device (airplane-mode replay, keyboard on iOS/Android).

Follow-up 2026-10-29 (local, not deployed, not committed):
- T1.7 F1 sweep (bare `fetch` with no timeout in 8 more API files, 16 call sites): RC-118. Guard test added; falsified by removing one import. T2.4 (admin CSRF) re-audited across every mutating fetch under `apps/web/src/app/admin`: no further misses, no change.
- T3.5 d-h (P2 batch, mobile): d = RC-121 (`sendCampaign` 120 s + "may still be sending" copy), h = RC-120 (OTP resend sync ref), f and g (inline `setError` constants) = RC-122; e and the try-on half of g were already fixed by RC-117. Source pins in `__tests__/t35-p2-pins.test.ts`, each falsified. Left: the bulk-onboard stats swallows (fixed later as RC-136).
- RC-119 addendum: the keyboard guard's pin list is now derived (input components under `src/` to a fixpoint, every `app/` importer must wrap); falsified on `growth/ratings` and `onboarding`. Only `ReportProblem` stays pinned.
- RC-118 addendum: `lib/meta-catalog.ts` now defaults to a 15 s timeout (caller `signal` still wins); its only importer already passed a signal. The guard is now per call (each `fetch(` needs its own `AbortSignal.timeout`/`any`, or the file aliases `fetchWithTimeout as fetch`); the 14 files it used to exempt were read and all already had per-call timeouts. Falsified on `fal-client`.
- T3.6 b, d (P2): b = RC-124 (`allowBackup: false` in `app.json`; **needs an EAS rebuild**), d = RC-123 (dead `admin_key` / `x-admin-key` branch removed from `teamRequest`). Source pins in `__tests__/t35-p2-pins.test.ts`, each falsified. T3.6 c (26 unguarded `console.*`): `babel.config.js` now strips `console.log/warn/info/debug` in the production env (`console.error` kept; new devDependency `babel-plugin-transform-remove-console`), plus a drift pin that fails if an unguarded `console.*` call passes a token/otp/phone/credential identifier. No leak existed today, so no RC. The pin was falsified (it first passed on a camelCase `authToken` leak because of `\b`, then fixed); not device-checked, release bundles only.
- T3.4 c, d (P2): c = RC-127 (the report named `growth-gst.ts`; the same `z.coerce.boolean()` was at seven sites in six API files, all fixed through one `queryBool()` plus a guard), d = RC-128 (`FREE_SIZE` / stock max moved to `@kanchuki/shared`). Tests falsified; API and mobile `tsc` clean. **T3.4 b left open on purpose: the GST screen labels the retailer's own subscription payments "Sales" / "Walk-in Client", a product-copy decision for the owner.**
- T3.7 d, e (P2, mobile): d = RC-126 (`onRequestClose` on both `category/new.tsx` pickers), e = RC-125 (release text for `TIMEOUT` / `NETWORK_ERROR` in `client.ts`, URL text under `__DEV__`; the `settings` / `staff` / `ai-campaign` callers were already fixed by RC-117, `useProductAiStudio` was the live leak). Source pins in `__tests__/t35-p2-pins.test.ts`, each falsified; mobile `tsc` clean. Not device-tested.
- T3.3 a (P2, mobile): RC-129, 30 dead `growthApi` methods (referrals, suppliers, bookings, partners, incentives) and their types deleted from `growth.ts`; guard `__tests__/t3-3-client-routes.test.ts`, falsified (only the absence pin trips; the derived server-route check is substring-loose). Mobile `tsc` clean. T3.3 b-d also done: 13 uncalled client methods + `FbAdCampaign` deleted, 2 unused files removed, 4 unused deps removed (`pnpm-lock.yaml` updated); pins falsified. T3.4 b done (owner chose relabel): RC-130, `GstTransaction.customer` dropped, GST row reads "Kanchuki subscription".
- T3.7-c sweep (inputs owned by child components): RC-119, `growth/ratings` now wrapped. Other `src/` input components' host screens already wrapped.
- Falsification of RC-114, RC-115, RC-116 tests, each fix reverted then restored: RC-115 `isRetryable` (4 cases + replay case red), RC-115 `setupOnlineManager` (red), RC-115 dequeue line (red, isolated), RC-116 guard (red). RC-114 had a gap: its tests covered `apiMessage` only, so reverting an onboarding catch stayed green; a source-pin for the three onboarding catches was added and then falsified (red).
- `rc-screens.test.tsx` now loads and passes (5/5): `__DEV__` via `vi.hoisted`, `expo-file-system` mocked, real `ApiError` in the RC-009 case, RC-008 fixture converted to paise (it had been stale since RC-109). Checked against `main` 2026-10-29 (`0b886a3e`, throwaway worktree): `main`'s own `rc-screens.test.tsx` passes 5/5 there, and the same file run against this branch's code fails to load with `ReferenceError: __DEV__ is not defined`. So the breakage was NOT pre-existing: it came in with this branch (RC-117's `showError` reads `__DEV__`; RC-109 changed the money fixtures), and the test edits above were the fix. No app bug; test-environment only. The 3 typed-route `tsc` errors were a stale gitignored `.expo/types/router.d.ts` (Oct 16, older than the `/enquiries` routes); regenerated by a 60 s `expo start`, mobile `tsc --noEmit` is now clean.
- Verified: API 183 pass across the 10 related suites, API `tsc` clean; mobile 184 pass across `src/lib`, `src/hooks`, the keyboard guard and `rc-screens`, mobile `tsc` clean. Not verified: any device, real Meta/Google/Razorpay/WhatsApp, Postgres.

Fixed 2026-10-29 (Batch 1, local, not deployed, not committed):
- T2.8 F2 (sitemap lists shopper-specific collections): RC-105.
- T2.8 F1 (service worker caches personal responses): RC-106.
- T3.6-a (forced logout keeps old account data): RC-107.

Fixed 2026-10-29 (Batch 2 money and Batch 3 admin + observability, local, not deployed, not committed):
- T1.8 F1 (add-on callback 401 before the handler): RC-108.
- T3.4-a (GST report shows paise as rupees, mobile and admin web): RC-109.
- T1.7 F1 and T3.5-c (outbound fetch with no timeout; Resend, Meta Graph, Razorpay, mobile pay): RC-110.
- T3.5-b (campaign sent twice): RC-111. No migration was needed; `SENT` already exists, so the claim is a conditional update before dispatch.
- T2.4 F1, F2, F3 (admin SQL console and social Disconnect skip CSRF, failure swallowed, rejected token cached): RC-112.
- T1.4 F1 (failed BullMQ jobs never reach Sentry): RC-113.
- Verified: API tests 85 passed in the changed suites and 792 across plugins, jobs, team, retailers and meta-graph, web 6 and mobile 3 new tests pass, API and web `tsc` clean, mobile `tsc` shows only the 3 typed-route errors already open. Nothing was run against real Postgres, Razorpay, Meta, a browser or a device.

All 15 P1s above were re-read against current code on 2026-10-29 and were still real before Batch 1.

Tests added 2026-10-29 (no bug found, so no RC): T3.2-a #1 `__tests__/auth/phone-screen.test.tsx` (4 tests: RC-015 double-send, RC-021 widget/API single dispatch + fallback, bypass, timeout then retry). Each guard in `app/auth/phone.tsx` was broken in turn and failed a test, then restored. Mobile `tsc` clean, vitest 42 files / 321 tests. Not device-tested; `GradientButton` is mocked.

T3.2-a #2 `app/plan-select.tsx` switch flow: 4 tests appended to `__tests__/smoke/rc-screens.test.tsx` (TRIAL and ACTIVE rows ask first, then `cancel` before `subscribe`; CANCELLED subscribes directly with no cancel; cancel ok + subscribe fails shows the server reason, no retry, no rollback, which pins the report's "left cancelled" behaviour). Four breaks in `plan-select.tsx` (`hasLiveSubscription` forced false, forced true, `cancel()` dropped, switch-flow error alert dropped) each failed tests, then restored. Mobile `tsc` clean, vitest 42 files / 325 tests. Not device-tested; `Alert` and `Linking` are spies.

T3.2-a #3 `app/billing.tsx`: 8 test cases appended to `__tests__/smoke/rc-screens.test.tsx` (status label + body copy for TRIAL/ACTIVE/PAST_DUE/CANCELLED/COMPLETED, RC-033 ended-plan copy; no-data Starter fallback; "Manage my plan" pushes `/plan-select`; support row opens the exact `mailto:`). Correction to the T3.2 table row #3: billing.tsx has no `WEB_URL` hand-off; its only `Linking.openURL` is the `mailto:` at `:115`. Four breaks (ended label, ended body copy, route, mailto subject) each failed tests, then restored. Mobile `tsc` clean, vitest 42 files / 333 tests. Not device-tested.
Found, not fixed (P3 copy): `billing.tsx:101-103` still says "switch billing period"; annual plans were removed 2026-09-01 (monthly-only, CLAUDE.md #59). No RC minted.

T3.2-a #4 `app/onboarding.tsx` steps 1-4: 5 tests appended to `__tests__/smoke/rc-screens.test.tsx`, driving the real screen (step 1 Next needs a 2+ char name AND consent; steps 1-4 save then record progress in order, ending with the picked plan; Free Demo sends `demo_plan`; a rejected GSTIN shows the server reason, skips `updateOnboarding(3)` and stays on the GST step; an empty GSTIN is optional). Harness additions: `updateOnboarding`/`getQrSlug` on the hoisted `retailerApi` mock, a `referral-capture` mock, and `BackHandler` added to the shared RN mock (`src/test/__mocks__/react-native.ts`; the screen threw on mount without it). Six breaks (consent gate, plan→demo, swallowed GSTIN error, unconditional GSTIN save, plan not required, `updateOnboarding(2)` dropped) each failed tests, then restored. Mobile `tsc` clean, vitest 42 files / 338 tests. Not covered (#4b): step 5 (`saveFinalStep`, QR slug best-effort, confetti + 1.5 s timed redirect; needs fake timers). Not device-tested.

T3.2-a #5 `app/enquiries.tsx`: 17 test cases appended to `__tests__/smoke/rc-screens.test.tsx` (rows + empty state; Take only on unassigned rows; Take sends the id once and refreshes `['enquiries']`; double tap sends one request (RC-015); `ENQUIRY_TAKEN` shows "Already taken", not the generic error; other errors show the 4xx reason or the 5xx fallback; status buttons send collection id + enquiry id + status and the active one is disabled; Reassign hidden for salesperson, shown for manager and owner, and picking an assignee calls `assignEnquiry`; Try-on button needs owner/manager AND `VIRTUAL_TRY_ON_V2`, hides with no products, and passes product ids + names only, never phone or name). Four breaks in `enquiries.tsx` (the `inFlight` check, the `ENQUIRY_TAKEN` branch, `canAssign`, the feature-flag check) each failed exactly one test, then restored (`cmp` clean). Harness: the shared RN mock's `FlatList` now renders rows via `renderItem` / `ListEmptyComponent` (it rendered nothing before); `useAuth` mock reads a hoisted `authState.staffRole`; `useQueryClient` mock exposes a shared `invalidateMock`. Correction to the T3.2 table row #5: the screen does not mask phones, the server does (RC-066), so "salesperson sees masked phone" is a server concern; the screen test pins the role gates instead. No bug found, no RC. Mobile `tsc` clean, vitest 42 files / 355 tests. Not device-tested.

T3.2-a #6 `app/social/create.tsx` (Composer): new `__tests__/social/create-screen.test.tsx`, 20 tests (separate file: the screen needs `useQueries` and a stubbed `components/social` barrel that `rc-screens` does not have). Pins: no-accounts prompt; RC-023 default `storefront` link and the exact SINGLE_PRODUCT payload; product-link falls back to storefront when switching to Carousel; RC-061 main video sent as `video_id` and previewed with a poster, carousel photos only; RC-022 collection link card is Facebook-only, `items: []`, cover-photo preview, and the Photo-carousel format re-adds Instagram and posts the collection photos as CAROUSEL; carousel needs 2+ photos; validation messages and the disabled Publish; R-13 retry id (transient failure keeps it, definitive result spends it, empty-results replay keeps it, caption edit mints a new one, two taps in one tick carry the same id); all-failed 400 rows open the result sheet with no alert; Done goes back only when all POSTED; deep links `product_ids`, `design_id` (IMAGE, `image_url` only), `collection_id` (cold cache). Six breaks in `create.tsx` (default link, id cleared on every outcome, IG filter, problems gate, link fallback, carousel video drop) each failed the intended tests, then restored (`cmp` clean). Note: Publish is guarded by `publishing` STATE, so two taps in one tick both send; they carry the same `client_post_id`, so the server dedupes (pinned, not changed).

**FOUND AND FIXED (RC-131):** `collection_id` deep link with the collections list already cached (user visited Collections first) opens the composer in collection mode with NO collection chosen ("Choose a collection to share."). Root cause: the "resolve `pendingCollectionId`" effect (`create.tsx:297`, deps `[collections]`) runs before the prefill effect (`:340`) sets the ref and never re-runs because `collections` is referentially stable. Cold cache works (list arrives later). Fixed: deps `[collections, postType]`; the pinning test was written as `it.fails`, went green with the fix (now a plain `it`), and goes red if the dependency is reverted. Sibling check: no other `pending*` ref in `apps/mobile/app`. Mobile `tsc` clean, vitest 43 files / 375 tests. Not device-tested.

T3.2-a #7 `app/social/schedule/[id].tsx` (F-043 calendar review/confirm): new `__tests__/social/schedule-calendar.test.tsx`, 33 tests. Only `lib/api/client.request` is mocked, so the real `scheduleApi` runs and every URL, method and body is pinned. Covers: load error + Retry; DRAFT header, IST day grouping in date order, SKIPPED hidden and not counted, all-skipped plan cannot be confirmed; Confirm (no body, success alert counts with/without the styled clause, OK returns to the list, 4xx reason vs 5xx fallback); caption (Save only when dirty, trimmed, disabled blank; AI caption product ids + SINGLE_PRODUCT/CAROUSEL, hashtags, 2200 cap); status gating (POSTED/PUBLISHING read-only, FAILED error + Retry/Skip bodies, READY no Retry); owner-only slide editing (owner vs manager across Remove/Style/Swap/Photo styles/Confirm bar/End plan); item actions (Remove DELETE, other-photo cycle + wrap + hidden with one photo, Swap open/pick/close + failure keeps picker); style modal (item scope has no Rotate, post scope Rotate disabled on empty pool then sends `rotate`, plan route, Close, failure keeps modal); design card (Collage cover on/off, pool add/remove, none on ENDED); End plan (hidden on DRAFT/ENDED, Cancel no call, confirm POST + replace, PAUSED shows reason). Eight breaks in the screen (SKIPPED filter, `canPlan` on the Confirm bar, `editable` gate, photo wrap, Rotate for item scope, 2200 cap, caption trim, `canEditSlides`) each failed the intended tests, then restored (`cmp` clean). Correction to the T3.2 table row #7: Confirm does not send edited captions.

**FINDING, FIXED 2026-10-29 (owner chose option A, no RC):** a caption typed in a post card but not saved with "Save caption" is local state; `Confirm N posts` sent only the plan id, so the edit was silently lost when the plan went live. Fix in `app/social/schedule/[id].tsx`: `PostCard` reports its live text up through `onDraft`, the screen keeps it in a `drafts` ref, and the `confirm` mutation PATCHes each post whose trimmed draft is non-blank, differs from the saved caption and is still editable before it POSTs confirm. A failed save stops the confirm and shows the error; a blank draft is skipped (Save caption refuses it too). The old "NOT sent" pin was replaced by 5 tests (unsaved edit saved trimmed and in order PATCH then confirm; AI-filled caption saved; untouched/reverted/blank send no PATCH; skipped-after-edit not saved; failed save stops the confirm). Six breaks (patch removed, dirty check, editable check, blank skip, trim, `onDraft` wiring) each failed the intended tests, then restored (`cmp` clean). Not device-tested.

T3.2-a #7b (pending states, same file): the test file's `useMutation` mock now holds real `isPending` state (true from `mutate()` until the mutation settles), and 5 tests inspect the in-flight UI with hand-settled requests: item style shows "Rendering your photo..." and hides the options, post/plan style shows "Applying...", a failed render clears pending and restores the options, Confirm shows "Confirming..." and is disabled, AI caption shows "Writing..." and is disabled. Six breaks (style pending branch, the single-vs-scoped copy, Confirming label, Confirm disabled, Writing label, AI disabled) each failed the intended tests, then restored (`cmp` clean). Mobile `tsc` clean, vitest 44 files / 413 tests.

T3.2-a #8 `app/enquiry-try-on.tsx` (F-044 R2 in-store try-on): new `__tests__/product/enquiry-try-on-screen.test.tsx`, 32 tests. `runTryOnSession`, `cleanupSession`, `loadBuyablePacks` and keep-awake are stubs (the orchestrator has its own unit test); `planSession`/`shouldKeepAwake` stay real; the shared RN mock gained `useWindowDimensions`. Covers: unparseable names fall back to "Product"; quota paths (enough preselects all, short quota preselects the first N and the toggle never exceeds it, Continue disabled at 0 selected, unlimited counts one slot per product, zero left shows no products or Continue, 403/404 "not available" with no Retry, 500/network shows the balance error and Retry reloads, AppState active re-reads the balance only in preflight); buy-more (packs only when quota is short, price `Rs 99` vs `Rs 249.50`, checkout call and `openURL`, failure Alert and re-enabled button, same-tick double tap starts one checkout); capture/consent (no permission disables the shutter and Allow camera asks, cancelled picker stays, decline deletes only that photo with no API call, accept runs only the selected products with `TRY_ON_CONSENT.version` and an abort signal then re-reads the quota, same-tick double accept starts one run, running list shows state or failure reason, gallery image has `cachePolicy="none"` and discarded/failed items explain themselves, Try again re-runs one product, keep-awake on while running and off on exit); leaving (Close with nothing held leaves without a prompt, Close during a run or on the gallery asks first, Stay does nothing and Leave exits and aborts, hardware back is swallowed and routed through Close, background with a photo leaves and with nothing held does not, unmount cleans photos + job ids once and clears the image cache, Close then unmount cleans once, a job created after exit is discarded at once). Correction to the T3.2 table row #8: the screen has no role check and no "generate button for delegate"; RC-068 is enforced server-side and the screen only maps 403/404 to "not available". Fifteen breaks (unavailable branch, toggle cap, `runningRef`, `exit` idempotence, `hasResults` confirm, `buyingRef`, `cachePolicy`, background `hasData`, late-job discard, decline cleanup, consent version, AppState preflight check, retry-single, keep-awake, hardware back) each failed the intended tests, then restored (`cmp` clean). The `!picking.current` guard is NOT pinned: it only matters when a photo or results already exist, and the UI cannot open the picker or permission dialog in that state, so it is belt-and-braces today. Mobile `tsc` clean, vitest 45 files / 449 tests. Not device-tested.

T3.2-a #9 `app/settings/social.tsx` (Facebook Page connect / disconnect / history): new `__tests__/settings/social-settings.test.tsx`, 31 tests (30 normal + 1 `it.fails`). `socialApi`, `loginWithFacebook` (own test in `lib/facebook-auth.test.ts`), `useTheme` and the `Linking` url listener are stubs; the real `FacebookAuthCancelled`/`FacebookAuthUnavailable` classes are used. Covers: spinner, empty state, account row (name, date, Post to `/social/create`, Connect another Page); history modal (closed and `enabled:false` until History is tapped, reads that account, Close, empty copy, post-type labels, Posted vs Failed, like/comment row only when counts exist, failed post shows its error and no link, posted post opens Facebook); connect (login then `connectWithToken`, alert name falls back account_name to handle to generic, refresh, cancel is silent, SDK-unavailable opens the real web URL, missing `auth_url` shows the banner and never a fake success, other errors show `err.message` (pinned as current behaviour, RC-117 shape) and a non-Error shows the generic text, banner clears on retry, loading while in flight); disconnect (confirm names the page, Cancel does nothing, confirm calls `disconnect(id)` then refreshes, 4xx reason vs 5xx fallback with no refresh); OAuth deep link (`settings/social` without a code only refreshes, with a code completes the connect, unrelated or code-less callback ignored, success alert + refresh, failure fallback or 4xx reason, listener removed on unmount). Correction to the T3.2 table row #9: the screen never calls `LoginManager.logOut`; since RC-018 that lives in `loginWithFacebook`. Twelve breaks (cancelled return, SDK fallback, disconnect refresh, `!code=` guard, history `enabled`, error reset, `code` check, listener cleanup, missing `auth_url`, failed-post link, likes row, handle fallback x2) each failed the intended tests, then restored (`cmp` clean); the first run showed `!code=` unpinned, a test was added. Checked, not bugs: a disconnect cannot be served a stale `listAccounts` (`cachedFetch` clears the GET cache on any successful mutation), and the server's social routes never return `connected:false`, so the screen's silent not-connected branch is unreachable.

**FINDING, FIXED 2026-10-29 as RC-132 (owner approved; fix and proof in the next paragraph):** `openConnect` (and the same flow in `growth/integrations/facebook.tsx` and `growth/integrations/instagram.tsx`) guards only on `connecting` state, which reaches the button's `loading` prop after a render, so two taps in one tick call `loginWithFacebook` and `connectWithToken` twice (RC-015 shape; `buyMore` in `enquiry-try-on.tsx` already uses a ref). Pinned as `it.fails('a second tap in the same tick starts no second login')` in `social-settings.test.tsx`; confirmed it fails for the right reason (`login` called 2 times, expected 1). Proposed fix: a `connectingRef` checked at the top of `openConnect` and released in `finally`, in all three screens, plus the same pin for the two growth screens. Server-side effect of a double connect is not verified (upsert vs duplicate account row). Mobile `tsc` clean, vitest 46 files / 480 tests. Not device-tested.

RC-132 fix (owner approved 2026-10-29): `settings/social.tsx` `openConnect`, `growth/integrations/facebook.tsx` `handleConnect` and `instagram.tsx` `handleOneClickConnect` now check a `connectingRef` first, set it before `setConnecting(true)` and release it in `finally`. The `it.fails` in `social-settings.test.tsx` became a normal test; new `__tests__/growth/connect-double-tap.test.tsx` (4 tests: facebook and instagram each pin a same-tick double tap starting one login, the guard released after a success, and released after a failed login; the success case uses `connected:false` because a real connect swaps the button for Disconnect). Six breaks (guard line and release line in each screen) each failed a test, then restored (`cmp` clean). Server-side effect of a double connect (upsert vs duplicate account row) is not verified. Not device-tested.

T3.2-a #10 `app/staff/support-session.tsx` (manager requests a scoped support session, polls the grant, enters the retailer account): new `__tests__/staff/support-session-screen.test.tsx`, 19 tests (17 normal + 2 `it.fails`), fake timers. `teamApi`, `enterSupportSession`, `showError`, `useTheme` and the retailers query are stubs. Covers: retailer list with city, spinner (no empty copy) while loading, empty copy; scope defaults to Growth, picking Demo selects it and the request carries it; request calls `startSupportSession({retailer_id, scope})` and shows "Waiting for {shop}", a failed request shows the error and can be retried; polling (nothing before 3 s, then every 3 s while PENDING; APPROVED fetches the token, calls `enterSupportSession` with grant id, scope, expiry and `ticket_id:''`, opens `/(tabs)` after 50 ms and stops polling; DENIED/EXPIRED/ENDED alert "Not approved" and return to the list; PENDING past `answer_within_seconds` alerts "No answer", before it keeps waiting; a poll error and a token error are reported and stop polling; a slow poll is not overlapped; unmount stops polling); cancel (ends that grant, returns to the list, stops polling; a failed end still leaves the waiting screen and says the request expires on its own). Correction to the T3.2 table row #10: the screen has no "end session" action; it only requests, polls and cancels a request. Whatever clears access lives in `enterSupportSession`/`catalog-delegate`, which is not exercised here. Twelve breaks (busy guard, deadline check, not-approved branch, APPROVED compare, interval cleanup, `router.replace`, `endSupportSession` call, scope in the request, `ticket_id`, poll-error report, start-error report, `setStarting(null)`) each failed the intended tests, then restored (`cmp` clean). Mobile `tsc` clean, vitest 48 files / 503 tests. Not device-tested.

**FINDINGS, FIXED 2026-10-29 as RC-134 (owner approved "apply A B"; both were pinned as `it.fails`, confirmed to fail for the right reason, then flipped to `it`; fix and proof in the paragraph after this one):** (A) `handleStart` guards only on `starting` state, so two taps on a retailer card in one tick create two support grants for the same shop (`startSupportSession` called 2 times, expected 1; RC-015/RC-132 shape; the second grant's id is lost because `setWaiting` keeps the later one, and the first stays PENDING on the retailer's phone until it expires). Proposed fix: a `startingRef` checked at the top of `handleStart`, released in `finally`. (B) Cancel during an APPROVED poll: the interval callback has already seen APPROVED and is awaiting `getSupportSessionToken`; `handleCancel` ends the grant, but the in-flight callback then calls `enterSupportSession` and `router.replace`, so the manager lands in a session whose grant was just ended (`enterSupportSession` called 1 time, expected 0). Proposed fix: a `cancelled` ref (or a per-effect `let live = true` set false in the cleanup) checked after each `await` in the poll before `enterSupportSession`; whether the server rejects a token for an ended grant is not verified.

RC-134 fix (owner approved 2026-10-29): `support-session.tsx` `handleStart` now checks a `startingRef` first and releases it in `finally`; the polling effect has a per-run `live` flag, set false in the cleanup and checked after the status `await` and after the token `await`, so a cancelled request enters no session and raises no alert. The two `it.fails` became normal tests and a third pins the first await (cancel while the status request is pending), 20 tests in all. Falsified (each failed a test, restored, `cmp` clean): `startingRef` check and release, both `live` checks, the `live = false` cleanup. Not covered: a cancel landing while `enterSupportSession` is running, and whether the server refuses a token for an ended grant. Mobile `tsc` clean, vitest 48 files / 516 tests. Not device-tested.

T3.2-a #6b composer caption auto-suggest (`app/social/create.tsx`): 12 fake-timer tests appended to `__tests__/social/create-screen.test.tsx` ("caption auto-suggest (T3.2-a #6b)"). Covers: 900 ms debounce (899 ms nothing, 900 ms asks for the picked product), fill with `#` added to bare tags and shown in the preview and the "AI suggestion" hint, "Writing with AI…" in flight, nothing selected never asks, a caption typed first suppresses the request, a slow failure is silent and tried once per content (stepped time; instant rejection would hide a retry loop because React batches the flag), empty response leaves the caption blank, a content change re-suggests over an AI fill, a content change does not overwrite a manual edit, rapid picks restart the timer, a collection link asks with `product_ids: []`. **FINDING, FIXED 2026-10-29 as RC-133 (owner approved "apply C D"):** typing did not cancel the suggestion. `captionTouched` was read only when the timer was armed; typing does not re-run the effect, so the timer still fired, and the response then called `setCaption` with no second look. Two tests were red against the old code (typing inside the window; typing while the request is in flight), then green after re-checking `captionTouched` at fire time and before `setCaption`. Falsified (each failed a test, then restored, `cmp` clean): fire-time check, in-flight check, 900 ms, products guard, empty-caption guard, `#` prefix, `suggestedFor` guard. Not pinned: the schedule-time touched check and the `clearTimeout` (redundant with the new check and the `cancelled` flag), and the `lastAiFill` guard (a template-applied caption; `TemplatePicker` is stubbed here). Sibling checked: the schedule screen's AI caption is a tapped button, no background fill. Mobile `tsc` clean, vitest 48 files / 515 tests. Not device-tested.

T3.2-a #4b onboarding step 5 (`app/onboarding.tsx`): 8 tests + 2 `it.fails` appended inside the #4a describe in `__tests__/smoke/rc-screens.test.tsx` (fake timers; the shared `useQueryClient` mock gained `setQueryData`). Covers: save order update -> `getQrSlug` -> `updateOnboarding(5, true)`, redirect not before 1500 ms, a second tap after success saves nothing more (confetti guard), QR and Catalog buttons save first then go to `/store-profile` / `/settings/catalog-upload`, a failed QR slug never blocks, a rejected profile save shows the 422 reason and stops, a rejected completion alerts with no cache write and no redirect, cache merge of `onboarding_step`/`onboarding_completed` plus the `['retailer','me']` refetch. **FINDING, FIXED 2026-10-29 as RC-135 (owner approved "apply the busyRef fix"):** `handleNext`, `handleGetCatalogHelp` and `handleCreateStoreQr` all guard on the state `saving || showConfetti`, so two taps in one tick both pass: `update` runs twice, and Dashboard + QR in one tick start two timers and call `router.replace` twice to different screens (RC-015/132/134 shape). Pinned by two `it.fails`; flipped once, both failed with "expected spy to be called 1 times, but got 2 times". Fix: one `busyRef` checked first and set in all three handlers (`handleNext` also serves steps 1-4), released in the shared `finally` (success stays shut via `showConfetti`, which commits in the same batch; a failure frees the button). The two pins became normal tests; added double tap on QR and Catalog, double tap on step 1 (saves once, step 2 still works), retry after a failed save: 19 onboarding tests. Falsified (each failed a test, restored, `cmp` clean): QR-slug try/catch, all three redirect targets, 1500 ms, dashboard `showError`, both cache fields, the refetch, the `handleNext` confetti guard, `setSaving(false)`, the `getQrSlug` call, and for RC-135 the check and the set in each of the three handlers plus the release. Not pinned: the QR/Catalog error alerts (same `showError` shape, only the Dashboard path is driven), timers not cleared on unmount (no RC), other screens guarding a start on state alone not swept. Mobile `tsc` clean, vitest 48 files / 530 tests. Not device-tested.

T3.5 g bulk-onboard startup loads (`app/product/bulk-onboard.tsx`), **FIXED 2026-10-29 as RC-136 (owner approved "apply")**: `getSections` and `getStats` ended in `.catch(() => {})`, so a failed stats call showed "0 / N items catalogued" as fact and a failed rack call an empty picker. Both catches now `setError(apiMessage(err, …))` into the existing banner. New `__tests__/product/bulk-onboard-screen.test.tsx` (5 tests: success shows count and racks with no banner; stats failure; rack failure; rack 4xx server reason; stats 4xx reason vs 5xx generic). Three pins were `it.fails` first, flipped once and failed for the right reason, then became normal tests. Falsified (each failed a test, restored, `cmp` clean): both catches and `apiMessage` on both (the rack `apiMessage` survived until its 4xx test was added). Not pinned: the banner being cleared by the next extraction, last-wins when both loads fail. Other bare `.catch(() => {})` in `apps/mobile` not swept. Mobile `tsc` clean, vitest 49 files / 535 tests. Not device-tested.

T1.5 F1-F4 (API manifest hygiene, applied 2026-10-30, no RC: no runtime bug, a latent hoisting dependency): `apps/api/package.json` now declares `@aws-sdk/client-s3` and `pdfjs-dist` (both imported by the API but declared only in `packages/ai`, resolved through `.npmrc` `shamefully-hoist`); `pdfjs-dist` removed from `packages/ai` (zero imports there); unused `@fastify/swagger` and `pino` removed (`pino-pretty` kept, `src/index.ts:67` names it as a transport string); `pnpm-lock.yaml` regenerated; `apps/api/debug-r2-test.mjs` and `packages/ai/gen-studio-thumbs.tmp.js` deleted. New guard `apps/api/src/lib/declared-deps.test.ts` (2 tests): extractor test, and every package imported by a non-test `apps/api/src` file must be in the API manifest. Falsified: deleting `pdfjs-dist` from the manifest failed with `routes\catalog-import.ts: pdfjs-dist`; breaking scoped-name parsing failed both tests. Not covered: `scripts/*.ts` are outside the guard, `packages/ai` has no equivalent guard, and `@aws-sdk/client-s3` still ships in both manifests on purpose. Left open: F5 (knip entry list), F6 (`pg` may be a Prisma peer), F7 (62 unused exports, 11 unreferenced functions).

T1.6 F2 (admin SQL console timeout, applied 2026-10-30, no RC: hardening, not a shipped bug): `POST /v1/admin/query` ran its 30 s limit as a `Promise.race`, which rejects the HTTP call but leaves the query running on the replica. `admin-data.ts` now runs `SET LOCAL statement_timeout = '30s'` after `SET TRANSACTION READ ONLY`, so Postgres cancels it. New `admin-data.query.test.ts` (2 tests: statement order, and the SELECT-only gate rejecting `DELETE` before any DB call); each guard was broken in turn and failed a test, then restored. API 2697 passed, `tsc` and biome clean, all CI gate scripts pass. Not run against real Postgres. Open question: Prisma's interactive `$transaction` defaults to `timeout: 5000`, which may already end the transaction near 5 s; not verified, so no `timeout` option was added.

Open, P2 (not applied): T1.2, T1.3 F2-F3, T1.4 F2-F4, T1.5 F5-F7, T1.6 F1 and F3 (owner-side), T1.7 F2-F6, T1.8 F2-F5, T2.1, T2.2, T2.3, T2.4 F4-F6, T2.5 F5, T2.6, T2.7, T3.1.

Waiting on an owner decision: T1.8 F4 and T2.5 F1 (`trustProxy`, same as H1-4).
