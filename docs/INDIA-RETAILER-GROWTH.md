# Kanchuki — India Retailer Growth & Profitability Roadmap

**Status:** ✅ **Backend + full mobile UI BUILT 2026-08-17** (all growth modules ship under `/v1/growth/*`, gated behind the `GROWTH_ENGINE` plan feature; every roadmap module below has a live retailer screen in the mobile app). **M, N, R, S completed 2026-08-17** (BUILD-LOG §47). **E (AI Campaign Assistant) completed 2026-08-18** (BUILD-LOG §48). **Migrations:** 055–058 + 060–063 **applied and verified** (growth tables/enum/plan-rows live; Phase II catalog tables + WHATSAPP_CATALOG_SYNC feature live; `customers.usual_size` column live; `retailers.preferred_locale` column live). **P (WhatsApp native catalog) completed 2026-08-18** (BUILD-LOG §49, Phase II — catalog sync engine, API, webhook, admin monitor, mobile UI). **R seasonal analytics (wedding-season vs daily-wear) completed 2026-08-18** (BUILD-LOG §51). **S auto-built variant collection links completed 2026-08-18** (BUILD-LOG §49 — HIDDEN collection status + variant sync on campaign create/edit + variant links in send response). **i18n data groundwork completed 2026-08-18** (BUILD-LOG §50 — preferred_locale + SUPPORTED_LOCALES). **Not built:** Instagram Business publishing; future work: M native mic + UI language toggle. See `docs/BUILD-LOG.md` §44–51. Full remaining-work task list: `docs/20-August-changes.md`.  
**Date:** August 2026  
**Scope:** India-only small retailers  
**Prerequisite:** Phase 0 live + F-031 social publishing shipped  

---

## Status at a Glance (2026-08-17)

| Letter | Feature | Status |
|---|---|---|
| A | Kanchuki Store Directory | ✅ Built (pre-existing `/stores`, city filter + search + admin featured pins) |
| B | QR Code Lead Capture | ✅ Built (`customers.source` + `QR_SCAN` stamp on public contact gate) |
| C | Referral Program Engine | ✅ Built (backend + mobile UI) |
| D | Festival Campaign Automation | ✅ Built (admin calendar + campaign CRUD/send + mobile UI) |
| E | AI Campaign Assistant | ✅ Built (NLP intent → audience/product filters → WhatsApp message template + save-to-campaign) |
| F | Smart Promotion / Discount Engine | ✅ Built (backend + mobile UI) |
| G | Customer Reactivation Campaigns | ✅ Built (backend + mobile UI) |
| I | GST-Ready Invoicing | ✅ Built — PDF generation + HSN mapping (see `PRO-REQUIREMENTS.md §F-304`) |
| J | Intelligence + Reorder Alerts | ✅ Built (signal-based alerts + mobile UI) |
| K | Supplier Management | ✅ Built (backend + mobile UI) |
| L | Showroom / Try-On Room Booking | ✅ Built (backend + mobile UI + public self-service booking) |
| M | Multi-Language AI | ✅ Built — descriptions + campaign/WhatsApp messages in 7 languages (placeholders preserved) + AI-search screen (Hindi/Hinglish, voice via keyboard dictation). Native in-app mic + PWA/retailer UI language toggle: future work |
| N | Indian Size & Fit System | ✅ Built — usual-size quick capture, per-customer size recommendation (usual → purchase history → size chart), plus sizes XS + 4XL–8XL, unstitched/blouse flags. Migration 058 applied. |
| P | WhatsApp Native Catalog Sync | ✅ Built (Phase II: DB schema + sync engine + API + webhook + admin monitor + retailer mobile UI — see `docs/tasks/PHASE-II-WHATSAPP-CATALOG-BREAKDOWN.md`) |
| Q | Video Product Support | ✅ Built (backend + mobile UI) |
| R | Campaign Analytics by Region / Festival | ✅ Built — campaign analytics screen: festival, customer segment, hour-of-day opens, category, video-vs-photo, A/B results, seasonal (wedding vs daily-wear) comparison (BUILD-LOG §51). |
| S | A/B Testing for Collections | ✅ Built — per-variant product sets (collection A/B) + send stagger + variant stats + two-proportion z-test significance + auto-built variant collection links with HIDDEN status (BUILD-LOG §49). |

