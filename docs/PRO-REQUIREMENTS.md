# Kanchuki — Product Requirements (scope + status index)

**Version:** 2.0 (Phase 9 shrink, 2026-09-24)
**Status:** Active
**Source research:** `docs/references/research/final-research.md`, `docs/references/research/ai-fashion-sales-assistant-phase-1.md`

> **This file is the scope + status index.** Per-feature detail (user stories, acceptance criteria, design notes) lives in `tasks/pending/` (open work), `tasks/done/` (built specs) and `BUILD-LOG.md` (what shipped, when).
> The full pre-shrink PRD (2,957 lines, v1.0) is preserved verbatim at **`references/history/superseded/PRO-REQUIREMENTS-full-2026-09-24.md`**. Any older citation of the form "PRO-REQUIREMENTS §N" or "F-xxx" still resolves: find the row below, or open the archive at the same § number. The archive is frozen — where it disagrees with this file, this file wins.

---

## 1. Product

Kanchuki digitizes Indian offline clothing stores: photo-first AI catalog, customer preference capture, and WhatsApp-shareable collection links — no website, ERP or customer app required.

**Core promise:** "Digitize your clothing store in minutes and send personalized collections on WhatsApp — no website, no app, no tech skills needed."

**What makes it different:**
- Photo-first product upload with AI auto-tagging (no form filling)
- Customer preference engine (colour, style, budget, size per customer)
- WhatsApp-native sharing — the customer needs no app or account
- Works without website, ERP or barcode scanner

> **Removed 2026-08-31** (`chore/remove-unwanted-features`, migration `082`): Virtual Try-On, Fashion DNA AI matching, L2 checkout/orders, size recommendation, body measurements, showroom bookings, referrals, customer-interaction tracking (re-added net-new as F-037), lookbooks, 360° spin, partner network, festival backgrounds, incentive engine. Authoritative list: `references/history/reports/2026-08-31-feature-teardown-spec.md`. Do not describe any of these as live.

---

## 2. Users

| Role | Profile | Jobs to be done | Surface |
|---|---|---|---|
| **Retailer** (primary) | Indian ethnic-wear shop (suits, kurtis, sarees), 1–3 staff, no website/ERP, 200–1,000 customers, ₹10–50L revenue, Tier 1–2 cities, shares photos on WhatsApp by hand | Upload stock without typing; find the right product when a customer describes it; show products in store; share collections with customers who couldn't visit; remember preferences; stop opening 50 bundles to find one suit | React Native (Expo) app |
| **Customer** | Store visitor or WhatsApp link recipient, 18–55, female skew, joint-family decisions, smartphone + WhatsApp daily | See matching clothes without 20 bundles shown; compare colours/designs; favourite; enquire about price/availability. **Needs no app install and no account to browse** | Next.js PWA (mobile web) |
| **Wholesaler** | Supplies 50–500 retailers via PDF/WhatsApp | Share catalog once with MOQ + wholesale price; receive orders digitally | Web — **not in MVP** |
| **Manufacturer** | Original designs sold to wholesalers/retailers | Master catalog with design numbers; selective sharing; design-popularity analytics | Web — **not in MVP** |
| **Admin** | Kanchuki platform ops | Billing, plans, support, trust & safety, AI provider config | Next.js admin panel |

**Retailer success metric:** saves 2+ hours/day and closes 3+ extra sales/week from WhatsApp sharing.

---

## 3. Feature status index

Legend: ✅ built · 🟨 partly built · 🔴 planned · ⏸ on hold · 📋 spec only · ❌ removed. "Archive §" = section in the frozen full PRD.

### 3.1 Phase 0 — MVP core (archive §3 "Phase 0")

