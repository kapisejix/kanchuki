# H2 — Authorization / IDOR (API)

- **Task:** H2 (hacker mode), `docs/tasks/testing/task-4-hacker.md`
- **Date:** 2026-10-26
- **Branch:** `fix/team-otp-fail-closed-rc085` (no code changed)
- **Target:** **code-only review.** No local/staging DB was available, and `apps/api/.env` points at the prod-region pooler, so the API was not started. Because of that, every attack below is marked Plausible or Not exploitable. None is marked Confirmed.
- **Tooling note:** `rtk` is not installed, so plain `grep`/`sed` were used.
- **Commands run:** targeted `grep -rn` / `sed -n` over `apps/api/src/plugins/auth.ts`, `routes/{products,collections,customers,categories,catalog-import,growth,retailers,public}`, and `packages/db/prisma/schema.prisma` (Retailer model). Every finding cites file:line.

## Result summary

| Severity | Count | IDs |
| --- | --- | --- |
| Critical | 0 | — |
| High | 0 | — |
| Medium | 2 | H2-1, H2-2 |
| Low | 4 | H2-3, H2-4, H2-5, H2-6 |
| Not exploitable (checked, pass) | 9 attacks | see §Not exploitable |

All 6 findings are **Plausible** (code-only). No cross-tenant read of customer PII was found, and the RC-066 phone masking holds on every staff-reachable route that was checked.

## Findings table

| ID | Sev | file:line | Issue | Fix |
| --- | --- | --- | --- | --- |
| H2-1 | Medium | `routes/growth/growth-campaigns/growth-campaigns-helpers.ts:109-143`, `growth-campaigns-crud.ts:25,41,119` | A/B campaign `ab_variants[].product_ids` (and campaign `product_ids`) are never checked against `retailer_id`. Retailer A can put retailer B's products into A's HIDDEN variant collection, and the public collection page then shows them under A's store. | Filter ids by `retailer_id` in `syncVariantCollections` and in create/update |
| H2-2 | Medium | `plugins/auth.ts:272-274, 287-291, 308-310, 262` | The support-session comment says no destructive or outbound action is reachable, but `rw('/v1/products')` matches `POST /v1/products/bulk-delete` and `rw('/v1/collections')` matches `POST /v1/collections/:id/bulk-send` (WhatsApp send) plus enquiry take/assign. The catalog delegate's `* /v1/products` also matches delete and bulk-delete. | Deny list checked before the support and catalog-delegate allowlists |
| H2-3 | Low | `routes/products/products-studio.ts:99`, `products-pro-cleanup.ts:129`, `products-ai.ts:17` | Paid-AI product routes (studio shoot, pro cleanup, retag) have no role gate, so catalog and support delegates can spend the retailer's quota. Same shape as RC-068, which was fixed for try-on only. | Shared `isDelegate()` guard → 403 |
| H2-4 | Low | `routes/products/products-crud.ts:296-320` vs `:61-72` | `PUT /products/:id` spreads `...rest` into the update, so `section_id`, `category_id` and `background_image_id` are not ownership-checked. Create checks the first two. | Copy the create-path checks into PUT |
| H2-5 | Low | `routes/retailers/retailers-profile.ts:64-87` | `GET /retailers/me` is reachable by manager, salesperson and every support scope, and returns the full Retailer row minus only the WhatsApp token: encrypted GMB/FB-Ads/Google-Ads tokens, KYC Aadhaar/GST R2 keys, `auth_user_id` | Prisma `omit` of the secret and KYC columns |
| H2-6 | Low | `routes/customers.ts:44-49` | `POST /customers` (salesperson-allowed) answers "A customer with this phone number already exists". That lets a salesperson check whether any phone number is already a customer, even though the list masks phones. | Owner gets the message; staff get a generic error |

---

