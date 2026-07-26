# Kanchuki — Product Requirements Document (PRD)

**Version:** 1.0  
**Date:** June 2026  
**Status:** Active  
**Source:** `docs/final-research.md` + `docs/AI Fashion Sales Assistant - Phase 1.md`

---

## 1. Product Overview

**Kanchuki** is an AI-powered fashion commerce platform for Indian clothing retailers. It digitizes offline stores, enables AI-assisted in-store sales, and lets retailers share product collections with customers via WhatsApp — without requiring any website, ERP, or technical setup.

### Core Promise
> "Digitize your clothing store in minutes, send personalized collections on WhatsApp, and let customers try outfits from home — no website, no app, no tech skills needed."

### Unique Value Proposition
Only platform combining:
- AI Virtual Try-On for Indian ethnic wear
- Fashion DNA CRM (customer preference engine)
- WhatsApp-native commerce (no customer app install needed)
- Works without website, ERP, barcode scanner
- Photo-first product upload with AI auto-tagging

---

## 2. Target Users

### 2.1 Primary: Retailer (Small Shopkeeper)

**Profile:**
- Indian clothing retailer (suits, kurtis, sarees, ethnic wear)
- 1–3 staff, no website, no ERP
- 200–1,000 customers, ₹10–50L annual revenue
- Currently shares product photos on WhatsApp manually
- Tier 1–2 cities

**Jobs to be done:**
- Upload new stock quickly without manual data entry
- Find matching products when customer describes what they want
- Show products on tablet/TV in store
- Share product collections with customers who couldn't visit
- Remember customer color/style preferences
- Avoid opening 50 stock bundles to find one suit

**Success:** Retailer saves 2+ hours/day and closes 3+ extra sales/week from WhatsApp sharing

---

### 2.2 Secondary: Customer (Store Visitor or Remote)

**Profile:**
- Visits retailer's store OR receives WhatsApp collection link
- Age 18–55, female skew (ethnic wear), joint-family purchase decisions
- Has smartphone, uses WhatsApp daily

**Jobs to be done:**
- See matching clothes without asking salesperson to show 20 bundles
- Compare colors and designs side by side
- Virtually try shortlisted items on their photo
- Share try-on image with family for approval
- Mark favorites and enquire about price/availability

**Does NOT need:** Install any app, create account, upload photos to unknown server

---

### 2.3 Tertiary: Wholesaler

**Profile:**
- Supplies stock to 50–500 retailers
- Currently shares catalog via PDF or WhatsApp photos
- Wants retailers to place orders digitally

**Jobs to be done:**
- Upload catalog once, share to selected retailers
- Add MOQ, wholesale pricing, available stock
- Receive retailer interest/orders digitally

---

### 2.4 Tertiary: Manufacturer

**Profile:**
- Creates original designs, sells to wholesalers/retailers
- Wants to track which designs are popular
- Wants to prevent unauthorized catalog distribution

**Jobs to be done:**
- Upload master catalog with design numbers
- Share selectively with verified wholesalers
- Track design popularity analytics

---

## 3. Features by Phase

### Phase 0: MVP (Month 1–4)

**Goal:** Prove product-market fit. Retailer digitizes store + customer engages with collection links.

#### F-001: Photo Upload & AI Auto-Tagging
**Priority:** P0 (must have)  
**Description:** Retailer captures one complete product photo, top to bottom (suit/saree/kurti). AI auto-extracts:
- Category (unstitched suit, kurti, saree, lehenga, etc.)
- Primary color, secondary colors
- Fabric estimate (cotton, silk, georgette, chanderi, etc.)
- Pattern (plain, printed, embroidered, bandhani, etc.)
- Embellishments (zari, mirror, gota, sequin, etc.)
- Occasion tags (casual, party, wedding, office, festive)
- Neck style, sleeve type
- Price range (if visible on tag/board)
- Auto-generated search tags

**Capture modes** (`apps/mobile/app/product/add.tsx`):
- **Photo** — single tap or gallery import (existing).
- **Scan** — retailer pans the phone over the product; the app bursts ~5 stills client-side over ~1s and keeps the largest-file-size frame as a sharpness proxy, discarding the rest. No video is ever recorded or uploaded — only the one winning still enters the normal upload path. Ceiling: file-size-as-sharpness is a rough heuristic; upgrade to on-device Laplacian variance scoring if quality complaints show it picking bad frames.

**One product, one photo, one AI tag:** Product creation captures a single primary photo (no front/back split). That primary photo is the only image ever sent to AI tagging (`addTaggingJob` / `handleTagProduct`). Additional photos can be attached afterward via `POST /v1/products/:id/photos` (up to 10 total) — these are stored and served but never queued for AI tagging.

Crop + white-background cleanup (`cleanupProductPhoto`, retailer-toggleable via `auto_cleanup`) still runs server-side on the primary photo after upload, same as before — Scan mode feeds into this unchanged.

**Acceptance Criteria:**
- Upload completes in < 5 seconds on 4G
- AI tagging completes in < 10 seconds
- Accuracy ≥ 80% on category, color (validated on 100 ethnic wear samples)
- Retailer can edit any AI-generated field before saving
- Bulk upload: up to 20 photos simultaneously

---

#### F-001b: PDF / Printed-Catalog Bulk Import
**Status:** ✅ **Built** (2026-07-13).

**Dual-path architecture:**

1. **Path A — Client-side page rendering (default, works on mobile):** The mobile device renders each PDF page to an image using its built-in PDF viewer (mobile WebKit / browser). Each rendered page is uploaded via `POST /v1/catalog-import/import-pdf?page_images[]=url1&page_images[]=url2...`. The server runs the same `detectCropAndTag()` pipeline (F-001c) on each page image.

2. **Path B — Server-side page rendering (requires `canvas` npm package):** The server uses `pdfjs-dist` to parse page metadata (count, dimensions) and render pages to images if the `canvas` package is installed. A metadata-only path is always available when `canvas` is not installed.

**Detection + creation endpoints:**
- `POST /v1/catalog-import/import-pdf` — Accepts raw PDF URL + optional `page_images[]`. Returns detected items with cropped images and AI tags.
- `POST /v1/catalog-import/bulk-create-products` — Saves reviewed items as real `Product` records and queues AI tagging.

**Key components:**
- `packages/ai/src/detector.ts` — `detectItems()`, `cropImage()`, `detectCropAndTag()` using Claude Vision for garment detection + sharp for cropping.
- `apps/api/src/routes/catalog-import.ts` — API endpoints for upload, detection, PDF metadata, bulk creation.
- `apps/mobile/app/product/catalog-import.tsx` — Review-detected-items screen with approve/edit/reject per item.

---

#### F-001c: Multi-Item Detection & Splitting from a Single Photo
**Status:** ✅ **Built** (2026-07-13). `packages/ai/src/detector.ts` implements `detectItems()` using Claude Vision to find garment bounding boxes in a single image. Each detected region is cropped via `cropImage()` and runs the existing `detectCropAndTag()` pipeline per crop. The `catalog-import.ts` bulk-create endpoint (`POST /v1/catalog-import/bulk-create-products`) presents all N drafts to the retailer for review/edit before saving.

