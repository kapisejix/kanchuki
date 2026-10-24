# R2 orphan uploads — lifecycle rule proposal

**Status:** Steps 2 and 3 built on branch `fix/upload-staging` (2026-10-22, not merged or deployed; see `docs/build-log/part-7.md`). Step 1 and the `uploads/pending/` rule are owner actions, **not applied**. Written 2026-10-22.
**Source of truth for keys:** `R2_PATHS` in `packages/shared/src/constants/index.ts` and the presign routes listed below (read on branch `fix/admin-upload-verify`, which holds the latest confirm-step code).

## Problem

Every upload is a presigned PUT: the API mints a key, the client PUTs bytes straight to R2, then calls a confirm route that runs `verifyUpload` and writes the DB row. If the client never confirms (app killed, network drop, 422 on confirm such as the HEIC case, or abuse), the object stays in R2 with nothing pointing at it. Presigned PUTs cannot cap size, so an unconfirmed key can hold whatever the client sends within the 5-minute URL lifetime.

## The constraint that decides the design

An R2 lifecycle rule matches on **key prefix + object age only**. It cannot see the DB. Today a confirmed object keeps the key it was uploaded to, so for almost every prefix the live (confirmed) objects and the orphans sit under the **same prefix**. A prefix + age rule there deletes live retailer photos, logos and KYC documents — the 2026-08-11 incident shape (BUILD-LOG §26). So:

- A lifecycle rule is safe **only** on prefixes where nothing is kept after the request.
- Everything else needs a code change first (a staging prefix) before any rule can touch it.

## Every presigned upload prefix

| Presign route | Key (`R2_PATHS` helper) | Confirm route (`verifyUpload`) | Live objects share the prefix? | Lifecycle-safe today? |
| --- | --- | --- | --- | --- |
| `products/products-media.ts:50` | `retailers/{rid}/products/{pid}/{id}.ext` (`productPhoto`) | `products-media.ts:93`, also `products-crud.ts:53`, `products-variants.ts:32` | Yes | **No** |
| `products/products-media.ts:138` | `retailers/{rid}/products/{pid}/spin/video.mp4` (`spinVideo`) | **None** — confirm route returns `spin_status: 'removed'` (SPIN_360 torn down) | Same product prefix | **No** — delete the route pair instead (Step 3) |
| `growth/growth-videos.ts:54` | `retailers/{rid}/products/{pid}/videos/{id}.ext` (`productVideo`) | `growth-videos.ts:93` | Yes | **No** |
| `categories.ts:77` | `retailers/{rid}/categories/{id}.ext` (`categoryImage`) | `categories.ts:42` | Yes | **No** |
| `retailers/retailers-uploads.ts:31` | `retailers/{rid}/banner/{id}.ext` (`retailerBanner`) | `retailers-uploads.ts:127` / `retailers-profile.ts:211` | Yes | **No** |
| `retailers/retailers-uploads.ts:59` | `retailers/{rid}/logo/{id}.ext` (`retailerLogo`) | same | Yes | **No** |
| `retailers/retailers-uploads.ts:94` | `retailers/{rid}/kyc/{doc}/{id}.ext` (`retailerKyc`) | same | Yes | **No** (KYC — see note below) |
| `retailers/retailers-showcase-designs.ts:176` | `showcase-designs/{rid}/raw/{id}.ext` (`showcaseDesignRaw`) | `retailers-showcase-designs.ts:65` | Yes — `raw/` is kept: `jobs/rewatermark-showcase-designs.ts` re-reads it when the logo changes | **No** |
| `admin/admin-showcase-designs.ts:223` | `showcase-designs/global/raw/{hash}.ext` | `admin-showcase-designs.ts:64` | Yes (same reason) | **No** |
| `admin/admin-media.ts:91` | `admin/background-images/{hash}.ext` | `admin-media.ts:115` | Yes | **No** |
| `admin/admin-studio-styles.ts:91` | `admin/studio-styles/{hash}.ext` | `admin-studio-styles.ts:17` | Yes | **No** |
| `admin/admin-post-templates.ts:89` | `admin/post-templates/{hash}.ext` | `admin-post-templates.ts:18` | Yes | **No** |
| `admin-settings/showcase-watermark.ts:158` | `showcase-watermark/logo/{hash}.ext` | `showcase-watermark.ts:94` | Yes | **No** |
| `catalog-import.ts:134` | `catalog-pdf/{rid}/{hex}.pdf` (literal, not in `R2_PATHS`) | None — input only; `/catalog-import/import-pdf` reads it once via `ssrfSafeFetch` | **No** — nothing stores this key | **Yes** |
| `catalog-import.ts:134` | `catalog-source/{rid}/{hex}.ext` (literal) | None — input only; `/catalog-import/detect-items` reads it once | **No** — crops go to `catalog-import/{rid}/` (`packages/ai/src/detector.ts:41`) | **Yes** |