### H2-1 Cross-tenant products injected into own A/B variant collection   Severity: Medium
Attacker: retailer (any plan with campaigns), or their manager (allowlisted at `auth.ts:177-180`)
Goal: show a competitor's catalog (photos, names, prices, including SOLD/RESERVED items) under the attacker's store link and take the enquiries.
Preconditions: retailer B's product ids. These are public: storefront and collection pages return product ids.
Steps:
1. Collect B's product ids from `GET /v1/public/...` storefront responses.
2. `POST /v1/growth/campaigns` with
   ```json
   {"type":"…","name":"x","message_template":"x","audience":{…},
    "ab_variants":[{"label":"A","message_template":"x","send_pct":50,"product_ids":["<B_prod_1>","<B_prod_2>"]},
                   {"label":"B","message_template":"x","send_pct":50,"product_ids":["<B_prod_3>"]}]}
   ```
3. The API creates a HIDDEN collection under `retailer_id = A` with `collectionProduct` rows pointing at B's products (`growth-campaigns-helpers.ts:134-143`). On update it uses `deleteMany` + `createMany` with the same unchecked ids (`:120-127`).
4. Open the variant link. `routes/public/public-collections.ts:49` accepts HIDDEN, and `:118-121` lists `collectionProduct` rows filtered only by `collection_id` + `buildProductFilterWhere`, with no `retailer_id`. The products render with A's store header, and enquiries go to A (`:259-268` uses `found.retailer_id`).
Impact: content theft / store impersonation, and B's enquiries diverted to A. No PII is exposed (`toPublicProductSummary` maps the fields).
Evidence: compare `collections.ts:100-107`. The normal collection create does verify `retailer_id`; the A/B path skips it. Campaign `product_ids` (`growth-campaigns-crud.ts:119`) is also stored unchecked.
Fix:
```diff
--- a/apps/api/src/routes/growth/growth-campaigns/growth-campaigns-helpers.ts
+++ b/apps/api/src/routes/growth/growth-campaigns/growth-campaigns-helpers.ts
@@ async function upsertVariant(
     const title = `${campaignName} — ${label}`;
-    const productIds = variant.product_ids ?? [];
+    // Same rule as POST /collections: only this retailer's live products.
+    const owned = await prisma.product.findMany({
+      where: { id: { in: variant.product_ids ?? [] }, retailer_id: retailerId, deleted_at: null },
+      select: { id: true },
+    });
+    const ownedIds = new Set(owned.map((p) => p.id));
+    const productIds = (variant.product_ids ?? []).filter((id) => ownedIds.has(id));
```
Also reject unknown ids in campaign create/update (`growth-campaigns-crud.ts` near `:96` and `:206`) with the same `findMany` + `validationError('One or more products not found in your catalog')` used in `collections.ts:104-106`.
Status: Plausible