> **Removed from scope 2026-08-17:** H — Daily Khata (P&L) and O — Udhar credit — no khata, no udhar.

---

## 1. Current State: What Already Exists

| Capability | Status | Notes |
|---|---|---|
| AI photo auto-tagging | ✅ Built | Category, color, fabric, style, occasion |
| Product catalog + rack/shelf location | ✅ Built | Offline-capable, barcode/QR scan-to-sell |
| Customer CRM + preference capture | ✅ Built | Basic fields + tags |
| WhatsApp collection link sharing | ✅ Built | Manual share, customer PWA |
| In-store AI search | ✅ Built | Hindi/Hinglish transliteration |
| Social media publishing | ✅ Built | **Facebook Page** only (F-031). Instagram Business: Planned (Sprint Block E). |
| Analytics dashboard | ✅ Built | Views, enquiries, top products |
| Team management + territory routing | ✅ Built | Staff mode, support tickets |
| Admin controls | ✅ Built | Plan limits, suspension, deletion vault, commission tracker |
| Fashion DNA + AI matching | 🕐 Planned | Phase 1 — not yet live |

---

## 2. Profitability Gaps: What's Missing

The current app is an **operations efficiency tool**. It saves time and enables remote selling, but it does **not**:
1. Bring **new customers** to the retailer
2. Automate **marketing** at scale
3. Manage the **full financial life** of the shop
4. Adapt deeply to **Indian retail culture and language**

These four gaps are where the next wave of features must land.

---

## 3. Feature Roadmap: India Retailer Growth Engine

> **Removed from scope 2026-08-17:** **H — Daily Khata (P&L)** and **O — Udhar credit** — no khata, no udhar. Sections deleted below; feature letters for the remaining items are unchanged.

#### A. Kanchuki Store Directory (Free Discovery) — ✅ Built (pre-existing: `/stores` live, city filter + search + admin featured pins)

**What:** A public `kanchuki.app/stores` page listing all active retailers, filterable by city, category, and style. Each store card shows verified products, ratings, and a "Browse Collection" CTA.

**Flow:**
1. Retailer completes onboarding → store auto-listed
2. Customer browses `/stores` → filters by location/type
3. Customer opens store → browses catalog → enquires via WhatsApp
4. Retailer gets "new customer" notification

**Why it matters:** 60–70% of small clothing store customers are walk-ins who discovered the shop via word-of-mouth or location. A trust-marked directory with real product photos turns every retailer into a discoverable destination.

**Effort:** Medium. Reuses existing retailer/public product APIs. Needs moderation + spam prevention.

---

#### B. QR Code Lead Capture (In-Store + On Delivery) — ✅ Built (QR generation pre-existing; lead source tracking `customers.source` + `QR_SCAN` stamp on the public contact gate)

**What:** Auto-generated QR codes for every retailer that link directly to their storefront. Physical + digital placement drives anonymous visitor → CRM lead conversion.

**Placements:**
- Store counter, mirrors, racks → "Scan to browse full collection"
- Delivery bags/packets → "Scan for next purchase — 10% off"
- Visiting cards, local flyers → instant WhatsApp catalogue

**Flow:**
1. Customer scans QR → opens `kanchuki.app/{store}` on mobile
2. If first visit → capture phone via WhatsApp OTP or "save contact" prompt
3. Auto-added to retailer CRM with source = `qr_scan`
4. Retailer sees new lead in dashboard

**Why it matters:** Every non-customer who walks in or receives a delivery is a potential CRM lead. Zero extra effort from retailer.

**Effort:** Low. QR generation exists (`store-urls.ts`). Needs lead-capture consent flow + source tracking.

---