Not presigned (server-written, out of scope): `catalog-import/` crops, `studio/` shots, `invoices/subscription/`, `admin/photo-cleanup-tests/`, `tryon-results/`, `measurements/` (no route writes it after the teardown).

`admin/design-references/` has a confirm route (`admin-design-references.ts:20`) but no presign route, so no orphans can exist there yet.

## Proposal

### Step 1 — apply now (owner: Cloudflare dashboard → R2 → bucket → Settings → Object lifecycle rules)

| Rule name | Prefix | Action | Age |
| --- | --- | --- | --- |
| `catalog-pdf-expire` | `catalog-pdf/` | Delete objects | 7 days |
| `catalog-source-expire` | `catalog-source/` | Delete objects | 7 days |

Both are read during the request right after the upload, so 1 day would be safe; 7 days leaves room to re-run a failed import. Shorten later if storage matters.

Check before applying: confirm nothing else writes under `catalog-pdf/` or `catalog-source/`. Code search on 2026-10-22 found nothing else (`compress-r2-images.ts` only excludes `catalog-pdf` from compression).

### Step 2 — code change ✅ built 2026-10-22 (`fix/upload-staging`, not deployed)

Presign to a staging key; the confirm route moves it to the final key:

1. Presign routes mint `uploads/pending/{final-key}` instead of the final key.
2. Confirm route runs `verifyUpload` on the pending key, `HeadObject`s it and refuses anything over the route's byte limit, then server-side `CopyObject` to the final key and deletes the pending object. The DB row stores the final key only.
3. One lifecycle rule: prefix `uploads/pending/`, delete after **1 day**.

This also closes the "presigned PUT can't cap size" gap: an oversized PUT never becomes a live object and expires within a day.

Cost: one copy per upload (R2 Class A op) and one extra round trip on confirm. Touches every presign/confirm pair above plus `upload-guard.ts`.

As built: `stagingKey()` / `unstagedKey()` / `currentKey()` in `apps/api/src/lib/upload-guard.ts`, `copyObject()` in `packages/ai/src/r2.ts`. The size check is the existing `verifyUpload` `maxBytes` (it reads the size from the ranged GET), not a separate HeadObject. Retry after a promote verifies the final key. Pro cleanup and showcase `/suggest` read staged keys before confirm. The compression cron skips `uploads/pending/`. The table above still lists the FINAL key shapes; presign routes now return them under `uploads/pending/`.

**Owner, after deploy:** add the rule `uploads/pending/` → delete after **1 day** (Cloudflare dashboard → R2 → bucket → Settings → Object lifecycle rules). Not applied by the agent.

### Step 3 — delete dead code ✅ built 2026-10-22 (`fix/upload-staging`)

`POST /products/:id/spin-video/upload-url` and `POST /products/:id/spin-video` still mint a presigned PUT for a feature removed in the 2026-08-31 teardown; the confirm route does nothing. No client calls either (searched `apps/` and `packages/` 2026-10-22). Every object it creates is an orphan. Delete both routes and the `spinVideo` helper.

## KYC note

Unconfirmed `retailers/{rid}/kyc/` objects are identity documents (Aadhaar, GST) with no DB row, so account deletion and the Deletion Vault cannot find them. Step 2 is the fix: once deployed and the `uploads/pending/` rule is on, an unconfirmed KYC upload expires in a day. Objects left from before the deploy are still only findable by listing the bucket. Flag for SECURITY.md review (§12–18 are human-review sections, not edited here).

## Not verified

- Nothing run against live R2; no orphan counts. The Storage Report page (BUILD-LOG §22) would give real numbers.
- Whether any plan currently has `SPIN_360` enabled (DB, not checked).