### H2-2 Support session and catalog delegate reach bulk-delete and WhatsApp bulk-send   Severity: Medium
Attacker: staff (Kanchuki team member with an approved support session, or an assigned catalog-upload delegate)
Goal: soft-delete up to 100 products per call, or send WhatsApp messages to the retailer's customers through the retailer's WABA (Meta charges the retailer), outside what the session was granted for.
Preconditions: a live support grant (scope GROWTH or MAINTENANCE), or a live CATALOG_UPLOAD ticket. Support sessions are behind a switch that is currently OFF.
Steps:
1. Using the support token: `POST /v1/products/bulk-delete {"ids":[…100 ids…]}`. `matchesRules` treats `rw('/v1/products')` as a prefix match (`auth.ts:242-247`), so `POST /v1/products/bulk-delete` passes. The handler (`products-crud.ts:423-449`) checks only `retailer_id`.
2. Scope GROWTH: `POST /v1/collections/<id>/bulk-send {"customer_ids":[…]}`. `rw('/v1/collections')` (`auth.ts:290`) matches, and the handler sends through the Graph API (`collections.ts:642-675`). `POST /v1/collections/enquiries/:id/take` and `PATCH /v1/collections/enquiries/:id/assign` also match.
3. Catalog delegate: `DELETE /v1/products/:id` and `POST /v1/products/bulk-delete` match `* /v1/products` (`auth.ts:262`).
Impact: products disappear from the storefront (soft delete; the owner can restore from trash, and purge stays owner-only at `products-trash.ts:54`). Real WhatsApp messages go out in the retailer's name at the retailer's cost. The comment at `auth.ts:272-274` ("No DELETE rule exists below") is true for the HTTP verb but not for the effect. Mutations are audit-logged (`auth.ts:415-465`), so this is detectable.
Evidence: `auth.ts:273-274`, `:287-291`, `:308-310`, `:262`; `staff-access.test.ts:138` pins bulk-send as denied for **staff**, but no test covers support or catalog delegates.
Fix (deny list evaluated before both delegate allowlists; smallest diff, keeps `rw()`):
```diff
--- a/apps/api/src/plugins/auth.ts
+++ b/apps/api/src/plugins/auth.ts
@@
+// Destructive / outbound actions no delegate may take, whatever the allowlist
+// prefix says — `rw('/v1/products')` would otherwise match POST …/bulk-delete.
+const DELEGATE_DENIED_ROUTES: StaffRule[] = [
+  { method: 'DELETE', path: '/v1/products' },
+  { method: 'POST', path: '/v1/products/bulk-delete', exact: true },
+  { method: 'POST', path: '/v1/collections/:id/bulk-send', exact: true },
+  { method: 'POST', path: '/v1/collections/enquiries/:id/take', exact: true },
+  { method: 'PATCH', path: '/v1/collections/enquiries/:id/assign', exact: true },
+];
+
 export function catalogDelegateCanAccess(method: string, routeUrl: string): boolean {
-  return matchesRules(method, routeUrl, CATALOG_DELEGATE_ALLOWED_ROUTES);
+  return (
+    !matchesRules(method, routeUrl, DELEGATE_DENIED_ROUTES) &&
+    matchesRules(method, routeUrl, CATALOG_DELEGATE_ALLOWED_ROUTES)
+  );
 }
@@ export function supportDelegateCanAccess(
-  return matchesRules(method, routeUrl, SUPPORT_SCOPE_ROUTES[scope]);
+  return (
+    !matchesRules(method, routeUrl, DELEGATE_DENIED_ROUTES) &&
+    matchesRules(method, routeUrl, SUPPORT_SCOPE_ROUTES[scope])
+  );
```
Add to `plugins/staff-access.test.ts`: each denied route returns `false` for `catalogDelegateCanAccess` and for `supportDelegateCanAccess` under every scope.
Owner decision: whether a catalog delegate may single-delete products during an on-site upload (fixing mis-shots). If yes, drop the `DELETE` row and keep only bulk-delete.
Status: Plausible

### H2-3 Delegates spend paid-AI quota (RC-068 shape outside try-on)   Severity: Low
Attacker: staff (catalog delegate; support delegate GROWTH/MAINTENANCE, since `rw('/v1/products')` includes POST)
Goal: use up the retailer's monthly STUDIO_SHOOT / pro-cleanup / tagging quota, which costs real money (FLUX Kontext, Claude Vision).
Steps: `POST /v1/products/<id>/photos/<photoId>/studio-shoot`, `POST /v1/products/pro-cleanup`, `POST /v1/products/<id>/retag`, repeated until the quota is gone. None of the three handlers checks the role (`grep isRealOwner|catalogDelegate|supportDelegate` finds nothing in `products-studio.ts`, `products-pro-cleanup.ts`, `products-ai.ts`).
Impact: the retailer's plan quota is used up by someone who is not the retailer; the AI bill is bounded by the quota. Salesperson is already blocked (GET-only allowlist). Managers are allowed by design (same decision as RC-068 try-on).
Evidence: `products-tryon.ts:156-162` (`requireTryOnStaff`) is the only route that blocks delegates; it bundles the `VIRTUAL_TRY_ON_V2` flag check, so it cannot be reused as-is.
Fix:
```diff
--- a/apps/api/src/plugins/auth.ts
+++ b/apps/api/src/plugins/auth.ts
+/** Delegated sessions (catalog upload, support) — never the retailer themselves. */
+export function isDelegate(request: FastifyRequest): boolean {
+  return !!request.catalogDelegate || !!request.supportDelegate;
+}
```
and at the top of each of the three handlers:
```diff
+    if (isDelegate(request)) throw forbidden('Only the shop team can run AI edits');
```
(Retag on a mis-tagged upload is arguably in scope for a catalog delegate. If so, gate only studio-shoot + pro-cleanup.)
Status: Plausible

