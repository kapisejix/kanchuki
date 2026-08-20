# Marketing & Sales Enablement — Implementation Status & Development Plan

**Last updated:** 2026-08-20  
**File purpose:** Single source of truth for all marketing/sales enablement features. Track everything here.  
**Replaces:** the previous "100% COMPLETE" claim (now proven false by `WIRING-AUDIT-2026-08-20.md`).

---

## 🏗️ Unified Architecture (One Pattern for All Features)

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

**What does NOT belong in `apps/`:** The `services/` directory contains orphan standalone Fastify servers. They are NOT in `pnpm-workspace.yaml`, NOT in `turbo.json`, NOT referenced from any real app. They contain useful business logic to extract, but must be folded into `apps/api/src/routes/` — not deployed separately.

---

## 📊 Honest Status Summary

| # | Feature | Real Code Exists? | API Route | Admin UI | Mobile UI | Plan Gate | Overall |
|---|---------|-------------------|-----------|----------|-----------|-----------|---------|
| 1 | Smart Incentive Engine | ✅ Folded into apps/ | ✅ | ✅ | ✅ | ✅ | **Built** |
| 2 | Local Discovery Engine | ✅ Folded into apps/ | ✅ | ✅ | ❌ | ❌ | **Built** |
| 3 | GMB Integration | ⚠️ Orphan stub | ❌ | ❌ | ❌ | ❌ | **Not Built** |
| 4 | AI Social Media Templates | ⚠️ Orphan stub | ❌ | ❌ | ❌ | ❌ | **Not Built** |
| 5 | Direct Social Publishing | ✅ F-031 exists | ✅ | ❌ | ❌ | ✅ | **Partial** |
| 6 | Festival Background Library | ✅ Folded into apps/ | ✅ | ✅ | ❌ | 🕐 | **Built** |
| 7 | Partner Network Manager | ✅ API route exists | ✅ | ✅ | ✅ | ✅ | **Built** |
| 8 | Aggregator Sync | ⚠️ 1-file orphan | ❌ | ❌ | ❌ | ❌ | **Not Built** |
| 9 | Lookbook Generator | ✅ Folded into apps/ | ✅ | ✅ | ❌ | 🕐 | **Built** |
| 10 | Facebook Local Awareness Ads | ⚠️ Orphan stub | ❌ | ❌ | ❌ | ❌ | **Not Built** |
| 11 | Google Local Service Ads | ⚠️ Orphan stub | ❌ | ❌ | ❌ | ❌ | **Not Built** |
| 12 | GST Report Generator | ✅ Package exists | ❌ | ❌ | ❌ | ❌ | **Partial** |

**Legend:** ✅ = real, wired, reachable | ⚠️ = code exists but unreachable (orphan in `services/`) | ❌ = not built

---

## 🔍 Orphan Service Audit (What's in `services/`)

| Service | Location | Usable Code | Reuse Strategy |
|---------|----------|-------------|----------------|
| incentive-engine | `services/incentive-engine/src/routes/` | IncentiveRule CRUD, CustomerVisit tracking, loyalty evaluation | → `apps/api/src/routes/growth/growth-incentives.ts` |
| local-discovery-engine | `services/local-discovery-engine/src/routes/near-me.ts` | Haversine distance, bounding box geo-query | → `apps/api/src/routes/public/near-me.ts` |
| gmb-sync | `services/gmb-sync/src/` | Placeholder only — needs real Google API creds | Build clean when creds available |
| social-template | `services/social-template/src/` | Placeholder only — needs real API creds | Build clean when creds available |
| aggregator-sync | `services/aggregator-sync/src/` | Mock data, 1 file | Build clean when retailer needs it |
| facebook-ads | `services/facebook-ads/src/` | Placeholder — needs Meta Marketing API creds | Build clean when creds available |
| google-local-service-ads | `services/google-local-service-ads/src/` | Placeholder — needs Google Ads API creds | Build clean when creds available |
| lookbook-generator | `services/lookbook-generator/src/` | Minimal HTML generation | → `apps/api/src/routes/growth/growth-lookbook.ts` |
| analytics-service | `services/analytics-service/src/` | Scaffold only | Duplicate of existing admin activity tracking |
| auth-service | `services/auth-service/src/` | Scaffold only | Duplicate of existing `apps/api` auth middleware |