| ID | Feature | Status | Detail |
|---|---|---|---|
| F-001 | Photo upload + AI auto-tagging (category, colour, fabric, subtype, SKU, name, description) | ✅ | BUILD-LOG §12; archive §3, §13 |
| F-001b | PDF / printed-catalog bulk import | ✅ 2026-07-13 | archive §3 |
| F-001c | Multi-item detection + split from one photo (`packages/ai/src/detector.ts`) | ✅ 2026-07-13 | archive §3 |
| F-001d | Guided bulk onboarding, 500–3000+ SKU stores (`apps/mobile/app/product/bulk-onboard.tsx`) | ✅ | archive §3 |
| F-001e | Ghost-mannequin AI catalog image for packed stock (Snappyit) | 🔴 P2 | `tasks/pending/ghost-mannequin.md` |
| F-002 | Product catalog with rack/shelf location | ✅ | archive §3 |
| F-003 | Customer list + preference capture | ✅ | archive §3 |
| F-004 | In-store AI product search ("cotton pink suits under ₹2000") | ✅ | archive §3 |
| F-005 | WhatsApp collection link generator | ✅ | archive §3 |
| F-006 | Customer mobile web page (view, favourite, enquire) + product-level share | ✅ | BUILD-LOG §7, §15 |
| F-006A | Product status (Sold/Reserved) propagates to links via ISR | ✅ | archive §3 |
| F-006B | Offline catalog browsing (service worker) | ✅ | archive §3 |
| F-mobile-offline | Retailer app offline catalog + mutation queue | ✅ 2026-07-27 | archive §3 |
| F-007 | Retailer onboarding (incl. plan selection step) | ✅ | BUILD-LOG §55 |
| F-008 | Retailer analytics dashboard | ✅ | archive §3 |
| F-009 | Retailer account + team settings | ✅ | `tasks/done/team-member-access-control.md`, `tasks/done/staff-invite-tokens.md` |
| F-010 | Quota & limits system (admin-configurable, cross-resource) | ✅ — add-on purchase half 🔴 | `tasks/pending/ai-credit-billing-model.md` |
| F-011 | Custom product background library | ✅ | archive §3 |
| — | Product sizes (S…XXXL checkboxes, shown on customer detail) | ✅ 2026-07-26 | `tasks/done/size-fit.md` |

### 3.2 Admin, team and platform (archive §10, §12)

| ID | Feature | Status | Detail |
|---|---|---|---|
| F-013 | Plan feature matrix (admin checkbox grid) | ✅ 2026-07-26 | BUILD-LOG §1; archive §12.1 |
| F-014 | Retailer & customer activity tracking (admin) | ✅ | archive §12.2 |
| F-015 | Account suspension | ✅ | archive §12.3 |
| F-016 | Deletion vault (secondary DB) | ✅ — needs `VAULT_DATABASE_URL` | archive §12.4 |
| F-017 | DB guardrails (no DELETE for app role) | ✅ | archive §12.5; `SECURITY.md` §19 |
| — | Other admin controls (suggestions, not scoped) | 📋 | archive §12.6 |
| Phase 0.5 | Internal team management — staff roles, territory, support routing | ✅ | BUILD-LOG §2; archive §10.1–10.8 |
| F-018 | Sales referral attribution (self-serve signup) | ✅ 2026-07-28 | archive §10.9 |
| F-019 | Paid on-site catalog upload service | ✅ 2026-07-28 | `tasks/done/staff-assisted-catalog-upload.md`; archive §10.10 |
| F-020 | Catalog-upload delegated access | ✅ | archive §10.11 |
| F-021 | Product & store ratings | ✅ | `tasks/done/ratings-reviews.md` |
| F-022 | Auto-post new arrivals to Google Business Profile | ⏸ blocked on Google API access | `tasks/pending/google-business-profile-autopost.md` |
| F-023 | AI provider registry (admin-configurable tagging models + usage) | ✅ 2026-08-01 | BUILD-LOG §8; archive §10.14 |
| — | Admin commission tracker (3% pool + expense ledger) | ✅ 2026-08-17 | BUILD-LOG §42; archive §25 |
| — | DB-driven plan pricing (admin-editable ₹) | ✅ 2026-08-21 | BUILD-LOG §51 |

### 3.3 Catalog & photo features (archive §13–§22, §24, §28, §30)

