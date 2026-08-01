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
- [ ] **Scheduled backup cron** *(BullMQ job or system cron — not wired yet)*
- [ ] **Backup alerts** *(email/SMS notification on failure — not built)*

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
- [x] Postgres role separation on Supabase: `kanchuki_app` (no DELETE/TRUNCATE) + `kanchuki_migrator` (human-only, full DDL)
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

### Built — F-018/F-019, approved 2026-07-28, built 2026-07-28
See `docs/PRO-REQUIREMENTS.md` §10.9–10.10 for full spec.
- [x] F-018: `TeamMember.referral_code` + optional/skippable referral field in retailer onboarding wizard, resolves to `onboarded_by_id`
- [x] F-019: `SupportTicket.ticket_type` (`GENERAL`/`CATALOG_UPLOAD`) + quote/slot/payment fields (migration 040)
- [x] F-019: `CatalogUploadPriceTier` admin-editable price table + `/admin/catalog-upload-tiers` grid (mirrors `/admin/plan-limits`)
- [x] F-019: retailer-facing request flow — skippable onboarding step + dashboard "Catalog Upload Help" button (mobile)
- [x] F-019: admin quote + slot-proposal on the existing ticket API (`PATCH /team/tickets/:id`), filterable by `ticket_type`
- [x] F-019: Razorpay Payment Link payment-first gate before a visit slot is confirmed

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
