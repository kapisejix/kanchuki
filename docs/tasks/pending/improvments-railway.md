# Railway cost & memory improvements

**Opened:** 2026-10-09 · **Status:** partly done, rest waiting on owner decisions · **Trigger:** Railway memory bill after 24 Sep 2026

---

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
- Something requests the web app about every 2 minutes (`GET /v1/public/theme`, called from `apps/web/src/app/layout.tsx:105`). The caller is **not identified** (uptime monitor or bots). While it runs, the web service never idles.
- Railway only sleeps a service after ~10 min with **no outbound traffic**. The API's permanent Redis connection (BullMQ) counts as outbound traffic → **the API will probably never actually sleep**.

## 3. What was NOT proven (be honest)

- **The exact cause of the 1.2 GB.** Static imports of the API measure only ~135 MB locally; the other ~1.2 GB is runtime. Needs a memory reading from the live API.
- **That 24 Sep changes caused it.** Railway tooling here returns summaries only (no time series) and CLI 5.26 has no `api` command. No dependency or Dockerfile change landed 18 Sep–2 Oct. Not confirmed either way.
- **Whether removing background removal lowers memory.** It is the leading suspect (an ONNX ML model + `sharp`), but unmeasured.

## 4. What changed — done

### 4.1 Railway settings (production, reversible in dashboard)
- `sleep_application = true` on **web** (`magnificent-liberation`) and **API** (`supportive-love`).
- ⚠ Cron jobs (03:00 backup, referral accrue/payout on the 30th, GST reconciliation) do **not** run while the API sleeps.
- ⚠ First request after sleep is slow (cold start).
- ⚠ API probably never sleeps (see §2). If so, the real fix is item 11 in §8.

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

I removed `@imgly/...` from `packages/ai/package.json`, but `pnpm-lock.yaml` still lists it (3 references). The two now disagree → **the Railway build will fail** until the lockfile is regenerated.

**Pending step (owner-run):** from `E:\Kanchuki`
```
pnpm install --lockfile-only --ignore-scripts
```
then commit `pnpm-lock.yaml`. My two attempts failed: one on an npm registry network error (`ERR_PNPM_META_FETCH_FAIL`), one was killed by the system for low memory. Do not push the package.json change without the lockfile.

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
| 1 | Regenerate `pnpm-lock.yaml` (§6) | **blocking deploy** — owner/after freeing RAM |
| 2 | Mobile UI for removed features | **not touched**: photo-control screens (`ProductPhotoControls.tsx`, `useProductAiStudio.ts`, `productApi.cleanupPhoto/setBackground/listBackgroundImages`) and the "auto-clean" switch + shadow chip in `product/add.tsx` still call the removed routes → they return 404. Needs a removal pass. |
| 3 | Admin pages for backgrounds / photo cleanup | not checked (`apps/web/src/app/admin/photo-cleanup-test`, background-image admin) |
| 4 | DB columns/tables (`background_image_id`, `add_shadow`, `BackgroundImage`) | left in place — dropping needs a migration, which only the owner may approve |
| 5 | Docs: `CLAUDE.md` index rows (#31, #33, #35, #53 mention these features), `docs/BUILD-LOG.md`, `docs/PRO-REQUIREMENTS.md`, `docs/PLAN.md` | **not updated** — `CLAUDE.md` needs explicit owner approval to edit |
| 6 | Sharp removal from non-compress/watermark features (§7) | **DONE 2026-10-09** (rotate, crop/multi-detect, ranking, duplicate detection, colour auto-fill). Tests: API products/load-test 76 passed, `@kanchuki/ai` 90 passed, typecheck clean. |
| 6b | Mobile removal pass | **DONE 2026-10-09.** Removed: colour-detect (button/chip in `ProductMediaCarousel`, `useProductDetailForm`, calls in `add-color.tsx`/`add-photos.tsx`), background + shadow controls in `ProductPhotoControls` (**Set as Main kept**), `useProductAiStudio` bg/shadow state, add-product Auto-clean / Shadow / Background picker + pro-options backdrop picker, duplicate badge + `phash`/`is_duplicate` fields, `productApi.cleanupPhoto/getBackgroundImages/setBackground/rotatePhoto/detectColor`. Server `catalog-import` no longer returns `phash`/`is_duplicate`/`duplicate_of_product_id`. Mobile `tsc` + eslint clean, API 84 tests, AI 90 tests. **Kept on purpose:** client-side pre-save rotate (expo ImageManipulator, no server), Pro cleanup path (hanger removal + tight crop via the separate photo-cleanup sidecar — not sharp/imgly; say if you want it removed too). |
| 7 | Three Postgres services | **ON HOLD** (owner will review). Not touched. Before deleting any: find the one `DATABASE_URL` points to; the others each cost ~50 MB + a volume. Take a backup first. |
| 8 | Lower `--max-old-space-size` (now 1536 in `apps/api/Dockerfile`) | not done; a cheap test of whether the 1.3 GB is real or uncollected garbage (try 768) |
| 9 | Find who calls `/v1/public/theme` every 2 min | not identified |
| 10 | Exact memory culprit | unproven; re-measure Railway after this change deploys |
| 11 | Stop idle workers/crons (owner ask: "only run on request") | partly addressed by sleep mode; the true fix is a separate worker service or removing BullMQ workers from the web-facing API |

## 9. Safety notes

- Nothing was committed, pushed or deployed by this work. All code edits are local on branch `feat/nearby-stores`.
- No production env vars, database, or Postgres service were changed. Only the two `sleep_application` flags (§4.1).
- Do **not** deploy with `railway up`; deploy only via GitHub push (project policy, `docs/DEPLOY.md`).
