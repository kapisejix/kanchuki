# Kanchuki — India Retailer Growth & Profitability Roadmap

**Status:** Proposed enhancement  
**Date:** August 2026  
**Scope:** India-only small retailers  
**Prerequisite:** Phase 0 live + F-031 social publishing shipped  

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

### 3.1 Customer Acquisition Features

#### A. Kanchuki Store Directory (Free Discovery)

**What:** A public `kanchuki.app/stores` page listing all active retailers, filterable by city, category, and style. Each store card shows verified products, ratings, and a "Browse Collection" CTA.

**Flow:**
1. Retailer completes onboarding → store auto-listed
2. Customer browses `/stores` → filters by location/type
3. Customer opens store → browses catalog → enquires via WhatsApp
4. Retailer gets "new customer" notification

**Why it matters:** 60–70% of small clothing store customers are walk-ins who discovered the shop via word-of-mouth or location. A trust-marked directory with real product photos turns every retailer into a discoverable destination.

**Effort:** Medium. Reuses existing retailer/public product APIs. Needs moderation + spam prevention.

---

#### B. QR Code Lead Capture (In-Store + On Delivery)

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

#### C. Referral Program Engine

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

#### D. Festival Campaign Automation (India-First)

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

#### E. AI Campaign Assistant

**What:** Natural language campaign creation. Retailer types or speaks a command → AI generates the customer segment, product selection, WhatsApp message draft, and send schedule.

**Example commands:**
- "Send cotton new arrivals to customers who like office wear"
- "Create Diwali collection for premium customers"
- "Find customers who haven't purchased in 6 months and send them a comeback offer"
- "Show me customers who bought pink suits last month — send them matching dupattas"

**Why it matters:** Most small retailers don't have the time or skill to segment customers manually. AI-powered campaign creation makes personalized marketing accessible to non-technical shopkeepers.

**Effort:** High. Needs Fashion DNA live first (Phase 1), then campaign-generation AI layer.

---

#### F. Smart Promotion / Discount Engine

**What:** Automated suggestions for markdowns and promotions based on inventory age and demand signals.

**Rules:**
- "These 12 items haven't been viewed in 30 days → create a limited-time offer"
- "High stock + low velocity: create a combo discount to move inventory"
- "Customer abandoned cart/favorites → send 5% discount code"

**Why it matters:** Dead stock is the #1 profit killer for small clothing retailers. Automated promotions clear inventory before it becomes a loss.

**Effort:** Medium. Needs inventory age tracking + promotion code system + automation rules.

---

#### G. Customer Reactivation Campaigns

**What:** Automated identification of inactive customers + one-tap reactivation campaign.

**Rules:**
- "These 8 customers haven't enquired in 60 days → send them your top 5 new arrivals"
- "Customer hasn't opened a collection in 30 days → send a 'we miss you' message with a bestseller"

**Why it matters:** Reactivating an old customer costs 5–10x less than acquiring a new one. Most retailers simply forget about inactive customers.

**Effort:** Low-medium. Reuses existing analytics + campaign send infrastructure.

---

### 3.3 Shop Organization Features

#### H. Daily Khata (Simple P&L + Ledger)

**What:** A dead-simple daily accounts entry optimized for Indian kirana-style bookkeeping.

**Fields per entry:**
- Date
- Sales (cash / UPI / WhatsApp pay)
- Purchases (stock buys)
- Expenses (rent, electricity, staff)
- Cash in hand

**Outputs:**
- Daily/weekly/monthly P&L
- Best-selling categories
- Profit per product (if cost price is entered)

**Why it matters:** 90%+ of small Indian clothing retailers track finances in notebooks or Excel. A mobile-first khata that integrates with their order data is a must-have operational tool.

**Effort:** Medium. Needs simple entry UI + reports. Can be basic v1: just sales + expenses, no double-entry.

---

#### I. GST-Ready Invoicing

**What:** Auto-generate GST-compliant invoices for every order, with HSN codes for apparel, CGST/SGST/IGST split, and invoice numbering.

**Flow:**
1. Order confirmed → system generates invoice PDF
2. Retailer can print/email/WhatsApp to customer
3. GST ledger maintained for return filing

**Why it matters:** GST compliance is non-negotiable for Indian retail. Most small retailers use offline billing software disconnected from their catalog. An integrated invoice eliminates double-entry and audit risk.

**Effort:** Medium. Needs PDF generation + HSN code mapping + ledger.

---

#### J. Inventory Intelligence + Reorder Alerts

**What:** Go beyond status tracking to predictive inventory management.

**Alerts:**
- "You sold 8 of these in 2 weeks, stock is low — reorder soon"
- "These 15 items haven't sold in 90 days — consider a bundle discount"
- "This design is your top performer this month — stock up"

**Why it matters:** Small retailers overstock slow movers and understock winners. Simple predictive alerts prevent both lost sales and dead stock.

**Effort:** Low-medium. Reuses existing product/order data + simple threshold rules.

---

#### K. Supplier Management

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

#### L. Showroom / Try-On Room Booking

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

#### M. Multi-Language AI (Hindi + Hinglish + Regional)

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

#### N. Indian Size & Fit System

**What:** Standardized Indian sizing labels with chest/inch breakdown, unstitched vs. stitched flags, and blouse piece indicators for sarees.

**Features:**
- Size recommendation based on past purchase history
- "What's your usual size?" quick capture
- Blouse piece / unstitched / ready-to-wear flags on products
- Plus-size ranges (XS–8XL) properly labeled

