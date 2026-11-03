# Kanchuki — Build Log (part 7)

> Continuation of [`../BUILD-LOG.md`](../BUILD-LOG.md) — started 2026-10-22 because part 6 passed the 150k-char doc limit. Same format: newest entries appended at the bottom.

---

## 2026-10-22 - Payment link signature 4-part only, exact subscription charge check

**Branch:** `fix/payment-verify-strict` (stacked on `fix/security-hardening-2` / PR #143, which touches the same billing helpers). Hardening, not a bug fix: no RC. No migration, no client change.

| Piece | Detail |
|---|---|
| `verifyPaymentLinkSignature` | Accepts only Razorpay's documented form, HMAC over `link_id\|reference_id\|status\|payment_id` with `status === 'paid'`. The 2-part `link_id\|payment_id` form is gone: Razorpay never signed it (it was this repo's own guess in `7446671a`), and it has the same shape and key secret as a Standard Checkout order signature (`order_id\|payment_id`), so an order signature could pass as a payment-link one. A missing status is now a reject. |
| Callers | `GET /billing/addon-callback` and `GET /public/catalog-upload-tickets/:id/payment-callback` make one call each instead of the 4-part-then-2-part fallback. No client code calls either route, only Razorpay's redirect. |
| Webhook amount | `subscription.charged` activates only when the captured INR amount is exactly `computeSubscriptionGst(base).gross` (base + 18% GST), not `>= base`. A base-only or wrong-plan charge used to activate and write a GST invoice whose base/GST split did not match the money taken. A refused **captured** payment now raises a Sentry alert (`area: billing-webhook`); before, it was a log line only, the RC-071 shape. |
| Subscribe guard | `POST /billing/subscription` fetches the Razorpay plan and refuses with 503 `PLAN_PRICE_MISMATCH` (+ Sentry) when its fixed amount is not `plan_pricing` base + GST. Without this, an admin price edit with no new Razorpay plan would charge new subscribers and then have the exact webhook check refuse them. One extra Razorpay GET per subscribe. |
| `admin-plans` | `setup-plans` computes the plan gross with the same `computeSubscriptionGst` helper instead of `Math.round(base * 1.18)`, so plan creation, subscribe guard and webhook share one formula. The plan-pricing PUT comment says a price change needs `setup-plans` + new plan ids. |
| Tests | billing signatures +3 (tampering, 2-part rejected with and without status, empty-key forgery on 4-part), webhook refusal table +2 (base-only, overpaid by 1 paisa), subscribe guard +2 (stale plan amount → 503 and no Razorpay subscription; matching amount → created). Add-on callback tests now sign the 4-part form. Full API suite (run in folder chunks, low memory): 164 files, 2305 passed, 5 skipped, 0 failed; `tsc --noEmit` clean; biome clean on the 9 changed files. `lib/my-style-analysis.test.ts` failed once on an ioredis connect `AggregateError` and passed on rerun (flaky, unrelated). |
| Owner action | After any `plan_pricing` edit: Admin → setup-plans, then set the new `RAZORPAY_PLAN_*_MONTHLY` ids, or that plan's subscribe returns 503. Before #142 the callbacks accepted only the 2-part form, so any real payment-link callback would have returned 401; if add-ons or catalog uploads were ever paid through a link in prod, check those rows for missing credit. |
| Not verified | Nothing run against live Razorpay. The catalog-upload payment-callback has no route-level test (the signature rule is covered by the helper unit test). |

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

## 2026-10-22 - Security audit, 5 points: paid-gate lapse, AI/enquiry caps, presign size bound, admin route-guard test (RC-082, RC-079, RC-080)

**Branch:** `fix/security-audit-5pts` (stacked on `fix/upload-staging`; 4 commits, nothing pushed). Spec: [`docs/tasks/pending/security-audit-5-points.md`](../tasks/pending/security-audit-5-points.md). No migration.

| Piece | Detail |
|---|---|
| T1 `b9616811` RC-082 | New hourly `plan-lapse` job (`jobs/plan-lapse.ts`, registered in `jobs/index.ts` with no `repeat.limit`, RC-062). Retailers whose TRIAL ended, or whose PAST_DUE / CANCELLED / COMPLETED period has passed (`plan_expires_at` null or past), drop to STARTER with STARTER `max_products` / `max_customers`; one `auditLog` row each. TRIAL with null `trial_ends_at` is counted and left alone (admin-granted). Cancel keeps access until `plan_expires_at`. |
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