| ID | Feature | Status | Detail |
|---|---|---|---|
| — | AI tagging expansion + catalog redesign | ✅ 2026-08-03 | archive §13 |
| F-024 | DB-backed default Shop-By categories + AI auto-category | ✅ 2026-08-04 | archive §14 |
| F-025 | Scan-to-Sell (offline sale via SKU/QR scan) | ✅ 2026-08-04 | archive §15 |
| F-026 | Bug: Recently Deleted → permanent delete | ✅ fixed 2026-08-04 | archive §16 |
| — | Standalone product-photo cleanup script | ✅ 2026-08-05 | archive §17 |
| F-027 | DB-backed category/style/fabric taxonomy (occasion later removed) | ✅ 2026-08-07 | archive §18 |
| F-028 | Auto-contrast background + AI-in-background add-product flow | ✅ 2026-08-08 | archive §19 |
| F-029 | Photo rotate + post-save background picker + set-as-main | ✅ 2026-08-09 | archive §20 |
| — | Bug: edited photos not visible after save (cache-busting) | ✅ fixed 2026-08-10 | archive §21 |
| F-030 | Shadow toggle for cropped photos | ✅ 2026-08-10 | archive §22 |
| F-032 | AI Studio Shoots — Phase A (photos) | ✅ + engine rebuild 2026-09-18 (first live-provider run = owner) | `tasks/pending/ai-photo-generation.md`; archive §24 |
| F-032 B | Product video (PhotoRoom-style) | 🔴 — superseded by F-034 | `tasks/pending/ai-photo-generation.md` |
| F-033 | Ken Burns auto-video + video social posting | ✅ 2026-08-19 | BUILD-LOG §28; archive §28 |
| F-034 | AI image→video for social promo | 🟨 Phase 1 (admin bench) ✅; retailer phase 🔴 deferred | `tasks/pending/ai-photo-generation.md` §7; archive §30 |
| — | Suits Designs (showcase-design library + watermark) | ✅ 2026-09-07 | `tasks/done/suits-designs.md` |

### 3.4 Growth, marketing and social (archive §23, §27, §29)

| ID | Feature | Status | Detail |
|---|---|---|---|
| F-031 | Social publishing — Facebook/Instagram connect + post | ✅ 2026-08-13 | `tasks/done/social-connect-native.md`; archive §23 |
| — | Social create-post composer (multi-target fan-out, templates, caption AI) | ✅ 2026-09-05 | `tasks/done/social-create-post-composer.md` |
| F-031 P3 | Social publishing phase 3 | 🔴 | `tasks/pending/social-publishing-phase-3.md` |
| — | India Retailer Growth Engine — campaigns, festivals, promotions, inventory alerts, videos, AI translate, AI search, campaign analytics, A/B, AI Campaign Assistant | ✅ 2026-08-17 (referrals, suppliers, bookings ❌ removed) | `marketing/india-retailer-growth.md`; `tasks/done/campaign-analytics-seasonal.md`, `tasks/done/ab-testing-variant-links.md`; archive §27 |
| — | Marketing & sales enablement (local discovery, social templates, aggregator sync, GST reports, GMB / FB / Google Ads bring-your-own-key) | ✅ (incentives, festival backgrounds, lookbooks ❌ removed) | `marketing/marketing-sales-enablement.md` |
| — | Partner Network Manager | ❌ removed 2026-08-31 | archive §29 |
| — | Coupon codes | 📋 spec | `tasks/pending/coupon-codes.md` |
| M | Multi-language AI (descriptions, campaign messages) — full i18n UI | 🟨 partial | `tasks/pending/multi-language-i18n.md` |

### 3.5 Customer experience (archive "Customer Profile", §32, §33)

| ID | Feature | Status | Detail |
|---|---|---|---|
| — | Customer Profile P2 — fabric glossary, recently viewed, restock notify, saved size, style quiz, AI Stylist, unstitched design gallery | ✅ 2026-08-21 | `customers/customer-profile.md` |
| — | Shopper passport identity (`CustomerAccount`, visits, consent; migrations 079–081) | ✅ core live | `customers/shopper-passport-identity.md` |
| F-036 | Customer PWA — home-screen icon, visited-store list, `/login` + `return_to` | ✅ Phase A 2026-09-17 | `tasks/pending/customer-pwa-push-notifications.md`, `tasks/done/return-to-post-login-redirect.md` |
| F-036 B–D | Push notifications, iOS install flow, consent/mute UI | 🔴 | `tasks/pending/customer-pwa-push-notifications.md` |
| F-037 | Engagement event log (`CustomerInteraction`, migration 100) | ✅ Phase 1 2026-09-18 | `tasks/pending/customer-engagement-analytics.md` |
| F-037 2–4 | Nightly aggregation + admin/retailer behaviour dashboards | 🔴 | same |

### 3.6 Commerce, billing and WhatsApp (archive §3 "Phase 3", §26, §31)

