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
2. **Fashion DNA CRM** — customer preference engine (color, style, budget, occasion)
3. **WhatsApp Commerce** — share product collections via link, no app needed
4. **Virtual Try-On (VTO)** — customer uploads photo, tries outfits remotely
5. **B2B Supply Network** — Manufacturer → Wholesaler → Retailer catalog chain

**Unique moat:** Only platform combining AI Try-On + Fashion DNA CRM + WhatsApp Commerce + works without a website.

---

## User Roles

| Role | Primary Need | App Surface |
|------|-------------|-------------|
| Retailer | Upload products, search for customers, share via WhatsApp | Mobile app (React Native) |
| Customer | View collection, try-on, favorite, enquire | Mobile web (Next.js PWA) |
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

**NOT in MVP:** VTO, WhatsApp API automation, Fashion DNA AI matching, Manufacturer/Wholesaler layer, UPI payment tracking

---

## Tech Stack (Locked)

| Layer | Choice | Why |
|-------|--------|-----|
| Retailer App | React Native (Expo) | Cross-platform, fast build |
| Customer Web | Next.js 14 (App Router) | PWA, SEO, SSR |
| Backend API | Node.js + Fastify | Fast, TypeScript native |
| AI Tagging | Claude Vision API (claude-3-5-sonnet) | Best for Indian fashion understanding |
| VTO Engine | **Fashion V-Tone v1.5 (self-hosted)** | Apache 2.0, maskless, CPU-capable |
| Database | PostgreSQL 16 + pgvector | Vector search for Fashion DNA |
| Cache | Redis | Session, rate limit, job queue |
| Storage | Cloudflare R2 | Cost-effective image storage |
| Auth | Supabase Auth | Phone OTP for retailers |
| Payments | Razorpay | UPI + INR subscriptions |
| WhatsApp | Meta Cloud API (official) | Phase 2 |
| Deployment | Railway (API+Web) + optional CPU server for V-Tone | No GPU required |
| CDN | Cloudflare | Free tier, fast India PoPs |

---

## Pricing Model

| Plan | Monthly | Annual |
|------|---------|--------|
| Starter | ₹999 | ₹9,999 |
| Growth | ₹2,499 | ₹24,999 |
| Pro | ₹4,999 | ₹49,999 |

Payment: Razorpay (UPI first). Annual discount 20%.

---

## Key Constraints

- **GST invoicing REQUIRED** — legal compliance for all Indian retail software
- **INR pricing only** — no USD, no forex friction
- **Offline-first design** — retailer app must work with poor connectivity
- **Photo-first UX** — no manual form filling for product entry
- **AI try-on cost budget** — ₹5-15/image, must be covered by plan pricing
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
- **Trigger deployments** — manual only via Railway dashboard
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
| 3 | L2 Ecommerce Checkout (cart → address → pay, per-retailer Razorpay; WhatsApp stays share-only) | ✅ Built | 2026-08-18 | BUILD-LOG §3 |
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
| 37 | Play Store Launch Batch — web billing, privacy disclosures, location removal, launch checklist | ✅ Built | 2026-08-10 | BUILD-LOG §37 |
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
| 50 | Customer Profile P0-P1 — VTO self-serve enabled, showroom booking form, product review list (social proof), seasonal collections + lookbooks surfacing, promotion/discount alert banner | ✅ Built | 2026-08-21 | `docs/customer/customer-profile-req.md` §12 |
| 51 | Customer Profile P2 — fabric glossary (+25 fabrics), recently viewed row, restock notify, saved size capture, 5-question style quiz, AI Stylist v1 (Claude-powered chat), Unstitched Design Gallery (DesignReference schema + migration 069 + admin CRUD + customer gallery) | ✅ Built | 2026-08-21 | `docs/customer/customer-profile-req.md` §12 |
| 52 | Customer Profile P3 — regional weave/style filters (12 Indian regions), customer referral rewards (code + WhatsApp share), family/gifting mode (save sizes for family members) | ✅ Built | 2026-08-21 | `docs/customer/customer-profile-req.md` |
| 53 | Add-Product raw-photo default (auto-clean OFF — raw saved as-is) + restored per-photo Background/Shadow controls on product detail (`ProductPhotoControls`, dropped in the `b0c3747` redesign) + AI Studio Shoot per-model prompts (Fashion Models no longer collapse to one identical image) + Admin backdrop library: delete (`DELETE /admin/background-images/:id` + trash button), click-thumbnail full-size lightbox, AI scene-naming on upload (`name` optional → `runVisionAsk`) | ✅ Built + live | 2026-08-29 | BUILD-LOG §2026-08-29 |
 
---

## India Retailer Growth Roadmap