**Why it matters:** Indian sizing is inconsistent and the #1 reason for returns in ethnic wear. A clear size system reduces returns and increases buyer confidence.

**Effort:** Low-medium. Needs size label system + recommendation logic.

---

#### O. Indian Payment + Credit (Udhar)

**What:** Expand beyond UPI to match how Indian small shops actually transact.

**Features:**
- UPI QR (current)
- Cash-on-delivery flag
- Paytm / PhonePe integration
- Retailer-issued credit (udhar) tracking — "Rahul's balance: ₹2,400 pending"
- Payment reminder automation via WhatsApp

**Why it matters:** COD + udhar are 40–60% of small-store transactions. Not supporting these means losing the majority of potential sales.

**Effort:** Medium. Needs ledger for udhar + COD tracking + payment reminder automation.

---

#### P. WhatsApp Catalog Sync (Native)

**What:** Push products directly to Meta's native WhatsApp Business catalog (the in-app product list under a business profile), not just web links.

**Flow:**
1. Retailer connects WhatsApp Business API
2. Products sync to native WhatsApp catalog
3. Customers browse retailer's full catalog inside WhatsApp itself
4. Price, availability, and status stay synced

**Why it matters:** WhatsApp's native catalog is where Indian customers already browse and buy. Having products inside WhatsApp (not just links to external pages) dramatically increases discovery and conversion.

**Effort:** Medium. Extends existing Meta integration to WhatsApp Catalog API.

---

#### Q. Video Product Support

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

#### R. Campaign Analytics by Region / Festival

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

#### S. A/B Testing for Collections

**What:** Test two product orderings, two message templates, or two send times → see which performs better.

**Use case:** "Send collection A to 50% of customers, collection B to 50% → which gets more opens?"

**Why it matters:** Small optimizations in messaging and timing compound into significantly higher conversion over time.

**Effort:** Medium. Needs split infrastructure + statistical significance calculation.

---

## 4. Recommended Build Sequence

### Sprint Block A — Quick Wins (4 weeks)

| Feature | Effort | Impact | Priority |
|---|---|---|---|
| QR Code Lead Capture | Low | High | **P0** |
| Customer Reactivation Campaigns | Low-Medium | High | **P0** |
| Video Product Support | Low | Medium | **P1** |
| Campaign Analytics by Festival | Low | Medium | **P1** |
| Inventory Intelligence Alerts | Low-Medium | Medium | **P1** |

### Sprint Block B — Customer Acquisition (6 weeks)

| Feature | Effort | Impact | Priority |
|---|---|---|---|
| Kanchuki Store Directory | Medium | High | **P0** |
| Referral Program Engine | Medium | High | **P1** |
| Festival Campaign Templates | Medium | High | **P0** |
| Smart Promotion Engine | Medium | Medium | **P1** |

### Sprint Block C — Shop Management (6 weeks)

| Feature | Effort | Impact | Priority |
|---|---|---|---|
| Daily Khata (P&L) | Medium | High | **P0** |
| GST-Ready Invoicing | Medium | High | **P1** |
| Supplier Management | Low | Medium | **P2** |
| Showroom Booking | Low | Low | **P2** |

### Sprint Block D — Localization & Scale (6 weeks)

| Feature | Effort | Impact | Priority |
|---|---|---|---|
| Multi-Language AI (Hindi + 3 regional) | Medium | High | **P0** |
| Indian Size & Fit System | Low-Medium | Medium | **P1** |
| Indian Payment + Udhar | Medium | High | **P1** |
| WhatsApp Native Catalog Sync | Medium | High | **P1** |

### Sprint Block E — Advanced (Post-Phase 1)

| Feature | Effort | Impact | Priority |
|---|---|---|---|
| AI Campaign Assistant | High | High | **P1** |
| Instagram Business Publishing | Medium | Medium | **P1** |
| A/B Testing | Medium | Medium | **P2** |

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
| Retailer retention (60 days) | 60% | 80% |
| Retailer NPS | — | ≥50 |

---

## 6. Competitive Advantage: Why This Moat Is Hard to Copy

| Dimension | Kanchuki | Generic Catalog Tool | Generic CRM | Social Media Tool |
|---|---|---|---|---|
| AI auto-tagging for Indian fashion | ✅ | ❌ | ❌ | ❌ |
| WhatsApp-native commerce | ✅ | ❌ | Partial | ❌ |
| Fashion DNA + AI matching | 🕐 | ❌ | ❌ | ❌ |
| Virtual try-on for ethnic wear | ❌ | ❌ | ❌ | ❌ |
| Festival/region-aware campaigns | 🕐 | ❌ | ❌ | ❌ |
| Indian language support | Partial | ❌ | ❌ | ❌ |
| Indian payment (UPI + Udhar) | 🕐 | ❌ | ❌ | ❌ |
| QR lead capture + store directory | 🕐 | ❌ | ❌ | ❌ |
| Shop management (khata, GST, supplier) | ❌ | ❌ | ❌ | ❌ |

**The moat:** The combination of **catalog digitization + AI fashion intelligence + WhatsApp commerce + Indian retail operations** in one mobile-first tool. No single competitor covers all four. Building them separately is what retailers currently do — and why they're underserved.

---

## 7. Out of Scope (This Roadmap)

- International expansion (separate roadmap: `docs/INTERNATIONAL-EXPANSION.md`)
- Full B2B wholesaler/manufacturer network (Phase 2)
- Multi-store retailer management (Phase 3)
- Advanced AI demand forecasting (Phase 3)
- Custom AI model training for individual retailers
