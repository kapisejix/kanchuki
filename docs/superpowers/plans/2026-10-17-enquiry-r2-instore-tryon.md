# F-044 Release 2 — E8 "Try on with customer" (in-store session) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner/manager taps "Try on with customer" on an enquiry card, photographs the customer once, and gets a swipeable gallery of one try-on per enquiry product on the staff phone only; the wearer photo and (per D5) the generated images are gone on exit.

**Architecture:** Reuse the existing per-product `POST /v1/products/:id/try-on` + `GET …/status` (F-040) unchanged in shape; the mobile app orchestrates N jobs from one on-device photo (one upload per job, compressed once). API gets four small fixes the session exposes (pending-job-aware quota, Bearer path forced in-store, quota read endpoint, discard of in-store results). One new mobile screen reached from the enquiry card.

**Tech Stack:** Fastify + Prisma + BullMQ (`apps/api`), Expo / React Native + expo-camera + expo-image + expo-file-system (`apps/mobile`), vitest.

**Spec:** `docs/tasks/pending/enquiry-basket-team-inbox-and-instore-tryon.md` (§3.4, §5.4, §5.5, §6 E8/E12, §7, §8, §11.1, §11.7). Related: `docs/tasks/pending/catvton-runpod-tryon-launch.md` (F-040), `docs/SECURITY.md` §12–18 + the try-on photo row (line ~154), `docs/database/DATABASE.md`.

## Global Constraints

- Wearer photo is never persisted: not R2, not DB, not BullMQ payload. The API in-process stash (`lib/tryon-photo-store.ts`, 180 s TTL, 256 MB cap, one-shot take) stays the only handoff.
- Staff never get a full customer phone from the API. The session screen receives product ids/names only — never `customer_phone` — in route params.
- Every `product_id` is validated against the caller's retailer (already done per-POST by `resolveTryOnContext`; the new discard route must do the same for job ids).
- Customer-facing try-on stays OFF (`CUSTOMER_TRY_ON_ENABLED = false`, E6). No remote customers (D4). No sharing results to the customer's WhatsApp, no Share button in the session.
- Role: owner + manager only; salesperson 403 server-side (pinned by E7) and hidden in UI.
- No migrations applied, no deploys, no merges, no `railway up`, no prod access. Migrations are PROPOSED only (this plan proposes none by default; see T2).
- Consent: `consent_method = IN_STORE`, sent as `?consent_version=<TRY_ON_CONSENT.version>` on every POST; re-taken whenever a new wearer photo is taken.
- `validationError` returns 422 (not 400); tests assert 422.
- Default-deny staff allowlist in `apps/api/src/plugins/auth.ts` stays default-deny.

## Spec check — what the spec got wrong or left out (verified in code 2026-10-17)

