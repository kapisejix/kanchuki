# Railway cost & memory improvements

**Opened:** 2026-10-09 · **Status:** ✅ culprit found + fixed + deployed 2026-10-10; 24 h confirmation and a few owner decisions still open (§8) · **Trigger:** Railway memory bill after 24 Sep 2026

---

## 0. Result (2026-10-10)

**The culprit was the background-removal stack (`@imgly/background-removal-node` + its ONNX runtime) resident in the API process.** After PR #49 deployed, API memory fell from a flat **1.34 GB** to **~0.14 GB**.

| Measure | Before (2026-10-09) | After (2026-10-10) |
|---|---|---|
| Railway API memory (`supportive-love`) | 1.27–1.44 GB, flat 5+ days | **0.13–0.15 GB** (min 0.129) |
| `/admin/server-memory` card, 10 min after boot | — | RSS 183 MB · heap used 73 MB of 77 MB committed · external 4.8 MB · native/other ~102 MB (Prisma engine, libvips, allocator) · 3 samples flat |
| Web (`magnificent-liberation`) | 0.36 GB | 0.33 GB now, 6 h avg 0.36, peak 0.56 during deploy warm-up |

- **Shipped:** #49 `f1148360` (removal pass, squash-merged 2026-10-10 05:22 UTC; API build `438e26b4` SUCCESS) and #50 `59f9fa59` (admin Server Memory card, merged 05:37 UTC).
- **Estimated bill:** API ≈ $19/mo → ≈ $1–2/mo. Not yet confirmed on an invoice.
- **Not yet proven:** that RSS stays ~150–250 MB over 24 h (the card's history resets on every deploy; compare Railway's own graph). If it creeps, §10's reading guide applies.
- **Web healthcheck** is what hits `/v1/public/theme` every minute (§2, item 9).

## 1. The bill — what it actually says

| Line | Amount | Meaning |
|---|---|---|
| Memory | 10,874.62 GB-min = **$2.5173** | 97% of the bill |
| CPU | 19.54 vCPU-min = $0.0090 | idle |
| Egress | 0.67 GB = $0.0337 | negligible |
| Volume + Backup | $0.0063 | negligible |

10,874 GB-min ÷ (1.86 GB × 1440 min/day) ≈ **4 days** of runtime, so this bill is a ~4-day window, roughly **$19/month** at the current level. CPU is ~0 — the services sit idle but loaded.

### Live memory per service (Railway metrics, 2026-10-09, project `kanchuki-prod`)

| Service | Role | Memory | Behaviour |
|---|---|---|---|
| `supportive-love` | **API** (Fastify) | **1.35 GB** | flat 1.27–1.44 GB for 5+ days |
| `magnificent-liberation` | **Web** (Next.js) | 0.36 GB | flat |
| `Postgres`, `Postgres-PYkI`, `Postgres-n9YQ` | 3 × Postgres | ~0.05 GB each | flat |

**Flat line = not a leak.** A leak climbs. This is a high idle baseline.

## 2. Why it costs money with no users

- Railway bills memory for every minute a service is *running*, used or not.
- The API keeps **6 BullMQ workers** (tagging, embeddings, studio-shoot, try-on, catalog-sync, maintenance) and ~12 cron jobs loaded and connected to Redis permanently.
- ~~Something requests the web app about every 2 minutes~~ **Identified 2026-10-10:** it is Railway's own healthcheck. Web HTTP log shows `GET /` every 60 s exactly (5–17 ms, 200). `apps/web/src/app/layout.tsx:105` fetches `${API_ORIGIN}/v1/public/theme` on every server render (`revalidate: 60`), so the chain is healthcheck → web `/` → layout → API `/v1/public/theme`, ≈1 call/min. Harmless (milliseconds). A lightweight `/api/health` that skips the theme fetch would remove it — optional.
- Railway only sleeps a service after ~10 min with **no outbound traffic**. The API's permanent Redis connection (BullMQ) counts as outbound traffic → **the API will probably never actually sleep**.

## 3. What was NOT proven (be honest)

> Status after 2026-10-10 deploy: the first and third bullets are **resolved** (see §0). Kept for the record.