#### C. Referral Program Engine — ✅ Built (backend + mobile UI: settings, KAN-XXXXXX codes, credit ledger, public landing/signup)

**What:** Built-in referral system where existing customers share a unique link → friend makes first purchase → both receive a discount credit.

**Flow:**
1. Retailer enables referrals in settings → sets reward (e.g., "₹200 off for both")
2. Customer opens collection → taps "Refer friend" → generates unique referral link
3. Friend opens link → browses → makes first purchase
4. System credits both accounts
5. Retailer sees referral performance in dashboard

**Why it matters:** Indian shopping is deeply social and trust-based. A referral from a family member converts at 3–5x the rate of cold outreach.

**Effort:** Medium. Needs referral code model, credit ledger, first-purchase detection.

---

### 3.2 Marketing Strategy Features

#### D. Festival Campaign Automation (India-First) — ✅ Built (admin-managed festival calendar + campaign CRUD/preview/send + mobile UI)

**What:** Pre-built, culturally accurate campaign templates for every major Indian festival, with region-specific product recommendations.

**Pre-seeded festivals:**
- Pan-India: Diwali, Navratri, Karwa Chauth, Raksha Bandhan, wedding season
- Regional: Onam (Kerala), Pongal (Tamil Nadu), Durga Puja (Bengal), Baisakhi (Punjab), Gudi Padwa (Maharashtra)
- Global Indian: Eid (for Gulf customers), Christmas party season

**Flow:**
1. Admin/future: AI assistant suggests "Create Diwali collection for customers who like silk sarees under ₹5000"
2. System auto-creates personalized collections per customer segment
3. Auto-schedules WhatsApp sends at optimal times
4. Retailer reviews → approves → blast

**Why it matters:** Festival shopping drives 40–50% of annual ethnic wear revenue. Automated, personalized festival campaigns turn a 3-hour manual task into a 10-minute approval.

**Effort:** Medium. Needs festival calendar model + campaign scheduler + AI-assisted collection builder.

---

#### E. AI Campaign Assistant — ✅ Built (NLP intent → audience/product filters → WhatsApp message template + save-to-campaign)

**What:** Natural language campaign creation. Retailer types or speaks a command → AI generates the customer segment, product selection, WhatsApp message draft, and send schedule.

**Example commands:**
- "Send cotton new arrivals to customers who like office wear"
- "Create Diwali collection for premium customers"
- "Find customers who haven't purchased in 6 months and send them a comeback offer"
- "Show me customers who bought pink suits last month — send them matching dupattas"

**Why it matters:** Most small retailers don't have the time or skill to segment customers manually. AI-powered campaign creation makes personalized marketing accessible to non-technical shopkeepers.

**Effort:** High. Built on top of existing customer preference fields (Fashion DNA signals: `preferred_colors`, `preferred_styles`, `preferred_fabrics`, `preferred_budget_paise`) + existing campaign infrastructure.

**Implementation:**
- Backend: `POST /v1/growth/ai-campaign` parses natural language into structured intent (campaign type, audience filters, product criteria, message tone) via Claude, queries matching products, generates a WhatsApp message template, and resolves audience count.
- Mobile: `ai-campaign.tsx` screen with prompt input, example chips, editable draft preview (name, type, message, matched products, audience count), and save-to-campaign flow.
- Fashion DNA usage: matches against explicit customer preference fields stored on the `Customer` model. The standalone `computeFashionDNA()` vector helper exists but is not yet wired to a background job; matching is rule-based on explicit preferences for now.

---

#### F. Smart Promotion / Discount Engine — ✅ Built (backend + mobile UI: PERCENT/FIXED codes, min order, product-restricted, dates)

**What:** Automated suggestions for markdowns and promotions based on inventory age and demand signals.

**Rules:**
- "These 12 items haven't been viewed in 30 days → create a limited-time offer"
- "High stock + low velocity: create a combo discount to move inventory"
- "Customer abandoned cart/favorites → send 5% discount code"

