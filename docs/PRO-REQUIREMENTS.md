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
**Status:** 🔲 Planned
**Priority:** P0 (for retailers above ~100 SKUs; below that, single-photo F-001 flow is sufficient)

**Problem:** A store with 3000 items cannot realistically be onboarded one photo per item — even at 20 photos/batch (F-001) that's 150 upload batches. Two pipelines already exist (F-001b PDF import, F-001c multi-item detection) that each turn one capture into many products; this feature packages them into a dedicated onboarding wizard instead of leaving the retailer to discover ad-hoc bulk upload on their own.

**Two capture paths, same review queue:**

1. **Path A — Rack/Shelf Batch Capture (reuses F-001c, no new detection code).** Retailer photographs one rack/shelf at a time (10–20 folded/stacked items per photo instead of 1). Each photo runs the existing `detectCropAndTag()` pipeline. New: the wizard asks for the rack/shelf location **once per photo**, not once per item — every crop detected from that photo inherits the same Floor→Section→Rack→Shelf value by default (retailer can override per-item in review if a rack is mixed). This is the piece that doesn't exist today; F-001c currently has no location-inheritance step.
2. **Path B — Supplier Catalog Reuse (reuses F-001b, no new import code).** If the retailer restocks from a wholesaler/manufacturer that already provides a printed catalog, PDF, or pricelist, the existing PDF import endpoint (`POST /v1/catalog-import/import-pdf`) is surfaced directly inside onboarding instead of only inside the general catalog-import screen. Retailer reconciles price/stock/location per item afterward; whatever fraction of the 3000 SKUs matches a supplier catalog needs zero retailer photography.

**New work needed (wizard shell, not new AI/detection logic):**
- Onboarding branch: "~how many items do you carry?" → routes to guided bulk wizard when answer is above a threshold (e.g. 100), instead of the existing single-product-upload step 4 in F-007.
- Unified review queue merging drafts from both paths (currently F-001b and F-001c each have their own review screen) with a running counter ("482 / 3000 catalogued") so a multi-day onboarding can be resumed.
- Duplicate-flag check: perceptual-hash (e.g. `sharp` + a pHash lib) on each cropped product image, warns retailer before save if a crop looks near-identical to one already catalogued (same design shot twice across two rack photos, or already present via a supplier import) — resolves independently of AI tagging, doesn't block save.
- Location-inheritance field on the batch-capture UI (Path A) — this is the one net-new mobile screen; everything else is routing existing endpoints into a new entry point.

**Acceptance Criteria:**
- Retailer can go from empty catalog to 3000 catalogued items without shooting more than ~150–300 rack photos (Path A) plus whatever supplier catalogs cover (Path B)
- Rack-photo location field is entered once per photo, not once per item
- Review queue remains usable (no pagination collapse, no timeout) at 100+ pending drafts in a single batch
- Duplicate warning fires on same-design re-shoots without blocking the retailer from saving anyway if it's a false positive
- Wizard is optional — retailers under the SKU threshold keep the existing single-photo F-001 flow unchanged

**Explicitly not in this feature:** no new Claude Vision prompt, no new detection model — this is a UX/routing layer over F-001b + F-001c.

**Dev workflow (when this ships):** run `database-reviewer` skill before applying the location-inheritance field migration (schema/RLS check, same convention as 005/006/007 in this repo). Run `code-review` skill on the wizard/review-queue diff before merge (standard repo gate, not new for this feature).

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
**Status:** 🔴 **Not started** — planned, spec only (2026-07-16)

**Priority:** P1  
**Description:** Retailer-facing settings screen covering account and team management. Mostly UI wiring over pieces that already exist rather than new backend surface.

