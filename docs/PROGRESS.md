# Progress Log

One file, update at end of each work session: what's done, what's next, what's blocked. Check `git log -1` and this file first thing each session.

## 2026-08-09 — Backend pro-cleanup route + tests REMOVED (mobile Pro mode fully gone end-to-end)

**User ask:** now that the mobile Pro capture mode is removed (earlier entry below), also remove the orphaned backend for it — `POST /v1/products/pro-cleanup` + `GET /v1/products/pro-cleanup/status` + their tests — nothing calls them anymore.

**Removed:** `apps/api/src/routes/products/products-pro-cleanup.ts` + `products-pro-cleanup.test.ts` (19 tests) deleted; barrel export dropped from `routes/products/index.ts`; registration + comment dropped from `routes/products.ts`. The route was the only consumer of the `scoreSharpness`/`pickSharpest` sharpness selection — those stay exported from `@kanchuki/ai` (own tests, harmless).

**Kept (shared, still live):** `lib/photo-cleanup-runner.ts` (`runPhotoCleanup`/`serializePhotoCleanup`) — sole remaining caller is the **admin Photo Cleanup Test page** (`routes/admin/admin-photo-cleanup.ts`, separately registered under `/admin`, untouched); the photo-cleanup sidecar service + admin tool + F-028 auto-contrast background pipeline all still work. Stale comments in the runner + admin route referencing the deleted pro-cleanup route updated.

**Verified:** API tsc clean, full API suite **353/353** (26 files — was 372/372 with the pro-cleanup tests), biome clean on the edited files, route-size guard passes.

---

## 2026-08-09 — Canonical customer URLs: `kanchuki.app/{store}` + `kanchuki.app/{store}/{collection}` (no more `/c/`, `/store/`)

**User ask:** collection links must be based on the retailer URL + collection name — `kanchuki.app/{store-name-id}` for the store and `kanchuki.app/{store-name-id}/{collection-name}` for collections. "Hide shop from the main url" = drop the `/store/` segment entirely.

**New canonical scheme:** store `https://kanchuki.app/{public_slug}` (the QR slug, regenerated from the shop name on rename), collection `https://kanchuki.app/{public_slug}/{collection-slug}`. Retailers with **no** `public_slug` (never generated a store QR, or deleted it) keep the legacy `/c/{slug}` form — the API only generates that when there's nothing to put in the first segment. All old links keep working via 302s.

| Layer | Files | Summary |
|---|---|---|
| **API URL builders** | `apps/api/src/lib/store-urls.ts` (new) | `buildStoreUrl(publicSlug)` → `{WEB_URL}/{slug}`; `buildCollectionUrl(publicSlug, slug)` → `{WEB_URL}/{slug}/{slug}` or `/c/{slug}` fallback |
| **API link generation** | `collections.ts` (6 sites: create/list/update/share-URLs), `retailers/retailers-settings.ts` (qr-slug `profile_url` now `{WEB_URL}/{slug}`), `public/public-collections.ts` + `public/public-retailers.ts` (expose `retailer.public_slug` so the web app can build canonical links + enforce canonical URLs) |
| **Shared type** | `packages/shared/src/types/index.ts` | `PublicCollection.retailer.public_slug: string \| null` added |
| **Web canonical routes** | `apps/web/src/app/[store]/` (new tree) | `[store]/page.tsx` store profile (contact gate), `[store]/categories/...`, `[store]/[collection]/` page + cart/checkout/wishlist/order sub-flows. `CollectionView`/`ProductDetailSheet`/`CartPage`/`CheckoutForm`/`WishlistView`/`OrderView` gained a `store` prop (null ⇒ legacy `/c/` URLs) |
| **Web canonical-URL enforcement** | `[store]/[collection]/page.tsx` | 302s to `/{canonicalStore}/{collection}` when the store segment mismatches, or to `/c/{collection}` when the retailer has no store slug (prevents duplicate indexable URLs) |
| **Web legacy redirects** | `store/[slug]/*` + `c/[slug]/page.tsx` | `/store/{slug}` → `/{slug}`, `/store/{slug}/categories/...` → `/{slug}/categories/...`; `/c/{slug}` → `/{public_slug}/{slug}` when the retailer has a store slug (old WhatsApp/QR links keep working) |
| **Web API proxies** | `apps/web/src/app/api/[store]/...` (new) | products/favorite/checkout-status + categories products + leads — same patterns as the legacy `/api/c` `/api/store` proxies (kept for old clients) |
| **Revalidation** | `products-helpers.ts` + `api/revalidate/route.ts` | ISR purge now posts `{ path }` per affected page (canonical or legacy as applicable); route accepts legacy `collection_slug` for backward compat |
| **Service worker** | `apps/web/src/app/sw.ts` | Canonical `/{store}` and `/{store}/{collection}` documents added to the NetworkFirst `store-pages` cache (regex matcher for the new `/api/{store}/{collection}/...` proxies); legacy `/c/` `/store/` rules kept |
| **Mobile** | `apps/mobile/app/settings/index.tsx` | Store-URL rename notice links now use `{WEB_URL}/{slug}` (was `/store/{slug}`) |
| **Tests** | `CollectionView.test.tsx` (fixture gains `public_slug`), `customer-collection.spec.ts` (canonical paths + new legacy-redirect test + store-profile stub) | e2e now asserts `/{store}/festive-edit` renders, `/c/festive-edit` → 302 → canonical, `/store/{slug}` → 302 → contact gate |

**Verified:** `packages/shared` rebuilt; api/web/mobile `tsc --noEmit` all clean; API suite **372/372**; web CollectionView unit test green; biome clean on the new `[store]` tree (18 files, incl. a3 a11y label-association fixes inherited from the moved ContactGate) — every other flagged file's findings are identical at HEAD (pre-existing CRLF/import baseline). `next build` compiles + 0 prerender errors + 0 hook-dependency warnings in changed files (the local build's `0xC0000142` worker crash at "Collecting page data" is a pre-existing Windows flake — all three local builds crashed identically regardless of my changes; it doesn't affect Railway CI which builds fresh). Live dev-server curl check: all five new `/api/{store}/...` proxies registered and proxying (404 JSON from the API for unknown slugs, 204/404 with a body — identical to legacy routes).

**Ops notes:** (1) the local web dev server must be restarted after running `next build` — the builds share `.next` and the worker crash leaves stale chunks (`Cannot find module './2800.js'`) until restart; Railway deploys are unaffected. (2) Deploy order: API first (link generation + `public_slug` on collection payloads), then web (new routes + redirects). No DB migration, no mobile rebuild needed for links (mobile displays API-provided URLs).

---

## 2026-08-09 — Background picker fixed for ALL plans (CUSTOM_BACKGROUND_LIBRARY gate removed) + truthful cleanup errors

**User report:** "remove background and add background still not working, there is no button or option to add background when i edit product details... i have uploaded background photos in admin panel, so there will an option to select which background photo needs to be applied for which product and save final into database/R2."

**Root cause (confirmed by reading the gate chain, not guessed):** the background picker in BOTH the add-product and product-detail screens only renders when `GET /v1/products/background-images` returns rows — and that endpoint (plus the per-photo cleanup `background_image_id` param and `PATCH /:id/background`) was gated behind the `CUSTOM_BACKGROUND_LIBRARY` plan feature, seeded ON only for GROWTH/PRO. Every retailer defaults to `plan: 'STARTER'` (auth.ts / team-retailers.ts), so STARTER accounts got `data: []` → both pickers silently hidden. Admin uploads were fine (`is_active` defaults `true`); the picker was simply never allowed to see them.

**Fix (user decision — remove the gate, all retailers):** `apps/api/src/routes/products/products-media.ts` — removed the `hasFeature(CUSTOM_BACKGROUND_LIBRARY)` check from all three retailer-facing background surfaces: `GET /background-images` (now always returns active rows), `POST /:id/photos/:photoId/cleanup` per-photo backdrop param, and `PATCH /:id/background`. Rationale recorded in-code: the F-028 auto-contrast pipeline already applies admin backdrops to EVERY plan ungated, so the manual picker is now consistent with it. SPIN_360 gates + `hasFeature`/`featureUnavailable` imports untouched (still used by spin routes). Active-only background lookup stays — an inactive backdrop still 422s.

**Also fixed — misleading cleanup error:** the per-photo cleanup route's catch re-threw every failure (fetch / @imgly model / R2 write / anything) as the blanket *"Photo storage is not configured. Please contact support."* — indistinguishable from a real config outage, and the mobile screen showed it as "Failed to clean up photo". Now surfaces the actual reason (`Photo cleanup failed — <err.message>`, capped 300 chars) so a quota/model/R2 failure is diagnosable. (The cleanup flow itself was verified correct: fetch → preserve original at `-original` sibling key → rembg strip → **overwrite the same R2 key** — the save is in-place by design; the URL/DB row intentionally don't change.)

**Verified:** API tsc clean, full API suite **372/372** (27 files; products.test.ts 26/26 — the old "fails closed with 402" test replaced with a gate-removed test asserting the composite runs regardless of plan), biome clean on `products-media.ts` (was a clean LF file; line endings restored after the edit tool wrote CRLF), `products.test.ts` CRLF formatting is pre-existing baseline (HEAD fails identically).

**Note on "Mark Main Photo button not working":** `PATCH /:id/photos/:photoId {is_primary:true}` is correct and API-tested (atomic demote-all + promote). The mobile button is disabled when the currently-viewed photo is already the main one (shows "Main photo ✓") — with a single-photo product it's always disabled, which can look broken. F-029 UI is new (2026-08-09, commit `714a564`); a stale app build shows old behavior — rebuild via EAS and retest.

---

## 2026-08-09 — Pro (professional photo) capture mode REMOVED from the mobile add-product flow

