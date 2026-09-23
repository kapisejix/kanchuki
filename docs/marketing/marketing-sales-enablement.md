# Marketing & Sales Enablement — Merged Reference

> Merged 2026-09-23 from 13 files in `docs/marketing/` (overview + implementation status + 11 feature specs).
>
> **⚠️ Statuses below the top-of-feature `**Status:**` lines were re-verified against the code on 2026-09-23 (docs reorg) and 7 of them were stale — they came from the 2026-08-20 wiring audit that said "not wired into any app" / "orphan stub". Those `services/*` orphan stubs **no longer exist** (`services/` now holds only `fashion-vtone`, `photo-cleanup`, `training`), and four features were deleted outright by the 2026-08-31 teardown (migration `082`). Each corrected line carries a "verified 2026-09-23" note; the surrounding prose is otherwise unchanged as the historical record.
> Historical audit: `references/history/reports/2026-08-20-marketing-wiring-audit.md`.

## Verified status (code-checked 2026-09-23)

| Feature | Real status | Evidence |
|---|---|---|
| Smart Incentive Engine | ❌ **REMOVED** 2026-08-31 | `incentive_rules` dropped by migration `082`; no `IncentiveRule` model |
| Local Discovery Engine | ✅ **Built** (2026-08-20) | `routes/public/near-me.ts` (`GET /v1/near-me`) + `/admin/discovery` page |
| AI-Driven Social Media Templates | ✅ **Built** — was marked "not built" | `SocialTemplate` + `PostTemplate` models, migration `091_post_templates`, `routes/admin/admin-social-templates.ts`, `routes/admin/admin-post-templates.ts`, `routes/post-templates.ts`, admin pages `/admin/social-templates` + `/admin/post-templates` |
| Automated Festival Background Library | ❌ Not built — **and target removed** | `festival_backgrounds` dropped by `082`; `FESTIVAL_BACKGROUNDS` plan row deleted |
| Automated Lookbook Generator | ❌ Not built — **and target removed** | `lookbooks` dropped by `082`; `LOOKBOOK_GENERATOR` plan row deleted |
| Aggregator & Marketplace Sync | ✅ **Built** — was marked "not built" | `ChannelSync` model, migration `070_channel_sync_aggregator`, `routes/retailers/retailers-aggregators.ts`, `routes/admin/admin-aggregators.ts`, mobile `growth/aggregators.tsx`, admin `/admin/aggregators` |
| Partner Network Manager | ❌ **REMOVED** 2026-08-31 | `partners`/`partner_referrals`/`partner_events` + `PartnerType`/`CommissionType`/`PartnerReferralStatus` dropped by `082`; API dir, admin pages and `growth/partners.tsx` deleted |
| Direct Social Publishing | ✅ **Built** — was marked "partial" | F-031 phases 1–2 plus the full composer: migrations `090`–`092`, fan-out `POST /v1/retailers/me/social/posts` — see `tasks/done/social-create-post-composer.md` |
| Google My Business | ✅ **Built** — was marked "not built" | `POST/DELETE /me/integrations/gmb` + `/gmb/test` + `/gmb/post` in `routes/retailers/retailers-integrations.ts`; mobile `growth/integrations/gmb.tsx` |
| Facebook Local Awareness Ads | ✅ **Built** — was marked "not built" | `POST/DELETE /me/integrations/fb-ads` + `/fb-ads/test` + `/fb-ads/create-campaign`; mobile `growth/integrations/fb-ads.tsx` |
| Google Local Service Ads | ✅ **Built** — was marked "not built" | `POST/DELETE /me/integrations/google-ads` + `/google-ads/test`; mobile `growth/integrations/google-ads.tsx` |
| GST Reports | ✅ **Built** (2026-09-01) | Mobile `growth/gst.tsx`, admin `/admin/reports`, real CGST/SGST/IGST columns — `CLAUDE.md` row 59 |

Built with the **bring-your-own-key** pattern (retailer pastes their own Google/Meta credentials; Kanchuki never holds platform ad accounts).


---

<!-- source: docs/marketing/marketing-sales-enablement.md -->
## Marketing & Sales Enablement Features - Overview and Individual Specs

**Note:** The original PRD has been split into individual feature files in this directory for granular tracking. Each feature file contains detailed specifications, status, and implementation details.

### Subscription-Based Feature Management

All marketing and sales enablement features are gated behind subscription plan features in the same manner as the Growth Engine features (see `INDIA-RETAILER-GROWTH.md`). Retailers can only access features included in their specific subscription plan (Starter, Growth, Pro). The Admin Dashboard controls feature availability on a plan-wise basis.

## Kanchuki Platform Marketing & Sales Enablement Roadmap
### Product Requirement Document (PRD)
**Date:** 2026-08-19  
**Version:** 1.0  
**Objective:** Translate marketing research into actionable platform features to help small Indian clothing retailers increase sales and manage social media presence.

---
### 1. Feature Implementation Roadmap: Offline-to-Online Strategy Modules

| Research Tactic          | Platform Module                     | Key Functionalities                                                                 | Technical Approach                                                                 | Priority (Ease/Impact) |
|--------------------------|-------------------------------------|-----------------------------------------------------------------------------------|----------------------------------------------------------------------------------|------------------------|
| Hyperlocal Targeting     | Local Discovery Engine              | - Geo-tagged product listings for Google My Business<br>- "Near me" search optimization<br>- Location-based offer rules (e.g., show Diwali offers only to users within 10km) | Extend existing `getSecret`/`prisma` to store location metadata; add geo-indexing to product photos; integrate with Google My Business API for automatic post generation | High (Leverages existing location data; Medium dev effort; High impact on footfall) |
| Community Partnerships   | Partner Network Manager             | - Track referral codes for local salons/tailors<br>- Automated commission payouts<br>- Co-hosted event invitations (e.g., "Styling Sunday" with beauty parlor) | New `partner_relations` table; webhook for referral tracking; email/SMS templates for event invites; integrate with existing loyalty points system | Medium (Requires new DB schema; Low-Medium dev effort; Medium impact on acquisition) |
| Visitor Incentives       | Smart Incentive Engine              | - First-time visitor discount auto-applied at checkout<br>- Birthday/anniversary offer triggers<br>- Loyalty tier progression based on spend/visit frequency | Extend `prisma` with `customer_visits` and `incentive_rules` tables; integrate with checkout flow; WhatsApp/SMS automation for incentive delivery | High (Uses existing customer data; Low dev effort for rules engine; High impact on retention) |

---
### 2. Social Media Management Suite

| Feature                          | Functional Specification                                                                 | Technical Implementation                                                                                                                               | Priority (Ease/Impact) |
|----------------------------------|----------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------|
| **AI-Driven Social Media Templates** | - Generate Instagram post/reel templates from product images<br>- WhatsApp catalog/status templates with festive overlays<br>- Text suggestions based on regional trends & occasion | - Use existing `studio-shoot` FLUX Konnet integration to apply stylized backgrounds<br>- New `social-template` microservice (Node.js) with OpenAI API for caption generation<br>- Store templates in S3/R2; serve via CDN<br>- Integrate with WhatsApp Business API for catalog updates | High (Reuses AI studio tech; Low-Medium dev; High impact on social engagement) |
| **Automated Festival Background Library** | - Pre-generated backgrounds for Diwali, weddings, regional festivals<br>- One-click apply to product images<br>- Seasonal auto-rotation (e.g., swap to wedding backgrounds Oct-Mar) | - Extend `studio-shoot` job to generate background variants during off-peak hours<br>- New `festival-bg` table in DB with metadata (occasion, validity dates)<br>- Admin UI to preview/select backgrounds<br>- API endpoint: `/apply-background/{productId}/{festivalId>` | Medium (Builds on studio-shoot; Low dev; High impact for seasonal campaigns) |
| **Automated Lookbook Generator**   | - Input: 3-5 product IDs<br>- Output: Coordinated lookbook (images/video) with styling notes<br>- Export formats: Instagram carousel, WhatsApp status, PDF | - New `lookbook-generator` service (Python)<br>- Uses style rules from `fashion-dna` module<br>- Leverages existing image compression/upload pipeline<br>- Output stored as new ProductPhoto rows with `is_lookbook: true` flag | Medium (Requires new service; Medium dev; High impact on upsell/cross-sell) |
| **Direct Social Publishing**       | - Schedule Instagram Reels (via Meta Graph API)<br>- Broadcast WhatsApp Catalog updates<br>- Analytics: views, shares, click-throughs | - Integrate with Meta Graph API for Reels scheduling<br>- Use WhatsApp Cloud API for catalog broadcasts<br>- New `social-scheduler` table for queued posts<br>- Webhook for post-publish analytics (impressions, engagement) | High (Leverages existing WhatsApp/IG integrations; Low dev; High impact on campaign efficiency) |