1. **Spec §3.4 / §5.4: "withdrawal deletes it" is passport-only.** `withdrawTryOnConsent()` is keyed on `customer_account_id`; in-store jobs have it `null`, so today **in-store results sit in R2 forever** (no withdraw path, no retention job — `tryon-deletion-sweep.ts` only touches `consent_withdrawn_at != null` rows). D5 "discard after the session" is therefore new behaviour, not a default. It also changes the **existing single-product** flow (owner confirmed 2026-10-17).
2. **Spec §5.4: "customer_account_id null" for the Bearer path is not guaranteed.** `resolveTryOnContext` still reads the passport cookie on the Bearer path; if the staff request carries one, `customerAccountId` is set → `consent_method = PASSPORT` and the customer quota is charged. Staff phones normally have no cookie, but the guarantee is accidental. Fixed in T1.
3. **Spec §5.4 item 4: quota math overshoots under a 3–4-job session.** `checkQuota` runs at POST; `incrementUsage` runs only on job **success**. Four POSTs fired back-to-back with 1 try-on left all pass the check. The comment in `quota.ts` already admits the race; a session makes it routine. Fixed in T1 (count PENDING jobs in the check).
4. **No quota-read endpoint for try-on.** `getQuotaStatus` exists but only STUDIO_SHOOT routes use it; the spec's "show remaining quota" needs a new read route (T1).
5. **Seeded quota ≠ spec quota.** Migration 119 seeds Starter 20 / Growth 50 / Pro 100; spec §11.1 D6 says 40 / 100 / 200. **Owner 2026-10-17: keep 20 / 50 / 100** — the spec table is superseded.
6. **Extra on-device copies of the wearer photo.** `productApi.startTryOn` calls `compressImageForUpload` on every call, writing a compressed JPEG to the app cache — 4 jobs = 4 extra copies, none deleted. Camera `takePictureAsync` also writes a cache file. "Discard the on-device photo on exit" must delete **all** of them (T3/T4).
7. **Result image is cached on the staff phone.** `expo-image` caches remote images to disk by default; the presigned result URL (1 h) would persist on-device. Gallery must use `cachePolicy="none"` and call `Image.clearDiskCache()`/`clearMemoryCache()` on exit (T4).
8. **The existing screen has a Share button** that shares the presigned URL. The session screen must not copy it.
9. **Gallery import (owner: YES, 2026-10-17).** The existing screen's `launchImageLibraryAsync` is kept in the session. Consequence: the customer's photo may already live in the staff phone's gallery (outside our control), and cleanup must delete **only app-owned cache copies** — never the user's original gallery asset. Whether the picker hands back a cache copy or the original URI differs by OS/version: not verified.
10. **Spec §6 lists E11 (cost logging) under Release 2 but gives it no task row.** `generateTryOn()` already returns `latencyMs` (worker-reported inference time) but `handleTryOn` drops it. Owner: out of this release unless asked.
11. **Spec §11.1 already records D5 and D6/D6b as DECIDED (2026-10-17).** D5 sub-questions answered 2026-10-17.
12. **E12 premise is wrong:** adding `TRY_ON_GENERATION` to `admin-resource-packs.ts` does **not** make packs buyable. `POST /billing/addon-checkout` reads the hardcoded `ADDON_PRICING` const (`packages/shared/src/constants/index.ts:667`), never the admin `ResourcePack` table (only the admin page reads it). T6 makes checkout read `ResourcePack` for try-on packs.
13. **Pack expiry is answered by code:** the callback credits by `decrement`-ing the **current month's** `UsageCounter` row, so a purchased pack **expires at month-end, no carry-over**. (Nothing is credited when the plan limit is `-1`.) `used` can go negative → UI must clamp.
14. **GST gap:** checkout charges `pack.price_paise` as-is; `gst_amount` / `gst_invoice_number` on `QuotaAddonPurchase` exist but the callback never fills them. Spec says ₹8 **ex**-GST + 18 % on top; CLAUDE.md says GST invoicing is non-negotiable. Owner chose option (a): admin enters the GST-inclusive price; no invoice is generated (see "Answered").
15. **No mobile screen buys add-ons today** — `billing.ts` has `addonCheckout` but no screen calls it.

## Review Focus

Failure modes the spec implies but no spec task tests; each is pinned by a named test below.