- ~~**The exact cause of the 1.2 GB.**~~ **Resolved:** the background-removal stack. Removing it dropped API memory 1.34 → 0.14 GB; the remaining ~100 MB native is the Prisma engine + libvips + allocator.
- **That 24 Sep changes caused it.** Still unknown — Railway tooling here returns summaries only (no time series) and CLI 5.26 has no `api` command. No dependency or Dockerfile change landed 18 Sep–2 Oct. Irrelevant now that the stack is gone, but do not claim a cause for the *timing*.
- ~~**Whether removing background removal lowers memory.**~~ **Confirmed:** measured before/after (§0).

## 4. What changed — done

### 4.1 Railway settings (production, reversible in dashboard)
- `sleep_application = true` on **web** (`magnificent-liberation`) — still on.
- **API (`supportive-love`): sleep turned back OFF on 2026-10-10** (`sleep_application = false`). Reason: the API runs 6 BullMQ workers + ~12 crons (03:00 backup, referral accrue/payout on the 30th, GST reconciliation) that do **not** run while it sleeps, it probably never slept anyway (permanent Redis connection), and at ~0.14 GB always-on costs ≈ $1–2/mo. The update call returned success but `get_service_config` does not show the field — **verify in the dashboard** (API → Settings → Serverless off).
- ⚠ Web: first request after sleep is slow (cold start). The 60 s Railway healthcheck (§2) likely keeps it awake anyway.

### 4.2 Code — background removal REMOVED (feature the owner does not want)
Removed from the backend:

| File | Change |
|---|---|
| `packages/ai/src/detector.ts` | deleted `cleanupProductPhoto`, `buildShadowLayer`, `bgRemovalPublicPath`, the `@imgly` import; `detectCropAndTag` no longer cleans crops |
| `packages/ai/package.json` | dropped dependency `@imgly/background-removal-node` |
| `packages/ai/src/detector.test.ts` | deleted (tested only the removed code) |
| `apps/api/src/jobs/tag-product.ts` | removed the auto-cleanup block (BG removal + contrast backdrop + shadow) |
| `apps/api/src/routes/products/products-media.ts` | removed `POST /products/:id/photos/:photoId/cleanup`, `PATCH /products/:id/background`, `GET /products/background-images` |
| `apps/api/src/routes/products.test.ts`, `apps/api/src/jobs/tag-product.test.ts` | removed cleanup / F-028 / F-030 tests and mocks |

Tests after the change: `tag-product.test.ts` + `products.test.ts` = **34 passed**; `@kanchuki/ai` typecheck clean; biome clean on the touched API files.

Features that are therefore **gone**: auto-clean (BG strip) on upload, per-photo "Background" picker, product-level background, **shadow toggle (F-030)**, auto-contrast backdrop (F-028), the manual cleanup button.

### 4.3 Prisma pool
- `packages/db/src/client.ts`: default `connection_limit` **10 → 5** (still overridable by `DB_CONNECTION_LIMIT` or a `connection_limit=` already inside `DATABASE_URL`).
- ⚠ A `connection_limit` inside the production `DATABASE_URL` wins over this default — check it in Railway.
- ⚠ This caps connections, **not** the query-engine's memory; expect a small effect.

### 4.4 Memory logging — added then removed
A 5-minute `[mem]` logger was added to `apps/api/src/index.ts` and removed again at the owner's request. Not in the code now.

## 5. What is `@imgly/background-removal-node`?

An npm package that removes a photo's background **on the server, with no external API**. It bundles an ONNX neural-network model (tens of MB on disk) and runs it with `onnxruntime-node`. Each call decodes the image, runs inference, returns a transparent-PNG cutout. Cost: hundreds of MB of RAM during the call, and glibc/V8 rarely hand that memory back, so RSS stays high afterwards. It was used only by `cleanupProductPhoto`. It is now removed from `package.json`.

## 6. Why the Docker build can fail: `--frozen-lockfile`

`apps/api/Dockerfile` runs `pnpm install --frozen-lockfile`. That flag means "install **exactly** what `pnpm-lock.yaml` says; if `package.json` and the lockfile disagree, **fail** instead of fixing it". It protects production from silently installing different versions than were tested.

Removing `@imgly/...` from `packages/ai/package.json` while `pnpm-lock.yaml` still listed it would have failed this check and broken the Railway build.

**Resolved:** the lockfile was regenerated in #49 (imgly gone from `pnpm-lock.yaml`), the Docker build passed and the API deployed (`438e26b4` SUCCESS, 2026-10-10). Kept here as the reason the lockfile must always move with `package.json`.

## 7. What is `sharp`, and the owner's decision