---
### 3. Hyperlocal & Ad Management Integration

| Platform                  | Kanchuki Integration Features                                                                 | Technical Approach                                                                                   | Priority (Ease/Impact) |
|---------------------------|---------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|------------------------|
| **Google My Business**    | - Auto-post new arrivals/offers<br>- Review monitoring & response templates<br>- Q&A management for common queries (size, fabric) | - Use Google My Business API<br>- New `gmb-sync` service (Node.js)<br>- Webhook for review alerts<br>- Template engine for automated responses | High (Well-documented API; Low dev; High impact on local SEO) |
| **Facebook Local Awareness Ads** | - Create radius-based ad campaigns (5km/10km)<br>- A/B test creative (product vs. lifestyle)<br>- Budget pacing alerts | - Integrate with Meta Marketing API<br>- New `fb-ads` manager in retailer dashboard<br>- Use existing product image library for ad creatives<br>- Auto-pause when budget exhausted | Medium (Requires Meta API access; Medium dev; High impact on footfall) |
| **Google Local Service Ads** | - Service-based ad management (e.g., "alteration services near me")<br>- Lead tracking & follow-up reminders | - Extend existing Google Ads integration<br>- New `gla-leads` table for service inquiries<br>- SMS/email alerts for new leads<br>- Integration with appointment booking (if available) | Low-Medium (Niche for retailers; Low dev; Medium impact for service add-ons) |

*Note: Prioritize GMB > FB Ads > GLA for clothing retailers.*

---
### 4. Aggregator & Marketplace Sync Architecture

**Core Principles:**  
- Unified product catalog (single source of truth in Kanchuki DB)  
- Real-time inventory sync (prevent overselling)  
- Order aggregation (centralized fulfillment view)  
- Fee/revenue reconciliation per channel  

**Technical Architecture:**  
```
[Retailer Dashboard] 
        ↓ (REST/WebSocket)
[Kanchuki API Gateway] 
        ↓ 
[Channel Adapter Layer] 
        ↓ 
[Meesho Adapter] → Meesho API  
[Glroad Adapter]  → Glroad API  
[Craftsvilla Adapter] → Craftsvilla API  
[Instamojo Adapter] → Instamojo API (for store/payment links)
```

**Key Components:**  
- **Product Mapper:** Normalizes Kanchuki product schema to each channel's requirements (e.g., Meesho requires specific attribute names)  
- **Inventory Sync Service:**  
  - Polls channel APIs every 15 mins for stock changes  
  - Pushes Kanchuki inventory updates via channel APIs  
  - Conflict resolution: "last write wins" with manual override for high-value items  
- **Order Hub:**  
  - Pulls new orders from all channels via webhooks/polling  
  - Tags orders by source channel  
  - Updates Kanchuki `orders` table with channel metadata  
  - Triggers workflow (existing or new)  
- **Fee Tracker:**  
  - Retrieves transaction fees from channel APIs  
  - Aggregates in `channel_finance` table for payout reconciliation  

**Priority:** High (Medium dev effort due to multiple APIs; Very High impact on sales channels)  
*Note: Start with Meesho & Instamojo (simplest APIs), then Glroad/Craftsvilla.*

---
### 5. Value Proposition for Retailers

| Feature                          | Specific ROI Metrics                                                                 | Quantifiable Impact (Based on Industry Benchmarks) |
|----------------------------------|------------------------------------------------------------------------------------|--------------------------------------------------|
| Local Discovery Engine           | - 30% increase in "near me" search impressions<br>- 20% higher conversion from local ads | +15% footfall from local searches; +10% sales from geo-targeted offers |
| Partner Network Manager          | - 25% reduction in CAC via referrals<br>- 40% higher LTM from partner-referred customers | ₹500-1000 avg. referral value; 2x repeat rate from partner leads |
| Smart Incentive Engine           | - 35% increase in first-time visitor conversion<br>- 50% higher repeat visit rate | ₹200-300 avg. uplift per new customer; 3x likelihood of second visit |
| AI-Driven Social Media Templates | - 50% reduction in content creation time<br>- 2x engagement rate on templated posts | 5 hrs/week saved; 15-20% higher CTR on promotions |
| Automated Festival Background Library | - 70% faster seasonal campaign launch<br>- 3x more festive-themed posts | Diwali/Wedding season sales uplift of 20-30%; reduced dependency on photographers |
| Automated Lookbook Generator     | - 25% increase in average order value (AOV)<br>- 40% higher add-to-cart rate for bundled looks | ₹150-250 AOV increase; 1.5x cross-sell success rate |
| Direct Social Publishing         | - 60% faster campaign execution<br>- 80% adherence to posting schedule | 3x more consistent social presence; 20% higher follower growth |
| GMB Integration                  | - 40% increase in direction requests<br>- 50% more review responses | 25% higher footfall from Google Maps; improved local search ranking |
| Facebook Local Awareness Ads     | - 30% lower CPL vs. broad targeting<br>- 2x higher in-store redemption rate | ₹15-20 CPL (vs. ₹40-50 for broad); 10-15% sales lift from ad-driven footfall |
| Aggregator & Marketplace Sync    | - 50% reduction in manual inventory updates<br>- 99.8% inventory accuracy | 5-10 hrs/week saved; 15-20% sales increase from multi-channel presence; near-zero overselling incidents |

**Overall Platform Impact:**  
- **Time Savings:** 10-15 hrs/week per retailer on manual marketing/inventory tasks  
- **Sales Growth:** 20-35% increase in monthly revenue within 3 months of adoption  
- **Customer Retention:** 40% improvement in repeat purchase rate via personalized incentives  
- **Market Reach:** 3x expansion in digital touchpoints (social + marketplaces + local search)  

---
### Implementation Phases (by Priority)

**Phase 1 (Quick Wins - 4-6 weeks):**  
1. Smart Incentive Engine (uses existing customer data) ✅
2. Local Discovery Engine (leverages location fields) ✅
3. GMB Integration (simple API) ✅
4. AI-Driven Social Media Templates (builds on studio-shoot) ✅

**Phase 2 (Core Enablement - 8-10 weeks):**  
1. Direct Social Publishing (WhatsApp/IG APIs) ✅
2. Automated Festival Background Library (extends studio-shoot) ✅
3. Partner Network Manager (new DB schema + workflows) 🔴 not built — schema fails `prisma validate`, no migration, no UI (see `docs/PRO-REQUIREMENTS.md` §29)
4. Aggregator Sync (Meesho + Instamojo first) ✅  

**Phase 3 (Advanced Features - 12+ weeks):**  
1. Automated Lookbook Generator (new service) ✅  
2. Facebook Local Awareness Ads (Meta API) ✅  
3. Google Local Service Ads (niche extension) ✅  
4. Full Aggregator Sync (Glroad/Craftsvilla) ✅  

**Success Metrics for Each Phase:**  
- Phase 1: ≥20% increase in repeat visits & local search footprint  
- Phase 2: ≥15% uplift in social engagement & marketplace sales  
- Phase 3: ≥25% reduction in marketing ops time & ≥30% multi-channel revenue share  