---

## 2026-10-24 - Ghost-mannequin removed (#155) + per-size product stock (#154) + RC-080 content_length required (#152)

**Merged to `main`:** #152 `0e85aea7`, #153 `77f77256`, #155 `05fe4a90`, #154 `642a11ae`. Migration 137 applied in prod (owner; `product_stock` seen read-only 2026-10-24, 0 rows, RLS on).

| Piece | Detail |
|---|---|
| #152 RC-080 | `content_length` is now required on every presign route; the `REQUIRE_UPLOAD_CONTENT_LENGTH` flag and hook are deleted. Old app builds that omit it get 422. |
| #155 ghost-mannequin removal | F-001e Snappyit plan docs, `GHOST_MANNEQUIN_AI` plan key in code, the local LaMa `--ghost-mannequin` mode (`scripts/batch-clean-photos.py`, `services/photo-cleanup`, admin test page control) and marketing copy removed. Kept: LaMa model (`--remove-hardware` uses it), `P_GHOST` preset in `studio-effects.ts`, `docs/ai-studio` research, Prisma enum value `GHOST_MANNEQUIN_AI` (marked deprecated; dropping it needs an owner-applied migration). |
| #154 product stock | Migration `137_product_stock` (see DATABASE.md). API `lib/product-stock.ts` + `products-crud.ts` + `catalog-import.ts`: POST defaults 1 per selected size, PUT replaces, GET list/detail return `stock` + `total_quantity`, PATCH status SOLD zeroes stock. Mobile `StockEditor.tsx` on add/edit product; catalog card shows `Stock: N` / `Low stock: N` (<= 2). The edit form sends `stock` only after the retailer touches it, so saving an old untracked or SOLD product never re-lists it. Spec: `docs/tasks/pending/product-stock-quantity.md`. |
| Owner steps | New EAS build for the stock UI; device-test add (default 1 per size), edit counts, mark sold, edit an old SOLD product's price. Run the admin photo-cleanup test page once to confirm blur/composite/hardware modes after #155 deploys. |
| Not verified | No device run of the stock UI. A prompt-based ghost style may exist only as a live-admin `studio_styles` row; not found in the seed migrations. |

---

## 2026-10-24 - Background-removal removal documented + `IMAGE_CROP` quota dropped from catalog import

