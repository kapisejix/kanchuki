# Kanchuki — International WhatsApp Commerce Roadmap

**Status:** Proposed enhancement  
**Date:** August 2026  
**Owner:** Product + Engineering  
**Prerequisite:** Phase 3 (Full Commerce) live — WhatsApp Business API, payments, and admin controls stable  

---

## 1. Why International Now

The Indian diaspora is ~35 million, concentrated in:
- **US** (~5.4M), **UK** (~1.86M), **Canada** (~2.87M), **Australia** (~720K)
- **UAE** (~3.6M), **Saudi Arabia** (~2.6M), **Kuwait/Oman/Qatar/Bahrain** (~3.5M combined)
- **Singapore** (~600K), **South Africa** (~1.5M), **Mauritius** (~890K), **Trinidad & Tobago** (~470K)
- **New Zealand** (~300K), **Germany/Netherlands** (large fabric importers)

These communities already buy Indian ethnic wear. Kanchuki retailers are positioned to serve them — but today the retailer’s reach ends at their local customer base. WhatsApp is the universal bridge: the same app used in India is used by diaspora everywhere.

**The gap:** current WhatsApp is manual share-only. Retailers cannot run global campaigns, cannot auto-send collections to opted-in diaspora customers, cannot collect international payments or arrange cross-border shipping through the platform.

---

## 2. Current State Assessment

| Capability | Current Status | Gap for Global |
|---|---|---|
| Collection link generation | ✅ Built (`/c/{slug}`) | Works globally but no proactive send |
| WhatsApp share | ✅ Manual Web Share API | No API-driven broadcast |
| AI catalog tagging | ✅ Built | Needs region-aware labels |
| Customer Fashion DNA | 🕐 Planned (Phase 1) | Needs region profiles |
| Payments | ✅ Razorpay (UPI/cards) | Needs international methods |
| Shipping | ❌ Manual notes | Needs zone calculation |
| Language | ❌ English only | Needs Hindi/Arabic minimum |
| Compliance | ❌ India-only | Needs GDPR/TCPA/regional |

---

## 3. Roadmap Overview

```
Phase 4A: WhatsApp Global API Foundation    Month 1–2
Phase 4B: International Catalog             Month 2–3
Phase 4C: Smart Global Campaigns            Month 3–4
Phase 4D: Payments, Shipping & Scale        Month 4–5
```

---

## 4. Phase 4A: WhatsApp Global API Foundation

**Goal:** Move from manual share to Meta WhatsApp Business API with international reach.  
**Duration:** 4–6 weeks

### 4.1 Meta WhatsApp Business API — Global Send

- Enable Meta Cloud API for international destinations (already planned for Phase 3 India; extend to global rate cards).
- Admin panel: WhatsApp Business Manager onboarding wizard — connect Meta Business Portfolio, verify business, link phone number.
- Per-destination cost tracking: track ₹ spent per country (Meta rates differ: India ~₹0.06–0.38/conversation; US ~₹4–8; UK/EU ~₹3–6; UAE ~₹1–2).
- Conversation hierarchy:
  - **Marketing** — broadcast campaigns (new arrivals, festivals)
  - **Utility** — order confirmations, shipping updates, payment links
  - **Service** — customer replies within 24h window

### 4.2 International Phone Number Handling

- Retailer customer list: store `phone_e164` + `phone_country` + `phone_region`.
- Validation: validate at entry using `libphonenumber` (already a transitive dep via shared utils or add directly).
- WhatsApp format: always normalize to E.164 before sending via API.
- Country-aware defaults: default language, currency, shipping zone based on phone prefix.

### 4.3 Message Templates — Multi-Language

- Admin-managed template library (already needed for India; expand).
- Minimum templates for Phase 4A:
  - English (global default)
  - Hindi (for diaspora who prefer Devanagari or Hinglish)
  - Arabic (for UAE/Saudi/Kuwait — Indian retailers serve NRI workers there)
- Template variables: `{customer_name}`, `{collection_name}`, `{store_name}`, `{unsubscribe_link}`.
- Pre-approval workflow: admin submits templates to Meta; status tracked in DB.

### 4.4 Opt-In & Consent — International Grade

- **GDPR (EU/UK):** explicit opt-in, right to erasure, data portability. Add consent fields: `gdpr_consent_at`, `marketing_consent_source`, `data_processing_basis`.
- **TCPA (US):** prior express written consent for marketing messages. Add `tcpa_consent_at`, `tcpa_consent_ip`.
- **Regional toggles:** per-customer, per-region opt-in status. Default: no marketing send until explicit opt-in.
- Unsubscribe mechanism: every template message includes `Reply STOP to unsubscribe` or `{unsubscribe_link}`.

### 4.5 Time-Zone Aware Scheduling

- Admin campaign scheduler: pick send time per region, not per retailer timezone.
- Auto-optimize: learn best open rate per region/customer and schedule accordingly.
- Quiet hours: respect local quiet hours (EU: 9pm–8am; UAE: 9pm–8am; US: 9pm–8am by state).