--- 
**Note:** All features maintain the "new row preserves old" data pattern. Minimum viable versions prioritize retailer self-service with admin oversight controls.
End of PRD.
---

<!-- source: docs/marketing/marketing-sales-enablement.md -->
## Marketing & Sales Enablement — Implementation Status & Development Plan

**Last updated:** 2026-08-20 (updated after Phase 5+6 mobile screens + Phase 9 orphan cleanup)  
**File purpose:** Single source of truth for all marketing/sales enablement features. Track everything here.  
**Replaces:** the previous "100% COMPLETE" claim (now proven false by `WIRING-AUDIT-2026-08-20.md`).

---

### 🏗️ Unified Architecture (One Pattern for All Features)

Every feature in this project follows the same 4-layer pattern. No exceptions.

```
Layer 1 — Schema
  packages/db/prisma/schema.prisma     → new models/enums
  packages/db/prisma/migrations/NNN_*  → migration SQL

Layer 2 — Backend API
  apps/api/src/routes/growth/*.ts      → growth/marketing features (FastifyPluginAsync)
  apps/api/src/routes/retailers/*.ts   → retailer-specific features
  apps/api/src/routes/public/*.ts      → public/customer-facing features
  apps/api/src/routes/admin/*.ts       → admin-only features

Layer 3 — Admin Dashboard (Next.js App Router)
  apps/web/src/app/admin/*/page.tsx    → admin management UI

Layer 4 — Retailer Mobile App (React Native Expo)
  apps/mobile/app/growth/*.tsx         → retailer-facing mobile screens
```

**Gating:** Every feature is gated behind a `PlanFeatureKey` enum value in Prisma, checked via `hasFeature(retailerId, 'FEATURE_NAME')` in the API route.

**`services/` directory:** All orphan standalone Fastify servers were deleted (Phase 9, 2026-08-20). Remaining `services/` dirs (`fashion-vtone`, `photo-cleanup`, `training`) are active support services, not orphan stubs.

---

### 📊 Honest Status Summary

| # | Feature | Real Code Exists? | API Route | Admin UI | Mobile UI | Plan Gate | Overall |
|---|---------|-------------------|-----------|----------|-----------|-----------|---------|
| 1 | Smart Incentive Engine | ✅ Folded into apps/ | ✅ | ✅ | ✅ | ✅ | **Built** |
| 2 | Local Discovery Engine | ✅ Folded into apps/ | ✅ | ✅ | ❌ | ❌ | **Built** |
| 3 | GMB Integration | ✅ Full stack | ✅ | ❌ | ✅ | ✅ | **Built** |
| 4 | AI Social Media Templates | ✅ Full stack | ✅ | ✅ | ✅ | ✅ | **Built** |
| 5 | Direct Social Publishing | ✅ Full stack | ✅ | ✅ | ✅ | ✅ | **Built** |
| 6 | Festival Background Library | ✅ Full stack | ✅ | ✅ | ✅ | ✅ | **Built** |
| 7 | Partner Network Manager | ✅ Full stack | ✅ | ✅ | ✅ | ✅ | **Built** |
| 8 | Aggregator Sync | ✅ Full stack | ✅ | ✅ | ✅ | ✅ | **Built** |
| 9 | Lookbook Generator | ✅ Full stack | ✅ | ✅ | ✅ | ✅ | **Built** |
| 10 | Facebook Local Awareness Ads | ✅ Full stack | ✅ | ❌ | ✅ | ✅ | **Built** |
| 11 | Google Local Service Ads | ✅ Full stack | ✅ | ❌ | ✅ | ✅ | **Built** |
| 12 | GST Report Generator | ✅ Full stack | ✅ | ✅ | ✅ | ✅ | **Built** |

**Legend:** ✅ = real, wired, reachable | ⚠️ = code exists but unreachable (orphan in `services/`) | ❌ = not built

---

### 🔍 Orphan Service Audit (What's in `services/`)

**All orphans deleted 2026-08-20.** Remaining `services/` dirs are active: `fashion-vtone`, `photo-cleanup`, `training`.

| Service | Location | Usable Code | Reuse Strategy |
|---------|----------|-------------|----------------|
| ~~incentive-engine~~ | ~~`services/incentive-engine/`~~ | ~~IncentiveRule CRUD, loyalty eval~~ | **Deleted** (Phase 9) → `apps/api/src/routes/growth/growth-incentives.ts` |
| ~~local-discovery-engine~~ | ~~`services/local-discovery-engine/`~~ | ~~Haversine distance, geo-query~~ | **Deleted** (Phase 9) → `apps/api/src/routes/public/near-me.ts` |
| ~~gmb-sync~~ | ~~`services/gmb-sync/`~~ | ~~Placeholder — needs Google API creds~~ | **Deleted** (Phase 9) |
| ~~social-template~~ | ~~`services/social-template/`~~ | ~~Placeholder — needs API creds~~ | **Deleted** (Phase 9) → `apps/api/src/routes/admin/admin-social-templates.ts` |
| ~~aggregator-sync~~ | ~~`services/aggregator-sync/`~~ | ~~Mock data, 1 file~~ | **Deleted** (Phase 9) → `apps/api/src/routes/retailers/retailers-aggregators.ts` |
| ~~facebook-ads~~ | ~~`services/facebook-ads/`~~ | ~~Placeholder — needs Meta Marketing API creds~~ | **Deleted** (Phase 9) |
| ~~google-local-service-ads~~ | ~~`services/google-local-service-ads/`~~ | ~~Placeholder — needs Google Ads API creds~~ | **Deleted** (Phase 9) |
| ~~lookbook-generator~~ | ~~`services/lookbook-generator/`~~ | ~~Minimal HTML generation~~ | **Deleted** (Phase 9) → `apps/api/src/routes/admin/admin-lookbooks.ts` |
| ~~analytics-service~~ | ~~`services/analytics-service/`~~ | ~~Scaffold only~~ | **Deleted** (Phase 9) |
| ~~auth-service~~ | ~~`services/auth-service/`~~ | ~~Scaffold only~~ | **Deleted** (Phase 9) |

**Deleted (Phase 9, 2026-08-20):** All 10 orphan service directories — duplicates/scaffolds of existing `apps/api` functionality.

---

### 📋 Development Phases

#### Phase 0 — Fix Partner Network Schema ✅ Completed
> **Done 2026-08-20.** Commits `b990e64` + `1dc17e1`.

| Layer | What was Built | File |
|-------|---------------|------|
| Schema | Added `PARTNER_NETWORK` + `INCENTIVE_ENGINE` to `PlanFeatureKey` enum | `packages/db/prisma/schema.prisma` |
| Schema | Added missing reverse relation fields (Retailer→CustomerVisit, Customer→visits, Order→partner_referrals, Partner→events) | `packages/db/prisma/schema.prisma` |
| Route fix | Fixed import paths (`../../` → `../../../`), `amount_paise` → `total_amount`, missing `select` closing brace, unused imports | `apps/api/src/routes/retailers/retailers-partners/index.ts` |
| Migration | 066 — 5 tables + 5 enums (customer_visits, incentive_rules, partners, partner_referrals, partner_events) | `packages/db/prisma/migrations/066_incentive_engine_and_partner_network/migration.sql` |

**Verified:** `npx prisma validate` ✅, `npx prisma generate` ✅, partner route typechecks ✅
**Next:** Apply migration to DB (`npx prisma migrate deploy` or Supabase SQL Editor)

---

#### Phase 1 — Smart Incentive Engine ✅ Completed
> **Done 2026-08-20.** Commits `d0e3980`, `0f32267`, `f36fba1`.
> **Source:** `services/incentive-engine/` (orphan stub) → folded into `apps/`.

