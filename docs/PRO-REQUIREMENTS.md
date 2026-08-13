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
**Status:** Planned (not built) — job + Snappyit client scaffolded (`apps/api/src/jobs/ghost-mannequin.ts`, `packages/ai/src/snappyit.ts`) but the worker is paused as of 2026-08-02 (consolidated-cron change, `8b7a5be`) — not functional. Snappyit itself later confirmed to have no public API at all — see `docs/photo-feature/ghost-mannequin-research.md`. A local LaMa-inpainting version of the hollow-gap-fill step now exists and works (`scripts/batch-clean-photos.py --ghost-mannequin`, commit `0c66a7f`), reachable today only from the admin photo-cleanup **test tool** (`apps/web/src/app/admin/photo-cleanup-test`) — it is NOT wired into this retailer-facing flow (steps 1–4 below), which stays not-built.
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
- Share button (forward to family/friends) — collection-level built with F-005/F-006; product-level share (single-item deep share from the product detail sheet) closed 2026-07-30, see `docs/design/feature-ideas-2026-07-30.md` §3

**Acceptance Criteria:**
- Loads without account/login
- Mobile-first, works on Android 4G browsers
- Enquiry creates pre-filled WhatsApp message to retailer
- No personal data stored without explicit consent

**Known gap (fixed 2026-07-25):** "Enquire about N items" once resolved favorited-product name/price from a session-only cache of fetched grid pages (`lib/wishlist.ts` stored only product IDs), so a product favorited on a page never re-fetched this session wouldn't resolve into the enquiry message. Fixed by storing a small product summary (id, name, price_min, price_max, category) in the wishlist at heart-click time (`CollectionView.tsx::toggleFavorite()` → `productToWishlistItem()`, commit `4f9cfb0`); the session cache (`productCacheRef`) remains only as a cold-load fallback. See the duplicate note below.

---

#### F-006B: Offline Catalog Browsing (Service Worker + Cache Storage)
**Status:** ✅ **Built**

**Priority:** P2 — real UX win for poor-connectivity India retail.

**Implementation (updated 2026-07-27 — runtime caching strategies added, was previously just Serwist defaults):**
- **Serwist** (`@serwist/next@9`) installed in `apps/web/package.json`, wired via `withSerwist()` in `next.config.mjs` (`swSrc: 'src/app/sw.ts'`, `swDest: 'public/sw.js'`, `cacheOnNavigation: true`, `reloadOnOnline: true`)
- `apps/web/src/app/sw.ts` — `skipWaiting`/`clientsClaim`/`navigationPreload`, plus explicit `runtimeCaching` rules ahead of Serwist's `defaultCache`:
  - **R2 product images** (`*.r2.dev`, `*.r2.cloudflarestorage.com`, `*.cloudflare.com`) — `CacheFirst`, `ExpirationPlugin` (200 entries / 7 days)
  - **`/api/c/*`** (the actual same-origin collection product-list route used for pagination) — `StaleWhileRevalidate`
  - **`/c/*`** collection pages — `NetworkFirst`, 3s timeout before falling back to cache (handles slow 2G)
  - **`/offline`** — precached at install time (`precacheEntries`), served via `fallbacks.entries` when a document request has no cache and no network
- `apps/web/public/manifest.json` — `icons` array added (`icon-192.png`/`icon-512.png`, generated via `sharp`), fixes Android "Add to Home Screen"
- `apps/web/src/app/offline/page.tsx` — branded offline fallback page

**What works offline today:**
1. **Catalog + product-detail browsing** — `/c/*` pages NetworkFirst, `/api/c/*` product data StaleWhileRevalidate. Online serves fresh; offline serves last-seen for that exact filter/page.
2. **Product photos** — CacheFirst, bounded 7-day/200-image expiry
3. **Wishlist/cart** — already worked offline before this via `localStorage` (synchronous, no network). The only network call (fire-and-forget analytics ping) already no-ops silently offline.
4. **Enquiry send via WhatsApp** — already works offline inherently: `handleEnquire` is a pure client `wa.me` redirect with no Kanchuki backend call. WhatsApp's own app queues the message and auto-retries on reconnect. (Confirms the original review-doc assumption that this needed a localStorage retry queue was wrong — there's no `fetch()` in this path to fail.)
5. **First-visit-without-network** — new: a branded `/offline` page instead of the browser's default error screen, precached at SW install.

**Cache invalidation:** Serwist's versioned cache + `skipWaiting`/`clientsClaim` ensures a stale service worker never serves a broken app shell after a deploy — new SW activates immediately on install.

**Hard limit (same as any offline-capable app, Starbucks included):** Offline can only serve what was already fetched once while online. A product the customer never browsed can't appear offline.

**Not built (not needed for MVP):** IndexedDB-backed offline enquiry outbox for Kanchuki-backend routing. Only needed if enquiries must also land in the retailer's Kanchuki dashboard (not just WhatsApp chat). If added later, use manual `window.addEventListener('online', ...)` flush rather than Background Sync API (Chromium-only, no Safari/iOS support).

**Acceptance Criteria:**
- ✅ Previously-viewed collection + product detail pages render with photos when the device has zero network
- ✅ Favoriting/cart-adding while offline persists and survives a page reload
- ✅ A stale service worker never serves a broken/outdated app shell after a deploy (versioned cache + `skipWaiting` auto-activation)
- ✅ Enquiry-send keeps working exactly as it does online (no regression to the existing WhatsApp-redirect flow)
- ✅ A branded offline page renders instead of the browser default when there's no cache and no network

---

#### F-mobile-offline: Retailer App Offline Catalog Browsing + Mutation Queue
**Status:** ✅ **Built (2026-07-27)** — companion to F-006B for the React Native retailer app.

