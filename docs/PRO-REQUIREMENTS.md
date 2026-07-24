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
**Status:** 🔴 **Not started** — researched 2026-07-24, no code yet. Discuss again when picking next dev phase.

**Priority:** P2 — real UX win for poor-connectivity India retail, not a launch blocker.

**Problem:** Customer web (`apps/web/src/app/c/[slug]`) is labeled a PWA in project docs but has zero offline capability today — `public/manifest.json` exists (installable icon/name metadata only), no service worker, no `workbox`/`next-pwa`/`serwist` dependency. Customer wants: browse catalog + product detail with no/slow internet, favorite/cart still usable, enquiry still sendable, "like the Starbucks app."

**Finding — the ask splits into 3 mechanisms, most of it already free:**
1. **Wishlist/cart offline** — already works today, zero build needed. `toggleFavorite` writes to `localStorage` (synchronous, no network); the only network call is a fire-and-forget analytics ping that already no-ops silently offline.
2. **Enquiry send offline** — already works today via WhatsApp itself, zero build needed. `handleEnquire`/`handleEnquireAll` are a pure client redirect (`window.open('https://wa.me/...')`) — no Kanchuki backend call in that path. On mobile, WhatsApp's own app queues an offline message and auto-retries once the device reconnects (the grey-clock pending state) — this already delivers the "Starbucks queue-and-flush" behavior for the core enquiry-send, inherent to the current architecture.
3. **Catalog + product-detail browsing offline** — the one real gap. Needs a Service Worker + Cache Storage.

**Design (Stage 3 above, the only piece to actually build):**
- Add **Serwist** (`@serwist/next`) — actively-maintained Workbox wrapper with Next.js App Router support. Don't hand-roll Workbox caching logic; this is an already-solves-it dependency, not custom code to own. (`next-pwa`, the older alternative, has had inconsistent App Router support — re-check current maintenance state before committing either way.)
- Cache strategies, per resource type:
  - Product photos: cache-first, long TTL (photos rarely change once shot)
  - Catalog/detail JSON (`/api/c/[slug]/products`, `/api/products/:id`): network-first-with-cache-fallback, keyed per exact query string — online serves fresh data, offline serves last-seen data for that filter/page
  - Page shell (JS/CSS/RSC HTML): same network-first-with-cache-fallback; Cache Storage doesn't care whether the response was server-rendered
- **Hard limit, not a build gap:** offline can only serve what was already fetched once while online. A product a customer never opened can't appear offline — no data exists to serve. Same limitation every offline-capable app has, Starbucks included.
- New infra concerns that come with a service worker (own risk, not free): cache versioning/invalidation on every deploy (stale service worker serving an old app shell after an update), testing across browsers, and a kill-switch path if a bad cache version ships.

**Optional add-on, build only if needed:** a small offline outbox (IndexedDB-backed, flushed on `window.addEventListener('online', ...)`) — needed **only if** an enquiry must also land in Kanchuki's own backend (e.g. to show in the retailer's Kanchuki dashboard, not just their WhatsApp chat). **Not** the Background Sync API (`ServiceWorkerRegistration.sync`) — that's Chromium-only, no Safari/iOS support, so a manual online-event flush is the more reliable cross-browser choice anyway, not a downgrade.

**Explicitly not in this feature:** CDN/edge caching (Cloudflare, already in the stack) is a separate concern — it speeds up repeat visits *while online*, it does nothing for the fully-offline case. "Slow but connected" is already partially covered today by the `stale-while-revalidate` `Cache-Control` headers already set on `/public/collections/:slug` (`apps/api/src/routes/public.ts`) — only the *fully offline* case needs the service worker.

**Acceptance Criteria (when built):**
- Previously-viewed collection + product detail pages render with photos when the device has zero network
- Favoriting/cart-adding while offline persists and survives a page reload
- A stale service worker never serves a broken/outdated app shell after a deploy (versioned cache + update prompt or auto-activate)
- Enquiry-send keeps working exactly as it does online-connected today (no regression to the existing WhatsApp-redirect flow)

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
**Status:** 🔴 **Not started** — architecture decided 2026-07-24, spec'd, no code yet. See `docs/PLAN.md` Month 15–16, `docs/DATABASE.md` (Order/OrderItem/RetailerPaymentAccount), `docs/SECURITY.md` §11.