| Layer | What was Built | File | Status |
|-------|---------------|------|--------|
| Schema | `IncentiveRule` model | `packages/db/prisma/schema.prisma` | ✅ Exists (line 355) |
| Schema | `CustomerVisit` model | `packages/db/prisma/schema.prisma` | ✅ Exists (line 342) |
| Schema | `INCENTIVE_ENGINE` in `PlanFeatureKey` | `packages/db/prisma/schema.prisma` | ✅ Exists (line 146) |
| Migration | 066 — tables + enums | `packages/db/prisma/migrations/066_*` | ✅ Created |
| **Backend** | Incentive rule CRUD + visit tracking + loyalty check + stats | `apps/api/src/routes/growth/growth-incentives.ts` | ✅ Built (9 endpoints) |
| Backend | Registered in growth routes barrel | `apps/api/src/routes/growth/index.ts` | ✅ Built |
| **Admin API** | List all rules, stats, toggle, delete | `apps/api/src/routes/admin/admin-incentives.ts` | ✅ Built (5 endpoints) |
| Admin API | Registered in admin barrel + route aggregator | `apps/api/src/routes/admin/index.ts`, `admin.ts` | ✅ Built |
| **Admin UI** | Rules table, stats cards, create/edit modal | `apps/web/src/app/admin/incentives/page.tsx` | ✅ Built |
| Admin UI | Sidebar nav entry (Gift icon) | `apps/web/src/app/admin/components/Sidebar.tsx` | ✅ Built |
| **Mobile UI** | Rules list, toggle, create modal, stats strip | `apps/mobile/app/growth/incentives.tsx` | ✅ Built |
| Mobile UI | API client (7 methods + 4 types) | `apps/mobile/src/lib/api/growth.ts` | ✅ Built |

**Business logic to extract from orphan:**
- Trigger evaluation: FIRST_VISIT (visitCount === 0), BIRTHDAY (needs customer DOB), LOYALTY_TIER (spend/visit thresholds)
- Discount application: PERCENT (capped at 100) or FIXED_AMOUNT (capped at subtotal)
- Date range validation: starts_at/ends_at overlap check

**Acceptance:** Retailer can create incentive rules → customer visits trigger discount → admin sees analytics.

---

#### Phase 2 — Partner Network Manager ✅ Completed
> **Done 2026-08-20.** Commit `20b6052`.
> **Source:** `apps/api/src/routes/retailers/retailers-partners/index.ts` (existing route) + new admin API.

| Layer | What was Built | File | Status |
|-------|---------------|------|--------|
| Backend | Retailer CRUD (already existed) | `apps/api/src/routes/retailers/retailers-partners/index.ts` | ✅ Existing |
| **Admin API** | List all partners, view detail, aggregate stats | `apps/api/src/routes/admin/admin-partners.ts` | ✅ Built (3 endpoints) |
| Admin API | Registered in admin barrel + route aggregator | `apps/api/src/routes/admin/index.ts`, `admin.ts` | ✅ Built |
| **Admin UI** | Partners table, stats cards, detail modal with referrals | `apps/web/src/app/admin/partners/page.tsx` | ✅ Built |
| Admin UI | Sidebar nav entry (Handshake icon) | `apps/web/src/app/admin/components/Sidebar.tsx` | ✅ Built |
| **Mobile UI** | Partners list, create partner modal, delete | `apps/mobile/app/growth/partners.tsx` | ✅ Built |
| Mobile UI | API client (8 methods + 7 types) | `apps/mobile/src/lib/api/growth.ts` | ✅ Built |

**Acceptance:** Retailer adds partner → partner refers customer → commission tracked → admin sees overview.

---

#### Phase 3 — Local Discovery Engine (Geo-search) ✅ Built
> **Source:** Extracted from `services/local-discovery-engine/src/routes/near-me.ts`
> **Commit:** `7efc6db`

| Layer | What | File | Status |
|-------|------|------|--------|
| **Backend** | Near-me geo-search (Haversine + bounding box) | `apps/api/src/routes/public/near-me.ts` | ✅ Built |
| Backend | Register in public routes barrel + aggregator | `apps/api/src/routes/public/index.ts` + `public.ts` | ✅ Built |
| **Admin UI** | Retailer grid with locations, stats, search, storefront links | `apps/web/src/app/admin/discovery/page.tsx` | ✅ Built |
| Sidebar | MapPin icon entry | `apps/web/src/app/admin/components/Sidebar.tsx` | ✅ Built |

**Business logic extracted:** Haversine distance, bounding-box narrowing, retailer location query.
**Acceptance:** Customer web page shows "near me" retailers within radius → admin sees map of all retailer locations.

---

#### Phase 4 — Festival Background Library (Seasonal Campaigns) ✅ Built
> **Source:** New feature building on `studio-shoot` FLUX pipeline
> **Commit:** `7d39d18`

| Layer | What | File | Status |
|-------|------|------|--------|
| Schema | `FestivalBackground` model | `packages/db/prisma/schema.prisma` | ✅ Built |
| Schema | `FESTIVAL_BACKGROUNDS` in `PlanFeatureKey` | `packages/db/prisma/schema.prisma` | ✅ Built |
| Migration | `067_festival_background_library` | `packages/db/prisma/migrations/067_festival_background_library/` | ✅ Created |
| **Backend** | Admin CRUD (list, stats, get, create, update, delete, toggle) | `apps/api/src/routes/admin/admin-festival-backgrounds.ts` | ✅ Built |
| Backend | Register in admin routes + barrel | `apps/api/src/routes/admin/index.ts` + `admin.ts` | ✅ Built |
| **Admin UI** | Grid view, image preview, occasion filters, create/edit modal, stats, top-used | `apps/web/src/app/admin/festival-backgrounds/page.tsx` | ✅ Built |
| Sidebar | Sparkles icon entry | `apps/web/src/app/admin/components/Sidebar.tsx` | ✅ Built |
| **Mobile UI** | Browse backgrounds, filter by occasion, apply to product | `apps/mobile/app/growth/backgrounds.tsx` | ✅ Built |

**Acceptance:** Admin uploads Diwali background → retailer applies to product → customer sees festive product image.
**Note:** Full stack complete — retailer API (list/filter/stats/occasions/apply/poll), mobile screen (grid browse, occasion filters, detail modal, apply-to-product flow), Growth Hub nav entry.

---

#### Phase 5 — AI Social Media Templates ✅ Built
> **Source:** Extracted from `services/social-template/` (orphan)
> **Commit:** `7ea6688`

| Layer | What | File | Status |
|-------|------|------|--------|
| Schema | `SocialTemplate` model + `SocialTemplateType` enum | `packages/db/prisma/schema.prisma` | ✅ Built |
| Schema | `SOCIAL_TEMPLATES` in `PlanFeatureKey` | `packages/db/prisma/schema.prisma` | ✅ Built |
| Migration | `069_social_media_templates` | `packages/db/prisma/migrations/069_social_media_templates/` | ✅ Created |
| **Backend** | Admin CRUD (list, stats, get, update, delete, toggle) | `apps/api/src/routes/admin/admin-social-templates.ts` | ✅ Built |
| Backend | Register in admin routes + barrel | `apps/api/src/routes/admin/index.ts` + `admin.ts` | ✅ Built |
| **Admin UI** | Grid view, type/occasion filters, stats, caption preview, hashtags, detail modal | `apps/web/src/app/admin/social-templates/page.tsx` | ✅ Built |
| Sidebar | Share2 icon entry | `apps/web/src/app/admin/components/Sidebar.tsx` | ✅ Built |
| **Mobile UI** | Generate template from product → preview → share | `apps/mobile/app/growth/templates.tsx` | ✅ Built |

**Depends on:** F-032 AI Studio Shoots (FLUX Kontext) — already live.
**Acceptance:** Retailer selects product → AI generates festive overlay + caption → share to social.
**Note:** Full stack complete — retailer API (CRUD + generate + status poll + use tracking), mobile screen (list, filter, create, generate, edit caption/hashtags, share, copy), Growth Hub nav entry.