| ID | Feature | Status | Detail |
|---|---|---|---|
| — | Retailer auth — Login / Create Account toggle on one OTP screen | ✅ 2026-08-17 | archive §26 |
| — | Real OTP via MSG91 (DLT-registered sender) | ✅ | BUILD-LOG §38 |
| F-304 | GST invoicing — **subscription** invoices (CGST/SGST/IGST, gap-free numbers, PDF in R2) | ✅ 2026-09-01 | `tasks/done/subscription-gst-and-monthly-pricing.md` |
| F-307 | WhatsApp native catalog sync (Meta Catalog API) | ✅ 2026-08-18 | `tasks/done/whatsapp-catalog-sync.md` |
| F-301 | WhatsApp sends on the retailer's own API credentials (bulk-send, campaign-send) | ✅ send path exists | archive §3 "Phase 3" |
| F-035 | Kanchuki-managed WhatsApp sending (Tech Provider + Embedded Signup) | 🔴 post-launch, gated on Meta verification | `tasks/pending/whatsapp-managed-sending.md` |
| — | Mid-cycle plan switch, Model A (next cycle, no proration) | ✅ 2026-09-05 | §6 below |
| — | Mid-cycle plan switch, Model B (prorated immediate upgrade) | 🔴 | `tasks/pending/plan-switch-prorated.md` |
| F-302 | L2 ecommerce checkout | ❌ removed 2026-08-31 | archive §3 |
| F-303 | Order management + delivery tracking | ❌ removed with F-302 | archive §3 |
| F-307 (Route) | Razorpay Route split payments — *duplicate ID in the archive* | ❌ dropped (depended on F-302) | archive §3 |
| F-305 | Multi-store management | 🔴 not started | archive §3 |

### 3.7 Removed, or not in MVP (archive §3 "Phase 1/2")

| ID | Feature | Status |
|---|---|---|
| F-101 | Fashion DNA — AI customer matching | ❌ removed 2026-08-31 (the style quiz survives in Customer Profile P2) |
| F-102 / b / c / d | Virtual Try-On, body measurements, size recommendation, training-data collection | ❌ removed 2026-08-31 |
| F-103 | Remote try-on via WhatsApp | ❌ removed with F-102 |
| F-104 | Auto-personalized collection building | ❌ dropped (depended on F-101) |
| F-201–F-204 | Wholesaler import, retailer→wholesaler orders, manufacturer catalog, design popularity | 🔴 not in MVP (Phase 2) |

Cross-cutting launch items (secrets, migrations to verify, real-device checks): `tasks/pending/launch-readiness.md`.

---

## 4. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Photo upload + AI tagging < 15 s · in-store search < 2 s · collection page LCP < 3 s on 3G · API p95 < 500 ms · app start < 3 s |
| Reliability | 99.5 % uptime during 9am–9pm IST · catalog viewable offline · auto-sync on reconnect · no data loss on interrupted upload |
| Scalability | MVP: 500 retailers / 25K products / 10K customers · Year 1: 10K retailers / 500K products · stateless API + Redis. Long-range plan: `SCALING.md` |
| Mobile | Android first (API 28+), iOS second · customer web on Chrome Android / Safari iOS, no install |
| Connectivity | Built for 3G/4G · photos compressed before upload (≤ 80 KB stored, BUILD-LOG §22) · progressive catalog loading |
| Language | Hindi UI by Year 1 (`tasks/pending/multi-language-i18n.md`) |

---

## 5. GST compliance (non-negotiable)

- Store the retailer's GSTIN; every subscription payment gets a GST invoice (built — see §6).
- With checkout removed, only **subscription** invoicing (SAC 998314, 18 %) is live. Apparel HSN codes (5208, 6211 …) and slabs (5 % ≤ ₹1000, 12 % > ₹1000) apply only if Kanchuki ever invoices goods sales again.
- GSTR-1-compatible reports; e-invoice support is Phase 3+.
- Anything that takes money must ship with GST invoice support.

---

## 6. Pricing & billing

**Source of truth for prices and limits: Admin → Plan Limits & Pricing (`plan_pricing` table).** The table below is the launch baseline, not the live value.

| Plan | Monthly base (ex-GST) |
|---|---|
| Starter | ₹4,999 |
| Growth | ₹9,999 |
| Pro | ₹14,999 |

