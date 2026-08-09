# Kanchuki — Project Roadmap & Build Plan

**Version:** 1.1  
**Date:** July 2026  
**Total Timeline:** 18 months (MVP → Full Platform)

---

## Phase Overview

```
Phase 0: MVP           Month 1–4    Digitize store + WhatsApp collections
Phase 0.5: Internal Team  (post-MVP)  Admin/marketing/support staff logins + territory routing
Phase S: Security       Month 4–5    Governance, backup DB, admin control center  ← NEW
Phase 1: AI Core       Month 5–8    Fashion DNA + Virtual Try-On
Phase 2: B2B Network   Month 9–12   Wholesaler/Manufacturer layer
Phase 3: Full Commerce Month 13–18  WhatsApp automation + payments + GST + multi-store
```

---

**BUILT (2026-08-03):** AI tagging expansion (subtype/SKU/description/name auto-generation, photo-slider fix, color-tap detection, catalog listing redesign) — backend + web catalog redesign + mobile edit screen all shipped and verified. Full detail: `CLAUDE.md` "Built" section, `docs/PRO-REQUIREMENTS.md` §13.

---

## Phase 0: MVP (Month 1–4)

**Goal:** 50 paying retailers, prove product-market fit  
**Revenue target:** First ₹50,000 MRR by Month 4  
**Team:** 2 developers, 1 designer, 1 founder doing sales

### Month 1: Foundation
**Week 1–2: Infrastructure Setup** — ✅ Complete
**Week 3–4: Auth + Onboarding** — ✅ Complete

### Month 2: Product Catalog — ✅ Complete
### Month 3: Customer CRM + Collection Links — ✅ Complete
### Month 4: AI Search + Polish + Launch — ✅ Complete
### Month 4b: Retailer Settings + Quota & Limits + Offline PWA + Ecommerce Checkout — ✅ Complete
### Month 4c: Product-level WhatsApp share button (F-006 gap) — ✅ Complete 2026-07-30
Collection-level share (`CollectionView.tsx`) already used the Web Share API; `ProductDetailSheet.tsx` had no share button until now. See `docs/PRO-REQUIREMENTS.md` F-006, `docs/design/feature-ideas-2026-07-30.md` §3.

### Future: F-021 Product & Store Ratings — 🔴 Planned
Reviewed 2026-07-30 (`docs/design/feature-ideas-2026-07-30.md` §2, spec in `docs/PRO-REQUIREMENTS.md` §10.12). Not in locked MVP scope — candidate for early Phase 1, after Phase 0 retention/conversion metrics are validated and there's repeat customer traffic worth rating. Gate rating eligibility behind a prior enquiry/order to prevent fake reviews. Includes `google_place_id` Google-review-link CTA (flagged review-gating risk documented in spec).

### Future: F-022 Auto-Post New Arrivals to Google Business Profile — 🔴 Planned, DO NOT START
Reviewed 2026-07-30, spec in `docs/PRO-REQUIREMENTS.md` §10.13. **Hold — do not begin development until explicit go-ahead; use `CLAUDE.md` reference at that time.** Blocked on external Google Business Profile API access approval (outside Kanchuki's control) in addition to not being MVP scope.

### F-023: AI Provider Registry — ✅ **Built 2026-08-01**
Admin-configurable tagging models + per-provider usage so AI tagging never halts when one provider's credits run out (user's live production issue). DB-driven registry (`ai_provider_configs`) replaces the hardcoded claude/openai/gemini adapter list; generic `OPENAI_COMPAT` adapter (base_url + model) serves any OpenAI-protocol provider (OpenRouter/DeepSeek/Mistral/Groq/Together); cost-weighted `credits_per_call` drains the existing F-010 `AI_TAGGING_CALL` quota; per-call `AiUsageLog` attribution powers Admin → AI Usage. Spec `docs/PRO-REQUIREMENTS.md` §10.14, build table in `CLAUDE.md`. Migration 041 + `prisma generate` required.

