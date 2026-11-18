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

## 2026-11-03 — Closing note: ADMIN role work (RC-161), PRs #228–#231

| Item | Detail |
|---|---|
| Shipped | #228 drift guard checks enum values + 15 min recheck; #229 real `ADMIN` role (migration 149 applied by owner) and `verifyAdminSession` Super-only; #230 Admin opens every menu except Finance, Settings, Query Console (+ `/v1/team` read-only for Admin, enforced in `teamAuthPreHandler` after a security review); #231 Backup & Restore and Deletion Vault view-only for Admin. |
| Owner check | Owner created an Admin and reported all new menus work. Details of what was clicked not given. |
| Open | Hide the Create/Restore buttons on the Backup page for Admin (they 403). Decide `SCHEMA_DRIFT_BLOCKS_HEALTH=1`. Check the `CHANGE_PLAN` audit row for the Admin's own change (actor + role). Mobile staff phone-OTP login for an ADMIN member not checked. `DELETE` of limit overrides uses a hard delete: confirm the app DB role has DELETE on `retailer_limit_overrides` (RC-049 shape) by deleting one as Admin. |
| Decisions on record | Admin may change plans, extend trials, manage limit overrides (2026-11-03). Marketing/Support managers do not get the Admin tier. Team members, reports writes, Finance, Settings, Query Console stay Super Admin. |

## 2026-11-03 — Shop pin saved (RC-163), PRs #238 + #239

