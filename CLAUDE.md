# Kanchuki — AI Fashion Commerce Platform
## Project Memory for AI Agents

**Project Name:** Kanchuki  
**Domain:** AI-powered fashion retail SaaS for Indian SMB clothing stores  
**Status:** Active development (July 2026)  
**Research Source:** `docs/final-research.md`, `docs/AI Fashion Sales Assistant - Phase 1.md`

---

## What This Project Is

Kanchuki digitizes India's 1 million+ offline clothing stores with:
1. **AI Catalog Builder** — photo → auto-tagged product in seconds
2. **Customer Preference Engine** — color, style, budget, size preferences per customer
3. **WhatsApp Commerce** — share product collections via link, no app needed

**Unique moat:** AI-powered catalog builder + customer preference engine + WhatsApp Commerce that works without a website.

---

## User Roles

| Role | Primary Need | App Surface |
|------|-------------|-------------|
| Retailer | Upload products, search for customers, share via WhatsApp | Mobile app (React Native) |
| Customer | View collection, favorite, enquire | Mobile web (Next.js PWA) |
| Wholesaler | Share catalogs, manage retailer orders | Web dashboard |
| Manufacturer | Upload master catalogs, track design popularity | Web dashboard |
| Admin | Platform ops, billing, support | Next.js admin panel |

---

## Current Phase: MVP (Phase 0 — 3-4 months)

**Build only:**
- Photo upload + AI auto-tagging (category, color, fabric, occasion)
- Product catalog with rack/shelf location
- Customer list with preference capture
- WhatsApp collection link generator
- Customer mobile web page (view, favorite, enquire)
- Basic in-store AI search ("cotton pink suits under ₹2000")
- Product sizes (S/M/L/XL/XXL/XXXL checkboxes on add/edit product, same list shown on customer product detail page) — built 2026-07-26, see `docs/PROGRESS.md`
- Guided bulk onboarding for large stores (500–3000+ SKUs, F-001d, built): rack/shelf batch-photo capture reusing F-001c multi-item detection + supplier PDF/catalog reuse reusing F-001b import — `apps/mobile/app/product/bulk-onboard.tsx` — see `docs/PRO-REQUIREMENTS.md`
- Retailer account settings (profile edit/delete, subscription, team, WhatsApp config, F-009) + generalized quota/limits system (F-010) — see `docs/PRO-REQUIREMENTS.md`
- Ghost-mannequin AI catalog image generation for packed/unopened stock, via Snappyit API (F-001e, planned) — retailer unpacks once per design, AI generates full worn catalog image reused across all restocked units — see `docs/PRO-REQUIREMENTS.md`

**Removed (chore/remove-unwanted-features):** Virtual Try-On (VTO), Fashion DNA AI matching, checkout/orders, size recommendation, showroom bookings, referrals, customer interactions tracking, lookbooks, spin-frame 360°, partner referrals, store affinities.  
**NOT in MVP:** WhatsApp API automation, Manufacturer/Wholesaler layer, UPI payment tracking

---

## Tech Stack (Locked)

| Layer | Choice | Why |
|-------|--------|-----|
| Retailer App | React Native (Expo) | Cross-platform, fast build |
| Customer Web | Next.js 14 (App Router) | PWA, SEO, SSR |
| Backend API | Node.js + Fastify | Fast, TypeScript native |
| AI Tagging | Claude Vision API (claude-3-5-sonnet) | Best for Indian fashion understanding |
| Database | PostgreSQL 16 | Standard relational |
| Cache | Redis | Session, rate limit, job queue |
| Storage | Cloudflare R2 | Cost-effective image storage |
| Auth | Supabase Auth | Phone OTP for retailers |
| Payments | Razorpay | UPI + INR subscriptions |
| WhatsApp | Meta Cloud API (official) | Phase 2 |
| Deployment | Railway (API+Web) + optional CPU server for V-Tone | No GPU required |
| CDN | Cloudflare | Free tier, fast India PoPs |

---

## Pricing Model

| Plan | Monthly (base, ex-GST) |
|------|------------------------|
| Starter | ₹4,999 |
| Growth | ₹9,999 |
| Pro | ₹14,999 |

Payment: Razorpay (UPI first). Retailer pays base + 18% GST. **Source of truth: Admin → Plan Limits & Pricing (`plan_pricing` table).**

---

## Key Constraints

- **GST invoicing REQUIRED** — legal compliance for all Indian retail software
- **INR pricing only** — no USD, no forex friction
- **Offline-first design** — retailer app must work with poor connectivity
- **Photo-first UX** — no manual form filling for product entry
- **WhatsApp API pass-through** — Meta's ₹0.38/conversation must be in pricing math
- **WhatsApp API pass-through** — Meta's ₹0.38/conversation must be in pricing math
- **Regional language UI** — Hindi minimum by Year 1