### Future: F-024 DB-Backed Default Shop-By Categories + AI Auto-Category Assignment — ✅ **Built 2026-08-04** (commit `be02012`)
Move the "Shop By Categories" default list from hardcoded to DB — new admin-editable `DefaultProductCategory` template (migration 045, seeded 13 garment types), copied into every new retailer's `ProductCategory` at signup + backfilled for existing zero-category retailers — and AI tagging now auto-assigns `Product.category_id` by matching the tag result against the retailer's own category list. New Arrivals/Sale computed as virtual query-time flags (`is_new_arrival`/`on_sale` on `PublicProduct`, shared `lib/product-flags.ts`) — Option A, not AI-assigned rows. Admin grid at Admin → Default Categories. Full design + build table: `docs/PRO-REQUIREMENTS.md` §14.

### Future: F-025 Scan-to-Sell — Offline Sale Reconciliation via SKU/QR Scan — ✅ **Built 2026-08-04** (commit `53f627c`)
Retailer sells an item in the physical shop; nothing updates the digital catalog. Decided design (shipped): scan folded into the existing flow — new `product/scan.tsx` barcode/QR screen (`expo-camera`, no new dep) opened from a catalog-tab scan icon, resolves the product's auto-generated SKU via `?sku=` on the existing products list endpoint, jumps into existing `product/[id].tsx` where the existing SOLD toggle + offline mutation queue do the rest. "Print Tag" button on product detail shows a print-friendly SKU+QR rack tag. Shop staff get this by default (SKU param deliberately has no owner-only gate). GST-invoice-on-offline-sale flagged as a future hook, out of scope. Full comparison + build table: `docs/PRO-REQUIREMENTS.md` §15.

### F-026 BUG: Mobile "Recently Deleted" → permanent delete throws APIError — ✅ **Fixed 2026-08-04** (commit `ac50fe8`)
`apps/api/src/routes/products.ts` purge route called `prisma.product.delete()` directly; F-017's DB guardrail trigger (`037_db_guardrails` migration, shipped 2026-07-26) blocks all hard deletes on `products` unless `SET app.allow_hard_delete = 'true'` is set first, which the route never did — the trigger's exception isn't the `P2003` code the route's catch block checks for, so it fell through as an unhandled 500 the mobile app showed as `APIError`. Fixed by porting the purge-cron bypass into the route: `getPurgePrisma()` (the `kanchuki_purge` scoped role) + `$transaction` with `SET app.allow_hard_delete = 'true'` before the `.delete()`. `P2003` catch kept. Full root-cause writeup: `docs/PRO-REQUIREMENTS.md` §16.

### F-027: DB-Backed Category/Style/Occasion/Fabric Taxonomy — ✅ **Built + Deployed 2026-08-07**
Category/Style/Occasion/Fabric moved off hardcoded lists onto the DB — admin-editable, seeded as defaults per new retailer, AI tagging auto-detects Style/Fabric (Occasion/Category already did). New `DefaultProductAttribute`/`ProductAttribute` model pair (migration 046) generalizes the F-024 template pattern across all three kinds instead of three near-duplicate tables; `Product.styles`/`fabrics` soft-matched, same convention as the pre-existing `occasions`. Ladies-only today, `segment` column ready for Men/Kids with zero migration. Deploying 046 surfaced the live DB was 4 migrations behind (042 was last applied, not 045) — 043/044 DDL existed but was unrecorded, 045/046 applied fresh via Supabase SQL Editor, all backfilled and browser-verified live. Full build/deploy detail: `docs/PRO-REQUIREMENTS.md` §18.

### F-028: Auto-Contrast Background + AI-in-Background Add-Product Flow — ✅ **Built 2026-08-08** (commits `ec525bd`, `ed6496b`, `d63ebc2`, `b5897ec`)
Add-product flow reworked so AI runs entirely in the background — shoot → preview → price → Save (photo uploads at Save; AI tagging + cleanup + background all server-side after creation, no blocking progress screen). Plus F-028 auto-contrast: when the retailer leaves the background on "Auto", the tag job classifies the AI-detected primary color's tone (`classifyColorTone`, WCAG luminance bands) and composites the newest active **opposite-tone** admin backdrop (`pickContrastBackground`); explicit picks always win, mid-tones fall back to white. Backgrounds get an auto-computed `tone` at admin upload (migration 047, admin-overridable in Admin → Background Images). Migration 047 required — see `scripts/apply-047-background-tone.sql`. Build table: `docs/PRO-REQUIREMENTS.md` §19.