---

## 5. Phase 4B: International Catalog

**Goal:** Product catalog that works for global Indian diaspora, not just domestic buyers.  
**Duration:** 3–4 weeks

### 5.1 Multi-Currency Pricing

- Product price base: always INR in DB.
- Admin panel: exchange rate manager — manual or auto-fetched (RBI/Open Exchange Rates). Cache 1h TTL.
- Display rules:
  - Customer in UK → show GBP estimate alongside INR.
  - Customer in UAE → show AED.
  - Customer in US → show USD.
- Collection links: currency determined by customer’s detected region (IP fallback + phone prefix override).

### 5.2 Region-Specific Product Metadata

- Extend product tags with `intl_style_profile` — same product can be tagged differently for different regions.
  - Example: heavily embroidered lehenga → `style_for_gulf = premium_wedding`, `style_for_us = fusion_cocktail`, `style_for_uk = wedding_guest`.
- AI auto-suggests region tags during catalog upload based on product attributes.
- Admin can override per product.

### 5.3 Shipping Zones & Duty Estimates

- New admin module: Shipping Zones.
  - Zone = country group (e.g., “GCC”, “EU”, “NA”, “APAC”).
  - Per zone: base shipping cost (INR), estimated delivery days, duty note.
- Collection links: show shipping cost + estimated duties before checkout.
- Courier integration (later): Shiprocket International, DHL eCommerce, India Post International.

### 5.4 International Payment Methods

- Extend Razorpay: enable international cards (Razorpay supports global cards natively).
- Add PayPal / Apple Pay / Google Pay as checkout options (Phase 4D).
- Currency settlement: retailer receives INR; platform handles FX at checkout.
- Display: customer sees price in local currency + “You pay {amount}. Retailer receives ₹{INR}.”

### 5.5 Language & Localization

- Customer web PWA: detect language from URL param (`?lang=`) or browser header.
- Minimum supported languages Phase 4:
  - English (global)
  - Hindi (India + diaspora)
  - Arabic (Gulf market)
  - Spanish (Trinidad, Fiji, future LatAm)
- AI-generated product descriptions: localized by region (e.g., “office wear” in US vs “formal suit” in UK).
- RTL support for Arabic on customer web pages.

---

## 6. Phase 4C: Smart Global Campaigns

**Goal:** AI-powered campaign design that respects regional fashion differences and compliance rules.  
**Duration:** 3–4 weeks

### 6.1 Region-Aware Fashion DNA

- Extend `CustomerFashionDNA` with `region_preferences` — a sub-profile per region the customer belongs to.
  - A customer in the US may prefer Indo-Western fusion.
  - A customer in UAE may prefer modest, elegant festive wear.
  - A customer in UK may prefer traditional wedding guest looks.
- AI matching engine: weight region-specific preferences higher when customer is in that region.
- Learning signal: track `tryon_completed`, `favourited`, `enquiry_sent`, `order_placed` — but segment by region.

### 6.2 Festival & Occasion Calendar — Global

- Admin-managed festival calendar with country-level toggles.
- Pre-seeded:
  - India: Diwali, Navratri, Karwa Chauth, Raksha Bandhan, wedding season
  - UAE/Saudi: Eid al-Fitr, Eid al-Adha, National Day
  - US/UK/Canada: Diwali (public events), Christmas party season
  - Global: New Year, Valentine’s Day
- AI campaign assistant: “Create a collection for UK customers for Diwali — style: wedding guest, budget: £50–£150.”

### 6.3 Time-Zone Optimized Sends + Quiet Hours

- Campaign scheduler stores `send_at` per recipient region, not a single global timestamp.
- Quiet hours: enforced per country (defaults configurable by admin).
- Frequency cap: max N marketing messages per customer per week (configurable).

### 6.4 Compliance Guardrails

- Pre-send compliance check per recipient:
  - EU/UK: has `gdpr_consent_at`? If not, block send.
  - US: has `tcpa_consent_at`? If not, block send.
  - UAE: no specific anti-spam law yet, but honor opt-out.
- Audit log: every marketing send logged with `recipient_region`, `consent_status`, `template_id`, `cost`.
- Admin dashboard: Compliance Health — % of customers with valid consent per region.

### 6.5 Campaign Analytics by Region

- Existing analytics extended with region dimension:
  - Open rate by country
  - Try-on rate by country
  - Enquiry rate by country
  - AOV by currency
  - Best-performing styles by region
- Admin can slice: “Show me top 5 products for UAE customers this month.”

---

## 7. Phase 4D: Payments, Shipping & Scale

**Goal:** Close the loop — international customer can browse, try-on, pay, and receive delivery.  
**Duration:** 4–6 weeks

### 7.1 International Checkout

- Customer web PWA: new checkout path for international orders.
- Flow:
  1. Customer favorites / enquires / clicks “Buy”
  2. Select shipping address (country, state, pincode)
  3. See shipping cost + duty estimate
  4. Pay via international card / PayPal / Apple Pay / Google Pay
  5. Retailer gets order notification (WhatsApp + in-app)
  6. Retailer packs, marks shipped
  7. Customer gets tracking link