**User decision** after the full explanation: the Pro chip was showing "unavailable" because the photo-cleanup sidecar (`PHOTO_CLEANUP_SERVICE_URL`) was never deployed — rather than deploy it, remove the feature from the app. **Photo and Scan modes are untouched and fully working** (Photo mode's server-side auto-clean runs through the sharp-based `cleanupProductPhoto()` path, no Python needed).

**Mobile-only removal** (backend `/products/pro-cleanup` route + sidecar + admin photo-cleanup test tool all stay — the admin tool shares `runPhotoCleanup` and is a separate route):
- `apps/mobile/app/product/add.tsx` — deleted: the Pro chip from the Photo/Scan/Pro toggle + its availability probe (`getProCleanupStatus`) + unavailable-notice text, the three step screens (`pro_review` / `pro_options` / `pro_processing`), all pro state (`proShots`, `proSelected`, `proUploads`, `proAvailability`, `proProcessing`, `proRunningRef`/`proRunRef`, `proRemoveHardware`, `proTightCrop`, `proStatus`, `proBestUri`), `handleProProcess`, `addProShot`, the pro branches in `handleCapture`/`handlePickFromGallery`/`handleSave`, the pro shots strip + Continue button, and the pro-gating on the auto-clean toggle + background picker (both now always shown; `autoCleanup` defaults on). Unused `logError` + `useCallback` imports removed. Camera step is now a two-chip toggle (Photo / Scan) and the shutter routes `captureMode === 'scan' ? handleScanCapture() : handleCapture()`.
- `apps/mobile/src/lib/api/products.ts` — deleted `proCleanup` + `getProCleanupStatus` client methods (no other callers existed).

**Verified:** mobile `tsc --noEmit` clean, vitest 35/35 (the one failing file remains the pre-existing, unrelated `expo-linear-gradient` Rolldown JSX-parse error in `__tests__/staff/retailer-onboard.test.tsx`), biome findings on the changed files identical to the HEAD baseline (5 pre-existing: CRLF formatting, import sorting, `noArrayIndexKey`, `useNumberNamespace`). Repo-wide grep confirms zero remaining pro identifiers in `apps/mobile`. Ships with the next mobile EAS build; no API redeploy or env changes needed.

---

## 2026-08-08 — Redis Public-Response Cache: single-flight + TTL jitter (commit `56068e7`, pushed to main)

**Why:** viral WhatsApp collection links fan out thousands of requests at `/api/c/*` — and the web `/api/c/*` routes are *proxies* to the public API, so with no server cache every request recomputed 3–4 Postgres queries. One cache at the API covers every surface (web proxy, browser, mobile).

**What:** `apps/api/src/lib/public-cache.ts` — cache-aside read with single-flight stampede protection + TTL jitter, wired into **all 6 public GETs** (`/public/collections/:slug`, `/public/retailers/:slug` + `/categories` + `/categories/:categoryId`, `/public/products/:productId` + `/related`).

- **Single-flight** — atomic `SET NX PX` lock per key: only the winner recomputes; everyone else polls for its result (bounded 2.5s, then computes as a bounded fallback). Double-check after acquiring; lock released in `finally`. Any Redis error at any step degrades to a direct DB read — a cache must never fail a request.
- **Jitter** — each entry expires at 60s base + 0–50% random offset at write time, so same-instant writes never expire together.
- **Own short-fail ioredis client** (`maxRetriesPerRequest: 1`, `enableOfflineQueue: false`, `lazyConnect`) — deliberately **NOT** `getRedis()`: BullMQ requires `maxRetriesPerRequest: null`, which retries forever on a down connection and would hang the public hot path.
- **Keys** — `public:get:{path}?{sorted query params}` so equivalent URLs share one entry.
- **Cache-Control headers moved outside the wrap** — cache hits still set them. 404s are never cached; suspended-retailer responses are (60s). POSTs (view/enquire/favorite/leads) untouched — their mutated counters aren't in the cached payload.
- **60s TTL is the invalidation** — retailer product/collection/suspension edits appear on the storefront within a minute, no cross-service cache-busting.
- `withPublicCache` bypasses Redis under `NODE_ENV=test` so existing route tests stay deterministic.

**Tests:** `public-cache.test.ts` — 9 cases with a fake Redis (cache hit, miss + jittered EX + lock release, jitter bounds 60/89, single-flight one-compute-for-two-callers, stalled-winner bounded fallback, Redis-down fail-open, corrupt-value recompute, query-key normalization, env bypass). **Verified:** api tsc clean, full API suite 354/354, biome clean.

**Ops note:** no env vars needed (`REDIS_URL` already configured). The cache is live on deploy; watch for reduced Postgres load on storefront endpoints. Not covered yet: product-detail presigned-URL freshness (fine — R2 presigns are 1h, cache is 60s) and a Redis-outage latency spike (each miss pays one fast connection-attempt reject).

---

 + Store-URL Rename Sync + Onboarding QR Nudge + Pro-Mode Error (commit `3311fc7`, pushed to main)

Session source: crashed-session recovery (#1 → Pro-mode camera error root-caused), stale store name in URL (#3), QR generate/delete with verification (#4), plus follow-up asks (onboarding QR nudge, actionable Pro-mode error, settings URL-change notice).

### QR generate/delete with verification (#4)
- `DELETE /v1/retailers/me/qr-slug` (new, `apps/api/src/routes/retailers/retailers-settings.ts`) — idempotent 204, audit-logged, clears `public_slug`. `POST /me/qr-slug` collision loop hardened (bounded retries + timestamp fallback).
- `apps/mobile/app/store-profile.tsx` rewritten — Store QR screen no longer auto-creates a QR on open. No slug → **"Generate QR Code"** button (empty state); slug exists → Share/Save + **"Delete QR"** which requires **typing the shop name** before the delete enables — never deletes directly. Close button falls back to the dashboard via `router.canGoBack()` (onboarding routes here via `router.replace`, so there is no prior route in the stack).

### Store URL follows the shop name (#3)
- `PUT /v1/retailers/me` (`apps/api/src/routes/retailers/retailers-profile.ts`) regenerates `public_slug` from the new shop name whenever the name changes **and** a QR slug already exists — bounded collision retries then a timestamp suffix. Never regenerates for unchanged names or when no QR exists yet (a live retailer's intentional state is never clobbered).
- `apps/mobile/app/settings/index.tsx` — one-shot **"Your store link has changed"** banner after such a save: new link (tappable, opens browser) + "View QR Code" → Store QR screen + Dismiss. Fires only when the PUT response's slug actually differs from the previous one — exactly matching the backend's regeneration condition.

### Onboarding QR nudge
- `apps/mobile/app/onboarding.tsx` — final "Done" step gains **"Create your store QR code"** (between "Go to Dashboard" and "Get help adding your catalog"): completes onboarding with the same final-save + confetti pattern, then lands on the Store QR screen.

### Pro-mode cleanup error — actionable message (#1, root cause of the camera error)
- Root cause: `POST /products/pro-cleanup` needs `PHOTO_CLEANUP_SERVICE_URL` (new env var, empty by default); unset → local-python fallback, but the 2026-08-08 sidecar commit removed Python from the Railway API container → every Pro-mode capture failed with a generic error.
- `apps/api/src/plugins/error-handler.ts` — new `serviceUnavailable()` helper (503 `SERVICE_UNAVAILABLE`).
- `apps/api/src/routes/products/products-pro-cleanup.ts` — all-photos-fail branch scans per-photo error strings for environment signals (python missing, `No module named`, cleanup-service errors, fetch/network failures, timeout caps) → **503 "Professional photo processing is temporarily unavailable… or use Photo mode instead"**; photo-quality failures (e.g. corrupt JPEG) keep the generic 422.
- `apps/mobile/app/product/add.tsx` — Pro catch shows **"Pro photos are unavailable right now — try again later, or use Photo mode instead."** on 503/`SERVICE_UNAVAILABLE`.
- **Remaining ops action (per policy, not done):** set `PHOTO_CLEANUP_SERVICE_URL` + `CLEANUP_SHARED_SECRET` on the API service and deploy the sidecar — until then the message guides retailers to Photo mode but Pro stays down.

### Also in `3311fc7` (in-flight onboarding redesign from the crashed session)
4-step flow (Shop → Location → GST → Done), Terms/Privacy links via the new shared `apps/mobile/src/lib/web-url.ts` helper + `apps/web/src/app/terms/page.tsx`, DB category self-heal on `GET /categories` (gated on `onboarding_completed` so intentional deletions are never re-added), tabs onboarding-gate fix (`isFetching` guard so a stale cached `false` can't bounce a finished signup back to step 1), scan-text-strings helper scripts.

### Verified
API suite **332/332** (5 new: rename regeneration, DELETE qr-slug idempotency, 503 env-down vs 422 photo-quality), api + mobile `tsc --noEmit` clean, biome clean. Committed `3311fc7` and pushed to origin/main. Behavior is live only after the API service is redeployed (slug regeneration + qr-slug delete + 503 classification).

---


## 2026-08-08 — Add-Product Flow Rework + F-028 Auto-Contrast Background (uncommitted working tree)

User asked for a full cross-check of the add-product pipeline: "every step has errors, I want everything clean and processing AI in background — retailer/team member clicks photos and saves them with adding price, rest everything detected by AI tagging, and set the background" (admin uploads backgrounds, AI picks dark→light / light→dark automatically). Code-complete + fully validated this session; **not committed** (working tree only).

### Flow change (mobile `apps/mobile/app/product/add.tsx`)
- **Blocking upload step removed.** The old camera → preview → "Uploading Product" 4-step progress screen (`ai_tagging` step, `handleUploadAndTag`, progress/spinner machinery, `UPLOAD_STEPS`) is deleted. Flow is now: shoot → preview → Use Photo → **edit (add price)** → Save. Upload happens **at Save time** (single fast request); AI tagging + cleanup + background run server-side after creation.
- **Auto-clean ON by default** (`autoCleanup` now `useState(true)`) per user decision; background picker chip relabeled **"White" → "Auto"** (null now means auto-contrast pick, not plain white) in both the edit screen and pro_options.
- Dropped the now-dead pre-save color-detect chip + `aiTags` state — the background AI job fills category/color/fabric after save (`search_tags: []`, only retailer-entered fields in the create payload).
- Copy updated: "AI will auto-fill category, color, fabric and pick the best background after you save."

### F-028 — Auto-contrast background selection (whole stack)
Admin uploads background images as today; each now carries a **tone** (LIGHT/DARK). The AI pipeline auto-picks a backdrop whose tone OPPOSES the garment — dark garment → light backdrop, light garment → dark backdrop; mid-tone/unclassified falls back to plain white exactly as before. Explicit retailer picks always win.

| Layer | Files | Summary |
|---|---|---|
| Shared | `packages/shared/src/constants/index.ts` | `classifyColorTone(name)` — maps AI color name → hex via `FASHION_COLOR_ALIASES` (lowercase keys), WCAG relative-luminance bands: dark < 0.35, light > 0.6, else null (no guess). Tests `packages/shared/src/colors.test.ts` (5) |
| AI | `packages/ai/src/image-quality.ts` | `imageLuminance()` (sharp 32×32 raw average, WCAG linear) + `isDarkImage()` (true <0.35 / false >0.6 / null). Tests extended (4 new) |
| DB | `packages/db/prisma/schema.prisma` + `migrations/047_background_tone/migration.sql` | `BackgroundTone` enum + `background_images.tone` nullable (null = unclassified → never auto-picked) |
| API lib | `apps/api/src/lib/backgrounds.ts` (+ test) | `pickContrastBackground(tone)` → newest ACTIVE backdrop of opposite tone; null when none |
| Tag job | `apps/api/src/jobs/tag-product.ts` | Auto-clean path: reads product's explicit `background_image` (if active) → wins; else `classifyColorTone(ai primary_color)` → `pickContrastBackground`. Never clobbers, best-effort as before. +2 F-028 tests (dark→LIGHT pick, explicit-pick wins) |
| Pro cleanup | `apps/api/src/routes/products/products-pro-cleanup.ts` | No explicit `background_image_id` → `isDarkImage()` on the raw kept frame (proxy: frame ≈ garment for straight-on pro shots) → `pickContrastBackground` |
| Admin API | `apps/api/src/routes/admin/admin-media.ts` | Background CREATE computes tone from the uploaded image buffer (`isDarkImage`, best-effort); PATCH accepts explicit `tone` override (null clears), audit metadata before/after |
| Admin UI | `apps/web/src/app/admin/background-images/page.tsx` | Per-backdrop tone badge (Light/Dark/Unclassified) + Auto/Light/Dark override `<select>`, F-028 blurb |

### Verified
- `tsc --noEmit` clean: api, mobile, web, shared, ai (needed `pnpm build` for shared/ai dist + `prisma generate` — hit a Windows EPERM on the engine DLL while a dev server held it; `--no-engine` generated types, then plain generate succeeded).
- Tests: API **342/342** (26 files, +5 F-028: 2 tag-product, 3 backgrounds lib), AI 67/67 (+4 luminance), shared 15/15 (+5 colors). One transient API failure seen mid-session, passed on re-run (flake).
- Biome: new files clean (auto-fixed `parseInt`→`Number.parseInt`); remaining add.tsx/page.tsx warnings are pre-existing baseline.

### Known limitation (by design)
- Pro-mode auto-contrast uses **raw-frame average luminance** as a garment-tone proxy — a busy backdrop can skew it. The tag-product path (AI color name) is the accurate one; pro path stays best-effort with white fallback. Revisit with a garment-mask-aware luminance pass if skewed picks show up in practice.

### Ops note
- Migration 047 needs applying (`pnpm db:push` in dev / Supabase SQL Editor in prod) before the tone column exists. Deploy order: DB migration → API → web → mobile rebuild. The early-disable Pro UX (previous session) already guards the mobile side until the cleanup sidecar is deployed.

## 2026-08-08 — Photo-Cleanup Sidecar (torch/SAM2 leaves Railway) — DECISION + BUILT

**Decision (user confirmed whole-pipeline move, 2026-08-08):** the torch/SAM2 stack runs in a NEW sidecar on the Hetzner CX43 box, NOT the Railway API container. Evidence: `scripts/demo/2026-08-08-sam2/memtest.py` measured the full pipeline (rembg+SAM2+LaMa, real mannequin photo) at **2,058 MB peak (auto) / 2,198 MB (point-prompt)** vs **960 MB baseline** (rembg+LaMa) — the SAM2 child ALONE exceeds the Railway container's whole 2 GB cgroup (2026-08-05 OOM bump), before Node's RSS is even counted. Baking into the Dockerfile was a guaranteed OOM, not a risk. CPU time on this desktop is also 47–71s/photo → 5-photo batches blow the 600s mobile timeout on Railway's throttled shared CPU.

### Shipped
- `services/photo-cleanup/` (new): FastAPI sidecar wrapping `scripts/batch-clean-photos.py` — `POST /clean` (multipart: photo + optional background + form options incl. `prompt_points`/`prompt_excludes`) → `{ output, image_b64 }`, `GET /health`. Shared-secret auth (`X-Cleanup-Key` = `CLEANUP_SHARED_SECRET`, V-Tone pattern). **Zero outbound fetches** — the API SSRF-fetches and ships bytes, so no SSRF surface on the box. `threading.Lock` serializes runs (one ~2.2GB process at a time). Dockerfile bakes isnet-general-use (~170MB), big-lama (~196MB), sam2.1_hiera_tiny (~156MB) at build; compose on port 8001. `test_app.py`: 9/9 pure `build_args` mapping tests.
- `apps/api/src/lib/photo-cleanup-runner.ts`: new `runPhotoCleanup()` — dispatches on `PHOTO_CLEANUP_SERVICE_URL`: set → service mode (fetch photo/bg SSRF-safe → multipart POST → base64-decode), unset → local exec fallback (dev). Pure `buildCleanupScriptArgs()` mirrors the sidecar's mapping (both unit-tested). 9/9 runner tests.
- `apps/api/src/routes/products/products-pro-cleanup.ts` + `apps/api/src/routes/admin/admin-photo-cleanup.ts`: both collapsed onto `runPhotoCleanup()`. Pro route gains the **tap-to-fix API half**: per-photo `hardware_points`/`garment_points` (normalized 0..1, zod-clamped) → `promptPoints`/`promptExcludes`, response `tap_removed` flag, audit `tap_removed_count`.
- `apps/api/Dockerfile`: python3/pip/rembg/simple-lama layers + u2net/LaMa pre-bake REMOVED (ffmpeg stays) — the whole 2GB budget returns to Node. Local dev keeps working via the runner's exec fallback (dev boxes install python by hand).
- Integration keys: `PHOTO_CLEANUP_SERVICE_URL` + `CLEANUP_SHARED_SECRET` added to INTEGRATION_KEYS (Admin → Integrations, F-012), `.env.example` documented.

**Verified:** api tsc clean, API suite **326/326** (25 files; runner 9 + pro-cleanup 8 incl. 2 tap-to-fix cases), mobile tsc clean, biome clean on new TS (constants file's CRLF formatting is pre-existing, HEAD fails identically), sidecar live-booted: `/health` ok + real `POST /clean` on the mannequin photo → **HTTP 200, 46.8s, 172KB JPEG** end-to-end.

**Deploy (user runs — manual per policy):** (1) on the box: `docker compose -f services/photo-cleanup/docker-compose.yml up -d --build` with `.env` (`CLEANUP_SHARED_SECRET`), `ufw allow 8001`; (2) Railway API service: set `PHOTO_CLEANUP_SERVICE_URL=http://2.28.56.91:8001` + `CLEANUP_SHARED_SECRET` (or Admin → Integrations); (3) redeploy API (Dockerfile now ships no python). Before that deploy, the sidecar is the only place SAM2 runs; Railway cleanup degrades to the admin page's rembg-only path or `python not found` — the retailer pro-cleanup feature needs the sidecar up.

---

## 2026-08-08 — AI Professional Product-Photo Pipeline BUILT (docs/photo-feature 2026-08-07 review → dev)

User approved full build of the reviewed feature (docs/photo-feature/ai-photo-requirements-analysis-and-thoughts-2026-08-07.md §6 items 1–3): SAM2 hardware removal + retailer capture flow + API wiring. Scope decisions: SAM2 + staff instruction (both), retailer-choosable backdrop, mood-board-only (no staged scenes).

### Backend — SAM2 hanger/mannequin removal + pro-cleanup API
- `scripts/batch-clean-photos.py`: new `--remove-hardware` (SAM2 automatic mask generation → `classify_hardware_masks()` heuristics → LaMa masked inpaint) and `--tight-crop` (garment bbox + margin framing). rembg session made lazy so the pure helpers import without loading the 170MB model. Best-effort by design: missing torch/sam2 prints `HARDWARE_SKIPPED` and proceeds — the ₹0 path never fails the photo.
- `scripts/test_remove_hardware.py`: 7/7 pure numpy tests on the mask classification (border-touch/above-garment heuristics, garment-overlap exclusion, size floors).
- `packages/ai/src/image-quality.ts`: `scoreSharpness()` (Laplacian variance via sharp, 512px downscale) + `pickSharpest()` — auto-flags the sharpest cleaned photo as primary, ₹0, no ML. 5/5 tests. Exported from `@kanchuki/ai`.
- `apps/api/src/lib/photo-cleanup-runner.ts` (new): `runPhotoCleanupScript()` + `serializePhotoCleanup()` extracted from the admin route (python3/python discovery, "No module named" binary fallback, 2GB-container memory serialization). Admin route refactored to use it — one runner, one behavior.
- `apps/api/src/routes/products/products-pro-cleanup.ts` (new, registered in products.ts): `POST /products/pro-cleanup` — fetches each raw (SSRF-safe), runs the pipeline per photo (backdrop via F-011 library / white, optional `--remove-hardware`, `--tight-crop`, optional per-photo crop rect), compresses ≤80KB, writes cleaned sibling keys (`-pro` suffix under the retailer's own prefix), scores sharpness, picks primary. Quota: `BG_REMOVAL` per photo + `IMAGE_CROP` when a crop rect is sent (F-010 rails, same counters as existing cleanup). Ownership guard on `r2_key` prefix. `PHOTO_CLEANUP` audit entry. Per-photo best-effort (one bad shot can't kill the batch). 7/7 route tests.
- **Sync-route decision:** runs serialized with the admin page (one Python process at a time), NOT a BullMQ job — matches the existing admin pattern, no new queue surface. Mobile holds a 10-min timeout on the processing screen.

### Mobile — Pro capture mode in product-add (`app/product/add.tsx`)
- New **Pro** mode chip (Photo / Scan / Pro): shoot 1–5 shots with garment-frame guide copy, gallery multi-select, Continue at ≥3.
- Review screen: keep ≥3 (Best = file-size heuristic, tap to remove), options screen: backdrop picker + "Remove hanger/mannequin" + "Crop to garment" switches, processing screen with status.
- `productApi.proCleanup()` (10-min timeout). Pro raws upload with `compress: false` — the pipeline needs full-quality segmentation input; the server compresses output. Save uses the cleaned primary + cleaned extras directly (no re-upload, `auto_cleanup` off, auto-clean toggle hidden). Stale-state guard: proUploads cleared when leaving the pro flow.

### Verified
- `tsc --noEmit` clean: packages/ai (built), apps/api, apps/mobile. API suite 315/315 (24 files) incl. 7 new pro-cleanup tests + 4 admin-photo-cleanup (refactored) tests. AI suite: image-quality 5/5 (2 pre-existing flaky image-compress precision tests fail in isolation — untouched by this feature). Python: 7/7 hardware + 2/2 ghost-mannequin + py_compile. Route-size guard + biome clean on all changed files.

### Not built (deliberate, per scope)
- Photoroom/Claid A/B paid-fallback trial (optional item 4) — ₹0 path covers everything until then.
- On-device blur/exposure reject-and-reprompt — sharpness scoring happens server-side instead; capture guide copy is the zero-cost nudge.
- Interactive tap-to-fix SAM2 override UI — auto path only; known limitation (SAM2 may merge garment+mannequin into one mask) documented in the review docs.
- Deployment: Railway rebuild needed for the Python/rembg/LaMa Dockerfile to be live; SAM2 additionally needs torch + sam2.1_hiera_tiny checkpoint in the container (or on the Hetzner CX43 box) — graceful `HARDWARE_SKIPPED` fallback until then.

### 2026-08-08 follow-up — SAM2 live-validated on the dev box (torch 2.13 CPU + sam2.1_hiera_tiny)

Installed torch CPU + `sam2.1_hiera_tiny` (156MB ckpt) at `tools/sam2/` and ran the full pro pipeline on the 3 real demo photos (`scripts/demo/2026-08-08-sam2/`, gallery: `gallery.html`). Two script bugs found + fixed during validation: (1) `build_sam2()` hardcodes `device="cuda"` — pass `device="cpu"` when `torch.cuda.is_available()` is false or CPU-only torch crashes with "Torch not compiled with CUDA enabled"; (2) SAM2 ships configs INSIDE the package (`sam2/configs/...`) — `_resolve_sam2_cfg()` now tries `pkg_dir/configs` before `pkg_dir.parent/configs`. Also fixed a real classifier bug: the full-frame *wall* mask (66.8%, touches all borders) was being picked as the garment — garment is now the largest **non-border-touching** mask (unit tests updated, still 7/7).

**Measured results (honest):** CPU cost ≈ **3m46s / 3 photos (~1.2 min/photo)** — validates the 10-min mobile timeout. shot3 (folded on bedsheet): SAM2 detected + inpainted the bottom sheet strip (14,323 px), output differs from engine-only — but tight-crop already crops that strip, and sheet pixels physically touching the garment silhouette survive rembg. shot1 (mannequin) + shot2 (hanger): **byte-identical to engine-only** — SAM2 tiny auto-mask fuses the hardware into the garment mask (points_per_side 16→32 tested: identical masks). This is exactly the review docs' predicted merged-mask limitation: the interactive **tap-to-fix point-prompt override is now the required next build**, not more auto-mask tuning. Grey-plastic pixel metric unchanged on all three (sheet/hardware pixels touching the silhouette are kept by rembg as foreground).

---

## 2026-07-16 — Bug Fixes & Feature Polishes

Source: user's 8-item bug/feature list (product detail, collections, QR, etc).

### #1 — Collections list: no edit/delete buttons ✅ FIXED & COMMITTED
- Backend: Added `PATCH /v1/collections/:id` route (title + expires_days) in `apps/api/src/routes/collections.ts`
- Mobile API: Added `collectionApi.update()` (PATCH) and `collectionApi.delete()` (DELETE) in `apps/mobile/src/lib/api.ts`
- Collections list: Rewrote `apps/mobile/app/(tabs)/collections.tsx` with edit modal (title + expiry), delete button with confirmation, and inline edit/delete icons on each card
- Collection detail: Rewrote `apps/mobile/app/collection/[id].tsx` with header edit/delete buttons + same edit modal

### #2 — Product detail main image cutoff top/bottom ✅ FIXED
- `apps/mobile/app/product/[id].tsx` carousel image: changed `contentFit="cover"` → `contentFit="contain"` on line 582 so the full image is visible without cropping

### #3 — Crop & Remove Background "Something went wrong" ✅ FIXED
(previously committed `6d3a748`)

### #4 — Delete product "Something went wrong" (dev error visibility) ✅ FIXED
- `apps/api/src/plugins/error-handler.ts`: Added `NODE_ENV === 'development'` gate that passes the real error message + stack trace in the 500 response instead of the generic "Something went wrong"

### #5 — Add color variant: photo preview black screen + no AI color detect ✅ FIXED
- Black screen: `apps/mobile/app/product/[id]/add-color.tsx` — changed `className="flex-1"` to `style={{ width: '100%', height: '100%' }}` on the preview Image
- AI color detect: Added `POST /v1/products/detect-color` backend endpoint using Claude Haiku (cheap, fast). Added `detectColor()` export to `packages/ai/src/tagger.ts`. Integrated into add-color screen: auto-uploads photo + detects color in background, pre-fills the color field

### #6 — "New Arrivals" auto-tag, 30-day auto-expiry ✅ BUILT
- No cron/migration needed — derived flag from `product.created_at >= now() - 30 days`, computed at query time
- Backend: Added `is_new_arrival` to product list response (`apps/api/src/routes/products.ts`), search results (`apps/api/src/routes/search.ts`), and a query filter `?is_new_arrival=true`
- Mobile: Added "New Arrivals (30d)" filter chip in catalog filter panel (`apps/mobile/app/(tabs)/catalog.tsx`), wired to the query param

### #7 — Collection share link uses LAN IP, not hyperlinked 🔄 CONFIG ISSUE
- Root cause: `WEB_URL` in `.env` is `http://192.168.1.4:3000` (LAN IP)
- The code already correctly reads `WEB_URL` — needs a public-reachable URL (tunnel or deploy)
- Also affects #8's QR code profile URLs
- **Action needed:** Set up a tunnel (ngrok/devtunnels) or deploy `apps/web` publicly, then update `WEB_URL`

### #8 — Store QR code not generated + no JPG/PNG download ✅ PARTIALLY FIXED
- QR generation was already working (confirmed in code review) — relied on same `WEB_URL` config as #7
- Added QR image export: `apps/mobile/app/store-profile.tsx` — uses `react-native-qrcode-svg`'s `getRef().toDataURL()` to capture the QR as base64 PNG, saves to cache via `expo-file-system`, then shares via OS share sheet. No JPG-specific export (PNG-only from SVG)
- JPG/PDF export not added — PNG via share sheet covers the save-to-gallery use case without needing additional dependencies

### Environment notes
- `apps/api/.env` → `WEB_URL="http://192.168.1.4:3000"` — root cause of #7/#8.
- For #7 resolution: use `ngrok http 3001` or devtunnels to get a public HTTPS URL, then update `WEB_URL`

### Known gap (flagged, not fixed yet)
**"Enquire about N items" can miss favorited products from unvisited pages.** Root cause: favorites are stored as bare product IDs (`lib/wishlist.ts`); the enquiry message resolves name/price from a session-only cache of fetched pages. A product favorited on a grid page never re-fetched this session won't resolve.
**Planned fix (not yet built):** store a small product summary (id, name, price_min, price_max, category) in the wishlist instead of a bare id — resolved at heart-click time from data already in hand (`ProductCard`/`ProductDetailSheet` both hold the full summary object). Net deletion of the current session-cache workaround, not just a patch. See `docs/PRO-REQUIREMENTS.md` F-006 acceptance criteria.

---

## 2026-07-24 — Feature Completion: F-001d, F-009, F-010, F-011, F-012 + WhatsApp Architecture Decision

### Features Built (accumulated, not previously logged in progress)

#### F-001d: Guided Bulk Onboarding (500–3000+ SKU stores)
- ✅ Perceptual-hash duplicate detection (`packages/ai/src/phash.ts` — 64-bit aHash, hamming distance, threshold=8)
- ✅ Migration `019_product_photo_phash` — `ProductPhoto.phash` column for crop-level perceptual hash
- ✅ Rack/shelf batch capture screen (`apps/mobile/app/product/bulk-onboard.tsx`) — location entered once per photo, running counter across sessions, inline "New rack" creation, link to supplier PDF import
- ✅ `flagDuplicates()` in `catalog-import.ts` — scans existing phashes, flags nearest match within threshold, non-blocking (retailer can still save)
- ✅ `default_section_id` + per-item `section_id` override in `bulkCreateProducts` — both validated to belong to the retailer, silently dropped if not

#### F-009: Retailer Account & Team Settings
- ✅ Full settings screen (`apps/mobile/app/settings/index.tsx`):
  - Profile editing: shop name, owner name, city, state, address line 1, GSTIN, pincode
  - Store logo upload (square crop, presigned URL to R2)
  - Account delete with "type DELETE" confirmation modal (soft-delete)
  - Subscription view + usage vs limits progress bars (F-010)
  - WhatsApp number config (10-digit validation, falls back to phone)
  - WhatsApp Business API config (bring-your-own Meta: phone number ID, access token, template)
  - KYC document upload (GST cert + Aadhar front/back, status display)
- ✅ Team/staff management (`apps/mobile/app/settings/staff.tsx`): invite by phone, list with role badges, remove with confirmation
- ✅ Migrations: `023_whatsapp_number`, `024_retailer_logo_kyc`

#### F-010: Quota & Limits System
- ✅ `plan_limits`, `retailer_limit_overrides`, `usage_counters`, `quota_addon_purchases` tables + `QuotaResourceType`/`QuotaPeriod` enums
- ✅ Migration `020_quota_system` (applied live)
- ✅ `apps/api/src/lib/quota.ts`: `checkQuota()` fails-open when no plan_limits row exists; `effectiveLimit()` checks overrides first; `periodStart()` for DAY/MONTH/LIFETIME
- ✅ `incrementUsage()` upsert on `(retailer_id, resource_type, period_start)` unique key
- ✅ Wired into: `products.ts` (PRODUCT_UPLOAD, BG_REMOVAL), `tag-product.ts` (AI_TAGGING_CALL, BG_REMOVAL), `tryon.ts` (TRY_ON), `catalog-import.ts` (IMAGE_CROP, AI_TAGGING_CALL, PRODUCT_UPLOAD)
- ✅ Admin plan-limits CRUD: `GET/PUT /admin/plan-limits` + web UI at `/admin/plan-limits`
- ✅ Admin per-retailer overrides: `GET/POST/DELETE /admin/retailers/:id/overrides` + web UI on retailer detail page
- ✅ Seed script: `seed-plan-limits.ts` — PRODUCT_UPLOAD (LIFETIME), AI_TAGGING_CALL (LIFETIME), TRY_ON (MONTH) for all 3 plans
- ✅ Retailer sees usage vs limit per resource in F-009's settings (color-coded progress bars at 80%/100%)

#### F-011: Custom Product Background Library
- ✅ `BackgroundImage` model + migration `027_product_background_images` (RLS enabled, admin-only)
- ✅ Admin panel screen (`/admin/background-images`): upload via presigned URL, toggle active/inactive
- ✅ `GET/POST/DELETE /admin/background-images` in admin.ts with R2 presigned upload URL
- ✅ `cleanupProductPhoto()` in `detector.ts` accepts optional `backgroundImageUrl` param — composites RGBA cutout onto it via `sharp.composite()`; falls through to white flat when unset
- ✅ Spin frame extraction passes the same background URL through for consistent frames
- ✅ `Product.background_image_id` nullable FK (null = white, unchanged behavior)

#### F-012: Encrypted Integration Settings
- ✅ `IntegrationSetting` model + `IntegrationCategory` enum: stores AES-256-GCM-encrypted credentials for third-party services
- ✅ `packages/db/src/secrets.ts`: `encryptSecret()`/`decryptSecret()` (AES-256-GCM via `node:crypto`), `getSecret()`/`setSecret()` for runtime lookup, `maskSecret()` for safe API returns
- ✅ `invalidateSecret()` to delete a stored integration key
- ✅ Admin panel screen at `/admin/integrations`: add/edit/delete integration settings, values masked in UI, toggle active/inactive
- ✅ `INTEGRATION_KEYS` constant in `@kanchuki/shared` — defines which keys are DB-manageable (excludes bootstrap keys like DATABASE_URL)

#### Other built features (not previously logged):
- ✅ 360-degree product spin view: spin frame extraction job, mobile slider UI, admin review
- ✅ Retailer product categories: `ProductCategory` model + migration, mobile CRUD UI, customer web category browse
- ✅ Customer collection pagination: cursor-based pagination on collection web pages
- ✅ Retailer logo/address/KYC fields: full schema + mobile upload UI + admin review
- ✅ WhatsApp Business API bulk-send: bring-your-own Meta credentials, collection bulk-send via template
- ✅ One-by-one WhatsApp share: contact-gated per-product share with prefilled message
- ✅ Public QR storefront profile: `Retailer.public_slug` + `/store/[slug]` contact gate → collection view
- ✅ F-001d features merged into catalog-import.ts pipeline
- ✅ F-006 wishlist known gap documented but not fixed (bare product IDs in localStorage — can't resolve names from unseen pages)

### Docs Audit (2026-07-24)
**Issue found:** PLAN.md and PRO-REQUIREMENTS.md had F-001d, F-009, F-010, F-011, F-012 all listed as 🔴 Not started / 🔲 Planned, when they were actually fully built.

**Fixed:**
- PLAN.md: Marked Month 4b as ✅ Completed with all 4 features. Updated F-001d checkbox to [x].
- PRO-REQUIREMENTS.md: Updated F-001d, F-009, F-010, F-011 status to ✅ Built with detailed implementation descriptions.
- PROGRESS.md: This entry.

**Still pending from the plan (at that time):**
- F-006B: Offline Catalog Browsing
- F-006 wishlist bug (bare product IDs in localStorage)
- Phase 0.5: SupportTicket routing, manager rollup reporting, staff Expo mode
- Phase 1+: Fashion DNA, Remote VTO, Auto-Personalized Collections
- F-302: L2 Ecommerce Checkout

---

## 2026-07-24 — Collection Perf + WhatsApp-Commerce Architecture Decision

### Server-side pagination + thin product fields ✅ SHIPPED
- `/public/collections/:slug` and `/retailers/:slug/categories/:categoryId` now paginate (page/pageSize) and filter (category/occasion/price/color) at the DB level instead of shipping every product's full photo/spin-frame/variant arrays on every load
- New `GET /public/products/:productId` fetches full detail (photos, spin frames, variants, tags) only when a customer opens a product
- New shared `PublicProduct` (thin, grid) vs `PublicProductDetail` (full) types in `packages/shared`
- 360° spin: added a "View 360°" icon below the photo slider that opens a fullscreen overlay (close button) — kept the existing spin-as-last-slide behavior too, per user choice
- Product grid paginated client UI (Prev/Next, 12/page)

### Decision: WhatsApp-as-commerce architecture
User wants to offer a paid "ecommerce" tier on top of the existing WhatsApp catalog-link flow: customer adds a product to cart, fills address, pays online — money going to the *retailer*, not Kanchuki.

**Key finding:** WhatsApp itself isn't a viable checkout/payment rail for a third-party SaaS platform (Meta's Catalog/Cart + WhatsApp Pay are effectively unavailable to a new platform at this stage). WhatsApp stays what it already is — a share/notify channel. Cart → address → payment happens in the existing customer PWA (`apps/web/src/app/c/[slug]`).

**Two-stage payment architecture, decided:**
1. **Stage A — Direct-to-Retailer (build first).** Each retailer connects their own Razorpay account (their own KYC). Kanchuki stores their key/secret encrypted (reuses the F-012 `encryptSecret`/`decryptSecret` AES-256-GCM helpers, new per-retailer table instead of the global `IntegrationSetting` row). Kanchuki never custodies retailer sale money → no RBI Payment Aggregator license needed.
2. **Stage B — Razorpay Route (upgrade later).** Retailer onboards via Razorpay's Linked Account (Route) instead of bringing their own account; Kanchuki's Razorpay account becomes merchant-of-record and auto-splits funds to the retailer, optionally taking a platform commission. Lower retailer friction, more setup, needs Razorpay/legal confirmation on current marketplace-payment guidance before enabling for real money.

Full design (new `Order`/`OrderItem`/`RetailerPaymentAccount` models, tier-gating via "has an active payment account", API endpoints, webhook signature verification, GST invoicing) written into `docs/PLAN.md` (Month 15–16), `docs/PRO-REQUIREMENTS.md` (F-302/F-307), `docs/DATABASE.md`, `docs/SECURITY.md`, and root `CLAUDE.md`.

---

## 2026-07-25 — Docs Sync: F-006B Offline PWA & F-302 Ecommerce Checkout marked as Built

### What was already built (not previously logged in docs)

#### F-006B: Offline Catalog Browsing (PWA) — ✅ Already built
- Serwist (`@serwist/next@9`, `@serwist/sw@9`) installed and configured
- `next.config.mjs` wraps config with `withSerwist()` — cache on navigation, reload on online
- Full service worker at `apps/web/src/app/sw.ts` — precaching, runtime caching, skipWaiting, clientsClaim
- Product photos: cache-first (long TTL)
- Catalog/detail JSON: network-first-with-cache-fallback
- Wishlist/cart already offline via localStorage; enquiry already offline via WhatsApp's own queue

#### F-302: L2 Ecommerce Checkout — ✅ Already built
- Full Prisma schema: `RetailerPaymentAccount`, `Order`, `OrderItem` models
- Backend: `apps/api/src/routes/checkout.ts` — connect/disconnect payment account, create order, verify payment, Razorpay webhook with signature verification and replay protection, retailer order management
- Customer web UI: Cart page (`cart/CartPage.tsx`), Checkout form with Razorpay Checkout.js (`checkout/CheckoutForm.tsx`), Order view (`order/[orderId]/OrderView.tsx`)
- Tier gate: `GET /public/checkout/retailer-status/:slug` — active payment account = L2 enabled
- Server-side amount computation, atomic product reservation, webhook-driven status transitions
- GST invoice generation (5%/12% apparel HSN rates)
- Step-up OTP re-auth for payment account changes (SECURITY §11.8)

### Docs updated
- **PRO-REQUIREMENTS.md**: F-006B → ✅ Built (was 🔴 Not started). F-302 → ✅ Built (was 🔴 Not started). F-006 wishlist bug → noted as fixed.
- **PLAN.md**: Updated Month 4b to include F-006B and F-302 as completed. Updated Month 15-16 to show Stage A as built, Stage B as future.
- **PROGRESS.md**: This entry.
- **progress.md**: (root) Updated. Now consolidated into this file.

**Still pending from the plan:**
- Phase 0.5: Staff Expo mode — *SupportTicket routing + manager report dashboard completed 2026-07-26*
- Phase 1+: Fashion DNA, Remote VTO auto-personalized collections
- Onboarding tutorial improvements (10-retailer pilot feedback)

## 2026-07-25 — F-010 Quota & Limits Audit: System Fully Built & Operational

### Context
User asked about setting per-plan limits for storage, AI tagging, try-on, etc., with admin tracking and self-serve "buy more" option. I (Buffy) initially assumed this was a new feature request, but upon reading the actual codebase, the entire F-010 system is **already fully implemented and wired into every endpoint**. This entry documents what was found.

### What's Built (F-010 Quota & Limits System)

#### Backend (`apps/api/src/lib/quota.ts`)
| Function | Purpose |
|----------|---------|
| `checkQuota(retailerId, resourceType, amount?)` | Gates any metered action — checks `UsageCounter` against `RetailerLimitOverride` → `PlanLimit`, throws `planLimitExceeded()` (402) if over limit. Fails open (returns) when no `PlanLimit` row exists. |
| `incrementUsage(retailerId, resourceType, amount?)` | Upserts `UsageCounter` row after successful action. Handles DAY/MONTH/LIFETIME period boundaries. |
| `effectiveLimit(retailerId, resourceType)` | Checks overrides first, then plan defaults, returns `null` for unlimited. |

#### Wired Into All Metered Endpoints
| Endpoint | Resource Checked | Usage Incremented |
|----------|-----------------|-------------------|
| `POST /products` | `PRODUCT_UPLOAD` | ✅ `incrementUsage()` after create |
| `POST /products/:id/photos/:photoId/cleanup` | `BG_REMOVAL` | ✅ |
| `PATCH /products/:id/background` | `BG_REMOVAL` | ✅ |
| `POST /try-on/initiate` | `TRY_ON` | ✅ |
| `POST /try-on/remote` | `TRY_ON` | ✅ |
| `POST /catalog-import/detect-items` | `IMAGE_CROP` + `AI_TAGGING_CALL` | ✅ (batch, by detected count) |
| `POST /catalog-import/import-pdf` | `IMAGE_CROP` + `AI_TAGGING_CALL` | ✅ (batch, by detected count) |
| `POST /catalog-import/bulk-create-products` | `PRODUCT_UPLOAD` | ✅ (batch) |

#### Admin API (`apps/api/src/routes/admin.ts`)
| Endpoint | Purpose |
|----------|---------|
| `GET /admin/plan-limits` | List all plan×resource rows |
| `PUT /admin/plan-limits` | Upsert a limit (with audit log: before/after state) |
| `GET /admin/retailers/:id/overrides` | List per-retailer overrides |
| `POST /admin/retailers/:id/overrides` | Create/update override (with audit log) |
| `DELETE /admin/retailers/:id/overrides/:id` | Remove override (with audit log, falls back to plan default) |

#### Admin UI (Fully Built)
| Page | What it shows |
|------|---------------|
| `/admin/plan-limits` | Editable grid: rows=resource types (PRODUCT_UPLOAD, AI_TAGGING_CALL, etc.), columns=plans (STARTER/GROWTH/PRO). Inline number input + period selector + save button per cell. Blank = unlimited (no row). |
| `/admin/retailers/:id` | Full retailer detail with Plan Limits card (progress bars: products/customers/staff/credits), Overrides section with add/remove CRUD, subscription management, KYC docs, product list, usage stats |

#### Retailer-Facing
| Endpoint | Purpose |
|----------|---------|
| `GET /retailers/me/usage` | Returns usage vs limit for all 6 resource types, with source (`plan`/`override`/`unlimited`) |
| Mobile settings | Color-coded progress bars (green/amber/red at 80%/100%) shown under Usage section |

#### Seed Data (`seed-plan-limits.ts`)
| Resource | STARTER | GROWTH | PRO | Period |
|----------|---------|--------|-----|--------|
| PRODUCT_UPLOAD | 500 | 2,000 | -1 (∞) | LIFETIME |
| AI_TAGGING_CALL | 575 | 2,300 | -1 (∞) | LIFETIME |
| TRY_ON | 0 | 100 | 500 | MONTHLY |

### NOT Built (what's actually missing)
1. **QuotaAddonPurchase API** — Self-serve "buy more" checkout flow. Table exists (`quota_addon_purchases` with `razorpay_order_id`/`razorpay_payment_id`), but no API endpoints to create a Razorpay order for addon units, verify payment, or credit the `UsageCounter` after purchase.
2. **Mobile "Buy More" UI** — When a retailer hits a limit, the 402 error shows "upgrade" messaging but no in-app link to purchase additional units.

### Phase 3 Built — Self-Serve Overage Purchases (2026-07-25)

**Status:** ✅ **Built**

Added the complete "Buy More" flow — retailers can now purchase extra units of metered resources directly from the mobile billing screen.

#### What was built

**Shared constants:**
- `ADDON_PRICING` in `packages/shared/src/constants/index.ts` — packs for 6 resource types (PRODUCT_UPLOAD, AI_TAGGING_CALL, TRY_ON, IMAGE_CROP, BG_REMOVAL, API_REQUEST) with prices in paise

**API endpoints (`apps/api/src/routes/billing.ts`):**
- `GET /v1/billing/addon-pricing` — returns available addon packs
- `POST /v1/billing/addon-checkout` — creates Razorpay Payment Link + pending `QuotaAddonPurchase` record, returns `checkout_url` for browser redirection
- `GET /v1/billing/addon-callback` — handles Razorpay Payment Link redirect after successful payment, verifies HMAC-SHA256 signature, credits `UsageCounter` by decrementing count (negative = credit), redirects to success page

**Mobile (`apps/mobile/app/billing.tsx`):**
- "Need More?" section showing usage bars per resource (color-coded at 80%/100%)
- Pack purchase buttons per resource type (up to 2 packs)
- `Linking.openURL` for Razorpay checkout (same pattern as subscriptions — no WebView/native modules needed)
- Auto-refreshes usage data after returning from checkout

**Mobile API (`apps/mobile/src/lib/api.ts`):**
- `billingApi.getAddonPricing()` and `billingApi.addonCheckout()` methods

#### Fixes applied alongside
- Upgraded all `@fastify/*` packages to Fastify v5-compatible versions (FST_ERR_PLUGIN_VERSION_MISMATCH on `@fastify/cors`, `@fastify/rate-limit`, etc.)
- Mobile port 8081 freed
- Serwist `cacheOnFrontEndNav` → `cacheOnNavigation` fix committed

#### Typecheck status
| Package | Errors |
|---------|--------|
| `@kanchuki/shared` | 0 ✅ |
| `@kanchuki/api` | 0 ✅ |
| `@kanchuki/mobile` | 0 ✅ |

### Still pending
- Phase 0.5: SupportTicket routing (schema only), manager rollup reporting, staff Expo mode
- Phase 1+: Fashion DNA, Remote VTO auto-personalized collections
- Onboarding tutorial improvements (10-retailer pilot feedback)

---

## 2026-07-26 — Product Sizes (S/M/L/XL/XXL/XXXL)

Retailer picks which sizes are in stock for a product; customer sees the same list on the product detail page.

- Schema: `Product.sizes String[] @default([])` — migration `034_product_sizes` (not yet applied to any DB, needs `prisma migrate deploy`/dashboard run)
- Shared: `SIZE_OPTIONS` constant (`packages/shared/src/constants/index.ts`), `PublicProductDetail.sizes` type
- API: `sizes` added to `CreateProductSchema`/`UpdateProductSchema` in `apps/api/src/routes/products.ts` (zod enum, reuses existing `...rest` spread into Prisma — no handler change needed); `GET /public/products/:id` now returns `sizes` (`apps/api/src/routes/public.ts`)
- Retailer mobile: checkbox chips in `apps/mobile/app/product/add.tsx` (create) and `apps/mobile/app/product/[id].tsx` (edit), same visual pattern as the existing Occasion chips
- Customer web: "Available Sizes" chip row in `apps/web/src/app/c/[slug]/components/ProductDetailSheet.tsx`
- Catalog import (`apps/mobile/app/product/catalog-import.tsx`) also got sizes: a per-batch "Add sizes?" toggle (default off — most catalogs don't list sizes), and when on, the same S/M/L/XL/XXL/XXXL chips per reviewed item. Off = `sizes` omitted entirely, matching "leave blank if catalog doesn't have size". Backend: `BulkCreateProductsSchema` + `productData` mapping in `apps/api/src/routes/catalog-import.ts`.
- Not touched (YAGNI for now): rack/shelf bulk-onboard flow (`bulk-onboard.tsx`) still doesn't collect sizes — add if retailers ask

---

## 2026-07-26 — Infrastructure Setup Files Created (Vault DB + Role Separation)

Created the setup files and documentation for the 2 remaining infrastructure items.

### What was created

**SQL scripts:**
- `scripts/setup-vault-db.sql` — Complete SQL to create the vault DB `vault_app` role (INSERT-only), `deleted_records` table, indexes, and explicit INSERT/REVOKE permissions. Ready to run against the vault Postgres instance after provisioning.
- `scripts/setup-role-separation.sql` — Complete SQL to create `kanchuki_app` (no DELETE/TRUNCATE/DROP) and `kanchuki_migrator` (full DDL, human-only) roles, tailored for the Supabase project. Includes verification queries and .env update instructions.

**Guide:**
- `docs/INFRA-SETUP.md` — Comprehensive step-by-step guide covering:
  - Provisioning Railway Postgres for the vault DB
  - Setting the INSERT-only role and creating the `deleted_records` table
  - Setting `VAULT_DATABASE_URL` env vars (local + Railway)
  - Generating the vault Prisma client
  - Running the vault permission test
  - Running role-separation SQL in Supabase SQL Editor
  - Updating `DATABASE_URL` to use `kanchuki_app` credentials
  - Applying migration 037 (guardrail triggers)
  - Verifying everything works

**Vault Prisma client generated:**
- ✅ `npx prisma generate --schema=prisma/vault-schema.prisma` → `packages/db/src/generated/vault/`

**.env.example updated:**
- Added `VAULT_DATABASE_URL` (F-016 vault DB)
- Added `DATABASE_URL_MIGRATOR` (F-017 migrator role, human-only)

### What's still needed (manual, user must execute):
1. **Provision Railway Postgres** for vault DB (Railway dashboard → New Project → PostgreSQL)
2. **Run `scripts/setup-vault-db.sql`** on that instance
3. **Set `VAULT_DATABASE_URL`** in env
4. **Run `scripts/setup-role-separation.sql`** in Supabase SQL Editor
5. **Update `DATABASE_URL`** to use `kanchuki_app` credentials
6. **Apply migration 037** (`prisma migrate deploy` using migrator credentials)

Follow `docs/INFRA-SETUP.md` for the exact step-by-step.

---

## 2026-07-26 — Admin Control Center Built (F-013 through F-017)

**Status changed from "docs only, not built yet" → ✅ Fully built.**

Full implementation of the admin permission/control system: plan-tier feature checkbox grid, retailer/customer activity tracking, account suspension, deletion vault, and database guardrails.

### F-013: Plan Feature Matrix
- `PlanFeature` table + `PlanFeatureKey` enum (14 features: BULK_ONBOARDING_IMPORT, CUSTOM_BACKGROUND_LIBRARY, SPIN_360, VIRTUAL_TRY_ON, WHATSAPP_BUSINESS_API, CHECKOUT_CART, DATA_EXPORT_CSV, CUSTOM_BRANDING, GHOST_MANNEQUIN_AI, RAZORPAY_ROUTE, API_ACCESS, PRIORITY_AI_QUEUE, MULTI_STORE)
- `packages/db/prisma/migrations/035_plan_feature_matrix/migration.sql`
- `apps/api/src/lib/features.ts` — `hasFeature()` (fails closed — opposite of `checkQuota`'s fail-open), `hasFeatureForPlan()`, `getEnabledFeatures()`, `setFeature()`
- `apps/api/src/plugins/error-handler.ts` — `featureUnavailable()` → HTTP 402
- `GET/PUT /admin/plan-features` in admin.ts (mirrors plan-limits pattern)
- Feature gates wired into: `products.ts` (SPIN_360, CUSTOM_BACKGROUND_LIBRARY), `checkout.ts` (CHECKOUT_CART), `retailers.ts` (WHATSAPP_BUSINESS_API), `collections.ts` (WHATSAPP_BUSINESS_API)
- `/admin/plan-features` checkbox grid UI page

### F-014: Activity Tracking
- `AuditLog.create()` calls added to product/customer/collection CRUD, settings changes, staff management in admin.ts
- `/admin/activity` platform-wide feed page
- `/admin/retailers/[id]/activity` per-retailer activity timeline page

### F-015: Account Suspension
- `Retailer.is_suspended/suspended_at/suspended_reason/suspended_by_id`, `Customer.is_blocked/blocked_at/blocked_reason` schema fields
- `packages/db/prisma/migrations/036_account_suspension/migration.sql`
- `POST /admin/retailers/:id/suspend`, `unsuspend`, `POST /admin/customers/:id/block`, `unblock` in admin.ts
- Suspension filter on admin retailers list endpoint
- Auth block: suspended retailers get "account suspended, contact support" at login (routes/auth.ts)
- Collection degradation: suspended retailer collection links show "temporarily unavailable" (not 404), products/categories/lead capture all gracefully degraded (routes/public.ts)
- Admin UI: suspended filter dropdown + visual badge on retailers list page, suspend/unsuspend UI with reason required on retailer detail page, block status badge + block/unblock with reason dialog on customers page

### F-016: Deletion Vault
- `packages/db/src/vault.ts` — `vaultDelete()` (fire-and-forget, never blocks primary op), `getVaultPrisma()` (read access for admin), graceful skip when VAULT_DATABASE_URL unset
- `packages/db/src/vault.test.ts` — conditional test suite: INSERT succeeds, UPDATE rejected, DELETE rejected (verifies INSERT-only constraint)
- `packages/db/prisma/vault-schema.prisma` + `vault-migrations/000_initial/migration.sql`
- `vaultDelete()` wired into: `retailers.ts`, `products.ts` (3 sites), `customers.ts`, `collections.ts`, `admin.ts` (2 sites)
- `GET /admin/deletion-vault` — paginated, filterable by source_table/source_id/retailer_id
- `/admin/database/deletion-vault` admin UI page with filter bar, expandable payload rows, load-more pagination

### F-017: Database Guardrails
- `packages/db/prisma/migrations/037_db_guardrails/migration.sql` — `prevent_hard_delete()` PL/pgSQL function, 8 `BEFORE DELETE OR TRUNCATE` triggers on products/customers/retailers/collections/staff/orders/order_items/product_variants. Bypass via `SET app.allow_hard_delete = 'true'`
- `scripts/check-delete-guard.sh` — CI grep guard: (1) raw `.delete()` on 7 business models outside allowlist, (2) empty-where `deleteMany()` danger detection, (3) destructive SQL outside migrations
- `.github/workflows/ci.yml` — added `bash scripts/check-delete-guard.sh` step
- `docs/SECURITY.md` §19 — updated to [x] Phase D checklist + §19.6 build table. Role-creation SQL in §19.1
- `apps/api/src/jobs/purge-soft-deleted.ts` — daily cron (1:30 AM UTC), batch-purges soft-deleted records >30 days old, uses `SET app.allow_hard_delete = 'true'` to bypass triggers, cursor-based batching (100/batch), FK-safe order (children before parents), writes audit log
- `apps/api/src/jobs/index.ts` — PURGE_SOFT_DELETED queue, worker (concurrency 1), daily schedule
- `packages/shared/src/constants/index.ts` — PURGE_SOFT_DELETED queue name constant
- `docs/DATABASE.md` — new "DB Guardrails" section documenting all 4 layers

### Files changed (total: 31 files, ~2,285 insertions, ~39 deletions)

**New files (14):**
- `apps/api/src/jobs/purge-soft-deleted.ts`
- `apps/api/src/lib/features.ts`
- `apps/web/src/app/admin/activity/page.tsx`
- `apps/web/src/app/admin/database/deletion-vault/page.tsx`
- `apps/web/src/app/admin/plan-features/page.tsx`
- `apps/web/src/app/admin/retailers/[id]/activity/page.tsx`
- `packages/db/prisma/migrations/035_plan_feature_matrix/migration.sql`
- `packages/db/prisma/migrations/036_account_suspension/migration.sql`
- `packages/db/prisma/migrations/037_db_guardrails/migration.sql`
- `packages/db/prisma/vault-migrations/000_initial/migration.sql`
- `packages/db/prisma/vault-schema.prisma`
- `packages/db/src/vault.test.ts`
- `packages/db/src/vault.ts`
- `scripts/check-delete-guard.sh`

**Modified files (17):**
- `.github/workflows/ci.yml` — added guard check step
- `CLAUDE.md` — replaced "Planned" section with comprehensive "Built" summary
- `apps/api/src/jobs/index.ts` — PURGE_SOFT_DELETED queue + worker + schedule
- `apps/api/src/plugins/error-handler.ts` — featureUnavailable() helper
- `apps/api/src/routes/admin.ts` — plan-features, suspension, block, vault, audit log, deletion-vault endpoints
- `apps/api/src/routes/auth.ts` — suspended retailer login block
- `apps/api/src/routes/billing.ts` — audit log wiring
- `apps/api/src/routes/catalog-import.ts` — audit log wiring
- `apps/api/src/routes/checkout.ts` — CHECKOUT_CART feature gates
- `apps/api/src/routes/collections.ts` — WHATSAPP_BUSINESS_API feature gate, vaultDelete wiring
- `apps/api/src/routes/customers.ts` — vaultDelete wiring
- `apps/api/src/routes/products.ts` — SPIN_360 + CUSTOM_BACKGROUND_LIBRARY feature gates, vaultDelete wiring
- `apps/api/src/routes/public.ts` — collection degradation for suspended retailers
- `apps/api/src/routes/retailers.ts` — WHATSAPP_BUSINESS_API feature gates, vaultDelete wiring
- `apps/api/src/routes/staff.ts` — audit log wiring
- `apps/web/src/app/admin/components/Sidebar.tsx` — added nav links
- `apps/web/src/app/admin/customers/page.tsx` — block UI
- `apps/web/src/app/admin/retailers/[id]/page.tsx` — suspend/unsuspend UI
- `apps/web/src/app/admin/retailers/page.tsx` — suspension filter
- `docs/DATABASE.md` — DB guardrails section
- `docs/PLAN.md` — Month S4 checklist
- `docs/PRO-REQUIREMENTS.md` — §12 requirements
- `docs/PROGRESS.md` — this entry
- `docs/SECURITY.md` — §19 guardrail design, §19.6 build table
- `packages/db/package.json` — postinstall fix
- `packages/db/prisma/schema.prisma` — PlanFeature, suspension fields
- `packages/db/src/index.ts` — vault exports
- `packages/shared/src/constants/index.ts` — PURGE_SOFT_DELETED queue name

---

## 2026-08-01 — Launch Readiness Audit + 12-Retailer Pilot Prep (in progress)

Full doc audit + code reality-check → `docs/LAUNCH-READINESS-AUDIT.md` (new file, single source of truth for launch status, supersedes stale status lines elsewhere). User's near-term goal: one controlled pilot with 12 retailers, no server/port/AI-tagging breakage. SEO + admin-content-CMS + app-store prep deliberately deferred until after pilot (§9b of the audit doc — irrelevant to a 12-retailer internal test).

**Doc-vs-doc contradictions found and resolved** (see audit §0): Deletion Vault/replica/guardrail "Executed" claims in `PLAN.md`/`26-night-report.md` vs still-open in `omp-review.md` — omp-review is correct, replica/vault-URL/role-separation still open. F-006B offline PWA — built (an early `omp-review.md` pass calling it "not built" was superseded same-doc). GST invoice numbering — fixed, `Math.random()` flag was stale.

**Corrected 2 findings from my own earlier audit pass** after checking live evidence instead of trusting docs: rate limiter is already Redis-backed (`apps/api/src/index.ts` — `redis: getRedis()`), SECURITY.md's in-memory claim was stale. `packages/db/src/vault.test.ts` DOES skip cleanly in CI (verified via `gh run view` — "2 skipped" every recent run), the env-var-set-but-unreachable concern doesn't manifest.

**New bug found + fixed:** `COOKIE_SECRET` had no production guard — `apps/api/src/index.ts` fell back to a `Date.now()`-based signing key when unset, silently invalidating every admin CSRF cookie/session on each restart. Now throws at startup in production if unset. **Typechecked clean, not yet committed to git.**

**Secrets generated this session** (handed to user in chat only, never written to any file — do not search memory/docs for these, they don't exist there): `COOKIE_SECRET`, `TEAM_JWT_SECRET`, `REVALIDATION_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. User still needs to: paste these into Railway; run `npx tsx scripts/generate-admin-hash.ts '<password>' --totp` themselves for `ADMIN_PASSWORD_HASH`+`ADMIN_TOTP_SECRET`; switch `DATABASE_URL` to the `kanchuki_app` role (SQL in `SECURITY.md` §19.1, staging-test first); set an explicit `PORT` var on the web Railway service (prevents a repeat of the 2026-08-01 502 incident documented in `DEPLOY.md`); confirm migration `034_product_sizes` applied live; confirm 2+ AI providers active in Admin → AI Providers before the pilot.

**Not started yet, explicitly deferred (not forgotten):** SEO (sitemap.ts/robots.ts/metadata/JSON-LD — all missing), admin-managed marketing content page (no CMS exists, 31 admin pages are all ops/retailer/billing, none edit marketing copy), mobile app-store submission prep (Apple needs an OTP-login reviewer bypass, not built), full k6/Artillery load test (skipped intentionally for a 12-retailer scale, `SCALING.md` recommends one before wider launch).

**Next session should start here:** confirm with user whether the P0 Railway/Supabase dashboard steps above got done, then either help debug the pilot or move to §8/§9 (SEO + admin content + app-store) once the pilot's stable.

### Typecheck status
| Package | Errors |
|---------|--------|
| `@kanchuki/api` | 0 ✅ |
| `@kanchuki/web` | 0 ✅ |
| `@kanchuki/db` | 0 ✅ |
| `@kanchuki/shared` | 0 ✅ |

### CI guard check — PASSED ✅

### Infrastructure completed this session (2026-07-26)
**Deletion Vault (F-016) — ✅ COMPLETED:**
- Used existing Railway Postgres-PYkI instance (`sakura.proxy.rlwy.net:23505`)
- Vault DB already had `deleted_records` table in sync with vault schema ✅
- Created `vault_app` INSERT-only role (no SELECT/UPDATE/DELETE) ✅
- Set `VAULT_DATABASE_URL` in Railway env vars (`supportive-love` service) ✅
- Vault Prisma client generated (`packages/db/src/generated/vault/`) ✅
- Vault permission test passes: INSERT succeeds, UPDATE/DELETE rejected ✅
- Fixed `vault.test.ts`: `$4::jsonb` cast for JSONB column + 15s timeouts

**Postgres role separation (F-017) — ✅ COMPLETED:**
- Created `kanchuki_app` role on Supabase: SELECT/INSERT/UPDATE only, no DELETE/TRUNCATE ✅
- Created `kanchuki_migrator` role: full DDL, inherits from kanchuki_app, human-only ✅
- Updated `DATABASE_URL` in Railway to use `kanchuki_app` (pooler, port 6543) ✅
- Updated `scripts/setup-role-separation.sql` with corrected PostgreSQL grant syntax
- Fixed: removed invalid `DROP, ALTER, CREATE` from table-level REVOKE

**Still missing (tool limitations):**
- Migration 037 guardrail triggers not applied — Supabase PgBouncer rejects direct connections. Run manually via Supabase SQL Editor (copy from `packages/db/prisma/migrations/037_db_guardrails/migration.sql`)
- Local `.env` files still use superuser credentials — update manually to `kanchuki_app`

**Other pending items (pre-existing):**
- Phase 1+: Fashion DNA, Remote VTO, Auto-Personalized Collections
- Onboarding tutorial improvements (10-retailer pilot feedback)
- F-006 wishlist bug (bare product IDs in localStorage)

## 2026-07-27 — Phase 0.5 Completed: Staff Mode + Docs Sync

**Phase 0.5 is now fully code-complete.**

### What was previously built (but not documented correctly)
- SupportTicket routing logic — fully built in `team.ts` (territory hierarchy traversal, visit-required → nearest agent, backend-manageable → CITY-level pool, least-loaded scheduling, batch `/tickets/route-all`)
- Manager rollup reporting dashboard — fully built at `/admin/reports` (Agent Performance, Coverage Gaps, Activation Funnel tabs, +3 backend endpoints)

### What was built this session
- **Staff mode in Expo retailer app** — field staff can log in via phone OTP, get redirected to `/staff` dashboard showing name/role/territory, retailer stats, territory-scoped retailer list, quick retailer onboard form, and support ticket summary. Built files:
  - `apps/mobile/src/lib/team-api.ts` — Team API module with `getMe()`, `getRetailers()`, `onboardRetailer()`, `getTickets()`
  - `apps/mobile/app/staff/_layout.tsx` — Stack navigator for staff screens
  - `apps/mobile/app/staff/index.tsx` — Staff dashboard with stats, retailer list, ticket summary
  - `apps/mobile/app/staff/retailer-onboard.tsx` — Quick field onboarding form
  - `apps/mobile/app/auth/otp.tsx` — Updated redirect to `/staff` for staff users
  - `apps/mobile/app/_layout.tsx` — Auth redirect checks `staff_role` for staff routing

### Docs updated
- **CLAUDE.md** — Added comprehensive Phase 0.5 section
- **PLAN.md** — Full rewrite of Month S1-S3 checkboxes, Phase 0.5 staff mode marked [x]
- **PROGRESS.md** — This entry. All "Still pending" references for Phase 0.5 removed

## 2026-07-27 — OMP Review Follow-up: Security Fixes + Offline-First (F-006B / F-mobile-offline)

Ran the full OMP AI review (`docs/omp-review.md`), verified each finding against actual code (several were stale — already fixed or based on wrong assumptions), fixed what was safely fixable without touching env vars/secrets/prod migrations, then built out the offline-first plan in review §15.

### Security/code fixes (no env/secret/migration changes — those are blocked by the Operational Control Policy, listed as still-open in `docs/omp-review.md` §13)
- **S-008**: `ENCRYPTION_MASTER_KEY` now derived via `scryptSync` instead of raw SHA-256 (`packages/db/src/secrets.ts`)
- Startup validation added for `ENCRYPTION_MASTER_KEY` — fails fast at boot instead of 500ing mid-request (`apps/api/src/index.ts`)
- **B-014**: local secret-commit guard — `scripts/check-secrets-guard.sh` + `.githooks/pre-commit` (opt-in via `git config core.hooksPath .githooks`)
- **S-006**: `/v1/admin/login` now signs a short-lived (12h) session JWT instead of returning the permanent `ADMIN_API_KEY` in the response body
- **B-013**: admin SQL query history now durable — reads from the existing `AuditLog` endpoint instead of `sessionStorage`

### Offline-first build (review §15, both surfaces)
**Web (Next.js PWA):**
- `apps/web/src/app/sw.ts` — Serwist runtime caching: R2 product images (CacheFirst, 7-day/200-entry expiry), `/api/c/*` collection API (StaleWhileRevalidate), `/c/*` collection pages (NetworkFirst, 3s timeout)
- `apps/web/public/manifest.json` + `apps/web/public/icons/` — PWA icons generated via `sharp` (already a dependency), fixes Android "Add to Home Screen"
- `apps/web/src/app/offline/page.tsx` — branded offline fallback, precached at SW install

**Mobile (Expo retailer app):**
- `apps/mobile/app/_layout.tsx` — React Query `networkMode: 'offlineFirst'`
- `apps/mobile/app/(tabs)/catalog.tsx` — catalog `staleTime` 10min / `gcTime` 24h, wired existing (unused) `prefetchProductImages()` in
- `apps/mobile/src/hooks/useNetworkStatus.ts` — proactive online/offline hook
- `apps/mobile/src/lib/mutation-queue.ts` + `apps/mobile/src/hooks/useSyncQueue.ts` — offline "Mark Sold" queue with reconnect replay

**Corrected one review finding instead of building it as specified:** the review's B-4 (offline enquiry queue) assumed enquiry submission is a `fetch()` POST. It isn't — it's a `wa.me` WhatsApp deep link with no Kanchuki backend call, so there's nothing to queue. No file added for it.

**Verified:** `pnpm --filter @kanchuki/web typecheck`, `pnpm --filter @kanchuki/web build` (SW bundled clean), `pnpm --filter @kanchuki/mobile typecheck`, mobile catalog test suite — all pass.

### Docs updated
- **CLAUDE.md** — Offline catalog browsing line updated from "researched, not built" to built, with summary
- **docs/PRO-REQUIREMENTS.md** — F-006B updated to reflect actual runtime-caching implementation (was documented as done but only had Serwist defaults); new F-mobile-offline section added
- **docs/omp-review.md** — Action-list checkboxes updated, §15 items marked built with implementation notes and the B-4 correction
- **docs/PROGRESS.md** — This entry

### Still open (unchanged from review, needs a human)
- Credential rotation (Anthropic/OpenAI/Supabase/R2/Redis keys — all exposed in local `.env`)
- ADMIN_TOTP_SECRET, VAULT_DATABASE_URL, TEAM_JWT_SECRET, REVALIDATION_SECRET — all missing env vars
- admin.ts (2,545 lines) / checkout.ts (1,087 lines) — large mechanical refactor, not started

## 2026-07-28 — Pre-pilot bug audit + migrations 037/038 applied

Full cross-check ahead of the 10-retailer mobile pilot: login flows, URLs, DB, API, servers, frontend, admin backend. Full monorepo typecheck (6/6 packages) and test suite (173 API + 34 web tests) verified clean via `turbo typecheck`/`turbo test`.

**Applied live (Supabase SQL Editor):**
- **Migration 037** (`db_guardrails`) — hard-delete guardrail triggers, previously undeployed. Some triggers had partially landed from an earlier attempt, so applied via an idempotent `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` variant. Verified: all 8 `guard_*` triggers present.
- **Migration 038** (`order_items_rls`, new) — fixes an RLS gap found during the audit: `order_items` (added in `031_l2_ecommerce_checkout`) never got Row Level Security, unlike every sibling table. Policy scopes via `order_id → orders.retailer_id → auth.uid()`. Verified: `rowsecurity = true`, policy `retailer_own_order_items` present.

**Found, not yet fixed (needs a human/deploy decision):**
- Mobile (`apps/mobile/.env.local`) and web (`apps/web/.env.local`) API URLs point at an ephemeral VS Code devtunnel — will break mid-pilot if the tunnel closes. `apps/mobile/.env` fallback is `localhost`, dead on a retailer's own phone. **Needs a real deploy or a pilot-duration tunnel before handing out the app.**
- Migration `034_product_sizes` apply-status to the live DB unverified (couldn't check without a live query, blocked by operational policy).
- `packages/db/dist` can go stale relative to source changes if `apps/api` tests are run via bare `npx vitest` instead of `pnpm test`/`turbo test` (which correctly rebuilds deps first). Caused two false test failures this session (`ReferenceError: exports is not defined`), fixed by rebuilding — no source change needed.
- `@fastify/cookie` secret (`apps/api/src/index.ts`) registered but unused — admin CSRF check reads the raw unsigned cookie, not a signed one. Dead config, not a live vuln.
- Env gaps and credential rotation from the 2026-07-27 review remain open (see above) — TEAM_JWT_SECRET, REVALIDATION_SECRET, ADMIN_TOTP_SECRET still missing locally.

---

## 2026-08-02 — Production DB Outage Root-Caused (Pooler Suffix) + Purge-Cron Scoped Role + Admin/Web Hardening

**Incident:** production API 500'd on every DB-backed endpoint (`/v1/public/stats`, enquiries, favorites) while `/health` stayed 200. Root cause confirmed live via a `pg` probe: Supabase's pooler rejects bare `kanchuki_app` usernames — it requires `<role>.<project_ref>`. The `postgres` superuser (with ref suffix) authenticates from this machine; `kanchuki_app.thpqcylmcxokajxoerjx` still auth-fails until the role is created/its password aligned in the Supabase SQL Editor (run `scripts/setup-role-separation.sql`). Railway `DATABASE_URL` updated with the suffixed username; smoke test is 8/11 green with the 3 DB-backed checks pending that SQL run.

**Pooler suffix fix (docs + SQL):**
- All pooler URLs in `docs/INFRA-SETUP.md`, `docs/26-night-report.md`, `scripts/setup-role-separation.sql` now use `kanchuki_app.thpqcylmcxokajxoerjx` / `kanchuki_migrator.thpqcylmcxokajxoerjx` (verified 0 unsuffixed remain, 0 stale `wqcbvmmqzoxapmxbjzhm` refs)
- `setup-role-separation.sql` made idempotent (safe re-run over the 2026-07-26 roles); added the missing sequence grants (`GRANT USAGE, SELECT ON ALL SEQUENCES` + `ALTER DEFAULT PRIVILEGES` for sequences) — without these, serial inserts fail once the app role goes live

**Purge-cron scoped role (F-017 hardening):**
- New `kanchuki_purge` role: inherits `kanchuki_app` (SELECT/INSERT/UPDATE) + DELETE on exactly the 18 purge tables, no TRUNCATE/DROP/DDL — the "scoped role" SECURITY §19.2 sanctions (the cron can't use `kanchuki_app` — DELETE revoked — or `kanchuki_migrator` — human-only)
- `packages/db/src/client.ts` → `getPurgePrisma()` (reads `PURGE_DATABASE_URL`, warns + falls back to the shared client when unset)
- `apps/api/src/jobs/purge-soft-deleted.ts` runs all purge SQL + the audit-log write through the purge client (no `prisma.` references remain)
- `.env.example` + `INFRA-SETUP.md` / `SECURITY.md` §19.1 / `DATABASE.md` Layer 1 updated

**Admin DB-down resilience (web):**
- Dashboard, retailers list, platform activity feed, and per-retailer activity page guard `!res.ok` / `Array.isArray(json?.data)` on 500 `{error}` bodies — kills the `Cannot read properties of undefined (reading 'length')` crash family that was taking down the production admin panel during the outage
- Error boundaries added (`apps/web/src/app/error.tsx`, `global-error.tsx`, `admin/error.tsx`)

**Brand assets (web):**
- Loom-brand favicon (`src/app/icon.svg`, PNG-in-ICO `public/favicon.ico`), `apple-icon.png`, PWA icons regenerated brand-correct (the old ones were stale pre-Loom cyan), `robots.ts` (`Disallow: /admin /api/ /offline`), OG/Twitter meta + 1200×630 `og-image.png` — all generated by `scripts/generate-brand-assets.mjs` (re-runnable)

**Ops:**
- `apps/mobile/eas.json` API URL → `https://api.kanchuki.app` (preview + production builds)
- `scripts/smoke-test-live.ts` — automated live smoke test (11 checks; 8 pass with the DB down, the 3 DB-backed checks flip green once the role authenticates)

**Validation:** api + db `tsc --noEmit` 0 errors, db vitest 10/10, delete-guard + secrets-guard pass. Committed to `fix/web-dockerfile-build-args` 2026-08-02.

---

## 2026-08-04 — SecureStore crash fix + open bug: AI-tagged fields still blank on device

**Fixed:** `Uncaught Error: Invalid key provided to SecureStore` — `apps/mobile/src/lib/theme.tsx` built its per-user cache key as `` `theme_palette:${retailerId}` ``. SecureStore keys only allow `[A-Za-z0-9._-]`; the colon crashed every write. Changed separator to `.` (`theme_palette.${retailerId}`). Not yet committed.

**Reported by user, not yet root-caused (needs live device test):** after photo upload + AI tagging, the Product Info card (name/subtype/SKU/description) on `product/[id].tsx` still shows blank. Code path traced end-to-end and looks correct — `packages/ai/src/tagger.ts` returns `product_name`/`short_description`/`subtype`, `apps/api/src/jobs/tag-product.ts` writes them when null, `GET /products/:id` returns the full Prisma row (no field whitelist), mobile hydrates from `product.name/sku/subtype/description` on fetch (`app/product/[id].tsx:451-454`). No code bug found. Prime suspect: the `EXPO_PUBLIC_API_URL` in `.env.local` points at prod (`https://api.kanchuki.app`) — if the prod `AI_TAGGING` BullMQ worker isn't consuming (e.g. post-2026-08-02 worker-consolidation regression, or Redis/queue misconfig), tagging jobs never complete and `ai_tagged` stays false forever, so the fields never populate. Next step: check that specific product's `ai_tag_error` field (admin or DB) after a live upload, or check Railway worker logs for the `AI_TAGGING` queue.

**Also requested, not yet built:** on `apps/mobile/app/product/add.tsx` (the *create* flow), show a detected-color circle right after photo capture — the existing tap-to-detect-color pattern (`productApi.detectColor()`) is already built on the *edit* screen (`product/[id].tsx`, "Built 2026-08-03" entry above) but `add.tsx` never calls it; it defers all tagging to the post-save background job and shows no color at all until the retailer reopens the product.

**R2 storage cleanup on product delete — ✅ FIXED.** User asked: does deleting a product remove it from Cloudflare R2 too? Answer was no — soft-delete/hard-delete/30-day purge cron all touched Postgres only, photo/spin-frame/variant bytes stayed in R2 forever. Fixed in `apps/api/src/jobs/purge-soft-deleted.ts`: before purging `product_photos`/`product_spin_frames`/`product_variants` rows, their `r2_key`s are fetched (`fetchR2Keys()`), then deleted from R2 via `deleteObject()` (`@kanchuki/ai`, already existed, just unused for this) after the DB purge succeeds (`purgeR2Objects()`, best-effort — `Promise.allSettled`, logs failures, never blocks the DB purge). Also fixed a second gap found in the same pass: `product_spin_frames` wasn't in the explicit children-purge list at all (relied on implicit FK cascade, so its `r2_key` was never captured before the row vanished). **Retention window changed 30 → 15 days** (`PURGE_AFTER_DAYS`) per user request — applies to the whole cron (products/collections/customers/retailers), not a product-only knob. `apps/api` `tsc --noEmit` clean. Not yet committed.

---

## 2026-08-04 — Customer Web PWA: catalog nav bug + bottom bar + cart + product detail redesign + back-button fix

Source: user's 7-item list for the customer-facing web PWA (`apps/web/src/app/c/[slug]`, `/store/[slug]/categories/...`). Each item deep-reviewed against the live code (Explore-agent pass + manual read of `CollectionView.tsx`, `ProductDetailSheet.tsx`, `sw.ts`, `cart.ts`, `public.ts`) before any edit, per user's request to review-then-implement.

### #1 — Category page needs hard refresh to load ✅ FIXED
**Review:** Two separate category mechanisms exist. In-page category chips (`FilterBar.tsx`'s `CategoryChips`, used on `/c/[slug]`) are plain React state, not the bug. The full-page category browse (`/store/[slug]/categories/[categoryId]/page.tsx`, reached from the category grid at `/store/[slug]/categories`) is the actual bug: `apps/web/src/app/sw.ts` has explicit service-worker cache overrides for `/api/c/` (StaleWhileRevalidate), `/c/` (NetworkFirst), and `/admin` (NetworkOnly — added earlier specifically because "a cached response from one nav method leaked into the other and admin pages rendered blank until a hard refresh," per the comment at `sw.ts:48-51`). `/store/` matches none of these overrides and falls through to Serwist's `defaultCache`, which caches Next.js RSC prefetch/navigation payloads keyed by URL only (ignoring the `RSC`/`Next-Router-Prefetch` headers that distinguish a prefetch response from a real one) — the exact same bug class already fixed for `/admin`, left unfixed here.
**Fix:** add a `/store/` matcher to `sw.ts` (NetworkFirst, same as `/c/`) before `defaultCache`.

### #2 — Catalog bottom bar: 3 buttons (Buy Now / Selected N / Enquire N) in one row with icons ✅ BUILT
**Review:** `CollectionView.tsx:393-416` already has a sticky bottom bar, but only 2 elements: "Selected (N)" (wishlist link) and "Enquire on WhatsApp" — no Buy Now/cart entry point exists anywhere on the catalog page today (cart is only reachable from inside a product's detail sheet, and only when the retailer has Razorpay checkout enabled). This is very likely *why* item #3 below reads as "not working" to the user — cart exists but nothing on the main browsing screen links to it.
**Build:** redesign to 3 buttons in one row — Buy Now (adds nothing itself, links to `/c/[slug]/cart`), Selected (N) (existing wishlist), Enquire (N) (existing WhatsApp). Buy Now stays visible but disabled (with a tooltip) when the retailer hasn't connected checkout — kept in the row instead of hidden, so the 3-button layout is consistent across every retailer instead of reflowing to 2.

### #3 — Is the shopping cart fully functional? 🔎 REVIEWED — already built, just unreachable
**Review:** Not a stub. Fully wired end-to-end and already shipped as F-302 Stage A (direct-to-retailer Razorpay): client cart (`apps/web/src/app/c/[slug]/lib/cart.ts`, localStorage, same pattern as the wishlist), cart page (`cart/CartPage.tsx`), checkout form + Razorpay Checkout.js (`checkout/CheckoutForm.tsx`), order confirmation with status polling (`order/[orderId]/OrderView.tsx`), API routes (`apps/api/src/routes/checkout.ts`: create-order, verify-payment, webhook), DB models (`RetailerPaymentAccount`, `Order`, `OrderItem`). Gated behind `checkoutEnabled`, which is `false` until a retailer connects their own Razorpay account (by design — Kanchuki never custodies retailer sale money in Stage A). The actual gap is reachability, not function: fixed by #2's Buy Now button + confirmed no code bugs in the checkout flow itself while reading it end to end.
**Action:** no cart/checkout code changes beyond the #2 entry point. If a pilot retailer sees "cart not working," check first whether their `RetailerPaymentAccount` is connected (Settings → Payments) — an unconnected retailer will correctly never see a working Buy Now.

### #4/#5/#6 — Product detail: AI Summary + "Product Info" (replaces tags) + color circles + 3 buttons; keep price/category/share/like; rename related section ✅ BUILT
**Review:** `ProductDetailSheet.tsx` top-to-bottom today: photo carousel → status/location → price + category/occasion + share/favorite buttons → attribute chips (color/fabric/occasion) → sizes → **color-variant swatch circles (already built, `:613-654`, reuses `resolveFashionColor`/`swatchColor` — this already matches the "color circle options" ask)** → raw search-tag chip cloud (`:656-668`) → Add-to-Cart (full width) → related products ("More {category}", tapping a related card currently just closes the sheet instead of opening it — a separate small bug, not in scope for this list) → Enquire (full width). AI-tagged `description` is not in `PublicProductDetail` at all (customer API type omits it); `sku` likewise omitted (was deliberately kept internal-only when the AI-tagging fields shipped 2026-08-03).
**Build:** keep price/category/share/favorite exactly where they are (per explicit ask). Directly underneath: new "AI Summary" block rendering `detail.description` (added to `PublicProductDetail` + `GET /public/products/:productId`, `apps/api/src/routes/public.ts` — SKU stays internal-only, not customer-facing, flagging this as a deliberate scope call rather than silently dropping it). New "Product Info" block (name/subtype/fabric/occasion as labeled rows) **replaces** the raw tag-chip cloud — tags removed per explicit ask. Existing sizes + color-circle sections untouched. Add-to-Cart + Enquire full-width buttons replaced by the same 3-button row as #2 (Buy Now / Select [=favorite toggle] / Enquire). "More {category}" heading text changed to the static "Related suits" per explicit ask (section itself kept).

### #7 — Mobile back button skips past the product catalog, lands on the category screen ✅ FIXED
**Review:** Opening a product (`ProductDetailSheet`) is pure React state (`setSelectedProduct`, in `CollectionView.tsx`) — no route push, no browser history entry. So a hardware/browser Back press while the sheet is open doesn't close the sheet first; it does a full page-level back navigation, past the category product listing straight to whatever page preceded it (the category grid). This is a standard PWA modal-history bug: any overlay opened via component state instead of a route/history entry gets skipped by Back.
**Fix:** `ProductDetailSheet.tsx` pushes a history entry on mount and listens for `popstate` to close the sheet; the sheet's own close controls (X, back-arrow) trigger a browser `history.back()` instead of calling `onClose` directly, so Back always closes the sheet as its own step before it can navigate the underlying page away.

---

## 2026-08-04 — Staff catalog-upload research: mobile auth gap found + 500-item free offer (TODAY'S TASK LIST — nothing coded yet)

User asked how a staff member visits a retailer's store and uploads their catalog from their own phone. Answer traced against the real F-019 (paid on-site catalog upload)/F-020 (delegated on-site access) code rather than the CLAUDE.md summary of it, since this project has a known doc-staleness pattern. Full writeup: `docs/staff-retailer.md`. Nothing below is committed — this is the open punch list for today.

**Confirmed working (no action needed):** ticket lifecycle (`retailers.ts` `/me/catalog-upload-request*`), admin quoting (`PATCH /team/tickets/:id`), Razorpay payment + slot confirm, `routeTicket()` auto-assignment, the delegated 8h JWT (`signCatalogUploadToken`/`verifyCatalogUploadToken`, `apps/api/src/plugins/team-auth.ts`), the mobile session-swap (`apps/mobile/src/lib/catalog-delegate.ts`), the route allowlist + per-request revocation check (`CATALOG_DELEGATE_ALLOWED_ROUTES`, `apps/api/src/plugins/auth.ts`), the audit-log hook, the `CatalogDelegateBanner`. All read end-to-end, all correct.

### Task 1 (blocking) — `TeamMember` field agents have no mobile login path
**Root cause, verified by reading the auth chain, not assumed:** `apps/mobile/app/staff/*` screens call `teamApi` → `/team/*` routes → require a JWT from `POST /team/login` (email+password, `TeamMember` = Kanchuki's own field/sales/support agents). The mobile app's only sign-in screen (`app/auth/otp.tsx`, phone OTP) only checks the **`Staff`** model (F-009, a retailer's *own shop employee* — different model, different actor) and returns a Supabase token, which `verifyTeamToken()` rejects. Net effect: a real Kanchuki agent cannot log into the app and reach `catalog-tickets.tsx` today, despite that screen being fully built and correct.

**Two fix options, need a decision before any code:**
- **Option A** — add phone+OTP to `TeamMember` (extend `auth.ts` to also check `TeamMember`, migration for `TeamMember.phone`). Touches: Database, Backend/API, Security (merging two auth systems onto one endpoint — mandatory review, must guarantee `Staff` and `TeamMember` tokens can never cross-authorize each other's routes).
- **Option B (ponytail pick — smaller, safer)** — add one email+password mobile screen hitting the *already-working* `/team/login`. Zero backend/schema change. Touches: Mobile/Frontend (one screen, reuse `auth/phone.tsx` layout), light Security pass on token storage only.
- Skills/agents for whichever gets approved: `ecc:database-reviewer` (only if A), `ecc:typescript-reviewer`/`ecc:api-design` (only if A), `ecc:react-reviewer` (B, or A's redirect-logic change), `ecc:security-reviewer`/`security-review` (mandatory either way — this is an auth-boundary change).

### Task 2 — 500 free catalog items per retailer, limited time (decision made, not enforced)
**Two gaps found, not assumed:**
- `CatalogUploadPriceTier` grid (Admin UI) is reference-only — `PATCH /team/tickets/:id` never reads it. Editing the tier grid to `₹0` for 0–500 items does **not** auto-quote anything.
- No expiry field exists anywhere for a promo window — "limited time" has zero system representation today.

**Today, zero-code path:** whoever quotes a `CATALOG_UPLOAD` ticket manually sets `quoted_price_inr: 0` when `item_count_requested <= 500`, and manually reverts after the (manually tracked) promo end date.

**If it should become system-enforced** (not requested yet, noted as an option): add `promo_free_item_limit`/`promo_expires_at` via the existing admin-settings key-value pattern (same shape as the theme config), have the quoting route compute the ₹0 default itself. Skills if built: `ecc:database-reviewer` (2 nullable fields), `ecc:api-design`/`ecc:typescript-reviewer` (one conditional in quoting), `ecc:frontend-patterns`/`impeccable` (only if the tier-grid page needs a visible expiry/countdown UI), `security-review` (low risk, but it's a payment-quoting path — never skip per this repo's own money-path policy).

**Verified after build:** `apps/web` `tsc --noEmit`, manual code read of the new bottom-bar/detail-sheet render paths (no live browser in this environment — Playwright MCP available but not run this pass; visually confirm on a phone before calling this fully done).

---

## 2026-08-04 — F-026 BUG fixed + committed (docs sync)

**F-026: mobile Settings → Recently Deleted → permanent delete threw `APIError` — ✅ FIXED (commit `ac50fe8`).** The purge route in `apps/api/src/routes/products.ts` called `prisma.product.delete()` directly; F-017's guardrail trigger blocked it (no `SET app.allow_hard_delete`), and the raised exception isn't a `P2003` so the route's catch didn't handle it → unhandled 500 → generic `APIError` on device. Fixed by porting the purge-cron pattern into the route: `getPurgePrisma()` (the `kanchuki_purge` scoped role, resolving the role-separation grant question at the same time) + `$transaction` with `SET app.allow_hard_delete = 'true'` before the `.delete()`. Existing `P2003` catch kept — a product in a past order/collection still correctly can't hard-delete.

**Docs updated this session (status was stale — fix shipped without doc updates):** PLAN.md, PRO-REQUIREMENTS.md §16, CLAUDE.md all moved F-026 from 🔴 NOT FIXED → ✅ FIXED with the commit reference. PROGRESS.md entry added.

**Also shipped this session (commit `d8042f6`):** detected-color circle on the product *create* flow — `apps/mobile/app/product/add.tsx` now runs `productApi.detectColor()` on the just-uploaded photo and shows a `resolveFashionColor` swatch chip overlaid on the edit-form photo preview (pre-fills `primary_color` on save), instead of showing no color until the retailer reopens the product after background AI tagging. Detection is fire-and-forget — a miss just means the background job fills it later.

---

## 2026-08-04 — Today's task list: all 6 items shipped, each committed

Per user instruction ("review deeply → ask questions → develop one by one, commit each task"), every OPEN item dated 2026-08-04 was reviewed against the real code, approved by the user, and shipped:

1. **Color-detect circle on `product/add.tsx`** (commit `d8042f6`) — the create flow now runs `productApi.detectColor()` on the just-uploaded photo and shows a `resolveFashionColor` swatch chip on the edit-form photo preview (pre-fills `primary_color` on save), matching the edit screen's tap-to-detect pattern.
2. **F-026 docs sync** (commit `74b5c67`) — the fix had shipped (`ac50fe8`) without doc updates; PLAN.md/PRO-REQUIREMENTS.md/CLAUDE.md moved to ✅ FIXED with the commit reference.
3. **TeamMember phone-OTP mobile login (Option A)** (commit `c99a6c6`) — migration `044` adds `TeamMember.phone @unique`; `auth.ts /otp/verify` checks TeamMember after Staff and before the retailer upsert, minting a team JWT. The critical guard (tested): an agent's phone never creates a Retailer row; Staff vs TeamMember tokens stay cryptographically separate. Mobile `otp.tsx` routes team_member logins to `/staff`; `/team/members` CRUD + admin Team Members UI gain the phone field. New `auth-team.test.ts` (4 tests).
4. **500-item free catalog upload — system-enforced** (commit `f0ab109`) — `promo_free_item_limit` + `promo_expires_at` in the admin-settings key-value store (`GET/PUT /admin/settings/catalog-upload-promo`); the quoting route forces `quoted_price_inr: 0` when the promo is live and within limit (`promo_applied` in the response); Admin → Catalog Upload Tiers gains a promo card; retailer request response includes the promo. New `catalog-upload-promo.test.ts` (4 tests).
5. **F-024 DB-backed default categories + AI auto-assignment** (commit `be02012`) — `DefaultProductCategory` template (migration `045`, 13 garment-type seeds) seeded into every new retailer at signup + backfilled for existing zero-category retailers; `tag-product.ts` auto-assigns `category_id` by matching the AI category against the retailer's own list (never clobbers a manual pick); admin CRUD + Admin → Default Categories grid. New Arrivals/Sale computed at query time (Option A) — shared `lib/product-flags.ts` (`isNewArrival`/`isOnSale`, rule-of-three extraction) exposed as `is_new_arrival`/`on_sale` on `PublicProduct`.
6. **F-025 scan-to-sell** (commit `53f627c`) — `GET /products?sku=` exact-match lookup (no owner-only gate, staff-usable); new `product/scan.tsx` barcode/QR screen (catalog-tab scan icon) resolving SKU → existing `product/[id].tsx`; "Print Tag" SKU+QR rack-tag modal on product detail. GST-invoice-on-offline-sale stays a documented future hook. 3 new tests in `products.test.ts`.

**Verified end of session:** api typecheck clean, full API suite 254/254, web typecheck + CollectionView test green, mobile typecheck clean, delete-guard + secrets-guard pass. **Not verified:** no live device/browser — the new scan screen, SKU-tag modal, and promo card need a visual check on a real phone/browser before treating as final.

**Deploy notes:** migrations `044` + `045` need `prisma migrate deploy` (migrator role); the promo must be configured by an admin (Admin → Catalog Upload Tiers) to take effect; field agents get phone-based login only after an admin sets their phone in Admin → Team Members.

**Post-build verification re-run (2026-08-04, after all commits landed):** all 100% green — API `tsc` clean + vitest **254/254** (16 files), web `tsc` clean + vitest **72/72** (13 files), mobile `tsc` clean + vitest **25/25** (1 pre-existing unrelated file-level failure: Rolldown cannot parse `expo-linear-gradient`'s vendor `build/LinearGradient.js` — documented, predates this session, zero tests fail), `packages/db` 10 passed / 4 conditional-skipped + `prisma validate` 🚀, `packages/ai` 49/49, `packages/shared` `tsc -b` clean. Guard scripts all pass: delete-guard ✅, secrets-guard ✅, v1-fetch-guard ✅. All tasks marked ✅ done in CLAUDE.md / docs/PLAN.md / docs/PRO-REQUIREMENTS.md are backed by this passing verification.

---

## 2026-08-04 — #1 AI-fields blank bug root-caused + backfill shipped (4037e49); #2 ops-hardening secrets generator (e7c88a8)

### #1 — "AI-tagged name/subtype/SKU/description blank on device" — ROOT CAUSED + FIXED

Full code-path audit (verified by reading code + git history, not doc/memory claims):
- The 2026-08-02 worker consolidation (`8b7a5be`) **never touched the AI_TAGGING worker** — it only paused tryOn/FashionDNA/GhostMannequin and collapsed the 4 cron-only workers into `QUEUES.MAINTENANCE`. The tagging worker is registered in `startWorkers()` with concurrency 3 and consuming.
- Entire chain verified correct end-to-end: producer enqueues on product create + on `/products/:id/retag` ✓, `checkQuota` fails open (no plan row = unlimited) ✓, `handleTagProduct` fills only-null fields (never clobbers edits) ✓, tagger has deterministic never-blank fallbacks for name/description ✓, SKU generator ✓, mobile sends `undefined` not `''` on save ✓, mobile hydrate re-runs on the 3s poll when not dirty ✓.
- **Conclusion:** the current code is correct. The blank fields were products tagged **before migration 043 / the 2026-08-03 AI-fields build** — the old tagger prompt returned no `product_name`/`short_description`/`subtype` and never generated an SKU, so those columns stayed `NULL` forever. The per-product retag endpoint fixed one at a time; there was no bulk path.

**Fix (commit `4037e49`):** new `apps/api/src/jobs/backfill-missing-ai-fields.ts` — cursor-batched (50/batch), capped (250 jobs/run), re-queues a tag-product job for every `ai_tagged=true` product with any of the four fields `NULL`. Safe by construction: only touches completed-tag products, handler never clobbers edits, `auto_cleanup: false`, runs through the normal quota/credits gate. Wired into the maintenance worker as `backfill-missing-ai-fields` (daily 2:30 AM UTC) so it drains the backlog over a few runs after deploy. 4 new unit tests; full API suite 258/258.

### #2 — Operational hardening: one-shot secrets generator

Audited every open env/secret item (LAUNCH-READINESS-AUDIT §3/§5, omp-review B-*/S-*):
- **Fail-closed confirmed in code:** `TEAM_JWT_SECRET` missing → team auth plugin throws (login can't silently mis-issue tokens) ✓; `COOKIE_SECRET` missing in production → startup throws (2026-08-01 fix) ✓; admin TOTP is optional-by-design (`ADMIN_TOTP_SECRET` unset → no 2FA, audit wants it set) ✓; vault gracefully warns + skips when `VAULT_DATABASE_URL` unset ✓; Razorpay webhook secret is per-retailer via F-012 (Admin → Integrations) + platform-level env ✓.
- **Gap found + fixed:** `COOKIE_SECRET` was **missing from `.env.example`** despite being required at production startup — a deploy following the example would fail to boot. Added it + a pointer to the new generator.

**Fix (commit `e7c88a8`):** new `scripts/generate-production-secrets.ts` — prints fresh 192-bit hex values for `COOKIE_SECRET`, `ADMIN_API_KEY`, `TEAM_JWT_SECRET`, `REVALIDATION_SECRET`, `ENCRYPTION_MASTER_KEY`, `RAZORPAY_WEBHOOK_SECRET` as Railway-ready `KEY="value"` lines, plus the still-manual checklist (admin hash/TOTP via `generate-admin-hash.ts`, key rotation, DB role switch, replica/vault URLs). `.env.example` now documents `COOKIE_SECRET` and points to the generator.

**Remaining operator work (production, needs a human per Operational Control Policy):** run the generator in the Railway dashboard, rotate the dev-exposed keys, point `DATABASE_URL` at `kanchuki_app` (staging test first), provision replica + vault instances, set `WEB_URL` to the real domain. The code-side debt is now zero — everything left is config in the hosting dashboard.
---

## 2026-08-04 — Route-module split: `admin.ts` (3125) + `checkout.ts` (1092) → domain modules (commit `912090e`)

Pure mechanical refactor — **zero route-body logic changes**, verified by 258/258 API tests + full typecheck + both guard scripts + biome clean.

| File | Before | After |
|---|---|---|
| `apps/api/src/routes/admin.ts` | 3125 lines, ~60 routes | 163-line aggregator (login + CSRF token) that registers 10 domain modules |
| `apps/api/src/routes/admin-auth.ts` (new) | — | Auth helpers (`validAdminKey`, session sign/verify, IP allowlist, `adminAuthPreHandler`) — re-exported from `admin.ts` for back-compat (`team.ts`, tests, `admin-settings.ts` import from `./admin.js`) |
| `apps/api/src/routes/admin/<domain>.ts` (new, ×10) | — | retailers, plans, activity, media, data, integrations, backups, moderation, ai, misc — each a self-installing plugin with its own `adminAuthPreHandler` |
| `apps/api/src/routes/checkout.ts` | 1092 lines, 11 routes | 15-line aggregator registering 4 domain modules |
| `apps/api/src/routes/checkout/checkout-helpers.ts` (new) | — | Shared helpers (`razorpayAsRetailer`, webhook signature verify, GST math, invoice gen) + schemas (`ConnectPaymentAccountSchema`, `CreateOrderSchema`, `UpdateOrderStatusSchema`, `RazorpayOrder`) |
| `apps/api/src/routes/checkout/<domain>.ts` (new, ×4) | — | payment-account, flow (create/verify order + public order lookup), webhook (owns the raw-body content-type parser — its only consumer), orders (+ public retailer-status route, unauthenticated same as before) |

---

## 2026-08-04 — Route cleanup finished: remaining 6 oversized route files split, size guard wired into CI

Continuation of the same route-split effort (`912090e` above) — this session split the 6 files the guard was still failing on, then wired `scripts/check-route-size.sh` into CI so the split stays enforced going forward. Same mechanical, zero-logic-change approach: route bodies moved verbatim, only imports/paths adjusted per new file depth.

| File | Before | After |
|---|---|---|
| `apps/api/src/routes/products.ts` | 1142 lines | 22-line aggregator registering 5 domain modules (`products/products-{crud,trash,media,variants,ai}.ts` + shared `products-helpers.ts`) |
| `apps/api/src/routes/retailers.ts` | 1144 lines | 21-line aggregator registering 7 domain modules (`retailers/retailers-{profile,uploads,whatsapp,stats,settings,sections,catalog-upload}.ts`) |
| `apps/api/src/routes/team.ts` | 1212 lines | 19-line aggregator registering 6 domain modules (`team/team-{session,territories,members,retailers,tickets,reporting}.ts` + shared `team-helpers.ts`). `teamAuthPreHandler` extracted from the former inline `addHook` body so every module can re-add it (matches the `admin.ts` split convention); `routeTicket` (consumed externally by `retailers.ts`) moved into `team-tickets.ts` and re-exported through the aggregator |
| `apps/api/src/routes/admin-settings.ts` | 1202 lines | 33-line aggregator registering 9 domain modules (`admin-settings/{rate-limits,catalog-promo,theme,ai-config,operations,deployments,ticket-reporting,backups,notifications}.ts` + shared `settings-store.ts`). `getCatalogUploadPromo`/`getTheme`/`getCachedRateLimits`/`DEFAULT_RATE_LIMITS`/`DEFAULT_AI_CONFIG` (consumed externally by `team.ts`/`public.ts`/`retailers.ts`) re-exported through the aggregator, unchanged import paths |
| `apps/api/src/routes/public.ts` | 891 lines | 20-line aggregator registering 5 domain modules (`public/public-{misc,collections,products,retailers,catalog-payment}.ts` + shared `public-helpers.ts`) |
| `apps/api/src/routes/admin/admin-retailers.ts` | 845 lines | 15-line aggregator registering 3 domain modules (`admin/admin-retailers/admin-retailers-{list,detail,management}.ts`) — one level deeper than the other 5, since this file was itself already a leaf of the `912090e` `admin.ts` split |

**CI wiring:** `.github/workflows/ci.yml`'s `quality` job now runs `bash scripts/check-route-size.sh` alongside the existing delete-guard/secrets-guard/v1-fetch-guard steps — the script's own header comment had claimed CI called it since `912090e`, but the step was never actually added until now.

**Verified:** guard script passes clean (0 violations across all of `apps/api/src/routes/**`), `apps/api` `tsc --noEmit` clean, full API vitest suite **258/258** (17 files) — identical pass count to the pre-split baseline, confirming no route behavior changed.

Reproducible via `scripts/split-admin-routes.mjs` / `scripts/split-checkout-routes.mjs` (import pruning, `../` → `../../` path rewrite, helper-usage-based imports, CRLF-safe). Route auth unchanged: checkout has no plugin-level hook — `/retailers/*` gets `request.retailerId` from the global decorator, `/public/*` stays public.

---

## 2026-08-05 18:04 IST — Standalone product-photo cleanup script (`scripts/batch-clean-photos.py`)

Not an app feature — a personal CLI tool for cleaning raw retailer product photos (mannequin/rack shots) before catalog upload, built ad hoc from a user request in this session. `pip install rembg pillow`.

Two modes, pick one per run:
- **Default:** rembg background removal → composite onto `--bg` flat color or `--bg-image` backdrop photo (cover-cropped) + soft drop shadow.
- **`--blur RADIUS`:** portrait mode — subject stays sharp, the shot's own background gets gaussian-blurred instead of removed/swapped. Tested more forgiving than the swap mode on cluttered rack shots (bad segmentation edges look "soft" instead of obviously pasted).

Both take `--crop x1,y1,x2,y2` (pre-trim before segmentation — rembg segments by saliency not subject identity, so overlapping neighbor garments/mannequins in-frame get kept as foreground; crop only helps when clutter doesn't physically touch the subject, tested and confirmed it can't split two touching objects) and `--shine` (`ImageEnhance` contrast/saturation/brightness + a soft `ImageChops.screen` highlight on the subject only — first pass overshot to a white haze, tuned down to Color 1.12/Contrast 1.08/Brightness 1.03/ellipse fill 70).

Tested end-to-end on 3 real retailer photos across all mode combos — outputs saved at `scripts/demo/2026-08-05/`. Discussed and explicitly skipped: pasting the garment onto a stock/AI human-model photo — that's virtual try-on (pose-aware garment transfer), not background compositing, and a flat paste looks obviously fake. Real version would reuse this project's existing RunPod CatVTON setup or the planned self-hosted Fashion V-Tone v1.5 engine — not built, revisit only if asked given real per-run RunPod cost.

---

## 2026-08-06 — Admin: Storage Report run-now button + Live R2 measurement + Fashion V-Tone "Generate on model" (all deployed)

Three admin-panel features landed this session, each committed + deployed separately. Full spec of the storage-report pair is in the earlier CLAUDE.md entries; the V-Tone work is the newest.

### 1. Storage Report "Run compression now" (`ce01a15`)

`POST /v1/admin/storage-report/run` enqueues the same `compress-r2-images` maintenance job the 4:30 AM cron fires (`triggered_by: 'admin'` recorded in the audit metadata so the report badges manual runs). Page button polls up to 1 min for the new run row; manual runs get a blue "manual" badge. 503 `QUEUE_UNAVAILABLE` when Redis is down.

### 2. Live R2 storage measurement (`3eda0fd`)

`packages/ai` gains pure `summarizeR2Objects` + `measureR2Storage()` (lists the bucket, rolls up total/object count, image split, per-prefix breakdown — exactly `scripts/measure-r2-storage.ts`'s numbers). New `measure-r2-storage` maintenance job writes an `R2_STORAGE_MEASURE` audit entry; `POST /v1/admin/storage-report/measure` + `GET` returns `live_measurement`. Page shows a Live R2 storage panel (4 stat cards + top-10 prefixes) with a Re-measure button sharing the run-now button's poll machinery. Prisma gotcha: `by_prefix` is type aliases (not interfaces) so it's assignable to the `Json` field.

### 3. Fashion V-Tone LIVE + admin "Generate on model" (`9a9e923`, infra + config + `2ff4d59` docs)

**User approved self-hosted V-Tone (option #1)** after the $5 Hobby-plan cost check: the plan has ~$2/mo headroom, so V-Tone runs **serverless with autosleep** (10 min idle) + a **workspace hard limit** (soft $8 / hard $10) as a runaway guard. This is the first production deployment of the V-Tone service that has sat scaffolded since the project's early VTO planning.

| Layer | Summary |
|---|---|
| **Railway service** | `fashion-vtone` (id `e6afdefd`) built from `services/fashion-vtone/Dockerfile`. Domain `fashion-vtone-production.up.railway.app:8000`. R2 creds copied from the API service (incl. `R2_ENDPOINT` built from `R2_ACCOUNT_ID`). `VTONE_API_URL` set on the API service |
| **Deploy gotchas hit + fixed** | (1) Railway injects `PORT=8080` overriding the Dockerfile's `ENV PORT=8000` → Uvicorn bound 8080, domain targeted 8000 → 502. Fixed with explicit `PORT=8000` variable. (2) `railway environment config --json` shows template defaults (RAILPACK) even for Dockerfile services — dot-path `--service-config` edits silently no-op'd; the authoritative write is `railway environment edit --json '{"services":{"<id>":{...}}}'` |
| **Engine override** | `packages/ai/src/tryon.ts` — `TryOnRequest.vtoneCategory` (tops/bottoms/one-pieces) wins over the heuristic mapping so the admin picker is honored exactly |
| **Job** | `apps/api/src/jobs/admin-tryon.ts` — runs `triggerTryOn`, fetches result via SSRF-safe `ssrfSafeFetch`+`readCappedBuffer` (NOT `downloadBuffer` — that takes an R2 key, not a URL; reviewer caught this), re-encodes ≤80KB JPEG to `admin/photo-cleanup-tests/`, writes `ADMIN_TRYON` audit on success AND failure (attempts=1, one row per job) |
| **API** | `POST /admin/photo-cleanup/tryon` (enqueue) + `GET /admin/photo-cleanup/tryon-results` (audit feed, `parseTryOnResult`) |
| **Web UI** | Model-photo dropzone + garment-type select + per-result "On model" button → 3-min poll (double-click-safe, attempts counted only on successful fetches) → on-model results feed, lightbox-clickable |

**⚠️ Live-test finding — CPU inference is ~26 min/try-on, not 30-60s.** A real POST `/try-on` ran 30 sampling timesteps at ~52s/timestep on the Railway CPU tier (9/30 steps took 8 min). The pipeline works end-to-end (downloads, inference, no errors) but the speed budget was wrong for CPU. Consequences: the admin page's 3-min poll times out on every real run (job completes in the background, result still lands in the feed), and `callVTONOnce`'s 120s `AbortSignal.timeout` kills real CPU runs mid-inference — so production API-job try-ons currently fail on the timeout, not the engine. **Fix not yet applied:** lower `TryOnPipeline` timesteps (30 → 8-10, quality tradeoff) and/or raise the timeout to ~30 min for CPU + extend the page poll; a GPU instance would restore ~10-30s but exceeds the Hobby headroom.

**Verified:** api/web tsc 0, tests 8/8, biome clean on new code; API + web + vtone all SUCCESS on `9a9e923`; V-Tone `/health` returns `{"status":"ok","pipeline_loaded":true,"device":"cpu"}`. New admin routes 403 without a key (registered + auth-gated).

---

## 2026-08-07 — ✅ BUILT + DEPLOYED: DB-backed Category/Style/Occasion/Fabric taxonomy (F-027)

**User ask:** move Category/Style/Occasion/Fabric out of hardcoded lists into the database — admin-editable, seeded as defaults per new retailer, AI tagging auto-detects Style/Fabric (Occasion/Category already did), product-add screen shows them as select/multi-select pulled from the DB. Ladies-only for now, schema must be ready for Men/Kids segments later with zero migration changes (just new rows). Style/Fabric confirmed multi-select by user (Category stays single via existing `category_id`, Occasion stays multi via existing `occasions[]`).

**Fully deployed and browser-verified — see "Migration applied + live-verified" at the bottom of this entry.** Resume history below kept for context:

### Done this session
- **Schema** (`packages/db/prisma/schema.prisma`): `ProductSegment` enum (LADIES/MEN/KIDS), `ProductAttributeKind` enum (STYLE/OCCASION/FABRIC), `segment` column added to `ProductCategory`/`DefaultProductCategory`, new `DefaultProductAttribute`/`ProductAttribute` models (one generic pair covering Style/Occasion/Fabric — not three separate tables), `Product.styles`/`Product.fabrics` (`String[]`, no FK — same soft-match convention `occasions` already used).
- **Migration** `packages/db/prisma/migrations/046_product_attributes/migration.sql` — written but **NOT applied to any database**. Per this repo's operational policy (CLAUDE.md "AI Agent Operational Control Policy" — migrations are admin-dashboard/human-only), the agent does not run `migrate:deploy`/`migrate:dev`. Contents: the two new enums/tables, `segment` columns, **replaces** the F-024 `default_product_categories` seed with the retailer's new 10-item list (New Arrivals, Sarees, Salwar Suits, Kurtis, Tops & Tunics, Dresses, Co-ords, LUXE, Woolen, Sale — forward-only, existing retailers keep their current copies, same precedent as migration 045), seeds Style (9)/Occasion (11)/Fabric (13) defaults, backfills every existing retailer, adds `products.styles`/`products.fabrics` columns.
- **Prisma client NOT regenerated** — `pnpm --filter @kanchuki/db db:generate` hit `EPERM: operation not permitted, rename ... query_engine-windows.dll.node` because a running dev-server node process has the engine DLL locked. Did not kill background node processes without asking. **Resume: stop the dev servers (or ask user to), then run `pnpm --filter @kanchuki/db db:generate`.** Until then, `apps/api`/`apps/mobile` will NOT typecheck clean against the new Prisma fields/models.
- **Backend**: `apps/api/src/lib/default-attributes.ts` (`seedDefaultAttributes`, mirrors `default-categories.ts`) wired into `auth.ts` (self-serve signup) and `team/team-retailers.ts` (agent-created signup), alongside the existing `seedDefaultCategories` call. Admin CRUD (`GET/POST/PATCH/DELETE /admin/default-attributes?kind=`) added to `admin-misc.ts`. Retailer-facing CRUD (new `apps/api/src/routes/product-attributes.ts`, `GET/POST/DELETE /v1/product-attributes?kind=`) registered in `index.ts`.
- **AI tagging**: `packages/shared` `AiTagResult` gained `style`/`fabrics` (both `string[]`); `packages/ai/src/tagger.ts` `EXTRACT_SCHEMA` extended with `style`/`fabrics` fields + required + result mapping + one prompt line; `apps/api/src/jobs/tag-product.ts` writes `tags.style`→`Product.styles`, `tags.fabrics`→`Product.fabrics` on every tag/re-tag (same treatment as `occasions`, no never-clobber guard). No DB resolve/match step for these on the backend — same convention `occasions` already used (raw AI strings stored directly); the product-add screen matches them against the retailer's own `ProductAttribute` list client-side.
- **Products API**: `CreateProductSchema`/`UpdateProductSchema` (`products-helpers.ts`) accept `styles`/`fabrics`; `products-crud.ts` re-embeds on edits to either field, same as `occasions`.
- **Mobile — product add/edit screens DONE**: `app/product/add.tsx` and `app/product/[id].tsx` both now fetch Style/Occasion/Fabric options via `productAttributeApi.list(kind)` (new `apps/mobile/src/lib/api/attributes.ts`, exported via the `api/index.ts` barrel) instead of the hardcoded `OCCASION_TYPES`/`FABRIC_TYPES` constants, rendered as multi-select chip rows (reusing the existing chip-button pattern, `dirty()`-wrapped on the edit screen so the 3s AI-tagging poll can't wipe unsaved picks). **Design decision made here:** `product/[id].tsx`'s old single-select "Fabric" chip row (editing `fabric_estimate` via hardcoded `FABRIC_TYPES`) was **replaced**, not kept alongside, by the new dynamic multi-select `fabrics` row — having two similarly-named Fabric pickers on one screen would confuse retailers. `fabric_estimate` is no longer retailer-editable from this screen; it stays as the AI's original free-text guess. Revisit if the user wants `fabric_estimate` editable again.

### NOT done — resume here
1. **`apps/mobile/app/customer/[id].tsx`** (Fashion DNA customer-preference screen) — still imports `FABRIC_TYPES`/`OCCASION_TYPES` from `@kanchuki/shared` and has a local hardcoded `const STYLE_OPTIONS = ['Casual', 'Party', 'Office', 'Wedding', 'Festive']` (line 24) driving `pref_styles`/`pref_fabrics`/`pref_occasions` chip rows (~line 496-572). Was mid-edit when this task was interrupted — swap all three to `productAttributeApi.list('STYLE'|'FABRIC'|'OCCASION')` the same way `add.tsx`/`[id].tsx` were just done. The screen already has a `toggle(list, setList, value)` helper — reuse it with `.name` instead of hand-rolling the filter/spread pattern used in the product screens.
2. **Remove now-dead hardcoded constants**: once `customer/[id].tsx` no longer imports them, delete `OCCASION_TYPES`/`FABRIC_TYPES` from `packages/shared/src/constants/index.ts` (grep first to confirm zero remaining references) and fix `apps/mobile/src/test/setup.ts`, which also references them.
3. **Admin web UI**: no page built yet for editing the `DefaultProductAttribute` template. Clone `apps/web/src/app/admin/default-categories/page.tsx`'s table UI (kind-agnostic — add a Style/Occasion/Fabric tab switcher hitting `/admin/default-attributes?kind=`), add a Sidebar.tsx nav entry (pattern at line 78, `Default Categories` — icon `LayoutGrid` is taken, pick e.g. `Tags`).
4. **Apply migration 046** — human/admin action per operational policy, not the agent. `pnpm --filter @kanchuki/db migrate:deploy` (or `migrate:dev` locally) once ready.
5. **Regenerate Prisma client** — stop local dev servers first (EPERM lock, see above), then `pnpm --filter @kanchuki/db db:generate`.
6. **Typecheck everything** — `packages/db`, `packages/shared`, `packages/ai`, `apps/api`, `apps/mobile` `tsc --noEmit` (all currently unverified against the new Prisma types since client regen is blocked).
7. **Update CLAUDE.md** — flip this entry from "IN PROGRESS" to "Built" with date, per this repo's own "docs must track commits" rule, once steps 1-6 land and are verified.
8. ✅ DONE (2026-08-07 follow-up): `apps/mobile/app/product/catalog-import.tsx` (bulk review screen) — Style/Fabric wired in end-to-end: `BulkCreateProductsSchema` items + `productData` mapping accept `styles`/`fabrics`; `DetectedItemResponse`/`CatalogDetectedItem.tags` now declare the AI `style`/`fabrics` arrays; review screen fetches dynamic options via `productAttributeApi.list('STYLE'|'FABRIC')` (shared `['attributes', kind]` cache), seeds each item's edits from the AI tags, renders Style + Fabric chip rows in the expandable editor (the free-text Fabric field was replaced, same two-pickers decision as `product/[id].tsx`; `fabric_estimate` stays the AI guess), shows AI-detected style/fabric badges on the collapsed card header, and sends `styles`/`fabrics` in the bulk-create payload (omitted when empty, same convention as `occasions`). **Required companion fix:** `tag-product.ts` now guards `styles`/`fabrics`/`occasions` behind a never-clobber check (`current?.X == null || length === 0`, same rule as name/subtype/description) — without it the background tagging job queued by bulk-create would have overwritten the retailer's review-screen picks (Style/Fabric chips, Occasions comma-list) with AI output seconds after save. All three arrays now survive re-tags; AI fills them only when still empty.

### Follow-up, same day — resume items 1-3 + typecheck done

Items 1-3 above are done: `customer/[id].tsx` now fetches Style/Occasion/Fabric via `productAttributeApi` (same pattern as the product screens, reusing the screen's existing `toggle(list, setList, value)` helper); `OCCASION_TYPES`/`FABRIC_TYPES` deleted from `packages/shared/src/constants/index.ts` and from the mobile test mock (`apps/mobile/src/test/setup.ts`); admin web UI built at `apps/web/src/app/admin/default-attributes/page.tsx` (kind-tab switcher over the same table UI as Default Categories) + Sidebar link.

**Typecheck (item 6), partial:** `packages/shared`, `packages/ai` (needed one fix — `detector.ts`'s preliminary per-item tag object was missing the new `style`/`fabrics` fields required by the extended `AiTagResult`, added as empty arrays; it gets overwritten by the real tagging call anyway per the existing code comment), `apps/web`, `apps/mobile` — all `tsc --noEmit` clean.

**Still blocked — items 4/5, and the `apps/api`/`packages/db` half of item 6:** `pnpm --filter @kanchuki/db db:generate` still fails with `EPERM: operation not permitted, rename ... query_engine-windows.dll.node` on every retry this session — a running local dev-server node process has the Prisma query engine DLL open, and Windows won't let it be replaced while held. The agent will not kill background node processes without the user's say-so (there are 30+ node.exe processes running locally, not obviously identifiable as "safe to kill" vs. the user's active work). **To finish: stop your local dev servers (or tell me which process to kill), then re-run `pnpm --filter @kanchuki/db db:generate`, then `pnpm --filter @kanchuki/api typecheck` and `pnpm --filter @kanchuki/db typecheck` to confirm apps/api compiles against the new Prisma models/fields, then apply migration 046 through your normal deploy process (never run by the agent per the Operational Control Policy).**

### Follow-up, same day — ✅ RESOLVED: Prisma client regenerated, all typechecks green, API suite fixed, F-027 tests added

The EPERM lock was a red herring this time — the only `node.exe` running was the agent runtime itself (no dev server), so `db:generate` succeeded on the first try. Full verification then surfaced two real issues, both fixed:

1. **Stale `@kanchuki/shared` dist was silently breaking `apps/api` typecheck** — the source `AiTagResult` has `style`/`fabrics` (added by F-027) but `apps/api` resolves the *built* types from `packages/shared/dist`, which hadn't been rebuilt since the F-027 commits. `pnpm --filter @kanchuki/shared build` fixed it; api typecheck went clean.
2. **8 API test files were failing to LOAD (not test failures) — pre-existing `getPurgePrisma` mock gap, unrelated to F-027.** The admin-route graph (admin-retailers-list → purge-retailer-now, and admin-storage/jobs → purge-soft-deleted) calls `getPurgePrisma()` at module top-level; 8 suites mocked `@kanchuki/db` without that export, so Vitest crashed the whole file on import ("No getPurgePrisma export"). CLAUDE.md had flagged `admin.login.test.ts` for this; the 2026-08-06 storage-report job widened it to 8 files. Fixed by adding a stub `getPurgePrisma` to the mock in `admin-settings.test.ts`, `admin.login.test.ts`, `catalog-upload-promo.test.ts`, `public.test.ts`, `retailers.test.ts`, `security.test.ts`, `team.test.ts`, `admin.test.ts` (pattern from `products.test.ts`). **API suite: 22/22 files, 285/285 tests** (was 14/22, 140/140-with-8-crashed-files).
3. **New F-027 test coverage**: `apps/api/src/routes/product-attributes.test.ts` (9 tests — list by kind + retailer scoping, invalid-kind 422, create, duplicate 422, empty-name 422, owned delete 204, cross-retailer IDOR 404). **API suite now 23/23 files, 294/294 tests.**

**Verified this session:** `packages/shared` (after rebuild), `packages/ai`, `packages/db`, `apps/api`, `apps/web`, `apps/mobile` — all `tsc --noEmit` clean. Tests: api 294/294, ai 58/58 (the earlier 1-fail was a flaky 8s image-compress timing, green on re-run), db 10/10. New test file biome-clean.

**Still human-only (unchanged): apply migration 046** via the normal deploy process (`pnpm --filter @kanchuki/db migrate:deploy` with the migrator role, per Operational Control Policy — never run by the agent). Until it's applied, the F-027 routes will 500 on the missing `product_attributes`/`default_product_attributes` tables, and the new admin Default Attributes page + mobile Style/Occasion/Fabric pickers will come back empty.

### Migration applied + live-verified (2026-08-07, human-run via Supabase SQL Editor)

Applying 046 surfaced that the live DB was **four migrations behind**, not one — `_prisma_migrations` topped out at `042_seed_llama_vision_fallbacks`. Diagnosed by direct `information_schema`/`pg_indexes`/`to_regclass` checks (not trusted from `_prisma_migrations`, which turned out to be lying about 043/044):

- **043** (`products.sku/description/subtype` + indexes) and **044** (`team_members.phone` + index) — DDL was **already present** in the live DB (applied by hand at some earlier point, never recorded). Resolved as applied via a manual `_prisma_migrations` INSERT keyed to each file's real sha256 checksum — no DDL re-run.
- **045** (`default_product_categories` table + 13-item seed + retailer backfill) and **046** (taxonomy tables/enums/seed/backfill + `products.styles`/`fabrics`) — genuinely unapplied. Both run fresh via Supabase SQL Editor (human), each followed by its own `_prisma_migrations` INSERT.
- **Post-apply verification (live DB query):** 10 `default_product_categories` rows (F-027's replacement list superseding F-024's 13), 33 `default_product_attributes` (9 style/11 occasion/13 fabric — exact match), 66 `product_attributes` rows = 2 existing retailers × 33 (backfill hit both).
- **Local follow-through:** `pnpm --filter @kanchuki/db db:generate` clean (no EPERM this time), `@kanchuki/db` + `@kanchuki/api` `tsc --noEmit` both 0 errors.
- **Browser-verified** (headless, real admin session via `sessionStorage.admin_key`) at `/admin/default-attributes`: Style/Occasion/Fabric tabs all render correct seeded names, 0 console errors, 0 failed requests tied to the page. Live CRUD confirmed by the user adding a test STYLE row ("Kurtis") through the actual admin UI — renders back correctly, confirming create+list both work end to end.

**F-027 is now fully done — code, migration, and live UI all verified. Nothing left pending.**