**Why it matters:** Dead stock is the #1 profit killer for small clothing retailers. Automated promotions clear inventory before it becomes a loss.

**Effort:** Medium. Needs inventory age tracking + promotion code system + automation rules.

---

#### G. Customer Reactivation Campaigns — ✅ Built (backend + mobile UI: inactive-customer suggestions + one-tap REACTIVATION campaign)

**What:** Automated identification of inactive customers + one-tap reactivation campaign.

**Rules:**
- "These 8 customers haven't enquired in 60 days → send them your top 5 new arrivals"
- "Customer hasn't opened a collection in 30 days → send a 'we miss you' message with a bestseller"

**Why it matters:** Reactivating an old customer costs 5–10x less than acquiring a new one. Most retailers simply forget about inactive customers.

**Effort:** Low-medium. Reuses existing analytics + campaign send infrastructure.

---

### 3.3 Shop Organization Features

#### I. GST-Ready Invoicing — ✅ Built (PDF generation + HSN mapping, see `PRO-REQUIREMENTS.md §F-304`)

**What:** Auto-generate GST-compliant invoices for every order, with HSN codes for apparel, CGST/SGST/IGST split, and invoice numbering.

**Flow:**
1. Order confirmed → system generates invoice PDF
2. Retailer can print/email/WhatsApp to customer
3. GST ledger maintained for return filing

**Why it matters:** GST compliance is non-negotiable for Indian retail. Most small retailers use offline billing software disconnected from their catalog. An integrated invoice eliminates double-entry and audit risk.

**Effort:** Medium. Needs PDF generation + HSN code mapping + ledger.

---

#### J. Inventory Intelligence + Reorder Alerts — ✅ Built (signal-based alerts: dead stock / high velocity / top performer / unlisted + mobile UI)

**What:** Go beyond status tracking to predictive inventory management.

**Alerts:**
- "You sold 8 of these in 2 weeks, stock is low — reorder soon"
- "These 15 items haven't sold in 90 days — consider a bundle discount"
- "This design is your top performer this month — stock up"

**Why it matters:** Small retailers overstock slow movers and understock winners. Simple predictive alerts prevent both lost sales and dead stock.

**Effort:** Low-medium. Reuses existing product/order data + simple threshold rules.

---

#### K. Supplier Management — ✅ Built (backend + mobile UI: CRUD + ORDER/PAYMENT ledger + pending balance)

**What:** Track suppliers, purchase orders, payment history, and pending orders.

**Fields:**
- Supplier name, phone, city
- Products supplied
- Last order date + amount
- Pending payments
- Notes ("advance paid", "delivery every Tuesday")

**Why it matters:** Enables the future B2B supply network (Phase 2) and gives retailers a complete view of their shop's operations today.

**Effort:** Low. Basic CRUD + ledger.

---

#### L. Showroom / Try-On Room Booking — ✅ Built (backend + mobile UI + public self-service slot booking with conflict check)

**What:** In-app booking system for private shopping slots, bridal consultations, or group try-on sessions.

**Flow:**
1. Customer opens collection → taps "Book in-store try-on"
2. Selects date/time slot
3. Retailer approves/confirms
4. Both get reminders

**Why it matters:** High-value Indian customers (wedding buyers, bridal) often prefer scheduled private shopping. Reducing phone-tag for bookings improves experience and reduces no-shows.

**Effort:** Low. Calendar + notification system.

---

### 3.4 Localized Indian Features

#### M. Multi-Language AI (Hindi + Hinglish + Regional) — ✅ Built (Claude-generated product descriptions AND WhatsApp/campaign message translation in 7 languages, placeholders preserved; AI-search screen with Hindi/Hinglish search + voice via keyboard dictation). **Data groundwork landed** 2026-08-18: migration 063 (`retailers.preferred_locale`), shared `SUPPORTED_LOCALES` constant, API field. **Not built:** native in-app mic (needs dev build), PWA language toggle (no i18n infra), retailer app UI language toggle (no i18n infra)