---

#### Phase 6 — Automated Lookbook Generator ✅ Built
> **Source:** Extracted from `services/lookbook-generator/` (orphan)
> **Commit:** `4eef171`

| Layer | What | File | Status |
|-------|------|------|--------|
| Schema | `Lookbook` model + `LookbookFormat` + `LookbookStatus` enums | `packages/db/prisma/schema.prisma` | ✅ Built |
| Schema | `LOOKBOOK_GENERATOR` in `PlanFeatureKey` | `packages/db/prisma/schema.prisma` | ✅ Built |
| Migration | `068_lookbook_generator` | `packages/db/prisma/migrations/068_lookbook_generator/` | ✅ Created |
| **Backend** | Admin CRUD (list, stats, get, update, delete, status override) | `apps/api/src/routes/admin/admin-lookbooks.ts` | ✅ Built |
| Backend | Register in admin routes + barrel | `apps/api/src/routes/admin/index.ts` + `admin.ts` | ✅ Built |
| **Admin UI** | Table view, stats, format breakdown, status controls, detail modal, top-viewed | `apps/web/src/app/admin/lookbooks/page.tsx` | ✅ Built |
| Sidebar | BookOpen icon entry | `apps/web/src/app/admin/components/Sidebar.tsx` | ✅ Built |
| **Mobile UI** | Select products → preview lookbook → generate → share | `apps/mobile/app/growth/lookbook.tsx` | ✅ Built |

**Acceptance:** Retailer picks 5 products → AI generates lookbook → export as Instagram carousel or WhatsApp status.
**Note:** Full stack complete — retailer API (CRUD + generate + share + view tracking), mobile screen (list, filter, create, generate, view details, share/copy link), Growth Hub nav entry.

---

#### Phase 7 — Aggregator Sync (Meesho / Instamojo / Glroad / Craftsvilla) ✅ Built
> **Done 2026-08-20.** Schema + migration 070 in working tree.
> **Source:** `services/aggregator-sync/` (1-file orphan) → built clean in `apps/`.

| Layer | What was Built | File | Status |
|-------|---------------|------|--------|
| Schema | `ChannelSync` model | `packages/db/prisma/schema.prisma` | ✅ Built |
| Schema | `ChannelType` enum (MEESHO…OTHER) | `packages/db/prisma/schema.prisma` | ✅ Built |
| Schema | `ChannelSyncStatus` enum | `packages/db/prisma/schema.prisma` | ✅ Built |
| Schema | `CHANNEL_SYNC` in `PlanFeatureKey` | `packages/db/prisma/schema.prisma` | ✅ Built |
| Migration | `070_channel_sync_aggregator` | `packages/db/prisma/migrations/070_channel_sync_aggregator/` | ✅ Created |
| **Backend** | Retailer CRUD + sync trigger + feature gate | `apps/api/src/routes/retailers/retailers-aggregators.ts` | ✅ Built (6 endpoints) |
| Backend | Registered in retailers barrel + aggregator | `apps/api/src/routes/retailers/index.ts` + `retailers.ts` | ✅ Built |
| **Admin API** | List all syncs, view detail, aggregate stats | `apps/api/src/routes/admin/admin-aggregators.ts` | ✅ Built (3 endpoints) |
| Admin API | Registered in admin barrel + aggregator | `apps/api/src/routes/admin/index.ts` + `admin.ts` | ✅ Built |
| **Admin UI** | Stats cards, channel breakdown grid, connections table, detail modal | `apps/web/src/app/admin/aggregators/page.tsx` | ✅ Built |
| Admin UI | Sidebar nav entry (RefreshCw icon) | `apps/web/src/app/admin/components/Sidebar.tsx` | ✅ Built |
| **Mobile UI** | Channel list, connect form, disconnect, trigger sync | `apps/mobile/app/growth/aggregators.tsx` | ✅ Built |
| Mobile UI | Growth hub entry (Link2 icon) | `apps/mobile/app/growth/index.tsx` | ✅ Built |
| Mobile UI | API client (6 methods + 4 types) | `apps/mobile/src/lib/api/growth.ts` | ✅ Built |

**Blocked on:** Real API credentials from Meesho/Instamojo/Glroad/Craftsvilla — sync endpoint marks status CONNECTED and records audit log. Real sync engine (BullMQ job) to be wired when marketplace APIs are integrated.

**Acceptance:** Retailer connects Meesho → status shows Connected → admin sees connection → manual sync available → disconnect removes connection.

---

#### Phase 8 — Wire GST Report Generator ✅ Built
> **Source:** Queries existing Order GST fields (no new schema needed)
> **Commit:** `0a9b8cb`

| Layer | What | File | Status |
|-------|------|------|--------|
| **Backend** | Admin GST API (summary, monthly, by-retailer, transactions) | `apps/api/src/routes/admin/admin-gst.ts` | ✅ Built |
| Backend | Register in admin routes + barrel | `apps/api/src/routes/admin/index.ts` + `admin.ts` | ✅ Built |
| **Admin UI** | Summary cards, monthly bar chart, retailer table, transaction list | `apps/web/src/app/admin/reports/gst/page.tsx` | ✅ Built |
| Sidebar | Receipt icon under Reports group | `apps/web/src/app/admin/components/Sidebar.tsx` | ✅ Built |
| **Retailer API** | GST summary, monthly breakdown, transactions (retailer-scoped) | `apps/api/src/routes/growth/gst.ts` | ✅ Built |
| **Mobile UI** | Summary/transactions tabs, monthly chart, invoice status | `apps/mobile/app/growth/gst.tsx` | ✅ Built |
| Growth Hub | Receipt icon entry | `apps/mobile/app/growth/index.tsx` | ✅ Built |

**Acceptance:** Retailer views own GST summary, monthly trends, transaction history with invoice status.
**Note:** Uses existing Order.gst_amount / Order.gst_invoice_number fields. PDF generation deferred — needs GSTN API credentials.

---

#### Phase 9 — Cleanup ✅ Completed
> **Done 2026-08-20.**