- Razorpay international: already supports cards; add PayPal via Razorpay or direct.
- Order status: same flow as domestic, with international tracking fields.

### 7.2 Cross-Border Logistics

- Admin: Shipping zone configuration (countries, base rate, per-kg rate, duties).
- Courier API integrations (Phase 4D+):
  - Shiprocket International
  - DHL eCommerce
  - India Post International (economy)
- Tracking: store tracking number + courier name; customer web shows tracking map.
- Returns: admin-configured return policy per zone; customer can raise return request.

### 7.3 FX & Payouts

- Retailer always sees INR.
- Platform records FX rate at time of transaction.
- Admin dashboard: international revenue dashboard (INR + local currency).

### 7.4 Scale: WhatsApp Rate Limits + Cost Controls

- Per-retailer daily broadcast cap: configurable (default: 100/day).
- Cost alert: if a campaign exceeds ₹X, require admin approval before send.
- Queue: BullMQ job for each send, with retry + dead-letter on WhatsApp API failure.
- Template governance: admin approves templates before they can be used in campaigns.

---

## 8. Integration Points with Existing Codebase

| Existing Feature | Extension for Global |
|---|---|
| `POST /v1/auth/otp/send` | Add international SMS fallback (Twilio) for OTP when MSG91 DLT blocks foreign numbers |
| `Customer` model | Add `phone_country`, `phone_region`, `gdpr_consent_at`, `tcpa_consent_at` |
| `FashionDNA` | Add `region_preferences` JSONB column |
| `Product` model | Add `intl_style_tags` JSONB; currency display in public API |
| `Collection` share | Add `?lang=` param + `?currency=` param on `/c/{slug}` |
| `CustomerWeb` (Next.js) | Add i18n (next-intl or similar), currency selector, RTL layout |
| Admin panel | New pages: WhatsApp Global, Shipping Zones, FX Rates, Compliance, Region Analytics |
| BullMQ jobs | New queues: `whatsapp-global-send`, `fx-rate-refresh`, `shipping-calculate` |
| `docs/SCALING.md` | Update Phase B/C triggers with global traffic assumptions |

---

## 9. Compliance Checklist

| Region | Requirement | Implementation |
|---|---|---|
| EU / UK | GDPR — explicit consent, right to erasure, data portability | `gdpr_consent_at`, export/delete endpoints, privacy notice in en/hi/ar |
| US | TCPA — prior express written consent for SMS/WhatsApp marketing | `tcpa_consent_at`, `STOP` handling, consent capture UI |
| UAE / Saudi | No specific spam law yet, but WhatsApp TOS applies | honor opt-out, no misleading sender ID |
| Canada | CASL — explicit consent, unsubscribe mechanism | similar to GDPR opt-in |
| Australia | Spam Act 2003 — consent + unsubscribe | similar to GDPR opt-in |
| India | TRAI DLT + new DPDP Act 2023 | already in scope for domestic |

---

## 10. Success Metrics

| Metric | Target |
|---|---|
| International retailers onboarded | 10 within 3 months of Phase 4A launch |
| International collection links opened | ≥1,000/month |
| International try-ons | ≥200/month |
| International enquiry-to-order conversion | ≥10% |
| Average international order value | ≥₹3,000 |
| WhatsApp API delivery rate | ≥98% |
| Compliance opt-in rate | ≥60% of international customers |
| Revenue from international orders | ₹2L+/month by Month 6 of Phase 4 |

---

## 11. Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| WhatsApp Business API approval delays for new regions | Medium | Start India + UAE first (highest Indian diaspora); EU/US approval takes longer |
| GDPR/TCPA fines | Low (if built correctly) | Fail-closed consent checks; no send without valid consent |
| International shipping disputes | Medium | Clear duty/delivery estimates; easy return policy |
| FX volatility | Low | Razorpay locks rate at checkout; retailer sees INR only |
| Low diaspora engagement | Medium | AI region-aware matching + festival calendar drives relevance |
| Meta rate changes | Low | Pass costs through; maintain SMS fallback |

---

## 12. Dependencies & Blockers

- **Phase 3 (Full Commerce)** must be live first — WhatsApp Business API, checkout, and admin controls are prerequisites.
- **Meta Business Verification:** retailer Meta accounts need business verification to use WhatsApp Business API globally. Plan for hand-holding.
- **Payment gateway:** Razorpay International or PayPal must be enabled in admin panel.
- **Shipping API:** courier integrations are Phase 4D+, not blockers for Phase 4A–4C (manual shipping works interim).

---

## 13. Out of Scope (Phase 4)

- Full standalone marketplace (retailer discovery by international customers)
- Multi-language AI tagging at scale (start with English + Hindi + Arabic labels)
- Local returns/warehouse in destination country
- Customs brokerage automation
- Local-language customer support chatbots