**Delete after folding:** `services/analytics-service/`, `services/auth-service/` (duplicates of existing `apps/api` functionality).

---

## 📋 Development Phases

### Phase 0 — Fix Partner Network Schema ✅ Completed
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

### Phase 1 — Smart Incentive Engine ✅ Completed
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

### Phase 2 — Partner Network Manager ✅ Completed
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

### Phase 3 — Local Discovery Engine (Geo-search) ✅ Built
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

### Phase 4 — Festival Background Library (Seasonal Campaigns) ✅ Built
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
| **Mobile UI** | Retailer picks background for their products | `apps/mobile/app/growth/backgrounds.tsx` | 🕐 Deferred |

**Acceptance:** Admin uploads Diwali background → retailer applies to product → customer sees festive product image.
**Note:** Retailer-facing apply endpoint already exists at `products-festival-background.ts`. Mobile UI deferred — admin curation layer is complete.

---

### Phase 5 — AI Social Media Templates
> **Source:** `services/social-template/` (orphan, placeholder — build clean)

| Layer | What to Build | File |
|-------|--------------|------|
| Schema | `SocialTemplate` model (product_id, template_type, image_url, caption, overlay_festival, created_at) | `packages/db/prisma/schema.prisma` |
| **Backend** | Template generation (uses existing studio-shoot FLUX) + caption generation | `apps/api/src/routes/growth/growth-templates.ts` |
| Backend | Register in growth routes | `apps/api/src/routes/growth/index.ts` |
| **Mobile UI** | Generate template from product → preview → share to WhatsApp/Instagram | `apps/mobile/app/growth/templates.tsx` |

**Depends on:** F-032 AI Studio Shoots (FLUX Kontext) being live.

**Acceptance:** Retailer selects product → AI generates festive overlay + caption → share to social.

---

### Phase 6 — Automated Lookbook Generator ✅ Built
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
| **Mobile UI** | Select products → preview lookbook → export | `apps/mobile/app/growth/lookbook.tsx` | 🕐 Deferred |

**Acceptance:** Retailer picks 5 products → AI generates lookbook → export as Instagram carousel or WhatsApp status.
**Note:** Admin management layer complete. Mobile UI + AI generation deferred — needs FLUX pipeline integration.

---

### Phase 7 — Aggregator Sync (Meesho / Instamojo / Glroad / Craftsvilla)
> **Source:** `services/aggregator-sync/` (1-file orphan with mock data — build clean)

| Layer | What to Build | File |
|-------|--------------|------|
| Schema | `ChannelSync` model (retailer_id, channel, api_key_encrypted, sync_status, last_synced_at) | `packages/db/prisma/schema.prisma` |
| Schema | `CHANNEL_SYNC` in `PlanFeatureKey` | `packages/db/prisma/schema.prisma` |
| **Backend** | Channel adapter pattern (product mapper, inventory sync, order hub) | `apps/api/src/routes/retailers/retailers-aggregators.ts` |
| Backend | Register in retailers routes | `apps/api/src/routes/retailers/index.ts` |
| **Admin UI** | Sync status per retailer, channel health, order aggregation | `apps/web/src/app/admin/aggregators/page.tsx` |
| **Mobile UI** | Connect channel, view synced products, manage orders | `apps/mobile/app/growth/aggregators.tsx` |

**Blocked on:** Real API credentials from Meesho/Instamojo/Glroad/Craftsvilla. Build adapter pattern now, swap in real APIs later.

**Acceptance:** Retailer connects Meesho → products sync → orders appear in Kanchuki → inventory stays in sync.

---

### Phase 8 — Wire GST Report Generator
> **Source:** `packages/gst-report-generator/` (exists in workspace, never imported)

| Layer | What to Build | File |
|-------|--------------|------|
| Backend | Wire into existing invoice system | `apps/api/src/lib/invoice.ts` (extend) |
| Backend | Admin endpoint for GST report download | `apps/api/src/routes/admin/admin-gst.ts` |
| **Admin UI** | GST report download page (GSTR-3B format) | `apps/web/src/app/admin/reports/gst/page.tsx` |

