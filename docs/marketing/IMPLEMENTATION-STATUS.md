# Marketing & Sales Enablement — Implementation Status & Development Plan

**Last updated:** 2026-08-20 (updated after Phase 5+6 mobile screens + Phase 9 orphan cleanup)  
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

**`services/` directory:** All orphan standalone Fastify servers were deleted (Phase 9, 2026-08-20). Remaining `services/` dirs (`fashion-vtone`, `photo-cleanup`, `training`) are active support services, not orphan stubs.

---

## 📊 Honest Status Summary

| # | Feature | Real Code Exists? | API Route | Admin UI | Mobile UI | Plan Gate | Overall |
|---|---------|-------------------|-----------|----------|-----------|-----------|---------|
| 1 | Smart Incentive Engine | ✅ Folded into apps/ | ✅ | ✅ | ✅ | ✅ | **Built** |
| 2 | Local Discovery Engine | ✅ Folded into apps/ | ✅ | ✅ | ❌ | ❌ | **Built** |
| 3 | GMB Integration | ❌ No code (orphan deleted) | ❌ | ❌ | ❌ | ❌ | **Not Built** |
| 4 | AI Social Media Templates | ✅ Full stack | ✅ | ✅ | ✅ | ✅ | **Built** |
| 5 | Direct Social Publishing | ✅ Full stack | ✅ | ✅ | ✅ | ✅ | **Built** |
| 6 | Festival Background Library | ✅ Full stack | ✅ | ✅ | ✅ | ✅ | **Built** |
| 7 | Partner Network Manager | ✅ Full stack | ✅ | ✅ | ✅ | ✅ | **Built** |
| 8 | Aggregator Sync | ✅ Full stack | ✅ | ✅ | ✅ | ✅ | **Built** |
| 9 | Lookbook Generator | ✅ Full stack | ✅ | ✅ | ✅ | ✅ | **Built** |
| 10 | Facebook Local Awareness Ads | ❌ No code (orphan deleted) | ❌ | ❌ | ❌ | ❌ | **Not Built** |
| 11 | Google Local Service Ads | ❌ No code (orphan deleted) | ❌ | ❌ | ❌ | ❌ | **Not Built** |
| 12 | GST Report Generator | ✅ Full stack | ✅ | ✅ | ✅ | ✅ | **Built** |

**Legend:** ✅ = real, wired, reachable | ⚠️ = code exists but unreachable (orphan in `services/`) | ❌ = not built

---

## 🔍 Orphan Service Audit (What's in `services/`)

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
| **Mobile UI** | Browse backgrounds, filter by occasion, apply to product | `apps/mobile/app/growth/backgrounds.tsx` | ✅ Built |

**Acceptance:** Admin uploads Diwali background → retailer applies to product → customer sees festive product image.
**Note:** Full stack complete — retailer API (list/filter/stats/occasions/apply/poll), mobile screen (grid browse, occasion filters, detail modal, apply-to-product flow), Growth Hub nav entry.

---

### Phase 5 — AI Social Media Templates ✅ Built
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
| **Mobile UI** | Select products → preview lookbook → generate → share | `apps/mobile/app/growth/lookbook.tsx` | ✅ Built |

**Acceptance:** Retailer picks 5 products → AI generates lookbook → export as Instagram carousel or WhatsApp status.
**Note:** Full stack complete — retailer API (CRUD + generate + share + view tracking), mobile screen (list, filter, create, generate, view details, share/copy link), Growth Hub nav entry.

---

### Phase 7 — Aggregator Sync (Meesho / Instamojo / Glroad / Craftsvilla) ✅ Built
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

### Phase 8 — Wire GST Report Generator ✅ Built
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

### Phase 9 — Cleanup ✅ Completed
> **Done 2026-08-20.**

| Action | Target | Status |
|--------|--------|--------|
| Delete orphan stubs | `services/analytics-service/`, `services/auth-service/` | ✅ Deleted |
| Delete dead package | `services/admin-dashboard/` (doesn't exist — confirmed) | ✅ N/A |
| Update docs | `IMPLEMENTATION-STATUS.md` (this file) | ✅ Updated |
| Fold remaining orphans | All 8 orphan dirs deleted (`aggregator-sync`, `facebook-ads`, `gmb-sync`, `google-local-service-ads`, `incentive-engine`, `local-discovery-engine`, `lookbook-generator`, `social-template`) | ✅ Deleted |

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
| Social Templates | `social-templates/` | ✅ Built (Phase 5) |
| Aggregators | `aggregators/` | ✅ Built (Phase 7) |
| GST Reports | `reports/gst/` | ✅ Built (Phase 8) |
| Social Publishing | `social/` | ✅ Built |

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
| Incentives | `incentives.tsx` | ✅ Built (Phase 1) |
| Partners | `partners.tsx` | ✅ Built (Phase 2) |
| Templates | `templates.tsx` | ✅ Built (Phase 5) |
| Lookbook | `lookbook.tsx` | ✅ Built (Phase 6) |
| Backgrounds | `backgrounds.tsx` | ✅ Built (Phase 4) |
| GST Report | `gst.tsx` | ✅ Built (Phase 8) |
| Aggregators | `aggregators.tsx` | ✅ Built (Phase 7) |

---

## ⚠️ Blockers & Dependencies

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

## 🔧 Remaining Coding Work

| # | What | Layer | Blocked On | Priority |
|---|------|-------|-----------|----------|
| 1 | **GMB Integration** — auto-post new arrivals to Google Business Profile | Full stack | Google API credentials + OAuth setup | Deferred |
| 2 | **Facebook Local Awareness Ads** — create/manage local ad campaigns | Full stack | Meta Marketing API credentials | Deferred |
| 3 | **Google Local Service Ads** — manage LSA campaigns | Full stack | Google Ads API credentials | Deferred |
| 4 | **Apply migrations 066–070 to production DB** | DevOps | `npx prisma migrate deploy` or Supabase SQL Editor | High |
| 5 | **Lookbook generation backend** — actual HTML/PDF rendering (BullMQ job) | Backend | FLUX or HTML template engine; current code marks as GENERATING but doesn't render | Medium |

**Notes:**
- Items 1–3 need third-party API credentials before any code can be written.
- Item 4 is a one-time DB operation, not code.
- Item 5 is the actual rendering engine for lookbooks — the API shell is built but the BullMQ worker that renders HTML/PDF is a follow-up.

---

## 📏 How to Use This File

1. **Before starting any feature:** Check this file's status table
2. **While building:** Follow the exact file paths in the Phase tables
3. **After completing a feature:** Update the status table (Not Built → Built), add the date, update `CLAUDE.md` feature index and `docs/BUILD-LOG.md`
4. **If architecture changes:** Update the "Unified Architecture" section above

**This is the ONLY file to track marketing/sales enablement features.**