1. Session larger than remaining quota (4 products, 2 left): must not start N jobs and half-fail — expect a pre-flight choice (T4) and a server that refuses the overshoot (T1).
2. One product in the enquiry is unsupported (Dupatta) / photoless / deleted / belongs to another store: that card shows a per-item reason; others still generate (T3).
3. Staff leaves mid-run (back button, app backgrounded, process killed): photo files deleted, finished results discarded; unfinished jobs' results swept by age (T2/T4).
4. Customer withdraws mid-session ("I don't consent"): staff taps Decline/Close before accept → zero API calls; after accept → discard all (T3/T4).
5. Staff with a passport cookie on the same device: job still `IN_STORE`, never charged to a customer (T1).

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `apps/api/src/routes/products/products-tryon.ts` | Bearer path forces `customerAccountId = null`; pending-aware quota; `GET /try-on/quota`; `POST /try-on/discard`; status `discarded` | T1, T2 |
| `apps/api/src/lib/quota.ts` | no change expected (use `checkQuota(…, amount)` + `getQuotaStatus`) | T1 |
| `apps/api/src/jobs/tryon-deletion-sweep.ts` | also delete in-store results older than `IN_STORE_RESULT_TTL_HOURS` | T2 |
| `apps/api/src/routes/products-tryon.test.ts`, `jobs/tryon-deletion-sweep.test.ts`, `plugins/staff-access.test.ts` | tests | T1, T2 |
| `apps/mobile/src/lib/api/products.ts` | `getTryOnQuota`, `discardTryOnJobs`; `startTryOn` accepts pre-compressed uri + `skipCompress` | T3 |
| `apps/mobile/src/lib/try-on-session.ts` (new) | pure orchestrator: run N jobs, concurrency 2, per-item result, cleanup | T3 |
| `apps/mobile/app/enquiry-try-on.tsx` (new) | capture → consent → progress → gallery → exit cleanup | T4 |
| `apps/mobile/app/enquiries.tsx`, `apps/mobile/src/lib/staff-can.ts` | button + `enquiries.tryon` key (manager) | T4 |
| `apps/api/src/routes/billing/billing-addons.ts`, `admin-resource-packs.ts`, `apps/mobile/src/lib/api/billing.ts` | try-on top-up packs behind `ResourcePack.is_active` | T6 |
| `packages/db/prisma/schema.prisma`, `packages/ai/src/tryon.ts`, `apps/api/src/jobs/tryon.ts`, `admin-try-on-usage.ts`, `apps/web/src/app/admin/try-on-usage/page.tsx` | E11 GPU-ms logging + admin report (migration PROPOSED) | T7 |
| docs (`PRO-REQUIREMENTS §41`, `BUILD-LOG`, spec §11.7, `SECURITY.md` try-on row *proposed*) | status sync | T5 |

---

### Task T1: API — quota-safe, in-store-pure try-on POST + quota read

**Size:** S. **Depends on:** nothing (can ship before the UI; harmless alone).

**Files:**
- Modify: `apps/api/src/routes/products/products-tryon.ts` (`resolveTryOnContext`, step 5 of POST, new GET)
- Test: `apps/api/src/routes/products-tryon.test.ts`, `apps/api/src/plugins/staff-access.test.ts`

**Interfaces:**
- Produces: `GET /v1/products/try-on/quota` → `{ data: { used: number; limit: number; remaining: number; unlimited: boolean } }` (Bearer only; 404 when `VIRTUAL_TRY_ON_V2` off, same gate as POST; shopper cookie → 404).
- Produces: POST quota check = `checkQuota(retailerId, 'TRY_ON_GENERATION', 1 + pendingCount)` where `pendingCount = prisma.tryOnJob.count({ retailer_id, status: 'PENDING', created_at ≥ now − 10 min })` (10 min bounds orphaned PENDING rows from a crashed job).