**What:** AI-generated product descriptions, WhatsApp messages, and campaign templates in multiple languages.

**Phase 1 priorities:**
- Hindi + Hinglish (devanagari + romanized)
- Tamil, Telugu, Marathi, Gujarati, Bengali

**Features:**
- AI product description generation in selected language
- Voice search in Hinglish ("neela cotton suit dikhao")
- Customer-facing PWA in selected language
- Retailer app UI language toggle

**Why it matters:** 60%+ of Tier 2/3 retailers and their customers prefer regional language. English-only limits market reach.

**Effort:** Medium. Needs translation layer + voice input + UI strings.

---

#### N. Indian Size & Fit System — ✅ Built (`is_unstitched`/`includes_blouse` flags + `customers.usual_size` quick capture + per-customer recommendation: usual size → purchase history → F-102c size chart; `SIZE_OPTIONS` extended to XS + 4XL–8XL). **Not built:** customer-facing "usual size" self-capture on the PWA (customers have no login)

**What:** Standardized Indian sizing labels with chest/inch breakdown, unstitched vs. stitched flags, and blouse piece indicators for sarees.

**Features:**
- Size recommendation based on past purchase history
- "What's your usual size?" quick capture
- Blouse piece / unstitched / ready-to-wear flags on products
- Plus-size ranges (XS–8XL) properly labeled

**Why it matters:** Indian sizing is inconsistent and the #1 reason for returns in ethnic wear. A clear size system reduces returns and increases buyer confidence.

**Effort:** Low-medium. Needs size label system + recommendation logic.

---

#### P. WhatsApp Catalog Sync (Native) — ✅ Built (Phase II — full pipeline: DB schema + Meta Catalog API client + BullMQ sync engine + webhook + retailer mobile UI + admin monitor)

**What:** Push products directly to Meta's native WhatsApp Business catalog (the in-app product list under a business profile), not just web links.

**Flow:**
1. Retailer connects WhatsApp Business API
2. Products sync to native WhatsApp catalog
3. Customers browse retailer's full catalog inside WhatsApp itself
4. Price, availability, and status stay synced

**Why it matters:** WhatsApp's native catalog is where Indian customers already browse and buy. Having products inside WhatsApp (not just links to external pages) dramatically increases discovery and conversion.

**Effort:** Medium. Extends existing Meta integration to WhatsApp Catalog API.

**Implementation (Phase II, 2026-08-18):**
- DB: migration `060_whatsapp_catalog_sync` — `CatalogItem` (product ↔ Meta item mapping) + `CatalogSyncLog` (audit trail) + `Retailer.whatsapp_catalog_id`/`sync_enabled`/`sync_categories`/`last_synced_at` + `Product.whatsapp_catalog_item_id` + `WHATSAPP_CATALOG_SYNC` plan feature (Growth/Pro).
- Sync engine: `apps/api/src/jobs/catalog-sync.ts` — BullMQ queue, full + single-product syncs, status/availability mapping (AVAILABLE→in stock, SOLD→out of stock), interim HSN keyword map, chunked concurrency, retries. Auto-wired: product edit/status/delete enqueue incremental syncs; tag completion syncs newly created products; bulk-delete enqueues a full reconciliation (gated on `sync_enabled`, fail-open).
- Meta client: `apps/api/src/lib/meta-catalog.ts` — catalog get-or-create, item create/update/delete/list, image upload.
- Webhook: `apps/api/src/routes/webhooks/whatsapp-catalog.ts` at `/v1/public/webhooks/whatsapp-catalog` — GET handshake (verify token) + HMAC-SHA256 signature over `META_APP_SECRET`; `catalog_item_added`/`updated`/`deleted`/`out_of_stock` events sync price/availability back and are audited to `CatalogSyncLog`.
- Retailer UI: `apps/mobile/app/settings/whatsapp-catalog.tsx` — toggle, category picker, Sync Now, status card, logs with pull-to-refresh + per-product synced/pending/error badges in the catalog tab.
- Admin monitor: `apps/web/src/app/admin/whatsapp-catalog/` — health cards, per-retailer table, drill-down logs/items, manual sync trigger.
- Docs: `docs/tasks/PHASE-II-WHATSAPP-CATALOG-BREAKDOWN.md` (63/63 tasks) + `docs/DEPLOY.md` webhook setup section.