**Priority:** P1 — new revenue lever (commerce tier upsell), not a launch blocker for existing MVP tiers.

**Problem:** Today a customer can only favorite + "Enquire on WhatsApp" (manual handoff, retailer closes the sale offline). Retailer asked for real "add to cart → address → pay online" checkout, with money going to *them*, not Kanchuki.

**Corrected premise:** WhatsApp itself is not a viable checkout/payment rail here — Meta's Catalog/Cart commerce features and WhatsApp Pay aren't generally available to a new third-party platform. WhatsApp stays a share/notify channel exactly as it is today. The cart/checkout/payment flow lives in the existing customer PWA (`apps/web/src/app/c/[slug]`) — "Enquire on WhatsApp" becomes "Buy Now" only for retailers who've connected a payment account.

**Design — direct-to-retailer, no platform custody of funds:**
- Retailer connects their own Razorpay account (own KYC/GST) from a new Settings section (extends F-009). Kanchuki stores `key_id`/`key_secret` encrypted in a new `RetailerPaymentAccount` row, reusing the F-012 `encryptSecret`/`decryptSecret` AES-256-GCM helpers already built for platform-level integration keys — same mechanism, per-retailer instead of global.
- Checkout creates an `Order` + `OrderItem[]` (price snapshotted at order time), then a Razorpay order via *that retailer's* credentials. Kanchuki's own Razorpay account (used for subscription billing, F-010/existing billing) is never touched by retailer sale money.
- Cart: client-side, same localStorage pattern as the existing Wishlist page (F-006) — no customer account, matching the app's anonymous-browsing principle throughout.
- Checkout form: name, phone, address (no reusable Address entity — this is a per-order snapshot, not a customer profile; the app has no customer login to attach a reusable address to).
- Payment confirmation: Razorpay webhook, signature verified using *that retailer's* stored webhook secret — looked up via the local `Order`/`razorpay_order_id`, never trusting an unauthenticated retailer-id path param before verification (see `docs/SECURITY.md` §11 for the exact flow).
- Product status reuses the existing state machine unchanged: `AVAILABLE` → `RESERVED` at order-create → `SOLD` at payment-confirmed. Auto-revert to `AVAILABLE` + cancel order if unpaid past a timeout (cron, mirrors the existing collection-expiry cron pattern).
- **Tier gate:** a retailer with no active `RetailerPaymentAccount` sees today's flow unchanged (Enquire only) — the existence of an active connected account *is* the L1/L2 distinction. No separate `commerce_enabled` flag needed.
- **Why direct-to-retailer first, not Razorpay Route:** zero fund custody avoids needing an RBI Payment Aggregator license — the fastest, lowest-compliance-risk path to ship real checkout. See F-307 for the planned Route upgrade.

**Explicitly not in this feature:** Meta WhatsApp Cloud API order-confirmation messages (that's F-301, independent) — a manual `wa.me` deep-link confirmation (same pattern as today's enquiry) is enough for launch. Multi-quantity cart lines — this catalog models one `Product` row as one physical garment (AVAILABLE/SOLD, not a stock count), so `OrderItem.quantity` exists in the schema but is practically always 1 unless a retailer lists duplicate items as separate products (already how they'd handle that today).

**Acceptance Criteria:**
- Retailer can connect/disconnect their own Razorpay account from Settings; key/secret never rendered back in plaintext (masked, same UX as F-012's admin integration settings)
- Customer can add product(s) to cart, checkout with address, pay via Razorpay Checkout.js, only on retailers with an active payment account
- Order and product status update atomically on webhook-confirmed payment; unpaid orders auto-expire and release the product back to AVAILABLE
- GST invoice generated per order (reuses F-304 requirement)
- A retailer's own Razorpay dashboard shows the transaction — Kanchuki's dashboard never does
- **Order total is always computed server-side from `OrderItem` prices — never trusted from client checkout payload** (see `docs/SECURITY.md` §11.6)
- **Product reservation on order-create is an atomic conditional update (`AVAILABLE` → `RESERVED` in one transaction), not read-then-write** — prevents two customers buying the same one-off garment (§11.7)
- **Payment success is only ever driven by server-verified signature (callback or webhook) — never by a client-reported "success" alone** (§11.6)
- **Changing/disconnecting a retailer's connected payment account requires step-up re-auth (OTP)** — a compromised retailer login alone must not be enough to redirect future payouts (§11.8)

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