`sharp` is a Node image library (native libvips) — resize, crop, rotate, JPEG re-encode, composite. It is fast and its memory is modest; it is **not** the ML model. The owner wants it **only for compress and watermark**.

### Where sharp is used now (after the 2026-10-09 removal pass)

| File | Used for | Status |
|---|---|---|
| `image-compress.ts` | JPEG ≤80 KB (R2 compress cron, uploads) | **KEPT** |
| `watermark.ts` (+ `apps/api/src/lib/showcase-watermark.ts`) | Suits Designs watermark | **KEPT** |
| `image-rotate.ts` | photo rotate | **REMOVED** (file + test + `POST /products/:id/photos/:photoId/rotate`) |
| `detector.ts` crop / `getImageDimensions` / multi-item `detectItems` | crop each garment from a catalog photo | **REMOVED** |
| `image-quality.ts` | sharpness score, luminance, best-shot pick | **KEPT / RESTORED 2026-10-09** — I first deleted it believing it was dead code; it is NOT: the kept Pro cleanup route (`products-pro-cleanup.ts`) imports `pickSharpest`, `scoreSharpness`, `isDarkImage`. Removing it breaks the API build. Sharp is therefore used by compress, watermark **and** image-quality. Remove only together with the Pro cleanup path. |
| `phash.ts` | duplicate detection | **REMOVED** (+ `flagDuplicates` in `catalog-import.ts`) |
| `tagger.ts` `extractDominantColorFromBuffer` + `detectColor` | colour auto-fill | **REMOVED** (+ `POST /products/detect-color`) |

`git grep` confirms sharp is now imported only by `image-compress.ts`, `watermark.ts` and `apps/api/scripts/preload-sharp.cjs`. `sharp` stays in `packages/ai/package.json`.

### Behaviour changes caused by the removal
- **Catalog import / bulk onboarding (F-001b/c/d):** `detectCropAndTag` now uploads the photo as-is and tags it ONCE — one product per photo, no per-garment crop, no vision "detect items" call (saves that AI call). A catalog page with several garments becomes a single product. Response shape is unchanged: `phash` is `''`, `is_duplicate` is always `false`, `bbox` is the full image.
- **Duplicate warnings** no longer appear. `product_photos.phash` column + index (migration 019) are left in place; new rows get no hash.
- **Colour auto-fill** is gone: "Add Color Variant" falls back to `New Color`; add-photos skips auto-variant.
- **Quotas:** `IMAGE_CROP` is still checked and incremented on the import routes though no crop happens (harmless but misleading) — remove in a follow-up.

## 8. Still open / waiting

