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
**Description:** Retailer takes photo of product (suit/saree/kurti). AI auto-extracts:
- Category (unstitched suit, kurti, saree, lehenga, etc.)
- Primary color, secondary colors
- Fabric estimate (cotton, silk, georgette, chanderi, etc.)
- Pattern (plain, printed, embroidered, bandhani, etc.)
- Embellishments (zari, mirror, gota, sequin, etc.)
- Occasion tags (casual, party, wedding, office, festive)
- Neck style, sleeve type
- Price range (if visible on tag/board)
- Auto-generated search tags

**Acceptance Criteria:**
- Upload completes in < 5 seconds on 4G
- AI tagging completes in < 10 seconds
- Accuracy ≥ 80% on category, color (validated on 100 ethnic wear samples)
- Retailer can edit any AI-generated field before saving
- Bulk upload: up to 20 photos simultaneously

---

#### F-001b: PDF / Printed-Catalog Bulk Import
**Status:** Planned — not built. No PDF-parsing code exists anywhere in the repo today (checked `apps/mobile/app/product/bulk.tsx`, `packages/ai/src/tagger.ts` — bulk import is photo-only).

**Problem:** Many vendors already have a manufacturer/wholesaler PDF catalog (or a printed catalog they could scan/photograph as pages) listing many designs at once — re-photographing every physical piece by hand is the adoption friction F-001's bulk import doesn't fully solve for this vendor type.

**Description:** Retailer uploads a PDF catalog (or a set of scanned catalog-page images). System extracts each individual product image + any printed text (design number, price, fabric name if labeled) from the PDF/page, creates one draft `Product` per detected item, and runs each through the existing F-001 AI-tagging pipeline (`tagProductImageUrl`) for the fields not printed on the page.

**How it would work (not yet designed in detail):**
1. PDF → per-page raster images (`pdf-lib` or `pdf.js` on the server; no such dependency installed yet).
2. Per-page item detection — a catalog page is usually a grid of N product photos with captions, not one photo. This needs the same multi-item detection/crop step as F-001c below; a PDF catalog is really "F-001c applied once per page," not a separate detection problem.
3. Optional OCR pass (e.g. Claude Vision can read printed text directly from a page crop — no separate OCR engine needed, reuse the existing Claude Vision call) for design number/price if printed.
4. Each cropped item → existing `tagProductImageUrl` for full attribute extraction, same draft-review UX as F-001.

**Explicitly not scoped yet:** page-layout variance across manufacturers (grids, single-column, mixed photo+text) makes a single generic parser unreliable — likely needs a "review detected items before import" screen rather than a fully blind auto-import, so a bad page-split doesn't silently create garbage products. Real design pass needed before implementation, not just a library swap.

---

#### F-001c: Multi-Item Detection & Splitting from a Single Photo
**Status:** Planned — not built. `packages/ai/src/tagger.ts` already has an `is_catalog_image` field in its extraction schema ("True if printed catalog/lookbook image") but nothing in the code branches on it today — one photo always produces exactly one `Product`, even when the photo shows several designs (e.g. a photographed catalog sheet, or several suit pieces laid out together in one frame).

**Problem:** A vendor who photographs a printed catalog *page* (several designs per page) or lays out several unpacked pieces in one shot, expecting each design to become its own catalog entry, instead gets one product with a wrong/blended set of AI tags — silently wrong, not an error the retailer would necessarily notice immediately.

**Description:** Detect that an uploaded photo contains multiple distinct garments, crop each one out, and run F-001's existing per-item tagging pipeline (`tagProductImageUrl`) on each crop separately, producing N `Product` drafts instead of one.

**How it would work (not yet designed in detail):**
1. Object detection to find N garment bounding boxes in one image. Two options, real tradeoff not yet evaluated: (a) a dedicated CV object-detection model (new dependency, new inference step, extra cost/latency), or (b) ask Claude Vision itself to return bounding boxes for each detected garment in one call (reuses the existing Claude Vision integration, no new model to host — worth trying first per the ladder: already-integrated dependency before a new one).
2. Crop each detected region, run existing `tagProductImageUrl` per crop.
3. Present all N drafts to the retailer for review/edit before saving — same reasoning as F-001b: don't blind-trust an automatic split, a bad detection (e.g. splitting one design's front+back into two products) is worse than asking the retailer to confirm.

**Relationship to F-001b:** this is the same underlying detection problem — a PDF catalog page IS a "photo with multiple items in it." Building this once, well, covers both F-001b's per-page splitting and the direct-photo case described above. **Build this before F-001b, not after** — F-001b is this feature applied to a rasterized PDF page rather than a camera photo.

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
**Priority:** P0  
**Description:** Collection links are live pages, not snapshots. Product status changes made by the retailer propagate automatically to every shared collection link.

**Important distinction:** The Kanchuki MVP does NOT use Meta's native WhatsApp Business catalog (the in-app product list under a business profile). "WhatsApp catalog" in this document means a **collection link** — a web page hosted by Kanchuki, shared as a URL inside a WhatsApp chat. Meta Cloud API catalog integration is a Phase 2 roadmap item (Month 13–14). Until then, collection links ARE the catalog, and they stay live-editable from product status.

**How sold item management works:**