- Retailer pays base + 18 % GST. **INR only. Monthly only** (annual removed 2026-09-01).
- Razorpay (UPI first, cards, netbanking) on web billing `kanchuki.app/billing`; **the Android app sells nothing in-app** (Play Billing compliance — `references/guides/play-store-launch-checklist.md`).
- 14-day free trial, no card; onboarding also offers a no-payment Demo (full Pro). Auto-renew with advance notice.
- GST invoice for every subscription payment: CGST+SGST intra-state, IGST inter-state; SAC 998314 at 18 % computed from the ex-GST base (never gross ÷ 1.18); `place_of_supply` stored coded (`"27-Maharashtra"`).
- Invoice numbers gap-free per financial year (`KAN/YY-YY/NNNNNN`), allocated in the payment's own DB transaction so rollbacks or redelivered webhooks never burn a number.
- Invoice PDF in R2 under a random-UUID key; downloads use a 300-second presigned URL. If the platform GST profile is unset, a daily `backfill-gst-invoices` job fills the gap once configured.
- Add-ons: WhatsApp conversations are pass-through (Meta ~₹0.38/conversation stays in the pricing math); extra staff seats; metered AI resources via credit packs (`resource_packs`, admin half built — `tasks/pending/ai-credit-billing-model.md`).
- **Plan switching.** Model A (built): the old plan runs to its period end, then the new plan starts at full price — the new Razorpay subscription's `start_at` is floored at the prior `current_period_end` (the double-billing fix). Model B (prorated immediate upgrade) is planned — formula and Razorpay approach in `tasks/pending/plan-switch-prorated.md`.

---

## 7. Data requirements

- **Products:** 1–10 photos each, stored in Cloudflare R2, compressed; metadata in PostgreSQL (JSONB where flexible).
- **Customers (privacy-critical):** phone stored hashed for identity, last-4 for display; preference data is retailer-owned and never shared across retailers; no customer photo stored without explicit opt-in. Behavioural events (F-037) only under the DPDP profiling consent.
- **Business:** every retailer table tenant-isolated with row-level security; daily backups, 30-day retention; no cross-retailer sharing except anonymised aggregates.
- Photo consent/deletion rules: `SECURITY.md`. Schema: `database/DATABASE.md`.

---

## 8. Integrations

| Status | Integration | Use |
|---|---|---|
| Live | Anthropic Claude (Vision + text) | Tagging, search, captions, AI Stylist, campaign assistant |
| Live | Cloudflare R2 + CDN | Images, invoices |
| Live | Supabase (Postgres 16 + Auth) · Redis | DB, auth, cache, queues |
| Live | MSG91 | OTP SMS + widget |
| Live | Razorpay | Subscriptions |
| Live | Meta Graph API | Facebook/Instagram publishing, WhatsApp catalog sync, WhatsApp sends (retailer credentials) |
| Live | Fal.ai · Google Gemini · FLUX Kontext | AI Studio images + video (admin-registered keys) |
| Live | Sentry | Error monitoring (active once the DSN is set) |
| Planned | Meta Tech Provider / Embedded Signup | F-035 |
| Future | Shiprocket/Delhivery, Tally/Busy | Only if commerce returns |

---

## 9. MVP user stories (critical path)

1. **Retailer onboards** — sets up a digital catalog in 30 minutes.
2. **Retailer adds product** — photographs a suit; AI fills in every field.
3. **Retailer searches in store** — types "pink cotton wedding suit under 3000" and sees matches instead of opening 30 bundles.
4. **Retailer creates collection** — picks 15 festive products, gets a WhatsApp link.
5. **Customer views collection** — browses without installing anything, shortlists, WhatsApps interest.
6. **Customer favourites products** — hearts items so the retailer sees interest.

---

## 10. Out of scope (MVP)

Manufacturer/wholesaler layer · orders, checkout, shipping · UPI payment tracking · advanced BI · third-party API · POS/billing terminal · every feature in the §1 removed list. Kanchuki-managed WhatsApp sending (F-035) is post-launch.

---

## 11. Adding a feature

1. Check this index first — the feature may already exist, or have been removed on purpose.
2. Write the spec as `tasks/pending/<feature>.md` and add a row here.
3. When it ships: move the spec to `tasks/done/`, flip the row to ✅ with the date, append the build table to `BUILD-LOG.md`, refresh the CLAUDE.md index row.