| # | Item | State |
|---|---|---|
| 1 | Regenerate `pnpm-lock.yaml` (§6) | **DONE** — regenerated in #49, build + deploy passed 2026-10-10 |
| 2 | Mobile UI for removed features | **DONE 2026-10-09** — see 6b |
| 3 | Admin pages for backgrounds / photo cleanup | not checked (`apps/web/src/app/admin/photo-cleanup-test`, background-image admin) |
| 4 | DB columns/tables (`background_image_id`, `add_shadow`, `BackgroundImage`) | left in place — dropping needs a migration, which only the owner may approve |
| 5 | Docs: `CLAUDE.md` index rows (#31, #33, #35, #53 mention these features), `docs/BUILD-LOG.md`, `docs/PRO-REQUIREMENTS.md`, `docs/PLAN.md` | **not updated** — `CLAUDE.md` needs explicit owner approval to edit |
| 6 | Sharp removal from non-compress/watermark features (§7) | **DONE 2026-10-09** (rotate, crop/multi-detect, ranking, duplicate detection, colour auto-fill). Tests: API products/load-test 76 passed, `@kanchuki/ai` 90 passed, typecheck clean. |
| 6b | Mobile removal pass | **DONE 2026-10-09.** Removed: colour-detect (button/chip in `ProductMediaCarousel`, `useProductDetailForm`, calls in `add-color.tsx`/`add-photos.tsx`), background + shadow controls in `ProductPhotoControls` (**Set as Main kept**), `useProductAiStudio` bg/shadow state, add-product Auto-clean / Shadow / Background picker + pro-options backdrop picker, duplicate badge + `phash`/`is_duplicate` fields, `productApi.cleanupPhoto/getBackgroundImages/setBackground/rotatePhoto/detectColor`. Server `catalog-import` no longer returns `phash`/`is_duplicate`/`duplicate_of_product_id`. Mobile `tsc` + eslint clean, API 84 tests, AI 90 tests. **Kept on purpose:** client-side pre-save rotate (expo ImageManipulator, no server), Pro cleanup path (hanger removal + tight crop via the separate photo-cleanup sidecar — not sharp/imgly; say if you want it removed too). |
| 7 | Three Postgres services | **ON HOLD** (owner will review). Not touched. Before deleting any: find the one `DATABASE_URL` points to; the others each cost ~50 MB + a volume. Take a backup first. |
| 8 | Lower `--max-old-space-size` (now 1536 in `apps/api/Dockerfile`) | **low value now** — heap committed is 77 MB, so the 1536 limit is never approached. Optional tidy (try 512–768); no memory impact expected |
| 9 | Find who calls `/v1/public/theme` every 2 min | **DONE 2026-10-10** — Railway's web healthcheck, `GET /` every 60 s (§2). Optional: lightweight `/api/health` that skips the theme fetch |
| 10 | Exact memory culprit | **DONE 2026-10-10** — background-removal stack; API 1.34 → 0.14 GB (§0). Re-check after 24 h |
| 11 | Stop idle workers/crons (owner ask: "only run on request") | **superseded** — at ~0.14 GB always-on is ≈ $1–2/mo, so API sleep was turned off (§4.1) and workers/crons run on schedule. A separate worker service is no longer worth building for cost |
| 12 | 24 h recheck of API RSS (expect 150–250 MB) + Railway graph | open — owner/next session |
| 13 | Web `/.git/config` returns 200 (soft-404, not a leak) | queued: `storefront-soft-404.md` |

## 9. Safety notes

- Code shipped via GitHub only: #49 and #50 merged to `main` by the owner and auto-deployed by Railway (2026-10-10). Nothing was deployed with `railway up`.
- No production env vars, database, or Postgres service were changed. Only the `sleep_application` flags (§4.1): web `true`, API `false`.
- Do **not** deploy with `railway up`; deploy only via GitHub push (project policy, `docs/DEPLOY.md`).

## 10. Admin "Server Memory" card (built 2026-10-09, branch `feat/admin-memory-card`)

Track API RAM from the admin dashboard instead of guessing.

| Piece | Where |
|---|---|
| API route `GET /v1/admin/server-memory` (read-only) | `apps/api/src/routes/admin/admin-server-memory.ts` (+ test) |
| Sampler: one reading every 5 min, in-process ring buffer of 288 (24 h) | same file; `unref`'d timer, no DB writes |
| Admin page | `/admin/server-memory` (`apps/web/src/app/admin/server-memory/page.tsx`) — 4 stats, RSS + heap trend, last 12 samples, plain-English verdict |
| Home-page card | `apps/web/src/app/admin/components/ServerMemoryCard.tsx`, rendered in `admin/page.tsx` before "Platform Funnel"; hides itself if the request is refused |
| Access | **Super Admin only** — segment `server-memory` added to `SUPER_ADMIN_ONLY_ADMIN_SEGMENTS` (`packages/shared/src/constants/admin-access.ts`); Sidebar entry "Server Memory" under Operations |

### How to read it
- **RSS** = what Railway bills. **JS heap used** = live JavaScript objects. **External** = Buffers/native tied to JS. **Native/other** = `rss − heapTotal − external` (Prisma engine, libvips, allocator, loaded code).
- Native/other large → not a JS leak; heap snapshots will not find it. Try `MALLOC_ARENA_MAX=2`, `sharp.cache(false)`, fewer Prisma connections.
- Heap used large → live JS objects; take a heap snapshot (`--heapsnapshot-signal=SIGUSR2`, signal via `railway ssh`, open in Chrome DevTools → Memory).
- Heap total ≫ heap used → uncollected garbage; lower `--max-old-space-size` (try 768).
- A flat RSS line means a high baseline, not a leak; a climbing line over 24 h means a leak.

### Limits
- History lives in the process: **empty after every deploy, restart or wake from sleep.** With sleep mode on, expect gaps.
- Only the API process is measured (not web, not Postgres). Railway's Metrics tab remains the source of truth for billing.
- Not deployed until merged to `main`. Local tests: `admin-server-memory.test.ts` + `admin-access.test.ts` = 14 passed; API and web typecheck clean.
