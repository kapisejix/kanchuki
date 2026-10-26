# H4 — Customer passport + storefront (hacker mode)

- **Task:** H4 (`task-4-hacker.md`), surface = `(shopper)` pages, `/v1/public/*`, `apps/web/src/app/api/*` proxies
- **Date:** 2026-10-26 · branch `fix/team-otp-fail-closed-rc085`
- **Target:** code-only review. No local API/web started (the `.env` files point at the prod-region pooler/API). No local harness run this session, so nothing is marked "Confirmed"; every result is "Plausible" or "Not exploitable" with file:line proof.
- **Tooling note:** `rtk` is not installed; plain `grep`/`sed`/`find` used.
- **Commands run:** `find apps/web/src/app/api -name route.ts`; `grep -rn phone|customer_account_id|rateLimit|dangerouslySetInnerHTML|searchParams.get(next|redirect…)` over `apps/api/src/routes/public`, `apps/web/src`; targeted `sed -n` reads of the files cited below.

## Result summary

| Severity | Count | IDs |
| --- | --- | --- |
| High | 1 | H4-1 |
| Medium | 3 | H4-2, H4-3, H4-4 |
| Low | 4 | H4-5, H4-6, H4-7, H4-8 |
| Not exploitable (checked) | 7 | listed at the end |

All 8 findings are **Plausible (code-only)**. None is applied.

## Findings table

| ID | Sev | file:line | Issue | Fix |
| --- | --- | --- | --- | --- |
| H4-1 | High | `apps/api/src/routes/public/public-retailers/public-retailers-leads.ts:32-34`, `:91-111` | Leads "passport path" takes `customer_account_id` from the request **body**, with no session check. Anyone holding a shopper's account id can copy that shopper's real phone, name and gender into **any** store's CRM, and forge WhatsApp consent | Use the passport session cookie; the proxies forward the cookie |
| H4-2 | Medium | `apps/api/src/routes/customers.ts:108-111`, `:126-131` | `GET /v1/customers` and `/:id` spread the whole row. A masked staff member still gets `phone_hash` (unsalted SHA-256 of a 10-digit number, which can be brute-forced) plus `customer_account_id` (the H4-1 input). This bypasses RC-066 masking | Explicit strip of `phone_hash` and `customer_account_id` |
| H4-3 | Medium | `apps/api/src/routes/public/public-reviews.ts:87-104`, `:126`, `:204`, `:108-118` | Anonymous product/store reviews keyed on an **unverified** phone with no OTP. An attacker can post unlimited fake ratings, overwrite a real customer's review, and rename that customer in the retailer CRM (`update: name ? { name } : {}`). Eligibility is stubbed to `true`, and only the global per-IP limit applies | Require a passport session; never update `Customer.name`; add a per-route limit |
| H4-4 | Medium | `public-retailers-leads.ts:149-188` | Legacy unverified lead form upserts on phone. An anonymous caller can overwrite `name`/`gender` of an existing customer and set `consent_given=true` for any phone. That is forged marketing consent (DPDP), and it can put the retailer's WhatsApp number at risk | `update` must not touch an existing row's name/gender/consent; keep create-only |
| H4-5 | Low | `apps/api/src/routes/public/passport/passport-wishlist.ts:65-81`, `passport-activity.ts:80-97`, `:115-150` | Wishlist, recently-viewed and events take a client `retailer_id` that is never checked against the product. A signed-in shopper can write up to 50 events/request into any retailer's engagement analytics | Derive `retailer_id` from `product.retailer_id`; drop mismatches |
| H4-6 | Low | `apps/api/src/routes/public/near-me.ts:66`, `:91` | Near-me returns the retailer's login `phone` next to `whatsapp_number`. Every other public route sends only `enquiryPhone()` (`public-helpers.ts:26`) | Return `phone: enquiryPhone(r)`, drop `whatsapp_number` |
| H4-7 | Low | `passport-helpers.ts:37-44`, `passport-otp.ts:139-150`, `public-search.ts:53-56` | The passport session id is the DB primary key in plaintext, so any DB/backup/log read of `passport_sessions` gives live 180-day shopper sessions | Store `sha256(sessionId)`; look up by hash |
| H4-8 | Low | `passport-otp.ts:53` (no `config.rateLimit`), `msg91-otp.ts:43-51` | `POST /passport/otp/send` has only the per-phone 60 s cooldown and the global 200/min/IP limit. One IP can trigger roughly 200 SMS/min across different numbers (SMS pumping) | Per-route `rateLimit { max: 5, timeWindow: 60_000 }`. Depends on the T2.5 F1 client-IP fix |