### F-029: Photo Rotate + Post-Save Background Picker — ✅ **Built 2026-08-09** (merged `6ee8ede`)
Retailer can rotate a product photo in fixed 90° steps from both the pre-save add-product preview and the post-save product-detail screen, and pick an admin-library background on the detail screen (the `PATCH /:id/background` endpoint + `productApi.setBackground()` already existed and were proven by add.tsx — this wired them into the edit screen that never called them). Two rotate mechanisms split by where the photo lives: pre-save client-side `expo-image-manipulator` (recomputes from the untouched capture each tap, so 4 taps back to "360°" never compounds lossy re-encodes) and post-save server-side `POST /v1/products/:id/photos/:photoId/rotate` (sharp-backed via a new `rotateImage()` in `@kanchuki/ai`) for both the current primary and the preserved pre-cleanup original. No quota charge, no feature-flag work (the picker hides itself when `getBackgroundImages()` returns `[]`). Build table: `docs/PRO-REQUIREMENTS.md` §20.

**F-029 extension (commit `714a564`): Photo Set-as-Main + per-photo background picker.** The edit flow now ends in "make this the main image": `PATCH /:id/photos/:photoId` accepts `{ is_primary: true }` → transactional demote-all + promote (exactly one primary; `z.literal(true)` so `false` 422s), and every catalog/customer surface already orders by `is_primary DESC` so the promoted photo is what the storefront shows first. `POST /:id/photos/:photoId/cleanup` gains optional `background_image_id` — the detail-screen Background row composites the **currently-viewed** photo onto the chosen backdrop (per-photo beats product-level; feature-gated fail-closed behind `CUSTOM_BACKGROUND_LIBRARY`). Mobile `[id].tsx`: Set-as-main button (star, gold when main), Main badges on carousel + thumbnails, per-photo Background row. API suite 372/372 (products 18 → 26), api + mobile tsc clean, deployed `bbadc4ce` and live-browser-verified (grid card + detail first image = DB primary). Mobile UI ships via EAS build.

---

## Phase S: Security Infrastructure & Admin Control (NEW — Month 4–5)

**Status:** ✅ **Month S1-S3 Built** (backups, SQL console, audit log, deployment gates, operations center). **F-013 through F-17 built in Month S4** (see below).
**Goal:** Give the admin full control over every operation. Database backups, query console, deployment gates, approval workflows. No automated operation runs without human permission.

**Prerequisites:** Phase 0 MVP live, admin panel deployed, scrypt + TOTP auth implemented.

### Month S1: Database Backup System — ✅ **Built**

**Backup Infrastructure**
- [x] **Backup script** — `scripts/backup-database.ts` using `pg_dump` — full schema + data dump, compressed, timestamped, uploaded to R2
- [x] **Restore script** — `scripts/restore-database.ts` — list backups, restore to target, row count verification
- [x] **Manual backup/restore** — admin dashboard page (`/admin/database/backup`) with "Create Backup" button and restore with confirmation dialog + audit log
- [x] **Backup status page** — `/admin/database/status` — last backup time, next backup time, status, size, retention
- [ ] **Provision backup database** *(manual infra — need second Postgres instance)*
- [x] **Scheduled backup cron** — daily (3 AM UTC) + weekly (Sunday 4 AM UTC) BullMQ jobs, `apps/api/src/jobs/index.ts`
- [x] **Backup alerts** — `backup-database.ts` writes an `audit_log` alert entry with consecutive-failure tracking (threshold 2+)

### Month S2: Admin Query Console + Database Management — ✅ **Built**

**SQL Query Runner**
- [x] **Backend: `POST /admin/query`** — connects to replica, read-only enforced, 30s timeout, 1000 row limit, logs every query
- [x] **Backend: `GET /admin/query/history`** — recent query history
- [x] **Admin page: Query Console** — `/admin/database/query` — Monaco editor, run/clear buttons, results table, query history sidebar, CSV export, "READ ONLY" banner
- [x] **Admin page: Database Status** — `/admin/database/status` — primary DB connection status/size/version/active connections, backup DB status
- [x] **Audit Log Viewer** — `/admin/audit-log` — filterable table (action/actor/resource/date/IP), click-to-expand metadata JSON, CSV export, retention notice