### H2-4 Product update skips section/category/background ownership checks   Severity: Low
Attacker: retailer
Goal: link own product to another retailer's `category_id` / `section_id` / `background_image_id`.
Steps: `PUT /v1/products/<own_id> {"section_id":"<B_section>","category_id":"<B_category>"}`. `UpdateProductSchema = CreateProductSchema.partial()` (`products-helpers.ts:101-104`) keeps both fields, and the handler writes `...rest` (`products-crud.ts:307-320`) with no check. Create does check (`:61-72`).
Impact: the response `include: { section: { select: { name: true } } }` leaks B's section/rack name. If B's category pages filter by `category_id` alone, A's product appears in B's category. **Could not verify** the storefront category query in this session. `background_image_id` would let A's cleanup job read B's background image.
Fix:
```diff
--- a/apps/api/src/routes/products/products-crud.ts
+++ b/apps/api/src/routes/products/products-crud.ts
@@ server.put('/:id', …
     const { metadata, stock, ...rest } = body.data;
+    if (rest.section_id) {
+      const section = await prisma.storeSection.findFirst({
+        where: { id: rest.section_id, retailer_id: request.retailerId },
+      });
+      if (!section) throw forbidden('Section does not belong to your store');
+    }
+    if (rest.category_id) {
+      const cat = await prisma.productCategory.findFirst({
+        where: { id: rest.category_id, retailer_id: request.retailerId },
+      });
+      if (!cat) throw forbidden('Category does not belong to your store');
+    }
```
(Better: move both checks into one `assertOwnedRefs(retailerId, rest)` used by create and PUT; also check `background_image_id` there once its table is confirmed.)
Status: Plausible

### H2-5 `GET /retailers/me` over-shares to staff and delegates   Severity: Low
Attacker: staff (manager, salesperson, any support scope; all allowlisted at `auth.ts:180, 234, 285`)
Goal: collect the retailer's integration ciphertexts and KYC object keys.
Steps: `GET /v1/retailers/me` with a salesperson token.
Impact: the response includes `gmb_access_token`, `gmb_refresh_token`, `fb_ads_access_token`, `google_ads_refresh_token`, `google_ads_developer_token` (all `encryptSecret` ciphertext, `retailers-integrations.ts:190,319`), `kyc_aadhar_front_r2_key`, `kyc_aadhar_back_r2_key`, `kyc_gst_r2_key` and `auth_user_id`. Ciphertext alone cannot be used without `ENCRYPTION_MASTER_KEY`. The Aadhaar keys matter only if the R2 object is reachable by key, which is an H5 question. Aadhaar is sensitive under the DPDP Act, so the key should not reach staff devices.
Evidence: `retailers-profile.ts:65-67` (no `select`), `:86` strips only `whatsapp_api_access_token`; schema `packages/db/prisma/schema.prisma` Retailer model (`gmb_*`, `fb_ads_access_token`, `google_ads_*`, `kyc_*_r2_key`).
Fix:
```diff
     const retailer = await prisma.retailer.findUnique({
       where: { id: request.retailerId, deleted_at: null },
+      omit: {
+        gmb_access_token: true, gmb_refresh_token: true, fb_ads_access_token: true,
+        google_ads_refresh_token: true, google_ads_developer_token: true,
+        kyc_gst_r2_key: true, kyc_aadhar_front_r2_key: true, kyc_aadhar_back_r2_key: true,
+      },
     });
```
Check first that the mobile app does not read these fields (`grep -rn "kyc_aadhar\|gmb_access\|fb_ads_access" apps/mobile`); also confirm the installed Prisma version supports `omit` (GA in 6.2). If it does not, extend the destructure at `:86`.
Status: Plausible

