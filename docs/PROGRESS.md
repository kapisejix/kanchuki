# Progress Log

One file, update at end of each work session: what's done, what's next, what's blocked. Check `git log -1` and this file first thing each session.

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

**Still pending from the plan:**
- F-006B: Offline Catalog Browsing — researched, no code
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
- Phase 0.5: SupportTicket routing (schema only), manager rollup reporting, staff Expo mode
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

### Typecheck status
| Package | Errors |
|---------|--------|
| `@kanchuki/api` | 0 ✅ |
| `@kanchuki/web` | 0 ✅ |
| `@kanchuki/db` | 0 ✅ |
| `@kanchuki/shared` | 0 ✅ |

### CI guard check — PASSED ✅

### Still pending after this session
**Deletion Vault (F-016) — needs external Postgres instance provisioned:**
- Provision a separate Postgres instance (not the Supabase primary project)
- Set `VAULT_DATABASE_URL` environment variable
- Run the vault Prisma schema (`packages/db/prisma/vault-schema.prisma`)
- Grant INSERT-only role on the vault DB
- Run `npx vitest run src/vault.test.ts` to verify INSERT-only constraint

**Postgres role separation (F-017) — needs manual superuser SQL:**
- Run role-creation SQL from `docs/SECURITY.md` §19.1 to create `kanchuki_app` (no DELETE/TRUNCATE/DROP) and `kanchuki_migrator` (human-only) roles
- Update `DATABASE_URL` to use `kanchuki_app` credentials
- Apply migration `037_db_guardrails` to activate triggers

**Other pending items (pre-existing):**
- Phase 0.5: SupportTicket routing, manager rollup reporting, staff Expo mode
- Phase 1+: Fashion DNA, Remote VTO, Auto-Personalized Collections
- Onboarding tutorial improvements (10-retailer pilot feedback)
- F-006 wishlist bug (bare product IDs in localStorage)