| Item | Detail |
|---|---|
| Bug | `PUT /v1/retailers/me` accepted `latitude`/`longitude` but never wrote them; prod had 20 retailers, 0 with coordinates. |
| Shipped (#238) | Pin written (both-or-neither, India box, unchanged re-send is a no-op); `retailers.location_source` (migration 151, applied on prod); real paging on `GET /v1/admin/retailers`; admin Local Discovery pincode/city + radius search (`/v1/admin/discovery/nearby`); onboarding paste-a-Maps-link; pin review dialog (Use this pin / Clear pin); engagement product thumbnail/name/SKU; dry-run-first `scripts/backfill-retailer-location.ts`. |
| Shipped (#239) | Opt-in `store_location` item on the dashboard setup checklist. |
| Proof | #238 CI green: quality, unit-web, migration-replay, build, e2e-web. |
| Prod check 2026-11-04 | Read-only: 20 retailers, 0 with latitude/longitude, `location_source` NULL on all. Backfill not run. |
| Not done | No device test, no EAS build, nothing run against real Nominatim. Existing retailers must re-pin from the app. |

## 2026-11-04 — Admin social design templates: T1 + T2 + T3 (branch `feat/design-templates-t3`, stacked on `fix/social-templates-t1`, not pushed)

| Item | Detail |
|---|---|
| T1 (`9a2a3bf7`) | Retailer templates screen: expo-clipboard copy, hashtag parse, Android share; admin monitor Occasions stat and inactive-badge contrast. |
| T2 (`845c0372`) | `packages/shared/src/design-template.ts` (format/variable lists, `parseDesignSpec()` which rebuilds an untrusted spec), `packages/ai/src/design-render.ts` (`renderDesign`, sharp), table `design_templates` + enum `DesignFormat` (migration 152, applied in prod by owner 2026-11-04). |
| T3 API | `apps/api/src/routes/admin/admin-design-templates.ts`: list, get, create (always DRAFT, plans default to all three per D5), partial update (format + slots + spec re-validated together), status (DRAFT/PUBLISHED/HIDDEN), stateless `POST /preview` (unsaved draft, sample data), `POST /upload-url` (signed `content_length`, RC-080; keys verified by `verifyUpload`, RC-075; URLs always server-built). **No DELETE route**: `kanchuki_app` has no DELETE grant; retire = HIDDEN. Segment `design-templates` classified in `ADMIN_TIER_ADMIN_SEGMENTS` (Super Admin + Admin, D6); `R2_PATHS.designTemplateAsset`. |
| T3 UI | `/admin/social-templates` is now two tabs: Design Library (new: list, publish/hide, form + live-preview editor with layer list, background upload) and Retailer AI Templates (the previous page, unchanged). Editor lists come from `@kanchuki/shared`. |
| Seed | `apps/api/scripts/seed-design-templates.ts`: 9 DRAFT starter designs with generated placeholder backgrounds (D7). Dry-run is offline and validated all 9 specs; `--apply` is owner-run. |
| Deviations from the brief | Preview is `POST /design-templates/preview` (spec in the body), not `:id/preview`, so an unsaved draft can be previewed. Assets live under `admin/design-templates/` (one shared prefix) instead of `templates/<id>/`: the id does not exist before create. `parseDesignSpec` uses an indexed loop because `apps/web` compiles shared from source at a lower TS target. |
| Proof | API `tsc` clean; new route tests 14/14 (spec rejection, unknown format, index vs slots, prefix guard, no-DELETE, `content_length` required, preview); `admin-access` + `admin-gate` guards pass; shared 28/28; web `tsc` + `next lint` clean. |
| Not done / not verified | **Not browser-tested**, no real R2 upload or render through the route, `--apply` never run. Hindi text renders as boxes (no Devanagari font in the API image). Retailer-side picker (T4), AI paid tier (T5), `social_templates` retirement (T5/T6) not started. RLS policy `backend_roles_full_access` on `design_templates` is in migration 152 but not confirmed in prod (owner: `select policyname from pg_policies where tablename='design_templates';`). |

**Hindi font (same day, T3 follow-up):** bundled Noto Sans Devanagari (OFL, variable TTF, `apps/api/fonts/`) and installed it in `apps/api/Dockerfile`; added to both `FONT_STACK` entries in `design-render.ts` so fontconfig falls back per glyph. Tests 17/17 (no Devanagari pixel check: this Windows box has no matching fontconfig). Not built in Docker, not verified on Railway; Hindi may still render as boxes until the image is rebuilt. Only one Dockerfile (`apps/api/Dockerfile`) exists, not two.

## 2026-11-04 — Admin social design templates: T4 retailer picker + render (same branch, not committed, not pushed)

| Item | Detail |
|---|---|
| API | `apps/api/src/routes/retailers/retailers-social/retailers-social-designs.ts`, registered in `retailers-social.ts`. `GET /v1/retailers/me/designs` = PUBLISHED designs whose `plans` include the caller's plan. `POST /v1/retailers/me/designs/:id/render` takes `product_ids` (≤ design slots) + optional `custom_text` / `offer_text` (≤ 80 chars) and returns `{image_url, image_key}`. Draft / hidden / wrong-plan design = 404. Owner-only (`isRealOwner`; managers are default-denied). |
| Variables | Server-filled from the caller's own rows, never the client: shop name, city, `enquiryPhone()`, store URL, logo (missing logo = layer skipped), product name / price / mrp / `discount_pct` / sku / fabric. Foreign product id = 404 via `assertOwnProducts` (RC-138). Product with no photo = 422. `usage_count` bumped after a successful render only (a failed bump is logged, image still returned). Image stored at `retailers/<id>/designs/<hex>.jpg`. |
| Publish path | **No new publishing code.** The image goes through the existing composer `IMAGE` post (`POST /me/social/posts`, `items:[{image_url}]`). |
| Mobile | `src/lib/api/designs.ts` (`designTemplatesApi`), new screen `app/social/design.tsx` (pick design -> `ProductGridPicker` -> optional headline/offer -> Make design -> preview -> Post), Growth hub row "Design a Post". `create.tsx` accepts `?design_image=` and only if it matches `https://<host>/retailers/<id>/designs/<hex>.jpg`. |
| Proof | API `tsc` clean; new route tests 8/8 (plan filter, variables from DB rows, draft = 404, foreign product, slot cap, no photo, manager 403, text cap, render failure no usage bump); full API suite 2975 passed; Biome clean on new files; mobile `tsc` clean; mobile vitest 551/551 (keyboard / a11y guards included). |
| Not done | **Scheduler (F-043) not wired**: its items are product-keyed and render at publish; a design step there needs a `design_template_id` + vars column (migration) and was left out. Composer design posts are single-image only (no carousel of designs). No render cache. **Not device-tested, no real R2 download/render through the route, Hindi glyphs unverified, `design_image` regex and the new screen have no UI test.** Needs designs PUBLISHED by an admin (seed not run) before the picker shows anything. |

## 2026-11-04 — Admin social design templates: T4b scheduler design step (same branch, not committed, not pushed)

| Item | Detail |
|---|---|
| Shape | A design is a **slide style**. Its id goes in the existing `scheduled_post_items.template_id` (image_level `TEMPLATE`); built-in ids are 4 fixed names and design ids are cuids, so they cannot collide. **No migration** (the earlier "needs a column" estimate was only for per-slide headline/offer text, see Not done). |
| Server | `lib/design-post-render.ts` (new): `findPublishedDesign` + `renderDesignJpeg`, extracted from the T4 composer route, which now calls it. `lib/schedule-render.ts`: a non-built-in `template_id` renders through it with THIS slide's product (`<postId>-<pos>-design-*.jpg`), `usage_count` bumped via `bumpDesignUsage`. `retailers-social-schedule-style.ts`: the three style routes (`items/:id`, `posts/:id`, `plans/:id`) accept `{design_id}` next to `{template}`; a design must be PUBLISHED for the caller's plan (else 404). Item route renders now (preview); post/plan routes only store the id, the publish tick renders (price stays current). |
| Safety | Render at publish re-checks PUBLISHED + plan: a design hidden or unpublished after scheduling throws inside `renderItem`, `resolvePostImages` falls back to the original photo, the post still goes out. Rotation pool stays built-ins only. |
| Mobile | `scheduleApi.style*` take `StyleChoice` (built-in / `'rotate'` / `null` / `{design_id}`); the schedule style sheet (`app/social/schedule/[id].tsx`) lists "Your designs" (single-product designs only) under the built-ins. |
| Proof | API `tsc` clean, Biome clean; API suite 2982 passed (new: 3 render tests incl. retired-design fallback, 4 style-route tests incl. 404 + lazy plan apply); mobile `tsc` clean, vitest 551/551. `silent-failures-guard` caught a proximity false positive on my first layout; fixed by moving the bump into a helper. |
| Not done | **No per-slide headline / offer text** (`custom_text` / `offer_text` render empty; layers using them are skipped): storing them needs a `design_vars` column, i.e. a migration. Designs with more than one product slot are hidden in the scheduler (a slide has one product). A slide's label shows "Styled", not the design name. Not device-tested, no real render at publish, no test that a design render is accepted by Meta. |

## 2026-11-05 — Admin social design templates: T4 committed, per-slide text, multi-slot designs, T5 paid AI tier (branch `feat/design-templates-t3`, not pushed)

| Item | Detail |
|---|---|
| Commit | T4 + T4b committed locally as `3d155ad0`. Everything below is uncommitted. |
| Per-slide headline / offer text | Migration `153_scheduled_post_item_design_vars` (nullable JSONB `design_vars`, **not applied**). The three style routes take `custom_text` / `offer_text` (trimmed, <= 80) next to `design_id`; stored on the item(s), cleared (`Prisma.DbNull`) when a slide goes back to a built-in or the original. `renderItem` passes them to `renderDesignJpeg`. Mobile style sheet gets two inputs (wrapped in `KeyboardScreen`). |
| Multi-slot designs | `slotProducts()`: this slide's product, then the post's next products in order, wrapping (a 4-slot design on a 2-slide post repeats). The mobile filter that hid multi-slot designs is gone; slide badge shows the design name. Known gap: swapping/removing a slide clears only that slide's cached render, so neighbours' multi-slot renders can be stale until restyled. |
| Security finding (hook, on `create.tsx` `design_image`) | Valid: a crafted deep link could make the app post any third-party image. Fixed server-side in the composer fan-out: an IMAGE `image_url` must start with `R2_PUBLIC_URL/` (skipped when the env is unset, dev only). Test added. The mobile regex still does not pin the host (server is the authority). |
| T5 paid AI tier | Migrations `154_ai_custom_template_enums` (`PlanFeatureKey` + `QuotaResourceType` `AI_CUSTOM_TEMPLATE`) and `155_ai_custom_designs` (**not applied**). `lib/ai-custom-design.ts`: prompt cleaned (control chars, quote/brace chars, <= 300, no links/handles, small blocklist for people-likeness/brands/overrides) then wrapped in a fixed instruction that forbids drawn text. `POST /me/ai-designs` (owner-only, 10/min): feature gate (fails closed) -> provider configured -> sanitise -> own product + photo -> `checkQuota` -> atomic `reserveJobQuota` -> PENDING row -> enqueue; any failure after the reserve refunds. Job `ai-custom-design` runs on the studio queue, same FLUX path as Studio Shoot, saves to `retailers/<id>/designs/<hex>.jpg`, row READY, slot marked spent; every other exit refunds. Quota sweep treats a READY row as spent. `AI_CUSTOM_TEMPLATE` is METERED (no `plan_limits` row = 0) and listed in `PLAN_LIMIT_RESOURCE_TYPES`. Mobile `app/social/ai-design.tsx` + Growth hub row, polling the row, `ReportAiContent`, "My AI designs", posts via the composer IMAGE path. |
| Proof | API `tsc` clean, Biome clean; API suite 232 files / 3010 tests pass (new: sanitiser 6, route 10, job 6, render +4, style routes +3, fan-out CDN pin +1); mobile `tsc` clean, vitest 551/551; shared 227/227; web `tsc` clean. |
| Not done / not verified | **No real FLUX call, nothing run against Postgres, no device or browser test.** T5 is dark: needs migrations 153-155 applied, a `plan_features` row for `AI_CUSTOM_TEMPLATE`, and `plan_limits` rows (else it is off / limit 0). Skipped from spec §5: no output-format picker (Kontext keeps the photo's aspect), no "variable fill" of price/logo over the AI image (the AI image is picture-only; add when asked), no "save as reusable template", no admin screen for the prompts, `social_templates` not retired (still live). Output goes through the <= 80 KB compressor, so quality is Studio-Shoot level, not poster level. |

## 2026-11-05 — Retire `social_templates` (D1), code only (branch `feat/design-templates-t3`, not pushed)

| What | Detail |
|---|---|
| Removed | `growth-social-templates.ts` (+ test), `admin-social-templates.ts`, mobile `growth/templates.tsx` (orphan, nothing linked to it) and its 11 client methods/types, the `/v1/growth/social-templates` auth allowlist lines, the `social-templates` admin API segment. Admin page now only the Design Library and lives at `/admin/design-templates` (already `ADMIN_TIER`, D6); sidebar label "Design Library". |
| Kept on purpose | `social_templates` table + rows, `SocialTemplateType` enum, `SOCIAL_TEMPLATES` plan feature key, the `purge-retailer-now` delete. No migration; dropping is an owner decision. |
| Proof | API tsc + vitest 3006/3006 (admin-access guard caught the moved web segment), mobile tsc + 549/549, shared 227/227, web tsc clean. `Sidebar.test.tsx` "sign out" fails on the untouched baseline too (not from this change). |

## 2026-11-05 — T5 gaps: format picker, price/logo overlay, prompt reuse, poster quality, admin view (branch `feat/design-templates-t3`, not pushed)

| What | Detail |
|---|---|
| Output format | `POST /me/ai-designs` takes optional `format` (ORIGINAL / SQUARE / PORTRAIT / STORY, default ORIGINAL) and `overlay` (white_price / new_arrival / logo_corner, default none). Lists live in `@kanchuki/shared` (`AI_DESIGN_FORMATS`, `AI_DESIGN_OVERLAYS`). No migration: both ride in the job data, nothing is stored on the row. |
| Overlay | `finishDesignImage()` (packages/ai `schedule-templates.ts`) reuses the free 4:5 slide renderer, so an overlay forces 4:5 and the format is ignored. Price = product `price_min`, store name and logo from the retailer. `festival_frame` left out (needs a DB lookup). A missing/unreadable logo falls back to the store-name pill. |
| Quality | `downloadCompressAndUpload` gained `{ transform, compress }`; the job uses a 450 KB / 2000 px / q92 budget instead of the 80 KB catalog one. |
| Reusable template | Built as **prompt reuse**: a chip row under "My AI designs" copies a past prompt into the box for another product. No stored background or new table. |
| Admin view | `GET /v1/admin/ai-custom-designs` (read-only, `ADMIN_TIER`, no PII selected, 30-day status counts) + web page `/admin/ai-custom-designs` + sidebar "AI Designs". |
| Proof | API tsc + vitest 3016/3016; ai 195/195; mobile tsc + 553/553 (new `ai-design-screen.test.tsx`, 4); shared 227/227; web tsc clean. Web `Sidebar.test.tsx` sign-out still fails on the untouched baseline. |
| Not verified | No real FLUX call, no Postgres, no device/browser run; overlay look and the 450 KB budget never seen on a real AI image. |

## 2026-11-05 — T6 starter pack: 10 original designs (branch `feat/design-templates-t3`, not pushed)

| What | Detail |
|---|---|
| Catalogue moved | The seed catalogue left `apps/api/scripts/seed-design-templates.ts` for `apps/api/src/lib/design-seed-data.ts` (pure data + SVG strings, no sharp/DB/R2) so it is unit-testable; the script imports it and rasterises with sharp. The 9 placeholder designs are unchanged. |
| New designs | Diwali Diyas, Navratri Garba, Eid Mubarak (9:16), Karwa Chauth Moon, Wedding Season, Holi Colours, Independence Day, Sale Starburst (baked English "SALE", discount from `offer_text`), Under Price Collage (4 products, headline typed as `custom_text`), Visit Us Card (`shop_logo`, city, phone, URL). All motifs (diya, crescent, star, mandala, tricolour band) are drawn in code: original art, nothing from Canva/Visme. |
| Verification | `design-seed-data.test.ts` (41): names unique, every spec parses for its format and slots, backgrounds are well-formed SVG of the right size with unique ids, festival/format coverage. Rendered all 10 through the real `renderDesign` with sample vars and looked at them: found and fixed the SALE badge hidden under the product image and the Visit-Us divider cutting its URL. Script dry-run lists 19 designs and writes nothing. |
| Merged | PR #243 merged to `main` as `aab29697` and deployed; migrations 153-155 applied by owner (2026-11-14 status). Seed run, published designs and the `AI_CUSTOM_TEMPLATE` `plan_features` / `plan_limits` rows not confirmed by me. |
| Not done | Seed NOT applied as of this entry (owner runs `--apply`, rows land as DRAFT for review in Admin -> Design Library). Rakhi, Limited stock, Back in stock, Look of the day, Store intro; no 1.91:1 format exists, so no FB-landscape designs. Art is simple flat shapes, not designer-grade; Hindi text is never baked in (all words come from layers). Not seen on a real device or with real product photos. |


## 2026-11-14 — Starter pack gaps: Rakhi, Limited stock, Back in stock, Look of the day, Meet our store (branch `feat/design-starter-pack-gaps`, local commit `2ee07ec4`, not pushed)

| Item | Detail |
|---|---|
| What | 5 more code-drawn designs appended to `apps/api/src/lib/design-seed-data.ts`: Rakhi Thread (4:5, thread + flower rakhi), Limited Stock (square, baked English pill), Back In Stock (4:5, gold pill on emerald), Look of the Day (4:5, 2 slots, baked heading), Meet Our Store (9:16, logo + shop name + `custom_text` tagline + city/phone/URL, mandala). Catalogue is now 24 designs. |
| Verification | `design-seed-data.test.ts` 51/51 (occasion coverage extended), API `tsc` clean. Rendered all 5 through the real `renderDesign` with synthetic shop/product data and looked at them: no overlap or clipping, rupee glyph and fonts load. Temp render script deleted. |
| Not done | Seed NOT run: owner runs `seed-design-templates.ts --apply` (idempotent by name, adds only these 5 as DRAFT). Baked words are English only (same as SALE). Not seen with real product photos, on a device, or via the admin preview. Still no 1.91:1 format, so no FB-landscape designs. |

## 2026-11-14 — Drop `social_templates` (migration 156, applied in prod by owner)

| What | Detail |
|---|---|
| Changed | New `156_drop_social_templates` (`DROP TABLE IF EXISTS "social_templates"; DROP TYPE IF EXISTS "SocialTemplateType";`). `schema.prisma`: `SocialTemplate` model, `SocialTemplateType` enum and `Retailer.social_templates` removed. `purge-retailer-now.ts`: the `DELETE FROM social_templates` line removed (it would have rolled back every retailer self-delete once the table is gone). `rls-remaining-policy.test.ts`: allows `social_templates` as dropped-later (migration 136 is applied history and still names it). |
| Kept on purpose | `PlanFeatureKey.SOCIAL_TEMPLATES` (enum value drop needs a type rebuild); migrations 069/124/125/136/150 untouched. |
| Owner steps | Deploy the code first, then `select count(*) from social_templates;`, `pg_dump -t social_templates --data-only` if non-empty, then apply 156 as the migrator role. Rollback: re-run 069's DDL and restore the dump. |
| Verification | `prisma validate` OK, API `tsc` clean, API vitest 3067 passed / 9 skipped, biome clean on touched TS. Owner applied 156 in prod 2026-11-14: row count was 0 (no dump), `to_regclass('social_templates')` returned null. Not checked by me: the `SocialTemplateType` enum is gone, a `_prisma_migrations` row exists for 156, and the code PR (#246) was deployed before the apply. |

## 2026-11-14 — 1.91:1 landscape design format + scheduler Hindi font (PRs #248, #249, merged without CI)

| What | Detail |
|---|---|
| Changed | `DESIGN_FORMATS` gains `LANDSCAPE_1_91_1: { w: 1200, h: 628 }` in `packages/shared/src/design-template.ts`; the renderer, `parseDesignSpec` canvas bounds, admin API `z.enum` and the admin Format dropdown all read that one table. `schema.prisma` `DesignFormat` + new `157_design_format_landscape` (`ALTER TYPE ... ADD VALUE IF NOT EXISTS`, enum only). `design-seed-data.ts` `single()` takes a format type without landscape (no starter layout). Admin format labels replace every underscore. `DesignLibrary.tsx` biome errors that were already on `main` fixed (format, import order, env dot access; no behaviour change). Scheduler built-in templates (`schedule-templates.ts`) now list `Noto Sans Devanagari` after `DejaVu Sans` (PR #249). Device-test checklist: Hindi note corrected (font bundled since `2e468ae3`), landscape gap line updated. |
| Tests | Landscape bounds in `design-template.test.ts`; the renderer it.each case uses a one-layer spec because the shared fixture's y values (900+) do not fit 628 px. |
| Owner steps | Migration 157 applied by owner 2026-11-14 ("Success. No rows returned"). Not read back: `select unnest(enum_range(null::"DesignFormat"));`. |
| Verification | Local only, GitHub Actions blocked (billing): shared 227, API 3067 passed / 9 skipped, AI 195 passed; `tsc` clean for API, AI, web; biome clean on touched files. Merged with the owner's explicit go-ahead. |
| Not verified | No CI run. No browser or device test; landscape never rendered with a real photo; `design.tsx` letterboxes it inside the fixed 4:5 preview. No Devanagari pixel test (Windows box has no fontconfig), not checked in a built image on Railway. Whether the merge deployed (the deploy workflow also runs on Actions). `AI_DESIGN_FORMATS` (scheduler/AI-design pickers) left unchanged on purpose. |

## 2026-11-14 (later) — landscape starter design, true-aspect preview, Devanagari build guard (PRs #251, #252, merged without CI)

| What | Detail |
|---|---|
| Changed | `design-seed-data.ts`: new `sideBySide()` layout (image left, text column right) and a "Landscape Showcase" design (`LANDSCAPE_1_91_1`, IVORY palette, 1 slot); `single()` keeps its landscape-free type. `design-seed-data.test.ts` expects all four formats. `apps/mobile/app/social/design.tsx`: preview `aspectRatio` comes from `DESIGN_FORMATS` (4:5 fallback for an unknown format); design thumbnails use `resizeMode="contain"`; biome re-formatted a few untouched lines. `apps/api/Dockerfile`: `fontconfig` added to the apt line; after the Noto Sans Devanagari copy, `fc-cache -f` then the build fails with "Devanagari font missing from image" unless `fc-list :lang=hi` lists it (PR #252). |
| Owner steps | Owner ran `npx tsx scripts/seed-design-templates.ts --apply` against prod 2026-11-14; pasted output: `{"apply":true,"created":6}` for Rakhi Thread, Limited Stock, Back In Stock, Look of the Day, Landscape Showcase, Meet Our Store (DRAFT; the other starter designs already existed and were skipped). Not read back by me. Rows show in Admin -> Social Templates -> Design Library; owner reviewed Landscape Showcase in the Design Library ("looks good") and published it 2026-11-14 (owner's report, not read back by me); the other 5 new rows were not reported published. Owner also reported the Railway build "done" after #252 (taken as passed; I cannot read Railway). |
| Verification | Local only, GitHub Actions blocked (billing): API `tsc` clean, API vitest 3069 passed / 9 skipped, mobile `tsc` clean, biome clean on touched files. Stale `packages/shared/dist` (not rebuilt after switching branches) caused 2 TS errors and 2 failing tests until `tsc -p` rebuilt it. Dockerfile guard tested in throwaway `node:22-slim` containers with the same apt + font steps: real font lists `Noto Sans Devanagari` (pass), empty font file exits 1 with the guard message (fail as intended). |
| Not verified | No CI run on #251 or #252. Landscape layout positions were first estimates; rendered locally afterwards with the shared renderer (flat tan placeholder photo, one- and two-line offer), which showed a ~130px gap above the phone, fixed by moving `shop_phone` y 540 -> 500 (PR #254, merged without CI; local render only, no real photo, no Hindi in that local render, not through admin or the app). No device test of the preview screen; mobile tests not run. Full API image not built locally; the Railway build with the guard was reported "done" by the owner (taken as passed, not read by me; a failure would read "Devanagari font missing from image"). Hindi pixel check in a built image: owner typed Devanagari text in a design preview on Railway and reported glyphs render, not boxes (2026-11-14, owner's report, not seen by me); scheduler built-in templates not separately checked. |

## 2026-11-14 (evening) — AI custom designs get a LANDSCAPE output format; scheduler Hindi check added to the device-test doc

| What | Detail |
|---|---|
| Changed | `AI_DESIGN_FORMATS` (`packages/shared/src/constants/index.ts`) gains `LANDSCAPE`; `FORMAT_SIZE` in `packages/ai/src/schedule-templates.ts` maps it to 1200×628 (cover-crop, same path as SQUARE/PORTRAIT/STORY); the API route's `z.enum(AI_DESIGN_FORMATS)` picks it up with no change; mobile `AiDesignFormat` type and a "Landscape" chip in `apps/mobile/app/social/ai-design.tsx`. No migration: the format rides in the job data. An overlay still forces 4:5 and ignores the format. `designs.ts` was re-formatted by biome (it already failed `biome check` on `main`: missing semicolons, formatting only). |
| Docs | `docs/tasks/pending/design-templates-device-test.md`: new row 2.15 (scheduler Hindi on built-in styles), row 3.6 lists Landscape, row 1.10 notes the owner's design-preview Hindi pass, §5 known gaps rewritten (Hindi, landscape, fixed 4:5 preview bullet removed because #251 fixed it). |
| Verification | Local only (CI blocked by billing): shared rebuilt, AI vitest 197 passed (new LANDSCAPE 1200×628 case), API `tsc` clean, API vitest on `ai-custom-design` + `routes/retailers` 317 passed, mobile `tsc` clean, biome clean on touched files. |
| Not verified | No device or EAS build; the Landscape chip was never opened in the app; no real FLUX output cropped to landscape (cover-crop of a portrait model image to 1.91:1 may cut the garment, check row 3.6). Scheduler Hindi (row 2.15) not checked. |

## 2026-11-14 (night) — `AI_CUSTOM_TEMPLATE` added to the Plan Features allowlist and grid (T5 owner step unblocked)

| What | Detail |
|---|---|
| Found | Migration 154's owner step says "Admin → Plan Features, enable AI_CUSTOM_TEMPLATE", but the key was in neither the `PUT /plan-features` zod allowlist (`apps/api/src/routes/admin/admin-plans.ts`) nor the web grid (`apps/web/src/app/admin/plan-features/page.tsx`), the two hand-kept lists that file's own comment warns drift. The Prisma enum value already existed (migration 154), so the toggle was unreachable from the UI. |
| Changed | `'AI_CUSTOM_TEMPLATE'` added to the API allowlist, the web `FeatureKey` union and the feature list (label "AI Custom Designs"). No migration. The key still fails closed (no row = OFF) and the quota still needs `plan_limits` rows (Admin → Plan Limits, METERED). |
| Verification | Local only (CI blocked by billing): API `tsc` clean, API vitest `src/routes/admin` 461 passed, web `tsc` clean. Not browser-tested. `biome check` on `plan-features/page.tsx` already failed on `main` (5 errors: import order, formatting, `Infinity`, an unused variable, a literal key); left alone on purpose because `--write` reformats the whole file (225 lines) and two errors need manual fixes. |
| Not verified | Grid not opened in a browser; no toggle saved; `plan_features` / `plan_limits` rows for `AI_CUSTOM_TEMPLATE` still not set (owner step); no real FLUX call. |

## 2026-11-15 — F-047 Scan & Sell billing screen closed out (T9)

| What | Detail |
|---|---|
| Built (T1–T8, earlier) | `product_sales` ledger (migrations 158, 159), `POST /v1/products/sell` + undo, mobile `product/sell.tsx`, offline queue, whole-feature review PR #270 (`9c292f80`) fixing RC-164, RC-165, RC-166. |
| Owner steps | Migration 159 applied in prod (owner confirmed). New EAS build device-tested by the owner. |
| Device result | Owner: "everything working perfect". Per-step results not itemised, so the RC-164/165/166 steps and the two-phone last-piece step are not individually confirmed. |
| Docs | CLAUDE.md row 114, PRO-REQUIREMENTS §45, DATABASE.md note (159 applied), spec moved to `docs/tasks/done/`. |
| Open, not built | Open, NOT built (owner decisions): untracked one-off product can be sold twice and Undo revives it; a Redis claim stuck by an API crash keeps a queued bill waiting up to 24 h with no alert; a salesperson may undo any bill. Residuals: queued bills carry no retailer id; reused `client_bill_id` with different lines is answered with the old lines; undo writes to soft-deleted products with no stock-cap clamp; sell/undo rate limit keys on IP; status-queue read-modify-write not serialised; offline lookup only finds SKUs the catalog already cached; no real concurrency test. |

## 2026-11-15 — My Style "Find similar" now filters, not just re-ranks (RC-167; branch `fix/my-style-find-similar-filter`)

| What | Detail |
|---|---|
| Found | Owner report: Find Similar showed every catalog product, not only pieces like the uploaded garment photo. Code read: the similarity score was blended into `fit` (`0.5·base + 0.5·similarity`) and no candidate was ever removed, so `meta.total` was the whole range. |
| Changed | `isSimilarMatch()` in `lib/my-style-similar.ts`: strict category gate (a different or missing category never matches; `Other` has no category to gate on) plus `MY_STYLE_SIMILAR.minSimilarity = 0.6` in `@kanchuki/shared`. The feed route ranks only passing products and, on the default sort, orders by similarity first (ranker order breaks ties). `meta.similar` gains `matched`. Web: `FeedMeta.similar.matched` type; empty state reads "No close match nearby. Try a wider distance, or another photo." No migration, no new dependency. |
| Tests | 5 new unit tests (`my-style-similar.test.ts`), 5 new/changed route tests (`public-my-style.test.ts`). API `src/lib` + `src/routes/public` 1132 passed, API and web `tsc` clean, web find-similar page tests pass. |
| Not verified | Not opened in a browser or on a device; no real Vision provider or real catalog run. 0.6 is an untuned guess; untagged products (no colour or category) are hidden from find-similar on purpose. Web `shortlist` / multi-store enquiry tests fail with `reading 'clear'` (shortlist fails identically on a clean tree); unrelated, not fixed. Needs a `packages/shared` rebuild locally (stale gitignored `dist`). |

## 2026-11-15 — My Style redesign + 6 reported problems (RC-168, RC-169, RC-170; branch `fix/my-style-redesign-and-fixes`)

| What | Detail |
|---|---|
| Found | Owner screenshot + 6 reports on a real Android phone. (1) card images different heights; (2) Near me / Filters cut off; (3) card actions odd; (4) kids' wear in the adult feed; (5) "monthly quota completed" after one photo; (6) quiz saved but not visible. |
| Quota (5), read-only prod check | Not a counter bug. `customer_resource_limits` STYLE_ANALYSIS = 3 / MONTH. `quota_reservations` shows three SPENT reads for the account at 07:51, 07:52 and 07:57 on 2026-11-15 and the counter is 3 (October's counter is also 3). A read is only spent when the model returned a usable result, so the first two photos worked; the third was refused. Selfie and Find-similar reads share the one limit. The old copy ("resets next month") never said what was used or when. Fix: message now names the reset day ("starts over on 1 December") and what still works. Raising the limit is an owner step in Admin → Plan Limits (shopper caps); I changed nothing in prod. |
| Changed (API) | `my-style-candidates.ts` `audience` (adults default / kids) via `adultsWhere`/`kidsWhere` built from `KIDS_KEYWORDS` (shared); feed body `kids`; feed `meta.taste`. |
| Changed (web) | `StyleCard` (4:5 clipped frame, 2-line name), `StyleCardActions` (real "Complete the look" button), sort row + wrapping chips, `TasteCard` ("Your style"), `StyleQuiz` awaits its save and reports `onComplete(onAccount)`, kids flag on the request, 402 copy in `analyze.ts`. No migration, no new dependency, no DB column. |
| Tests | shared `my-style-kids` 9; API `public-my-style` + look doubles now evaluate the audience clause with SQL NULL semantics (`__tests__/where-eval.ts`), API `src/routes/public` + `src/lib/my-style` 495 passed; web `(shopper)` + `c/[slug]` 257 passed (new `redesign.test.tsx`, 12). API and web `tsc` clean. Biome clean on the API/shared files touched; web files were already biome-dirty on main and were left alone. |
| Not verified | No browser or device check, 360 px layout never seen; the owner tests on the phone. Web tests need `NODE_OPTIONS=--no-experimental-webstorage` locally (Node 26 `localStorage` clash; without it `shortlist`/enquiry/quiz tests fail identically on a clean tree). Kids rule is a keyword match on free-text category + subtype. Not mutation-tested. Not deployed; PR open, not merged. |

## 2026-11-15 — Product audience (who is it for) stored on the product; My Style kids filter uses it (branch `feat/product-audience`, not merged)

| What | Detail |
|---|---|
| Found | RC-169 only split kids from adults by keyword-matching category/subtype/name at query time. Audience was inferred, never stored, so a "Boys Kurta Set" tagged `Kurti` was a guess every time and gender/age could not be used at all. This is the design follow-up, not a new bug (the keyword rule is a known limit, so no RC entry). |
| Schema | Migration `160_product_audience` (owner applies, BEFORE deploy): enums `ProductAudience` (WOMEN, MEN, BOYS, GIRLS, KIDS_UNISEX) and `KidsAgeGroup` (NEW_BORN, AGE_0_2, AGE_3_5, AGE_6_8, AGE_9_12, AGE_13_16); nullable `products.audience`, `products.kids_age_group`. NULL = not decided. |
| Shared | `packages/shared/src/product-audience.ts` (enums, labels, `audienceForText`, `kidsAudiencesFor`, `ageGroupFromLabel`, `normalizeAudience`), `MY_STYLE_KIDS_AGE` weights, product types carry both fields. |
| API | Create / update / `bulk-create-products` accept `audience` + `kids_age_group` (invalid = 422; an age is dropped with a non-kids audience). The AI tagger returns both; `tag-product` fills only NULL, never over a retailer pick. My Style feed: `audience IN (...)` or, for NULL rows, the old keyword rule; `kids_who` (Girl/Boy, narrows, unisex matches both) and `kids_age` (boost only: exact +0.1, adjacent +0.05, never a filter). `scripts/backfill-product-audience.ts` (job in `src/jobs/product-audience-backfill.ts`): keyword-only, dry-run default, `--apply`, `--batch`, `--retailer`, live NULL rows only, writes guarded so nothing is overwritten, undecided rows listed. |
| Web | "For my child" posts `kids_who` + `kids_age` (enum via `ageGroupFromLabel`); helper text now says gender and age are used. |
| Mobile | `AudienceChips` ("Who is it for?", five chips, age band for kids audiences, tap active chip clears) on add, edit and catalog-import review. Edit shows the stored (maybe AI-filled) value and sends it only once touched; add and import pre-select a keyword guess until the retailer taps. Bulk-onboard has no review rows, so those products get their audience from the post-save tag job. |
| Tests | Full local runs: shared 252, api 3200 passed (9 skipped), ai 199, web 742, mobile 676; `tsc` clean in api, web, mobile (shared builds); `prisma validate` OK. Biome reports errors on files across the repo including untouched ones, not chased. Fixed along the way: the My Style test double now reads a column a fixture omits as NULL (the look tests had 4 failures from the new audience clause). Red seen first for API, web, hook and `addAudience`; where-filter and backfill write-guard mutation-verified. `AudienceChips` render test was written before the component and its separate red run was skipped. |
| Owner steps | 1) apply migration 160 BEFORE deploy; 2) deploy; 3) run `npx tsx scripts/backfill-product-audience.ts` (dry run), read the undecided list, then `--apply`; 4) EAS build for the mobile chips. |
| Not verified | No device or browser test. Migration 160: owner reported "migration 160 - applied" (2026-11-15), I did not read the columns back. Backfill: owner ran it 2026-11-15 via `railway run` (owner's pasted output, I did not read the DB): dry run and `--apply` both reported `scanned 259`, `updated 250` (WOMEN 165, KIDS_UNISEX 84, MEN 1), 9 undecided left NULL (tops/shirts/T-shirts/co-ords/"Other"). Before applying I had the owner run a read-only peek: of the 84 kids rows, 77 matched `kid` and 6 `new born` in category/subtype (correct); 1 was "Ladies / Frock suit / Anarkali suit", a wrong kids label from the `frock` keyword (owner fixes that row by hand; code follow-up 2026-11-15: `frock` dropped from `KIDS_KEYWORDS` and from `demographicForCategory`, so a bare "Frock suit" is no longer kids; kids frocks still match via `girl`/`kid`; a kids frock with none of those words is no longer auto-detected; shared + API tests pass, red first, not device-tested). All kids rows are `KIDS_UNISEX` with no age band. Backfill result not read back from the DB. Tagger audience quality never run against a real model. Age-boost weights (0.1 / 0.05) untuned. Keyword guess for NULL rows is still a guess. |
| Follow-up (same day) | CI `quality` job on PR #275 failed on `biome check src/` in `apps/api` (2 import-order + 1 format error, all in files this branch touched); fixed in `5f196f68`, lint exit 0, 304 api tests pass in the touched dirs. The "Biome reports errors repo-wide" line above does not apply to CI: CI runs biome only on api/shared/ai (all exit 0 at error level); web and mobile use `next lint` / `expo lint`. Catalog-import review rows now start from the AI's `tags.audience` (+ age) instead of a keyword guess (`audienceFromTags`, `d61347ff`; detect-items already returned it, mobile dropped it); the keyword guess stays the fallback. Mobile `__tests__/product` 98 passed, `tsc` clean, red seen first, not device-tested. Bulk-onboard rows then still got audience only from the post-save tag job (seeded from the AI tags afterwards, see the last row of this entry). |
| Follow-up (2026-11-15, after merge) | PR #275 merged to `main` (`7d174fc8`) after CI 5/5 on `cee57331`; Railway deploy not confirmed by me. Bulk-onboard (`apps/mobile/app/product/bulk-onboard.tsx`) `handleSaveBatch` now spreads `addAudience(audienceFromTags(item.original.tags), [category])` into each row sent to `bulkCreateProducts`, like catalog-import; the API already accepts `audience`/`kids_age_group`. Branch `feat/bulk-onboard-audience`. Source-pin test in `bulk-onboard-screen.test.tsx` (red first), mobile `__tests__/product` 99 passed, `tsc` clean, lint 0 errors. Not device-tested, no real-model tagging run. Real-model tagging results and age-boost weight tuning are still open (need owner data and real use). |
| Deploy evidence (2026-11-16, Railway CLI read-only) | API service `supportive-love`, web `magnificent-liberation`. Deployments for #276 (`a616b300`) and #277 (`0968787a`) are SKIPPED, `skippedReason` "No changes to watched files". The `7d174fc8` deployments are REMOVED, replaced 15:37 on 2026-11-15 by a SUCCESS deployment with no commit hash on each service. Likely a redeploy of the `7d174fc8` build; not proven, owner to confirm in the Railway dashboard. |

## 2026-11-16 — My Style self-entered measurements (spec step 2; RC-172; branch `feat/my-style-measurements`)

| Item | Detail |
|---|---|
| Migration | `161_my_style_measurements`: `height_cm`, `bust_cm`, `waist_cm`, `hip_cm` (CHECK ranges), `measurements_at` on `customer_accounts`. Additive, nullable. **NOT applied; owner applies it BEFORE deploying this code (RC-160).** No weight column. |
| API | `POST /v1/public/my-style/measurements` (session required, 20/min, whole cm in shared ranges, null clears a field, unknown key or empty body is 422, never cached); feed `meta.measurements`. Shared: `my-style-measurements.ts` (ranges, `feetInchesToCm`). |
| Erasure fix (RC-172) | `POST /passport/delete` never nulled the photo-derived profile. One `STYLE_PROFILE_CLEARED` now backs erasure, "Clear my data" and the job compensation; export includes profile + measurements. |
| Web | `MeasurementsCard` on `/my-style`: cm or ft/in height, "How to measure", shopper-only notice, save only on API confirm, remove in one tap, double-tap guard; proxy allows `measurements`. |
| Tests | New route test (11), `passport-data` delete test (red first), `MeasurementsCard` tests (7; written before the component, not run red); API public + my-style lib 530 passed; web my-style 149 passed; both tsc clean. |
| Not verified | No browser check; mock Postgres only; migration unapplied; consent: entering and saving is the affirmative act with an on-card notice, no separate consent event (owner to confirm that is enough for DPDP); measurements are not used for any size suggestion yet (steps 3-4 of the spec). |

## 2026-11-16 — My Style measurements: separate consent step (owner decision; same branch `feat/my-style-measurements`)

| Item | Detail |
|---|---|
| Decision | Owner chose a separate consent step for measurements (instead of saving with an on-card notice). |
| Consent | New purpose `MY_STYLE_BODY`: copy `MY_STYLE_BODY_CONSENT` (version `mystyle-body-1.0`, shared), events `MY_STYLE_BODY_CONSENTED` / `MY_STYLE_BODY_CONSENT_WITHDRAWN` in `consent_events` (`kind` is a plain string, no migration). Independent of the photo consent: a live photo grant does not unlock saving. |
| API | `POST /measurements` needs a live grant or the current `consent_version` (else 422); records the grant, then saves. New `POST /measurements/withdraw` logs the withdrawal and nulls the five columns. "Clear my data" also logs a body withdrawal when one was live. |
| Web | `MeasurementsCard` shows the notice first (title, intro, three points, withdrawal line, accept/decline); fields appear only after "I agree"; a shopper with saved measurements is not asked again; "Remove my measurements" calls withdraw and reports failure honestly. |
| Tests | API route test 18 (consent cases added; one test-helper URL bug of mine fixed); API public + lib 1179 passed; web my-style 154 passed; tsc and biome clean. Red-first run observed for the API consent cases (4 failed before); the web consent tests were written before the code but not run red. |
| Not verified | No browser check; mock Postgres only; the notice wording is mine, not reviewed by legal; the grant event stores a hashed IP and user agent like the other consents. |

## 2026-11-16 — My Style size match (spec steps 3-4; branch `feat/my-style-size-match`, stacked on `feat/my-style-measurements`)

| Item | Detail |
|---|---|
| Migration | `162_product_size_chart`: `products.size_chart` JSONB, nullable. **NOT applied; owner applies it BEFORE deploying this code (RC-160).** Needs 161 too (stacked). |
| Shared | `my-style-size.ts`: `parseSizeChart` (validates a chart: known sizes, bust/waist/hip only, whole cm in range, min <= max) and `suggestSize` (per dimension the smallest listed size whose upper bound covers the body; the largest of those wins; "between" when dimensions disagree; null for no chart, no overlapping measurement, or a body above the largest size). |
| API | `size_chart` accepted and validated on product create/update (422 on a bad chart, `null` clears via `Prisma.DbNull`, omitted leaves it alone). Feed cards carry `suggested_size` (`{size, between?}` or null); label only, never filters or reorders. |
| Web | Card line "Your size: M (between M and L) · approx." |
| Tests | shared 17; products-size-chart 10; feed 5 new; API products 256 and public 436 passed; web my-style 157 passed; tsc clean. Shared and API tests red first; the web card tests were written in the same pass as the code. |
| NOT built (so the feature is dormant) | **No retailer UI to enter a size chart** (mobile product form, needs an EAS build); stock is not checked (only the sizes the retailer lists); enquiry opt-in to share the size with a store; "complete the look" cards carry no size label. Until a retailer can enter a chart no card will show a size. |
| Not verified | No browser or device check; mock Postgres only; the rounding rule (a gap rounds up, between = smallest..largest needed) is mine and unreviewed by a tailor or the owner. |

## 2026-11-16 — My Style body frame wired into ranking (RC-171; branch `feat/my-style-frame-ranking`)

| Item | Detail |
|---|---|
| Finding | The owner asked whether My Style uses height/weight/body shape. Code read: the photo read returns three enums (undertone, depth, frame); no height or weight. `frame` was stored and shown but not read by the ranker. |
| Change | `MY_STYLE_FRAME` (shared) + `frameBoost` in `fit` (+0.05, boost only, `average` neutral); feed passes `account.body_frame` outside the kids flow. |
| Tests | 4 in `my-style-rank.test.ts` (one red first); API lib + public routes 1164 passed; tsc and biome clean. |
| Not verified | Silhouette keyword lists are unreviewed guesses; no real products/photos; no browser check; complete-the-look unchanged. |
| Spec | `docs/tasks/pending/my-style-body-profile.md` (self-entered measurements, size charts, stored-photo decision, scan options). Not approved, nothing built from it. |

## 2026-11-16 — My Style profile-age note (spec step 1; branch `feat/my-style-profile-age`)

| Item | Detail |
|---|---|
| Change | `meta.style_profile.saved_at` (from `CustomerAccount.style_profile_at`) and a note on the palette card: saved date, "only need to update it about once a year, or whenever you like", "You can delete it any time"; over 12 months: "over a year old, so you may want to update it". No migration. |
| Wording rule | Neutral on purpose: it never discourages deleting (consent is as easy to withdraw as to give). Delete stays one tap. The photo is still not stored; the note describes the saved profile. |
| Tests | 3 new `PaletteCard` tests (2 red first), 1 new API test, 2 API expectations updated; web my-style 145 passed, API `public-my-style` 65 passed; both tsc clean. |
| Not verified | No browser check; date shown in IST; web biome differs from the repo style (pre-existing). Spec: `docs/tasks/pending/my-style-body-profile.md` (lands with PR #280). |

## 2026-11-16 — Add-on / try-on pack GST invoices (RC-173; PRs #293, #294)

| Item | Detail |
|---|---|
| Change (#293, `9e2383a6`) | `/addon-callback` splits the GST-inclusive `amount_inr` (`computeInclusiveGst`; CGST+SGST intra-state, IGST otherwise), allocates a gap-free `KAN/YY-YY/NNNNNN` number inside the claim + credit transaction, queues the PDF. Job handles `addon_purchase_id`; backfill sweep re-queues packs with a number but no PDF. Migration 163: nine nullable columns on `quota_addon_purchases`. |
| Change (#294, `0eaab4ce`) | Admin + retailer GST summary / monthly / by-retailer / transactions and invoice lists merge completed packs (`completed_at`); rows carry `kind`; retailer + admin PDF routes fall back to the pack, scoped to the caller. `lib/addon-gst-report.ts`. |
| Why not `subscription_payments` | Referral qualify/accrue and the commission tracker count every `success` row as a subscription month. |
| Tests | New: `generate-gst-invoice.test.ts`, `addon-gst-reports.test.ts`, GST-helper and callback cases (red first). API routes + lib + jobs 3172 passed; tsc clean; biome no errors. |
| Owner steps | Done: migration 163 applied 2026-11-16 (nine columns read back); platform GST profile exists (state 04, prefix KAN, GSTIN set). Still owed: create try-on packs at 236 / 472 / 944 (field is GST-inclusive); tick `VIRTUAL_TRY_ON_V2` for one plan after the RunPod steps in `docs/runbooks/tryon-launch-owner-steps.md`; smoke test (real Razorpay pack, quota up, invoice number + PDF, replay callback -> no second invoice). |
| Verified 2026-11-16 | Verified 2026-11-16 (read-only): CI and the "Deploy to Railway" workflow succeeded on both merge commits (`deploy-api` ran, web/vtone skipped); the live revision itself was not read from Railway (MCP auth expired), `/health` ok with `schema: ok`. Prod Postgres accepted the new aggregate / group-by SQL and the `COMPLETED` enum value (0 rows). `quota_addon_purchases`, `subscription_payments` and `gst_invoice_sequences` are all empty, so no GST invoice of any kind has ever been issued in prod: the invoice allocator, callback transaction and PDF job have never run against real Postgres, Razorpay or R2. Platform GST profile exists (singleton, state_code 04, prefix KAN, GSTIN set). No try-on packs and no `VIRTUAL_TRY_ON_V2` row exist. |
| Not verified | A real purchase end to end; mobile/web invoice screens (untouched, `kind` unchecked); the live Railway revision. |

## 2026-11-16 — GBP + AI Custom Designs admin switches (PRs #296, #297)

| Item | Detail |
|---|---|
| Gap | `GOOGLE_BUSINESS_PROFILE` was a `PlanFeatureKey` enum value but in neither hand-kept list (web grid `admin/plan-features/page.tsx`, API `PUT /plan-features` allowlist in `admin-plans.ts`), so Google Business reviews could not be enabled from Admin → Plan Features. Same shape as the earlier `AI_CUSTOM_TEMPLATE` gap. |
| Change (#296, merged) | Added the key to both lists; the grid row is labelled **"Google Business Reviews"**. Fails closed: no `plan_features` row = OFF. Tests in `admin-plans.test.ts`: `GOOGLE_BUSINESS_PROFILE` and `AI_CUSTOM_TEMPLATE` pass validation (a rejected key is 422), an unknown key is still 422. |
| Change (#297, merged `622e4f54`) | Plan-tier accents on that page moved to the admin theme (gray / cyan / cyan-to-blue, as in the admin Sidebar). The Pro tier had a purple-to-pink gradient. Colour classes only. |
| Plan limits (owner, 2026-11-16) | `AI_CUSTOM_TEMPLATE` `plan_limits` rows: Starter 100 / Growth 200 / Pro 300 per month. `GBP_REVIEW_REPLY` rows 20 / 100 / 500 (migration 142). Rows were read back from the owner's pasted query output, not by me. A mistaken rollback `DELETE` removed the `AI_CUSTOM_TEMPLATE` rows and the owner restored them the same day (row ids and `created_at` are new; nothing reads them). |
| Not on the page | The grid row for `AI_CUSTOM_TEMPLATE` is labelled **"AI Custom Designs"**, not the key name. |
| Verified | CI green on #296 (build, e2e-web, migration-replay, quality, unit-web) and #297; `admin-plans.test.ts` 13/13 and web `tsc --noEmit` clean locally. |
| Not verified | The deployed Admin → Plan Features page in a browser (new row, Pro header colour); that either feature is switched on in prod (no `plan_features` row read for either); a real Google call; a real FLUX call. Google Business stays dark until Google approves API access, the shared Google identity is connected and "API approved" is set. |

## 2026-11-17 — AI poster styles (branch `feat/ai-poster-styles`, commits 56b282fe..05c13e75)

| Item | Detail |
|---|---|
| Status | Merged 2026-11-17 (PR #303, merge `c36a4e6e`); migration 164 (`design_templates.ai_prompt`) applied by owner (owner's report, date not given, not read back by me); nothing run against real FLUX; no device test; no browser check of the admin editor; EAS build needed. Local full-suite runs on head 74ea09db (local runs, not CI): shared 276 passed; ai 200 passed; api 3307 passed / 9 skipped (247 files passed, 2 skipped); web 771 passed; mobile 688 passed; tsc clean for shared, ai, api, web, mobile. |
| Built | `rect` scrim layer (shared parser + renderer); migration 164 `design_templates.ai_prompt` (SQL only; CHECKs length 1..600 and `product_slots = 1`); admin API accepts `ai_prompt`; retailer `GET /me/designs` returns only `ai: boolean`; AI styles refused by plain `/render` and the scheduler (`findPublishedDesign`), served by `findPublishedAiPoster`; `buildPosterPrompt` (admin text only, retailer text never in the prompt); `POST /me/ai-designs` poster body `{product_id, template_id, custom_text?, offer_text?}`; job poster branch (FLUX scene, then text rendered over it, refund on every non-READY exit); admin Design Library (AI scene prompt, AI badge, Rect layer); mobile design picker routes AI styles to `ai-design.tsx` poster mode. |
| Owner steps | `docs/runbooks/ai-poster-styles-owner-steps.md` (apply 164 before the API deploy, create a style, device test per format). |
| Not verified | FLUX Kontext may not leave empty space for the text; 9:16 and 1.91:1 crops versus the garment; the real Vision/FLUX provider was never called; admin editor not seen in a browser; no device run. |


## 2026-11-17 — Google reviews: audit fixes, store-page Google rating, manager replies + AI draft (branch `fix/gbp-audit-hardening`; merged 2026-11-17, PRs #305 `c7f705a5` and #306 `77328452`)

| Item | Detail |
|---|---|
| Audit fixes (RC-174) | `classify` in `lib/google-business.ts` rules platform causes out before a 403/404 becomes a per-retailer verdict; a 404 is a new `NOT_FOUND`; plain 429 is transient; `sync_failed` on `/status` and `/reviews`; mobile `gbpCountLabel` never shows a missing count as zero; a reply live on Google no longer 500s if our own write fails. |
| Store-page Google rating | `getPlaceRating` (Places API New, `rating,userRatingCount,displayName,formattedAddress`) cached 1 h / 5 min on a miss. `GET /public/retailers/:slug` returns `google_rating {rating,count,url}` or null; `GoogleRatingBadge` on the gate header and the catalog header. Hidden unless `GOOGLE_PLACES_API_KEY` is set. Shown only when `placeMatchesShop` (distinctive name word + the shop city in the address) passes and no other look-alike store claims the same place id (cap 50, fail closed). The place id never leaves the server. |
| Manager replies | Owner decision 2026-11-17: status, reviews, reply and draft-reply routes are owner + manager (manager allowlist in `plugins/auth.ts`, handlers re-check via `requireReplier`; salesperson and delegates refused). Consent (`/request`) and unlink stay owner-only. Reply audit row records `by` and `staff_id`. |
| AI draft | `POST /me/google-business/reviews/:id/draft-reply`, `generateReviewReplyDraft` in `packages/ai/src/review-reply.ts` (review text is untrusted: delimited, injection-resistant prompt, links stripped, 1000 chars max). Returns text to edit, posts nothing, spends no reply slot; metered as an AI tagging call. AI down or quota spent gives a labelled `source: 'template'`. Mobile: "Suggest a reply" in the reply box. |
| Local runs | api 250 files / 3370 passed / 9 skipped, tsc clean; mobile 62 files / 703 passed, tsc clean; ai review-reply 9 passed; web badge 5 + affected suites passed, tsc clean. Local only, not CI. |
| Not verified | Nothing ran against real Google (Places or GBP) or a real model. Google error shapes and the quota-0 text are from memory. Places caching terms vs the 1 h cache are unconfirmed (owner to check). A same-named shop in the same city can still show a neighbour's rating; the GBP link is the real ownership proof and is dark. Mobile needs an EAS build; no device or browser test. |
| Owner steps | Set `GOOGLE_PLACES_API_KEY` (Places API New, server key) to light the store-page rating; confirm the Places terms on caching ratings; seed `plan_limits` for `GBP_REVIEW_REPLY` (20/100/500; since PR #306 it is METERED, so no row means replies are refused). |
| Follow-up: quota (audit #9) | `GBP_REVIEW_REPLY` added to the `METERED` set in `lib/quota.ts`: no `plan_limits` row now means limit 0 (refused), not unlimited. Tests in `quota.test.ts` / `quota-reserve.test.ts`. |
| Follow-up: Google client + sync (audit #4, #5) | `listLocations` pages the accounts list and caches 5 min (`google-business.ts`); the 6-hourly `gbp-review-sync` reads up to 40 pages per link and removes `gbp_reviews` rows Google no longer returns, only after a complete walk (`jobs/gbp-review-sync.ts`, `lib/gbp-sync.ts`). Mock Google only. |
| Follow-up: AI design sweep | Hourly (:45) `ai-custom-design-sweep` job fails `ai_custom_designs` rows left PENDING over 6 h (`jobs/ai-custom-design-sweep.ts`, registered in `jobs/index.ts`). Mock Postgres only. |
| Follow-up: Google review ask | Owner-only star button on each customer card (`apps/mobile/app/(tabs)/customers.tsx`, text built in `src/lib/google-review-ask.ts`): shown for a consenting customer when the shop has a Google place id; opens `wa.me` with name, shop and review link. No API, no quota. Tests: pure-function test + a source pin on the list screen, plus (PR #307, merged 2026-11-17, PR #307 `a5cb48e5`, CI 5/5 green) a render test `apps/mobile/__tests__/smoke/customers-review-ask.test.tsx` (owner sees the star and tap opens `wa.me` with name, shop and review link without navigating; hidden for staff, no consent, no place id, masked phone; falsified by forcing the guard true: 4 of 5 failed). Mocked react-query/auth, no real native press nesting. Not device-tested. |
| Follow-up: design-template XSS review | Read-only review of the admin design-template editor and renderer: no XSS, SVG injection or SSRF found. One LOW: audit rows carried no `actor_id`; fixed in PR #307 (merged 2026-11-17, PR #307 `a5cb48e5`, CI 5/5 green): `audit()` in `admin-design-templates.ts` stores `request.adminId ?? null` (test red first; API test file 21 passed, tsc + biome lint clean; mock Postgres only). Report was in git-ignored `.superpowers/sdd/plan-gbp-followups/task-3-report.md`. |
| Follow-up: audit re-run (minor A-E) | Original #10-#14 text was lost, so a fresh read-only audit of the GBP code found five minor items; fixed in PR #307 (merged 2026-11-17, PR #307 `a5cb48e5`, CI 5/5 green; a first CI run failed on biome format only, fixed in the same PR), red tests first: A `jobs/gbp-review-sync.ts` stops after 5 consecutive `UNAVAILABLE` (Sentry warning) and a thrown error fails one link only, so the purge still runs; E `retailers-google-business.ts` reply cap is 4096 bytes (Hindi = 3 bytes/char), 422 with a clear message before Google is called; B `admin-gbp.ts` stores '' when the id_token has no email and `gbpConnectedEmail` reads '' as none; C `google-business.ts` shares one in-flight token refresh and a 401 clears the cache only if it still holds the rejected token; D `GoogleReviewsTab.tsx` `openEditor` resets text + draft label, render test `__tests__/smoke/google-reviews-reply-reset.test.tsx`. Open, not fixed: `/request` wipes link ids of a NEEDS_ACCESS retailer (direct API only), `google-places.ts:45` `res.json()` outside try/catch. Runs: api lib+jobs+routes/retailers+routes/admin 154 files / 2076 passed / 9 skipped; mobile 65 files / 718 passed; tsc clean both; biome lint clean on changed files. Local only; Google's 4096-byte limit is from memory; mobile D needs an EAS build and a device check. |
| Follow-up: local runs | api jobs 27 passed; mobile 712 passed; tsc + biome clean. Local only. Nothing ran against real Google, real Postgres or a device. |

## 2026-11-17 — F-034 Phase 2: Instagram Reels, AI video schema, DB-backed video models (PRs #309 `4b21b3c8`, #310 `6a8fb0e8`, #311 `fa028d42`; T5 PR #312 `d06fe6b9`, merged 2026-11-18)

| Item | Detail |
|---|---|
| T1 + T2a Reels (PR #309) | `publishInstagramReel()` in `apps/api/src/lib/meta-graph.ts` (container `media_type=REELS`, poll 10 × 3 s, `INSTAGRAM_CONTAINER_TIMEOUT`); composer fanout `retailers-social-fanout.ts` posts an Instagram video item as a Reel, no photo fallback, `is_ai_generated=true` when `clip.source === 'AI_GEN'`. Behaviour change: products whose main video is a Ken Burns clip now go to Instagram as a Reel. Local: api tsc clean, vitest 3419 passed. No real Instagram call; Meta App Review for Instagram permissions still pending (owner). |
| T3 schema (PR #310) | Migrations 165 (`AI_GEN` video source, `AI_VIDEO` quota, `AI_PROMO_VIDEO` plan key, `PROCESSING` post status, `studio_styles` kind/aspect/duration/no_person, `product_videos.style_slug/model_key`) and 166 (`video_models` + `plan_video_models`, RLS, no DELETE grant, 4 Fal seed rows all disabled). Applied in prod by owner, read back 2026-11-17. Migration-replay guard not run. |
| T4 DB-backed models (PR #311 `fa028d42`, merged 2026-11-17) | `fal-video.ts`: hardcoded `VIDEO_MODELS` (3 deprecated Fal endpoints + Luma 404) and all ₹ removed; `getVideoModel()` (bench, any row) and `videoModelForPlan()` (plan row + `enabled`); per-family Fal input from each endpoint's llms.txt (Kling 2.6 `start_image_url` + `generate_audio:false`, Wan `num_frames` at 16 fps, Seedance `720p` and 4:5→3:4); `clipCost()` prices from the DB, Seedance tokens = h·w·fps·s/1024 measured from the raw clip's ffmpeg banner (Fal returns no usage). Migration 167 `video_models.price_usd_per_million_tokens` applied by owner 2026-11-17 and read back. Admin bench: `GET /admin/photo-cleanup/video-models`, dropdown shows USD price, off state and removal date; each run shows $ and tokens. Local: API 252 files / 3429 tests, api + web tsc clean, biome clean on API files. **Not done:** owner bench run (4 models × 3 photos), real per-clip cost and Seedance tokens unmeasured, no real Fal call. |
| T5 routes + job (PR #312) | `POST /v1/products/:id/promo-video` (6/min; delegate 403, `AI_PROMO_VIDEO` feature, plan video model, product/photo ownership, PUBLISHED VIDEO style on plan, D11 interim `no_person`-only for `modelAllowed=false` products, 3-video cap, then `reserveJobQuota(AI_VIDEO)`), `GET …/promo-video/:jobId` (Redis, then `product_videos.id = job_id`), `GET /products/promo-video/styles`. Job `generate-promo-video.ts` on the studio queue: re-checks, Fal clip, upload, `AI_GEN` row, spent/refund, usage log under `FAL` with `cost_usd` and alert credits. `AI_VIDEO` METERED; sweep + stalled-job refund cover it; `AI_PROMO_VIDEO` in plan-features allowlist + grid; `AI_VIDEO` in plan limits; image studio styles filter `kind=IMAGE`. Migration 168 `ai_usage_logs.cost_usd` (+ `FAL`, already added by owner) applied in prod (read-only check 2026-11-18). Local: API 3456 tests, tsc api + web, biome clean, 12 guards falsified. **Not done:** no real Fal call, no `plan_video_models`/`AI_VIDEO` limit rows. |
| T5 security review (PR #312, 2026-11-18) | `agent-skills:security-auditor` on the T5 diff: no Critical/High. Fixed: **M1** the slot is spent and the cost logged the moment Fal reports the clip done (`onFalComplete` / `onUsage` on `generateImageToVideo`), so a failed download/encode/upload no longer refunds a clip Fal billed; a poll timeout logs the estimated cost and refunds; clip download cap 100 MB (`ssrfSafeFetch` / `readCappedBuffer` take an optional `maxBytes`). **M2** a stalled-job re-run returns without calling Fal when the video row exists (marks spent + ready) or the slot is no longer RESERVED (a SPENT slot with no video is lost to the retailer, `ponytail:` noted). **L4** a failed "ready" status write is logged, never turns a live video into "failed". **L2** ffmpeg pinned to `-protocol_whitelist file -f mp4` with a 120 s timeout. **L3** Fal `status_url`/`response_url` only on `https://` `fal.run` hosts (`falUrl`), else built from `FAL_BASE`. Deferred: L1 job-id not bound to caller on the status route (same in Studio Shoot; separate PR), L5 3-video cap race, L6 own video queue. 18 new tests, all red on the pre-fix source; API 3471 passed (1 failure, `retired-tryon-guard`, fails only inside the full run and passes alone with and without the change), ai 209, tsc api + ai, biome clean. Only `-f mp4` of the L2 fix is proven by a test; the protocol whitelist and timeout are not. No real Fal call. |
| T2b slow Reel finish (PR #314, merged 2026-11-18 as `d6a65123`) | A Reel not ready within the 30 s request poll is a PROCESSING row, not FAILED. `publishInstagramReel` attaches `containerId` to its `INSTAGRAM_CONTAINER_TIMEOUT` `MetaApiError`; new `instagramContainerStatus` (one status read) and `publishIgContainer` (media_publish + permalink, now also used by the Reel path). Fanout `recordPendingReel` (in `retailers-social-fanout-rows.ts`) writes the PROCESSING row and queues `instagram-reel-finish` (maintenance queue, 30 attempts, fixed 60 s backoff, first check after 60 s); if the queue add fails the row becomes FAILED with the curated timeout text. Job `jobs/instagram-reel-finish.ts`: row not PROCESSING → no Graph call; FINISHED → publish, POSTED (row write retried 3× in the attempt); PUBLISHED → POSTED with no id (no double post); ERROR/EXPIRED → FAILED; IN_PROGRESS → throw (retry); maintenance `failed` listener marks FAILED on the last attempt. Template `usage_count` counts PROCESSING. Mobile: status types gain PROCESSING, composer result sheet shows "Posting…" with a clock icon and treats it as sent, post history shows "Posting…". No migration. Local: API 256 files / 3489 tests, mobile 719, tsc api + mobile, API biome, route-size guard; 7 guards falsified plus a worker-wiring source pin. **Not done:** no real Instagram call, no device test, needs an EAS build; Redis losing the job leaves the row PROCESSING (no sweep). |
| T6 admin web (branch `feat/f-034-t6-admin-video`, 2026-11-18, PR #315 open) | API: `admin-studio-styles.ts` Create/Patch take `kind` (IMAGE/VIDEO), `default_aspect` (9:16/4:5/1:1), `duration_sec` 1..8, `no_person`; VIDEO needs aspect + duration and no image engine, IMAGE rejects all three; `kind` immutable on PATCH; PATCH validates the merged row. New `admin-video-models.ts` (segment `video-models`, Super Admin only in `admin-access.ts`): `GET /v1/admin/video-models` (models, USD prices, removal date, per-plan pick), `PATCH /video-models/:key {enabled}`, `PUT /video-models/plans/:plan {model_key}` (upsert; a disabled model may be picked); audit row per change; no delete (source pin). `GET /ai-usage` sums `cost_usd` per row. Web: `/admin/studio-styles` Kind filter, VIDEO fields in new-style form and row editor (engine hidden, "Motion prompt"), Promo video models card (`studio-styles/video.tsx`: enable switch with confirm, plan pickers with confirm, ₹ per 5 s clip estimate at `BENCH_USD_TO_INR`, token-priced shows no estimate, removal date in red, "Super Admin only" on 403); `/admin/plan-limits` hint "No row = feature is off (metered)" on `AI_VIDEO`; `/admin/ai-usage` Spend (USD) column. No migration. Local: API 257 files green (+7 video-models, +7 studio-styles VIDEO, access + ai-usage pins), web tsc + admin tests 96, API tsc + biome, route-size guard; 4 guards falsified. **Not done:** no browser check, nothing enabled in prod. |
| T5 merge (2026-11-18) | PR #312 merged `d06fe6b9`. CI 5/5 green on the PR and on main, Deploy to Railway succeeded, `/health` schema ok. Live revision not read. Feature off: all `video_models` disabled, no `plan_video_models` / `AI_VIDEO` `plan_limits` rows, no real Fal call. |