**Implementation:**
- `apps/mobile/app/_layout.tsx` — React Query `networkMode: 'offlineFirst'` on queries and mutations (serves cache immediately when offline instead of pausing)
- `apps/mobile/app/(tabs)/catalog.tsx` — catalog list query `staleTime: 10min` / `gcTime: 24h` (catalog data is stable; favors offline browsing over refetch churn)
- `apps/mobile/src/lib/image-prefetch.ts` — `prefetchProductImages()` warms `expo-image`'s disk cache after the catalog list loads, so photos render offline after first view
- `apps/mobile/src/hooks/useNetworkStatus.ts` — proactive online/offline state via React Query's `onlineManager` (no `@react-native-community/netinfo` dependency needed — `NetworkBanner.tsx` already had equivalent logic inline)
- `apps/mobile/src/lib/mutation-queue.ts` + `apps/mobile/src/hooks/useSyncQueue.ts` — when "Mark Sold" fails while offline, the change is queued to disk (same `expo-file-system` JSON pattern as `offline-persister.ts`, not MMKV — MMKV isn't actually installed) and replayed automatically on reconnect; the cached product list is optimistically patched so the retailer sees the change immediately

**Acceptance Criteria:**
- ✅ Catalog browses (list, filter, photos) with zero network after first load
- ✅ Marking a product SOLD while offline updates the UI immediately and syncs when connectivity returns

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
2. **Subscription** — view current plan, usage vs limits per resource from F-010 ("Usage" section with progress bars, color-coded at 80%/100%). **Since 2026-08-10 (Play Billing compliance) the mobile screen is read-only**: upgrade/downgrade/cancel/add-ons moved to the web billing page `kanchuki.app/billing` (phone-OTP login). See `docs/PLAY-STORE-LAUNCH-CHECKLIST.md`.
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
**Status:** 🟢 **Built + LIVE on Railway (2026-08-06)** — Fashion V-Tone v1.5 engine (Apache 2.0, maskless, CPU-capable), multi-piece chaining, training consent collection. Replaced CatVTON 2026-07-16. Deployed as the `fashion-vtone` Railway service (autosleep, domain `fashion-vtone-production.up.railway.app`), wired into the admin "Generate on model" tool (commit `9a9e923`).
**Description:** Customer uploads their photo, selects product, AI generates try-on preview.

**Tech:** Fashion V-Tone v1.5 (self-hosted Python microservice via `fashn-vton`)  
**Cost:** ~₹0.025 per try-on on CPU (~$0.0003), ~₹0.25 on L4 GPU (~$0.003)  
**GPU Requirement:** None — runs on CPU or GPU for faster inference  
**Latency (measured 2026-08-06, Railway CPU):** ~26 min per try-on (52s × 30 diffusion steps). Not interactive — suitable for async/batch jobs (admin tool polls the job feed), not for customer-facing synchronous VTO. A GPU service or fewer steps would be needed for interactive latency.  
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
- Payment via Razorpay (UPI, cards, netbanking) — **live on web billing `kanchuki.app/billing` since 2026-08-10**; the Android app has no in-app purchases (Play Billing compliance — subscriptions/add-ons are sold on the website, see `docs/PLAY-STORE-LAUNCH-CHECKLIST.md`). Launch remains free-trial-first
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
- **Auto catalog photo cleanup** — retailer snaps a raw in-store phone photo (mannequin/dummy, shop shelves, mirrors in frame — most local vendors can't afford studio photography and have high stock volume) and the pipeline auto-produces a clean single-product listing image. Building blocks already exist: `detector.ts::detectItems` (Claude Vision bbox-detect + crop) and `tryon.ts::removeBackgroundAndCache` (`@imgly/background-removal-node`, already installed, currently wired only into the try-on flow). **Built** — chained into the catalog upload path via `apps/api/src/jobs/tag-product.ts` (`cleanupProductPhoto()`, `auto_cleanup` defaults `true`). The open decision resolved as both: transparent PNG by default, with an optional composited backdrop when a retailer has picked one via the custom background library (F-013 `CUSTOM_BACKGROUND_LIBRARY` feature).

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

### 10.9 F-018: Sales Referral Attribution (Self-Serve Signup)

**Status:** ✅ Built 2026-07-28. Builds on the existing `onboarded_by_id` attribution (§10.4), no new attribution mechanism. `TeamMember.referral_code` (migration `039_referral_attribution`), auto-generated for `MARKETING_AGENT` on creation (`team.ts` `POST /members`), resolved silently in `retailers.ts` `PUT /me` (never overwrites existing attribution). Tests: `retailers.test.ts` "F-018" describe block.
**Priority:** P2

**Problem:** §10.4's `onboarded_by_id` only gets set when a Marketing Agent creates the retailer row in person via `POST /team/retailers`. A retailer who downloads the app and self-registers via OTP (`auth.ts` `/otp/verify`) gets zero attribution today — even if a salesperson pitched them in person and the retailer signs up on their own afterward.

**Design:**
- `TeamMember.referral_code` — short unique code per marketing agent.
- One optional, skippable field in the retailer onboarding wizard (after OTP, alongside the shop-profile step): "Referred by a Kanchuki salesperson? Enter their code (optional)."
- Valid code on submit → resolves to a `TeamMember`, sets `Retailer.onboarded_by_id` — the same field §10.4 already uses, so self-serve and agent-onboarded retailers land in one attribution field, not two parallel ones.
- Invalid or blank code → silently ignored, retailer proceeds, no error shown.
- No new reporting endpoint needed — `/team/reporting/agents` and `/admin/reports` already aggregate off `onboarded_by_id`, so self-serve-attributed retailers show up automatically alongside agent-onboarded ones.

**Acceptance Criteria:**
- Retailer can complete registration with the referral field empty, no friction.
- A valid code correctly attributes the retailer to that agent, visible in `/admin/reports` Agent Performance tab.
- An invalid code does not block or error the registration flow.

---

### 10.10 F-019: Paid On-Site Catalog Upload Service

**Status:** ✅ Built 2026-07-28, gaps closed 2026-07-30. Extends the existing `SupportTicket` entity (§10.6) rather than a new service model — `ticket_type`, `item_count_requested`, `quoted_price_inr`, `proposed_slots`, `confirmed_slot`, `razorpay_order_id`, `paid_at` (migration `040_catalog_upload_service`), plus admin-editable `CatalogUploadPriceTier` (seeded with starter tiers). Retailer request/pay/slot flow: `retailers.ts` `POST/GET /me/catalog-upload-request`, `.../:id/pay`, `.../:id/confirm-slot` — payment verification is a GET redirect callback, `public.ts` `GET /public/catalog-upload-tickets/:id/payment-callback` (Razorpay Payment Link can't carry a Bearer token, so it verifies via HMAC signature instead, same pattern as billing.ts's addon-callback; doc previously said `.../:id/verify-payment`, which never existed). Payment verified server-side before any slot can be confirmed; routes through the existing `routeTicket()`, exported from `team.ts`. Admin quoting: existing `team.ts` `PATCH /team/tickets/:id` extended with `quoted_price_inr`/`proposed_slots`; `GET /team/tickets` filterable by `ticket_type`. Price tier CRUD: `admin.ts` `GET/POST/PATCH/DELETE /admin/catalog-upload-tiers`. Tests: `retailers.test.ts` "F-019" describe block (signature verification + IDOR guard).
**2026-07-30 gap-fix:** the "Built" status above was true for backend + retailer flow, but two acceptance criteria had no UI: (1) the onboarding-time skip entry point didn't exist (only the retailer-dashboard entry did) — added a "Get help adding your catalog" card to `apps/mobile/app/onboarding.tsx` step 6, linking to the existing `apps/mobile/app/settings/catalog-upload.tsx` screen; (2) admin had no way to actually set `quoted_price_inr`/`proposed_slots` — the entire retailer pay/slot flow was unreachable in practice. Added quoting UI (price input, slot picker/list) plus a `ticket_type` filter and badge to `apps/web/src/app/admin/support-tickets/page.tsx`, wired to the already-existing `PATCH /team/tickets/:id` fields.
**Priority:** P2

**Problem:** Retailers with large catalogs (hundreds to thousands of items) who can't or won't photograph/upload themselves need a paid option: a Kanchuki on-site team member visits the shop and adds the catalog for them. Price depends on item count and complexity, set by admin — not hardcoded.

**Design — reuse `SupportTicket`, add fields used only by this ticket type:**
- `SupportTicket.ticket_type` (`GENERAL` default | `CATALOG_UPLOAD`) — new enum value, existing general-support tickets unaffected.
- `item_count_requested` — retailer's estimate at request time.
- `quoted_price_inr` — filled in by admin after review, looked up against a new small admin-editable tier table (`CatalogUploadPriceTier`: `min_items`, `max_items`, `price_inr`) — same admin-grid pattern as `plan_limits`/`plan_features` (F-010/F-013): admin edits rows live, no deploy.
- `proposed_slots` / `confirmed_slot` — admin proposes visit time windows, retailer picks the one that avoids their store's peak-sale hours.
- `razorpay_order_id` / `paid_at` — payment fields mirrored off `SubscriptionPayment`'s shape. Platform's own Razorpay account (retailer pays Kanchuki) — not the F-302 retailer-connected-account rail, which is the opposite payment direction (customer pays retailer).

**Flow:**
1. Retailer requests the service — either a skippable step during onboarding, or later from the retailer dashboard ("Get help adding my catalog"). Captures estimated item count + optional note. Creates `SupportTicket{ticket_type: CATALOG_UPLOAD, requires_visit: true, status: OPEN}`.
2. Admin reviews the request, sets `quoted_price_inr` (via the tier table or manual override) and proposes one or more visit time slots.
3. Retailer sees the quote, **pays first** (Razorpay), then picks their preferred slot from admin's proposed options. No slot is confirmed before payment succeeds.
4. Ticket moves to `ASSIGNED` — routes through the existing `routeTicket()` territory-aware nearest-agent logic (§10.6), same as any other visit-required ticket.
5. On-site team member visits at the confirmed slot, uploads the catalog, ticket → `RESOLVED` → `CLOSED`.

**Explicitly out of scope for this entry (flagged, not built):** a generic (non-catalog) on-site maintenance charge and a standalone commission-per-sale engine were discussed as related asks during scoping but are not yet confirmed — backlog candidates, same treatment as §12.6, not assumed into this design.

**Acceptance Criteria:**
- Retailer can skip the request at registration with no friction, and find the same option later on their dashboard.
- Payment must succeed before a visit slot is confirmed — no team member is ever scheduled against an unpaid request.
- Admin can edit the item-count-to-price tiers without a deploy.
- The routed ticket appears in the same admin ticket view as general support tickets, filterable by `ticket_type`.

---

### 10.11 F-020: Catalog-Upload Delegated Access

**Status:** ✅ Built 2026-07-30.

**Problem:** F-019 gets a team member's visit *scheduled* against a retailer, but never gave them a way to actually act on that retailer's account once on-site — the only alternative would be the retailer handing over their real login, which nothing in this codebase should require.

**Design — deviates from the originally-discussed "new DB model" in one way, flagged here:** instead of a DB-backed session table, this reuses the existing `TEAM_JWT_SECRET`-signed JWT pattern already used for team login (`team-auth.ts`). The JWT's `exp` claim gives expiry for free (8h TTL); revocability before natural expiry comes from a live `SupportTicket` status check on every request instead of a session row — reassigning or resolving the ticket revokes access immediately. This is fewer moving parts for the same guarantees (scoped, expiring, revocable, audited).

| Layer | Files | Summary |
|---|---|---|
| **Token** | `apps/api/src/plugins/team-auth.ts` | `signCatalogUploadToken`/`verifyCatalogUploadToken` — JWT claims `sub`=retailer_id, `tid`=ticket_id, `tm`=team_member_id, `scope`='catalog_upload', 8h TTL |
| **Session endpoint** | `apps/api/src/routes/team.ts` `POST /team/tickets/:id/catalog-session` | Only the ticket's `assigned_to_id` (or super admin) can mint, only once `paid_at`+`confirmed_slot` are set |
| **Auth accept** | `apps/api/src/plugins/auth.ts` | preHandler tries the delegate token before Supabase JWT verification; live-checks `ticket.status === 'ASSIGNED'` + `ticket_type === 'CATALOG_UPLOAD'` on every request (revocation without a session table); new `catalogDelegateCanAccess()` allowlist restricts to `/v1/products`, `/v1/catalog-import`, `GET /v1/categories`, `GET /v1/size-charts` only — narrower than even the retailer-staff allowlist |
| **Audit log** | `apps/api/src/plugins/auth.ts` | One `onResponse` hook writes an `AuditLog` row (`actor_type: 'catalog_delegate'`) for every mutating request made under a delegate session — a single choke point instead of touching every route file |
| **Mobile wiring** | `apps/mobile/src/lib/catalog-delegate.ts` (session swap), `apps/mobile/app/staff/catalog-tickets.tsx` (job list + start button), `apps/mobile/src/components/CatalogDelegateBanner.tsx` (persistent "uploading for {shop}" banner + End Session, wired into `app/_layout.tsx`) | Delegate token temporarily replaces the team member's own `auth_token`, so the existing retailer product-upload screens (`/product/add`, `/product/bulk-onboard`) work unmodified |
| **Tests** | `apps/api/src/plugins/auth.test.ts` (`catalogDelegateCanAccess` allowlist), `apps/api/src/routes/team.test.ts` ("F-020" describe block — mint guard conditions + audit log) | |

**Not built:** a general mobile support-ticket inbox for field staff (today's `/staff` dashboard has no ticket list/detail UI at all, even for `GENERAL` tickets — `catalog-tickets.tsx` is scoped narrowly to ready-for-upload `CATALOG_UPLOAD` tickets only, not a replacement for that missing surface).

---

### 10.12 F-021: Product & Store Ratings

**Status:** 🔴 Planned, not started. Reviewed 2026-07-30, see `docs/design/feature-ideas-2026-07-30.md` §2.

**Problem:** Customers browsing a collection link have no signal of store or product trustworthiness beyond the retailer's own photos/description — no way to leave or see feedback.

**Design:**
- `ProductReview` (product_id, customer_id, rating 1–5, comment, created_at) and `StoreReview` (retailer_id, customer_id, rating, comment, created_at) — separate tables, product review is item-specific, store review is about service/staff/experience.
- One review per customer per product/store — enforced via a unique constraint.
- **Gating decision (required before build):** rating eligibility should be tied to a prior `CustomerInteraction`/`Order` record, not open to any visitor — otherwise the catalog fills with fake 5-stars from the retailer's own network or fake 1-stars from competitors.
- Denormalized `Product.avg_rating`/`rating_count` and `Retailer.avg_rating`/`rating_count`, updated on write — avoids a live aggregate query on every catalog page load. **This aggregate is never filtered** — every submitted rating counts, including low ones (see Google-review routing below, which is a separate, gated flow).
- Customer-facing: star display on `ProductDetailSheet.tsx` and product cards; a "rate this" affordance gated per above.
- Retailer-facing: reviews visible on the retailer's own product/store view, with an optional owner-reply field.
- Moderation: extends the existing Admin Control Center (F-013–F-017) — admin can remove abusive reviews, `AuditLog`-wired the same as other admin delete actions, rather than a new moderation system.

**Google Business Profile review link:**
- `Retailer.google_place_id` (new field) — retailer pastes their Google Business Profile link once in settings; Kanchuki derives the direct review-write URL (`search.google.com/local/writereview?placeid={id}`). No Google API integration — Google has no public API to post a review programmatically (by design, to block fake/incentivized reviews); this is a plain deep link the customer completes themselves on Google's own page, with their own account.
- **Routing after in-app rating submit:** rating ≥4 → show "Loved it? Leave us a Google review" CTA with the link above. Rating ≤3 → show a private "Tell us what went wrong" prompt instead, routed to the retailer's dashboard (optionally an admin support ticket), never surfaced publicly.
- **Flagged risk — read before building:** this rating-based routing is "review gating," a pattern explicitly prohibited by Google's Business Profile review policies (don't selectively prompt only happy customers to post publicly). Enforcement against small businesses is inconsistent, but Google can flag or suspend a profile it catches doing this. Kanchuki's own in-app `avg_rating` above stays unfiltered specifically so that one honest signal exists regardless of this decision. Building it because explicitly requested — the risk is the retailer's/platform's call, not a technical blocker.

**Complexity estimate:** Moderate, 3–5 days — CRUD + one denormalized-counter decision + admin moderation hook + the Google-link field/routing (adds ~half a day on top, reuses the same rating-submit flow), no new architectural pattern.

**Why not built yet:** not in the locked MVP feature list (Section 3) — MVP success metrics are about catalog upload/collection-link/enquiry conversion, not reviews, and a brand-new catalog has nothing to rate yet. Candidate for Phase 1, once Phase 0 metrics are validated and there's repeat customer traffic worth rating.

---

### 10.13 F-022: Auto-Post New Arrivals to Google Business Profile (Google Posts)

**Status:** 🔴 Planned, not started. Reviewed 2026-07-30. **Do not start development until explicitly told to proceed** — reference this entry + `CLAUDE.md` when the go-ahead is given.

**Problem:** Retailer adds new-arrival products in Kanchuki but has no easy way to also surface them on their Google Business Profile, where local searchers actually find the shop.

**Design:**
- Distinct from F-021's Google review link — this uses the **Business Profile API's `localPosts` resource**, which Google *does* allow creating via API (unlike reviews, which have no create-via-API path).
- Retailer OAuth-connects their Google Business Profile once (reuses the F-012 encrypted-secret/per-retailer-credential pattern already used for Razorpay in F-302).
- Kanchuki posts latest 3–4 new-arrival products (photo + short text + CTA button linking back to the retailer's collection link) via `localPosts.create`.
- Image must meet Google's Post image spec (min resolution etc.) — reuse existing product photo pipeline, no new image processing needed.

**External blocker (not in Kanchuki's control):** Google gates access to the Business Profile API — requires a formal API access request/approval from Google before any production calls work. Approval time is unknown and outside this codebase's control; must be requested/secured before implementation can be verified end-to-end.

**Complexity estimate:** 3–5 dev days for OAuth connect + API wiring + retailer UI toggle ("auto-post new arrivals to Google"), once Google API access is granted. Google approval wait time is separate and unpredictable.

**Why not built yet:** not in MVP scope; also blocked on external Google API access approval, which should be requested well before development starts.

---

### 10.14 F-023: AI Provider Registry — Admin-Configurable Tagging Models + Per-Provider Usage

**Status:** ✅ **Built** (2026-08-01). Migration 041 + `packages/ai/src/providers.ts` DB-driven registry + Admin → AI Providers / AI Usage. See `CLAUDE.md` F-023 entry for the full build table.

**Problem:** AI tagging stops whenever the single configured provider (Claude) exhausts its credit balance — uploading new products and the add-color AI pick both break. The fix that only adds a second hardcoded provider (OpenAI, Gemini) still leaves the platform dependent on whichever few models the codebase happens to name.

**Design (user-chosen direction): full DB registry + generic adapter + cost-weighted credits:**

- **`AiProviderConfig` table** — one row per tagging model: `provider_type` (`ANTHROPIC` | `OPENAI_COMPAT` | `GEMINI`), `model_name`, `lite_model_name` (cheaper model for color detection), `base_url`, `api_key_name`, `priority` (1 = tried first), `is_active`, `credits_per_call`. Migration seeds the 3 legacy adapters as rows (Claude 5 / OpenAI 2 / Gemini 1 credits) plus migration 042 adds two Llama 3.2 Vision free fallbacks (90B / 11B, 1 credit each, NVIDIA NIM `OPENAI_COMPAT` + `base_url`) so failover works out of the box — the Llama rows activate the moment `NVIDIA_API_KEY` is configured.
- **Generic `OPENAI_COMPAT` adapter** — every provider that speaks the OpenAI chat-completions protocol (OpenAI, OpenRouter, DeepSeek, Mistral, Groq, Together, ...) works through one adapter via a `base_url` override. An OpenRouter key alone unlocks hundreds of models behind one credit balance. **One adapter, any model on the market** — no new code per provider.
- **Failover semantics** — only providers with a configured key (`getSecret(api_key_name)` — Admin → Integrations or env var) are tried, in priority order. A provider outage (auth/credit/rate/5xx/transport) trips a 5-min circuit-breaker cooldown and auto-tries the next; a success self-heals immediately. Contract errors (provider responded but unusably) do NOT fail over. A persistent 400 (e.g. a text-only model fed an image) is classified as an outage via the `providerDown` flag so a bad model choice can't halt tagging. `listActiveAiProviders()` returns `null` when the table is missing (legacy fallback) vs `[]` when every row is inactive (admin disabled AI — clear error, no fallback).
- **Weighted credits** — the quota gate (`checkQuota(AI_TAGGING_CALL, reserveAiCredits())`) checks against the most expensive healthy provider's cost — a gate-check, not a held reservation; actual consumption is recorded per call when the winning provider's `credits_per_call` is incremented against the retailer's existing F-010 `AI_TAGGING_CALL` counter (same counter the `/billing/addon-checkout` packs top up). Expensive models drain the same flat quota faster; admins edit weights live. Edge: a retailer near their limit can be gated even when a cheap fallback would have served (gate uses the max healthy cost, the safe direction — never over-spend); topping up via addon packs clears it.
- **`AiUsageLog` per-call attribution** — retailer × provider × model × `resource_type` (`AI_TAGGING_CALL` | `AI_ITEM_DETECT` | `AI_COLOR_DETECT`) × weighted credits. Powers Admin → AI Usage. `legacy-*` synthetic ids never FK to `ai_provider_configs`.

**Acceptance Criteria:**
- Retailer uploads a product while Claude's credits are exhausted → tagging completes via the next configured provider with a key (e.g. Gemini/OpenRouter)
- Admin adds a DeepSeek/OpenRouter row (OPENAI_COMPAT + base_url + key) in Admin → AI Providers → it appears in the failover order without a redeploy
- Admin reorders providers → priorities rewrite 1..N; deactivating all rows stops AI with a clear "No AI provider configured" error (no silent legacy fallback)
- A retailer's AI Usage counter reflects the *winning* provider's `credits_per_call`, and Admin → AI Usage shows per-retailer × per-model weighted breakdown

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
2. **`BEFORE DELETE OR TRUNCATE` DB triggers** on every business table, raising an exception unless a session flag only the 30-day purge cron sets — belt-and-suspenders even if the app role somehow retained DELETE. (The cron runs as the scoped `kanchuki_purge` role via `PURGE_DATABASE_URL` — DELETE on the purge tables only, no DDL; see `scripts/setup-role-separation.sql` and `docs/SECURITY.md` §19.1.)
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

---

## 13. AI Tagging Expansion — Subtype, Auto SKU/Name/Description, Slider Fix, Color-Tap, Catalog Redesign (BUILT 2026-08-03)

Full spec, rationale, and exact file:line targets: `CLAUDE.md` "Built" section + approved plan `C:\Users\Dell\.claude\plans\wiggly-floating-meerkat.md` (not duplicated here to avoid drift between two copies). **Status: BUILT 2026-08-03.** Backend (DB schema, AI tagging schema, SKU generator, all 3 write paths, public API facet counts) + web catalog listing redesign (FilterBar `{value,count}` chips + always-visible category row, ProductCard subtype badge + name caption) + mobile (editable name/subtype/SKU/description on product detail, photo-slider variant-photo fix, tap-photo color detect, catalog-import review fields) all shipped and verified (`apps/web` + `apps/mobile` + `apps/api` tsc clean; web unit + api vitest green).

---

## 14. F-024 DB-Backed Default Shop-By Categories + AI Auto-Category Assignment — ✅ BUILT 2026-08-04 (commit `be02012`)

**User ask (verbatim intent):** the "Shop By Categories" nav list must live in the database, not as a hardcoded array in code, and AI tagging must auto-assign each uploaded product to the right one so the retailer never manually picks a category. Retailer can still add their own on top (already possible today).

**Requested default set (15 garment-type entries + 2 special entries):**
Kurta Sets, Salwar Suits, Short Kurtis, Kurta, Co-ords, Plus Sizes, Dresses, Bottoms, Lehengas, Loungewear, Sarees, Shirts for Women, Tops for Women, **New Arrivals**, **Sale**.

### What already exists (checked by reading the code, not assumed)

- `ProductCategory` (`packages/db/prisma/schema.prisma:295`) is **already** a DB-backed, per-retailer, admin/retailer-editable merchandising group — full CRUD at `apps/api/src/routes/categories.ts`, drives `Product.category_id` (the customer-facing "browse by category" nav). This is a different field from `Product.category` (free-text AI garment-type tag like "Saree"/"Kurti", sourced from `PRODUCT_CATEGORIES` in `packages/shared/src/constants/index.ts:37` — that hardcoded array is a *fine* AI-vocabulary constant, not the thing the user is asking to move to DB).
- Gap confirmed: nothing seeds `ProductCategory` rows for a new retailer today (list starts empty until the retailer manually adds one via the mobile "Add Category" screen, `apps/mobile/app/category/new.tsx`). Nothing in `apps/api/src/jobs/tag-product.ts` touches `category_id` — AI tagging currently never assigns a merchandising category, confirming the gap is real, not stale-doc noise (see `docs/PROGRESS.md` doc-staleness pattern).

### Design (ladder-first — reuses `ProductCategory`/`categories.ts` wholesale, no parallel category system)

1. **New global template table**, e.g. `DefaultProductCategory` (`id`, `name`, `sort_order`, `is_active`) — admin-editable grid, same pattern already shipped 3x in this codebase (`PlanFeature`, `CatalogUploadPriceTier`, `AiProviderConfig`). Seed migration inserts the 15 garment-type names (not "New Arrivals"/"Sale" — see below). Admin can add/remove/reorder the *template* without touching code.
2. **Retailer onboarding** copies the current active `DefaultProductCategory` rows into that retailer's own `ProductCategory` rows (one-time, at signup — same moment `Staff`/theme defaults etc. already get provisioned). A one-off backfill migration does the same for existing retailers with zero categories, so nobody regresses.
3. **AI auto-assignment — no new AI plumbing needed.** `tagger.ts`'s vision call already returns `category` (free-text) each run. `tag-product.ts` additionally does a case-insensitive match of the returned category name against **that retailer's current `ProductCategory` list** (defaults + any custom ones — one mechanism handles both, no default-vs-custom special-casing) and sets `category_id` when it finds one. No match → `category_id` stays null, retailer assigns manually exactly like today. This also means a retailer's custom category ("Bridal Wear") becomes an AI target for free the moment it exists, matching the "retailer can add more" ask without extra code.
4. **"New Arrivals" and "Sale" are not garment types — flagging before anyone builds this wrong.** A photo cannot tell you a product is newly stocked or discounted; these two are date/price-derived, not AI-taggable. Two honest options, needs a decision before coding:
   - **A (recommended, cheaper — and there's already a working precedent in this exact codebase):** keep them out of `ProductCategory`/AI entirely — compute at query time as virtual filter chips, same as the existing occasion/color/price facets. **"New Arrivals" specifically doesn't need new logic at all** — `isNewArrival()` already exists (`apps/api/src/routes/products.ts:110`, `created_at` within 30 days) and is already wired into the retailer-facing mobile catalog filter (`docs/PROGRESS.md` 2026-07-16 #6). It has just never been exposed on the *customer-facing* public API (`apps/api/src/routes/public.ts`) that the Shop-By-Categories nav actually renders — so the real work here is porting the existing helper to `public.ts`, not building fresh. It's currently duplicated once already (`apps/api/src/routes/search.ts:11`) — adding it to `public.ts` makes a 3rd copy, which is the rule-of-three trigger to extract it into one shared helper instead. "Sale" (`mrp > price_min`) is new but trivially the same shape.
   - **B:** seed them as real `ProductCategory` rows too, but leave `category_id` assignment to the retailer only for these two (AI never targets them) — matches the visual "15-tile grid" request more literally but needs the retailer to manually re-curate both every time stock/price changes, which real retailers won't keep up with.

### Not decided yet / explicitly not started

- Table/model naming above (`DefaultProductCategory`) is a proposal, not final.
- Option A vs B for New Arrivals/Sale needs a call.
- Whether the admin template edit retroactively pushes to existing retailers' `ProductCategory` rows, or only affects future signups (existing precedent — `PlanFeature`/`plan_limits` changes are forward-only, not retroactive — lean same way here, flag if the user wants retroactive push).

**Do not start coding without explicit go-ahead** — this is a reviewed/scoped entry, not an approved plan. When approved: DB migration → `ecc:database-reviewer`; `tag-product.ts` category-match logic + onboarding seed → `ecc:typescript-reviewer`/`ecc:api-design`; admin template grid UI → reuse the existing plan-features/catalog-upload-tiers admin page pattern (no new design system work needed, `impeccable` not required for an admin-only checkbox/reorder grid per this project's established "admin stays motion/decoration-restrained" stance, see the Loom design-system entry in `CLAUDE.md`).

---

## 15. F-025 Scan-to-Sell — Offline Sale Reconciliation via SKU/QR Scan — ✅ BUILT 2026-08-04 (commit `53f627c`)

**Problem:** retailer sells an item in the physical shop (not through the app). Nothing tells the digital catalog. Item stays `AVAILABLE`, customers keep enquiring/ordering a product that's gone. `Product.status` (`AVAILABLE`/`SOLD`/`RESERVED`/`NOT_SURE`) and a manual status toggle already exist (`apps/mobile/app/product/[id].tsx`, `apps/mobile/app/(tabs)/catalog.tsx`) and are already offline-safe (`apps/mobile/src/lib/mutation-queue.ts` replays "Mark Sold" once back online). Gap is the *trigger*: today the retailer must open the app, search/scroll to find the product, then tap status — friction real shop owners skip under load, so the catalog drifts stale.

**Options researched** (full comparison: manual toggle / barcode-QR scan / full POS / RFID / AI photo-diff of the rack / WhatsApp text command) — see session research 2026-08-04. AI-vision "auto-detect what's missing from a rack photo" was explicitly rejected as the primary mechanism: unreliable (an item moved ≠ an item sold; occlusion/lighting), burns AI credit budget per scan (locked cost constraint), and a false SOLD costs a real sale — worse than a stale AVAILABLE costs one annoyed enquiry. Full POS/RFID rejected as disproportionate for this ICP (1-3 person shops, no POS today). WhatsApp text-command ("SOLD KS0032") is the closest zero-friction alternative but is blocked on Meta Cloud API, which is Phase 2, not built.

**Decided approach: scan-to-sell, folded into the existing product-detail screen — no new dedicated screen.** Scanning only replaces the "find the product" step; everything after (the SOLD toggle, the offline queue, the UI) is reused unchanged.

**How it works:**
1. Retailer taps a new scan icon (catalog tab, next to search).
2. `expo-camera`'s `CameraView` opens in barcode-scan mode — **already an installed dependency** (`apps/mobile/package.json`), no new package needed.
3. Scans a QR/SKU tag on the rack card. SKU is already auto-generated per product at tagging time (`apps/api/src/lib/sku.ts`, e.g. `LS0001`) and unique per retailer (`@@unique([retailer_id, sku])`, `schema.prisma:386`) — the tag just needs to encode that existing string, nothing new to generate.
4. App resolves SKU → product id via a small addition to the existing `GET /products` list endpoint (exact-match `sku` query param) — not a new route, reuses `apps/api/src/routes/products.ts`.
5. Navigates straight into the existing `product/[id].tsx` screen for that product.
6. Retailer taps the existing status control → `SOLD`. Offline: already queued and replayed by the existing mutation queue, zero new offline handling needed.

**Staff/team-member permission (added 2026-08-04, user request):** shop staff (F-009 `Staff` model, not the retailer owner) must be able to scan-to-sell too — most offline sales happen at the counter, which is staff, not the owner. Checked and this is already the default: the product status-update route (`PATCH /products/:id`) has **no** `request.staffRole !== null` gate, unlike the trash-related routes (`GET /products/deleted`, `restore`, `purge` — all explicitly owner-only, see F-026 bug below for how that gate broke one of them). So scan-to-sell inherits staff access automatically once built — no new permission code needed. The one thing to verify when building: the new SKU-lookup query param on `GET /products` must **not** pick up an owner-only gate by copy-paste from the nearby trash routes — it needs the same no-gate behavior as the existing list/detail endpoints staff already use today.

**New pieces required (small, all additive to existing code):** one scan-icon button + camera screen in the mobile app; one SKU exact-match query param on the existing products list endpoint; a printable QR/SKU tag surface at product-tagging time (sticker/label — design open, could be as simple as a print-friendly view of the SKU + QR, no physical hardware integration required).

**Explicitly not built by this feature:** GST invoice generation for offline sales. Checked — only the online-order path (`checkout.ts`) generates a GST-relevant invoice today; offline sales have no invoice flow at all. Flagged as a natural future hook (retailer already legally needs to issue a GST invoice per the platform's locked GST-compliance requirement — attaching invoice generation to this same scan flow later would give the retailer a reason to use it beyond bookkeeping hygiene) but deliberately out of scope for this entry — scope creep risk, decide separately if wanted.

**Do not start coding without explicit go-ahead** — design is decided (folded-in, not a dedicated screen), but no code written yet. When approved: mobile scan screen + navigation → `ecc:react-reviewer`/react-native conventions; SKU query param addition → `ecc:typescript-reviewer`/`ecc:api-design` (trivial, one optional filter on an existing endpoint); label/tag print surface → design pass if it needs to look good, otherwise cosmetic-only.

---

## 16. F-026 BUG — Mobile "Recently Deleted" → Permanently Delete throws APIError — ✅ FIXED 2026-08-04 (commit `ac50fe8`)

**Report:** retailer opens Settings → Recently Deleted on the Expo mobile app, tries to permanently delete a product, gets a generic `APIError`, delete doesn't happen.

**Root cause (confirmed by reading the code path end to end, not guessed):** `apps/api/src/routes/products.ts:730-731`, the purge route calls `prisma.product.delete({ where: { id } })` directly:

```
try {
  await prisma.product.delete({ where: { id } });
} catch (err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') { ... }
```

F-017's DB guardrail migration (`packages/db/prisma/migrations/037_db_guardrails/migration.sql`) put a `BEFORE DELETE OR TRUNCATE` trigger on the `products` table (`prevent_hard_delete()`) that raises an exception on **any** hard delete unless the session first runs `SET app.allow_hard_delete = 'true'`. This route never sets that flag, so the trigger fires and raises on every purge attempt. The `catch` block only handles Prisma's `P2003` (foreign-key-constraint) error code — the trigger's `RAISE EXCEPTION` surfaces as a different, uncaught Prisma error class, so it falls through as an unhandled 500, which the mobile client shows as the generic `APIError`.

This is a regression introduced by F-017 (shipped 2026-07-26, "Database Guardrails") — the guardrail work correctly locked down accidental/malicious hard deletes but never circled back to update this one legitimate caller. The fix pattern already exists and works elsewhere in this codebase: `apps/api/src/jobs/purge-soft-deleted.ts` (the automated 15-day purge cron) wraps its hard deletes with `db.$executeRawUnsafe("SET app.allow_hard_delete = 'true';")` in the same transaction/connection before deleting.

**Fix applied (2026-08-04, commit `ac50fe8`):** the purge route now uses `getPurgePrisma()` (the `kanchuki_purge` scoped role — see below) and wraps the delete in a `$transaction` that runs `SET app.allow_hard_delete = 'true'` on that transaction's connection before calling `.delete()` — same bypass, scoped to this one request instead of a long-running cron connection. The existing `P2003` catch is kept (a product referenced by a past order/collection genuinely can't be hard-deleted, and that's the correct, already-handled behavior) — the transaction wrapper only fixes the trigger block, doesn't change the legitimate FK-block case. `apps/api/src/routes/products.test.ts` carries a regression comment for the purge route.

**Role-separation question — resolved by the same fix:** the route now runs through `getPurgePrisma()` (`PURGE_DATABASE_URL`, the `kanchuki_purge` scoped role from 2026-08-02), which has DELETE on exactly the purge tables — so even under live role separation (`kanchuki_app` without DELETE grants) this legitimate caller keeps working, identical to the purge cron. It falls back to the shared client with a warning if `PURGE_DATABASE_URL` is unset.

---

## 17. Standalone Product-Photo Cleanup Script — ✅ BUILT 2026-08-05 18:04 IST (not an app feature)

**Not part of the product** — a personal CLI tool, `scripts/batch-clean-photos.py`, built ad hoc this session for manually cleaning raw retailer product photos before catalog upload. Not wired into any app surface, no route/UI/DB touched. Documented here only so it's discoverable next session. `pip install rembg pillow`.

**What it does:** two modes, one per run —
- **Default:** rembg background removal → composite onto a flat `--bg` color or a `--bg-image` backdrop photo (cover-cropped) + soft drop shadow.
- **`--blur RADIUS`:** portrait mode — subject stays sharp, the shot's own background gets gaussian-blurred instead of removed. More forgiving than the swap mode on cluttered rack shots (a bad segmentation edge just looks soft, not obviously pasted).

Both take `--crop x1,y1,x2,y2` (isolates the subject before segmentation — tested and confirmed rembg segments by saliency, not subject identity, so it keeps overlapping neighbor garments/mannequins as "foreground" too; crop only fixes clutter that doesn't physically touch the subject) and `--shine` (contrast/saturation/brightness boost + a soft screen-blended highlight on the subject only, via stdlib-adjacent `PIL.ImageEnhance`/`ImageChops` — no new dependency).

**Explicitly discussed and not built:** compositing the garment onto a stock/AI human-model photo. That's virtual try-on (pose-aware garment transfer), not background work — a flat paste ignores body pose/perspective/drape and looks obviously fake. This project already has the real path half-built (RunPod CatVTON, confirmed working end-to-end in an earlier session — see `docs/PROGRESS.md`) or the planned self-hosted Fashion V-Tone v1.5 engine (`docs/TECH-STACK.md`); real per-run RunPod cost means don't build this without an explicit ask.

**Verified:** ran end-to-end on 3 real retailer product photos across all mode/flag combinations, outputs saved at `scripts/demo/2026-08-05/`.

---

## 18. F-027 DB-Backed Category/Style/Occasion/Fabric Taxonomy — ✅ BUILT + DEPLOYED 2026-08-07

**User ask:** move Category/Style/Occasion/Fabric off hardcoded lists onto the DB — admin-editable, seeded as defaults per new retailer, AI tagging auto-detects Style/Fabric (Occasion/Category already did), dynamic select/multi-select on product add. Ladies-only today, schema ready for Men/Kids later via a `segment` column (zero migration to add them, just new rows). Style/Fabric are multi-select (user-confirmed); Category stays single (`category_id`), Occasion stays multi (`occasions[]`) — both pre-existing.

**Design (mirrors F-024's template pattern, generalized across three kinds instead of three near-duplicate tables):** new `ProductSegment` (LADIES/MEN/KIDS) and `ProductAttributeKind` (STYLE/OCCASION/FABRIC) enums; one generic `DefaultProductAttribute`/`ProductAttribute` model pair (not three copies of the Category pattern) covering all three kinds; `Product.styles`/`Product.fabrics` (`String[]`, no FK — same soft-match convention `Product.occasions` already used). Category keeps its own dedicated `ProductCategory`/`DefaultProductCategory` models since it drives a real `category_id` FK; Style/Occasion/Fabric are soft-matched name lists instead.

**Built:** migration `046_product_attributes` (schema + seed: 9 style/11 occasion/13 fabric defaults + backfill for existing retailers), backend seed helper wired into both signup paths, admin CRUD (`GET/POST/PATCH/DELETE /admin/default-attributes?kind=`), retailer CRUD (`GET/POST/DELETE /v1/product-attributes?kind=`), AI tagger schema extended (`style`/`fabrics` on the same vision call, no new AI cost), `tag-product.ts` never-clobbers `styles`/`fabrics`/`occasions` on re-tag so retailer picks survive the background tagging job. Mobile: product add/edit, customer Fashion DNA preferences, and the bulk catalog-import review screen all wired to the new `productAttributeApi` instead of hardcoded `OCCASION_TYPES`/`FABRIC_TYPES` (deleted from `packages/shared/src/constants`). Admin web UI at `/admin/default-attributes` (kind-tab switcher, same table pattern as Default Categories).

**Migration deployment (2026-08-07):** applying 046 surfaced the live Supabase DB was **four migrations behind**, not one — `_prisma_migrations` topped out at `042_seed_llama_vision_fallbacks`. Diagnosed via direct `information_schema`/`pg_indexes`/`to_regclass` checks rather than trusting the migrations table: 043 (`products.sku/description/subtype`) and 044 (`team_members.phone`) had their DDL already applied by hand at some earlier point but were never recorded; 045 (`default_product_categories`) and 046 (this taxonomy) were genuinely unapplied. All four resolved via Supabase SQL Editor — 043/044 recorded as no-op (columns already existed), 045/046 run fresh — each backed by a manual `_prisma_migrations` INSERT keyed to that file's real sha256 checksum.

**Verified:** live DB query confirms 10 default categories, 33 default attributes (9/11/13 exact), 66 backfilled `product_attributes` rows (2 existing retailers × 33). `pnpm db:generate` + `tsc --noEmit` clean across `@kanchuki/db`/`@kanchuki/api`. API 306/306 tests across 23 files (incl. a 12-test admin CRUD suite + 9-test `product-attributes.test.ts` incl. IDOR), AI 58/58, DB 10/10. Browser-verified (headless, real admin session) at `/admin/default-attributes`: all three tabs render correct seeded names, 0 console errors; live CRUD confirmed by adding a test row through the real admin UI. Full build/deploy log: `docs/PROGRESS.md` "2026-08-07" entries.

---

## 19. F-028 Auto-Contrast Background + AI-in-Background Add-Product Flow — ✅ BUILT 2026-08-08 (commits `ec525bd`, `ed6496b`, `d63ebc2`, `b5897ec`)

**User ask:** "cross check all process of adding new product. every step has errors, i want everything clean and processing AI in background. retailer or team member click photos and save them with adding price, rest everything detected by AI tagging, and set the background, admin will add photos of background and AI detect if product item is in dark color then auto use light background and if product item is light color, then auto switch with dark background image."

**Part 1 — Add-product flow rework (AI runs in the background, `apps/mobile/app/product/add.tsx`):** the blocking "Uploading Product" progress screen (AI-tagging step + spinner machinery) is gone. The flow is now shoot → preview → Use Photo → edit (price) → Save, with the photo uploaded at Save time and everything else (AI tagging + cleanup + background) done server-side after creation. Auto-clean is ON by default; the background-picker chip now reads "Auto" (null = auto-contrast, not plain white); the pre-save color-detect chip was dropped (AI fills color after save).

**Part 2 — F-028 auto-contrast background (full stack):**

| Layer | Files | Summary |
|---|---|---|
| Shared | `packages/shared/src/constants/index.ts` + `src/colors.test.ts` (5) | `classifyColorTone(name)` — resolves the color name to hex via `FASHION_COLOR_ALIASES`, maps to WCAG luminance bands (dark < 0.35, light > 0.6, mid/unknown → null) |
| AI | `packages/ai/src/image-quality.ts` (+ 4 tests) | `imageLuminance()` (32×32 sharp average) + `isDarkImage()` |
| DB | `schema.prisma` + `migrations/047_background_tone` | `BackgroundTone` enum + nullable `background_images.tone` (auto-computed at upload, admin-overridable) |
| API lib | `apps/api/src/lib/backgrounds.ts` (+ 3 tests) | `pickContrastBackground(tone)` — newest ACTIVE backdrop of the opposite tone |
| Tag job | `apps/api/src/jobs/tag-product.ts` (+ 2 tests) | explicit retailer background pick wins; else `classifyColorTone(primary_color)` drives auto-contrast; mid-tone → white default. Never-clobber intact |
| Pro cleanup | `apps/api/src/routes/products/products-pro-cleanup.ts` | no explicit bg → `isDarkImage()` on the raw frame → auto-contrast |
| Admin API | `apps/api/src/routes/admin/admin-media.ts` | tone computed at upload; PATCH override (null clears); audit before/after |
| Admin UI | `apps/web/src/app/admin/background-images/page.tsx` | tone badge + Auto/Light/Dark override select |

**Ops:** migration 047 must be applied (dev `pnpm db:push`, prod Supabase SQL Editor) — `scripts/apply-047-background-tone.sql` (made idempotent in `b5897ec`) is the deploy handoff.

**Known limitation (by design):** the pro-path auto-contrast uses raw-frame luminance as a garment proxy — a busy backdrop can skew it; `tag-product`'s AI-color path is the accurate one.

**Verified:** api/mobile/web/shared/ai `tsc --noEmit` clean; API 342/342, AI 67/67, shared 15/15.

---

## 20. F-029 Photo Rotate (Pre-Save + Post-Save) + Post-Save Background Picker — ✅ BUILT 2026-08-09

**User ask:** let a retailer rotate a product photo in fixed 90° steps — both the pre-cleanup original and the current primary — from the pre-save add-product preview and the post-save product-detail screen, and pick a background from the admin library on the post-save screen (the endpoint already existed; this wires an already-working API into a UI location that never called it).

**Architecture — two rotate mechanisms split by where the photo bytes live at the time:**

- **Pre-save (client-side, `apps/mobile/app/product/add.tsx`):** the photo is still a local device URI, so rotate is pure `expo-image-manipulator` — no server, no new dependency. The untouched capture is kept in `rawPhotoUriRef`; every tap recomputes fresh from it (single extra arg), so 4 taps back to "360°" never compounds lossy re-encodes. The 4th tap restores the original pixels with no re-encode. Scope: the single main preview photo only — Pro-mode multi-shot (`extraFrames`/`proUploads`) excluded.
- **Post-save (server-side, `POST /v1/products/:id/photos/:photoId/rotate`):** both the primary (`photo.r2_key`) and the preserved pre-cleanup original (`metadata.original_r2_key`, exposed to the client as `photo.original_url`) live in R2, so rotate is a server round trip. New `rotateImage(input, degrees)` in `packages/ai` (lazy-imported sharp, JPEG q90 mozjpeg). The route is ownership-scoped (404); `target: 'original'` 422s when the photo was never background-cleaned, rotates the sibling key and never touches `productPhoto.width/height` (those describe the primary); the primary branch swaps stored width/height. Each call rotates 90° **relative to whatever is currently stored** — deliberately no pristine/lossless snapshot mechanism (4 lossy re-encodes to complete a circle on a garment photo isn't a real quality problem worth a sibling-key-preservation mechanism; revisit only on a real complaint). No quota charge — cheap CPU op, not an AI/BG_REMOVAL call.

**Post-save background picker (`apps/mobile/app/product/[id].tsx`):** UI-only — `PATCH /:id/background` and `productApi.setBackground()` already existed and were already exercised by add.tsx. Auto chip (`background_image_id: null`) + one thumbnail chip per active admin background, selection driven by local state hydrated from `product.background_image_id` (a plain scalar column already returned by `GET /products/:id`, newly typed on the client). No new feature-flag check: `getBackgroundImages()` returns `[]` without `CUSTOM_BACKGROUND_LIBRARY`, so the row naturally disappears.

**Mobile:** `productApi.rotatePhoto()` client mirrors `cleanupPhoto` (POST + 30s). Product-detail rotate button shown for both the primary and original carousel slides (cleanup stays primary-only); a client-only per-photo label cycles 90/180/270/360 for feedback (not persisted). `photoCacheBust` reused for both slides (same URL, new bytes). Busy-state guards mirror the cleanup pattern (`rotatingPhotoId`, `rotatingPreview`).

**Verified:** AI 4/4 (image-rotate), API full suite 364/364 (incl. 4 new route tests), api + mobile `tsc --noEmit` clean. Mobile UI unverified on device (no RN simulator). Plan + build detail: `docs/superpowers/plans/2026-08-09-photo-rotate-and-background-picker.md`, design spec `docs/superpowers/specs/2026-08-09-photo-rotate-and-background-picker-design.md`.

### F-029 extension — Photo Set-as-Main + per-photo background picker — ✅ BUILT 2026-08-09 (commit `714a564`)

**User ask:** “when I edit the product and Crop/Remove Background and click on rotate then it works fine, but [it's] not save[d] in database. I want when I edit the product then click on save then product image save into database. … there will add background image, when I remove the background then there will be an option to select background image and add it on the product image, this is the whole process of edit product image and once save this image is main image to shown on catalog and display, rest will be others.”

**Decisions (user-confirmed):** explicit **“Set as main”** button (not auto-promotion on save), applied instantly with the existing Save persisting form edits.

**Core insight:** every customer/catalog surface already orders photos by `is_primary DESC` (`public-products.ts` list + detail, `public-collections.ts`, `public-retailers.ts` all use `orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }]`), and web cards render `primary_photo_url` — so “make this the main image” is a single flag flip, and every display surface follows with zero further wiring.

| Layer | Files | Summary |
|---|---|---|
| **API — promotion** | `apps/api/src/routes/products/products-media.ts` | `PATCH /v1/products/:id/photos/:photoId` now accepts `{ is_primary: true }` → `prisma.$transaction([updateMany demote-all (scoped to product+retailer), update promote target])`. Exactly one primary guaranteed; race-safe under Postgres READ COMMITTED (concurrent promoters serialize on the row locks, last writer wins). Ownership-verified `findFirst` before the unscoped promote `where: { id }`. Body schema uses `is_primary: z.literal(true).optional()` — a `false` payload 422s instead of silently falling into the piece_type branch. Response returns the re-fetched photo |
| **API — per-photo background** | same file | `POST /:id/photos/:photoId/cleanup` accepts optional `background_image_id` (nullable). When set: gated behind `hasFeature(CUSTOM_BACKGROUND_LIBRARY)` (fail-closed 402 — same feature surface as `GET /background-images` and `PATCH /:id/background`), looked up active-only (422 if inactive/missing), and its `image_url` wins over the product-level backdrop. When null/absent: falls back to the product-level active background (or white), unchanged behavior. Composite is baked into the photo bytes (no per-photo bg column — deliberate) |
| **Mobile client** | `apps/mobile/src/lib/api/products.ts` | `setPhotoPrimary(productId, photoId)` (PATCH `{ is_primary: true }`) + `cleanupPhoto(productId, photoId, backgroundImageId?)` now sends the per-photo backdrop |
| **Mobile UI** | `apps/mobile/app/product/[id].tsx` | **Set-as-main button** (star icon; gold-filled + “Main photo ✓” when already primary; busy-state `settingPrimaryId`; disabled on variant/original slides) → `handleSetPrimary`. **“Main” badges** on the carousel overlay + thumbnail strip (turmeric/star; hidden for variant + original slides). **Background row** per currently-viewed photo: Auto chip (null → white/product-level) + one thumbnail per active admin background; recomposites THAT photo via `cleanupPhoto(..., backgroundImageId)`; session picks in `photoBackgrounds` **merge** (never replace) on the 3s AI-tagging poll refetch so they survive; hidden without `CUSTOM_BACKGROUND_LIBRARY` (picker API returns `[]`) |
| **Tests** | `apps/api/src/routes/products.test.ts` | Products suite 18 → 26: promotion demote-all + promote inside `$transaction` (atomicity asserted), piece-only PATCH does no demotion, 404 on foreign photo, per-photo bg lookup called with the id, 422 inactive/missing bg, **402 fail-closed without the feature**, product-bg fallback with no lookup, 404 ownership |

**Verified:** API full suite 372/372, api + mobile `tsc --noEmit` clean (required rebuilding `@kanchuki/ai` — stale dist without `rotateImage`). **Deployed 2026-08-09:** pushed to origin, API auto-deployed `bbadc4ce` (SUCCESS, built from `714a564`). **Live-verified in browser** on the Priya Cloth House storefront: category-grid card image and product-detail first image both render the DB primary photo (`is_primary` ordering confirmed end-to-end across code → live API → rendered DOM). Mobile UI still ships via EAS build (pending).

## 21. Bugfix — edited photos (crop/rotate/background) not visible after save — ✅ FIXED + DEPLOYED 2026-08-10 (commit `4067306`)

**User report (with screenshots):** crop/remove-background and background-swap "works well, but still not saved" — the product-detail screen and the catalog grid both kept showing the same old (raw, pre-edit) photo after saving and navigating back.

**Root cause (confirmed by reading the code, not guessed):** `/cleanup`, `/rotate` (primary target), `PATCH /:id/background`, and the automatic post-upload cleanup in `tag-product.ts` all overwrite a photo's bytes **in place at its existing R2 key** — the stored `ProductPhoto.url` never changes. `tag-product.ts` even had a comment stating this was intentional ("Same r2_key/photo_url, so no DB write needed"). Because the URL is stable, CDN and client image caches (expo-image, browser, Cloudflare edge) keep serving the pre-edit bytes indefinitely — the R2 object and DB row *were* actually updated correctly, the client just never re-fetched.

**Fix:** new `bumpPhotoUrlVersion(url)` helper (`apps/api/src/lib/photo-cleanup.ts`) stamps a `?v=<timestamp>` query param on the stored `ProductPhoto.url` after every in-place overwrite, forcing a fresh fetch everywhere that URL is read — retailer app, customer storefront, admin — with no per-client cache-busting workaround needed. Wired into all four overwrite sites listed above. Also removed the dead Upper/Lower piece-tag buttons + hint text from `apps/mobile/app/product/[id].tsx` (user-requested UI removal) and added a shadow to the photo-carousel card frame (this was a misread of the "shadow" ask — see F-030 below for the actual request).

**Deploy gotcha hit:** the fix was written and tested in a prior session but left **uncommitted** — the user's app points `EXPO_PUBLIC_API_URL` at production (`https://api.kanchuki.app` via `apps/mobile/.env.local`, which overrides `.env`), so nothing changed until it was actually committed, pushed, and Railway auto-deployed it. Lesson: a local code fix means nothing to a prod-pointed mobile client until it ships — always confirm deploy status before treating a photo-pipeline fix as done.

**Verified:** `apps/api`/`apps/mobile` `tsc --noEmit` clean, `products.test.ts` (36/36 incl. 2 assertions updated for the new versioned-URL behavior) + `tag-product.test.ts` green. **Deployed:** pushed to `main` (`4067306`), Railway auto-deploy triggered. **Not yet re-verified live** — needs a fresh crop/rotate/background-swap test against production after deploy completes to confirm the catalog/detail screens now show the edited image.

## 22. F-030 Shadow toggle for cropped/background-removed photos — ✅ BUILT + DEPLOYED 2026-08-10

**User ask:** "i asked to give shadow options for cropped product item... i want same like background image shadow selection option" — clarified via question: a single on/off toggle (not multiple shadow-style presets), composited under the garment cutout, same place/pattern as the existing BACKGROUND swatch row on the product-detail screen. Confirmed as part of the same upfront flow already built for background removal/pick: retailer sets the toggle before/at Save, AI applies it in the background job while the retailer moves on to the next product.

**Design:** mirrors `background_image_id` exactly — a product-level `add_shadow` boolean (default false), read by the automatic post-upload cleanup job, overridable per-call by the per-photo `/cleanup` endpoint (same override pattern `background_image_id` already uses there) without persisting the override.

**Built (all of the above, shipped 2026-08-10):**
- `packages/db/prisma/schema.prisma` — `Product.add_shadow Boolean @default(false)`; migration `048_product_shadow` written. **Migration APPLIED live 2026-08-10** (Supabase SQL Editor) — `add_shadow` column confirmed present; deployed API verified healthy. Code shipped before the column existed per the F-029 deploy-gotcha; the column must exist before any `add_shadow` write/read succeeds.
- `packages/ai/src/detector.ts` — `cleanupProductPhoto(buffer, backgroundImageUrl?, addShadow?)` shadow path: `buildShadowLayer()` builds a blurred, faded (35% opacity), downward-offset black silhouette of the cutout's own alpha shape via a raw-pixel loop, composited under the cutout before the background/white layer. Backward-compatible — param defaults to false/undefined. Also hardened `bgRemovalPublicPath()` with an `import.meta.resolve` guard (Node 20.6+ native API, absent under vitest's SSR transform — fallback to `''` there; the module is mocked in tests, so the value is never consumed).
- `apps/api/src/routes/products/products-helpers.ts` — `add_shadow: z.boolean().optional()` on `CreateProductSchema`/`UpdateProductSchema`.
- `apps/api/src/routes/products/products-media.ts` — `/cleanup` accepts optional `add_shadow` per-call override, resolved `body.data.add_shadow ?? photo.product.add_shadow` (wins for THAT cleanup only, never persisted); `PATCH /:id/background` honors the product-level `add_shadow` when re-cleaning after a background change.
- `apps/api/src/jobs/tag-product.ts` — auto-cleanup passes `withBg?.add_shadow` through to `cleanupProductPhoto` (upload-time toggle honored by the background job).
- `apps/mobile/app/product/add.tsx` — Shadow toggle in the upload-flow edit step (shown when Auto-clean is on), sent as `add_shadow` in `productApi.create()`.
- `apps/mobile/app/product/[id].tsx` — SHADOW toggle chip next to the existing BACKGROUND row: session per-photo preference seeded from the product default (merge-never-replace hydration, safe against the 3s polling refetch), flipping it re-runs cleanup on the currently-viewed photo with its current background preserved; both "Crop & remove background" and background swaps carry the preference.
- `apps/mobile/src/components/product-detail/types.ts` — `Product.add_shadow?: boolean`; `apps/mobile/src/lib/api/products.ts` — `cleanupPhoto(productId, photoId, backgroundImageId?, addShadow?)`.
- Tests: `packages/ai/src/detector.test.ts` (3 — real sharp, mocked @imgly: shadow changes output bytes, omitted param is byte-identical to false, shadow survives bg-fallback); `products.test.ts` 29 (3 new: explicit override, product-default fallback, default-no-shadow); `tag-product.test.ts` 12 (2 new pass-through cases).
- **Verified:** `db:generate` clean, `tsc --noEmit` clean across `packages/db`/`packages/ai`/`apps/api`/`apps/mobile`, API suite 358/358, AI suite 74/74 (image-compress needs >5s/test on this box — pre-existing, unrelated), biome clean on new code. **Deployed:** pushed to `main` (commit below), Railway auto-deploy triggered. **Migration 048 applied live 2026-08-10** (Supabase SQL Editor) + deployed API re-verified healthy. **Remaining:** app-side toggle re-verify (retailer taps SHADOW in the app).

## 23. F-031 Social Media Publishing — Retailer connects Instagram/Facebook + posts products/collection links — 🔴 PLANNED (spec only, no code)

**Status:** 🔴 Planned, not started. Spec written 2026-08-13. **Do not start development until explicitly told to proceed** — reference this entry + `CLAUDE.md` when the go-ahead is given.

**User ask:** "retailer can configure their social media accounts within the app and they can push the selected product items, or catalog link with listing on their social media account like facebook, instagram etc."

### 23.1 Problem

Retailers already produce catalog-quality assets inside Kanchuki (ghost-mannequin-cleaned product photos, AI-generated name/subtype/description, priced products, a shareable collection page at `/c/[slug]`) — but those assets currently reach customers through exactly one outbound channel: WhatsApp. The same assets are exactly what a good Instagram/Facebook post needs, and the retailer has to redo all of it manually outside the app (download photos, open Instagram, write a caption, upload). No reuse of data Kanchuki already has.

### 23.2 What this builds on (verified existing pieces, not assumptions)

| Existing piece | Role in F-031 |
|---|---|
| Collection links `/c/[slug]` (customer PWA, F-006) | The shareable URL posted in social posts — already renders a full storefront page |
| WhatsApp collection-link share (F-006, built) | Proves the "share an existing asset" pattern; social posts reuse the same link with `?utm_source=` attribution |
| F-012 encrypted per-retailer secrets (Razorpay keys, AI provider keys) | The credential-vault mechanism that stores Meta OAuth tokens encrypted per retailer |
| F-022 Auto-Post to Google Business Profile (planned, `docs/PRO-REQUIREMENTS.md` §10.13) | The same "OAuth-connect an external account → push products" pattern — F-031 should share one generic connected-account/publishing engine, not a third parallel integration |
| Product photo pipeline (ghost-mannequin, ≤80KB compression, primary-image ordering) | The image assets for posts, already fit for social-media specs |

### 23.3 Platform realities (facts that shape the design — verified 2026-08-13)

- **Instagram Graph API requires a Business or Creator account** linked to a Facebook Page. Personal accounts cannot be posted to via API. Retailers running personal accounts must convert (free, one-time) or get a non-API fallback (below).
- **Instagram feed captions cannot contain clickable links.** The collection link must live in the bio, a Stories link sticker, or the CTA must route to WhatsApp ("DM us"). Facebook page posts *can* carry clickable links. CTA handling is therefore per-platform.
- **Meta app review is a process gate**: publishing permissions (`pages_manage_posts`, `instagram_business_content_publish`) require a Meta for Developers app + Meta review (demo screenshots/video, days–weeks, external timing). Must be submitted in parallel with development, not after.
- **Tokens expire** (~60-day user tokens) and need refresh + re-auth flows; token lifecycle is a real work item (store via F-012 encrypted-secret mechanism).

### 23.4 Scope — what the retailer can push

Three post types, ascending effort:

1. **Single product post** — pick one product → post its hero image + AI-generated name + price + CTA. Most common ("new arrival").
2. **Multi-product carousel** — up to ~10 products → Instagram carousel / Facebook album, one image per swipe. Best for "new collection" drops.
3. **Catalog/collection link post** — one image + the `/c/[slug]` collection link → the social post becomes a doorway to the full storefront.

### 23.5 Phased build plan

**Phase 1 — Facebook foundation (simplest API, no business-account barrier):**
- Meta OAuth connect for a Facebook Page (retailer picks which Page; token stored via F-012 encrypted secrets)
- Token expiry tracking + one-tap re-auth
- Single-product post: select product → preview → post to Facebook Page
- Post history (what was posted, when, link to the live post)
- Meta app review submission for `pages_manage_posts` (parallel with build)

**Phase 2 — Instagram + richer posts:**
- Instagram Business connect (via the linked FB Page; guide personal-account retailers to convert)
- Multi-product carousel posts
- Auto-generated captions from existing product data (name + price + emoji + "Order via WhatsApp")
- Per-platform CTA: Instagram → "DM us / link in bio"; Facebook → clickable collection link
- **Non-API fallback for personal-account retailers**: "copy ready-made caption + share photo to the Instagram app" (works, but not automated — document the tradeoff)

**Phase 3 — Automation & attribution:**
- "Post to all connected accounts" (one tap → FB + IG, later Google Business Profile via shared engine)
- Opt-in auto-post on new arrivals (mirror of F-022; default OFF, preview-first, never silently auto-post)
- UTM-tagged collection links (`?utm_source=instagram&utm_campaign=...`) for visit attribution

**Phase 4 — Stretch (decide later):** Instagram Stories link sticker, YouTube Shorts, scheduling (draft + pick time).

### 23.6 Usability requirements

- Settings → Social Media: Meta-branded connect flow (login popup → pick Page) with zero developer jargon; status shown (connected account name, post count)
- Composer: product multi-select grid (reuse existing pickers) → live post preview (caption + image) → editable caption → Post
- Post success: "Posted ✓ View on Instagram" linking to the live post
- Failure states: token expired → "Reconnect to continue posting" (one tap, no data loss); API error → human-readable message + retry
- **Every post is a deliberate retailer action** (or an explicit preview-first auto-publish toggle). No surprise posting.

### 23.7 Architecture note (important)

Build this as a **generic "connected publishing accounts" module** (one `SocialAccount` model: platform, account id, tokens, status) + one publishing service with per-platform adapters. Facebook, Instagram, and the planned Google Business Profile (F-022) then become *configurations* of the same engine instead of three parallel integrations. If that feels heavy for Phase 1, the pragmatic middle: Facebook adapter first, but the model/service shaped so adding Instagram (and later Google) is additive, not a rewrite.

### 23.8 Acceptance criteria (Phase 1)

- Retailer connects a Facebook Page via Meta login → Page name shown in Settings → Social Media
- Retailer selects one product → previews the auto-generated post → posts → success screen links to the live FB post
- Post history lists every post with timestamp + live link
- Token expiry → app prompts one-tap reconnect (no silent breakage)
- Personal-account Instagram retailer sees the guided conversion path (not a dead end)

### 23.9 External blockers / risks

- **Meta app review** — external timing, can stall a sprint; mitigation: submit in parallel with Phase 1 build, use development-mode for live retailer testing
- **Instagram no-clickable-link rule** — CTA strategy must be WhatsApp-first ("DM us"), which plays to Kanchuki's core strength
- **Token churn** — password changes break tokens; reconnect must be low-friction or posting silently breaks (covered by 23.6 failure states)
- **Value depends on retailer social audience** — amplifier, not lead generator by itself; position accordingly in sales/marketing

### 23.10 Complexity estimate

- Phase 1 (Facebook single-product): ~3–5 dev days + Meta review time (external)
- Phase 2 (Instagram + carousel + captions): ~4–6 dev days
- Phase 3 (multi-post + auto-publish + UTM): ~3–4 dev days
- Total ~2–3 weeks of build, plus Meta review wait and (if chosen) Instagram-commercial-app review

### 23.11 Why not built yet

Post-launch feature. Not in locked MVP scope; the launch (Play Store batch, billing, privacy) is the current focus. Slots into Phase 1 (post-MVP) — see `docs/PLAN.md`. Meta app review should be requested well before development starts if this becomes a priority.

## 24. F-032 AI Studio Shoots + Product Videos (PhotoRoom-style) — 🔴 PLANNED (spec only, no code)

**Written 2026-08-13** after deep research into PhotoRoom's published tech stack
and the 2026 image/video model landscape. See `docs/BUILD-LOG.md` (F-032
entry) for the full research write-up. Roadmap slot: `docs/PLAN.md` (Future,
post-MVP — after F-031 ships).

### 24.1 Problem

Retailers photograph products on a rack or in a plain room — the photo is
real but looks unprofessional. Today Kanchuki's pipeline (rembg cutout +
ghost-mannequin + F-028 auto-contrast background) already produces a clean
cutout, but the *background* is still a flat color and there is no video at
all. PhotoRoom built a business on exactly this gap: "photo → studio shot →
video ad." Retailers get a storefront that looks like a brand instead of a
stall, and shareable video content for WhatsApp/social.

### 24.2 What PhotoRoom actually does (research findings)

| Layer | PhotoRoom's approach | Why it matters for us |
|---|---|---|
| Segmentation | Proprietary on-device background-removal model | We already have this: rembg + LaMa ghost-mannequin (`scripts/batch-clean-photos.py`) |
| Studio backgrounds | Custom diffusion foundation model (~1B params, trained on ~90M images) doing **outpainting** — preserves the product's pixels exactly, invents matching lighting/shadow | Subject preservation is the #1 lesson: keep user pixels, generate only the scene |
| Speed | Sub-second inference (distillation + TensorRT) | Interactive UX expectation; we can accept seconds, not realtime |
| Video | Product-focused image-to-video + **300+ motion templates**; Multi-Image Video API (up to 7 refs → 360° spins) | Template-first (not prompt-first) is the right UX for SMB retailers |
| AI Fashion Model | Lifestyle on-model shots from a single product photo (retailers report 25–32% photographer-cost cuts) | The stretch goal — V-Tone is the seed of this |

**PhotoRoom's lessons to copy:** (1) own the subject, not the scene; (2) one
model, many features; (3) templates beat free text for business users; (4)
latency is part of the product.

### 24.3 Model landscape (2026)

**A. Studio images (product → studio shoot):**
- **FLUX.1 Kontext** (Black Forest Labs, open weights + paid API) — 12B
  instruction-based editing model, purpose-built for "put this product in X
  scene" with strong subject consistency. Self-host needs ~24GB VRAM; API is
  pay-per-image (~₹2–6/image via BFL/Replicate).
- **FLUX Redux** — style re-render (secondary).
- **SDXL/SD1.5 + ControlNet(depth) + LoRA** — the budget ComfyUI path, 8–12GB
  GPU, needs per-retailer LoRA for subject consistency.
- **SaaS APIs** (PhotoRoom, Remove.bg, Clipping Magic) — zero infra, per-image
  cost forever, data leaves the platform.

**B. Product videos:**
- **Seedance 2.0** (ByteDance, API) — best reference-image consistency; ~5–10s
  clips; **~$0.09–0.20/s ≈ ₹40–90 per 5s clip**.
- **Kling 2.x** (API) — strong product motion presets.
- **Veo 3** (API) — best quality, priciest.
- **Wan 2.1/2.2** (Alibaba, open weights) — best open image-to-video; 1.3B
  variant on ~8GB VRAM (slow); full model 24GB+.
- **HunyuanVideo / LTX-Video** (open) — heavier / faster-and-lower-fidelity.

### 24.4 Scope

**Phase A — Studio shoot (build first):**
- "Studio shoot" button on product detail (mobile) → server pipeline:
  cutout (existing) → subject-consistent background generation → compose →
  ≤80KB compress → write back to R2 (existing pipeline) → `?v=` cache bump
- **Template presets only** (PhotoRoom-style dropdown): White Studio, Warm
  Luxury, Gold Festive (Diwali), Flat-Lay Casual. No free-text prompts.
- Generation via **FLUX Kontext** — start on paid API (BFL/Replicate), move
  to a self-hosted GPU box (Hetzner GEX44-class, ~₹8–12k/mo) once usage is
  real. GPU is mandatory — the CPU-only CX43 cannot run a 12B diffusion model.

**Phase B — Product video:**
- Product photo + motion preset (slow zoom, 360° spin, fabric sway) → 5s
  1080p clip via commercial API (**Seedance 2.0** first for consistency;
  **Kling** for motion presets).
- Charge as a **paid add-on** (~₹49–99/clip) so the ~₹45 API cost is covered
  (mirrors F-019's paid-service pattern).
- Self-host **Wan 2.1 (1.3B)** later for a zero-API-cost automated spin-video
  queue — defer until video is a proven revenue line.

**Phase C — AI Fashion Model (stretch, not scoped):**
- Consistent brand model (same face/pose) across listings — V-Tone's
  garment-transfer is the seed, but this is the riskiest quality-wise for
  ethnic wear (saree draping remains the known weakness). Explicitly a
  post-post-MVP exploration, not a build commitment.

### 24.5 Reuses existing infra (verified)

- `scripts/batch-clean-photos.py` (rembg cutout, LaMa ghost-mannequin)
- R2 image pipeline + ≤80KB compressor + `bumpPhotoUrlVersion()` cache bust
- F-028 background tone auto-selection
- V-Tone try-on engine (future AI Fashion Model seed)
- F-012 encrypted secrets + admin-configurable provider pattern (AI Provider
  Registry) — video/studio providers fit the same registry

### 24.6 Explicitly NOT doing

- ❌ Training a custom foundation diffusion model (PhotoRoom's 9-person ML
  team / ~90M-image / multi-$M path is not ours)
- ❌ Running image/video generation on the CX43 CPU box (V-Tone at ~32
  min/image is the warning — video would take hours)
- ❌ Flat-pasting cutouts onto stock photos (the fake look already rejected in
  ghost-mannequin research)
- ❌ Free-text prompts for retailers — templates only

### 24.7 Costs / pricing math

| Item | Est. cost | Charged as |
|---|---|---|
| Studio background (API) | ~₹2–6/image | Included in Growth/Pro (fits the existing AI cost budget pattern) |
| Product video (API) | ~₹40–90 / 5s clip | Paid add-on ₹49–99/clip |
| GPU box (self-host, optional Phase B) | ~₹8–12k/mo | Replaces per-image API cost at scale |

### 24.8 Risks

1. **Subject consistency** is the whole game — a warped or re-lit product
   reads as fake instantly (PhotoRoom invested years here). FLUX Kontext is
   the safest starting point.
2. **Ethnic-wear fidelity** — drapes, pleats, and dupatta layering stress
   generation models; expect template iteration per category.
3. **API-vs-self-host cost curve** — API is fine for testing; self-host only
   after usage justifies the GPU.
4. **Trust** — an AI-edited product photo that misrepresents the actual item
   is a customer-trust risk; keep the original photo one tap away in the
   product gallery.

### 24.9 Acceptance criteria (Phase A)

- Retailer taps "Studio shoot" on a product → selects a template → receives a
  studio-background image preserving the product's shape/color/pattern
- Background looks cohesive (lighting matches), not a pasted cutout
- Original photo stays available; edited image can be set as primary
- Generation cost tracked per retailer (reuse `AiUsageLog` pattern) and
  gated per plan
- Works fully through the existing offline-tolerant mobile flow

### 24.10 Complexity estimate

Phase A ~2–3 weeks (integration + templates + plan gating). Phase B ~1–2
weeks after A (API wiring + add-on billing). Phase C unestimated (research).

### 24.11 Why not built yet

Spec written 2026-08-13 on user request; F-031 (social publishing) is the
current in-flight build and this is explicitly post-MVP scope. Do NOT start
until the user says go.