---

## MVP Success Metrics (90 days)

- 50 retailers onboarded
- ≥50 products uploaded per retailer
- ≥10 collection links sent per retailer/month
- ≥40% collection link open rate
- ≥15% enquiry-to-order conversion
- ≥60% retailer retention at 60 days

---

## ⚠️ AI Agent Operational Control Policy

**IMPORTANT: This section defines what this AI agent CAN and CANNOT do.**

### Always Allowed (Read-Only)
- Read any file in the codebase
- Search code with ripgrep
- Propose code changes (present as diffs for review)
- Run tests, typecheck, lints
- Answer questions about the codebase
- Generate documentation
- Start local development server
- Install npm packages (with review)

### Requires Human Approval
- **Apply code changes** — present diff, wait for approval
- **Modify CLAUDE.md** — this file must only be changed with explicit human approval
- **Modify SECURITY.md §12-18** — governance sections require human review

### NEVER Allowed
- **Modify production environment variables**
- **Trigger deployments** — only via Railway dashboard Redeploy button or GitHub push; never via `railway up` CLI
- **Run `railway up` from a local machine** — this ships local files, not GitHub code; causes stale-code incidents. ALL deploys must come from GitHub (push to main → Railway auto-deploys). See `docs/DEPLOY.md` for the correct flow.
- **Run database migrations** — only from admin dashboard with approval
- **Execute commands that modify the production database directly**
- **Modify CI/CD pipeline configuration**
- **Access production secrets or connection strings**
- **Run destructive commands** (e.g., `DROP`, `DELETE` without WHERE clause, `TRUNCATE`, etc.)

---

## What's Built — Feature Index

> **Full detail for every entry below lives in `docs/BUILD-LOG.md`** (chronological, with file-level build tables). This index is the at-a-glance memory: what exists, when it shipped, and where the detail is. Entries marked **Planned** are not started — see the linked section before building.