**Sections:**
1. **Profile** — edit shop name, owner name, city, state, GSTIN, categories, pincode. Delete/deactivate account (soft-delete via `Retailer.deleted_at`, already a column).
2. **Subscription** — view current plan, usage vs limits (reuses F-008's "Plan usage" data + F-010 below), upgrade/downgrade/cancel (reuses the billing screen + Razorpay endpoints already built per `docs/PLAN.md` Month 4).
3. **Team** — invite/remove shop staff, reuses the existing `Staff` table (`docs/DATABASE.md`) — no UI exists for it yet, this is the missing piece.
4. **WhatsApp** — configure the WhatsApp number used for collection links (F-005) and remote try-on (F-103). New: `Retailer.whatsapp_number` (nullable, falls back to `phone` if unset) — today the code assumes `phone` IS the WhatsApp number, which breaks for retailers using a separate business number.

**Acceptance Criteria:**
- Retailer can edit every profile field and see the change reflected on collection links immediately
- Account delete requires confirmation + shows what happens to active collections/customers (soft-delete, not a hard delete — GST/audit records must survive per `docs/SECURITY.md`)
- Team screen lists staff with role, add/remove without support involvement
- WhatsApp number validated (10-digit Indian mobile) before save

---

#### F-010: Quota & Limits System (Admin-Configurable, Cross-Resource)
**Status:** 🔴 **Not started** — planned, spec only (2026-07-16)

**Priority:** P0 — blocks safe monetization; see CLAUDE.md Key Risk #4 (AI cost per try-on, margin tight at ₹999/month plan)

**Problem:** Limits today are 3 hardcoded columns on `Retailer` (`max_products`, `max_customers`, `try_on_credits`, see `docs/DATABASE.md`), settable only by changing the whole plan. There is no limit — and no usage tracking — for AI-tagging calls, image crop, background removal, or general API requests. Every new metered resource today means a new column + new enforcement code scattered per endpoint. The only "buy more" path is the manual "extra 50 try-ons ₹299" line in the pricing table — not self-serve, not generalized to other resources.

**Design — one mechanism for every resource, not one column per resource:**
- `plan_limits` table: `(plan, resource_type, limit_per_period, period)` — admin edits rows in the existing admin panel; adding a new limit value never requires a schema change.
- `retailer_limit_overrides` table: same shape keyed by `retailer_id` — lets admin grant one retailer a bespoke limit without inventing a new plan tier.
- `usage_counters` table: `(retailer_id, resource_type, period_start, count)` — incremented by one shared `incrementUsage(retailerId, resourceType, n)` call at each metered action site.
- One `checkQuota(retailerId, resourceType)` gate, called before every metered action. Over limit → `QuotaExceededError` → API responds 402 with `{ used, limit, resource_type, addon_price }` so the client can render an upsell instead of a bare failure.
- `quota_addon_purchases` table — generalizes the existing "extra 50 try-ons ₹299" add-on to any `resource_type`. One-time Razorpay charge (reuses the subscription billing integration already built) tops up `usage_counters` for the current period.
- `resource_type` enum, extensible: `PRODUCT_UPLOAD, AI_TAGGING_CALL, TRY_ON, IMAGE_CROP, BG_REMOVAL, API_REQUEST`.

**Admin surface:** CRUD on `plan_limits` / `retailer_limit_overrides` inside the existing admin panel (`docs/PLAN.md` Month 4 — admin panel already deployed) — no new admin infrastructure needed, just new screens on it.

**Explicitly not in this feature:** per-second/burst rate limiting (that's an infra concern — Fastify/Cloudflare rate-limit plugin — not a billing quota) and usage-based dynamic pricing (flat overage packs only, matches the existing pricing model in Section 6).

**Acceptance Criteria:**
- Every metered action (upload, AI tag, try-on, crop, bg-removal, API call) is gated by `checkQuota` before it runs
- Admin can change any plan's limit for any resource without a deploy
- Retailer sees usage vs limit per resource in F-009's Subscription section
- Crossing a limit shows an in-app "buy more" flow, completes via Razorpay, unblocks immediately on webhook confirmation

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
**Status:** 🟡 **Partially built** — engine deployed on RunPod, bg-removal preprocessing works, multi-piece chaining built (2 sequential CatVTON calls: upper → customer photo, then lower → first result). Quality on multi-piece ethnic wear still needs a real 2-piece outfit test. **✅ Licensing resolved** — commercial license obtained from CatVTON's author (2026-07-13).
**Description:** Customer uploads their photo, selects product, AI generates try-on preview.

**Tech:** CatVTON (self-hosted Python microservice)  
**Cost:** ~₹0.4 per try-on (self-hosted on L4 GPU)  
**GPU Requirement:** 8GB+ VRAM (RTX 3060 or better)  
**Latency:** ~35 seconds per try-on  
**Quality threshold:** 80% of try-ons rated "acceptable" by sample retailer panel

**Deployment Strategy (Two-Step):**

**Step 1 — Deploy CatVTON as-is (Week 1):**
- Python/FastAPI microservice wrapping CatVTON
- Containerized, deployed on RunPod L4 GPU ($0.44/hr, serverless)
- Works well for kurtis, suits, gowns, readymade garments
- ~$0.005 per try-on

**Step 2 — Fine-tune for Indian ethnic wear (Week 2-3):**
- Collect 200-500 Indian garment photos from real uploads
- Create segmentation masks (SAM-based)
- Run LoRA fine-tuning for sarees, lehengas, unstitched suits
- Swap model weights — no application code changes needed

**Cost:**
| Method | Cost per try-on | Monthly (1000 try-ons) |
|--------|----------------|----------------------|
| **CatVTON (self-hosted)** | **₹0.4** | **₹400** |

**Specific challenges for Indian ethnic wear:**
- Saree draping (6-yard drape simulation) — requires fine-tuning
- Dupatta placement — requires fine-tuning
- Unstitched suit layering — requires fine-tuning
- Heavy embroidery texture rendering — CatVTON handles well natively

**Product Photo Requirements (input-quality gate — root cause of most low-match results):**
- Background: plain/removed (rembg or remove.bg preprocessing step before CatVTON call — raw retailer photos are NOT bg-clean by default, must add as pipeline step in `triggerCatVTON`)
- Capture: ghost-mannequin or flat-lay, front view, garment only, no props/wrinkles/watermark
- Lighting: even, diffused, no hard shadow
- Resolution: min 768×1024
- Category mapping: CatVTON accepts one of `upper` / `lower` / `overall` per call — no native multi-garment compositing
  - Kameez + Salwar (2-piece): two sequential calls (upper, then lower on the first result), OR single `overall` photo if garment shot as a set
  - Dupatta: excluded from CatVTON pass (draping physics unsupported) — either static PNG overlay post-render or omit for MVP

**Customer photo requirements:** front-facing, full body, plain background, standing straight, arms slightly away from torso, fitted/plain clothing (baggy clothes confuse the silhouette mask), even lighting.

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
#### F-302: UPI Payment Tracking (via payment links)
#### F-303: Order Management & Delivery Tracking
#### F-304: GST Invoice Generation (CRITICAL — needed at Phase 3 or earlier if mandated)
#### F-305: Multi-Store Management
#### F-306: Regional Language UI (Hindi, Gujarati, Punjabi, Tamil)

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
- **CatVTON** — AI virtual try-on (self-hosted)
- **Replicate (IDM-VTON)** — VTO fallback
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
