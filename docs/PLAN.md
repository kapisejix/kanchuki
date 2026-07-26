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

---

## Phase S: Security Infrastructure & Admin Control (NEW — Month 4–5)

**Status:** 🆕 Planned — July 2026  
**Goal:** Give the admin full control over every operation. Database backups, query console, deployment gates, approval workflows. No automated operation runs without human permission.

**Prerequisites:** Phase 0 MVP live, admin panel deployed, scrypt + TOTP auth implemented.

### Month S1: Database Backup System

**Week 1–2: Backup Infrastructure**
- [ ] **Provision backup database** — second PostgreSQL instance (independent from Supabase, e.g., Railway Postgres or Hetzner VPS)
- [ ] **Add `BACKUP_DATABASE_URL` env var** — wired into `.env.example`, `.env`, and all deployment environments
- [ ] **Backup script** — `scripts/backup-database.ts` using `pg_dump` with:
  - Full schema + data dump
  - Compressed output
  - Timestamped filenames
  - Upload to Cloudflare R2 backup bucket
  - Save metadata (size, checksum, table list) to `backup_metadata` table or JSON
- [ ] **Restore script** — `scripts/restore-database.ts` with:
  - List available backups
  - Restore to a target database
  - Verification step (row count sanity check)
- [ ] **Manual backup trigger** — admin dashboard page with "Create Backup" button
- [ ] **Manual restore trigger** — admin dashboard with confirmation dialog and audit log

**Week 3–4: Scheduled Backups + Monitoring**
- [ ] **Daily backup cron** — BullMQ job or system cron, runs every 24h
- [ ] **Weekly backup cron** — Sunday full backup to cold storage
- [ ] **Backup integrity check** — automated: restore to a temporary database, run row count checks, drop temp database
- [ ] **Backup status page** — admin dashboard showing: last backup time, next backup time, status (success/failed), size, retention
- [ ] **Backup alerts** — email/SMS notification on backup failure

### Month S2: Admin Query Console + Database Management

**Week 1–2: SQL Query Runner**
- [ ] **Backend: `POST /admin/query`** endpoint that:
  - Connects to the replica database ONLY (never primary)
  - Enforces read-only: blocks INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/CREATE
  - Sets statement timeout (30s), row limit (1000)
  - Logs every query: admin identity, timestamp, SQL text, duration, row count
  - Returns results as JSON array with column metadata
- [ ] **Backend: `GET /admin/query/history`** endpoint listing recent queries
- [ ] **Admin page: Query Console** — `/admin/database/query` with:
  - SQL editor with syntax highlighting (Monaco or CodeMirror)
  - Run button + clear button
  - Results table with sortable columns
  - Query history sidebar
  - Export results to CSV
  - Warning banner: "READ ONLY — queries run against replica database"
- [ ] **Admin page: Database Status** — `/admin/database/status` showing:
  - Primary DB: connection status, size, version, table count, active connections
  - Replica DB: connection status, replication lag, size
  - Backup DB: last backup time, total backups, storage used

**Week 3–4: Audit Log Viewer**
- [ ] **Backend: `GET /admin/audit-logs`** endpoint with filtering:
  - Filter by: action type, actor, resource, date range, IP address
  - Pagination with cursor-based navigation
  - Expandable rows showing before/after metadata
- [ ] **Admin page: Audit Log** — `/admin/audit-log` with:
  - Filterable table with columns: timestamp, action, actor, resource, IP
  - Click-to-expand showing full metadata JSON
  - Export to CSV for compliance
  - Retention notice: "Logs retained for 3 years"

### Month S3: Deployment Control + Operations Center

**Week 1–2: Deployment Approval Gates**
- [ ] **CI/CD pipeline update** — split build from deploy:
  - Build & test runs automatically on every PR/merge to main
  - Deploy step requires manual approval in Railway dashboard
  - Add deployment log collection (who deployed, what commit, when)
- [ ] **Deployment dashboard** — `/admin/operations/deployments` showing:
  - Recent deployments with status (pending/approved/rejected/rolling)
  - Commit hash, author, date, deployment duration
  - Rollback button for last successful deployment