---

#### Q. Video Product Support — ✅ Built (backend: presigned R2 upload + register/list/delete + public exposure; mobile UI with gallery picker)

**What:** Allow retailers to attach 5–10 second product videos in addition to photos.

**Features:**
- Video capture in retailer app (camera or gallery)
- Auto-compress to <10MB
- Video plays in collection links + social posts
- "Video coming soon" placeholder for products without video

**Why it matters:** Indian retailers already send product videos on WhatsApp manually. Video converts 2–3x better than static photos for ethnic wear (fabric drape, movement, fit).

**Effort:** Low. Storage + playback. Already partially scoped in F-032 (AI Studio Shoots) but basic video upload is simpler and sooner.

---

### 3.5 Campaign & Analytics Enhancements

#### R. Campaign Analytics by Region / Festival — ✅ Built (analytics screen: sends/opens by festival + type, customer segments, hour-of-day, product category, video-vs-photo, per-A/B-variant; **seasonal comparison** 2026-08-18: wedding-season vs daily-wear category performance with delta %, BUILD-LOG §51). **Not built:** seasonal deep-dive dashboards (beyond category-level comparison)

**What:** Extend existing analytics with dimensions that matter for Indian retail.

**Metrics:**
- Festival campaign performance (views, enquiries, orders per festival)
- Best-performing categories during wedding season vs. daily wear
- Customer segment performance (VIP vs. budget vs. inactive)
- WhatsApp message open rate by time of day
- Product photo vs. video performance

**Why it matters:** Retailers need to know what works so they can invest marketing effort in the right products and festivals.

**Effort:** Low. Dashboard views on existing data.

---

#### S. A/B Testing for Collections — ✅ Built (two-variant split with per-variant product sets, send stagger, per-variant sent/opened stats and a two-proportion z-test winner callout). **Not built:** auto-generated per-variant collection links (needs a hidden-collection status so A/B links don't hijack the ACTIVE storefront)

**What:** Test two product orderings, two message templates, or two send times → see which performs better.

**Use case:** "Send collection A to 50% of customers, collection B to 50% → which gets more opens?"

**Why it matters:** Small optimizations in messaging and timing compound into significantly higher conversion over time.

**Effort:** Medium. Needs split infrastructure + statistical significance calculation.

---

## 4. Recommended Build Sequence

### Sprint Block A — Quick Wins (4 weeks)

| Feature | Effort | Impact | Priority | Status |
|---|---|---|---|---|
| QR Code Lead Capture | Low | High | **P0** | ✅ Built |
| Customer Reactivation Campaigns | Low-Medium | High | **P0** | ✅ Built |
| Video Product Support | Low | Medium | **P1** | ✅ Built |
| Campaign Analytics by Festival | Low | Medium | **P1** | ✅ Built (analytics screen) |
| Inventory Intelligence Alerts | Low-Medium | Medium | **P1** | ✅ Built |

### Sprint Block B — Customer Acquisition (6 weeks)

| Feature | Effort | Impact | Priority | Status |
|---|---|---|---|---|
| Kanchuki Store Directory | Medium | High | **P0** | ✅ Built (pre-existing) |
| Referral Program Engine | Medium | High | **P1** | ✅ Built |
| Festival Campaign Templates | Medium | High | **P0** | ✅ Built (admin calendar + campaigns) |
| Smart Promotion Engine | Medium | Medium | **P1** | ✅ Built |

### Sprint Block C — Shop Management (6 weeks)

| Feature | Effort | Impact | Priority | Status |
|---|---|---|---|---|
| GST-Ready Invoicing | Medium | High | **P1** | ✅ Built (PDF + HSN mapping) |
| Supplier Management | Low | Medium | **P2** | ✅ Built |
| Showroom Booking | Low | Low | **P2** | ✅ Built |

