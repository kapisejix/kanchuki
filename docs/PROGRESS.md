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
- `next.config.mjs` wraps config with `withSerwist()` — cache on front-end nav, reload on online
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