1. **Single source of truth = product status in DB.** The Product model has `status`: `AVAILABLE / SOLD / RESERVED / NOT_SURE`. The shopkeeper opens the product in the retailer app (`product/[id].tsx`) and taps status → SOLD.
2. **Collection links reflect the change automatically.** The collection page (`apps/web/src/app/c/[slug]/page.tsx`) renders products from the DB. The same product can sit in many collection links — mark SOLD once, every shared link updates. No need to edit or resend links.
3. **Display rule — show a "Sold Out" badge, do not hide.** Hiding items makes a shared link look broken/empty to a customer who saw it earlier. A badge shows scarcity ("moves fast, enquire early"). A sold item must render as a greyed card with a "Sold Out" ribbon, and the enquiry button disabled. If the current `CollectionView` component does not yet do this, the change is small: the filter bar keeps the item, and the card renders the badge when `status === 'SOLD'`.
4. **ISR caching caveat.** Collection pages use Next.js SSG/ISR — a page may serve a cached version for the revalidation window. A status change appears after revalidation (typically ≤ 60s depending on config), not instantly. Acceptable for MVP.
5. **RESERVED status.** When a customer says "hold it for me", the shopkeeper marks the product RESERVED. The link shows a "Reserved" badge so other customers see it is pending.

**Out of scope for MVP:** Pushing updates into Meta's native WhatsApp Business catalog. That requires Meta Cloud API + catalog sync — Phase 2 (Month 13–14).

**Acceptance Criteria:**
- Marking a product SOLD updates all collection links containing it within the ISR revalidation window (≤ 60s)
- Sold products remain visible in collection links with a greyed card + "Sold Out" ribbon; enquiry disabled
- Reserved products show a "Reserved" badge
- No manual link editing or resending required after a status change

---

#### F-007: Retailer Onboarding & Setup
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

#### F-008: Basic Analytics Dashboard
**Priority:** P1 (should have for MVP)  
**Description:** Simple metrics for retailer.

**Metrics:**
- Total products in catalog
- Collection links sent this month
- Total views on collection links
- Total enquiries received
- Top 5 most-viewed products
- Top 5 most-enquired products

---

### Phase 1: Core AI Features (Month 5–8)

#### F-101: Fashion DNA — AI Customer Matching
**Description:** AI learns customer preferences from behavior (views, favorites, enquiries, purchases) and automatically suggests matching products.

**Requires:** 3–6 months of MVP behavior data from Phase 0.

**Matching signals:**
- Explicit preferences (captured in F-003)
- Products favorited from collection links
- Products enquired about
- Products purchased (if recorded)
- Products viewed ≥ 3 seconds (from link analytics)

---

#### F-102: AI Virtual Try-On (Self-Hosted)
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
**Description:** Recommend a size (S–10XL) to the customer by matching their `CustomerMeasurement` record (F-102b) against the retailer's own ready-garment size chart, distinct from and complementary to F-102 visual try-on.

**Input:** Retailer-uploaded size chart per garment type (e.g. Kurtas/Tops/Anarkalis/Dresses: bust/waist/hip by size; Pants/Palazzos/Skirts: waist/hip/length by size) — same shape as sample chart supplied for this feature.

**Logic:** Simple range lookup — customer bust/waist/hip → nearest matching chart row → recommended size, no AI/GPU cost.

**Explicitly NOT in scope:** Rendering the try-on visual at the customer's actual body proportions. CatVTON is image-conditioned only (no numeric measurement input) — feeding height/weight into it has no effect on output. A measurement-driven 3D render (SMPL/STAR body model + pose-conditioned diffusion, e.g. IDM-VTON/OOTDiffusion) could do this but is deferred — see `docs/adrs/ADR-006-defer-3d-parametric-vto.md`.

---

#### F-102b: Body Measurement Capture (feeds F-102 VTO fit)
**Description:** Two input paths, both write to same `CustomerMeasurement` record — VTO engine consumes either identically.

**Path A — Photo (front + back):**
- Customer/retailer captures front + back full-body photo (plain bg, arms slightly out)
- Customer enters height (required — sole scale reference; no absolute scale from pixels alone)
- MediaPipe Pose extracts body landmarks from both photos
- Pipeline computes: bust, waist, hip width (front), corrected via back photo for shoulder/back-curve accuracy
- Circumference derived from width via regression correction factor (body cross-section ≠ ellipse)
- Original photos deleted immediately after landmark extraction (privacy — see SECURITY.md ephemeral photo rule)

**Path B — Manual (inch-tape):**
- Direct form entry: Height, Bust, Waist, Hip (upper body/kurta-suit fit)
- Pant/Salwar: Waist, Hip, Length (inseam)
- No CV involved — most accurate, zero AI cost, **default/primary path for MVP-adjacent rollout**

**Acceptance Criteria:**
- Manual path always available regardless of photo path status (fallback + primary for accuracy-sensitive cases)
- Photo path accuracy: ±3–5cm typical (2D single-angle limitation — disclose to retailer/customer as estimate, not exact)
- Selecting a clothing item for try-on automatically pulls customer's latest measurement record (either source) to scale the VTO overlay
- Measurement photos never retained past landmark extraction (same ephemeral rule as VTO customer photos)

**Note:** Photo-path CV (MediaPipe Pose) runs locally/on-server — no per-call API cost, so it does not affect try-on credit budget (₹5–15/image) unlike FASHN/Replicate VTO calls.

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
**Description:** Retailer sends product via WhatsApp. Customer replies with their photo. AI generates try-on. Retailer sends back result.

---

#### F-104: Auto-Personalized Collection Building
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

### Billing Rules
- Payment via Razorpay (UPI, cards, netbanking)
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

## 10. Out of Scope (MVP)

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