| Action | Target | Status |
|--------|--------|--------|
| Delete orphan stubs | `services/analytics-service/`, `services/auth-service/` | ✅ Deleted |
| Delete dead package | `services/admin-dashboard/` (doesn't exist — confirmed) | ✅ N/A |
| Update docs | `IMPLEMENTATION-STATUS.md` (this file) | ✅ Updated |
| Fold remaining orphans | All 8 orphan dirs deleted (`aggregator-sync`, `facebook-ads`, `gmb-sync`, `google-local-service-ads`, `incentive-engine`, `local-discovery-engine`, `lookbook-generator`, `social-template`) | ✅ Deleted |

---

### 🗓️ Build Order (Priority)

```
Phase 0  ──→  Phase 1  ──→  Phase 2  ──→  Phase 3  ──→  Phase 4
(fix schema)   (incentives)   (partners UI)   (geo-search)   (festivals)
                                                          │
                                                          ▼
Phase 9  ←──  Phase 8  ←──  Phase 7  ←──  Phase 6  ←──  Phase 5
(cleanup)     (GST wire)    (aggregators)  (lookbooks)   (templates)
```

**Rationale:** Phase 0 unblocks everything (schema validation). Phase 1-2 have real code to build on. Phase 3-4 are self-contained. Phase 5-7 need external API creds or AI pipeline. Phase 8-9 are cleanup.

---

### 📁 File Reference — Where Each Feature Lives

#### Backend Routes (`apps/api/src/routes/`)
| Feature | Route File | Status |
|---------|-----------|--------|
| Growth Engine (campaigns, referrals, etc.) | `growth/index.ts` + `growth-*.ts` | ✅ Built |
| Partner Network | `retailers/retailers-partners/index.ts` | ✅ Built (Phase 0+2) |
| Smart Incentive Engine | `growth/growth-incentives.ts` | ✅ Built (Phase 1) |
| Partner Network | `retailers/retailers-partners/index.ts` | ✅ Built (Phase 0) |
| Local Discovery | `public/near-me.ts` | ✅ Built (Phase 3) |
| Festival Backgrounds (admin) | `admin/admin-festival-backgrounds.ts` | ✅ Built (Phase 4) |
| Festival Backgrounds (retailer) | `growth/growth-backgrounds.ts` | ✅ Built (Phase 4 mobile) |
| Social Templates (admin) | `admin/admin-social-templates.ts` | ✅ Built (Phase 5) |
| Social Templates (retailer) | `growth/growth-social-templates.ts` | ✅ Built (Phase 5 mobile) |
| Lookbook Generator (admin) | `admin/admin-lookbooks.ts` | ✅ Built (Phase 6) |
| Lookbook Generator (retailer) | `growth/growth-lookbooks.ts` | ✅ Built (Phase 6 mobile) |
| Aggregator Sync | `retailers/retailers-aggregators.ts` | ✅ Built (Phase 7) |
| GST Reports (admin) | `admin/admin-gst.ts` | ✅ Built (Phase 8) |
| GST Reports (retailer) | `growth/gst.ts` | ✅ Built (Phase 8 mobile) |
| Social Publishing (admin) | `admin/admin-social.ts` | ✅ Built |
| Integrations (retailer) | `retailers/retailers-integrations.ts` | ✅ Built |

#### Admin Dashboard (`apps/web/src/app/admin/`)
| Feature | Page Directory | Status |
|---------|---------------|--------|
| Plan Features | `plan-features/` | ✅ Built |
| Festivals | `festivals/` | ✅ Built |
| Commission | `commission/` | ✅ Built |
| WhatsApp Catalog | `whatsapp-catalog/` | ✅ Built |
| Incentives | `incentives/` | ✅ Built (Phase 1) |
| Partners | `partners/` | ✅ Built (Phase 2) |
| Discovery Map | `discovery/` | ✅ Built (Phase 3) |
| Festival Backgrounds | `festival-backgrounds/` | ✅ Built (Phase 4) |
| Lookbooks | `lookbooks/` | ✅ Built (Phase 6) |
| Social Templates | `social-templates/` | ✅ Built (Phase 5) |
| Aggregators | `aggregators/` | ✅ Built (Phase 7) |
| GST Reports | `reports/gst/` | ✅ Built (Phase 8) |
| Social Publishing | `social/` | ✅ Built |

#### Retailer Mobile App (`apps/mobile/app/growth/`)
| Feature | Screen File | Status |
|---------|------------|--------|
| Growth Hub | `index.tsx` | ✅ Built |
| Campaigns | `campaigns.tsx` | ✅ Built |
| Referrals | `referrals.tsx` | ✅ Built |
| Promotions | `promotions.tsx` | ✅ Built |
| Suppliers | `suppliers.tsx` | ✅ Built |
| Bookings | `bookings.tsx` | ✅ Built |
| Inventory | `inventory.tsx` | ✅ Built |
| Videos | `videos.tsx` | ✅ Built |
| Translate | `translate.tsx` | ✅ Built |
| Incentives | `incentives.tsx` | ✅ Built (Phase 1) |
| Partners | `partners.tsx` | ✅ Built (Phase 2) |
| Templates | `templates.tsx` | ✅ Built (Phase 5) |
| Lookbook | `lookbook.tsx` | ✅ Built (Phase 6) |
| Backgrounds | `backgrounds.tsx` | ✅ Built (Phase 4) |
| GST Report | `gst.tsx` | ✅ Built (Phase 8) |
| Integrations | `integrations.tsx` + `integrations/*.tsx` | ✅ Built |
| Aggregators | `aggregators.tsx` | ✅ Built (Phase 7) |

---

### ⚠️ Blockers & Dependencies

| Blocker | Affects | Resolution |
|---------|---------|-----------|
| ~~`schema.prisma` broken~~ | ~~Phase 0+~~ | ✅ Resolved (Phase 0, commit `b990e64`) |
| No real Meta/Google API creds | GMB, Facebook Ads, Google Ads | Orphan stubs deleted — build clean in `apps/api` when creds available |
| No Meesho/Instamojo API creds | Aggregator Sync | Orphan stub deleted — build clean in `apps/api` when creds available |
| ~~F-032 AI Studio Shoots status~~ | ~~Social Templates (Phase 5)~~ | ✅ Resolved — F-032 Phase A built (FLUX Kontext live) |
| ~~`PARTNER_NETWORK` missing from PlanFeatureKey~~ | ~~Partner Network (Phase 2)~~ | ✅ Resolved (Phase 0, commit `b990e64`) |
| Migrations 066–070 not applied to DB | All Phase 1+8 features | Apply via `npx prisma migrate deploy` or Supabase SQL Editor |
| Partner API route pre-existing errors | `retailers-social.ts`, `products-festival-background.ts` | Pre-existing, not introduced by this work |

---

### 🔧 Remaining Coding Work

| # | What | Layer | Blocked On | Priority |
|---|------|-------|-----------|----------|
| 1 | **Apply migrations 066–071 to production DB** | DevOps | `npx prisma migrate deploy` or Supabase SQL Editor | High |

**Notes:**
- Item 1 is a one-time DB operation, not code.
- GMB, Facebook Ads, and Google Ads are now built with retailer self-service credential configuration (bring-your-own API keys).
- Lookbook HTML/PDF rendering is now implemented (BullMQ job with pdfkit).

---

### 📏 How to Use This File

1. **Before starting any feature:** Check this file's status table
2. **While building:** Follow the exact file paths in the Phase tables
3. **After completing a feature:** Update the status table (Not Built → Built), add the date, update `CLAUDE.md` feature index and `docs/BUILD-LOG.md`
4. **If architecture changes:** Update the "Unified Architecture" section above

**This is the ONLY file to track marketing/sales enablement features.**

---

<!-- source: docs/marketing/marketing-sales-enablement.md -->
## Smart Incentive Engine

**Status:** ❌ **REMOVED 2026-08-31** (`chore/remove-unwanted-features`, migration `082`). Was an orphan stub; its `incentive_rules` table and `INCENTIVE_ENGINE` plan row were dropped and the feature is no longer a target. The rest of this section is kept as the historical design record only. *(Corrected 2026-09-23 — previously "🔴 Not Built — orphan stub".)*  
**Plan:** Phase 1 of `docs/marketing/marketing-sales-enablement.md`  
**Date:** 2026-08-20

---

### What Exists (Unreachable)
- `services/incentive-engine/src/routes/incentive-rules.ts` — IncentiveRule CRUD (Prisma queries, validation, soft-delete)
- `services/incentive-engine/src/routes/visits.ts` — CustomerVisit tracking
- `services/incentive-engine/src/incentive-engine.ts` — Standalone Fastify server on port 3001 (never deployed)

**None of this is reachable** — not in pnpm workspace, not referenced from `apps/api`.

### What Needs Building (Phase 1)

#### Backend
- `apps/api/src/routes/growth/growth-incentives.ts` — Fold incentive-engine CRUD logic into existing growth routes pattern
  - POST /growth/incentives/rules — create incentive rule
  - GET /growth/incentives/rules — list rules
  - PUT /growth/incentives/rules/:id — update rule
  - DELETE /growth/incentives/rules/:id — soft-delete
  - POST /growth/incentives/check — evaluate applicable incentives for customer
  - POST /growth/incentives/visits — record customer visit

#### Admin UI
- `apps/web/src/app/admin/incentives/page.tsx` — Rules list, create/edit, analytics

#### Mobile UI
- `apps/mobile/app/growth/incentives.tsx` — Retailer manages rules, views stats

#### Schema
- `IncentiveRule` model in `packages/db/prisma/schema.prisma`
- `CustomerVisit` model in `packages/db/prisma/schema.prisma`
- `INCETIVE_ENGINE` in `PlanFeatureKey` enum

### Business Logic to Extract
- Trigger evaluation: FIRST_VISIT (visitCount === 0), BIRTHDAY (needs customer DOB), LOYALTY_TIER (spend/visit thresholds)
- Discount application: PERCENT (capped at 100) or FIXED_AMOUNT (capped at subtotal)
- Date range validation: starts_at/ends_at overlap check

### ROI Metrics
- ₹200-300 avg. uplift per new customer
- 3x likelihood of second visit
- 35% increase in first-time visitor conversion

---

<!-- source: docs/marketing/marketing-sales-enablement.md -->
## Local Discovery Engine

**Status:** ✅ Built — folded into `apps/` architecture  
**Plan:** Phase 3 of `docs/marketing/marketing-sales-enablement.md`  
**Commit:** `7efc6db`  
**Date:** 2026-08-20

---

### What Was Built

#### Backend
- `apps/api/src/routes/public/near-me.ts` — Public geo-search endpoint
  - GET /v1/near-me?latitude=&longitude=&radius= — find nearby retailers
  - Uses Haversine formula + bounding box optimization (extracted from orphan)
  - Retailers filtered by `is_suspended: false`, `deleted_at: null`
- Registered in `apps/api/src/routes/public/index.ts` barrel + `public.ts` aggregator

#### Admin UI
- `apps/web/src/app/admin/discovery/page.tsx` — Retailer grid with locations, stats, search, storefront links
- Sidebar entry (MapPin icon) in `apps/web/src/app/admin/components/Sidebar.tsx`

### Business Logic Extracted
- `getBoundingBox(lat, lng, radiusKm)` → narrowing query for Prisma
- `haversineDistance(lat1, lon1, lat2, lon2)` → exact distance filter
- Retailer location query with `latitude`/`longitude` bounds

### ROI Metrics
- +15% footfall from local searches
- +10% sales from geo-targeted offers
- 30% increase in "near me" search impressions

---

<!-- source: docs/marketing/marketing-sales-enablement.md -->
## AI-Driven Social Media Templates

**Status:** ✅ **BUILT** — superseded by the post-template system. `SocialTemplate` + `PostTemplate` models, migration `091_post_templates`, admin CRUD (`routes/admin/admin-social-templates.ts`, `routes/admin/admin-post-templates.ts`), retailer read (`routes/post-templates.ts`), and admin screens `/admin/social-templates` + `/admin/post-templates`. *(Corrected 2026-09-23 — previously "🔴 Not Built — orphan stub in `services/social-template/`", which no longer exists.)*  
**Plan:** Phase 5 of `docs/marketing/marketing-sales-enablement.md`  
**Date:** 2026-08-20

---

### What Exists (Unreachable)
- `services/social-template/src/social-template.ts` — Standalone Fastify server with placeholder OpenAI API config

**None of this is reachable** — not in pnpm workspace, not referenced from `apps/api`.

### Dependency
- F-032 AI Studio Shoots (FLUX Kontext template backgrounds) must be live first

### What Needs Building (Phase 5)
- `apps/api/src/routes/growth/growth-templates.ts` — Template generation using existing studio-shoot FLUX
- `apps/mobile/app/growth/templates.tsx` — Retailer generates and shares templates

### ROI Metrics
- 5 hrs/week saved on content creation
- 15-20% higher CTR on promotions
- 2x engagement rate on templated posts

---

<!-- source: docs/marketing/marketing-sales-enablement.md -->
## Automated Festival Background Library

**Status:** 🔴 Not Built — doc-only spec, no code exists. The IMPLEMENTATION-STATUS.md previously claimed this was part of `services/photo-cleanup/` but that's a different feature (mannequin removal).  
**Plan:** Phase 4 of `docs/marketing/marketing-sales-enablement.md`  
**Date:** 2026-08-20

---

### What Exists
- `services/photo-cleanup/` — Mannequin removal + LaMa inpainting (different feature, not festival backgrounds)
- Existing `studio-shoot` FLUX pipeline (F-032) can generate backgrounds

### What Needs Building (Phase 4)
- `FestivalBackground` DB model (occasion, image_url, season, is_active, valid_from, valid_to)
- `FESTIVAL_BACKGROUNDS` in `PlanFeatureKey`
- `apps/api/src/routes/admin/admin-festival-backgrounds.ts` — CRUD + apply-to-product
- `apps/web/src/app/admin/festival-backgrounds/page.tsx` — Upload, preview, seasonal rotation

### ROI Metrics
- Diwali/Wedding season sales uplift of 20-30%
- Reduced dependency on photographers
- 70% faster seasonal campaign launch

---

<!-- source: docs/marketing/marketing-sales-enablement.md -->
## Automated Lookbook Generator

**Status:** 🔴 Not Built — orphan stub in `services/lookbook-generator/`, not wired into any app.  
**Plan:** Phase 6 of `docs/marketing/marketing-sales-enablement.md`  
**Date:** 2026-08-20

---

### What Exists (Unreachable)
- `services/lookbook-generator/src/lookbook-generator.ts` — Minimal HTML lookbook generation with basic product info. Standalone Fastify server.

**None of this is reachable** — not in pnpm workspace, not referenced from `apps/api`.

### What Needs Building (Phase 6)
- `apps/api/src/routes/growth/growth-lookbook.ts` — Select 3-5 products → generate coordinated lookbook
- `Lookbook` DB model (retailer_id, product_ids, output_url, format, created_at)
- `apps/mobile/app/growth/lookbook.tsx` — Retailer selects products, previews, exports

### ROI Metrics
- ₹150-250 AOV increase
- 1.5x cross-sell success rate
- 25% increase in average order value

---

<!-- source: docs/marketing/marketing-sales-enablement.md -->
## Aggregator & Marketplace Sync

**Status:** ✅ **BUILT** — no longer a stub. `ChannelSync` model + migration `070_channel_sync_aggregator`, retailer API (`routes/retailers/retailers-aggregators.ts`), admin API (`routes/admin/admin-aggregators.ts`), mobile screen (`apps/mobile/app/growth/aggregators.tsx`) and admin page (`/admin/aggregators`). *(Corrected 2026-09-23 — previously "🔴 Not Built — 1-file orphan stub in `services/aggregator-sync/` with mock data", which no longer exists.)*  
**Plan:** Phase 7 of `docs/marketing/marketing-sales-enablement.md`  
**Date:** 2026-08-20

---

### What Exists (Unreachable)
- `services/aggregator-sync/src/aggregator-sync.ts` — Single file with mock API clients for Meesho, Instamojo, Glroad, Craftsvilla. All returning placeholder data. No real HTTP calls. Standalone Fastify server on its own port.

**None of this is reachable** — not in pnpm workspace, not referenced from `apps/api`.

### Blockers
- No real API credentials from Meesho/Instamojo/Glroad/Craftsvilla
- No evidence any pilot retailer sells on these channels yet

### What Needs Building (Phase 7)
- `apps/api/src/routes/retailers/retailers-aggregators.ts` — Channel adapter pattern
- `ChannelSync` DB model (retailer_id, channel, api_key_encrypted, sync_status, last_synced_at)
- `CHANNEL_SYNC` in `PlanFeatureKey`
- Admin UI for sync status + order aggregation
- Mobile UI for channel connection + order management

### ROI Metrics
- 5-10 hrs/week saved on manual inventory updates
- 15-20% sales increase from multi-channel presence
- Near-zero overselling incidents

---

<!-- source: docs/marketing/marketing-sales-enablement.md -->
## Partner Network Manager

**Status:** ❌ **REMOVED 2026-08-31** (`chore/remove-unwanted-features`, migration `082`) — built 2026-08-20 (migration `066`), then deleted in full: tables `partners`/`partner_referrals`/`partner_events`, enums `PartnerType`/`CommissionType`/`PartnerReferralStatus`, the `retailers-partners/` API dir, `admin-partners.ts`, web `admin/partners/`, and mobile `app/growth/partners.tsx`. *(Corrected 2026-09-23 — previously "🟡 Partial — … schema.prisma has broken inline enum syntax blocking `npx prisma validate`". That blocker is gone: `npx prisma validate` passes today. Note the dead enum value `PlanFeatureKey.PARTNER_NETWORK` is intentionally retained — see the note at the foot of migration `082`.)*  
**Plan:** Phase 0 (fix schema) + Phase 2 (build UI) of `docs/marketing/marketing-sales-enablement.md`  
**Date:** 2026-08-20

---

### What Exists (Partially Reachable)
- `apps/api/src/routes/retailers/retailers-partners/index.ts` — Full CRUD:
  - GET /retailers/me/partners — list partners
  - POST /retailers/me/partners — create partner
  - PUT /retailers/me/partners/:id — update partner
  - DELETE /retailers/me/partners/:id — deactivate partner
  - GET /retailers/me/partners/:id/referrals — get partner referrals
  - POST /retailers/me/partners/referrals/:id/pay — mark commission as paid
  - GET /retailers/me/partners/events — list events
  - POST /retailers/me/partners/events — create event
  - PUT /retailers/me/partners/events/:id — update event
  - DELETE /retailers/me/partners/events/:id — delete event

**BLOCKED:** `schema.prisma` has `Partner.commission_type` and `PartnerReferral.status` as inline enums (invalid Prisma syntax). `npx prisma validate` fails. `PARTNER_NETWORK` is missing from `PlanFeatureKey` enum.

### What Needs Building

#### Phase 0 (Prerequisite)
- Fix inline enums → proper Prisma enums (`PartnerType`, `CommissionType`, `PartnerReferralStatus`)
- Add `PARTNER_NETWORK` to `PlanFeatureKey`
- Create migration

#### Phase 2 (UI)
- `apps/web/src/app/admin/partners/page.tsx` — Admin partner overview
- `apps/mobile/app/growth/partners.tsx` — Retailer partner management

### ROI Metrics
- ₹500-1000 avg. referral value
- 2x repeat rate from partner leads
- 25% reduction in CAC via referrals

---

<!-- source: docs/marketing/marketing-sales-enablement.md -->
## Direct Social Publishing

**Status:** ✅ **BUILT — phases 1–2 plus the full create-post composer.** Facebook Page + Instagram connect and posting, multi-target fan-out (`POST /v1/retailers/me/social/posts`), carousel/link/photo/video post types, post + campaign templates, Caption AI, and five entry points. Migrations `090`–`092` applied in prod — see `tasks/done/social-create-post-composer.md` and `CLAUDE.md` row 64. **Still not built:** Instagram Reels *scheduling*, WhatsApp Catalog broadcast analytics, and native F-035 managed sending (`tasks/pending/whatsapp-managed-sending.md`). *(Corrected 2026-09-23 — previously "🟡 Partial — Phase 1 built", which predates the composer.)*  
**Plan:** Leverages existing F-031 infrastructure. Extension is future work.  
**Date:** 2026-08-20

---

### What Exists (Real)
- F-031 Social Media Publishing Phase 1 — Facebook Page connect + post (built 2026-08-13)
- `apps/api/src/routes/retailers/retailers-social.ts` — Facebook Page OAuth + post creation
- `apps/api/src/lib/meta-graph.ts` — Meta Graph API client

### What's NOT Built
- Instagram Reels scheduling (via Meta Graph API)
- WhatsApp Catalog broadcast analytics
- `social-scheduler` table for queued posts
- Post-publish analytics webhook (impressions, engagement)

### ROI Metrics
- 3x more consistent social presence
- 20% higher follower growth
- 60% faster campaign execution

---

<!-- source: docs/marketing/marketing-sales-enablement.md -->
## Google My Business Integration

**Status:** ✅ **BUILT** (bring-your-own-key) — no longer a stub. `POST/DELETE /me/integrations/gmb`, plus `/me/integrations/gmb/test` and `/me/integrations/gmb/post` in `apps/api/src/routes/retailers/retailers-integrations.ts`; mobile screen `apps/mobile/app/growth/integrations/gmb.tsx`. The retailer supplies their own Google credentials, so this is **not** blocked on Kanchuki obtaining Google API access. *(Corrected 2026-09-23.)*  
**Plan:** Deferred until Google API access is approved (F-022 in CLAUDE.md).  
**Date:** 2026-08-20

---

### What Exists (Unreachable)
- `services/gmb-sync/src/gmb-sync.ts` — Standalone Fastify server with placeholder Google API config
- `services/gmb-sync/src/routes/gmb.ts` — Placeholder webhook and management routes

**None of this is reachable** — not in pnpm workspace, not referenced from `apps/api`.

### Blockers
- Google Business Profile API access approval required (unpredictable timeline)
- No real Google API credentials available
- F-022 in CLAUDE.md is marked "Planned (blocked on Google API access)"

### What Needs Building (When API Access Approved)
- Retailer OAuth-connects Google Business Profile
- Auto-post new arrivals via `localPosts.create`
- Review monitoring & response templates
- Q&A management

### ROI Metrics
- 25% higher footfall from Google Maps
- Improved local search ranking
- 40% increase in direction requests

---

<!-- source: docs/marketing/marketing-sales-enablement.md -->
## Facebook Local Awareness Ads

**Status:** ✅ **BUILT** (bring-your-own-key) — no longer a stub. `POST/DELETE /me/integrations/fb-ads`, plus `/me/integrations/fb-ads/test` and `/me/integrations/fb-ads/create-campaign` in `apps/api/src/routes/retailers/retailers-integrations.ts`; mobile screen `apps/mobile/app/growth/integrations/fb-ads.tsx`. The retailer supplies their own Meta credentials, so this is **not** blocked on Kanchuki obtaining Marketing API access. *(Corrected 2026-09-23.)*  
**Plan:** Deferred until Meta Marketing API credentials are available.  
**Date:** 2026-08-20

---

### What Exists (Unreachable)
- `services/facebook-ads/src/facebook-ads.ts` — Standalone Fastify server with placeholder Meta API config (port 3007)

**None of this is reachable** — not in pnpm workspace, not referenced from `apps/api`.

### Blockers
- No Meta Marketing API credentials
- Requires Facebook Business Manager access

### What Needs Building (When API Access Available)
- Radius-based ad campaigns (5km/10km)
- A/B test creative (product vs. lifestyle)
- Budget pacing alerts
- Retailer dashboard for ad management

### ROI Metrics
- ₹15-20 CPL (vs. ₹40-50 for broad targeting)
- 10-15% sales lift from ad-driven footfall
- 30% lower CPL vs. broad targeting

---

<!-- source: docs/marketing/marketing-sales-enablement.md -->
## Google Local Service Ads

**Status:** ✅ **BUILT** (bring-your-own-key) — no longer a stub. `POST/DELETE /me/integrations/google-ads`, plus `/me/integrations/google-ads/test` in `apps/api/src/routes/retailers/retailers-integrations.ts`; mobile screen `apps/mobile/app/growth/integrations/google-ads.tsx`. The retailer supplies their own Google Ads credentials, so this is **not** blocked on Kanchuki obtaining Google Ads API access. *(Corrected 2026-09-23.)*  
**Plan:** Deferred until Google Ads API credentials are available. Lowest priority for clothing retailers.  
**Date:** 2026-08-20

---

### What Exists (Unreachable)
- `services/google-local-service-ads/src/google-local-service-ads.ts` — Standalone Fastify server with placeholder Google Ads API config

**None of this is reachable** — not in pnpm workspace, not referenced from `apps/api`.

### Blockers
- No Google Ads API credentials
- Niche feature for clothing retailers (more relevant for service businesses)

### What Needs Building (When API Access Available)
- Service-based ad management (e.g., "alteration services near me")
- Lead tracking & follow-up reminders
- SMS/email alerts for new leads

### ROI Metrics
- Medium impact for service add-ons
- Lead tracking for appointment booking