### Sprint Block D — Localization & Scale (6 weeks)

| Feature | Effort | Impact | Priority | Status |
|---|---|---|---|---|
| Multi-Language AI (Hindi + 3 regional) | Medium | High | **P0** | ✅ Built (descriptions + campaign messages + AI search) |
| Indian Size & Fit System | Low-Medium | Medium | **P1** | ✅ Built (usual size + recommendation + plus sizes) |
| WhatsApp Native Catalog Sync | Medium | High | **P1** | ✅ Built (Phase II — `docs/tasks/PHASE-II-WHATSAPP-CATALOG-BREAKDOWN.md`) |

### Sprint Block E — Advanced (Post-Phase 1)

| Feature | Effort | Impact | Priority | Status |
|---|---|---|---|---|
| AI Campaign Assistant | High | High | **P1** | ✅ Built (NLP intent → WhatsApp message template + save-to-campaign) |
| Instagram Business Publishing | Medium | Medium | **P1** | 🔴 Not built (F-031 = Facebook only) — see `docs/20-August-changes.md` item 7 |
| A/B Testing | Medium | Medium | **P2** | ✅ Built (collection sets + stagger + significance) |

---

## 5. Success Metrics

| Metric | Baseline (Current) | Target (6 months) |
|---|---|---|
| Monthly active retailers | 50 | 200 |
| Products uploaded per retailer | 50 | 150 |
| Collection links sent per retailer/month | 10 | 30 |
| Collection open rate | 40% | 55% |
| Enquiry-to-order conversion | 15% | 25% |
| New customers acquired per retailer/month | ~2 | 10+ |
| Retention (60 days) | 60% | 80% |
| Retailer NPS | — | ≥50 |

---

## 6. Competitive Advantage: Why This Moat Is Hard to Copy

| Dimension | Kanchuki | Generic Catalog Tool | Generic CRM | Social Media Tool |
|---|---|---|---|---|
| AI auto-tagging for Indian fashion | ✅ | ❌ | ❌ | ❌ |
| WhatsApp-native commerce | ✅ | ❌ | Partial | ❠ |
| Fashion DNA + AI matching | 🕐 | ❌ | ❌ | ❠ |
| Virtual try-on for ethnic wear | ❌ | ❌ | ❠ | ❠ |
| Festival/region-aware campaigns | ✅ | ❠ | ❠ | ❠ |
| Indian language support | Partial | ❠ | ❠ | ❠ |
| QR lead capture + store directory | ✅ | ❠ | ❠ | ❠ |
| Shop management (GST, supplier) | ❠ | ❠ | ❠ | ❠ |

**The moat:** The combination of **catalog digitization + AI fashion intelligence + WhatsApp commerce + Indian retail operations** in one mobile-first tool. No single competitor covers all four. Building them separately is what retailers currently do — and why they're underserved.

---

## 7. Out of Scope (This Roadmap)

- International expansion (separate roadmap: `docs/INTERNATIONAL-EXPANSION.md`)
- Full B2B wholesaler/manufacturer network (Phase 2)
- Multi-store retailer management (Phase 3)
- Advanced AI demand forecasting (Phase 3)
- Custom AI model training for individual retailers

---

## 8. Upcoming Marketing Enablement Features (via Kanchuki Platform)

Beyond the mobile app growth engine, the Kanchuki platform is developing a suite of marketing and sales enablement features to help retailers increase sales and manage their social media presence directly from the platform. Work has begun on Phase 1 quick wins (Smart Incentive Engine, Local Discovery Engine, GMB Integration, AI-Driven Social Media Templates). These features are designed to reduce manual workload, improve campaign effectiveness, and expand market reach.

### Key Platform Features in Development:

1. **Local Discovery Engine**  
   - Geo-tagged product listings for Google My Business optimization  
   - "Near me" search optimization to drive foot traffic  
   - Location-based offer rules (e.g., show Diwali offers only to users within 10km)  
   *Impact: +15% footfall from local searches; +10% sales from geo-targeted offers*

2. **Smart Incentive Engine**  
   - First-time visitor discount auto-applied at checkout  
   - Birthday/anniversary offer triggers  
   - Loyalty tier progression based on spend/visit frequency  
   *Impact: 35% increase in first-time visitor conversion; 50% higher repeat visit rate*

3. **Partner Network Manager**  
   - Track referral codes for local salons/tailors  
   - Automated commission payouts  
   - Co-hosted event invitations (e.g., "Styling Sunday" with beauty parlor)  
   *Impact: 25% reduction in CAC via referrals; 40% higher LTV from partner-referred customers*

4. **AI-Driven Social Media Templates**  
   - Generate Instagram post/reel templates from product images  
   - WhatsApp catalog/status templates with festive overlays  
   - Text suggestions based on regional trends & occasion  
   *Impact: 50% reduction in content creation time; 2x engagement rate on templated posts*

5. **Automated Festival Background Library**  
   - Pre-generated backgrounds for Diwali, weddings, regional festivals  
   - One-click apply to product images  
   - Seasonal auto-rotation (e.g., swap to wedding backgrounds Oct-Mar)  
   *Impact: 70% faster seasonal campaign launch; 3x more festive-themed posts*

6. **Automated Lookbook Generator**  
   - Input: 3-5 product IDs → Output: Coordinated lookbook (images/video) with styling notes  
   - Export formats: Instagram carousel, WhatsApp status, PDF  
   *Impact: 25% increase in average order value (AOV); 40% higher add-to-cart rate for bundled looks*

7. **Direct Social Publishing**  
   - Schedule Instagram Reels (via Meta Graph API)  
   - Broadcast WhatsApp Catalog updates  
   - Analytics: views, shares, click-throughs  
   *Impact: 60% faster campaign execution; 80% adherence to posting schedule*

8. **Hyperlocal & Ad Management Integration**  
   - **Google My Business**: Auto-post new arrivals/offers, review monitoring & response templates  
   - **Facebook Local Awareness Ads**: Radius-based ad campaigns, A/B test creative, budget pacing alerts  
   - **Google Local Service Ads**: Service-based ad management (e.g., "alteration services near me"), lead tracking  
   *Impact: GMB → 40% increase in direction requests; FB Ads → 30% lower CPL vs. broad targeting*

9. **Aggregator & Marketplace Sync Architecture**  
   - Unified product catalog with real-time inventory sync (Meesho, Glroad, Craftsvilla, Instamojo)  
   - Order aggregation and fee/revenue reconciliation per channel  
   *Impact: 50% reduction in manual inventory updates; 99.8% inventory accuracy; 15-20% sales increase from multi-channel presence*

### Implementation Phases:

**Phase 1 (Quick Wins - 4-6 weeks):**  
Smart Incentive Engine, Local Discovery Engine, GMB Integration, AI-Driven Social Media Templates  

**Phase 2 (Core Enablement - 8-10 weeks):**  
Direct Social Publishing, Automated Festival Background Library, Partner Network Manager, Aggregator Sync (Meesho + Instamojo first) ✅  

**Phase 3 (Advanced Features - 12+ weeks):**
Automated Lookbook Generator ✅, Facebook Local Awareness Ads ✅, Google Local Service Ads ✅, Full Aggregator Sync (Glroad/Craftsvilla) ✅

### Overall Platform Impact:
- **Time Savings:** 10-15 hrs/week per retailer on manual marketing/inventory tasks  
- **Sales Growth:** 20-35% increase in monthly revenue within 3 months of adoption  
- **Customer Retention:** 40% improvement in repeat purchase rate via personalized incentives  
- **Market Reach:** 3x expansion in digital touchpoints (social + marketplaces + local search)  

All features maintain the "new row preserves old" data pattern and prioritize retailer self-service with admin oversight controls.