### Month S3: Deployment Control + Operations Center — ✅ **Built**

> This section = the admin-facing deploy dashboard/approval UI (below). For actual server hosting choices (Railway vs alternatives) and mobile app store launch steps, see `docs/HOSTING-AND-APP-STORE-GUIDE.md`.

**Deployment Dashboard**
- [x] `/admin/operations/deployments` — deployment history with commit/author/date/status, rollback button
- [x] `/admin/operations/pending` — pending approvals (deploy/migration/backup-restore/bulk-action/config-change), approve/reject with audit logging

**Operations Center**
- [x] `/admin/settings/rate-limits` — live rate limit values per endpoint, adjust without redeploy, current usage stats
- [x] `/admin/settings/ai-config` — select AI model per operation type, temperature/max-tokens/timeout, test connection button

### Month S4: Plan Permission Matrix, Trust & Safety, Deletion Vault, DB Guardrails

**Status:** ✅ **Completed** — F-013 through F-017 built, tested, and committed. See `docs/PROGRESS.md` 2026-07-26 for full details.

**Week 1 — Plan Feature Matrix (F-013)**
- [x] `plan_features` table + `PlanFeatureKey` enum (migration)
- [x] `GET/PUT /admin/plan-features` (mirrors existing `/admin/plan-limits`)
- [x] `/admin/plan-features` checkbox grid UI
- [x] `hasFeature(retailerId, key)` helper — fails **closed** (opposite of `checkQuota`'s fail-open)
- [x] Gate existing plan-differentiated routes (360 spin, custom backgrounds, checkout, WhatsApp Business API) behind `hasFeature()`

**Week 2 — Activity Tracking (F-014)**
- [x] Audit `AuditLog.create()` calls across mutation routes — add where missing (product/customer/collection CRUD, settings changes, payment account changes)
- [x] `/admin/retailers/:id/activity` — AuditLog timeline
- [x] `/admin/retailers/:id/customers/:id/activity` — CustomerInteraction timeline (reuses F-008 data, no new schema)
- [x] `/admin/activity` — platform-wide feed with simple burst-detection threshold

**Week 3 — Account Suspension (F-015)**
- [x] Migration: `Retailer.is_suspended/suspended_at/suspended_reason/suspended_by_id`, `Customer.is_blocked/blocked_at/blocked_reason`
- [x] Suspended-retailer login block + graceful collection-link degradation (no 404 leak)
- [x] Blocked-customer enquiry/checkout rejection (F-302 checkout path)
- [x] Admin suspend/unsuspend + block/unblock UI, reason required, audit logged

**Week 4 — Deletion Vault + DB Guardrails (F-016/F-017)**
- [x] Provision separate Postgres instance for `VAULT_DATABASE_URL` (already-existing Railway Postgres-PYkI instance)
- [x] `DeletedRecord` vault schema + `vaultDelete()` helper wired into every soft-delete call site
- [x] Vault DB role: INSERT-only `vault_app` grant, verified by passing vault test (INSERT succeeds, UPDATE/DELETE rejected)
- [x] `/admin/database/deletion-vault` lookup page (view-only, filterable)
- [x] Postgres role separation on Supabase: `kanchuki_app` (no DELETE/TRUNCATE) + `kanchuki_migrator` (human-only, full DDL) + `kanchuki_purge` (scoped DELETE for the 30-day purge cron via `PURGE_DATABASE_URL` — added 2026-08-02)
- [x] `BEFORE DELETE OR TRUNCATE` guardrail triggers on all 8 business tables (migration 037)
- [x] CI grep guard (`scripts/check-delete-guard.sh`) blocking raw `.delete()` outside allowlist + workflow step in `.github/workflows/ci.yml`

---

## Phase 0.5: Internal Team Management

**Status:** ✅ Partially implemented — see `docs/PRO-REQUIREMENTS.md` Section 10

### Completed
- [x] TeamMember login (POST /v1/team/login, scrypt + JWT)
- [x] Territory CRUD (POST/GET/PATCH /v1/team/territories)
- [x] TeamMemberTerritory assignment + over_capacity flag
- [x] Retailer territory auto-derivation from pincode at signup
- [x] Marketing Agent onboarding flow endpoint
- [x] SupportTicket endpoints (POST/GET/PATCH /v1/team/tickets)
- [x] Manager reporting endpoints (agents, coverage-gaps, activation funnel)

- [x] SupportTicket routing logic (visit-required → territory hierarchy traversal → nearest agent; backend-manageable → CITY-level pool; least-loaded scheduling; batch `/tickets/route-all`) — *built in `team.ts`*
- [x] Manager rollup reporting dashboard UI (`/admin/reports`) — Agent Performance, Coverage Gaps, Activation Funnel tabs — *built in `reports/page.tsx`*
- [x] Staff mode inside the Expo retailer app (for field onboarding) — field staff login via phone OTP → `/staff` dashboard with territory-scoped retailer list, quick onboard form, support ticket view — *built in `apps/mobile/app/staff/`*

### Remaining (operational — not code)
- [ ] 10-retailer pilot + onboarding tutorial iteration *(requires real retailer feedback)*

### Built — F-018/F-019/F-020 + admin theme, built 2026-07-28→07-30
See `docs/PRO-REQUIREMENTS.md` §10.9–10.11 for full spec.
- [x] F-018: `TeamMember.referral_code` + optional/skippable referral field in retailer onboarding wizard, resolves to `onboarded_by_id`
- [x] F-019: `SupportTicket.ticket_type` (`GENERAL`/`CATALOG_UPLOAD`) + quote/slot/payment fields (migration 040)
- [x] F-019: `CatalogUploadPriceTier` admin-editable price table + `/admin/catalog-upload-tiers` grid (mirrors `/admin/plan-limits`)
- [x] F-019: retailer-facing request flow — skippable onboarding step + dashboard "Catalog Upload Help" button (mobile)
- [x] F-019: admin quote + slot-proposal on the existing ticket API (`PATCH /team/tickets/:id`), filterable by `ticket_type`
- [x] F-019: Razorpay Payment Link payment-first gate before a visit slot is confirmed
- [x] F-020: delegated on-site access — catalog-upload visits mint a short-lived `catalogDelegateCanAccess` token so the field agent can act on the retailer's account (built 2026-07-30)
- [x] Admin-configurable platform theme — `/admin/settings/theme` + public `/v1/public/theme` + mobile `useTheme()` rebrand without an app rebuild (built 2026-07-29)

---

## Phase 1: AI Core (Month 5–8)

**Goal:** Add Fashion DNA + Virtual Try-On, reach ₹3L MRR  
**Prerequisite:** 3+ months of retailer + customer behavior data from Phase 0

### Month 5–6: Fashion DNA Engine — Planned
### Month 7–8: Virtual Try-On (Self-Hosted) — Planned

---

## Phase 2: B2B Supply Network (Month 9–12) — Planned
## Phase 3: Full Commerce (Month 13–18) — Planned

---

## Platform Scaling (cross-cutting — runs alongside Phase 1–3, not a separate calendar phase)

**Full spec:** `docs/SCALING.md`. Trigger: retailer asked 2026-07-29 whether stack holds 1M retailers / 5M customers + DAU. Answer: current MVP stack holds MVP scale only — gap below.

| Scaling Phase | Retailer range | Trigger point | Key work |
|---|---|---|---|
| **A — Pre-10K** | 0–10K retailers | Do now, before next onboarding push | Supabase connection pooler wired into `DATABASE_URL`; provision `DATABASE_URL_REPLICA` (client code already supports it); provision vault Postgres + set `VAULT_DATABASE_URL` (currently dormant, F-016 writes silently skip); move rate-limit store to Redis before running >1 API instance |
| **B — 10K–100K** | Aligns with Phase 2 (B2B Supply Network) | Multi-instance API traffic | Railway multi-instance/autoscale; Supabase dedicated compute tier; Redis HA (Sentinel/cluster); `pg_stat_statements` query monitoring |
| **C — 100K–1M** | Aligns with Phase 3 (Full Commerce) | Approaching 1M retailer target | Read-replica fan-out or hot-table partitioning (`Product`, `CollectionView`, `CustomerInteraction`); server-side edge cache for public `/c/*` collection reads; pgvector ivfflat/hnsw tuning once Fashion DNA (Phase 1) is live |

**Explicitly deferred (no evidence of need yet):** multi-region DB (India-only market, single `ap-south-1` region correct for years), DB sharding, separate read-model service. Don't build these speculatively — see `docs/SCALING.md` §6.

**Load/security test gate:** load test (k6/Artillery against staging Supabase branch) and a load-driven security pass required before Phase B infra work lands — not yet run, see `docs/SCALING.md` §5.

---

## Milestones & Success Gates

| Milestone | Month | Gate Criteria |
|-----------|-------|--------------|
| Infrastructure ready | M1 | Deploy endpoint responds, DB seeded |
| AI tagging working | M2 | 80% tag accuracy on 50-image test set |
| First retailer onboarded | M2 | Retailer uploads 20+ products |
| Collection link live | M3 | Customer opens link on mobile, enquires |
| MVP beta | M4 | 10 pilot retailers, real feedback |
| MVP public | M4 | 50 paying retailers |
| **Backup system live** | **M4–5** | **Backup created, verified, and restorable from admin dashboard** |
| **Query console live** | **M5** | **Admin runs read-only SQL against replica** |
| **Deployment gates live** | **M5** | **All deploys require manual approval** |
| V-Tone v1.5 deployed | M1 | Try-on working on 10 test products |
| V-Tone fine-tuned for Indian wear | M6 | 80% quality on saree/lehenga test set |
| Fashion DNA live | M7 | 1000+ customer behavior events, matching visible |
| VTO in-store live | M8 | Full VTO flow with fine-tuned model |
| Wholesaler beta | M10 | 5 wholesalers sharing catalogs with retailers |
| WhatsApp automation | M14 | 100 retailers using automated sends |
| GST compliance | M16 | GST invoice generated for every sale |
| Regional languages | M18 | Hindi UI live, Gujarati in beta |

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| VTO quality unacceptable | Test on 50 ethnic wear samples before shipping; fine-tune V-Tone for Indian garments |
| Retailer upload behavior drops off | Gamify (streak, leaderboard), offer human onboarding support for first 50 products |
| WhatsApp API account ban | Build SMS fallback (MSG91) from Day 1; never spam |
| AI tagging cost spike | Cache embeddings; batch process; use Claude Haiku for bulk |
| Meta API pricing change | Decouple WhatsApp module behind feature flag; SMS/email always available |
| Competitor replication | Speed to market + deep ethnic wear quality + retailer network effects |
| Jio/Reliance entry | Focus on Tier 2–3 cities where distribution advantage is smaller |
| **Database corruption** | **Separate backup database with automated daily backups + integrity verification** |
| **Unauthorized deployment** | **Manual approval gate required for all production deploys** |
| **Data loss** | **Cold backup with 7-year retention for GST compliance** |

---

## Budget Estimates (MVP — 4 months)

**Hosting cost/provider comparison + mobile store fees:** `docs/HOSTING-AND-APP-STORE-GUIDE.md`

| Category | Monthly | 4-Month Total |
|----------|---------|--------------|
| Infrastructure (Railway/Supabase/R2/Cloudflare) | ₹15,000 | ₹60,000 |
| Claude Vision API (AI tagging, 500 retailers × 100 products) | ₹20,000 | ₹80,000 |
| Razorpay setup | ₹0 (% of txn) | ₹0 |
| Developer salaries (2) | ₹2,00,000 | ₹8,00,000 |
| Designer | ₹75,000 | ₹3,00,000 |
| Marketing/Sales | ₹50,000 | ₹2,00,000 |
| **Backup database (second PostgreSQL instance)** | **₹3,000** | **₹12,000** |
| **Total** | **₹3,63,000** | **₹14,52,000** |

**Break-even:** 145 Growth plan retailers (₹2,499 × 145 = ₹3,62,355/month)