- [ ] **Slack/email notification** on pending deploys requiring approval

**Week 3–4: Operations Approval Center**
- [ ] **Admin page: Pending Approvals** — `/admin/operations/pending` showing:
  - All operations awaiting admin approval
  - Type: deploy, migration, backup-restore, bulk-action, config-change
  - Requested by, timestamp, details
  - Approve / Reject buttons with audit logging
- [ ] **Admin page: Rate Limits** — `/admin/settings/rate-limits` with:
  - Live rate limit values per endpoint
  - Adjust without redeploy (persisted to DB not env vars)
  - Current usage stats per rate limit window
- [ ] **Admin page: AI Model Config** — `/admin/settings/ai-config` with:
  - Select AI model per operation type (tagging, embedding, try-on)
  - Set temperature, max tokens, timeout
  - Test connection button

### Month S4: Plan Permission Matrix, Trust & Safety, Deletion Vault, DB Guardrails

**Status:** 🆕 Planned — decided 2026-07-26. Requirements: `docs/PRO-REQUIREMENTS.md` §12 (F-013–F-017). Guardrail design: `docs/SECURITY.md` §19. Schema: `docs/DATABASE.md` (PlanFeature, Retailer/Customer suspension fields, Deletion Vault).

**Week 1 — Plan Feature Matrix (F-013)**
- [ ] `plan_features` table + `PlanFeatureKey` enum (migration)
- [ ] `GET/PUT /admin/plan-features` (mirrors existing `/admin/plan-limits`)
- [ ] `/admin/plan-features` checkbox grid UI
- [ ] `hasFeature(retailerId, key)` helper — fails **closed** (opposite of `checkQuota`'s fail-open)
- [ ] Gate existing plan-differentiated routes (360 spin, custom backgrounds, checkout, WhatsApp Business API) behind `hasFeature()`

**Week 2 — Activity Tracking (F-014)**
- [ ] Audit `AuditLog.create()` calls across mutation routes — add where missing (product/customer/collection CRUD, settings changes, payment account changes)
- [ ] `/admin/retailers/:id/activity` — AuditLog timeline
- [ ] `/admin/retailers/:id/customers/:id/activity` — CustomerInteraction timeline (reuses F-008 data, no new schema)
- [ ] `/admin/activity` — platform-wide feed with simple burst-detection threshold

**Week 3 — Account Suspension (F-015)**
- [ ] Migration: `Retailer.is_suspended/suspended_at/suspended_reason/suspended_by_id`, `Customer.is_blocked/blocked_at/blocked_reason`
- [ ] Suspended-retailer login block + graceful collection-link degradation (no 404 leak)
- [ ] Blocked-customer enquiry/checkout rejection (F-302 checkout path)
- [ ] Admin suspend/unsuspend + block/unblock UI, reason required, audit logged

**Week 4 — Deletion Vault + DB Guardrails (F-016/F-017)**
- [ ] Provision separate Postgres instance for `VAULT_DATABASE_URL` (not the Supabase primary project)
- [ ] `DeletedRecord` vault schema + `vaultDelete()` helper wired into every soft-delete call site
- [ ] Vault DB role: INSERT-only grant, verified by a rejected UPDATE/DELETE test
- [ ] `/admin/database/deletion-vault` lookup page (view-only)
- [ ] Postgres role separation on primary: `kanchuki_app` (no DELETE/TRUNCATE/DROP/ALTER/CREATE) vs `kanchuki_migrator` (human-only)
- [ ] `BEFORE DELETE OR TRUNCATE` guardrail triggers on business tables
- [ ] CI grep guard blocking raw `.delete()` on business models outside the purge-cron allowlist

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

### Remaining
- [ ] SupportTicket routing logic (visit-required → nearest agent; backend-manageable → pool)
- [ ] Manager rollup reporting dashboard UI
- [ ] Staff mode inside the Expo retailer app (for field onboarding)
- [ ] 10-retailer pilot + onboarding tutorial iteration

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