## Per-finding detail

### H4-1 Leads route trusts body `customer_account_id` (shopper phone exfiltration + forged consent)             Severity: High
Attacker: retailer or staff of any store (anyone holding a shopper's `CustomerAccount.id`)
Goal: Get a shopper's real phone number into a CRM the attacker controls, without the shopper's consent; forge the consent record.
Preconditions: (a) the victim's account id. A retailer's own `/v1/customers` list returns it for every shopper who ever shared contact with that store (H4-2). A salesperson/manager whose phone view is masked gets it too. (b) Any store the attacker owns, e.g. a fresh trial retailer account with its own `public_slug`.
Steps:
1. As staff of store A: `GET /v1/customers` and read `customer_account_id` of a row whose `phone` is masked.
2. As the owner of store B (attacker's own account): `POST /v1/public/retailers/<B-slug>/leads` with body `{"customer_account_id":"<victim id>","share_contact":true}`, no cookie.
3. `GET /v1/customers` as B's owner returns the victim's unmasked phone, name and gender, with `consent_given=true`, `source=QR_SCAN`, plus a `CustomerStoreVisit` with `whatsapp_consent=true`.
Impact: Breaks phone masking (RC-066) and the shopper privacy model, and writes a false DPDP consent record under the victim's identity. It also forges store visits and links the shopper to arbitrary stores, which feeds F-036 push targeting (`CustomerStoreVisit` decides which stores may push).
Evidence:
- `public-retailers-leads.ts:31-34`: `if (body.customer_account_id && typeof body.customer_account_id === 'string') { … const customerId = body.customer_account_id;`. No `getPassportSession` anywhere in the file.
- `:36-41`: the only check is that the account exists. It returns `'Invalid passport session'`, which also works as an existence oracle.
- `:91-111`: `prisma.customer.upsert` with `phone: normalizedPhone` (from `account.phone`), `consent_given: true`, `customer_account_id: customerId`.
- `:115-121`: `whatsapp_consent: true`.
- Caller `apps/web/src/app/[store]/components/PassportSheet.tsx:55-60` sends `account.id` from the client. Proxies `apps/web/src/app/api/[store]/leads/route.ts:14` and `api/store/[slug]/leads/route.ts:9` do not forward the cookie.
Fix:
```diff
--- a/apps/api/src/routes/public/public-retailers/public-retailers-leads.ts
+++ b/apps/api/src/routes/public/public-retailers/public-retailers-leads.ts
@@
-    // ── Passport path: verified identity ──
-    if (body.customer_account_id && typeof body.customer_account_id === 'string') {
-      const shareContact = body.share_contact === true;
-      const customerId = body.customer_account_id;
-
-      // Verify the account exists
-      const account = await prisma.customerAccount.findUnique({
-        where: { id: customerId, deleted_at: null },
-      });
-      if (!account) {
-        throw validationError('Invalid passport session');
-      }
+    // ── Passport path: identity comes from the session cookie, never the body ──
+    if ('customer_account_id' in body || 'share_contact' in body) {
+      const session = await getPassportSession(request.headers.cookie || '');
+      if (!session || session.customer_account.deleted_at) {
+        return reply.status(401).send({ error: { code: 'NO_SESSION', message: 'Not authenticated' } });
+      }
+      const shareContact = body.share_contact === true;
+      const customerId = session.customer_account_id;
+      const account = session.customer_account;
```
(import `getPassportSession` from `../passport/passport-helpers.js`), and in both web proxies:
```diff
-      headers: { 'Content-Type': 'application/json' },
+      headers: {
+        'Content-Type': 'application/json',
+        cookie: request.headers.get('cookie') || '',
+      },
```
`PassportSheet.tsx` can keep sending `customer_account_id` (ignored) or drop it. Add a test: a body id with no cookie answers 401 and writes no `Customer` row.
Status: Plausible (code-only; no harness run)

### H4-2 `/v1/customers` leaks `phone_hash` + `customer_account_id` to masked staff             Severity: Medium
Attacker: staff (salesperson / manager / delegate whose phone view is masked)
Goal: Recover customers' full phone numbers despite RC-066 masking, and harvest account ids for H4-1.
Preconditions: Staff login to a store.
Steps:
1. `GET /v1/customers?limit=100`. Each row carries `phone` (masked), `phone_hash` and `customer_account_id` because of `...c`.
2. Offline, compute SHA-256 over all Indian mobiles (`[6-9]\d{9}`, 4×10⁹ candidates; minutes on one GPU) and match `phone_hash`.
Impact: Every customer's phone is recoverable by staff, which defeats RC-066/RC-068 masking. It also supplies the H4-1 input.
Evidence: `customers.ts:88-111` (`findMany` with no `select`, then `{ ...c, phone: maskPhoneForRequest(...) }`); `:126-131` (same on `/:id`). Unsalted hash: `public-reviews.ts:89`, `public-retailers-leads.ts:170` (`createHash('sha256').update(normalizedPhone)`).
Fix:
```diff
-    const page = (hasMore ? customers.slice(0, limit) : customers).map((c) => ({
-      ...c,
-      phone: maskPhoneForRequest(request, c.phone),
-    }));
+    const page = (hasMore ? customers.slice(0, limit) : customers).map(
+      ({ phone_hash: _h, customer_account_id: _a, ...c }) => ({
+        ...c,
+        phone: maskPhoneForRequest(request, c.phone),
+      }),
+    );
```
Do the same on `GET /:id` (`:131`). Grep other `prisma.customer.find*` callers that return rows to clients (`collections.ts:111/438/668`) and apply the same strip. A shared `toCustomerDto()` would be the one place.
Status: Plausible (code-only). Cross-ref H2 (masking) and RC-066.

### H4-3 Anonymous reviews: fake ratings, overwrite a real customer's review, rename CRM customers             Severity: Medium
Attacker: anonymous
Goal: Tank (or inflate) a store/product rating; edit what a real customer wrote; deface the retailer's customer list.
Preconditions: A `product_id` or `retailer_id`, both public in storefront JSON. For the overwrite: the victim customer's phone.
Steps:
1. `POST /v1/public/reviews/store` `{"retailer_id":"<id>","phone":"9000000001","rating":1,"comment":"scam"}`. Repeat with `9000000002…` (global 200/min/IP only), and each call recomputes `retailers.avg_rating`.
2. With a known customer phone: same call with `"name":"<anything>"`. The existing `Customer.name` is overwritten (`update: name ? { name } : {}`), and that customer's existing review is replaced (`existing ? update`).
Impact: Rating manipulation on the public `/stores` listing and storefront; integrity loss in the retailer CRM; an unlimited supply of fake `Customer` rows with `source: 'MANUAL'`. The phone is not checked with `isValidIndianPhone`, only `min(10).max(15)`.
Evidence: `public-reviews.ts:14-28` (schemas, no OTP field); `:87-104` (`findOrCreateCustomer` upsert, `update: name ? { name } : {}`); `:108-118` (eligibility always `{ eligible: true }`); `:126`/`:204` (no `config.rateLimit`).
Fix: require the passport session and key the review on `CustomerAccount`, not a typed phone:
```diff
   server.post('/reviews/store', { schema: …, config: { rateLimit: { max: 5, timeWindow: 60_000 } } }, async (request, reply) => {
+    const session = await getPassportSession(request.headers.cookie || '');
+    if (!session) return reply.status(401).send({ error: { code: 'NO_SESSION', message: 'Sign in to review' } });
     const body = SubmitStoreReviewSchema.parse(request.body);
-    const customer = await findOrCreateCustomer(body.retailer_id, body.phone, body.name);
+    const customer = await findOrCreateCustomer(body.retailer_id, session.customer_account.phone, body.name);
```
and in `findOrCreateCustomer` change `update: name ? { name } : {}` to `update: {}`. Drop `phone` from both schemas. Same change on `/reviews/product`. The web `c/[slug]/components/StarPicker.tsx` flow must then sign in first. This is a product decision; it needs the owner's OK.
Status: Plausible (code-only)

### H4-4 Legacy lead form overwrites existing customers and forges consent             Severity: Medium
Attacker: anonymous
Goal: Rewrite a store's customer records and mark arbitrary phones as consented to WhatsApp marketing.
Preconditions: A store slug (public).
Steps: `POST /v1/public/retailers/<slug>/leads` `{"name":"x","phone":"98XXXXXXXX","gender":"MALE","consent":true}` (no cookie) for any phone. An existing row gets `name`/`gender` overwritten and `consent_given=true, consent_at=now`.
Impact: False consent records (DPDP Act); the retailer may message people who never opted in, which can get their WhatsApp number reported. CRM records are defaced. No per-route rate limit.
Evidence: `public-retailers-leads.ts:149-161` (unverified schema), `:166-186` (upsert `update: { name, gender, consent_given: true, consent_at: new Date(), source: 'QR_SCAN' }`); `:15` (no `config.rateLimit`).
Fix:
```diff
-      update: {
-        name: legacyBody.data.name,
-        gender: legacyBody.data.gender,
-        consent_given: true,
-        consent_at: new Date(),
-        source: 'QR_SCAN',
-      },
+      // Unverified form: never rewrite or grant consent on an existing record.
+      update: {},
```
Add `{ config: { rateLimit: { max: 10, timeWindow: 60_000 } } }` to the route. Long-term: retire the legacy path in favour of the passport path from H4-1.
Status: Plausible (code-only)

### H4-5 Passport wishlist / recently-viewed / events accept any `retailer_id`             Severity: Low
Attacker: shopper (any passport account, free via OTP)
Goal: Poison a competitor's (or any) retailer's engagement analytics (F-037) and wishlist counts.
Preconditions: A passport session.
Steps: `POST /api/passport/events` `{"events":[{"type":"<mapped type>","retailer_id":"<victim retailer>","product_id":"<any>"}, …×50]}`, repeated under the global limit.
Impact: Fake interactions in another retailer's engagement dashboard and admin behavior analytics.
Evidence: `passport-wishlist.ts:65-81`, `passport-activity.ts:80-97`, `:115-150` (`retailer_id: event.retailer_id`, never checked against the product).
Fix: look up `product.retailer_id` (one `findMany` over the batch's `product_id`s) and use it; drop rows that don't match. Add `config.rateLimit` (e.g. 30/min) on `/events`.
Status: Plausible (code-only)

### H4-6 `near-me` exposes the retailer's login phone             Severity: Low
Attacker: anonymous scraper
Goal: Harvest retailers' personal/login mobile numbers (the OTP login identity) at scale by sweeping lat/lng.
Preconditions: None.
Steps: `GET /v1/public/near-me?lat=…&lng=…` over a grid of points.
Impact: Personal numbers of retailers who set a separate business WhatsApp number become public.
Evidence: `near-me.ts:66` selects `phone`, `:91` returns `phone: r.phone` plus `whatsapp_number`. Every other public route uses `enquiryPhone()` (`public-helpers.ts:26-27`), which only falls back to `phone` when no WhatsApp number exists.
Fix:
```diff
-          phone: r.phone,
-          whatsapp_number: r.whatsapp_number,
+          phone: enquiryPhone(r),
```
Status: Plausible (code-only; route path and caller not checked)

### H4-7 Passport session ids stored in plaintext             Severity: Low
Attacker: none (insider / anyone with read access to DB, a backup, or query logs)
Goal: Take over shopper sessions (180-day sliding TTL).
Preconditions: Read access to `passport_sessions`.
Steps: Copy a `passport_sessions.id` value into a `kanchuki_passport` cookie.
Impact: Full shopper passport access (profile, wishlist, export, delete).
Evidence: `passport-otp.ts:139-150` (`id: sessionId` raw); `passport-helpers.ts:41-44` (`findUnique({ where: { id: sessionId } })`); `public-search.ts:53-56` reads the same way.
Fix: store `createHash('sha256').update(sessionId).digest('hex')` as the id and hash the cookie value before each lookup (3 call sites). This needs a one-off migration to revoke existing sessions, so it requires owner approval.
Status: Plausible (code-only)

### H4-8 Shopper OTP send has no per-route limit (SMS pumping)             Severity: Low
Attacker: anonymous
Goal: Burn MSG91 SMS credit by sending OTPs to many different numbers.
Preconditions: None.
Steps: `POST /api/passport/otp/send` `{"phone":"<n>"}` for different numbers, up to the global per-IP limit.
Impact: SMS cost.
Evidence: `passport-otp.ts:53` (`server.post('/otp/send', async …)`, no `config`); the only guards are the per-phone 60 s cooldown (`msg91-otp.ts:43-51`) and the global per-IP limit. Compare `staff-invite.ts:117` (`max: 3`).
Fix: `server.post('/otp/send', { config: { rateLimit: { max: 5, timeWindow: 60_000 } } }, …)`. Its effectiveness depends on T2.5 F1 (`trustProxy` / real client IP); without that fix the limit buckets every user behind the proxy IP.
Status: Plausible (code-only). Cross-ref H1 (OTP limits), T2.5 F1.

## Not exploitable (checked)

| Attack | Result | Proof |
| --- | --- | --- |
| Passport proxy path traversal / SSRF to other API paths | Not exploitable | `apps/web/src/app/api/passport/[...path]/route.ts:13,19,37-39` exact-match allowlist (`PATCH` only `style-quiz`), `:46` `encodeURIComponent` per segment, fixed host `API_URL`; Set-Cookie forwarded via `getSetCookie()` (`:66`), `cache-control: private, no-store` (`:62`) |
| Read/edit another shopper's passport, preferences, stores, wishlist, export/delete, quiz, try-on consent | Not exploitable | every handler uses `session.customer_account_id` from `getPassportSession(cookie)`: `passport-stores.ts:18,55,73,98,132`, `passport-wishlist.ts:19,73,101`, `passport-preferences.ts:65`, `passport-data.ts:24,130`, `passport-style-quiz.ts:46`, `passport-tryon.ts:47,63` |
| Hijack/blind another shopper's push subscription | Not exploitable | `passport-push.ts:59-71` rebinding needs the same `p256dh`+`auth`; unsubscribe scoped to `customer_account_id` (`:118`) |
| SSRF via push endpoint | Not exploitable | `jobs/customer-push.ts:36-46` https-only, no port, host-suffix allowlist (FCM/Mozilla/Apple/WNS) |
| Widget token for phone A logs in as phone B | Not exploitable | `msg91-otp.ts:353-358` requires exact match of verified digits vs claimed phone |
| Stored XSS via JSON-LD (store/product/collection names) | Not exploitable | all storefront `dangerouslySetInnerHTML` go through `ldJson()` or `.replace(/</g,'\\u003c')` (`[store]/page.tsx:112`, `[store]/categories/page.tsx:259`, `[store]/[collection]/page.tsx:92`, product page `:111`, `stores/page.tsx:74`); the rest is React-escaped text (RC-040/RC-077) |
| Open redirect (`?next=`, `?redirect=`) / `javascript:` hrefs on storefront | None found | no `searchParams.get('next'|'redirect'|'return'|'url')` in `apps/web/src` outside admin; `my-style/ShortlistBar.tsx:35,105` URL is server-built (`my-style/lib.ts:93`); `StarPicker.tsx:177` is a fixed Google host with `encodeURIComponent(placeId)` (`public-reviews.ts:63`) |

Anonymous AI cost routes: `/stylist` 10/min (`public-stylist.ts:83`), my-style analyze 5/min (`public-my-style-analyze.ts:69`), feed/complete-look 20–30/min (`public-my-style.ts:116,309,411`). These are per-IP only, so they inherit T2.5 F1 (RC-079 known); no new finding.

## Not checked / follow-ups

- No local Fastify `inject()` harness this session (time box). H4-1, H4-3 and H4-4 are the ones to confirm first: they need a Prisma stub for `customerAccount.findUnique` / `customer.upsert` and nothing else.
- Not read: `public-collections.ts` enquiry path beyond the rate-limit line (RC-066/078 known), `public-search.ts` result shape, `discover-stores.ts`, the service worker (`sw.ts` cache rules for `/api/passport/*`, playbook §2 last row), and the `(shopper)` page components beyond the href grep.
- Retailer/customer enumeration: ids are cuid (`schema.prisma:2767`), and `/stores` + `near-me` list stores by design. Slug enumeration was not measured.
- H4-1's `validationError('Invalid passport session')` (`:40`) is also an account-id existence oracle; it disappears with the H4-1 fix.

## Fix diffs status

H4-1, H4-4 (Batch 3, part 1) and H4-2, H4-5, H4-6 (Batch 3, part 2) are **applied**; see below. H4-3 is **applied** (Batch 3, part 3, RC-098, needs migration 139). H4-7 and H4-8 are still proposed, not applied. Each shipped fix needs an RC-### entry (next free: RC-098).

## Fixes applied 2026-10-26 (Batch 3, part 1: H4-1, H4-4) — before / after

Branch `fix/team-otp-fail-closed-rc085`, committed as `f1d50246`, not deployed.

| Finding | RC | Before | After |
| --- | --- | --- | --- |
| H4-1 | RC-093 | `POST …/leads` with a body `customer_account_id` and no cookie: 201, victim's phone and name written to the caller's CRM with consent, `ConsentEvent` under the victim's id | 401 `NO_SESSION`; identity only from `getPassportSession`; a differing body id is ignored; both web proxies forward the cookie |
| H4-4 | RC-094 | legacy form for an existing phone overwrote name and gender and set `consent_given = true` | `update: {}`: existing row untouched, create path unchanged |

Tests: `public-retailers-leads.test.ts` now 7 (was 2). Red first: 6 of 7 failed on the unfixed route (the two older tests only because they no longer send a body id; the four H4-1 tests and the H4-4 test are the real proof). Green after. `security.test.ts` + `admin.login.test.ts` pass; full API suite 2439 passed / 5 skipped; `tsc` clean; biome clean on the three touched files.

Not verified: no browser run with a real `kanchuki_passport` cookie through the Next proxies. API and web must deploy together. `PassportSheet.tsx` still sends `customer_account_id`; the API ignores it.

## Fixes applied 2026-10-26 (Batch 3, part 2: H4-5, H4-2, H4-6, RC-094 follow-up) — before / after

Branch `fix/team-otp-fail-closed-rc085`, not committed, not deployed.

| Finding | RC | Before | After |
| --- | --- | --- | --- |
| RC-094 follow-up (automated security review) | RC-094 | legacy form answered `{id, name}` of the stored customer for an existing phone: a phone→name lookup | fixed `{ id: null, name: <submitted> }`; `select` removed from the upsert |
| H4-5 | RC-095 | wishlist / recently-viewed / `/events` stored the body `retailer_id`; any shopper could write 50 events per request into any retailer's analytics | owner from the product row (`productRetailerMap`); wishlist unknown product 404, recently-viewed 204; `/events` drops product events whose retailer is not the owner and store events for non-existent retailers; `/events` 30/min |
| H4-2 | RC-096 | `/v1/customers` GET/PUT/POST returned `phone_hash` and `customer_account_id`; `PUT` also an unmasked phone | `toCustomerDto` strips both and masks the phone on all four handlers |
| H4-6 | RC-097 | near-me returned `phone` (login) plus `whatsapp_number` | `phone: enquiryPhone(r)`, no `whatsapp_number` key |

Tests, red first: leads +1 (1 red); passport-events +4 and new passport-retailer-ownership 4 (8 red); new customers-dto 5 (4 red, the `PUT` test was written with the fix and never seen red); new near-me 2 (1 red). Then green. The two older wishlist / recently-viewed tests in `passport-otp.test.ts` needed a `prisma.product` mock after the fix (2 red until updated). `security.test.ts` + `admin.login.test.ts` 16/16; full API suite 2456 passed / 5 skipped (was 2439 / 5); `tsc` clean; biome write run on the touched API files.

Not done / unverified: H4-3 (anonymous reviews) was implemented afterwards, see the section below. Store-level events can still be attributed to any real retailer (RC-095 known gap). No real-device or browser run. `apps/web/src/app/api/store/[slug]/leads/route.ts` biome import-order / format warnings are pre-existing and left alone.


## Fixes applied 2026-10-26 (Batch 3, part 3: H4-3) — before / after

Branch `fix/team-otp-fail-closed-rc085`, not committed, not deployed. **Migration 139 (`139_review_account_identity`) is written, not applied: the owner applies it before the API deploys, or every review POST 500s.**

| Finding | RC | Before | After |
| --- | --- | --- | --- |
| H4-3 | RC-098 | `POST /v1/public/reviews/product\|store` with a body `phone` and no cookie: 201. Fake ratings from any number (global 200/min/IP only), a real customer's review replaced by typing their phone, and their `Customer.name` rewritten in the retailer CRM | 401 `NO_SESSION` without a passport session; identity only from `getPassportSession`; body `phone` / `customer_account_id` ignored; `upsert` on the session account (one review per account per product/store); `Customer` never read or written; 10/min per route; response is an explicit `select` with no account id. Reviewer name is `display_name` on the review row (form value, else account name), shown in the app and on the storefront |
| Google | RC-098 | Google link only for ratings ≥ 4 | "Also post on Google" link (store write-review URL from `google_place_id`) for any rating when a place id exists; ≤ 3 also keeps the private-feedback note. No Google API write; F-022 stays Planned |

Tests: new `public-reviews.test.ts` 17 cases, 15 red before the fix, 17/17 after. New web `ReviewForm.test.tsx` (3 cases; written together with the fix, not seen red). `security.test.ts` + `admin.login.test.ts` + `routes/public` 374/374; full API suite 2473 passed / 5 skipped (was 2456 / 5); API tsc clean; web tsc clean; biome clean on the new and rewritten files.

Other changes: web proxy `/api/reviews/product` forwards the cookie; `ReviewForm` loses the phone field and the "consent to being contacted" checkbox (nothing is shared with the retailer any more) and shows a sign-in prompt on 401; moderation screens (mobile `growth/ratings.tsx`, admin `ratings/page.tsx`) show `display_name ?? customer.name`.

Not done / unverified: no browser or device run. Old phone-keyed rows are not attributed to any account, so a shopper who reviewed before can leave a second review. There is no store-review UI in the web app, so `POST /reviews/store` is fixed at the API only. `/my-profile` as the sign-in target is assumed, not clicked through. Mobile `tsc` shows 3 pre-existing typed-route errors (`/enquiries`, `/enquiry-try-on`) outside these files.