- [ ] **Step 1: Failing tests** in `products-tryon.test.ts`: (a) Bearer request that also carries a valid passport cookie → created job has `customer_account_id: null`, `consent_method: 'IN_STORE'`, `checkCustomerQuota` not called; (b) limit 3, used 1, 1 PENDING → POST ok; with 2 PENDING → 402 `PLAN_LIMIT_EXCEEDED`; (c) `GET /try-on/quota` returns remaining for owner and manager, 404 for cookie-only, 404 when flag off; (d) `staff-access.test.ts`: salesperson `GET /v1/products/try-on/quota` is allowed by the existing GET rule — assert the response carries numbers only (no gate change; documented, not a leak).
- [ ] **Step 2: Run** `pnpm --filter @kanchuki/api exec vitest run src/routes/products-tryon.test.ts src/plugins/staff-access.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** in `products-tryon.ts`: on the `request.retailerId` branch return `customerAccountId: null`; replace step 5 with the pending-aware check; add the static `GET /try-on/quota` route registered before `/:id/try-on/status` (Fastify matches static segments first — add a route-order test).
- [ ] **Step 4: Run** the same command + `security.test.ts` + `staff-access.test.ts` — expect PASS.
- [ ] **Step 5: Commit** `feat(api): pending-aware try-on quota, in-store-pure Bearer path, quota read (F-044 R2 T1)`.

**Not verified:** behaviour under real concurrent POSTs against Postgres (unit tests mock prisma; the check+increment race is narrowed, not eliminated — still two statements).

---

### Task T2: API — discard of in-store results (D5) + age backstop

**Size:** M. **Depends on:** T1 (same file). **Unblocked:** owner confirmed D5 (single-product screen included, 2 h TTL, no audit column).

**Files:**
- Modify: `apps/api/src/routes/products/products-tryon.ts` (POST `/try-on/discard`; status route)
- Modify: `apps/api/src/jobs/tryon-deletion-sweep.ts`
- Test: `apps/api/src/routes/products-tryon.test.ts`, `apps/api/src/jobs/tryon-deletion-sweep.test.ts`, `apps/api/src/lib/db-delete-guards.test.ts` (check the sweep's DELETE-role assumptions stay valid)

**Interfaces:**
- Produces: `POST /v1/products/try-on/discard` body `{ job_ids: string[] }` (max 10), Bearer only. For each job where `retailer_id = request.retailerId AND customer_account_id IS NULL`: `deleteObject(result_url)` then `result_url = null`. Returns `{ data: { discarded: number } }`. A failed R2 delete leaves the key (it is the only pointer — same rule as `withdrawTryOnConsent`) and the sweep retries. Unknown/foreign ids are ignored, never 404-distinguished.
- Status route: `status === 'COMPLETED' && !result_url` (and not withdrawn) → `{ status: 'discarded' }` instead of falling through to `processing` (the exact bug the withdrawn-check comment describes).
- Sweep: add a second pass — `customer_account_id: null, result_url: { not: null }, completed_at < now − IN_STORE_RESULT_TTL_HOURS` (default **2**, constant in the sweep module), same batch size, same keep-the-key-on-failure rule. Passport rows are untouched.

- [ ] **Step 1: Failing tests:** discard deletes only own-retailer in-store jobs (foreign retailer id and a passport job id both untouched, still `discarded: 0`); R2 failure keeps `result_url`; salesperson 403 (add to `staff-access.test.ts`); status returns `discarded` after discard; sweep deletes an in-store row at TTL+1 min and leaves one at TTL−1 min and any passport row; sweep leaves the key when `deleteObject` throws.
- [ ] **Step 2: Run** the three test files — FAIL.
- [ ] **Step 3: Implement** as specified; per-job try/catch so one failure does not abort the batch.
- [ ] **Step 4: Run** tests + `pnpm --filter @kanchuki/api typecheck` — PASS.
- [ ] **Step 5: Commit** `feat(api): discard in-store try-on results + age sweep (F-044 R2 T2)`.

**Not verified:** real R2 deletes; that the maintenance cron's concurrency-1 lane absorbs the extra pass; whether older in-store results already in prod should be purged on first run (it will purge them all — owner confirmed).
**Migration:** none proposed. Alternative if the owner wants an auditable "discarded" marker: `try_on_jobs.discarded_at TIMESTAMPTZ NULL` (mirrors `consent_withdrawn_at`) — PROPOSED only, would need SQL + rollback and DATABASE.md first.

---

### Task T3: Mobile — session orchestrator + API client

**Size:** M. **Depends on:** T1, T2 (contracts only; can build against mocks).

**Files:**
- Modify: `apps/mobile/src/lib/api/products.ts` (`startTryOn(productId, consentVersion, photoUri, opts?: { skipCompress?: boolean })`, `getTryOnQuota()`, `discardTryOnJobs(ids)`)
- Create: `apps/mobile/src/lib/try-on-session.ts`
- Test: `apps/mobile/src/lib/try-on-session.test.ts`

**Interfaces:**
- Produces: `runTryOnSession(args: { products: { id: string; name: string }[]; photoUri: string; consentVersion: string; onItem: (i: SessionItem) => void; signal: AbortSignal }): Promise<SessionItem[]>` where `SessionItem = { productId: string; name: string; state: 'queued'|'running'|'ready'|'failed'|'discarded'; url?: string; jobId?: string; error?: string }`. Compresses the photo **once** (`compressImageForUpload`), runs at most **2** jobs concurrently (matches API worker concurrency 2), uses `pollWithBackoff` per job, never throws per item (failed item = `state:'failed'` + server message), stops starting new jobs on `PLAN_LIMIT_EXCEEDED`.
- Produces: `cleanupSession(args: { photoUris: string[]; jobIds: string[] }): Promise<void>` — `FileSystem.deleteAsync(uri, { idempotent: true })` for the camera file **and** the compressed copy, then `discardTryOnJobs(jobIds)`; each step in its own try/catch (a failed API discard must not skip file deletion).

- [ ] **Step 1: Failing tests:** 4 products / concurrency never exceeds 2; unsupported-category 422 on item 2 → item 2 `failed`, items 1/3/4 `ready`; `PLAN_LIMIT_EXCEEDED` on item 3 → item 3 `failed`, item 4 never started; abort → no further POSTs; compress called exactly once; `cleanupSession` deletes both URIs even when `discardTryOnJobs` rejects, and calls discard with every job id that was created.
- [ ] **Step 2: Run** `pnpm --filter @kanchuki/mobile exec vitest run src/lib/try-on-session.test.ts` — FAIL.
- [ ] **Step 3: Implement** the two functions; keep it a plain async module (no React) so it is testable like `mutation-queue.ts`.
- [ ] **Step 4: Run** the test + mobile typecheck — PASS.
- [ ] **Step 5: Commit** `feat(mobile): in-store try-on session orchestrator (F-044 R2 T3)`.

**Not verified:** real `uploadAsync` multipart on device; that `compress-image.ts` output URI is deletable by `expo-file-system` v19 (legacy vs new API — the existing code already imports `LegacyFileSystem`; check which one `deleteAsync` lives on).

---

### Task T4: Mobile — session screen + enquiry-card entry

**Size:** M. **Depends on:** T3.

**Files:**
- Create: `apps/mobile/app/enquiry-try-on.tsx`
- Modify: `apps/mobile/app/enquiries.tsx` (button on card), `apps/mobile/src/lib/staff-can.ts` (+`'enquiries.tryon': 'manager'`), `apps/mobile/src/lib/staff-can.test.ts`

**Interfaces:**
- Consumes: `runTryOnSession`, `cleanupSession` (T3); `productApi.getTryOnQuota()` (T1); `TryOnConsent` component; `useAuth` features (`VIRTUAL_TRY_ON_V2`).
- Produces: `planSession(products: {id:string;name:string}[], remaining: number): { run: {id:string;name:string}[]; skipped: {id:string;name:string}[] }` in `try-on-session.ts`.
- Route params: `productIds` (comma list) + `productNames` (JSON) only. No phone, no customer name.
- Button visible only when `staffCan(role,'enquiries.tryon')` AND `features` includes `VIRTUAL_TRY_ON_V2` AND the card has ≥1 product; UI is a convenience — the server gate is T1/E7.

Screen behaviour (one step per row, in order):
1. **Pre-flight:** show "N try-ons · M left this month". If `remaining < N`, let staff pick which products to run (checkboxes, cap at `remaining`); if `remaining = 0` show the limit message, no camera.
2. **Capture:** `CameraView` plus a gallery-import button (owner: gallery import yes). Full-length framing hint. Cleanup deletes only URIs under the app cache directory (guard: `uri.startsWith(FileSystem.cacheDirectory)`), never an original gallery asset.
3. **Consent:** `TryOnConsent` — shown **after** capture, customer reads/accepts on the staff phone; Decline → delete photo, back to capture, zero API calls.
4. **Progress:** per-product row (queued/running/ready/failed + reason). Keep-awake while running.
5. **Gallery:** horizontal paged `FlatList`, `expo-image` with `cachePolicy="none"`; failed items show the reason; no Share button; quota line refreshed. Retry on a failed item = a new quota unit (say so).
6. **Exit (every path):** `useEffect` cleanup + Close button + hardware back + `AppState` → `background` all call `cleanupSession` then `Image.clearDiskCache()`/`clearMemoryCache()`. Confirm dialog on Close while results exist ("Pictures are deleted when you leave").

- [ ] **Step 1: Failing tests (vitest, logic only):** `staff-can.test.ts` — manager/owner true, salesperson false for `enquiries.tryon`; `planSession` (remaining 2 of 4 → run 2, skipped 2; 0 → run none); `cleanupSession` never calls `deleteAsync` on a URI outside the cache directory (pure helper `isAppCacheUri(uri, cacheDir)` in `try-on-session.ts`).
- [ ] **Step 2: Run** `pnpm --filter @kanchuki/mobile exec vitest run src/lib/staff-can.test.ts src/lib/try-on-session.test.ts` — FAIL.
- [ ] **Step 3: Implement** `staffCan` key + `planSession`, then the screen and the card button (follow `product/try-on.tsx` styling, `useScreenInsets`, `AnimatedPressable`, `GradientButton`).
- [ ] **Step 4: Run** tests + `pnpm --filter @kanchuki/mobile typecheck` + lint — PASS.
- [ ] **Step 5: Commit** `feat(mobile): "Try on with customer" session from enquiry card (F-044 R2 T4)`.

**Not verified (device-only, needs Expo Go/EAS on a real phone with the flag ON and a live worker):** camera file actually deleted from cache; expo-image disk cache actually empty after exit; hardware-back and background paths; gallery swipe feel; 4-job wall-clock time (35–45 s per job, 2 at a time ≈ 80–90 s). UI is not browser/device-verified by this plan.

---

### Task T5: Docs + owner-side checklist

**Size:** XS. **Depends on:** T1–T4, T6, T7 landing.

- [ ] Update spec §11.7 Release 2 progress, `PRO-REQUIREMENTS.md` §41 status table, `docs/BUILD-LOG.md`, CLAUDE.md index row 101 (needs owner approval — CLAUDE.md edits are gated).
- [ ] **Propose** (do not edit without approval) a `SECURITY.md` try-on row update: in-store results discarded on exit + swept after `IN_STORE_RESULT_TTL_HOURS`. SECURITY.md §12–18 is governance — human review required.
- [ ] Owner checklist (not done by the agent): keep `TRY_ON_GENERATION` plan limits at the seeded 20/50/100 (owner decision); create the 3 top-up packs inactive at GST-inclusive 23600 / 47200 / 94400 paise; enable `VIRTUAL_TRY_ON_V2` per plan; F-040 launch gates (needed for enabling only — owner 2026-10-17).
- [ ] Commit `docs: F-044 Release 2 status`.

---

### Task T6: Try-on top-up packs behind an admin switch (E12 / D6b)

**Size:** M. **Depends on:** nothing technical (independent of T1–T4; ship dark). Owner 2026-10-17: build now, switch on later.

**The switch:** the admin `ResourcePack` table already has `is_active` and a per-plan `plans[]` filter, editable in Admin → Resource Packs. Packs for `TRY_ON_GENERATION` are created there (25 / 50 / 100 try-ons) with `is_active = false`. **No migration, no new feature key, nothing seeded in code.** Off = checkout refuses (server-side) and the mobile button is hidden.

**Files:**
- Modify: `apps/api/src/routes/billing/billing-addons.ts` (checkout enum + DB lookup; new `GET /billing/try-on-packs`)
- Modify: `apps/api/src/routes/admin/admin-resource-packs.ts` (add `'TRY_ON_GENERATION'` to `RESOURCE_TYPES`)
- Modify: `apps/mobile/src/lib/api/billing.ts` (`tryOnPacks()`, `addonCheckout` accepts `packId`), `apps/mobile/app/enquiry-try-on.tsx` (button on the limit / pre-flight screen)
- Test: `apps/api/src/routes/billing/billing-addons.test.ts` (create if absent), `apps/mobile/src/lib/try-on-session.test.ts`

**Interfaces:**
- Produces: `GET /v1/billing/try-on-packs` (Bearer) → `{ data: { id: string; label: string; pack_size: number; price_paise: number }[] }` — rows where `resource_type = 'TRY_ON_GENERATION' AND is_active AND (plans = [] OR plans has retailer.plan)`; `[]` when none.
- Changes: `POST /v1/billing/addon-checkout` body gains `pack_id?: string`; `resource_type: 'TRY_ON_GENERATION'` **requires** `pack_id`, looks the pack up in `ResourcePack` with the same active/plan filter, else 404 `Product`-style not-found (never 403 — same invisibility rule as the try-on gate). The five existing resource types keep reading `ADDON_PRICING` unchanged (ponytail: mixed sources, migrate the rest to the DB table when someone needs them).
- Mobile: "Buy more try-ons" shows only when `tryOnPacks()` returns ≥1 pack; opens `checkout_url` in the browser (existing web-billing pattern).

- [ ] **Step 1: Failing tests:** checkout with an inactive pack → 404 and **no** Razorpay call and no `QuotaAddonPurchase` row; pack restricted to `['PRO']` requested by a GROWTH retailer → 404; active pack → creates the payment link with `amount = pack.price_paise` and `notes.quantity = pack.pack_size`; `GET /try-on-packs` returns `[]` when all inactive and omits other-plan packs; callback crediting decrements the current-month `UsageCounter` by `quantity` (regression pin for the month-end expiry fact); mobile: button hidden when `[]`.
- [ ] **Step 2: Run** `pnpm --filter @kanchuki/api exec vitest run src/routes/billing` — FAIL.
- [ ] **Step 3: Implement** as specified; reuse the existing audit-log write.
- [ ] **Step 4: Run** tests + API typecheck + `security.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat(billing): try-on top-up packs behind admin switch (F-044 R2 T6)`.

**Not verified:** a real Razorpay payment-link round trip (needs test keys; the agent has none); GST invoice generation (not built — see "Answered"); that `quota` UI clamps negative `used` after a credit.
**Owner steps afterwards (not the agent):** in Admin → Resource Packs create 25 / 50 / 100 try-ons, set price, leave inactive until launch.

---

### Task T7: E11 — GPU-usage logging + admin report

**Size:** M. **Depends on:** nothing technical (independent; ship with or before the flag flip so real data starts accruing). Owner 2026-10-17: wanted, so an admin can track GPU usage.

**What is recorded:** per finished try-on job, the GPU time. Source = RunPod's billed `executionTime` (ms) in the `runsync` response when present, else the worker's own `output.latency_ms` (already surfaced as `TryOnResult.latencyMs`, currently dropped by `handleTryOn`). Failed jobs have no measured time: they are **counted** (so the admin sees failures that burned GPU unmetered) but add 0 ms.

**Migration (PROPOSED ONLY — owner applies; check `docs/database/DATABASE.md` first):** `ALTER TABLE try_on_jobs ADD COLUMN gpu_ms INTEGER NULL;` Rollback: `ALTER TABLE try_on_jobs DROP COLUMN gpu_ms;`. Number = next free after 130 (verify). Table already has RLS; additive nullable column, no backfill, no new grants. API deploy must wait for the migration (write would fail otherwise) — same precondition pattern as migration 130.

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (`TryOnJob.gpu_ms Int?`), `packages/ai/src/tryon.ts` (`TryOnResult.gpuMs: number | null`, prefer top-level `executionTime`), `apps/api/src/jobs/tryon.ts` (write `gpu_ms` in the existing completion `updateMany`)
- Create: `apps/api/src/routes/admin/admin-try-on-usage.ts`, `apps/web/src/app/admin/try-on-usage/page.tsx`
- Modify: admin route registration + sidebar entry (follow how `ai-usage` is wired); classify the new admin route per RC-034 (the access-boundary test fails if it is unclassified — super-admin only)
- Test: `packages/ai/src/tryon.test.ts`, `apps/api/src/jobs/tryon.test.ts`, `apps/api/src/routes/admin/admin-try-on-usage.test.ts`

**Interfaces:**
- Produces: `GET /v1/admin/try-on-usage?days=30` (admin auth, `days` 1–365) → `{ data: { totals: { jobs: number; completed: number; failed: number; gpu_ms_sum: number; gpu_ms_avg: number | null }; by_day: { day: string /* YYYY-MM-DD */; jobs: number; gpu_ms_sum: number }[]; by_retailer: { retailer_id: string; shop_name: string; jobs: number; gpu_ms_sum: number }[] /* top 20 by gpu_ms_sum */ } }`.
- UI: summary tiles (jobs, failed, GPU hours, avg seconds/try-on), per-day table, top-retailers table, and an **estimated ₹** column = GPU seconds × a rate field in the page (default ₹0.066/s = ₹3 ÷ 45.9 s from spec §10.2; labelled "estimate — set your RunPod rate"). No rate is stored server-side (ponytail: add a setting if the rate needs to be shared).

- [ ] **Step 1: Failing tests:** `tryon.test.ts` — `generateTryOn` returns `gpuMs` from top-level `executionTime`, falls back to `output.latency_ms`, `null` when neither; `jobs/tryon.test.ts` — completion `updateMany` data contains `gpu_ms`; a failed job writes no `gpu_ms`; admin route — aggregates two retailers across two days correctly, counts a FAILED job in `failed` with 0 ms, `avg` is `null` when nothing completed, `days=0` → 422, non-admin → 401.
- [ ] **Step 2: Run** `pnpm --filter @kanchuki/ai exec vitest run src/tryon.test.ts` and `pnpm --filter @kanchuki/api exec vitest run src/jobs/tryon.test.ts src/routes/admin/admin-try-on-usage.test.ts` — FAIL.
- [ ] **Step 3: Implement** schema field + `pnpm --filter @kanchuki/db exec prisma generate` (no DB touched), the `gpuMs` extraction, the job write, the route (aggregate in JS from a bounded `findMany` over the window — volume is quota-capped), and the page.
- [ ] **Step 4: Run** the tests + API typecheck + web typecheck — PASS.
- [ ] **Step 5: Commit** `feat(admin): try-on GPU usage logging + report (F-044 R2 T7)`.

**Not verified:** the exact field names in a live RunPod `runsync` response (`executionTime` is what the 2026-07-11 measurement note cites — confirm against one real response); whether cold-start/initialisation time is billed and therefore missing from `executionTime`; the page in a browser; the real RunPod ₹ rate.

---

## Owner answers (2026-10-17) and what is still open

**Answered:**
- **#2 E12 top-up packs:** build now, ship switched off, admin enables later → T6.
- **#3 F-040 launch gates:** needed **only for enabling**, not for merging. T1–T4 and T6 can merge and deploy dark.
- **#4 Retailer push:** confirmed — in-app only for v1.
- **#6 Consent:** **per wearer photo** (one consent screen per photo; version sent on each of the N POSTs; retake ⇒ consent again). Matches T3/T4 as written.
- **#7 Gallery import:** yes — see spec-check item 9 and T4 step 2.

**Answered (second round, 2026-10-17):**
- **D5:** go ahead — discard-on-exit applies to the single-product screen too; 2 h age backstop; **no audit column** (no migration). T2 stands as written.
- **GST on packs: option (a).** Admin enters the GST-inclusive price when creating the pack in Admin → Resource Packs: 25 = ₹236 (23600 paise), 50 = ₹472 (47200), 100 = ₹944 (94400) at ₹8 ex-GST + 18 %. Checkout charges that amount unchanged. **Still true and not fixed by (a):** the callback never fills `gst_amount` / `gst_invoice_number`, so no GST invoice is generated for a pack purchase. Packs stay switched off until an invoice path exists or the owner accepts that gap.
- **Quota:** keep the migration-119 seed **20 / 50 / 100** — no admin change needed (removes the "set 40/100/200" step). Consequence: a 4-item session uses 20 % of a Starter month (≈5 sessions); the pre-flight screen (T4) and top-up packs (T6) are the mitigation.

**Also answered:** E11 **wanted** (owner: so an admin can track GPU usage) → T7. Migration for `gpu_ms` is PROPOSED only.

**Still open:** none blocking. Owner must apply the T7 migration before the T7 API deploys, and must still decide when to enable packs (invoice gap) and the F-040 flag.

## Self-review

- Spec coverage: E8 items 1–5 → T3/T4 (photo, in-store consent, N jobs + polling, staff-only gallery, discard-on-exit); quota display → T1+T4; E7/E6 already built; E12 → T6; E11 → T7; D4/sharing → Global Constraints.
- Type consistency: `SessionItem`, `runTryOnSession`, `cleanupSession`, `planSession`, `getTryOnQuota`, `discardTryOnJobs`, route paths `/try-on/quota` + `/try-on/discard` used identically in T1–T4.
- Proportion: plan is ~⅓ of the spec's length; bodies are signatures + assertions only.