Both F-001b and F-001c share the same underlying `detector.ts` with the same `detectCropAndTag()` call — a PDF catalog page IS a "photo with multiple items in it." The detection pipeline was built once and covers both PDF pages (F-001b's rasterized page images) and direct multi-product camera photos (F-001c).

---

#### F-001d: Guided Bulk Onboarding Flow (500–3000+ SKU stores)
**Status:** ✅ **Built**
**Priority:** P0 (for retailers above ~100 SKUs; below that, single-photo F-001 flow is sufficient)

**Description:** Two capture paths feeding into a shared review queue, packaging existing F-001b/F-001c pipelines into a dedicated onboarding wizard:

1. **Path A — Rack/Shelf Batch Capture** (`apps/mobile/app/product/bulk-onboard.tsx`). Retailer photographs one rack/shelf at a time; location entered once per photo instead of once per item. Each photo runs `detectCropAndTag()`. Running counter shows "N / target catalogued" across multiple sessions.
2. **Path B — Supplier Catalog Reuse** — PDF import endpoint surfaced in onboarding, linking to `/product/catalog-import`.

**Key implementation details:**
- `packages/ai/src/phash.ts` — 64-bit aHash perceptual hash (`computePhash`, `hammingDistance`, `DUPLICATE_HAMMING_THRESHOLD = 8`)
- `packages/db/prisma/migrations/019_product_photo_phash/migration.sql` — `ProductPhoto.phash` column
- `apps/api/src/routes/catalog-import.ts::flagDuplicates()` — scans all existing non-null phashes for this retailer, flags nearest match within threshold (non-blocking — retailer can still save)
- `bulkCreateProducts` endpoint accepts `default_section_id` (once-per-photo) + per-item `section_id` (override) — both validated to belong to the retailer, silently dropped if not

**Acceptance Criteria:**
- ✅ Retailer can capture a rack photo, AI detects 10–20 items, location entered once for the whole batch
- ✅ Review queue shows detected items with crop thumbnail, AI tags, location chip (tappable to override), and duplicate warning badge
- ✅ Duplicate warning fires on same-design re-shoots; retailer can still approve and save
- ✅ Bulk onboarding screen is an independent route (`/product/bulk-onboard`), does not alter the existing single-photo F-001 flow

---

#### F-001e: Ghost-Mannequin AI Generation (Packed/Flat-Lay → Full Catalog Image)
**Status:** Planned (not built)
**Priority:** P2 (nice-to-have, not MVP-blocking)
**Vendor:** Snappyit API (evaluated 2026-07-25 vs WearView/bitStudio/Scenario — Snappyit chosen for confirmed public API + lowest cost; WearView/Scenario had no confirmed public developer API at eval time)

**Problem:** Many retailers stock packed/plastic-wrapped suits and don't want to unpack per unit just to catalog. Ghost-mannequin AI can't work off a packed/wrapped photo directly — garment shape, print, and collar must be visible in source image. Needs a one-time unpack per SKU/design, not per unit.

**Flow:**
1. Retailer unpacks once per new design, lays flat or hangs it, takes one photo (reuses existing F-001 capture UI).
2. Photo sent to Snappyit ghost-mannequin API → returns hollow-body catalog image (full worn look, no visible mannequin/hanger).
3. Catalog image reused for every restocked unit of the same design — no reshoot on restock.
4. API key stored via existing F-012 encrypted-integration-settings mechanism (`/admin/integrations`), not hardcoded.

**Cost (researched 2026-07-25):** Snappyit pay-per-image, ~$0.10/image, plans from $6.90–8.20/mo. At MVP scale (≥50 img/retailer/mo × 50 retailers) roughly $250/mo total — cheap vs manual ghost-mannequin editing ($3–5/img). No confirmed INR billing — factor forex into F-010 quota/plan-limit math, same treatment as WhatsApp/VTO pass-through costs.

**Acceptance Criteria (draft, refine at build time):**
- Retailer can flag a product "packed, unpack later" on capture
- Ghost-mannequin generation runs as async job (reuse existing AI-tagging job queue pattern); retailer notified when catalog image ready
- Falls back to plain photo if API fails/quota exceeded — never blocks product save

---

#### F-002: Product Catalog with Store Location
**Priority:** P0  
**Description:** Digital catalog where each product has rack/shelf location for physical retrieval.

**Fields:**
- Product photo(s)
- AI-generated tags (editable)
- Price (MRP + selling price)
- Store location: Floor → Section → Rack → Shelf → Stack/Box number
- Status: Available / Sold / Reserved / Not Sure
- Color variants (same design, different colors)
- Notes field

**Acceptance Criteria:**
- Product searchable by any tag within 1 second
- Store location shown clearly when salesperson needs to retrieve item
- Can mark product as sold in 1 tap
- Offline-capable: catalog viewable without internet (cached)

---

#### F-003: Customer List & Preference Capture
**Priority:** P0  
**Description:** Basic CRM — retailer manually enters customer preferences.

**Customer Fields:**
- Name, mobile number (WhatsApp)
- Preferred colors (multi-select)
- Preferred styles (casual/party/office/wedding/festive)
- Preferred fabrics
- Budget range (₹500–1000 / ₹1000–3000 / ₹3000–7000 / ₹7000+)
- Occasion tags
- Size/measurements (optional)
- Notes ("likes bright colors", "avoids polyester", "buying for daughter's wedding")
- Last visit date, purchase history (manual entry)

**Acceptance Criteria:**
- New customer added in < 2 minutes
- Customer searchable by name or phone number
- Customer profile viewable instantly when they call/visit

---

#### F-004: In-Store AI Product Search
**Priority:** P0  
**Description:** Salesperson types/speaks natural language query, gets matching products instantly.

**Example queries:**
- "Light pink cotton suit under ₹2500"
- "Something for wedding function in maroon"
- "Simple office wear, not too fancy"
- "Suit for mother, around 45, festive, not too heavy"
- "Punjabi suit in wine or dark red color"

**Matching logic:** Semantic search using pgvector on product embeddings + structured filter fallback

**Acceptance Criteria:**
- Results in < 2 seconds
- Shows top 8–12 matching products with photo + location
- Results filterable by price, color, occasion, fabric
- Works in Hindi (transliteration) — "neeli cotton suit dikhao"
- Works with partial/informal descriptions

---

#### F-005: WhatsApp Collection Link Generator
**Priority:** P0  
**Description:** Retailer selects 5–20 products → system generates shareable link → retailer copies and sends via WhatsApp manually.

**Collection link features:**
- Custom title ("Festive Collection 2026" / "Raksha Bandhan Specials")
- Products shown in mobile-friendly grid
- Each product: photo, name, price, tags
- Customer can tap "heart" to favorite
- Customer can tap "Enquire" to send WhatsApp message back to retailer
- Link valid for 30 days (configurable)
- View count + enquiry count visible to retailer

**Acceptance Criteria:**
- Link generated in < 3 seconds
- Link opens in mobile browser (no app download)
- Page loads in < 3 seconds on 3G
- Retailer sees real-time view + enquiry counts

---

#### F-006: Customer Mobile Web Page (Collection View)
**Priority:** P0  
**Description:** The page customers see when they open a collection link. No app install, no account needed.

**Page features:**
- Product grid with high-quality photo
- Filter by color, price, occasion
- Favorite/shortlist button
- "I'm interested" enquiry button (opens WhatsApp to retailer)
- Product detail view with all colors, close-up photos
- Share button (forward to family/friends)

**Acceptance Criteria:**
- Loads without account/login
- Mobile-first, works on Android 4G browsers
- Enquiry creates pre-filled WhatsApp message to retailer
- No personal data stored without explicit consent

**Known gap (flagged 2026-07-24, not yet fixed):** "Enquire about N items" resolves favorited-product name/price from a session-only cache of fetched grid pages (`lib/wishlist.ts` stores only product IDs). A product favorited on a page never re-fetched this session won't resolve into the enquiry message. Planned fix: store a small product summary (id, name, price_min, price_max, category) in the wishlist instead of a bare id, resolved at heart-click time from the product object already in hand — deletes the session-cache workaround entirely rather than patching around it. Not built yet.

---

#### F-006B: Offline Catalog Browsing (Service Worker + Cache Storage)
**Status:** ✅ **Built**

**Priority:** P2 — real UX win for poor-connectivity India retail.

**Implementation:**
- **Serwist** (`@serwist/next@9`, `@serwist/sw@9`) installed in `apps/web/package.json`
- `next.config.mjs` wraps the Next.js config with `withSerwist()`:
  - `swSrc: 'src/app/sw.ts'` — service worker source file
  - `swDest: 'public/sw.js'` — compiled output
  - `cacheOnFrontEndNav: true` — caches pages on client-side navigation
  - `reloadOnOnline: true` — auto-refreshes cached pages when connection returns
- Full service worker code at `apps/web/src/app/sw.ts`:
  - `precacheEntries: self.__SW_MANIFEST` — precaches static assets
  - `skipWaiting: true` + `clientsClaim: true` — new SW activates immediately after install, claims all clients
  - `navigationPreload: true` — speeds up navigations
  - `runtimeCaching: defaultCache` — Serwist's built-in best-practice caching strategies for all resource types

**What works offline today:**
1. **Catalog + product-detail browsing** — service worker caches page shell (JS/CSS/RSC HTML) and product data (network-first-with-cache-fallback, keyed per exact query string). Online serves fresh; offline serves last-seen for that exact filter/page.
2. **Product photos** — cache-first strategy with long TTL (photos rarely change once shot)
3. **Wishlist/cart** — already worked offline before this via `localStorage` (synchronous, no network). The only network call (fire-and-forget analytics ping) already no-ops silently offline.
4. **Enquiry send via WhatsApp** — already works offline inherently: `handleEnquire` is a pure client `wa.me` redirect with no Kanchuki backend call. WhatsApp's own app queues the message and auto-retries on reconnect.

**Cache invalidation:** Serwist's versioned cache + `skipWaiting`/`clientsClaim` ensures a stale service worker never serves a broken app shell after a deploy — new SW activates immediately on install.

**Hard limit (same as any offline-capable app, Starbucks included):** Offline can only serve what was already fetched once while online. A product the customer never browsed can't appear offline.

**Not built (not needed for MVP):** IndexedDB-backed offline enquiry outbox for Kanchuki-backend routing. Only needed if enquiries must also land in the retailer's Kanchuki dashboard (not just WhatsApp chat). If added later, use manual `window.addEventListener('online', ...)` flush rather than Background Sync API (Chromium-only, no Safari/iOS support).

**Acceptance Criteria:**
- ✅ Previously-viewed collection + product detail pages render with photos when the device has zero network
- ✅ Favoriting/cart-adding while offline persists and survives a page reload
- ✅ A stale service worker never serves a broken/outdated app shell after a deploy (versioned cache + `skipWaiting` auto-activation)
- ✅ Enquiry-send keeps working exactly as it does online (no regression to the existing WhatsApp-redirect flow)

---

#### F-006A: Product Status Propagation to Collection Links (Sold / Reserved)
**Status:** ✅ **Built** — Product status (AVAILABLE/SOLD/RESERVED/NOT_SURE) propagates via ISR revalidation.
**Priority:** P0  
**Description:** Collection links are live pages, not snapshots. Product status changes made by the retailer propagate automatically to every shared collection link.

**Important distinction:** The Kanchuki MVP does NOT use Meta's native WhatsApp Business catalog (the in-app product list under a business profile). "WhatsApp catalog" in this document means a **collection link** — a web page hosted by Kanchuki, shared as a URL inside a WhatsApp chat. Meta Cloud API catalog integration is a Phase 2 roadmap item (Month 13–14). Until then, collection links ARE the catalog, and they stay live-editable from product status.

**How sold item management works:**

1. **Single source of truth = product status in DB.** The Product model has `status`: `AVAILABLE / SOLD / RESERVED / NOT_SURE`. The shopkeeper opens the product in the retailer app (`product/[id].tsx`) and taps status → SOLD.
2. **Collection links reflect the change automatically.** The collection page (`apps/web/src/app/c/[slug]/page.tsx`) renders products from the DB. The same product can sit in many collection links — mark SOLD once, every shared link updates. No need to edit or resend links.
3. **Display rule — show a "Sold Out" badge, do not hide.** Hiding items makes a shared link look broken/empty to a customer who saw it earlier. A badge shows scarcity ("moves fast, enquire early"). A sold item renders as a greyed card with a "Sold Out" ribbon, and the enquiry button disabled.
4. **ISR caching caveat.** Collection pages use Next.js SSG/ISR — a page may serve a cached version for the revalidation window. A status change appears after revalidation (typically ≤ 60s depending on config), not instantly. Additionally, `PATCH /products/:id/status` triggers on-demand ISR revalidation via `revalidateCollectionsForProduct()` which calls `WEB_URL/api/revalidate` with the collection slug — purging the ISR cache immediately instead of waiting for the revalidation window.
5. **RESERVED status.** When a customer says "hold it for me", the shopkeeper marks the product RESERVED. The link shows a "Reserved" badge so other customers see it is pending.

**Out of scope for MVP:** Pushing updates into Meta's native WhatsApp Business catalog. That requires Meta Cloud API + catalog sync — Phase 2 (Month 13–14).

**Acceptance Criteria:**
- ✅ Marking a product SOLD updates all collection links containing it via on-demand ISR revalidation
- ✅ Sold products remain visible in collection links with a greyed card + "Sold Out" ribbon; enquiry disabled
- ✅ Reserved products show a "Reserved" badge
- ✅ No manual link editing or resending required after a status change

**Known gap (fixed 2026-07-25):** The F-006 wishlist bug — "Enquire about N items" could miss products favorited on pages never re-fetched this session — was fixed. Now the wishlist stores a small product summary (id, name, price_min, price_max, category) at heart-click time instead of a bare product ID. The session-only cache fallback (`productCacheRef`) still exists for cold-load scenarios but is now a secondary fallback rather than the primary resolution mechanism. This was already addressed in `CollectionView.tsx::toggleFavorite()` which calls `productToWishlistItem()` at heart-click time.

---

#### F-007: Retailer Onboarding & Setup
**Status:** ✅ **Built** — Full 6-step onboarding flow with step indicator, animated transitions, confetti animation on completion. API support for step tracking (`PATCH /retailers/me/onboarding`). Default rack/shelf presets available. Can skip steps and return later.

**Priority:** P0  
**Description:** First-time setup assistant to get retailer from install → first 10 products uploaded in < 30 minutes.

**Steps:**
1. Phone number OTP verification
2. Shop name, city, category selection
3. Set up rack/shelf structure (or use defaults)
4. Upload first product (guided)
5. Add first customer
6. Create first collection link

**Acceptance Criteria:**
- Complete setup in < 30 minutes without support
- Guided tooltips for each step
- Can skip steps and return later

---

#### F-008: Analytics Dashboard (Retailer)
**Status:** ✅ **Built** — `GET /retailers/me/stats` and `GET /retailers/me/analytics` endpoints. Mobile home screen shows quick stats (products, views, enquiries, pending enquiries) + 2×2 quick actions grid + recent collections with stats.

**Priority:** P1 (should have for MVP)  
**Description:** Simple metrics for retailer.

**Metrics:**
- Total products in catalog / available
- Total customers
- Active collections
- Collection views this month + 7-day daily trend
- Enquiries this month + 7-day daily trend
- Top 5 most-viewed products
- Top 5 most-enquired products
- Category breakdown (pie/bar)
- Status breakdown (Available/Sold/Reserved)
- Recent collection performance (view/enquiry/favorite counts)
- Plan usage (limits vs actual)

---

#### F-009: Retailer Account & Team Settings
**Status:** ✅ **Built**

**Priority:** P1  
**Description:** Retailer-facing settings screen (`apps/mobile/app/settings/index.tsx`) covering account, team, KYC, and WhatsApp configuration.

**Sections (all built):**
1. **Profile** — edit shop name, owner name, city, state, address line 1, GSTIN, pincode. Store logo upload with square crop + presigned URL to R2. Account delete/deactivate with "type DELETE" confirmation modal (soft-delete via `Retailer.deleted_at`).
2. **Subscription** — view current plan, usage vs limits per resource from F-010 ("Usage" section with progress bars, color-coded at 80%/100%). Upgrade/downgrade/cancel via billing screen (`/billing`).
3. **Team** (`apps/mobile/app/settings/staff.tsx`) — invite shop staff via phone number, list staff with role badges (owner/manager/salesperson), remove with confirmation. Reuses the existing `Staff` table.
4. **WhatsApp** — configure separate WhatsApp business number (10-digit validation, falls back to `phone` if empty). `Retailer.whatsapp_number` stored independently.
5. **WhatsApp Business API** — bring-your-own Meta credentials: phone number ID, permanent access token, template name/language. When configured, collection bulk-send uses it instead of one-by-one `wa.me` links. Disconnect option.
6. **KYC Verification** — upload GST certificate + Aadhar front/back via gallery picker. Status shown (Not Submitted / Pending / Verified / Rejected). Rejection reason displayed when applicable.

**Migrations:** `023_whatsapp_number`, `024_retailer_logo_kyc`

**Acceptance Criteria:**
- ✅ Retailer can edit every profile field (including logo upload with crop)
- ✅ Account delete requires "DELETE" text confirmation; soft-delete preserves GST/audit records
- ✅ Team screen lists staff with role, add/remove without support involvement
- ✅ WhatsApp number validated as 10-digit Indian mobile before save
- ✅ KYC docs uploadable individually; status transitions viewable in-app

---

#### F-010: Quota & Limits System (Admin-Configurable, Cross-Resource)
**Status:** ✅ **Built**

**Priority:** P0 — blocks safe monetization; see CLAUDE.md Key Risk #4 (AI cost per try-on, margin tight at ₹999/month plan)

**Problem solved:** Limits are no longer hardcoded columns on `Retailer`. Every metered resource (product upload, AI tagging, try-on, image crop, bg-removal, API request) has a shared quota gate — no new column per resource ever needed.

**Implementation:**
- `plan_limits` table: `(plan, resource_type, limit_per_period, period)` — admin edits rows; no schema change for new limits
- `retailer_limit_overrides` table: per-retailer bespoke limits without inventing new plan tiers
- `usage_counters` table: `(retailer_id, resource_type, period_start, count)` — upserted by shared `incrementUsage()`
- `quota_addon_purchases` table: self-serve overage purchase for any resource_type via Razorpay
- `QuotaResourceType` enum: `PRODUCT_UPLOAD, AI_TAGGING_CALL, TRY_ON, IMAGE_CROP, BG_REMOVAL, API_REQUEST`
- `apps/api/src/lib/quota.ts` — `checkQuota()` fails open when no `plan_limits` row exists (graceful for unconfigured resources); `periodStart()` calculates DAY/MONTH/LIFETIME boundaries
- `effectiveLimit()` checks `retailer_limit_overrides` first, falls back to `plan_limits` via retailer's plan

**Wired into routes:** `products.ts` (PRODUCT_UPLOAD, BG_REMOVAL), `tag-product.ts` (AI_TAGGING_CALL, BG_REMOVAL), `tryon.ts` (TRY_ON), `catalog-import.ts` (IMAGE_CROP, AI_TAGGING_CALL, PRODUCT_UPLOAD)

**Admin surface:**
- `GET/PUT /admin/plan-limits` — list and update per-plan limits (`apps/web/src/app/admin/plan-limits/page.tsx`)
- `GET/POST/DELETE /admin/retailers/:id/overrides` — per-retailer overrides (`apps/web/src/app/admin/retailers/[id]/page.tsx`)
- `packages/db/prisma/seed-plan-limits.ts` — seeds PRODUCT_UPLOAD (LIFETIME), AI_TAGGING_CALL (LIFETIME), TRY_ON (MONTH) for all 3 plans

**Migration:** `020_quota_system` (applied live)

**Explicitly not in this feature:** per-second/burst rate limiting (Fastify/Cloudflare plugin) and usage-based dynamic pricing (flat overage packs only).

**Acceptance Criteria:**
- ✅ Every metered action gated by `checkQuota` before it runs
- ✅ Admin can change any plan's limit for any resource without a deploy
- ✅ Retailer sees usage vs limit per resource in F-009's settings screen ("Usage" section with color-coded progress bars)
- ✅ checkQuota fails open when no plan_limits row exists (graceful for unconfigured resources)

---

#### F-011: Custom Product Background Library
**Status:** ✅ **Built**

**Priority:** P1 — visual polish for catalog listings, not a launch blocker

**Description:** Admin-curated backdrop library for product photos and 360° spin frames. Reuses the existing bg-removal cutout pipeline; swaps the composite target from plain white to a selected background image.

**Implementation:**
- `BackgroundImage` model: `(id, name, image_url, thumbnail_url, is_active, created_by_admin_id)` — admin-only writes
- `packages/db/prisma/migrations/027_product_background_images/migration.sql` — RLS enabled, admin-only policy (same deny-all pattern as `plan_limits`)
- `Product.background_image_id` — nullable FK, null = white default (unchanged behavior)
- `apps/web/src/app/admin/background-images/page.tsx` — admin panel screen to upload (direct file upload to R2 via presigned URL) + toggle active/inactive
- `apps/api/src/routes/admin.ts` — `GET/POST/DELETE /admin/background-images` with R2 presigned upload URL;
- `cleanupProductPhoto()` in `packages/ai/src/detector.ts` takes optional `backgroundImageUrl`, composites RGBA cutout onto it via `sharp.composite()`; falls through to `flatten({ background: '#ffffff' })` when unset
- Spin frame extraction (`apps/api/src/jobs/extract-spin-frames.ts`) passes the same URL through for consistent background across all frames

**Explicitly not in this feature:** retailer-uploaded custom backgrounds (admin-only for now).

**Acceptance Criteria:**
- ✅ Admin can upload a background image and mark it active/inactive from `/admin/background-images`
- ✅ Selected background composites onto the bg-stripped product cutout via `sharp.composite()`
- ✅ Both static product photo and 360° spin frames use the same background
- ✅ Existing products with no background selected keep white-flatten behavior unchanged

---

### Phase 1: Core AI Features (Month 5–8)

#### F-101: Fashion DNA — AI Customer Matching
**Status:** 🔴 **Not started** — requires 3–6 months of behavior data from Phase 0.
**Description:** AI learns customer preferences from behavior (views, favorites, enquiries, purchases) and automatically suggests matching products.

**Requires:** 3–6 months of MVP behavior data from Phase 0. Can't build yet.

**Matching signals:**
- Explicit preferences (captured in F-003)
- Products favorited from collection links
- Products enquired about
- Products purchased (if recorded)
- Products viewed ≥ 3 seconds (from link analytics)

---

#### F-102: AI Virtual Try-On (Self-Hosted)
**Status:** 🟢 **Built** — Fashion V-Tone v1.5 engine (Apache 2.0, maskless, CPU-capable), multi-piece chaining, training consent collection. Replaced CatVTON 2026-07-16.
**Description:** Customer uploads their photo, selects product, AI generates try-on preview.

**Tech:** Fashion V-Tone v1.5 (self-hosted Python microservice via `fashn-vton`)  
**Cost:** ~₹0.025 per try-on on CPU (~$0.0003), ~₹0.25 on L4 GPU (~$0.003)  
**GPU Requirement:** None — runs on CPU (~30-60s) or GPU for faster inference  
**Latency:** ~30-60s on CPU, ~10-30s on GPU  
**Quality threshold:** 80% of try-ons rated "acceptable" by sample retailer panel

**Maskless Architecture (Key Advantage):**
Fashion V-Tone does NOT require background removal or segmentation masks — it handles raw product photos directly. This eliminates the `rembg` preprocessing step that CatVTON required, saving ~$0.003/image and removing a fragile dependency.

**Deployment:**
- Python/FastAPI microservice in `services/fashion-vtone/`
- Containerized with `services/fashion-vtone/Dockerfile`
- Runs on CPU alongside the API server, or GPU for faster inference
- Models auto-download from Hugging Face on first run (~2.3 GB)

**Cost:**
| Method | Cost per try-on | Monthly (1000 try-ons) |
|--------|----------------|----------------------|
| **V-Tone on CPU** | **₹0.025** | **₹25** |
| V-Tone on L4 GPU | ~₹0.25 | ~₹250 |

**Category mapping:** V-Tone accepts one of `tops` / `bottoms` / `one-pieces` per call:
  - Mapping from product category: `upper` → `tops`, `lower` → `bottoms`, `overall` → `one-pieces`
  - Kameez + Salwar (2-piece): two sequential calls (tops, then bottoms on the first result)
  - Dupatta: excluded from V-Tone pass (draping physics unsupported)

**Customer photo requirements:** front-facing, full body, plain background, standing straight. V-Tone is more forgiving of background complexity than CatVTON.

**Product Photo Requirements:** Less strict than CatVTON — raw retailer photos work without background removal preprocessing.

---

#### F-102c: Size Recommendation (Retailer Size Chart Match)
**Status:** 🟡 **Full stack** — schema, API, mobile UI, lookup function all done. Customer-web integration deferred (no anonymous customer identity on share-link flow).
**Description:** Recommend a size (S–10XL) to the customer by matching their `CustomerMeasurement` record (F-102b) against the retailer's own ready-garment size chart, distinct from and complementary to F-102 visual try-on.

**Input:** Retailer-uploaded size chart per garment type (e.g. Kurtas/Tops/Anarkalis/Dresses: bust/waist/hip by size; Pants/Palazzos/Skirts: waist/hip/length by size) — same shape as sample chart supplied for this feature.

**Logic:** Simple range lookup — customer bust/waist/hip → nearest matching chart row → recommended size, no AI/GPU cost.

**Explicitly NOT in scope:** Rendering the try-on visual at the customer's actual body proportions. CatVTON is image-conditioned only (no numeric measurement input) — feeding height/weight into it has no effect on output. A measurement-driven 3D render (SMPL/STAR body model + pose-conditioned diffusion, e.g. IDM-VTON/OOTDiffusion) could do this but is deferred — see `docs/adrs/ADR-006-defer-3d-parametric-vto.md`.

---

#### F-102b: Body Measurement Capture (feeds F-102 VTO fit)
**Status:** ✅ **Full stack (mobile)** — MediaPipe Python script (`scripts/measurement_extractor.py`), camera capture flow with front/back photos (React Native, Expo Camera), upload-to-R2 pipeline, extraction job (BullMQ → Python), and manual tape-measure entry form all built and wired end-to-end.

**Description:** Two input paths, both write to same `CustomerMeasurement` record — VTO engine consumes either identically.

**Path A — Photo (front + back) — Built, tested:**
- Mobile screen (`apps/mobile/app/customer/[id]/measurement.tsx`): Height input → Camera capture (front then back, 2/2 guide) → Preview side-by-side → Upload to R2 via presigned URLs → Queue MediaPipe extraction
- Backend: `POST /customers/:id/measurements/photo-upload-url` creates measurement row + presigned URLs → `POST /customers/:id/measurements/:id/extract` queues job
- Job: `apps/api/src/jobs/extract-measurement.ts` downloads both photos from R2, shells out to Python script, extracts landmarks, deletes originals, writes bust/waist/hip/inseam/confidence to DB
- Photo retention: originals deleted immediately after landmark extraction (see SECURITY.md ephemeral rule)
- Customer/retailer enters height (required — sole scale reference; no absolute scale from pixels alone)
- Accuracy: ±3–5cm typical (2D single-angle limitation — disclosed as estimate)

**Path B — Manual (inch-tape) — Built:**
- Mobile form (`apps/mobile/app/customer/[id].tsx`): Modal with fields for Height (required), Bust, Waist, Hip, Pant Waist, Pant Hip, Inseam
- Labels optional fields clearly, shows measuring-tip banner
- Uses `POST /customers/:id/measurements` (same endpoint the existing comprehensive-test.ts already uses)
- Always available regardless of photo path status — zero AI cost

**Customer profile display — Built:**
- `apps/mobile/app/customer/[id].tsx` shows latest 3 measurements with source badge (AI/Tape) + date + values
- Upper/lower size recommendations computed from measurements via size chart lookup (F-102c)
- "Add Measurement" button offers both Manual and Camera options

**Not built (web):** Customer-facing measurement capture on the web collection page. The web app (`apps/web`) is a customer-facing PWA for anonymous collection viewers — no customer identity available to store measurements against. Would require Phase 1 customer-identity flow.

---

#### F-102d: Consented Training-Data Collection + Photo Crop-Tagging
**Description:** Two related additions to the F-102 try-on pipeline, built together 2026-07-13.

**Part 1 — Crop-tagging for single-photo "set" shots.** Many vendor catalog photos show a 2-piece outfit (kameez+dupatta draped on a mannequin, folded bottom piece on a stand) all in **one** frame — the existing F-102 piece-tagging (`ProductPhoto.piece_type`) is per-whole-photo, so a single combined photo can't be split into upper+lower for the two-call chaining path; it falls back to a single `overall` call, which mis-renders (confirmed root cause, see `docs/adrs/ADR-006-defer-3d-parametric-vto.md` session notes 2026-07-12).

**Fix:** in `apps/mobile/app/product/[id].tsx`, for `PIECE_TAGGABLE_CATEGORIES` products missing an upper or lower tag, a "Crop {piece} piece from a photo" button re-opens the same gallery photo through `expo-image-picker`'s native `allowsEditing` crop screen, uploads the cropped result as a new `ProductPhoto`, and tags it directly. No new dependency — reuses `expo-image-picker`/`expo-image-manipulator`, already installed, both Expo-Go-compatible (a native crop *library* was deliberately avoided — would need a dev build, breaking the Expo Go workflow, per the native-module lesson already logged for MMKV in `docs/PROGRESS.md` 2026-07-08).

**Part 2 — Consented training-data collection.** Separate, unchecked-by-default checkbox (web `TryOnModal`, mobile in-store try-on) that lets a customer additionally allow Kanchuki to keep a copy of that try-on's photos to fine-tune the try-on model later. Fully specified in `docs/SECURITY.md` §3b — key points:
- New `TryOnJob.consent_to_training` flag + `TrainingPhotoConsent` table (migration `008_training_photo_consent`).
- `TrainingPhotoConsent` has **no `retailer_id`** and **no retailer-facing RLS policy** — admin/service-role only, architecturally separate from every retailer-visible table, per the user's requirement that this not live "on vendor database/profile." (Same Postgres instance as everything else — Kanchuki is single-database, multi-tenant via RLS, not one database per tenant; isolation here is "zero policies for this table," the same mechanism, not a literal second database.)
- Stored under R2 prefix `training-data/`, not covered by the existing 24h try-on-result cleanup cron.
- Implemented in `packages/ai/src/tryon.ts::saveTrainingConsentCopy`, called from `apps/api/src/jobs/process-tryon.ts` only after a successful try-on, only when the flag is set, failure non-fatal to the try-on itself.

**Is this "possible," i.e. does it actually improve the try-on model?** Yes, structurally — every time a different customer tries on the *same product*, this naturally accumulates "same real garment, different real body" pairs, which is exactly the paired-data shape a dual-UNet fine-tune needs (see ADR-006's "Option B" build-like-Google path), and since Kanchuki owns this data outright it sidesteps the VITON-HD/DressCode licensing taint documented there. **Not useful yet at Phase 0 pilot volume** — needs real accumulated scale before it's trainable on, and no training pipeline consumes this table yet (that's future work, not built in this pass).

**Explicitly NOT done in this pass (flagged, real gaps):**
- No retention/deletion policy for `training-data/` R2 objects or `TrainingPhotoConsent` rows.
- No customer-facing consent-revocation flow.
- Consent copy text has not had a legal review pass (India DPDP Act 2023 applies) — same "placeholder, needs legal sign-off" status as the existing F-102 consent modal text.
- Migration `008_training_photo_consent` is schema-only, **not applied to the live Supabase DB** — same review-before-apply convention as every prior migration in this project.
- No training pipeline actually consumes `TrainingPhotoConsent` rows yet — this pass only builds the collection mechanism.

---

#### F-103: Remote Try-On via WhatsApp
**Status:** 🔴 **Not started** — Phase 1 scope; requires F-102 (VTO) working first.
**Description:** Retailer sends product via WhatsApp. Customer replies with their photo. AI generates try-on. Retailer sends back result.

---

#### F-104: Auto-Personalized Collection Building
**Status:** 🔴 **Not started** — depends on F-101 (Fashion DNA).
**Description:** AI auto-suggests collection of 10–15 products for a specific customer based on their Fashion DNA. Retailer reviews, edits, sends.

---

### Phase 2: B2B Supply Chain (Month 9–12)

#### F-201: Wholesaler Catalog Import
#### F-202: Retailer Order to Wholesaler
#### F-203: Manufacturer Catalog Upload
#### F-204: Design Popularity Analytics for Manufacturers

---

### Phase 3: Advanced Commerce (Month 13–18)

#### F-301: WhatsApp Business API Automation

---

#### F-302: L2 Ecommerce Checkout — Direct-to-Retailer Payments
**Status:** ✅ **Built** — backend, customer web UI, Razorpay integration, webhook all complete. See `docs/PLAN.md` (deployed ahead of the original Month 15–16 roadmap slot), `packages/db/prisma/schema.prisma` (Order/OrderItem/RetailerPaymentAccount), `apps/api/src/routes/checkout.ts`, `docs/SECURITY.md` §11.

**Priority:** P1 — new revenue lever (commerce tier upsell).

**Problem solved:** Today a customer can only favorite + "Enquire on WhatsApp" (manual handoff, retailer closes the sale offline). Now retailers with a connected Razorpay account get a full "Add to cart → Address → Pay online" flow — money goes directly to *them*, Kanchuki never custodies sale funds.

**Architecture — direct-to-retailer, no platform custody of funds:**
WhatsApp stays a share/notify channel (same as always). The cart/checkout/payment flow lives in the existing customer PWA (`apps/web/src/app/c/[slug]`). "Enquire on WhatsApp" becomes "Buy Now" for retailers who've connected a payment account.

**Implementation details:**

**Database (Prisma):**
- `RetailerPaymentAccount` model — `(retailer_id, payment_mode, razorpay_key_id, razorpay_key_secret_encrypted, razorpay_webhook_secret_encrypted, is_active, verified_at)`. Encrypted via AES-256-GCM (reuses F-012's `encryptSecret`/`decryptSecret` from `@kanchuki/db/secrets`).
- `Order` model — `(retailer_id, collection_id, customer_name, customer_phone, shipping_address JSON, status:PENDING_PAYMENT|PAID|CANCELLED|REFUNDED|FULFILLED, subtotal_amount, gst_amount, total_amount, payment_mode:DIRECT|ROUTE, razorpay_order_id, razorpay_payment_id, gst_invoice_number)` — all amounts in paise, same convention as `Product.price_min`.
- `OrderItem` model — `(order_id, product_id, product_name_snapshot, price_snapshot, quantity)` — prices snapshotted at order time so retailer catalog changes don't rewrite history.

**Backend API (`apps/api/src/routes/checkout.ts`):**
- `GET /retailers/payment-account` — returns masked credential status (last 4 chars only)
- `POST /retailers/payment-account` — connect/update Razorpay account. Verifies credentials with a live Razorpay API test call. Step-up OTP required for existing active accounts (SECURITY §11.8).
- `DELETE /retailers/payment-account` — disconnect (hard delete encrypted secrets immediately). Step-up OTP required.
- `POST /public/checkout/create-order` — creates Order + Razorpay order. Server-computes amounts (SECURITY §11.6). Atomic conditional product reservation `AVAILABLE→RESERVED` in a transaction (SECURITY §11.7). Generates GST invoice number. Uses the *retailer's* Razorpay credentials to create the order.
- `POST /public/checkout/verify-payment` — client-side signature verification for immediate UI feedback. Status stays PENDING_PAYMENT until webhook confirms.
- `POST /public/webhooks/razorpay` — Razorpay webhook handler. Raw-body signature verified against the retailer's stored webhook secret (looked up via `razorpay_order_id`). Replay-protected via event timestamp. Idempotent transitions: only PENDING_PAYMENT→PAID. `payment.failed` releases products back to AVAILABLE.
- `GET /public/orders/:id` — anonymous order lookup by order ID.
- `GET /retailers/orders` — retailer's order list (last 100).
- `PATCH /retailers/orders/:id/status` — fulfill or cancel order. Only PAID orders can be fulfilled. Cancellation releases products.
- `GET /public/checkout/retailer-status/:slug` — public tier-gate endpoint. Checks if retailer has an active payment account.

**Customer web UI (`apps/web/src/app/c/[slug]/`):**
- **Cart** (`cart/CartPage.tsx`) — add/remove/clear items from localStorage. Shows subtotal + GST line. "Proceed to Checkout" button when retailer has payments enabled; amber notice "does not accept online payments yet" when not.
- **Checkout** (`checkout/CheckoutForm.tsx`) — address form (name, phone, address line 1/2, city, state, pincode). Loads Razorpay Checkout.js dynamically. Creates order via API, opens Razorpay payment modal with the retailer's branded checkout. After payment: clears cart, redirects to order view.
- **Order View** (`order/[orderId]/OrderView.tsx`) — shows order status, items, amounts, GST invoice number.
- **Wishlist** (`wishlist/WishlistView.tsx`) — shows favorited products with photos, prices, locations.
- **Collection view** (`CollectionView.tsx`) — checks `retailer-status` endpoint on mount. When `checkoutEnabled` is true, passes it to `ProductDetailSheet` which shows "Add to Cart" alongside "Enquire".

**Tier gate:** A retailer with no active `RetailerPaymentAccount` sees today's flow unchanged (Enquire only) — the existence of an active connected account *is* the L1/L2 distinction. No separate `commerce_enabled` flag.

**GST compliance:** `computeGst()` in checkout.ts computes 5% GST for items ≤₹1000, 12% for >₹1000 (apparel HSN rates). GST invoice number (`INV-YYYYMMDD-XXXXXX`) generated per order. Stored on `Order.gst_invoice_number`.

**Acceptance Criteria:**
- ✅ Retailer can connect/disconnect their own Razorpay account from Settings; key/secret never rendered back in plaintext (masked, last 4 chars only)
- ✅ Customer can add product(s) to cart, checkout with address, pay via Razorpay Checkout.js, only on retailers with an active payment account
- ✅ Order and product status update atomically on webhook-confirmed payment (`AVAILABLE→RESERVED→SOLD`); `payment.failed` releases products back to AVAILABLE
- ✅ GST invoice generated per order (5%/12% apparel HSN rates)
- ✅ A retailer's own Razorpay dashboard shows the transaction — Kanchuki's dashboard never does
- ✅ Order total always computed server-side from snapshotted `OrderItem` prices — never trusted from client checkout payload (§11.6)
- ✅ Product reservation on order-create is an atomic conditional update (`updateMany WHERE status=AVAILABLE`) in a transaction — prevents two customers buying the same one-off garment (§11.7)
- ✅ Payment success driven by server-verified signature (webhook is durable source of truth) — not by client-reported "success" alone (§11.6)
- ✅ Changing/disconnecting a retailer's connected payment account requires step-up re-auth (OTP) — compromised retailer login alone is not enough to redirect payouts (§11.8)

---

#### F-303: Order Management & Delivery Tracking
**Status:** 🔴 **Not started** — depends on F-302 (Order/OrderItem models).
**Description:** Retailer-facing order list (mobile + admin): view, mark fulfilled/shipped/cancelled, filter by status. Delivery tracking (Shiprocket/Delhivery, see PRO-REQUIREMENTS §8 Optional/Future) is a later add, not required for F-302 to ship — retailers can fulfill manually (call/WhatsApp customer) at launch.

---

#### F-304: GST Invoice Generation (CRITICAL — needed at Phase 3 or earlier if mandated)
#### F-305: Multi-Store Management
#### F-306: Regional Language UI (Hindi, Gujarati, Punjabi, Tamil)

---

#### F-307: Razorpay Route — Marketplace Split-Payment Upgrade
**Status:** 🔴 **Not started** — Stage 2 of F-302, build only after Direct-to-Retailer (Stage A) is live and validated.

**Priority:** P2 — reduces retailer onboarding friction and opens a platform-commission revenue model, but not required for checkout to work.

**Design:**
- Retailer onboards via Razorpay's Linked Account (Route) instead of connecting their own pre-existing Razorpay account — Kanchuki can offer this to retailers who don't already have Razorpay, removing that signup step.
- Kanchuki's own Razorpay account becomes merchant-of-record for the transaction; Razorpay's `transfers` API auto-splits the payment to the retailer's linked account, optionally net of a Kanchuki platform fee.
- `RetailerPaymentAccount.payment_mode` (`DIRECT` | `ROUTE`) — both modes coexist per retailer during migration. Each `Order` snapshots which mode it was placed under at creation time, so a later account-level mode switch never rewrites historical order semantics.
- Order-creation logic branches on `payment_mode`: `DIRECT` creates the order on the retailer's own Razorpay credentials (F-302 behavior, unchanged); `ROUTE` creates it on Kanchuki's Razorpay account with a `transfers[]` array naming the retailer's linked account and split amount.

**Compliance — must confirm before enabling, not assumed:** Razorpay built Route specifically so a marketplace doesn't need its own RBI Payment Aggregator license when used as intended for split settlements (nodal/escrow handling stays on Razorpay's side). This is Razorpay's stated design intent, not a substitute for actual legal sign-off — confirm current RBI marketplace-payment guidance with Razorpay support and legal counsel before any real-money Route transaction ships.

**Acceptance Criteria:**
- Retailer can choose Route onboarding (guided KYC via Razorpay's hosted flow) as an alternative to entering their own Razorpay keys
- Existing Direct-to-Retailer retailers keep working unchanged; nothing forces a migration
- A Route order's funds settlement is visible to the retailer (Razorpay dashboard or Kanchuki order detail — whichever Razorpay's Linked Account dashboard access supports)
- Legal/compliance sign-off recorded before the first real Route transaction

---

## 4. Non-Functional Requirements

### 4.1 Performance
- Product photo upload + AI tagging: < 15 seconds total
- In-store search results: < 2 seconds
- Collection link page load: < 3 seconds on 3G (LCP)
- API response time p95: < 500ms
- App startup: < 3 seconds

### 4.2 Reliability
- Uptime: 99.5% (retailer working hours 9am–9pm IST)
- Offline mode: Catalog viewable without internet
- Auto-sync when connection restored
- No data loss on network interruption during upload

### 4.3 Scalability
- MVP: Handle 500 retailers, 25,000 products, 10,000 customers
- Year 1: Handle 10,000 retailers, 500,000 products
- Horizontal scaling via stateless API + Redis

### 4.4 Mobile
- Retailer app: Android first (80%+ of Indian SMB market), iOS secondary
- Minimum Android: API 28 (Android 9)
- Customer web: Mobile browser (Chrome Android, Safari iOS), no app install

### 4.5 Connectivity
- App designed for 3G/4G reliability
- Image compression before upload (< 500KB per product photo)
- Progressive loading for catalog browsing

---

## 5. GST Compliance Requirements (Critical)

All Indian retail software must support GST invoicing. Kanchuki must:
- Store retailer's GSTIN
- Generate GST-compliant invoices (B2C + B2B)
- Support HSN codes for apparel (5208, 6211, etc.)
- Handle GST slabs: 5% (≤ ₹1000), 12% (> ₹1000) for clothing
- Generate GSTR-1 compatible reports
- E-invoice support (for Phase 3+)

**Timeline:** Must be in the platform by first monetized sale (before Phase 3 launch).

---

## 6. Pricing & Billing Requirements

### Subscription Plans
| Plan | Monthly | Annual | Products | Customers | Collection Links/mo | Try-ons/mo |
|------|---------|--------|----------|-----------|-------------------|-----------|
| Starter | ₹999 | ₹9,999 | 500 | 200 | 50 | 0 (Phase 2) |
| Growth | ₹2,499 | ₹24,999 | 2,000 | 1,000 | Unlimited | 100 |
| Pro | ₹4,999 | ₹49,999 | Unlimited | Unlimited | Unlimited | 500 |

### Add-ons
- Extra 50 try-ons: ₹299
- 100 WhatsApp API conversations: ₹49 (pass-through)
- Additional staff seat: ₹199/month
- Generalized to any metered resource (uploads, AI tagging, crop, bg-removal, API calls) via F-010's `quota_addon_purchases` — planned, see Section 3 F-010

### Billing Rules
- Payment via Razorpay (UPI, cards, netbanking) — **code complete, deferred. Launch with free trial only**
- Annual plans: 20% discount built in
- 14-day free trial (Growth features), no credit card
- Auto-renewal with advance notice
- GST invoice generated for every subscription payment
- Currency: INR only

---

## 7. Data Requirements

### Product Data
- Photo: min 1, max 10 per product
- Photo storage: Cloudflare R2
- Photo auto-compressed to 800px width max
- AI embeddings: pgvector (1536-dim for OpenAI, 1024-dim for Voyage)
- Metadata: JSON in PostgreSQL JSONB column

### Customer Data (Privacy-Critical)
- Phone number: hashed for WhatsApp identity, stored as last4 for display
- Try-on photos: **ephemeral only** — processed in memory, result stored, original deleted immediately
- No customer photos stored permanently without explicit opt-in
- Customer preference data: retailer-owned, not shared

### Business Data
- All retailer business data: tenant-isolated (row-level security in PostgreSQL)
- Backups: daily snapshots, 30-day retention
- No cross-retailer data sharing (except anonymized aggregates for manufacturer analytics)

---

## 8. Integration Requirements

### Required (MVP)
- **Claude Vision API** (Anthropic) — AI product auto-tagging
- **Cloudflare R2** — product image storage
- **Supabase Auth** — phone OTP authentication
- **Razorpay** — subscription billing

### Required (Phase 1)
- **Fashion V-Tone v1.5** — AI virtual try-on (self-hosted, Apache 2.0)
- **pgvector** — semantic similarity search for Fashion DNA

### Required (Phase 2)
- **Meta WhatsApp Cloud API** — WhatsApp automation
- **MSG91 / Fast2SMS** — SMS fallback

### Optional / Future
- **Shiprocket / Delhivery** — delivery tracking
- **Tally / Busy** — accounting integration
- **Google My Business** — store discovery
- **Auto catalog photo cleanup** — retailer snaps a raw in-store phone photo (mannequin/dummy, shop shelves, mirrors in frame — most local vendors can't afford studio photography and have high stock volume) and the pipeline auto-produces a clean single-product listing image. Building blocks already exist: `detector.ts::detectItems` (Claude Vision bbox-detect + crop) and `tryon.ts::removeBackgroundAndCache` (`@imgly/background-removal-node`, already installed, currently wired only into the try-on flow). Not yet chained into the catalog upload path (`detector.ts::detectCropAndTag`). Open decision when built: composite cropped garment onto plain white backdrop (standard e-comm look) vs. keep transparent PNG.

---

## 9. User Story Map (MVP Critical Path)

### Retailer Onboards
```
As a retailer
I want to set up my digital catalog in 30 minutes
So that I can start showing customers products digitally
```

### Retailer Adds Product
```
As a retailer
I want to photograph a suit and have AI fill in all details
So that I don't waste time typing descriptions manually
```

### Retailer Searches In-Store
```
As a retailer/salesperson
I want to type "pink cotton wedding suit under 3000" and see matching products
So that I don't need to physically show 30 bundles to find the right one
```

### Retailer Creates Collection
```
As a retailer
I want to pick 15 festive season products and generate a WhatsApp link
So that I can share with customers who couldn't visit the store
```

### Customer Views Collection
```
As a customer
I want to browse a collection link without installing any app
So that I can shortlist items and WhatsApp the retailer my interest
```

### Customer Favorites Products
```
As a customer
I want to heart/save products I like
So that the retailer knows which ones I'm interested in
```

---

## 10. Internal Team Management (Admin / Marketing / Support)

**Status:** Approved requirement, not yet built. Post-MVP — build after Phase 0 core retailer/customer flows are stable (see `docs/PLAN.md`).

### 10.1 Problem

Retailers don't all self-signup. Kanchuki's marketing team visits stores in person and sets up the retailer account on their behalf. Each marketing rep covers a set of stores based on assigned location. Support needs the same location-aware coverage. Today there is a single shared admin login (env-var based) — no per-user staff accounts, no territory concept, no way to see who onboarded or supports a given retailer.

### 10.2 Staff roles (separate from retailer-side `Staff`/shop-staff)

| Role | Scope | Can do |
|---|---|---|
| Super Admin | Global | Create staff, define territories, billing, reassign anyone, override any cap |
| Marketing Manager | Assigned territories | Manage agents under them, reassign retailers within their region, see over-capacity flags |
| Marketing Agent | Assigned territories | Onboard new retailers in their territory only, view their own onboarded retailers + activation status |
| Support Manager | Assigned territories | Manage support agents, escalations, reassign tickets |
| Support Agent | Assigned territories + region | See routing rules below |

Every staff member gets a real login (replaces the single shared admin credential). Session scopes every retailer-list/detail API call to that staff member's assigned territories.

### 10.3 Territory — hierarchical

State → City → Zone (pincode-cluster). Admin assigns a staff member at whichever level fits (a manager may own a whole state, an agent owns one zone). A retailer's territory is auto-derived from their address/pincode at signup; admin can override.

### 10.4 Retailer attribution

- `territory_id` — which zone the retailer belongs to
- `onboarded_by` — which marketing agent signed them up
- `support_owner` — current support point of contact (can differ from onboarder, can change over time)

### 10.5 Capacity — soft warning, never a hard block

`max_retailers` per staff member (e.g. 50). Onboarding is never blocked mid-visit. Once a rep exceeds their limit, their dashboard and their manager's dashboard flag it (e.g. "52/50 — over capacity") so the manager can rebalance the territory or add coverage.

### 10.6 Support routing — hybrid

- **Requires a store visit** (hardware, in-person issue) → routed to the nearest Support Agent whose territory covers that retailer's zone.
- **Backend-manageable** (billing question, WhatsApp link issue, account setting — anything fixable remotely) → open pool; any Support Agent in the same state/region can pick it up, not locked to the exact zone.

Requires a `SupportTicket` entity: retailer, `requires_visit` flag, assigned staff (nullable until picked up), region scope it's poolable within, status. No ticketing exists today — new build.

### 10.7 Field onboarding surface — phased

- **Phase A:** Marketing Agent role added to the existing Next.js admin panel. Works from a phone browser — fastest to ship, reuses what's deployed.
- **Phase B:** Native "staff mode" inside the existing Expo retailer app, for offline-friendly onboarding (camera, poor-connectivity in-store), matching the project's offline-first constraint.

### 10.8 Build order

1. Real per-user staff login (retire single admin-env-var login) + `Territory` table
2. Staff↔territory assignment, admin UI to build territories + assign staff, capacity flag
3. Marketing Agent onboarding flow (web), scoped to their territory, activation dashboard per agent
4. Support layer: support role, `SupportTicket` entity, hybrid routing
5. Reporting: manager rollups, per-agent leaderboard, coverage-gap view (zones with 0 assigned agent)
6. Staff mode in Expo app (offline-first field onboarding)

---

## 11. Out of Scope (MVP)

- AI virtual try-on
- WhatsApp Business API automation
- Manufacturer/Wholesaler layer
- UPI payment tracking
- Order management
- Shipping/delivery
- Multi-staff roles
- Campaign automation
- Regional language UI
- Advanced analytics / BI
- API for third-party integrations
- POS / billing terminal

---

## 12. Admin Control Center — Plan Permission Matrix, Trust & Safety, Deletion Vault

**Status:** ✅ **Built** (2026-07-26). Full implementation of F-013 through F-017. See `docs/PROGRESS.md` 2026-07-26 for details, `docs/SECURITY.md` §19 for guardrail design, `docs/26-night-report.md` for test report.

Reuses the F-010 admin-grid pattern (`plan_limits` table + `/admin/plan-limits` UI) for the new boolean feature matrix instead of inventing a second admin-config system.

### 12.1 F-013: Plan Feature Matrix (Admin-Configurable Checkbox Grid)

**Status:** ✅ **Built** — migrations 035 + `apps/api/src/lib/features.ts` + admin UI at `/admin/plan-features`.
**Priority:** P1 — needed before Growth/Pro tiers are marketed as functionally different from Starter, not just quota-different.

**Problem:** F-010 already lets admin set *numeric* limits per plan (products, AI tagging calls, try-ons) with zero-deploy edits. There is no equivalent for *boolean* features — today every plan can technically use 360° spin, custom backgrounds, checkout, etc.; the pricing table in Section 6 implies differentiation that isn't enforced anywhere.

**Design:** A second admin grid, same shape as `plan_limits`, boolean instead of numeric:

| Feature | Starter | Growth | Pro |
|---|:---:|:---:|:---:|
| Product catalog + AI auto-tagging (F-001) | ✅ | ✅ | ✅ |
| WhatsApp collection links (F-005/F-006) | ✅ | ✅ | ✅ |
| In-store AI search (F-004) | ✅ | ✅ | ✅ |
| Regional language UI (F-306) | ✅ | ✅ | ✅ |
| Bulk/guided onboarding import (F-001d) | ❌ | ✅ | ✅ |
| Custom background library (F-011) | ❌ | ✅ | ✅ |
| 360° product spin view | ❌ | ✅ | ✅ |
| Virtual try-on (F-102) | ❌ | ✅ | ✅ |
| WhatsApp Business API, bring-your-own (F-009 §5) | ❌ | ✅ | ✅ |
| Shopping cart / online checkout (F-302) | ❌ | ✅ | ✅ |
| Data export (CSV) | ❌ | ✅ | ✅ |
| Custom branding on collection page | ❌ | ✅ | ✅ |
| Ghost-mannequin AI catalog generation (F-001e) | ❌ | ❌ | ✅ |
| Razorpay Route split-payments (F-307) | ❌ | ❌ | ✅ |
| API access (external integrations) | ❌ | ❌ | ✅ |
| Priority AI tagging queue | ❌ | ❌ | ✅ |
| Multi-store management (F-305) | ❌ | ❌ | ✅ |

Defaults above are a starting proposal — admin edits every cell live, no deploy, same as `plan_limits`. Two more resources join F-010's *numeric* `QuotaResourceType` enum rather than this boolean table, since they're counts, not on/off: `TEAM_SEATS` (Starter 1 / Growth 3 / Pro 10, over-cap via existing ₹199/mo add-on) and `STORAGE_MB` (Starter 2GB / Growth 10GB / Pro 50GB, aggregate R2 usage across products/backgrounds/spin frames).

**Implementation shape (build time):**
- `PlanFeature` table: `(plan, feature_key, enabled, updated_at, updated_by_id)` — see `docs/DATABASE.md`
- `PlanFeatureKey` enum — one entry per row above
- `GET/PUT /admin/plan-features` — mirrors `GET/PUT /admin/plan-limits`
- `/admin/plan-features` web page — checkbox grid, mirrors `/admin/plan-limits` numeric grid
- `hasFeature(retailerId, featureKey)` helper (mirrors `checkQuota`) — **fails closed** (feature OFF) when no row exists, opposite of `checkQuota`'s fail-open, since an unconfigured feature should not silently unlock
- Gate every plan-gated route/screen behind `hasFeature()` at the API layer (never trust a client-side plan check alone)

**Acceptance Criteria:**
- Admin can toggle any feature for any plan without a deploy
- A Starter retailer hitting a Growth+ feature gets a clear "upgrade to unlock" response, not a silent failure
- `hasFeature()` fails closed on missing config (unlike `checkQuota`'s fail-open) — a new feature ships disabled everywhere until admin explicitly turns it on

---

### 12.2 F-014: Retailer & Customer Activity Tracking (Admin Visibility)

**Status:** ✅ **Built** — `AuditLog.create()` wired into all mutation routes + admin pages at `/admin/activity` and `/admin/retailers/:id/activity`.
**Priority:** P1

**Problem:** Retailer-side mutations are only partially logged (`AuditLog` schema exists but few routes actually write to it — see `docs/SECURITY.md` §18 gap). Customer behavior (views/favorites/enquiries) is already captured per-retailer via `CustomerInteraction` (F-008's analytics source) but has no cross-retailer admin view — today an admin can't see "what is retailer X doing" or "what is customer Y doing" in one place.

**Design — reuse existing data, add the missing admin surface, don't invent a second tracking system:**
- **Retailer/staff activity** — every mutating admin-relevant action (login, product create/edit/delete, settings change, payment account change, plan change) writes to the existing `AuditLog` with `actor_type: "retailer"|"staff"`. Today most routes don't call this — closing that gap is the actual build work, not new schema.
- **Customer behavior** — already collected in `CustomerInteraction` (view/favorite/enquiry/purchase/try_on) per F-008. No new table needed.
- **New admin pages only:**
  - `/admin/retailers/:id/activity` — timeline of that retailer's `AuditLog` entries + login history
  - `/admin/retailers/:id/customers/:customerId/activity` — that customer's `CustomerInteraction` timeline (views, favorites, enquiries) across all of that retailer's collections
  - `/admin/activity` — platform-wide feed, filterable by actor type/retailer/date, for anomaly spotting (e.g., one retailer suddenly deleting 200 products)

**Acceptance Criteria:**
- Every product/customer/collection/settings mutation by a retailer or staff member is visible in `/admin/retailers/:id/activity` within seconds
- Admin can see a specific customer's full interaction history without querying the DB directly
- Platform-wide activity feed flags high-volume delete/edit bursts (simple threshold, not ML — e.g., >20 deletes/hour from one retailer)

---

### 12.3 F-015: Account Suspension (Admin-Controlled)

**Status:** ✅ **Built** — migration 036 + login block + collection-link degradation + admin suspend/block UI.
**Priority:** P1 — currently the only account-disable path is soft-delete (F-009), which is permanent-leaning and customer-facing collection links go dark immediately. Suspension needs to be reversible and distinct from delete.

**Design:**
- `Retailer.is_suspended` + `suspended_at` + `suspended_reason` + `suspended_by_id` (FK `TeamMember`) — see `docs/DATABASE.md`
- Suspended retailer: API login blocked (clear "account suspended, contact support" message, not a generic auth error), all their collection links show a "temporarily unavailable" page instead of 404 (avoids leaking suspension as a customer-visible error), mobile app shows a suspended-state screen instead of the normal dashboard
- Reversible — admin can unsuspend, `AuditLog` records both actions with reason
- Same mechanism for `TeamMember` (internal staff) reusing existing `is_active` flag, with `suspended_reason`/`suspended_by_id` added for audit parity
- Customers have no login in this app (Section 2.2) — "suspend a customer" instead means **block/flag** for abuse (e.g., enquiry spam, fraudulent order attempts on F-302 checkout): `Customer.is_blocked` + `blocked_reason`. A blocked customer's enquiries/checkout attempts are rejected server-side; existing retailer-owned CRM data is untouched (retailer still sees the customer record, sees the block flag).

**Acceptance Criteria:**
- Admin can suspend/unsuspend any retailer or staff account from the admin panel, reason required, logged to `AuditLog`
- A suspended retailer cannot log in; their live collection links degrade gracefully (no 404, no data leak)
- A blocked customer cannot submit new enquiries or checkout on F-302, without affecting the retailer's own view of that customer's history

---

### 12.4 F-016: Deletion Vault — Secondary Database for Retailer-Deleted Data

**Status:** ✅ **Built** — vault Prisma schema + `packages/db/src/vault.ts` (vaultDelete helper) + Railway Postgres-PYkI with INSERT-only `vault_app` role + admin UI at `/admin/database/deletion-vault`. Vault permission test passes.
**Priority:** P1 — distinct from the already-planned Cold Backup (`docs/SECURITY.md` §13, whole-DB periodic dumps). This is a **per-delete-event** copy, triggered the moment something is soft-deleted, not a periodic snapshot.

**Problem:** Today soft-deleted rows (`deleted_at` set) live in the same primary Supabase DB and a cron purges them after 30 days (`docs/DATABASE.md` Data Retention Policy). If the primary DB is compromised, mis-migrated, or a retailer disputes a deletion after the 30-day window, there's no independent copy.

**Design — a genuinely separate database, not a second schema on the same instance:**
- New Postgres instance (Railway/Hetzner/Neon — provider TBD at build time, must NOT be the same Supabase project as primary), connection via a new `VAULT_DATABASE_URL`
- Single generic table, not a 1:1 mirror of every model — one row per delete event: `DeletedRecord (id, source_table, source_id, retailer_id, payload JSONB, delete_reason, deleted_by, deleted_at)` — `payload` is the full row as JSON at time of deletion
- Written by the same application code path that sets `deleted_at` on the primary — one shared `vaultDelete()` helper wraps every soft-delete call site, so it can't be forgotten per-route
- **The DB role behind `VAULT_DATABASE_URL` has INSERT-only grants — no UPDATE, no DELETE, not even for the app itself.** A vault entry, once written, cannot be altered or removed by application code at all — only a human with direct DB admin access could purge it. This is what makes it meaningfully independent of "trust the app got it right."
- Retention: indefinite by default (it's small — one row per delete, not per active record); admin can hard-purge a specific retailer's vault entries only via a manual, audited, human-triggered action (e.g., GST-compliance-driven right-to-erasure request), never automatically

**Acceptance Criteria:**
- Every soft-delete of a Product/Customer/Collection/Retailer writes a full-payload snapshot to the vault DB before or atomically with the primary-DB soft-delete
- Vault DB credentials used by the app grant INSERT only — verified by attempting an UPDATE/DELETE against the vault connection and confirming it's rejected at the DB permission level, not just application logic
- Admin can look up and restore a specific deleted record's payload from `/admin/database/deletion-vault` (view-only in v1; restore-to-primary is a manual admin action, not automated)
- 30-day primary-DB purge cron is unaffected — the vault entry already exists independently before the cron ever runs

---

### 12.5 F-017: Database Guardrails — Preventing AI-Agent/Application Delete Access

**Status:** ✅ **Built** — see `docs/SECURITY.md` §19, `scripts/check-delete-guard.sh`, CI workflow step, migration 037 triggers, and `scripts/setup-role-separation.sql`.
**Priority:** P0 — this is the direct answer to "how do I stop an AI coding agent or a code bug from deleting anything," not a nice-to-have. Full technical design in `docs/SECURITY.md` §19 — this entry is the requirements summary.

**Problem:** `docs/SECURITY.md` §15 already states AI agents "must never" run migrations or destructive commands — but that's a written policy, not a technical control. An agent (or a careless PR) with the same `DATABASE_URL` as the API server *can* physically issue `DELETE`/`DROP`/`TRUNCATE` today; nothing at the database level stops it.

**What closes the gap (see SECURITY.md §19 for full detail):**
1. **Postgres role separation** — the app's runtime role (used by the API server, local dev, and any AI coding agent's `DATABASE_URL`) has its `DELETE`/`TRUNCATE`/`DROP`/`ALTER`/`CREATE` grants revoked entirely. A separate migrator role, with those privileges, is never present in any `.env` the app or an agent reads — only used interactively by a human running `prisma migrate deploy`.
2. **`BEFORE DELETE OR TRUNCATE` DB triggers** on every business table, raising an exception unless a session flag only the 30-day purge cron sets — belt-and-suspenders even if the app role somehow retained DELETE.
3. **No raw `.delete()` in application code for business models** — enforced by a CI grep check (parallel to the existing secrets-scanning pre-commit hook in §15.4), allowlisting only the purge-cron file.
4. **F-016's Deletion Vault** as the actual recovery path if every other layer somehow fails.
5. **Env separation already partially stated in §15.4, now made concrete**: production `DATABASE_URL`/`VAULT_DATABASE_URL` never appear in any file an AI coding agent's working directory can read; local/agent dev points at a local or branched dev database only.

**Acceptance Criteria:**
- Running `DELETE FROM products;` (no WHERE) with the app's runtime DB credentials fails with a Postgres permission error, independent of any application-code guard
- CI fails a PR that introduces a raw `.delete()` call on a business Prisma model outside the allowlisted purge-cron file
- The migrator role's credentials do not appear in `.env.example`, `.env`, Railway env vars used by the API service, or anywhere an AI coding agent's session would read them

---

### 12.6 Other Admin Controls — Suggestions (Not Yet Scoped as Features)

Beyond retailer/customer management, permission matrix, and DB guardrails, worth admin control per this domain (SaaS platform ops for Indian SMB retail):

- **Maintenance mode / platform-wide banner** — take the customer PWA into a read-only or "back soon" state during a migration, without a deploy
- **Fraud/abuse thresholds** — auto-flag (not auto-block) unusual patterns: one retailer creating 500 products in an hour, one customer hitting checkout on 20 different retailers in a day, repeated failed OTP attempts
- **AI cost budget alerts** — per Key Risk #4 (CLAUDE.md) — admin-set monthly ₹ ceiling on Claude Vision/try-on spend with email alert at 80%/100%, since margin is already tight at ₹999/month
- **Uploaded-photo content moderation** — spot-check or auto-flag queue for inappropriate uploads (product photos are public on collection links)
- **Retailer impersonation / "view as"** for support — admin can see exactly what a retailer sees, logged, time-limited, without knowing their password
- **Terms of Service / consent-copy version tracking** — F-102d already needs legal review of consent text; admin should be able to publish a new version and see which retailers/customers accepted which version
- **Geographic/IP blocking** — block signups or requests from specific regions/IP ranges if abuse concentrates there
- **Webhook/integration health monitor** — Razorpay webhook failures (F-302), WhatsApp API errors — surfaced to admin instead of silently failing in logs
- **Notification template management** — the SMS/email/WhatsApp template copy sent to retailers, editable without a deploy

These are backlog candidates, not committed features — flag to user for prioritization before building.