**Detail:** `docs/INDIA-RETAILER-GROWTH.md`  
**Scope:** India-only small retailers  
**Prerequisite:** Phase 0 live + F-031 social publishing shipped  
**Status:** ✅ Built 2026-08-17 — backend (BUILD-LOG §44, migrations `055_growth_engine` + `056`/`057` — the `GROWTH_ENGINE` enum value + plan-feature rows are split out because PostgreSQL 55P04 forbids using a freshly-added enum value in the same transaction — all routes gated behind the `GROWTH_ENGINE` plan feature) + **full mobile UI**: growth hub, campaigns, referrals, promotions, suppliers, showroom bookings, inventory alerts, product videos, AI translate, AI search, campaign analytics, **AI Campaign Assistant** (BUILD-LOG §45–48) + admin festival calendar. **M, N, R, S, E completed** (BUILD-LOG §47–48): campaign/WhatsApp message translation + AI-search screen (voice via keyboard dictation), usual-size capture + per-customer size recommendation (usual → purchase history → F-102c chart) + plus sizes (XS, 4XL–8XL), campaign analytics screen (festival/segment/hour/category/video-vs-photo/A-B), collection A/B (per-variant product sets + stagger + z-test significance), AI campaign assistant (NLP intent → WhatsApp message template + save-to-campaign). **Migration 055–058 not yet applied** (Supabase SQL Editor / `prisma migrate deploy`); per-route growth tests pending. Not built: M native mic + PWA/retailer UI language toggle, R seasonal deep-dive dashboards, S auto-built variant collection links (needs a hidden-collection status) remain future work. **Phase I — GST-Ready Invoicing (I):** PDF generation + HSN mapping designed and ready for implementation. **Phase II — WhatsApp Native Catalog Sync (P):** Meta catalog API integration designed and ready for implementation.

### Sprint Block A — Quick Wins (4 weeks)
- ✅ QR Code Lead Capture (in-store + delivery)
- ✅ Customer Reactivation Campaigns
- ✅ Video Product Support
- ✅ Festival Campaign Analytics (analytics screen: festival/segment/hour/category/video-vs-photo; seasonal deep-dive deferred)
- ✅ Inventory Intelligence Alerts

### Sprint Block B — Customer Acquisition (6 weeks)
- ✅ Kanchuki Store Directory (`/stores` — city filter + search + featured pins)
- ✅ Referral Program Engine
- ✅ Festival Campaign Templates (Diwali, Navratri, regional — admin calendar + campaigns)
- ✅ Smart Promotion / Discount Engine

### Sprint Block C — Shop Management (6 weeks)
- ✅ GST-Ready Invoicing (I — designed, PDF generation + HSN mapping ready)
- ✅ Supplier Management
- ✅ Showroom / Try-On Room Booking

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

**Still pending (account/device side):**
1. **DLT registration** of the sender ID (blocks API-path SMS delivery).
2. Mobile **EAS build** (Expo Go can't run the native widget module; `EXPO_PUBLIC_MSG91_WIDGET_ID`/`_TOKEN_AUTH` already in `apps/mobile/eas.json`) — test send/verify/invisible-mode on a real phone.
3. Web widget needs a deploy with the `NEXT_PUBLIC_MSG91_*` build args (in `apps/web/Dockerfile`).
4. Lock the verifyAccessToken response shape: `npx tsx scripts/verify-msg91-token.ts "<widget_jwt>"` with a real widget JWT.

**Railway debugging notes (don't re-investigate):** GraphQL `deployments(first:N)` = newest-first (the `last:` arg returned stale July entries — misleading); `deployment(id){diagnosis}` is null for build failures; `deploymentLogs(deploymentId, limit)` returns `[]` for failed builds (logs only visible in the dashboard build tab); `railway logs --deployment <full-id>` empty for failed builds and `--build`/`--deployment` flags can't combine. Old-image catch-all 401s unmatched paths — confirm the build is live before treating a 401 as a code bug.

### ✅ RESOLVED 2026-08-13: Redis handshake race — first-request-of-the-day OTP/social failure

**Symptom:** the FIRST Redis-touching request of the day (OTP send, social connect) failed with `Could not start a secure OTP session` / `Stream isn't writeable` — retries succeeded. The earlier entry above blamed the 2s `connectTimeout` vs Upstash idle-sleep cold start; **bumping to 10s did NOT fix it** (verified live — same failure with the longer timeout).

**Real root cause (commit `9f6b16a`, deployed `48784c77`):** all three short-fail ioredis clients (msg91-otp, public-cache, social OAuth state) were created with `lazyConnect: true` + `enableOfflineQueue: false`. With the offline queue disabled, a command sent BEFORE the `'ready'` handshake event rejects instantly with `Stream isn't writeable` — the connectTimeout never gets a chance, because the command dies on the still-connecting socket rather than on the timeout. The first command of every process/sleep cycle always hit this race.

**Fix:** removed `lazyConnect` from all three clients (eager connect at construction) and added an `awaitRedisReady()` helper — waits for the `'ready'` event (bounded by connectTimeout + retry), rejecting on `'error'` — to the two hard-fail paths (`sendOtpViaMsg91`/`verifyStoredOtp` in `apps/api/src/lib/msg91-otp.ts`, `createOAuthState`/`consumeOAuthState` in `retailers-social.ts`). public-cache stays fail-open (try/catch → direct compute) so its first-hit race degrades silently. FakeRedis test stand-ins gained `status: 'ready'` + `once`/`off`. **Verified live:** `POST /v1/auth/otp/send` → 200 `OTP sent` on the first attempt; API tsc clean, 443/443 tests.

**Do NOT re-diagnose OTP cold-start failures as timeout issues** — the lazyConnect race is fixed. Any future "Could not start a secure OTP session" is either Redis actually down/unreachable from Railway, or the MSG91 DLT sender-ID registration (see the entry above).

## Key Risks

1. **VTO quality for ethnic wear** — saree draping, unstitched suit layering hard for existing APIs
2. **Retailer upload behavior** — many will try once and drop off
3. **WhatsApp API dependency** — Meta can change pricing/access
4. **AI cost per try-on** — margin tight at ₹999/month plan

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