### H2-6 Duplicate-phone error lets staff check whether a number is a customer   Severity: Low
Attacker: staff (salesperson; `POST /v1/customers` is allowlisted at `auth.ts:232`)
Goal: learn whether a given phone number is a customer of the store. List and detail views mask phones for staff (RC-066).
Steps: `POST /v1/customers {"name":"x","phone":"98XXXXXXXX"}`. The reply is "already exists" if the number is a customer; otherwise a customer row is created, which is a visible side effect. Only the global 200/min limit applies.
Impact: small. It confirms numbers the salesperson already has; it does not reveal unknown numbers. Listed so H8 can rank it.
Fix: keep the message for the owner; return a generic `validationError('Could not add this customer')` for `!isRealOwner(request)` at `customers.ts:48-49`.
Status: Plausible

---

## Not exploitable (checked, with proof)

| Attack | Result | Evidence |
| --- | --- | --- |
| Retailer A GET/PUT/DELETE B's product | Not exploitable | `products-crud.ts:230+, 300` (`where: { id, retailer_id, deleted_at: null }`); bulk-delete `:431-436` |
| A edits/deletes B's photo / variant (incl. synthetic `variant-<id>`) | Not exploitable | `products-media.ts:123-150` (variant + photo both `retailer_id`-scoped), `:199-212`; `products-variants.ts:118-120` |
| A reads/edits B's customer | Not exploitable | `customers.ts:127, 139, 178` |
| A reads B's collection / enquiries; edits enquiry via own collection id + B's enquiry id | Not exploitable | `collections.ts:335-336`; enquiry PATCH `:404-412` (`updateMany where { id, collection_id }` after owned collection check) |
| A creates collection with B's products / B's customer | Not exploitable | `collections.ts:100-115` |
| A assigns B's products to own category; caption/social/size routes with B's product id | Not exploitable | `categories.ts:345-351`; `growth-social-caption-suggest.ts:45`; `retailers-social-posts.ts:56`; `growth-sizes.ts:21`; `collections.ts:669` (bulk-send `customer_ids`) |
| Mass assignment of `retailer_id` / `plan` / `plan_status` / `is_suspended` via `PUT /retailers/me` or product body | Not exploitable | `UpdateRetailerSchema` (`retailers-profile.ts:20-59`) has none of these keys; Zod `z.object` strips unknown keys; no `.passthrough()` in non-test routes (grep empty). Product `status` is a legitimate field (enum) |
| Route-level owner check written as bare `staffRole === null` (RC-068 shape) | Not exploitable | Only `collections.ts:65` (uses `isRealOwner`) and `products-tryon.ts:159` reference `staffRole` in routes; trash routes use `isRealOwner` (`products-trash.ts:12,25,54`) |
| RC-066 phone-masking bypass on staff-reachable routes | Not exploitable | customers list/detail `customers.ts:98,111,131`; collection detail `collections.ts:357`; enquiry PATCH `:416`; inbox `:251`; campaign preview `growth-campaigns-send.ts:36`; campaign send refuses non-owners on wa.me path `:103`; bulk-send returns ids only (`collections.ts:675`) |

## Not checked / follow-ups

- **Runtime proof:** nothing was run against a server. Re-run H2-1 and H2-2 on a seeded local DB, with two retailers and a support grant, to move them to Confirmed.
- Not reviewed for IDOR: `retailers-social-schedule*.ts` item ids, `retailers-showcase-designs.ts`, `growth-videos.ts` (`DELETE /v1/growth/videos/:id`), `retailers-invoices.ts`, `retailers-tickets.ts`, `push-devices.ts` (token re-register across retailers), `team/*` (internal team; `team-territories.ts:46` updates by id but territories are global, and `requireRole(request, [])` gates it).
- H2-4: confirm how storefront category pages query (`category_id` alone vs `+ retailer_id`).
- H2-5: whether Aadhaar R2 keys are fetchable by key → **H5**.
- `catalog-import.ts` client-supplied `cropped_r2_key` / photo keys → **H5** (RC-075 `verifyUpload` coverage).
- Public / passport cross-shopper routes (`passport-wishlist.ts:66`, `passport-activity.ts:80` take client `retailer_id`) → **H4**.
- Cross-references: RC-034, RC-066, RC-068 (same role/IDOR shape; H2-2/H2-3 are new instances of that shape, not repeats).
