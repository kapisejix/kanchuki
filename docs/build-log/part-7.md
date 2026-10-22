# Kanchuki — Build Log (part 7)

> Continuation of [`../BUILD-LOG.md`](../BUILD-LOG.md) — started 2026-10-22 because part 6 passed the 150k-char doc limit. Same format: newest entries appended at the bottom.

---

## 2026-10-22 - Admin upload confirm paths verified server-side (RC-075, admin half)

**Branch:** `fix/admin-upload-verify` (stacked on `fix/security-hardening-2` / PR #143, which adds `verifyUpload`'s `prefix` option). No migration, no mobile change.

| Piece | Detail |
|---|---|
| `lib/upload-guard.ts` | `verifyUpload()` gains a prefix-only mode for admin uploads (`{ prefix }`, no `retailerId`; typed as a union so a retailer call still defaults to `retailers/<id>/`). `isOwnedKey()` returns false for an empty prefix, which would otherwise own every key. |
| Studio styles | Create/PATCH verify `thumbnail_r2_key` under `admin/studio-styles/` (10 MB, JPEG/PNG/WebP) and store the server-built `thumbnail_url`; client `thumbnail_url` input removed; `thumbnail_r2_key: null` clears both. |
| Post templates | No key column (no migration), so `thumbnail_r2_key` is an input only: verified under `admin/post-templates/`, the derived URL is stored; `null` clears; client `thumbnail_url` input removed. |
| Background images | `POST /admin/background-images` takes `r2_key` instead of `image_url` (unused `thumbnail_url` dropped), verified under `admin/background-images/` (15 MB). The tone/naming step used to `fetchImageBuffer()` the client URL server-side (SSRF); it now fetches only the server-built R2 URL. |
| Admin showcase designs | Create and photo-replace run `verifyUpload` under `showcase-designs/global/raw/` (the only prefix the admin upload-url mints; 15 MB). `/suggest` keeps a key-only check on the same prefix. Previously any `showcase-designs/*` key passed, including other retailers' raw and final objects. |
| Design references | `image_url` input removed; `r2_key` verified under `admin/design-references/` and the URL derived. No upload-url route or UI exists, so nothing mints those keys yet (`ponytail:` comment in the route). |
| Watermark logo | `PUT /settings/showcase-watermark` verifies a new `logo_r2_key` under `showcase-watermark/logo/` (5 MB) before it is saved and composited onto every design; an unchanged or `null` key skips the check. |
| Admin web | `background-images`, `post-templates`, `studio-styles` pages now send the key (`r2_key` / `thumbnail_r2_key`) instead of `public_url`. Suits-designs and watermark pages already sent keys. |
| Tests | API **2309 passed, 5 skipped** (164 files), web **688/688**, API + web `tsc` clean. New: upload-guard +2, admin-showcase-designs +2 (non-image replace deleted + not watermarked; retailer raw key refused), watermark +1 (foreign key, SVG bytes), studio-styles +2, post-templates +2. The `security.test.ts` / `admin.login.test.ts` suites mock `R2_PATHS` partially, so the admin raw prefix is computed lazily, not at import. |
| Not verified | No live R2, no browser run of the three changed admin pages. Background-images and design-references have no route-level test. |

---

## 2026-10-22 - Upload staging prefix + dead spin-video routes removed (hardening, no RC)

**Branch:** `fix/upload-staging` (stacked on `fix/admin-upload-verify`). No migration, no mobile release. Steps 2 and 3 of [`docs/tasks/pending/r2-orphan-lifecycle.md`](../tasks/pending/r2-orphan-lifecycle.md).

| Piece | Detail |
|---|---|
| Problem | A presigned PUT whose confirm never ran (app killed, 422, abuse) left an object under the same prefix as live photos/logos/KYC, so no R2 lifecycle rule could expire it without deleting live data. |
| `packages/ai` `r2.ts` | New `copyObject(from, to)` (server-side `CopyObjectCommand`, Content-Type carried over). |
| `lib/upload-guard.ts` | `stagingKey(final)` = `uploads/pending/<final>`, `unstagedKey()`, `currentKey()`. `verifyUpload` takes a staged or final key, checks ownership on the FINAL key, inspects the staged object, and on pass copies it to the final key and deletes the staged copy. Returns `{ url, kind, r2Key: final }`. Retry is idempotent: staged gone + final present verifies the final key without a copy. On reject only a staged object is deleted; a final key may be a live object, so it is left alone (behaviour change from RC-075, which deleted any rejected key). |
| Presign routes (12) | Product photo, product video, category image, banner, logo (also bug-report screenshots), KYC, retailer + admin showcase raw, background image, studio-style thumb, post-template thumb, watermark logo now mint `uploads/pending/...` keys; `public_url` points at the staged object so client previews keep working before confirm. `catalog-import` is excluded (its two prefixes get their own 7-day rule). |
| Confirm callers | Every caller stores the RETURNED final key, never the body key: products create/photos/variants, growth videos (dedupe runs after verify, on the final key), categories, profile logo/banner, KYC, bug-report screenshot, retailer + admin showcase designs, studio styles, design references, watermark logo. Admin media and post templates store only the URL, already final. Profile refuses a staged URL sent without a key (it would be stored and then deleted). |
| Pre-confirm readers | `/products/pro-cleanup` accepts staged keys (ownership via `isOwnedKey(unstagedKey(..))`, which also adds the traversal check). A staged raw gives a staged `-pro` output, which product create then verifies and promotes. Retailer + admin showcase `/suggest` read the bytes at `currentKey()`, so a suggest after the confirm (mobile edit screen order) still finds the image. |
| Compression cron | `jobs/compress-r2-images.ts` skips `uploads/pending/`. |
| Promote race (follow-up) | The presigned PUT stays valid until expiry, so a client could overwrite the staged object between the check and the copy and get unchecked bytes promoted. `inspectObject` now returns the object ETag and `copyObject(from, to, ifMatch)` sends `CopySourceIfMatch`; a 412 `PreconditionFailed` rejects the upload and deletes the staged key. Tests: upload-guard +1 (ETag mismatch rejected, staged deleted, final untouched), promote test asserts the ETag is passed. Re-run after: `lib/upload-guard` + `routes/retailers*` 74, `routes/retailers` 203, `routes/admin` 346, `routes/products` 158, `routes/growth` 33, all green; API + `packages/ai` `tsc` clean. R2 support for `x-amz-copy-source-if-match` not checked live. |
| Dead code | `POST /products/:id/spin-video/upload-url` and `/spin-video` deleted (SPIN_360 torn down 2026-08-31; no client calls them), plus `R2_PATHS.spinVideo`, `ALLOWED_SPIN_VIDEO_MIME_TYPES`, `MAX_SPIN_VIDEO_BYTES`. |
| Client check | Mobile and admin web only use presign `public_url` for preview or echo it back; servers rebuild the URL from the verified key. A client that still holds the staged key after saving re-sends it on the next save and hits the retry path. No app release needed. |
| Tests | New: upload-guard +9 (promote, retry after promote, both missing, staged ownership/traversal, reject deletes staged only, final key never deleted on reject, `currentKey`), profile +2 (staged banner promoted and FINAL key/url stored; staged url without key refused). Updated: 4 presign-shape asserts and 4 reject-deletes asserts to staged keys. API `tsc` clean; biome clean on `apps/api`. Full API suite, run in folder chunks for memory: **2317 passed, 5 skipped, 0 failed (164 files)**: jobs + plugins 414 (+5 skipped), lib 506, `routes/admin*` 346, `routes/public*` 309, `routes/billing*` 70, `routes/retailers*` 203, `routes/products` 158, `routes/growth` + `team` + `webhooks` 93, root `routes/*.test.ts` 218 (incl. `auth-team`). `lib/my-style-analysis.test.ts` passed this run (known ioredis `AggregateError` flake). |
| Owner action | Add R2 lifecycle rules in Cloudflare (not applied here): `uploads/pending/` delete after 1 day; `catalog-pdf/` and `catalog-source/` delete after 1 day (owner decision 2026-10-22; first written as 7). Deploy this branch BEFORE the `uploads/pending/` rule matters (the rule is harmless earlier, nothing lives there). |
| Not verified | Nothing run against live R2 (`CopyObject` CopySource encoding, public-bucket serving of `uploads/pending/`) or on a device. Pro cleanup end to end with a staged key not run. Old app builds keep working: they echo whatever key the presign returned. |

---

## 2026-10-22 - Security audit, 5 points: paid-gate lapse, AI/enquiry caps, presign size bound, admin route-guard test (RC-078, RC-079, RC-080)

**Branch:** `fix/security-audit-5pts` (stacked on `fix/upload-staging`; 4 commits, nothing pushed). Spec: [`docs/tasks/pending/security-audit-5-points.md`](../tasks/pending/security-audit-5-points.md). No migration.

| Piece | Detail |
|---|---|
| T1 `b9616811` RC-078 | New hourly `plan-lapse` job (`jobs/plan-lapse.ts`, registered in `jobs/index.ts` with no `repeat.limit`, RC-062). Retailers whose TRIAL ended, or whose PAST_DUE / CANCELLED / COMPLETED period has passed (`plan_expires_at` null or past), drop to STARTER with STARTER `max_products` / `max_customers`; one `auditLog` row each. TRIAL with null `trial_ends_at` is counted and left alone (admin-granted). Cancel keeps access until `plan_expires_at`. |
| T2 `e59d78ff` RC-079 | `/stylist` and `/collections/:slug/enquire` limited to 10/min per IP; 20 s abort on the Claude fetch (lands in the existing fallback); Anthropic/OpenAI SDK clients get `timeout: 60_000, maxRetries: 1`. |
| T3 server `48e84013` RC-080 | `getUploadPresignedUrl` signs an optional `ContentLength`; all 13 presign routes accept optional `content_length` and share `UPLOAD_URL_RATE_LIMIT` (30/min). Optional so old app builds keep working; **nothing is size-bound in production until a client sends it** (`mobile-presign-content-length.md`). |
| T4 part 1 `10fa64ec` | `routes/admin-route-guard.test.ts` enumerates every `/v1/admin` route via `onRoute` and expects 403 without an admin key (login excepted). |
| T4 RLS (no code) | Live check via Supabase Security Advisor + read-only queries: 86/86 public tables have RLS on; 52 are INFO "enabled, no policies" (deny-all for anon/authenticated); `kanchuki_app` and `kanchuki_purge` have `BYPASSRLS`. No migration written. Open WARN: Auth leaked-password protection off (dashboard toggle). |
| Open | Client `content_length` task is blocked on the owner running `packages/ai/scripts/check-r2-content-length.mjs`. No platform-wide daily AI spend cap (needs an owner rupee/day figure). R2 lifecycle rule for `uploads/pending/` is an owner step. |
| Not verified | Nothing against live R2 or a device. `plan-lapse` first production run not watched. |

---

## 2026-10-22 - RC-080 clients: mobile + admin web send `content_length`, enforcement flag, background upload removed

**Branch:** `fix/security-audit-5pts`. Commits `9b2ec714` (mobile), `2909ec4f` (admin web). No migration.

| Piece | Detail |
|---|---|
| Mobile | `prepareImageForUpload(uri, type, {compress?})` in `apps/mobile/src/lib/api/client.ts` compresses once and returns the file that is PUT plus its real size. Every presign call site now does prepare -> presign with that size -> `uploadImageToR2(prep.uri, ..., { compress: false })`. Presign helpers send `content_length` next to `size_bytes`. Settings logo/banner and the bulk / bulk-onboard / catalog-import flows were compressing twice (manipulator, then `uploadImageToR2`); the second pass could change the size after it was signed. Unit test `client.upload.test.ts` (3). Mobile suite 202 pass; `app-config.test.ts` fails on the missing `expo-notifications` module (F-046, pre-existing). |
| Admin web | Six pages send `content_length: file.size`: background-images (removed below), suits-designs, studio-styles, post-templates, watermark logo, photo-cleanup-test. Assertions added to the suits-designs and watermark page tests. 84/84 admin tests. |
| Enforcement flag | `requireContentLengthHook` (`lib/upload-guard.ts`, registered once in `index.ts`) rejects a presign without `content_length` with 422 when `REQUIRE_UPLOAD_CONTENT_LENGTH=true`. It keys off `config.uploadUrl`, which `UPLOAD_URL_RATE_LIMIT` now carries, so it covers all 13 routes with no per-route edit. **Default off**: deploying the code changes nothing for old app builds. Owner sets the env var on Railway after the new mobile build is live. Test `lib/upload-length-required.test.ts` (4). |
| Admin background upload removed | The "Upload background image" control and handler are gone from `/admin/background-images`; list, active toggle, tone override and delete stay. The API route `POST /v1/admin/background-images/upload-url` is untouched and `photo-cleanup-test` still uses it for its test inputs. |
| Owner steps | (1) R2 lifecycle: `uploads/pending/`, `catalog-pdf/`, `catalog-source/` all expire after **1 day**. (2) After the new mobile build is live: set `REQUIRE_UPLOAD_CONTENT_LENGTH=true` on the API. (3) Device test: product photo, logo, banner, KYC, catalog PDF, video; a mismatch shows as R2 403 `SignatureDoesNotMatch`. |
| Not verified | No device or live R2 run of the client change. |