**Acceptance:** Admin downloads GSTR-3B PDF with correct tax breakdown per retailer.

---

### Phase 9 — Cleanup
| Action | Target |
|--------|--------|
| Delete orphan stubs | `services/analytics-service/`, `services/auth-service/` (duplicates of existing `apps/api`) |
| Delete dead package | `services/admin-dashboard/` if it exists (empty, untracked) |
| Update docs | `IMPLEMENTATION-STATUS.md` (this file), `CLAUDE.md` feature index, `docs/PLAN.md` |
| Fold remaining orphans | Extract usable logic from other `services/` before deleting |

---

## 🗓️ Build Order (Priority)

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

## 📁 File Reference — Where Each Feature Lives

### Backend Routes (`apps/api/src/routes/`)
| Feature | Route File | Status |
|---------|-----------|--------|
| Growth Engine (campaigns, referrals, etc.) | `growth/index.ts` + `growth-*.ts` | ✅ Built |
| Partner Network | `retailers/retailers-partners/index.ts` | ✅ Built (Phase 0+2) |
| Smart Incentive Engine | `growth/growth-incentives.ts` | ✅ Built (Phase 1) |
| Partner Network | `retailers/retailers-partners/index.ts` | ✅ Built (Phase 0) |
| Local Discovery | `public/near-me.ts` | ✅ Built (Phase 3) |
| Festival Backgrounds | `admin/admin-festival-backgrounds.ts` | ✅ Built (Phase 4) |
| Social Templates | `growth/growth-templates.ts` | 🔴 To build (Phase 5) |
| Lookbook Generator | `admin/admin-lookbooks.ts` | ✅ Built (Phase 6) |
| Aggregator Sync | `retailers/retailers-aggregators.ts` | 🔴 To build (Phase 7) |
| GST Reports | `admin/admin-gst.ts` | 🔴 To build (Phase 8) |

### Admin Dashboard (`apps/web/src/app/admin/`)
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
| Aggregators | `aggregators/` | 🔴 To build (Phase 7) |
| GST Reports | `reports/gst/` | 🔴 To build (Phase 8) |

### Retailer Mobile App (`apps/mobile/app/growth/`)
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
| Incentives | `incentives.tsx` | 🔴 To build (Phase 1) |
| Partners | `partners.tsx` | ✅ Built (Phase 2) |
| Templates | `templates.tsx` | 🔴 To build (Phase 5) |
| Lookbook | `lookbook.tsx` | 🔴 To build (Phase 6) |
| Aggregators | `aggregators.tsx` | 🔴 To build (Phase 7) |

---

## ⚠️ Blockers & Dependencies

| Blocker | Affects | Resolution |
|---------|---------|-----------|
| ~~`schema.prisma` broken~~ | ~~Phase 0+~~ | ✅ Resolved (Phase 0, commit `b990e64`) |
| No real Meta/Google API creds | GMB (Phase 3b), Facebook Ads, Google Ads | Build adapter pattern, swap creds later |
| No Meesho/Instamojo API creds | Aggregator Sync (Phase 7) | Build adapter pattern, swap creds later |
| F-032 AI Studio Shoots status | Social Templates (Phase 5) | Check if FLUX Kontext is live |
| ~~`PARTNER_NETWORK` missing from PlanFeatureKey~~ | ~~Partner Network (Phase 2)~~ | ✅ Resolved (Phase 0, commit `b990e64`) |
| Migration 066 not applied to DB | All Phase 1+2 features | Apply via `npx prisma migrate deploy` or Supabase SQL Editor |
| Partner API route pre-existing errors | `retailers-social.ts`, `products-festival-background.ts` | Pre-existing, not introduced by this work |

---

## 📏 How to Use This File

1. **Before starting any feature:** Check this file's status table
2. **While building:** Follow the exact file paths in the Phase tables
3. **After completing a feature:** Update the status table (Not Built → Built), add the date, update `CLAUDE.md` feature index and `docs/BUILD-LOG.md`
4. **If architecture changes:** Update the "Unified Architecture" section above

**This is the ONLY file to track marketing/sales enablement features.**