**Branch:** `chore/catalog-import-drop-image-crop-quota`. No migration. The removal itself shipped 2026-10-09/10 (#49 `f1148360`, #50 `59f9fa59`); this entry is the missing BUILD-LOG record.

| Piece | Detail |
|---|---|
| What was removed (#49/#50) | `@imgly/background-removal-node` and its ONNX runtime from `packages/ai`; `cleanupProductPhoto`, shadow/contrast backdrop, `detectItems` crop, `phash` duplicate detection, colour auto-fill, photo rotate route; mobile Auto-clean/Background/Shadow/colour-detect controls. API RSS 1.34 → 0.14 GB. Kept: `sharp` for compress, watermark and image-quality; the Pro cleanup route and sidecar. Detail: `docs/tasks/pending/improvments-railway.md` §0, §4, §7. |
| Quota change | `POST /catalog-import/detect-items` and `/import-pdf` no longer check or increment `IMAGE_CROP`: `detectCropAndTag` uploads the photo as-is, so nothing is cropped. `AI_TAGGING_CALL` (the real cost gate) and `PRODUCT_UPLOAD` are unchanged. Pro cleanup (`products-pro-cleanup.ts`) still checks and increments `IMAGE_CROP`, since it does crop. |
| Effect | `IMAGE_CROP` is not seeded in `plan_limits`, so it was unlimited by default and the old check never blocked anyone. A retailer with an admin per-retailer `IMAGE_CROP` override is no longer limited by imports. Usage counters for imports stop growing. Existing rows untouched. |
| Not verified | No live import run. No test covered the removed quota calls. |

---

## 2026-10-25 - Billing decision sheets answered + Admin AI Usage per-retailer grid

**Branch:** `feat/admin-ai-usage-per-retailer`. No migration, no API change.

| Piece | Detail |
|---|---|
| Owner answers (`docs/tasks/pending/decision-sheets-2026-10-24.md`) | Sheet 1 prorated switch: **A** (keep Model A, revisit after ~10 paying retailers). Sheet 2 coupons: **A** (none at launch, use the trial). Sheet 3 AI credits: **B** (visibility only; full build when a retailer asks to buy more). |
| Sheet 3 B build | `apps/web/src/app/admin/ai-usage/page.tsx`: client-side rollup of the existing `/v1/admin/ai-usage` rows into a "Per retailer" table (tagging calls, tagging % of the plan's LIFETIME `AI_TAGGING_CALL` limit from `/v1/admin/plan-limits`, Studio shoots, estimated ₹ cost) sorted by cost, plus an "Estimated cost (all time)" card. Unit costs are the spec's (₹0.33/tagging call, ₹3.5/Studio shoot), hard-coded and labelled as estimates. Both endpoints are Super-Admin-only. |
| Limits of the numbers | Tagging calls include colour/item detect; the real quota counter may differ. Studio has no % (its limit is monthly, the page reads all-time). Tagging cost uses the Claude figure, so it over-estimates gpt-4o-mini. |
| Not verified | web `tsc` + eslint clean; no browser check. |

---

## 2026-10-25 - F-036 Phase B: customer Web Push for new arrivals

**Branch:** `feat/f-036-web-push`. Migration `138_customer_push_subscriptions` (applied in prod 2026-10-25: owner ran the first draft, then the `passport_session_id` column + FK; `_prisma_migrations` row inserted by hand). New API dependency `web-push@3.6.7`.

| Piece | Detail |
|---|---|
| Schema | `CustomerPushSubscription` / `customer_push_subscriptions` (see DATABASE.md). Store eligibility comes from `CustomerStoreVisit` at send time, not a per-store row. |
| API routes | `routes/public/passport/passport-push.ts`: `GET /push/key` (`public_key: null` without VAPID), `POST /push/subscribe` (session, push-host allowlist against SSRF, upsert by endpoint, `PUSH_SUBSCRIBED` consent event, 10/min), `POST /push/unsubscribe` (own account only, `PUSH_UNSUBSCRIBED`). `passport-data.ts` delete disables all of the account's subscriptions. |
| Send job | `jobs/customer-push.ts` `handleNewArrivalsPush`, maintenance job `customer-new-arrivals-push`, cron `0 13 * * *` UTC. One push per store per day with new `AVAILABLE` products, 2/store/week cap (Redis `cpush:cap:<retailer>`, 7-day TTL), 404/410 soft-disables. No-op without VAPID keys. |
| Web | `sw.ts` `push` + `notificationclick` (same-origin paths only); `lib/web-push.ts`; `components/PushOptIn.tsx` on `/my-stores`; passport proxy allowlist gains `push/key`, `push/subscribe`, `push/unsubscribe`. |
| Deviations from spec §7 | Daily digest, not one push per upload; new collections not pushed (no public flag); subscription per browser, not per store. |
| Tests | API: `customer-push.test.ts` (allowlist, recipient filter, cap, 410 prune; mute-filter test falsified), `passport-push.test.ts`, delete test extended, migration 138 guard. Web: `PushOptIn.test.tsx`. API 2397 passed, web 702 passed, both `tsc` clean. |
| Owner steps | ~~Apply migration 138~~ (done 2026-10-25). `npx web-push generate-vapid-keys`; set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` on the API service. Android phone: open `/my-stores`, tap the button, add a product, wait for the 18:30 IST run. |
| Security review fixes | Row stores `passport_session_id` (FK, `ON DELETE SET NULL`); the job requires that session unrevoked and unexpired, so logout on the device stops its pushes. Rebinding another account's endpoint needs matching keys, else 409 `ENDPOINT_TAKEN`. |
| Not verified | No real push sent; no browser or device run; no real VAPID keys. Export omits subscriptions; no web mute toggle (Phase D). |

---

## 2026-10-25 - Referral-link prefill in the retailer app (launch 5B.2/5B.3)

**Branch:** `feat/referral-link-prefill`. No migration, no API change.

| Piece | Detail |
|---|---|
| Capture | `apps/mobile/src/lib/referral-capture.ts`: `parseReferralCode` pulls `ref` from the raw URL by regex (RN's URL polyfill has no `searchParams`), uppercases it, accepts `[A-Z0-9-]{3,20}`; stored as `{code, at}` under SecureStore key `pending_referral_code`, ignored after 30 days. `app/_layout.tsx` `AppContent` runs `Linking.useURL()` and captures on cold and warm starts, before login (onboarding is auth-protected, so expo-router can't hand it the param). |
| Prefill | `app/onboarding.tsx` fills the referral field on mount only when it is empty, never submits, and clears the stored code after a successful step-1 save. Server validation unchanged (`retailers-profile.test.ts`, `referral-codes.test.ts`). |
| Not built | Play Install Referrer: no Play listing yet. |
| Tests | `referral-capture.test.ts` 14/14; mobile `tsc` shows only the 3 pre-existing typed-route errors; eslint clean on changed files. |
| Not verified | No device run. Needs an EAS build, then `kanchuki://onboarding?ref=CODE` on a logged-out phone. |

---

## 2026-10-25 - Passport redesign: Royal Orchid /my-profile, /my-stores, /my-style

**Branch:** `feat/passport-redesign-pilot` (PR #174). No migration, no API change, no new dependency.

| Piece | Detail |
|---|---|
| Palette | Customer passport pages move to the retailer app's Royal Orchid palette (lavender surfaces, spaceCadet text, heliotrope secondary, fuchsia accent). `apps/web/tailwind.config.ts` gains `heliotrope-400` (`#7F5F87`, 5.4:1 on white); the pilot used the class before the shade existed, so it produced no CSS. |
| Shell | `(shopper)/layout.tsx`: frosted sticky header, segmented My Style / My Profile / My Stores control with 44px targets, `MotionConfig reducedMotion="user"`. |
| Shared blocks | `(shopper)/ui.tsx`: card, buttons, input, select, `chip()`, `segment()`, skeleton, motion variants, `Section`, `IconTile`, `Notice`. One copy for all three pages. |
| /my-profile | Card layout. Personalization is a switch painted over the same native checkbox; RC-083 loading, RC-026 `res.ok` check and the e2e `uncheck()` unchanged. |
| /my-stores + `PushOptIn` | Store rows as cards; selectors, "hasn't published a catalog page yet" copy and all four F-036 push states unchanged. Only the card of an unpublished store is faded, not its explanation (contrast fix found in the 360px screenshots). |
| /my-style | Tabs as a segmented control; Sort + Near me in one scrolling chip bar. Below 640px budget / size / occasion / distance move into a `Sheet`; exactly one labelled `<select>` per filter exists. Card skeletons, `Notice` empty/error states, 44px Shortlist heart (accessible name "Shortlist"). F-045 ranking, filters and RC-070 mapping untouched. |
| Tests | web `tsc` clean; (shopper) vitest + `PushOptIn.test.tsx` 163/163, no test edited; `next lint` warnings only. Customer e2e (customer-my-stores, customer-stores-directory, customer-my-style-analyze) 30/30 against a local prod build. 360px screenshots of all three pages: no horizontal page scroll, segment tabs and store rows at least 44px. CI green: quality, unit-web, build, e2e-web. |
| Left out | `components/InstallPrompt.tsx` keeps amber/stone: it is shared with the storefront and only renders after `beforeinstallprompt`. Separate follow-up PR. |
| Not verified | No real phone or real browser session; screenshots come from Playwright Chrome with stub API data. The nominee phone placeholder ("Nominee's 10-digit mobile number") is cut off at 360px; left as is, small copy follow-up. The /my-style chip bar scrolls sideways by design, so "Near me" is partly hidden until scrolled. |

---

## 2026-10-25 - InstallPrompt moved to Royal Orchid

**Branch:** `feat/installprompt-royal-orchid`. No migration, no API change. Follow-up to the passport redesign (PR #174).

| Piece | Detail |
|---|---|
| Change | `components/InstallPrompt.tsx`: amber/stone panel becomes a lavender-50 panel with spaceCadet/heliotrope text; install button uses `BTN_SECONDARY`, "Not now" is a quiet heliotrope text button; both 44px targets. Copy, `beforeinstallprompt` capture, dismiss and `appinstalled` logic unchanged. `(shopper)/ui.tsx` now exports `FOCUS`. |
| Where it shows | /my-stores and the storefront `PassportSheet` (under "Enter catalog"). Secondary, not the gradient primary, so it does not compete with entering the catalog. |
| Tests | web `tsc` clean; InstallPrompt + install-prompt + (shopper) + PushOptIn vitest 192/192, no test edited; eslint clean. |
| Not verified | No screenshot taken and customer e2e not re-run locally (CI e2e-web only). No device run of the real install prompt. |

## 2026-10-25 - /my-profile nominee placeholder shortened

Placeholder "Nominee's 10-digit mobile number" cut off at 360px; now "Nominee's mobile number" (`(shopper)/my-profile/page.tsx`). Copy only; the input still strips to 10 digits and the aria-label is unchanged. Closes the follow-up in the passport redesign "Not verified" row.

## 2026-10-26 - Google place-id capture, "Complete your profile" checklist, Google Business Profile reviews (dark)

**Branch:** `fix/team-otp-fail-closed-rc085`. Spec: `docs/tasks/pending/google-business-profile-and-setup-checklist.md`. Migrations 140–143 written, **none applied** (apply 139 → 143 in order, each its own run).

| Piece | Detail |
|---|---|
| Part A: place id | `packages/shared/src/google-place.ts` `parseGooglePlaceId` (pasted review link or `ChIJ…` → id). `PATCH /v1/retailers/reviews/google-place` now validates through it; owner-only `GET /v1/retailers/me/google-place/search` calls Google Places (paid, 10/min, needs `GOOGLE_PLACES_API_KEY`). Mobile `GooglePlaceField` sits inside onboarding step 2 (still 5 steps), Settings → Google Listing and the ratings screen. The ratings "Google review link" button is wired (its `onPress` was commented out). |
| Part C: checklist | Migration 143. Owner-only `GET /me/setup-checklist`, `POST …/dismiss\|restore`, `POST …/:item_key/ask`; item status is derived from real data, never stored. "Ask Kanchuki team" makes a routed `GROWTH_SETUP` ticket with `support_tickets.setup_item`; one open ask per item (partial unique index); setup tickets do not count toward the 5-open-ticket cap. Mobile `SetupChecklist` block on Home. `setup_item` shows as a chip in the admin ticket table (`/admin/support-tickets`) and a "Setup: …" line on the staff ticket card, from `GET /v1/team/tickets`. |
| Part B: Google reviews (dark) | Migrations 140–142. Shared Kanchuki Google identity: Super Admin connects it and flips "API approved" in `/admin/gbp`; the marketing team links each consenting retailer to a location from the identity's own list (the retailer never supplies ids). Retailer `/me/google-business/status\|request\|reviews\|reviews/:id/reply\|link`, all owner-only; reply order is gate → own link → own review → quota → Google → only then write + count. `lib/gbp-sync.ts` + 6-hourly `jobs/gbp-review-sync.ts` (no `repeat.limit`, RC-062) + 30-day purge through the purge client. Plan key `GOOGLE_BUSINESS_PROFILE` (no row = OFF) and `GBP_REVIEW_REPLY` quota 20/100/500. Mobile `growth/integrations/google-business.tsx` (UNAVAILABLE = "Coming soon", no action), Google tab on ratings. |
| Removed | Legacy token-paste GMB: API routes + `gmb` block of `GET /me/integrations`, mobile `gmb.tsx`, `configureGmb/testGmb/disconnectGmb` (RC-101). `retailers.gmb_*` columns left in place. |
| Bug found | Mobile review calls used `/v1/retailers/me/reviews/*`; the API serves `/v1/retailers/reviews/*` (RC-100). |
| Tests | API `tsc` clean; full vitest 2565 passed / 5 skipped; web `tsc` clean; mobile 218 passed (+ the pre-existing `__DEV__` suite failure in `smoke/rc-screens.test.tsx`); mobile `tsc` shows only the pre-existing `/enquiries` and `/enquiry-try-on` route-type errors. New: `google-business.test.ts`, `admin-gbp.test.ts`, `retailers-google-business.test.ts`, `retailers-setup-checklist.test.ts`, `retailers-ratings.google-place.test.ts`, `team-tickets.test.ts`, `google-place.test.ts`, mobile `google-listing.test.ts`. |
| Not verified | Nothing has run against real Google (no OAuth client, no `business.manage` API access yet). No device test, no browser check of `/admin/gbp`. Migrations not applied. |
| Owner steps | Google Cloud project + OAuth client + Business Profile API access request, Places API key; env vars `GOOGLE_PLACES_API_KEY`, `GOOGLE_GBP_CLIENT_ID`, `GOOGLE_GBP_CLIENT_SECRET`, `GOOGLE_GBP_REDIRECT_URI`, `GBP_MANAGER_EMAIL`; then a Super Admin connects Google and enables `GOOGLE_BUSINESS_PROFILE` per plan only after Google approves. |

## 2026-10-31 - Dead `retailers.gmb_*` columns dropped from the schema (RC-159 drift cleanup)

| Area | Change |
|---|---|
| Schema | Six `gmb_*` fields removed from the `Retailer` model in `packages/db/prisma/schema.prisma` (`gmb_account_id`, `gmb_location_id`, `gmb_access_token`, `gmb_refresh_token`, `gmb_token_expiry`, `gmb_configured_at`). Nothing read or wrote them since RC-101. |
| Migration | `146_drop_gmb_columns` drops them with `IF EXISTS` (only `gmb_configured_at` ever had a migration, 071). Written, NOT applied by the agent. Owner ran the check first: zero rows held a value in any of the six. |
| Code | `RETAILER_SECRET_FIELDS` no longer lists the two gmb tokens; fixtures in `retailers-dto.test.ts`, `retailers-me-features.test.ts`, `retailers-profile.test.ts` updated. New test in `retailers-dto.test.ts`: the Retailer model has no `gmb_` column (red first as `it.fails`, falsified by injecting a `gmb_probe` column). |
| Tests | API `tsc` clean; full API vitest 2859 passed / 9 skipped; API biome lint 0 errors (2 pre-existing warnings in `passport-otp.test.ts`); `prisma validate` and `generate` OK. |
| Not verified | Migration 146 not applied and not replayed on a scratch DB. Order is safe either way: Prisma ignores extra DB columns, so the code can deploy before 146 is applied. No RC minted (cleanup, not a bug); progress noted under RC-159. |

## 2026-11-02 - In-app "Report this AI content" buttons (Google Play AI-Generated Content policy)

| Area | Change |
|---|---|
| Trigger | A developer reported a Play rejection for apps with AI output but no in-app report/flag. Kanchuki only had the generic Settings "Report a Problem". |
| Mobile | `ReportProblem` takes `aiContent` (retitles the sheet, prefixes the description `[AI content report: feature · id]`, no image attached). New `ReportAiContent` button on: AI Studio Shoot result, retailer try-on result, in-store enquiry try-on gallery, composer AI caption, scheduler caption. No API or migration change (reuses `/v1/retailers/me/bug-reports`). |
| Tests | New source-pin test `__tests__/ai-content-report.test.ts`; shared setup gained an `expo-image-picker` mock. Mobile `tsc` clean, vitest 543/543. |
| Not verified | No device test, no EAS build. Web PWA surfaces, admin triage and the Play Console declaration are open - see `docs/tasks/pending/ai-content-reporting.md`. Videos skipped on purpose (`KEN_BURNS` is a photo slideshow, not generative AI). |

## 2026-11-02 - Web PWA "Report this AI content" + migration 148

| Area | Change |
|---|---|
| Schema | `ai_content_reports` (migration `148`, written, NOT applied): nullable `customer_account_id` (anonymous = AI Stylist visitors), `feature`, `content_ref`, `description`, `status`. RLS policy as 144. |
| API | `POST /v1/public/passport/ai-report`: closed feature list, 10-2000 char text, session identity only, 20/24 h per account and 100/h for all anonymous reports. Account delete unlinks reports (soft delete, so no FK cascade). |
| Web | Inline `ReportAiContent` on AI Stylist, customer try-on, My Style selfie / find similar / complete the look; proxy allowlist gains `ai-report`. |
| Tests | API 2873 passed; web component test 3/3; web `tsc` clean. 10 unrelated web test files fail identically on a clean tree. |
| Not verified | Migration unapplied, so the route 500s until the owner applies it. No admin screen for these reports. No browser/device test. See `docs/tasks/pending/ai-content-reporting.md`. |

## 2026-11-02 - Admin queue for shopper AI-content reports

| Area | Change |
|---|---|
| API | `GET /v1/admin/ai-content-reports` (status/feature filter, paginated, reporter phone masked, anonymous = null reporter), `GET .../stats`, `PATCH .../:id` (NEW/REVIEWED). Registered inside `adminRoutes`, so it inherits the admin auth hook; `admin-route-guard.test.ts` covers it. |
| Web | `/admin/ai-content-reports` page + Sidebar item under Team & Support. |
| Tests | `admin-ai-content-reports.test.ts` (5) + route guard green; API tsc clean; web tsc clean. `Sidebar.test.tsx` sign-out case fails identically on a clean tree (not touched). |
| Not verified | Not browser-tested; empty until migration 148 is applied. Standard admins only; retailer reports stay in Bug Reports. |

## 2026-11-02 - Admin sidebar regroup + trial_to_active_rate fix (`af106be8`)

| Area | Change |
|---|---|
| Sidebar | `Catalog & Creative`, `Reports & Finance`, `Settings & Operations` each split in two: **Catalog** (categories, attributes, upload tiers, suits designs + categories, ratings), **Creative** (studio styles, photo cleanup test, My Style, festivals, social templates/publishing, Google Business), **Reports** (overview, GST, AI Usage, Try-On GPU Usage, Storage Report), **Finance** (HSN rules, billing, commission, referral program/monitor, addon purchases, plan limits, resource packs, plan features), **Settings** (general, integrations, AI providers/config, rate limits, theme), **Operations** (operations overview, deployments, gate, audit log, DB health, server memory, query console, backup, deletion vault, support sessions). Overview, Retailers & Network and Team & Support unchanged. Access rules unchanged: Reports, Finance, Settings, Operations are Super-Admin only, so a plain ADMIN sees neither. |
| Analytics audit | Dashboard, Reports, AI Usage, Try-On GPU, Storage Report, Engagement all read real Prisma aggregates; no mock or random data found. Dashboard MRR divides paise by 100 correctly. |
| Bug | `trial_to_active_rate` (`/v1/team/reporting/retailer-activation`) was active / current trials and could exceed 100%. Now a cohort rate: retailers with a successful `SubscriptionPayment` / retailers whose `trial_ends_at` has passed or who have paid. Field name unchanged, so the Reports page needs no edit. |
| Tests | `Sidebar.test.tsx` and `e2e/admin-navigation.spec.ts` updated for the new group names; new `team-reporting.test.ts` (2). API tsc clean. `Sidebar.test.tsx` sign-out case fails identically on a clean tree (not touched). |
| Not verified | Not browser-checked, e2e spec not run, rate not run against real Postgres. A retailer who paid once and later cancelled still counts as converted. |

## 2026-11-03 — Real `ADMIN` team role (RC-161), branch `feat/admin-team-role`

| Item | Detail |
|---|---|
| Why | PR #225 let "Admin and Super Admin" change plans, but production `TeamRole` had no `ADMIN`, so no Admin account could exist (found while planning a live Admin test). Owner chose to add the role. |
| Schema | `ADMIN` added to `TeamRole`; `149_team_role_admin` = `ALTER TYPE "TeamRole" ADD VALUE IF NOT EXISTS 'ADMIN'`. NOT applied by the agent. Apply before deploying the API. |
| Security | `verifyAdminSession` (only caller: `teamAuthPreHandler`, which grants unscoped Super Admin over `/v1/team`) now passes `SUPER_ADMIN` only. Before, an `ADMIN` session would have been able to create `SUPER_ADMIN` team members. An Admin gets 401 on `/v1/team/*`. |
| API / web | `ADMIN` in the create-member schema (only a Super Admin can create one); team page label "Admin (Standard Access + Plan Changes)", description, colour; `MARKETING_MANAGER` relabelled "Marketing Manager (Standard Access)"; welcome-email label. |
| Access rule | ADMIN = all standard admin segments + change-plan + extend-trial + per-retailer limit overrides POST/DELETE (owner decision 2026-11-03; audit entries now carry actor + role). Team members, reports, money, settings, operations stay Super Admin. |
| Tests | New `admin-role-escalation.test.ts` (4; 2 fail on the old code). API + web `tsc` clean; 147 related API tests pass. |
| Not verified | Migration unapplied; no Admin member created; no live Admin login or Change Plan; mobile staff OTP login for an ADMIN phone not checked; web page not browser-checked. |

## 2026-11-03 — Admin role opened to every menu except Finance, Settings, Query Console, branch `feat/admin-role-access`

| Item | Detail |
|---|---|
| Decision | Owner: "all the permission to Admin except Finance, Settings and Query Console; rest all menus and pages Admin can explore." Reverses the 2026-09-24 RC-034 decision that kept Reports / Team Members Super-Admin-only, and H3-2's Super-only Operations tier. |
| Three tiers | `SUPER_ADMIN_ONLY_ADMIN_SEGMENTS` (Finance, Settings, `query`, `schema`), new `ADMIN_TIER_ADMIN_SEGMENTS` (Super + Admin only: reports, gst, ai-usage, try-on-usage, storage-report, audit-log(s), operations, deployments, deployment-gate, database, backup(s), deletion-vault, server-memory, support-sessions, team-members), `STANDARD_ADMIN_ADMIN_SEGMENTS` (everyone else). MARKETING_MANAGER / SUPPORT_MANAGER do NOT get the new tier (they share the standard list), so it is its own list. |
| Query Console | Lives under the `database` page segment, which Admin now opens (DB Health, Backup, Deletion Vault), so `/admin/database/query` is matched by path in `isSuperAdminOnlyAdminPath`. API `/v1/admin/query` stays in the Super list. |
| /v1/team | An ADMIN session now gets unscoped READS (`readsAll`) so Reports and Team Members load; create/edit member, territories and all other writes stay Super Admin. Enforced in `teamAuthPreHandler` itself: any non-GET/HEAD/OPTIONS request from an Admin session is 403 before the route runs (automated security review), so it does not depend on each route having a role check. Tested incl. Admin cannot create any role. |
| Web | `adminRoleCanReach(role, path)` drives the layout guard and the sidebar; stale `superAdminOnly` flags removed from the moved items (Query Console keeps its flag). |
| Tests | `admin-access.test.ts` (3 disjoint tiers, role matrix, `database/query`), new `admin-team-readonly.test.ts` (5), Sidebar tests rewritten (ADMIN, MARKETING_MANAGER). API + web `tsc` clean. The `Sidebar` sign-out test still fails as before (pre-existing). |
| Risk accepted by the owner | Admin can now restore backups, hard-delete via Deletion Vault, view Deployments / Gate, and open Support Sessions. Not verified in a browser; no live Admin login yet. |

## 2026-11-03 — Backup & Restore and Deletion Vault made view-only for Admin, branch `fix/admin-backup-vault-readonly`

| Item | Detail |
|---|---|
| Decision | Owner, after seeing the risk of #230 ("Admin can restore backups / use Deletion Vault"): "limited access", chose **view-only** over Super-Admin-only. |
| Rule | `ADMIN_READ_ONLY_ADMIN_SEGMENTS` (`backup`, `backups`, `deletion-vault`) + `isAdminReadOnlyAdminPath` in `admin-access.ts`; `adminAuthPreHandler` refuses any non-GET/HEAD/OPTIONS request from an ADMIN session on those segments (403 "Super Admin privileges required to change this"). By method, so a future write route there is refused for Admin by default. |
| Effect | Admin can list backups and their metadata and the deletion vault. `POST /backup/create` and `POST /backups/restore` are Super Admin only. The vault API is GET-only today. |
| Tests | New `admin-readonly-surfaces.test.ts` (5, dummy handlers at the real paths; fails when the rule is removed). 130 related API tests pass, API `tsc` clean. |
| Not done | The Backup page still shows the Create/Restore buttons to Admin; they return 403. Not browser-checked. |