| # | Feature | Status | Date | Detail |
|---|---------|--------|------|--------|
| 1 | Admin Control Center — Plan Feature Matrix (F-013), Activity Tracking (F-014), Suspension (F-015), Deletion Vault (F-016), DB Guardrails (F-017) | ✅ Built | 2026-07-26 | BUILD-LOG §1 |
| 2 | Phase 0.5 Internal Team Management — SupportTicket routing, manager rollup reports, staff Expo mode | ✅ Built | — | BUILD-LOG §2 |
| 3 | ~~L2 Ecommerce Checkout~~ | ❌ Removed | 2026-08-31 | `chore/remove-unwanted-features` |
| 4 | F-018 Sales Referral Attribution + F-019 Paid On-Site Catalog Upload Service | ✅ Built | 2026-07-28 | BUILD-LOG §4 |
| 5 | Marketing Page Redesign — Loom Design System (Option A; B/C/D documented as alternatives) | ✅ Built | 2026-07-29 | BUILD-LOG §5 |
| 6 | Admin-Configurable Platform Theme (rebrand without app rebuild) | ✅ Built | 2026-07-29 | BUILD-LOG §6 |
| 7 | Product-Level WhatsApp Share Button (F-006 gap) + Ratings reviewed (F-021) | ✅ Built | 2026-07-30 | BUILD-LOG §7 |
| 8 | F-023 AI Provider Registry — admin-configurable tagging models + per-provider usage + weighted quota | ✅ Built | 2026-08-01 | BUILD-LOG §8 |
| 9 | F-022 Auto-Post New Arrivals to Google Business Profile | 🕐 Planned (blocked on Google API access) | — | BUILD-LOG §9 |
| 10 | Mobile Accessibility Audit + Harden Pass (`apps/mobile` — labels, Reduce Motion, touch targets) | ✅ Built | 2026-07-31 | BUILD-LOG §10 |
| 11 | Production DB Outage Fix (pooler suffix) + purge-cron scoped role + admin/web hardening | ✅ Built | 2026-08-02 | BUILD-LOG §11 |
| 12 | AI Tagging Expansion — subtype/SKU/description/name + slider fix + color-tap + catalog redesign | ✅ Built | 2026-08-03 | BUILD-LOG §12 |
| 13 | `apps/mobile` Design Polish Pass — P0/P1 fixed, P3 started | ✅ Built | 2026-08-03 | BUILD-LOG §13 |
| 14 | "Black & Gold Elegance" Brand Repaint + shared `COLORS` module | ✅ Built | 2026-08-03 | BUILD-LOG §14 |
| 15 | Customer Web PWA — catalog nav bug + bottom bar + cart wiring + product detail redesign + back-button fix | ✅ Built | 2026-08-04 | BUILD-LOG §15 |
| 16 | Staff/Retailer catalog-upload — TeamMember login auth gap closed + 500-item free offer enforced | ✅ Built | 2026-08-04 | BUILD-LOG §16 |
| 17 | F-024 DB-Backed Default Shop-By Categories + AI auto-category assignment | ✅ Built | 2026-08-04 | BUILD-LOG §17 |
| 18 | F-025 Scan-to-Sell + F-026 Recently-Deleted purge bug fix | ✅ Built | 2026-08-04 | BUILD-LOG §18 |
| 19 | Standalone Product-Photo Cleanup Script (rembg, blur, shine, crop) | ✅ Built | 2026-08-05 | BUILD-LOG §19 |
| 20 | Admin Photo Cleanup Test Page + `--ghost-mannequin` LaMa inpainting mode | ✅ Built | 2026-08-06 | BUILD-LOG §20 |
| 21 | Admin panel refresh→login + CSRF 403 fix (DB-free session check) | ✅ Built | 2026-08-06 | BUILD-LOG §21 |
| 22 | Quality-First Image Compressor (≤80KB) + R2 storage measurement + batch compression + daily cron + Storage Report page | ✅ Built | 2026-08-06 | BUILD-LOG §22 |
| 23 | Fashion V-Tone LIVE on Railway + "Generate on model" admin tool | ✅ Built | 2026-08-06 | BUILD-LOG §23 |
| 24 | Featured Stores — admin-curated pins float to top of /stores | ✅ Built | 2026-08-11 | BUILD-LOG §24 |
| 25 | Colabs-inspired marketing redesign — palette, marquee, logo, MatterSemiMono | ✅ Built | 2026-08-11 | BUILD-LOG §25 |
| 26 | ⚠️ INCIDENT: test-retailer cleanup deleted live retailer's R2 photos — prevention shipped | Fixed | 2026-08-11 | BUILD-LOG §26 |
| 27 | Fashion V-Tone migrated Railway → self-hosted Hetzner CX43 (+ shared-secret auth) | ✅ Migrated | 2026-08-06 | BUILD-LOG §27 |
| 28 | F-033 Ken Burns Auto-Video (photos → ffmpeg slideshow) + Video Social Posting (F-031 posts video over photo when present) | ✅ Built | 2026-08-19 | BUILD-LOG §28 |
| 29 | F-027 DB-backed Category/Style/Occasion/Fabric taxonomy — migrated + live-verified | ✅ Built | 2026-08-07 | BUILD-LOG §29 |
| 30 | Store QR Self-Service + Store-URL Rename Sync + Onboarding QR Nudge | ✅ Built | 2026-08-08 | BUILD-LOG §30 |
| 31 | Add-Product Flow Rework — AI-in-background + F-028 Auto-Contrast Background | ✅ Built | 2026-08-08 | BUILD-LOG §31 |
| 32 | Redis Public-Response Cache for customer storefronts | ✅ Built | 2026-08-08 | BUILD-LOG §32 |
| 33 | F-029 Photo Rotate (pre/post-save) + post-save Background Picker + Set-as-Main | ✅ Built | 2026-08-09 | BUILD-LOG §33 |
| 34 | Photo edits (crop/rotate/background) not visible after save — cache-busting fix | ✅ Fixed | 2026-08-10 | BUILD-LOG §34 |
| 35 | F-030 shadow toggle for cropped photos | ✅ Built | 2026-08-10 | BUILD-LOG §35 |
| 36 | Occasion removed everywhere + AI auto-selects Category Group & Style | ✅ Built | 2026-08-10 | BUILD-LOG §36 |
| 37 | Play Store Launch Batch — web billing, privacy disclosures, location handling (removed 2026-08-10, optional store-pin re-added in `b4270e4` — Data Safety form declares Location), launch checklist | ✅ Built | 2026-08-10 | BUILD-LOG §37 |
| 38 | Real OTP — MSG91 widget (mobile) + server-side MSG91 everywhere + events webhook | ✅ Built | 2026-08-12 | BUILD-LOG §38 |
| 39 | F-032 Phase A — AI Studio Shoots (FLUX Kontext template backgrounds) | ✅ Built (found undocumented 2026-08-20 — commits `5d5ae44`, `d67484d`; spec §24.11 said "do NOT start until the user says go" and was never updated) — Phase B (product video) still 🔴 Planned | 2026-08-13 → 2026-08-19 | BUILD-LOG (F-032 Phase A entry) |
| 40 | Redis handshake race — first-request-of-the-day OTP/social failure | ✅ Fixed | 2026-08-13 | BUILD-LOG §40 |
| 41 | F-031 Social Media Publishing Phase 1 (Facebook Page connect + post) | ✅ Built | 2026-08-13 | BUILD-LOG §41 |
| 42 | Admin Commission Tracker — 3% of monthly payments as a pool + expense ledger (admin dashboard card + `/admin/commission` two-tab page: Monthly Summary, Expenditure grid, add-expense form, row detail popup) | ✅ Built | 2026-08-17 | BUILD-LOG §42, PRO-REQUIREMENTS §25 |
| 43 | Retailer Auth — Login / Create Account segmented toggle on the single OTP phone screen (decision: keep one screen, two flows would be identical) | ✅ Built | 2026-08-17 | BUILD-LOG §43, PRO-REQUIREMENTS §26 |
| 44 | India Retailer Growth Engine — backend: campaigns/festivals (D/G/R/S), promotions (F), referrals (C), suppliers (K), bookings (L), inventory alerts (J), videos (Q), AI translate (M) + migration 055 (khata H + udhar O removed from scope); M/N/R/S completed: campaign-message translation + AI search UI, usual-size capture + size recommendation + plus sizes, campaign analytics screen, collection A/B (per-variant products + stagger + significance) | ✅ Built (backend + full mobile UI: growth hub, campaigns, referrals, promotions, suppliers, bookings, inventory alerts, videos, AI translate, AI search, campaign analytics + admin festival calendar). Migrations 055–057 applied + verified; **058 (`customers.usual_size`) NOT applied** — size-recommend reads it, needs the SQL before N works | 2026-08-17 | BUILD-LOG §44–47 |
| 45 | Phase II — WhatsApp Native Catalog Sync (F-307 / roadmap P): migration 060–062 (CatalogItem + CatalogSyncLog + Retailer sync fields + WHATSAPP_CATALOG_SYNC feature split for PostgreSQL 55P04 — 060 schema, 061 enum, 062 plan rows), Meta Catalog API client, BullMQ sync engine (full/single + auto-sync on product edit/status/delete/tag-completion), retailer routes D1–D7, HMAC-verified webhook E1–E7, mobile settings UI F1–F7 (+ per-product badges), admin monitor G1–G5, deploy docs | ✅ Built + live (all 63/63 breakdown tasks; migrations 060–062 **applied + verified** 2026-08-18 — tables/enum/plan-rows confirmed in prod) | 2026-08-18 | BUILD-LOG §49 |
| 46 | Marketing & Sales Enablement — Smart Incentive Engine, Local Discovery Engine, AI Social Media Templates, Festival Backgrounds, Lookbook Generator, Aggregator Sync, GST Reports, Partner Network, GMB/Facebook/Google Ads (retailer self-service credentials) | ✅ Built (Phases 0–9; all mobile screens + integrations settings added 2026-08-20; GMB/FB/Google Ads built with bring-your-own-key pattern) | 2026-08-20 | BUILD-LOG, `docs/marketing/IMPLEMENTATION-STATUS.md` |
| 47 | Partner Network Manager (Marketing & Sales Enablement) — full stack (retailer CRUD + admin API + admin UI + mobile UI + schema + migration 066) | ✅ Built (schema fixed, mobile screen complete) | 2026-08-20 | BUILD-LOG, `docs/marketing/IMPLEMENTATION-STATUS.md` |
| 48 | Remaining Work Audit — 31 prioritized coding items + 5 devOps tasks across PRO-REQUIREMENTS, INDIA-RETAILER-GROWTH, photo-feature-audit, PHASE-II-WHATSAPP-CATALOG-BREAKDOWN | 📋 Task list | 2026-08-20 | `docs/20-August-changes.md` |
| 49 | DB-driven Plan Pricing (admin-editable ₹, replaces hardcoded `PLAN_PRICING`) + FLUX Kontext (F-032 Studio Shoot) per-plan-tier quota via `STUDIO_SHOOT` `QuotaResourceType` (F-010 pattern reused, no per-retailer override) | ✅ Built | 2026-08-21 | BUILD-LOG §51 |
| 50 | ~~Customer Profile P0-P1~~ (VTO self-serve, showroom booking, lookbooks — **removed**) | ❌ Partially removed | 2026-08-31 | `chore/remove-unwanted-features` |
| 51 | Customer Profile P2 — fabric glossary (+25 fabrics), recently viewed row, restock notify, saved size capture, 5-question style quiz, AI Stylist v1 (Claude-powered chat), Unstitched Design Gallery (DesignReference schema + migration 069 + admin CRUD + customer gallery) | ✅ Built | 2026-08-21 | `docs/customer/customer-profile-req.md` §12 |
| 52 | ~~Customer Profile P3~~ (referral rewards — **removed**) | ❌ Partially removed | 2026-08-31 | `chore/remove-unwanted-features` |
| 53 | Add-Product raw-photo default (auto-clean OFF — raw saved as-is) + restored per-photo Background/Shadow controls on product detail (`ProductPhotoControls`, dropped in the `b0c3747` redesign) + AI Studio Shoot per-model prompts (Fashion Models no longer collapse to one identical image) + Admin backdrop library: delete (`DELETE /admin/background-images/:id` + trash button), click-thumbnail full-size lightbox, AI scene-naming on upload (`name` optional → `runVisionAsk`) | ✅ Built + live | 2026-08-29 | BUILD-LOG §2026-08-29 |
| 54 | AI Studio Shoot — demographic person-swap + scene expansion: product category → `Demographic` (`womens`/`mens`/`teen_girl`/`teen_boy`/`kids_girl`/`kids_boy`), scenes tagged `noModel` (product-only) / `audience` (per-demographic), `generateStudioImage()` swaps the person per demographic, 5 new scenes (Seated Lounge, Male with Car/Bike, Kids Playing, Teen Street), admin bench gets a demographic filter. Steps 1–5 of `docs/tasks/ai-studio-shoot-models-scenes.md`. | 🧪 Built (unmerged) — admin-bench only, owner testing; step 6 = un-draft + mobile auto-filter | 2026-08-30 | BUILD-LOG §2026-08-30 (demographic) |
| 55 | Feature Teardown — removed 24+ tables (checkout/orders, VTO, Fashion DNA, customer_interactions, store_affinities, bookings, referrals, lookbooks, spin-frame, size-recommend, partner-referrals, intention-finding, ghost-mannequin, studio-shoot job infra) + 17 dead enums + orphaned columns + plan-matrix rows via migration 082; gutted API/web/mobile routes, jobs, tests, shared constants, Prisma schema | ✅ Built | 2026-08-31 | `chore/remove-unwanted-features`, `docs/database/no-feature-want.md` |
| 56 | Onboarding Plan Selection — mandatory step 4 after GST, before "Done"; Demo (full Pro, no payment) + Starter/Growth/Pro cards; `demo_plan: true` grants PRO/TRIAL limits | ✅ Built | 2026-08-31 | BUILD-LOG §55 |
| 57 | Admin bodyless-POST 400 fix — unsuspend/feature/unfeature 400'd on Fastify v5 empty JSON body (`adminMutateOptions()` always sends `Content-Type: application/json`); tolerant `parseJsonAllowEmpty` parser + red error banner + real API error surfaced | ✅ Fixed | 2026-08-31 | BUILD-LOG §56 || 58 | Post-Teardown Recovery (PR #16) — 12 commits: avg_rating crash fix (`undefined.toFixed` on catalog pages), QR export deprecation fix, stale expo-router screen cleanup, direct gallery save via `expo-media-library`, onboarding plan selection + hard-delete retailer + in-app plan switch + DB-driven prices + native FB/IG OAuth + dashboard layout + OTP error surfacing + onboarding security gate + photo-delete permission fix (migration 083, GRANT DELETE on `product_photos`) | ✅ Merged | 2026-09-01 | BUILD-LOG §56, PR #16 |
| 59 | Monthly-Only Pricing + GST Engine — removed annual plans (PLAN_PRICING monthly-only, billing_period dropped, RAZORPAY_PLAN_IDS to 3, setup-plans creates monthly at gross base×1.18), removed annual toggle from web/mobile/marketing, DB `annual_paise` dropped (migration 085), base price is now ex-GST, `computeSubscriptionGst()` helper with CGST/SGST/IGST split, `GstInvoiceSequence` for gap-free invoice numbers, GST invoice PDF (pdfkit) + R2 upload + download routes, retailer/admin invoice list pages, GST reports wired to real CGST/SGST/IGST columns. **§59.1** post-review hardening (10 findings). **§59.2** launch fixes 2026-09-02 (PR #18 admin GST report crash — field mismatch `estimated_cgst`→`cgst` + `fmtINR` guard, live-verified; PR #18 mobile `plan-select` missing `useState`; PR #19 migration **088** — `platform_gst_profile` table was never created by any migration + `scripts/set-gst-profile.ps1` operator one-shot). **Migrations 086 → 087 → 088 applied in prod + `set-gst-profile.ps1` run (2026-09-04).** | ✅ Built + live | 2026-09-01 | BUILD-LOG §59, docs/tasks/subscription-gst-and-monthly-pricing.md |
| 60 | F-034 AI Image→Video for Social Promo (Reels/Shorts/Feed) — Fal.ai image-to-video (Seedance / WAN 2.x / Kling std / Kling Pro / Luma Ray 2, per-plan-tier model) via existing `FAL_API_KEY`; **credit-pack billing** (plan quota + overage packs), new `QuotaResourceType.AI_VIDEO`; admin-curated motion styles (reuse `studio_styles` + `kind` col). **ADMIN-TEST-ONLY for now (owner decision 2026-09-03):** Phase 1 bench built — `fal-video.ts` lib (+3/3 self-check), `POST /admin/photo-cleanup/image-to-video`, `docs/tasks/AI Motion Styles.html` (16 presets), "AI Promo Video" card on `/admin/photo-cleanup-test`; admin addon-pack management built (migration `089_resource_packs` applied, CRUD API, `/admin/resource-packs` screen — DB-driven, no hardcoded values). **Retailer phase (studio_styles `kind` 090 + quota seeds 091, queue/job, mobile modal, FB/IG publish) 🔴 hard-deferred until the bench is signed off.** Supersedes F-032 Phase B. | 🧪 Phase 1 ✅ built (admin only); Phase 2 (retailer) 🔴 deferred | 2026-09-03 | BUILD-LOG §2026-09-03, docs/tasks/image-to-video.md + image-to-video-phase2.md, PRO-REQUIREMENTS §30 |
| 61 | Launch-readiness cleanup (4 audit points) — (1) **P0 secrets verified live in Railway**: `COOKIE_SECRET`, `VAULT_DATABASE_URL` (B-005), `kanchuki_app.*` DB role not superuser (B-007), `TEAM_JWT_SECRET` (B-008), real `RAZORPAY_WEBHOOK_SECRET` (S-009), `REVALIDATION_SECRET` — was missing on the **web** service so `/api/revalidate` 401'd every call, owner added it (B-009); (2) DPDP passport notice URL `notice-versions.ts` `kanchuki.com/privacy/passport` → `kanchuki.app/privacy` (`182c5bf`); (3) marketing prose scrubbed of removed VTO / "Fashion DNA matching" / showroom claims in `pricing` / `for-retailers` / `how-it-works` / `MarketingSections.tsx` — customer preference capture kept (`1675f28`); (4) Play Store store-listing copy drafted → `docs/PLAY-STORE-LISTING.md` (short/full description, Business category, 8-screenshot shot-list) — screenshots + feature graphic + Console entry remain owner tasks (`a2308ce`). Audit doc §0b + `70d7ed2`. B-003 (admin hash) done 2026-09-03; B-004 (admin TOTP) descoped 2026-09-04 (owner — no login TOTP UI). Still open: B-002 replica only. | ✅ Built | 2026-09-03 | BUILD-LOG §2026-09-03, LAUNCH-READINESS-AUDIT §0b/§0c |
| 62 | 03-Sep-2026 review batch (11 items, commit `1843805`) — #1 store QR/slug auto-gen at onboarding; #2 customer OTP resend + MSG91 widget delivery (bypasses DLT-blocked sender); #3 OTP consent checkbox; #4 `/{store}` renders catalog behind the gate (no `/categories` hard hop) + link `prefetch`; #5 "Set as Main" photo control restored on product detail; #6 collection stats 4-across; #7 AI Studio bottom safe-area padding; #8 duration-chip className highlight; #9 Facebook OAuth https redirect (Meta rejects `kanchuki://`; dashboard redirect-URI/App-Mode/App-Review + EAS build remain owner-side); #10 shared-page CTAs side by side; #11 shared `ProductCtas` used by sheet + page | ✅ Built | 2026-09-03 | BUILD-LOG §2026-09-03 (03-Sep review batch), `docs/tasks/changes-03-09-2026.md` |
 
---

## India Retailer Growth Roadmap

**Detail:** `docs/INDIA-RETAILER-GROWTH.md`  
**Scope:** India-only small retailers  
**Prerequisite:** Phase 0 live + F-031 social publishing shipped  
**Status:** ✅ Built 2026-08-17 — backend (BUILD-LOG §44, migrations `055_growth_engine` + `056`/`057`) + **full mobile UI**: growth hub, campaigns, promotions, suppliers, inventory alerts, product videos, AI translate, AI search, campaign analytics, **AI Campaign Assistant** (BUILD-LOG §45–48) + admin festival calendar. **Referrals, showroom bookings, size recommendation removed** in `chore/remove-unwanted-features` (2026-08-31). **Phase I — GST-Ready Invoicing (I):** PDF generation + HSN mapping designed and ready for implementation. **Phase II — WhatsApp Native Catalog Sync (P):** Meta catalog API integration designed and ready for implementation.

### Sprint Block A — Quick Wins (4 weeks)
- ✅ QR Code Lead Capture (in-store + delivery)
- ✅ Customer Reactivation Campaigns
- ✅ Video Product Support
- ✅ Festival Campaign Analytics (analytics screen: festival/segment/hour/category/video-vs-photo; seasonal deep-dive deferred)
- ✅ Inventory Intelligence Alerts

### Sprint Block B — Customer Acquisition (6 weeks)
- ✅ Kanchuki Store Directory (`/stores` — city filter + search + featured pins)
- ❌ ~~Referral Program Engine~~ (removed in chore/remove-unwanted-features)
- ✅ Festival Campaign Templates (Diwali, Navratri, regional — admin calendar + campaigns)
- ✅ Smart Promotion / Discount Engine

### Sprint Block C — Shop Management (6 weeks)
- ✅ GST-Ready Invoicing (I — designed, PDF generation + HSN mapping ready)
- ✅ Supplier Management
- ❌ ~~Showroom / Try-On Room Booking~~ (removed in chore/remove-unwanted-features)

### Sprint Block D — Localization & Scale (6 weeks)
- ✅ Multi-Language AI (M — descriptions + campaign messages; AI search UI; voice via keyboard dictation). **Data groundwork landed** 2026-08-18: migration 063 (`retailers.preferred_locale`), shared `SUPPORTED_LOCALES` constant, API field. Full sub-tasks (native mic, PWA toggle, retailer UI toggle) deferred post-launch — no i18n infra exists yet (BUILD-LOG §50)
- ✅ Indian Size & Fit System (N — usual-size capture + per-customer recommendation + plus sizes XS/4XL–8XL + unstitched/blouse flags)
- ✅ WhatsApp Native Catalog Sync (P — built Phase II 2026-08-18: sync engine + webhook + retailer mobile UI + admin monitor, BUILD-LOG §49)

> **Removed from scope 2026-08-17:** Daily Khata (H) and Udhar credit (O) — no khata, no udhar.

### Sprint Block E — Advanced (Post-Phase 1)
- ✅ AI Campaign Assistant (E — NLP intent → WhatsApp message template + save-to-campaign)
- ✅ Instagram Business Publishing (F-031 = Facebook + WhatsApp native catalog)
- ✅ A/B Testing for Collections (S — per-variant product sets + stagger + variant stats + z-test winner)

---

### ✅ RESOLVED 2026-08-13: MSG91 OTP live-config session — wire-format fix + DLT finding

**What happened (2026-08-13):** the OTP feature from 2026-08-12 is deployed and *code-verified* end to end, but **real SMS delivery is blocked by MSG91 account setup, not code.** Two things shipped this session:

1. **MSG91 v5 SendOTP wire-format fix (commit `cbc55b8`, deployed + live):** the original send put `authkey` in an HTTP header and `template_id`/`mobile`/`otp` in the JSON body, but the v5 contract puts everything in the **query string** (`POST control.msg91.com/api/v5/otp?authkey=&template_id=&mobile=&otp=`), and failures come back as **HTTP 200 + `{"type":"error"}` in the body** — the old code only checked `res.ok`, so it reported "OTP sent" while no SMS was ever dispatched. Fixed in `apps/api/src/lib/msg91-otp.ts` (query-string + parse body, require `type:"success"`) and the same latent bug in the undeployed `supabase/functions/send-sms-hook/index.ts`. Also rode along: the onnxruntime CUDA-skip build fix in both Dockerfiles.

2. **DLT root cause (NOT a code bug — do not re-diagnose):** with the wire format fixed, MSG91 returns `type:"success"` but no SMS arrives and no delivery webhook event fires. **The sender ID is not DLT-registered** (user confirmed: "dlt not registered"). India requires TRAI DLT registration for every transactional sender ID; the carrier silently drops the SMS post-acceptance. The widget flow (mobile) works because MSG91's own provisioned route bypasses the per-customer DLT sender — yesterday's widget OTP arrived. **Fix is account-side only:** register the sender ID under MSG91 → Sender ID → DLT registration (2–7 working days). No code change needed.

**Verified this session:** new API build live (routes respond; `cbc55b8` confirmed in deployment metadata); `MSG91_AUTHKEY` + `MSG91_TEMPLATE_ID` set (probe flipped 500→401); `MSG91_WEBHOOK_SECRET` set and **matching the dashboard** (webhook probe → `{"received":true}`, wrong secret → 401); tests: msg91-otp 23/23, auth-msg91 11/11, webhooks/msg91 12/12, auth-team 9/9, web widget 13/13, API tsc clean. (The "transient Upstash cold-start / 2s connectTimeout" note once written here was a **misdiagnosis** — the real cause was the lazyConnect handshake race, **resolved later the same day**, see the "Redis handshake race" entry below. Do not re-blame timeouts.)

**Resolved 2026-09-04 (account/device side):**
1. ✅ **DLT registration** of the sender ID — done. API-path SMS delivery no longer blocked.
2. ✅ Mobile **EAS build** — built, tested send/verify on a real phone, working.
3. ✅ Web widget deployed with the `NEXT_PUBLIC_MSG91_*` build args.

**Still pending:**
4. Lock the verifyAccessToken response shape: `npx tsx scripts/verify-msg91-token.ts "<widget_jwt>"` with a real widget JWT.

**Railway debugging notes (don't re-investigate):** GraphQL `deployments(first:N)` = newest-first (the `last:` arg returned stale July entries — misleading); `deployment(id){diagnosis}` is null for build failures; `deploymentLogs(deploymentId, limit)` returns `[]` for failed builds (logs only visible in the dashboard build tab); `railway logs --deployment <full-id>` empty for failed builds and `--build`/`--deployment` flags can't combine. Old-image catch-all 401s unmatched paths — confirm the build is live before treating a 401 as a code bug.

### ✅ RESOLVED 2026-08-13: Redis handshake race — first-request-of-the-day OTP/social failure

**Symptom:** the FIRST Redis-touching request of the day (OTP send, social connect) failed with `Could not start a secure OTP session` / `Stream isn't writeable` — retries succeeded. The earlier entry above blamed the 2s `connectTimeout` vs Upstash idle-sleep cold start; **bumping to 10s did NOT fix it** (verified live — same failure with the longer timeout).

**Real root cause (commit `9f6b16a`, deployed `48784c77`):** all three short-fail ioredis clients (msg91-otp, public-cache, social OAuth state) were created with `lazyConnect: true` + `enableOfflineQueue: false`. With the offline queue disabled, a command sent BEFORE the `'ready'` handshake event rejects instantly with `Stream isn't writeable` — the connectTimeout never gets a chance, because the command dies on the still-connecting socket rather than on the timeout. The first command of every process/sleep cycle always hit this race.

**Fix:** removed `lazyConnect` from all three clients (eager connect at construction) and added an `awaitRedisReady()` helper — waits for the `'ready'` event (bounded by connectTimeout + retry), rejecting on `'error'` — to the two hard-fail paths (`sendOtpViaMsg91`/`verifyStoredOtp` in `apps/api/src/lib/msg91-otp.ts`, `createOAuthState`/`consumeOAuthState` in `retailers-social.ts`). public-cache stays fail-open (try/catch → direct compute) so its first-hit race degrades silently. FakeRedis test stand-ins gained `status: 'ready'` + `once`/`off`. **Verified live:** `POST /v1/auth/otp/send` → 200 `OTP sent` on the first attempt; API tsc clean, 443/443 tests.

**Do NOT re-diagnose OTP cold-start failures as timeout issues** — the lazyConnect race is fixed. Any future "Could not start a secure OTP session" is either Redis actually down/unreachable from Railway, or the MSG91 DLT sender-ID registration (see the entry above).

## Key Risks

1. **Retailer upload behavior** — many will try once and drop off
2. **WhatsApp API dependency** — Meta can change pricing/access

---

## Project File Index

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project memory + operational control policy + what's-built index |
| `docs/BUILD-LOG.md` | Full chronological build history — feature/incident detail tables (CLAUDE.md index points here) |
| `docs/PRO-REQUIREMENTS.md` | Full product requirements, user stories, acceptance criteria |
| `docs/PLAN.md` | Phase-by-phase roadmap with timelines |
| `docs/TECH-STACK.md` | Tech decisions with rationale |
| `docs/DESIGN.md` | UI/UX design system, screens, flows |
| `docs/DATABASE.md` | PostgreSQL schema, indexes, relationships |
| `docs/API.md` | REST API contracts, endpoints, auth |
| `docs/SECURITY.md` | Security model, OWASP, data privacy, governance |
| `docs/SCALING.md` | Scaling plan — 1M retailer/5M customer target, phased infra upgrades |
| `docs/MEMORY.md` | AI agent context and prompting strategy |
| `docs/SKILLS-AND-MCP.md` | Claude Code skills and MCP tools in use |
| `docs/final-research.md` | Market research foundation |
| `docs/PROGRESS.md` | Daily working log (session-by-session detail) |

---

## AI Agent Instructions

When working in this repo:
1. **Always check `docs/PRO-REQUIREMENTS.md`** before adding any feature
2. **Always check `docs/DATABASE.md`** before writing schema migrations
3. **Always check `docs/SECURITY.md`** before handling user data or photos, especially §12-18 (governance)
4. **Photo data is sensitive** — follow consent/deletion rules in SECURITY.md
5. **GST compliance is non-negotiable** — every sale needs GST invoice support
6. **Target INR pricing** — never hardcode USD anywhere
7. **Operational control** — follow AI Agent Operational Control Policy above. No auto-operations without human approval.
8. **Security tests** — after any checkout or auth changes, run: `npx vitest run src/routes/security.test.ts`
9. **Admin login tests** — after any admin auth changes, run: `npx vitest run src/routes/admin.login.test.ts`
10. **Docs must track commits** — when a feature commit lands, update its status ("Planned"→"Built") + date in CLAUDE.md (or its index + BUILD-LOG.md), `docs/PLAN.md`, and `docs/PRO-REQUIREMENTS.md` in the same session. Stale status here (F-018/F-019 sat marked "nothing built" after the build commit) caused a wrong status report on 2026-07-28 — check `git log` against doc status before trusting either.
11. **Feature detail goes in `docs/BUILD-LOG.md`** — CLAUDE.md keeps only the one-line index. When a feature ships, append the full build table to BUILD-LOG.md and add/refresh its row in the CLAUDE.md index.
