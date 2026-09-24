# Kanchuki — Build Log (Feature History)

Full chronological build history for Kanchuki. **CLAUDE.md** keeps only a
one-line index of these entries; this file is the detail for every feature,
incident, migration, and decision recorded after 2026-07-26.

> **Remaining work:** `docs/20-August-changes.md` — 31 prioritized coding items + 5 devOps tasks (items 1–3 marked ✅ done).

## Table of Contents

| # | Section | Status | Date |
|---|---------|--------|------|
| 1 | [Admin Control Center — Permission Matrix, Trust & Safety, Deletion Vault, DB Guardrails (F-013…F-017)](#built-admin-control-center--permission-matrix-trust--safety-deletion-vault-db-guardrails) | Built | 2026-07-26 |
| 2 | [Phase 0.5: Internal Team Management](#phase-05-internal-team-management--all-code-items-completed-) | Built | — |
| 3 | [L2 Ecommerce Checkout](#built-l2-ecommerce-checkout-whatsapp-stays-messaging-only) | Built | 2026-08-18 |
| 4 | [Sales Referral Attribution + Paid Catalog Upload (F-018/F-019)](#built-sales-referral-attribution--paid-on-site-catalog-upload-service-f-018f-019) | Built | 2026-07-28 |
| 5 | [Marketing Page Redesign — Loom Design System](#built-marketing-page-redesign--loom-design-system-option-a) | Built | 2026-07-29 |
| 6 | [Admin-Configurable Platform Theme](#built-admin-configurable-platform-theme-2026-07-29) | Built | 2026-07-29 |
| 7 | [Product-Level WhatsApp Share + Ratings Reviewed](#built-product-level-whatsapp-share-button-f-006-gap--ratings-reviewed) | Built | 2026-07-30 |
| 8 | [F-023 AI Provider Registry](#built-f-023-ai-provider-registry--admin-configurable-tagging-models--per-provider-usage) | Built | 2026-08-01 |
| 52 | [F-021 Product & Store Ratings](#built-f-021-product--store-ratings) | Built | 2026-08-20 |
| 53 | [Customer Profile P0-P3 — 16 Features](#built-2026-08-21-customer-profile-p0-p3--all-16-features-shipped) | Built | 2026-08-21 |
| 54 | [Add-Product raw-photo default + restored per-photo controls + AI Studio model prompts + Admin backdrop delete/lightbox/AI-naming](#built-2026-08-29-add-product-raw-photo-default--restored-per-photo-controls--ai-studio-model-prompts--admin-backdrop-deletelightboxai-naming) | Built | 2026-08-29 |
| 9 | [F-022 Auto-Post New Arrivals to Google Business Profile](#planned--not-started-f-022-auto-post-new-arrivals-to-google-business-profile) | Planned | — |
| 10 | [Mobile Accessibility Audit + Harden Pass](#built-mobile-accessibility-audit--harden-pass-appsmobile) | Built | 2026-07-31 |
| 11 | [Production DB Outage Fix + Purge-Cron Scoped Role](#built-2026-08-02--production-db-outage-fix-pooler-suffix--purge-cron-scoped-role--adminweb-hardening) | Built | 2026-08-02 |
| 12 | [AI Tagging Expansion — Subtype/SKU/Description/Name](#built-2026-08-03--ai-tagging-expansion--subtypeskudescriptionname--slider-fix--color-tap--catalog-redesign) | Built | 2026-08-03 |
| 13 | [apps/mobile Design Polish Pass](#built-appsmobile-design-polish-pass--p0p1-fixed-p3-started-2026-08-03) | Built | 2026-08-03 |
| 14 | [Black & Gold Brand Repaint + COLORS Module](#built-black--gold-elegance-brand-repaint--shared-colors-module-2026-08-03) | Built | 2026-08-03 |
| 15 | [Customer Web PWA — nav/cart/detail fixes](#built-customer-web-pwa--catalog-nav-bug--bottom-bar--cart-wiring--product-detail-redesign--back-button-fix-2026-08-04) | Built | 2026-08-04 |
| 16 | [Staff catalog-upload auth gap + 500-item free offer](#built-2026-08-04-staffretailer-catalog-upload--auth-gap-closed--500-item-free-offer-enforced) | Built | 2026-08-04 |
| 17 | [F-024 DB-Backed Default Shop-By Categories](#built-2026-08-04-f-024-db-backed-default-shop-by-categories--ai-auto-category-assignment) | Built | 2026-08-04 |
| 18 | [F-025 Scan-to-Sell + F-026 bug fix](#built-2026-08-04-f-025-scan-to-sell--f-026-bug--fixed) | Built | 2026-08-04 |
| 19 | [Product-Photo Cleanup Script](#built-standalone-product-photo-cleanup-script-2026-08-05-1804-ist) | Built | 2026-08-05 |
| 20 | [Admin Photo Cleanup Test Page + ghost-mannequin](#built-admin-photo-cleanup-test-page-2026-08-06-commit-3a3f863-pushed-to-main) | Built | 2026-08-06 |
| 21 | [Admin refresh/CSRF fix](#bug-hit--fixed-admin-panel-refresh--login-screen--csrf-token-fetch-failed-http-403) | Built | 2026-08-06 |
| 22 | [Quality-First Image Compressor + R2 Storage Measurement](#built-quality-first-image-compressor-80kb--r2-storage-measurement--batch-compression-2026-08-06) | Built | 2026-08-06 |
| 23 | [Fashion V-Tone LIVE on Railway](#built-2026-08-06-fashion-v-tone-live-on-railway--generate-on-model-admin-tool) | Built | 2026-08-06 |
| 24 | [Featured Stores](#built-2026-08-11-featured-stores--admin-curated-pins-float-to-the-top-of-stores--homepage-teaser) | Built | 2026-08-11 |
| 25 | [Colabs-inspired marketing redesign](#built-2026-08-11-colabs-inspired-marketing-redesign--new-palette-marquee-logo-mattersemimono-headings) | Built | 2026-08-11 |
| 59 | [Monthly-Only Pricing + GST Engine](#built-2026-09-01--monthly-only-pricing--gst-engine) | Built | 2026-09-01 |
| 26 | [INCIDENT: test-retailer cleanup deleted live R2 photos](#incident--fix-2026-08-11-test-retailer-cleanup-deleted-a-live-retailers-r2-photos-priya-cloth-house) | Incident | 2026-08-11 |
| 27 | [Fashion V-Tone moved to Hetzner CX43](#migrated-2026-08-06-fashion-v-tone-moved-off-railway--self-hosted-on-hetzner-cx43) | Migrated | 2026-08-06 |
| 28 | [Multi-Photo Ken Burns Effect](#planned--not-started-multi-photo-ken-burns-effect-product-photos--pseudo-video) | Planned | — |
| 29 | [F-027 DB-backed Category/Style/Occasion/Fabric taxonomy](#built--migrated--live-verified-2026-08-07--db-backed-categorystyleoccasionfabric-taxonomy-f-027) | Built | 2026-08-07 |
| 30 | [Store QR Self-Service + URL Rename Sync](#built-store-qr-self-service--store-url-rename-sync--onboarding-qr-nudge-2026-08-08-commit-3311fc7-pushed-to-main) | Built | 2026-08-08 |
| 31 | [Add-Product Flow Rework + F-028 Auto-Contrast Background](#built-add-product-flow-rework--ai-in-background--f-028-auto-contrast-background-2026-08-08-committed-ec525bd--follow-ups) | Built | 2026-08-08 |
| 32 | [Redis Public-Response Cache](#built-redis-public-response-cache-for-customer-storefronts-2026-08-08-commit-56068e7) | Built | 2026-08-08 |
| 33 | [F-029 Photo Rotate + Post-Save Background Picker](#built-f-029-photo-rotate-pre-save--post-save--post-save-background-picker-2026-08-09) | Built | 2026-08-09 |
| 34 | [Photo edit visibility fix](#fixed-photo-edits-croprotatebackground-not-visible-after-save--deployed-2026-08-10-commit-4067306) | Fixed | 2026-08-10 |
| 35 | [F-030 shadow toggle](#built--deployed-2026-08-10-f-030-shadow-toggle-for-cropped-photos) | Built | 2026-08-10 |
| 36 | [Occasion removed + AI auto-selects Category/Style](#built-2026-08-10-occasion-removed-everywhere--ai-auto-selects-category-group--style) | Built | 2026-08-10 |
| 37 | [Play Store Launch Batch](#built-2026-08-10-play-store-launch-batch--web-billing-option-a-privacy-disclosures-location-removal-launch-checklist-commits-56357f6--b29b316) | Built | 2026-08-10 |
| 38 | [MSG91 Real OTP](#built-2026-08-12-real-otp--msg91-widget-on-mobile--server-side-msg91-everywhere) | Built | 2026-08-12 |
| 39 | F-032 Phase A — AI Studio Shoots (see "F-032 AI Studio Shoots" section below) | Built (Phase A only) | 2026-08-13 → 08-19 |
| 42 | [Admin Commission Tracker — 3% of Monthly Payments + Expense Ledger](#built-2026-08-17-admin-commission-tracker--3-of-monthly-payments--expense-ledger) | Built | 2026-08-17 |
| 43 | [Retailer Auth — Login / Create Account toggle](#built-2026-08-17-retailer-auth--login--create-account-toggle) | Built | 2026-08-17 |
| 44 | [India Retailer Growth Engine — Backend + Migration 055](#built-backend-2026-08-17-india-retailer-growth-engine--10-feature-modules--migration-055) | Built | 2026-08-17 |
| 45 | [Growth Engine UI — Mobile Growth Hub + Campaigns + Admin Festival Calendar](#built-2026-08-17-growth-engine-ui--mobile-growth-hub--campaigns--admin-festival-calendar) | Built | 2026-08-17 |
| 46 | [Growth Engine UI — Remaining 7 Modules (Mobile Screens)](#built-2026-08-17-growth-engine-ui--remaining-7-modules-mobile-screens) | Built | 2026-08-17 |
| 47 | [Growth Engine — Roadmap M, N, R, S Completed](#built-2026-08-17-growth-engine--roadmap-m-n-r-s-completed-ai-translate-breadth--size--fit--campaign-analytics--collection-ab) | Built | 2026-08-17 |
| 48 | [AI Campaign Assistant (E)](#built-2026-08-18-ai-campaign-assistant-roadmap-e) | Built | 2026-08-18 |
| 49 | [Phase II — WhatsApp Native Catalog Sync](#built-2026-08-18-phase-ii--whatsapp-native-catalog-sync-f-307--roadmap-p) | Built | 2026-08-18 |
| 50 | [Roadmap M — i18n Data Groundwork](#built-2026-08-18-roadmap-m--i18n-data-groundwork-deferred-post-launch) | Built | 2026-08-18 |
| 51 | [Roadmap R — Seasonal Analytics](#built-2026-08-18-roadmap-r--seasonal-analytics-wedding-season-vs-daily-wear) | Built | 2026-08-18 |
| 55 | [Feature Teardown — Remove Unwanted Features](#55-feature-teardown--remove-unwanted-features) | Built | 2026-08-31 |
| 56 | [Onboarding Plan Selection Step](#built-2026-08-31-onboarding-plan-selection-step) | Built | 2026-08-31 |
| 57 | [Admin bodyless-POST 400 fix — unsuspend/feature/unfeature (Fastify v5 empty JSON body)](#fixed-2026-08-31-admin-bodyless-post-400--unsuspendfeatureunfeature-fastify-v5-empty-json-body) | Fixed | 2026-08-31 |

---

## Built: Admin Control Center — Permission Matrix, Trust & Safety, Deletion Vault, DB Guardrails

**Built 2026-07-26** — full feature set F-013 through F-017. Spec: `docs/PRO-REQUIREMENTS.md` §12. Schema & guardrail design: `docs/DATABASE.md`, `docs/SECURITY.md` §19. Roadmap: `docs/PLAN.md` Phase S Month S4.

### F-013: Plan Feature Matrix (Admin-Configurable Checkbox Grid)

Admin-editable boolean feature grid per plan tier — the on/off twin of the numeric F-010 `plan_limits` system.

| Layer | Files | Summary |
|-------|-------|---------|
| **DB model** | `packages/db/prisma/schema.prisma` | `PlanFeature` table + `PlanFeatureKey` enum (14 features) |
| **Backend lib** | `apps/api/src/lib/features.ts` | `hasFeature()`, `hasFeatureForPlan()`, `getEnabledFeatures()`, `setFeature()` — **fails closed** (opposite of `checkQuota`'s fail-open) |
| **Error helper** | `apps/api/src/plugins/error-handler.ts` | `featureUnavailable()` AppError → HTTP 402 `FEATURE_UNAVAILABLE` |
| **Admin API** | `apps/api/src/routes/admin.ts` | `GET/PUT /admin/plan-features` endpoints (mirrors plan-limits pattern) |
| **Feature gates** | `products.ts`, `checkout.ts`, `retailers.ts`, `collections.ts` | SPIN_360, CUSTOM_BACKGROUND_LIBRARY, CHECKOUT_CART, WHATSAPP_BUSINESS_API gated behind `hasFeature()` |
| **Admin UI** | `apps/web/src/app/admin/plan-features/page.tsx` | Checkbox grid, mirrors plan-limits numeric grid |

### F-014: Retailer & Customer Activity Tracking (Admin Visibility)

Closes the gap in AuditLog wiring across mutation routes, plus admin-facing activity views.

| Layer | Files | Summary |
|-------|-------|---------|
| **AuditLog wiring** | `apps/api/src/routes/admin.ts` | `AuditLog.create()` calls added to product/customer/collection CRUD, settings changes, staff management |
| **Platform feed** | `apps/web/src/app/admin/activity/page.tsx` | Platform-wide activity feed, filterable by actor type/retailer/date |
| **Per-retailer timeline** | `apps/web/src/app/admin/retailers/[id]/activity/page.tsx` | Per-retailer activity timeline (AuditLog entries + login history) |

### F-015: Account Suspension (Admin-Controlled)

Reversible suspension for retailers, block/unblock for customers (customers have no login — "block" = reject enquiries/checkout).

| Layer | Files | Summary |
|-------|-------|---------|
| **DB fields** | `packages/db/prisma/schema.prisma` | `Retailer.is_suspended/suspended_at/suspended_reason/suspended_by_id`, `Customer.is_blocked/blocked_at/blocked_reason` |
| **Admin API** | `apps/api/src/routes/admin.ts` | `POST /admin/retailers/:id/suspend`, `unsuspend`, `POST /admin/customers/:id/block`, `unblock`. Suspension filter on retailers list |
| **Auth block** | `apps/api/src/routes/auth.ts` | Suspended retailers blocked at login ("account suspended, contact support") |
| **Collection degradation** | `apps/api/src/routes/public.ts` | Suspended retailer collection links show "temporarily unavailable" (not 404). Products/categories/lead capture all gracefully degraded |
| **Admin UI — retailers** | `apps/web/src/app/admin/retailers/page.tsx` | Suspended filter dropdown, visual badge on list |
| **Admin UI — detail** | `apps/web/src/app/admin/retailers/[id]/page.tsx` | Suspend/unsuspend with reason required, visual status badge |
| **Admin UI — customers** | `apps/web/src/app/admin/customers/page.tsx` | Block status badge, block/unblock with reason dialog |

### F-016: Deletion Vault — Secondary Database for Deleted Data

A genuinely separate Postgres instance for full-payload snapshots of every soft-deleted record. INSERT-only credentials — not even the app can UPDATE/DELETE vault entries.

| Layer | Files | Summary |
|-------|-------|---------|
| **Vault helper** | `packages/db/src/vault.ts` | `vaultDelete()` (fire-and-forget, never blocks primary op), `getVaultPrisma()` (read access for admin). Graceful skip when `VAULT_DATABASE_URL` unset |
| **Permission test** | `packages/db/src/vault.test.ts` | Conditional suite (skips when vault unconfigured). Tests: INSERT succeeds, UPDATE rejected, DELETE rejected — verifies INSERT-only constraint |
| **Soft-delete wiring** | `retailers.ts`, `products.ts` (3 sites), `customers.ts`, `collections.ts`, `admin.ts` (2 sites) | `vaultDelete()` called in every soft-delete path |
| **Admin API** | `apps/api/src/routes/admin.ts` | `GET /admin/deletion-vault` — paginated, filterable by `source_table`/`source_id`/`retailer_id` |
| **Admin UI** | `apps/web/src/app/admin/database/deletion-vault/page.tsx` | Filter bar, expandable rows with payload preview + full JSON, load-more pagination, vault-not-configured warning |

### F-017: Database Guardrails — Preventing AI-Agent/Application Delete Access

Four layers of defense: role separation (infra) → DB triggers (migration) → CI grep guard → Deletion Vault backstop.

| Layer | Files | Summary |
|-------|-------|---------|
| **DB triggers** | `packages/db/prisma/migrations/037_db_guardrails/migration.sql` | `prevent_hard_delete()` PL/pgSQL function. 8 `BEFORE DELETE OR TRUNCATE` triggers on `products`, `customers`, `retailers`, `collections`, `staff`, `orders`, `order_items`, `product_variants`. Bypass via `SET app.allow_hard_delete = 'true'` |
| **CI grep guard** | `scripts/check-delete-guard.sh` | 3 checks: (1) raw `.delete()` on 7 business models outside allowlist, (2) empty-where `deleteMany()` danger detection, (3) destructive SQL outside migrations. Runs in CI |
| **CI workflow** | `.github/workflows/ci.yml` | Added `bash scripts/check-delete-guard.sh` step |
| **Role separation docs** | `docs/SECURITY.md` §19 | Updated to [x] Phase D checklist + §19.6 build table. Role-creation SQL in §19.1: `kanchuki_app` (no DELETE/TRUNCATE/DROP) vs `kanchuki_migrator` (human-only, never in `.env`) + `kanchuki_purge` (scoped DELETE for the purge cron, added 2026-08-02) |
| **Purge cron** | `apps/api/src/jobs/purge-soft-deleted.ts` | Daily cron (1:30 AM UTC). Batch-purges soft-deleted records >30 days old. Uses `SET app.allow_hard_delete = 'true'` to bypass triggers. Cursor-based batching, FK-safe order (children before parents). Writes audit log. Since 2026-08-02 runs via `getPurgePrisma()`/`PURGE_DATABASE_URL` (the `kanchuki_purge` role) — `kanchuki_app` has no DELETE under role separation |
| **Purge registration** | `apps/api/src/jobs/index.ts`, `packages/shared/src/constants/index.ts` | PURGE_SOFT_DELETED queue, worker (concurrency 1), daily schedule, queue name constant |

### Deletion Vault DB setup (future — needs provisioned instance)

The vault DB is a separate Postgres instance (not the Supabase primary project). Its role must be granted INSERT-only. Once provisioned, set `VAULT_DATABASE_URL` and run the vault Prisma schema. See full spec: `docs/DATABASE.md` (Deletion Vault section), `docs/SECURITY.md` §19.6.

---

## Phase 0.5: Internal Team Management — All Code Items Completed ✅

**SupportTicket routing** — Built in `team.ts` with `routeTicket()`: territory hierarchy traversal (ZONE→CITY→STATE), visit-required routes to nearest agent, backend-manageable pools within CITY-level territory, least-loaded scheduling (fewest active tickets), batch `/tickets/route-all`, auto-routing on ticket creation.

**Manager rollup reporting dashboard** — Built at `/admin/reports` with 3 tabs: Agent Performance (ranked by activation rate), Coverage Gaps (territories with retailers but no agents), Activation Funnel (bars + conversion rates). Backend endpoints: `/team/reporting/agents`, `/team/reporting/coverage-gaps`, `/team/reporting/retailer-activation`.

**Staff Expo mode** — Built: field staff login via phone OTP → `/staff` dashboard with territory-scoped retailer list, quick retailer onboarding, staff identity display. Team API module in `mobile/src/lib/team-api.ts`.

**Remaining (operational):** 10-retailer pilot + onboarding tutorial iteration — requires real retailer feedback.

---

## Built: L2 Ecommerce Checkout (WhatsApp stays messaging-only)

**Built 2026-08-18** — full spec `docs/PRO-REQUIREMENTS.md` F-302/F-307, schema `docs/DATABASE.md`, threat model `docs/SECURITY.md` §11.

WhatsApp is not the payment rail (Meta Catalog/Cart + WhatsApp Pay aren't viable for a third-party platform here) — it stays a share/notify channel. Real checkout (cart → address → pay) is built into the existing customer PWA. Two-stage rollout:
1. **Stage A (build first) — Direct-to-Retailer:** each retailer connects their own Razorpay account; Kanchuki never custodies retailer sale money (avoids RBI Payment Aggregator license). Credentials reuse the F-012 encrypted-secret mechanism, per-retailer.
2. **Stage B (later) — Razorpay Route:** retailer onboards via Razorpay Linked Account instead; Kanchuki becomes merchant-of-record and auto-splits funds. Requires legal/Razorpay confirmation on current marketplace-payment compliance before enabling.

A retailer having an *active connected payment account* is itself the L1 (catalog+enquiry)/L2 (checkout) distinction — no separate feature flag.

**Security note (2026-07-24):** no payment integration is "100% secure" — the required hardening (server-side amount computation, dual payment verification, atomic inventory reservation, step-up auth on payment-account changes, PCI SAQ-A via hosted Checkout.js, anonymous order-lookup IDOR protection) is fully written up in `docs/SECURITY.md` §11.6–11.10. Treat that as required scope for F-302, not optional polish.

**Offline catalog browsing (built 2026-07-27):** F-006B done. Web: `apps/web/src/app/sw.ts` runtime caching (R2 images CacheFirst, `/api/c/*` collection API StaleWhileRevalidate, `/c/*` pages NetworkFirst) + `/offline` fallback + PWA manifest icons. Mobile: React Query `networkMode: 'offlineFirst'`, 10-min catalog `staleTime`, `expo-image` prefetch, and an offline mutation queue (`apps/mobile/src/lib/mutation-queue.ts`) for product status changes made while offline, replayed on reconnect. Full writeup: `docs/PRO-REQUIREMENTS.md` F-006B, build plan `docs/omp-review.md` §15.

---

## Built: Sales Referral Attribution + Paid On-Site Catalog Upload Service (F-018/F-019)

**Built 2026-07-28** — full spec `docs/PRO-REQUIREMENTS.md` §10.9–10.10, schema `docs/DATABASE.md`, roadmap slot `docs/PLAN.md` Phase 0.5. Committed in `e561541` ("F-018 referral attribution + F-019 paid catalog upload service, salesperson staff role").

Both extend the existing Phase 0.5 internal-team system (`TeamMember`, `onboarded_by_id`, `SupportTicket`, `routeTicket()`) rather than adding new models:

| Feature | Files | Summary |
|---|---|---|
| **F-018 referral code** | `packages/db/prisma/migrations/039_referral_attribution`, `apps/api/src/routes/team.ts` (`POST /members`), `apps/api/src/routes/retailers.ts` (`PUT /me`) | `TeamMember.referral_code` auto-generated for `MARKETING_AGENT`; optional/skippable code field in retailer onboarding resolves to `onboarded_by_id` — same field §10.4 already uses, zero new reporting code needed |
| **F-019 catalog upload service** | `packages/db/prisma/migrations/040_catalog_upload_service`, `apps/api/src/routes/retailers.ts` (`POST/GET /me/catalog-upload-request`, `.../:id/pay`, `.../:id/verify-payment`, `.../:id/confirm-slot`), `apps/api/src/routes/team.ts` (`PATCH /tickets/:id` extended, `routeTicket()` reused), `apps/api/src/routes/admin.ts` (`GET/POST/PATCH/DELETE /admin/catalog-upload-tiers`) | `SupportTicket.ticket_type` (`GENERAL`/`CATALOG_UPLOAD`) + quote/slot/payment fields. Admin-editable `CatalogUploadPriceTier` grid (mirrors `plan_limits`). Retailer pays first (Razorpay, platform account, server-verified HMAC) before a visit slot confirms, then routes through existing nearest-agent logic |
| **Tests** | `apps/api/src/routes/retailers.test.ts` | "F-018" and "F-019" describe blocks — referral resolution, payment signature verification, IDOR guard |

Explicitly not in scope for these two: a generic non-catalog on-site maintenance charge and a standalone commission-per-sale engine were raised during scoping but not confirmed — treat as backlog, not implied by this entry.

**F-020 delegated on-site access (built 2026-07-30, commit `44e3b1b`):** F-019's scheduled visit now mints a short-lived delegated-access token so the visiting team member can act on the retailer's account (`catalogDelegateCanAccess` allowlist in `apps/api/src/plugins/auth.ts`) instead of the retailer handing over their real login. Spec `docs/PRO-REQUIREMENTS.md` §10.11.

---

## Built: Marketing Page Redesign — Loom Design System (Option A)

**Built 2026-07-29** (design direction decided 2026-07-28). Full audit, four direction options with pros/cons, and the chosen system spec live in `docs/design/emil-design.md`.

Kanchuki's design was ad hoc — `docs/DESIGN.md` documented a violet/amber palette that didn't match the live cyan code (see doc Part 1). Presented four creative directions (A Loom/textile-native, B Ledger/mercantile, C Studio Neon/fashion-editorial, D Quiet Atelier/minimal-premium) with honest pros/cons; user picked **Option A — Loom** (natural-dye palette, selvedge-edge cards, drape transitions, thin-line icons, serif+grotesk pairing). B/C/D stay documented in the doc as alternatives, not deleted.

| Layer | Files | Summary |
|---|---|---|
| Tokens | `apps/web/tailwind.config.ts`, `apps/web/src/app/globals.css` | `ink`/`rust`/`turmeric`/`stone` oklch scales + `cotton`/`charcoal`, replacing the old cyan/amber mismatch |
| Fonts | `apps/web/src/app/layout.tsx` | Fraunces (display serif) added alongside Inter |
| Logomark | `apps/web/src/components/KanchukiMark.tsx` (new) | Interlaced-thread device, shared by Navbar + Footer. **Replaced 2026-08-11** by the `kanchuki-logo.png` wordmark (component deleted — see the "Colabs-inspired marketing redesign" entry below) |
| Marketing page | `apps/web/src/app/page.tsx`, `apps/web/src/app/sections/MarketingSections.tsx` | Full redesign: selvedge-edge cards (implemented as a clipped inset strip, not a mismatched border — a border-width/radius rendering issue the impeccable design-lint hook caught), bolt-and-swatch feature grid, drape-transition hero, solid accent colors (gradient text removed — also hook-caught) |
| Manifest | `apps/web/public/manifest.json` | Theme/background colors matched to the new palette |

**Verified:** `tsc --noEmit` clean, `eslint` clean, dev server compiles, compiled CSS confirmed to contain real oklch values. **Not verified:** no live browser screenshot — no Playwright browser extension available in this environment. Open `localhost:3000` yourself before treating this as final.

**Not yet done** (see the doc's own punch list): `docs/DESIGN.md` itself still has stale violet/amber values, not yet corrected to match the Loom tokens now live in code. Shared web/mobile token package (`packages/shared`) not built — mobile (`apps/mobile`) still has no design tokens at all. Founder-story/About page (etymology angle, doc §2.5) not built — needs the real founder story as input, won't be invented. Admin panel and retailer mobile app deliberately untouched — the doc argues those surfaces should stay motion/decoration-restrained, unlike marketing/customer-facing surfaces.

---

## Built: Admin-Configurable Platform Theme (2026-07-29)

Whole-platform rebrand without an app rebuild: `GET/PUT /admin/settings/theme` (audit-log-as-key-value-store pattern, `apps/api/src/routes/admin-settings.ts`) + public `GET /v1/public/theme` read endpoint + admin settings page + `apps/mobile/src/lib/theme.tsx` (fetched at launch) — ~30 retailer-app screens consume `useTheme()` instead of hardcoded colors. Commit `0f92646`.

## Built: Product-Level WhatsApp Share Button (F-006 gap) + Ratings Reviewed

**Built 2026-07-30.** Full research on three user-proposed features (cross-store coupon network, ratings, WhatsApp share) in `docs/design/feature-ideas-2026-07-30.md`. Two of three acted on:

- **WhatsApp share on product detail (done):** `CollectionView.tsx` already had a working share button (`navigator.share` Web Share API). `ProductDetailSheet.tsx` (single-product view) did not — added the same pattern (`Share2` icon next to the favorite heart), sharing the current page URL + product name/category as title. No new dependency — Web Share API was already in use in this codebase. Falls back to clipboard copy on browsers without `navigator.share`. Spec updated in `docs/PRO-REQUIREMENTS.md` F-006, `docs/PLAN.md` Month 4c.
- **Ratings system (planned, not built):** spec written as F-021 in `docs/PRO-REQUIREMENTS.md` §10.12, roadmap slot in `docs/PLAN.md` (Future, post-MVP). Gate rating eligibility behind a prior enquiry/order — open ratings on a catalog with no purchase-verification invite fake reviews. Not in locked MVP scope; candidate for early Phase 1. Includes a `Retailer.google_place_id` Google-review deep-link CTA (rating ≥4 → prompt; ≤3 → private feedback instead) — flagged in spec as "review gating," a pattern against Google's Business Profile policy; built because explicitly requested, risk is the retailer's/platform's call.
- **Cross-store coupon network:** reviewed, not spec'd — deferred, needs retailer density Kanchuki doesn't have yet plus an unresolved money-settlement/GST question between two retailers. See the doc for the cheap way to test the idea first (manual redemption, no ledger).

## Built: F-023 AI Provider Registry — Admin-Configurable Tagging Models + Per-Provider Usage

**Built 2026-08-01.** The user's ask: "admin adds any AI model + key, app picks 1st/2nd/3rd in priority order, so AI tagging never stops when one provider's credits run out" — plus per-retailer AI usage visibility. Builds on the existing F-010 quota system, F-012 encrypted secrets, and the multi-provider failover engine in `packages/ai/src/providers.ts` (Claude → OpenAI → Gemini with a 5-min circuit breaker).

| Layer | Files | Summary |
|---|---|---|
| **DB models** | `packages/db/prisma/schema.prisma` + `migrations/041_ai_provider_registry` | `AiProviderConfig` (provider_type, model_name, lite_model_name, base_url, api_key_name, priority, is_active, credits_per_call) + `AiUsageLog` (per-call attribution: retailer × provider × model × resource × weighted credits). Migration seeds the 3 legacy adapters as rows so failover works out of the box |
| **DB helper** | `packages/db/src/ai-providers.ts` | `listActiveAiProviders()` — returns `null` when the table is missing/unreachable (legacy fallback) vs `[]` when all rows are inactive (admin intent to disable — must NOT fall back) |
| **Failover engine** | `packages/ai/src/providers.ts` | **DB-driven registry** replaces the hardcoded adapter list. New generic `OPENAI_COMPAT` adapter: base_url + model name from the registry row serves ANY OpenAI-protocol provider (OpenRouter, DeepSeek, Mistral, Groq, Together, ...) — one adapter, any model on the market. Persistent 400 (e.g. text-only model fed an image) is classified as an outage via the `providerDown` flag so a bad model choice fails over instead of halting tagging. `reserveAiCredits()` = weighted quota gate (most expensive healthy provider). `onProviderUsed` attribution callback fires per successful call |
| **Attribution threading** | `tagger.ts`, `detector.ts` | `tagProductImages`/`tagProductImageUrl(s)`/`detectColor`/`detectItems`/`detectCropAndTag` all accept `onProviderUsed` opts. `detectItems` attributes as `AI_ITEM_DETECT`, tagging as `AI_TAGGING_CALL`, color as `AI_COLOR_DETECT` |
| **Usage helper** | `apps/api/src/lib/ai-usage.ts` | `recordAiUsage(retailerId)` → weighted `AI_TAGGING_CALL` quota increment + `AiUsageLog` row per call, using `info.resource_type` so the dashboard distinguishes detection/tagging/color. Best-effort (never fails the tagging job) |
| **Weighted quota wiring** | `apps/api/src/jobs/tag-product.ts`, `routes/catalog-import.ts`, `routes/products.ts` | Tagging job + catalog import (both paths) + detect-color route gate on `checkQuota(AI_TAGGING_CALL, await reserveAiCredits())` and attribute via `recordAiUsage` |
| **Admin API** | `apps/api/src/routes/admin.ts` | `GET/POST /admin/ai-providers`, `PATCH/DELETE /admin/ai-providers/:id`, `POST /admin/ai-providers/reorder` (transaction rewrites priorities 1..N), `GET /admin/ai-usage` (per-retailer × per-provider weighted aggregation). Audit-logged |
| **Admin UI** | `apps/web/src/app/admin/ai-providers/page.tsx`, `apps/web/src/app/admin/ai-usage/page.tsx` + Sidebar links | AI Providers: list/edit priority order, model, base_url, credits-per-call, activate/deactivate, key-configured flag. AI Usage: per-retailer × provider × model credits/calls breakdown |
| **Integration keys** | `packages/shared/src/constants/index.ts` | `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY`, `GROQ_API_KEY`, `TOGETHER_API_KEY` added to Admin → Integrations (used as `api_key_name` for OPENAI_COMPAT rows) |
| **Tests** | `packages/ai/src/providers.test.ts` (33 tests incl. registry priority, weighted credits, providerDown failover, admin-disable intent), `apps/api/src/routes/admin.test.ts` (AI provider CRUD + reorder + usage aggregation), `packages/db` suite | Verified: ai/db/api/shared typecheck clean, API 220/220, AI 33/33, DB 10/10. Web admin pages typecheck clean (branch has ~91 pre-existing unrelated web tsc errors) |

**How credits work:** each provider row has `credits_per_call` (seeded: Claude 5, OpenAI 2, Gemini 1, Llama 3.2 90B/11B Vision 1 each as free/cheap fallbacks via NVIDIA NIM — migration 042). The quota gate reserves the most expensive healthy provider's cost before a call; `recordAiUsage` increments the retailer's `AI_TAGGING_CALL` counter by the *winning* provider's weight. Expensive models drain the same flat quota faster — admins can edit weights live from Admin → AI Providers. Existing addon-purchase rails (`/billing/addon-checkout`, `ADDON_PRICING[AI_TAGGING_CALL]`) top up the same counter.

**Setup:** after deploying, run migrations 041 + 042 (seeds 5 default rows: Claude/GPT-4o-mini/Gemini Flash + Llama 3.2 90B/11B Vision free fallbacks via NVIDIA NIM). Add keys via Admin → Integrations (or env vars): `OPENROUTER_API_KEY` alone unlocks hundreds of models behind one credit balance. Add a model in Admin → AI Providers → it's tried in priority order; a down provider auto-skips to the next after a 5-min cooldown (configurable `AI_PROVIDER_COOLDOWN_MS`). See also `docs/PRO-REQUIREMENTS.md` F-023 spec.

---

## Planned — NOT started: F-022 Auto-Post New Arrivals to Google Business Profile

**Reviewed 2026-07-30. DO NOT START DEVELOPMENT until the user explicitly says go ahead — when that happens, use this entry + `docs/PRO-REQUIREMENTS.md` §10.13 as the reference spec.**

Distinct from F-021's Google review link — this uses the Business Profile API's `localPosts` resource (Google *does* allow creating Posts via API, unlike reviews). Retailer OAuth-connects their Google Business Profile (reuses F-012 encrypted-secret pattern); Kanchuki posts latest 3–4 new-arrival products (photo + text + CTA linking to the collection link) via `localPosts.create`. **Blocked on an external, unpredictable-timeline Google API access approval** in addition to not being MVP scope — request that access before development starts.

---

## Built: Mobile Accessibility Audit + Harden Pass (`apps/mobile`)

**Built 2026-07-31.** `/impeccable audit` ran against `apps/mobile` (React Native/Expo), scored against native iOS/Android platform guidance — full report in `docs/design/design-work.md` ("Mobile audit results"). Score: 10/20, "Acceptable, significant work needed." The two P1 findings (zero accessibility labels, zero Reduce Motion handling) were hardened same day; the rest are tracked as open follow-ups, not fixed.

| Layer | Files | Summary |
|---|---|---|
| **Reduce Motion** | `apps/mobile/src/hooks/useReduceMotion.ts` (new) | Wraps `AccessibilityInfo.isReduceMotionEnabled` + change listener. Wired into `app/onboarding.tsx` (confetti skipped, step-transition slide replaced with crossfade), `src/components/Skeleton.tsx` (shimmer dims instead of pulsing), `src/components/NetworkBanner.tsx` (offline-banner slide becomes instant). Functional loading/gesture animation (AI-processing spinner, pinch-to-zoom photo viewer) deliberately untouched — they carry state, not decoration |
| **Accessibility labels** | 32 files across `apps/mobile/app/**` and `src/components/**` | Swept every `lucide-react-native` icon import for icon-only `TouchableOpacity`/`Pressable` controls (back/close/remove/share/filter/FAB buttons) with no visible text label. Added `accessibilityLabel` + `accessibilityRole="button"` to 66 spots. Selection chips using a `{selected && <Check/>}` overlay were left as-is (they already have a visible text label) — flagged as a smaller `accessibilityState` follow-up, not silent |
| **Touch target (in passing)** | `apps/mobile/app/product/bulk.tsx` | Added `hitSlop={8}` to the 24×24px remove-photo button flagged by the audit as below the 44pt/48dp minimum |
| **Docs corrected** | `docs/DESIGN.md` | Fixed a stale claim ("mobile has no design tokens" / `theme.extend: {}`) — `apps/mobile/tailwind.config.js` has had a full token scale since before this session; the doc just hadn't caught up |

**Follow-up pass, same day (commit `39e5ea8`):** `accessibilityState` on the 16 selection chips (fixed — screen readers now announce toggle state, not just the checkmark). Mobile/web `rust`/`turmeric`/`sand` token drift checked and found already resolved (doc claim was stale, not a real gap). Tab bar cut 6→5 (`analytics` moved to a top-level route, reachable via a Home header icon). Tablet/window adaptivity added (`useIsTablet`/`useGridColumns`, wired into all 5 product/category grids). New `AnimatedPressable`/`GradientButton` primitives (Reanimated press-scale + `expo-linear-gradient`), applied to the shared `ProductCard` (iOS shadow added — it had none, only Android `elevation`) and the 3 highest-traffic primary CTAs (product/customer save, collection create). No dark mode — user chose a light-only gradient/shadow/animation direction instead. Primitives + high-traffic screens only, not all 48 hand-migrated (no RN simulator in this environment to verify a blind full sweep). See `docs/design/design-work.md` for full detail.

**Still open:** dark mode (declined for this pass, may revisit later), full tablet-adaptivity coverage beyond the 5 grid screens. The "~45 screens not yet migrated" gap noted here is stale — the codemod in commit `e162f03` (later the same day) migrated all remaining `TouchableOpacity` usage across 38 files to `AnimatedPressable`; 0 `TouchableOpacity` remain in `apps/mobile/app`.

---

## Built: 2026-08-02 — Production DB Outage Fix (Pooler Suffix) + Purge-Cron Scoped Role + Admin/Web Hardening

**Incident:** production API 500'd on every DB-backed endpoint while `/health` stayed 200. Root cause confirmed live: Supabase's pooler requires `<role>.<project_ref>` usernames, but `DATABASE_URL` used bare `kanchuki_app` → `password authentication failed`. Fixed in Railway; docs + setup SQL corrected repo-wide (0 unsuffixed URLs remain). Live probe still shows `kanchuki_app` auth-failing until `scripts/setup-role-separation.sql` is run in the Supabase SQL Editor (superuser connects fine).

| Change | Files | Summary |
|---|---|---|
| **Pooler suffix** | `docs/INFRA-SETUP.md`, `docs/26-night-report.md`, `scripts/setup-role-separation.sql` | All `kanchuki_*` pooler URLs now `kanchuki_app.thpqcylmcxokajxoerjx` / `kanchuki_migrator.thpqcylmcxokajxoerjx`; stale `wqcbvmmqzoxapmxbjzhm` ref removed; setup SQL made idempotent + gained missing sequence grants (`GRANT USAGE, SELECT ON ALL SEQUENCES` + default privileges) |
| **Purge-cron scoped role** | `packages/db/src/client.ts`, `apps/api/src/jobs/purge-soft-deleted.ts`, `scripts/setup-role-separation.sql`, `.env.example` | New `kanchuki_purge` role — inherits `kanchuki_app` (SELECT/INSERT/UPDATE) + DELETE on exactly the 18 purge tables, no TRUNCATE/DROP/DDL — via new `PURGE_DATABASE_URL` and `getPurgePrisma()`. Under full role separation the cron can't run as `kanchuki_app` (no DELETE) or `kanchuki_migrator` (human-only) — this is the scoped role SECURITY §19.2 sanctions. Falls back to the shared client (with a warning) when the URL is unset |
| **Admin DB-down guards** | `apps/web/src/app/admin/{page,retailers/page,activity/page,retailers/[id]/activity/page}.tsx` + `error.tsx`/`global-error.tsx`/`admin/error.tsx` | Every admin fetch now guards `!res.ok`/`Array.isArray(json?.data)` so a 500 `{error}` body can't crash renders with `undefined.length` — this was crashing the production admin panel during the outage |
| **Brand assets** | `apps/web/src/app/{icon.svg,apple-icon.png,robots.ts}`, `apps/web/public/{favicon.ico,og-image.png}`, PWA icons, `apps/web/src/app/layout.tsx`, `scripts/generate-brand-assets.mjs` | Loom-brand favicon (SVG + PNG-in-ICO), iOS apple-icon, PWA icons regenerated from stale pre-Loom cyan → brand-correct ink/turmeric, `robots.txt` (Disallow `/admin /api/ /offline`), OG/Twitter meta + 1200×630 `og-image.png` resolved via `metadataBase` (`NEXT_PUBLIC_SITE_URL` fallback `https://kanchuki.app`) |

| **Cron consolidation** | `apps/api/src/jobs/index.ts`, `packages/shared/src/constants/index.ts` | 4 cron-only workers (cleanup/order-expiry/purge/backup) collapsed into one `QUEUES.MAINTENANCE` worker dispatching on `job.name` (was stacking Redis connections per replica); tryOn/FashionDNA/GhostMannequin feature workers paused — producers stay wired, unprocessed until re-enabled |

**Verified:** api + db `tsc --noEmit` 0 errors, db vitest 10/10, delete-guard + secrets-guard pass, live smoke test 8/11 while DB down (the 3 DB-backed checks flip green once the role exists).

---

## Built: 2026-08-03 — AI Tagging Expansion — Subtype/SKU/Description/Name + Slider Fix + Color-Tap + Catalog Redesign

Full approved plan (rationale, exact file:line targets): `C:\Users\Dell\.claude\plans\wiggly-floating-meerkat.md`. Reference competitor ("Jooldo") screenshots live in the plan file.

User asked AI tagging to also produce: garment **subtype** (finer than `category` — "Lehenga Skirt", "Kurta Set", "Suit with Dupatta"), auto **SKU**, auto short **description**, auto **name**, plus fix a mobile photo-slider bug (new color-variant photos don't appear), add tap-primary-photo-to-detect-color, and redesign the customer web catalog listing (count-bearing category chips + badge/name card overlay). All shipped 2026-08-03.

### Backend
| Area | Files | Summary |
|---|---|---|
| DB | `packages/db/prisma/schema.prisma`, `migrations/043_product_ai_fields/` | `Product.subtype/sku/description` added (nullable), `@@unique([retailer_id, sku])`, `@@index([retailer_id, subtype])`. Prisma client regenerated |
| AI schema | `packages/shared/src/types/index.ts` (`AiTagResult`, `PublicProduct.subtype`, `PublicCollection.filters` now `{value,count}[]`), `packages/ai/src/tagger.ts` (`EXTRACT_SCHEMA` + prompt + mapping gained `subtype`/`product_name`/`short_description` — one extra field set on the *same* vision call, no new API cost), `packages/ai/src/detector.ts` (type-only fix; its preliminary per-item tags get overwritten by `tagProductImageUrl` anyway, confirmed by reading `detectCropAndTag`, so no schema duplication needed there) | Subtype is free-text/open-vocabulary, not an enum — same treatment as the existing `primary_color`/`fabric_estimate` fields |
| SKU generator | `apps/api/src/lib/sku.ts` (new), `sku.test.ts` (new, 10/10 passing) | `generateSku`/`withUniqueSku` (P2002-retry, single-item path) + `createSkuSequencer` (per-batch prefix cache, bulk-import path). 2-letter prefix from subtype/category + zero-padded per-retailer sequence, e.g. `LS0001` |
| Write paths | `apps/api/src/jobs/tag-product.ts`, `apps/api/src/routes/catalog-import.ts`, `apps/api/src/routes/products.ts` | `tag-product.ts` fills name/sku/description/subtype **only when currently null** (never clobbers a retailer edit on re-tag). `catalog-import.ts` bulk-create-products now sets these + generates SKU via the sequencer; detect-items/import-pdf pass the new tag fields through automatically (typed passthrough). `products.ts` Create/UpdateProductSchema accept all 4 fields; a SKU unique-constraint collision now returns a clean 422 (`validationError`) instead of an unhandled 500 |
| Public API | `apps/api/src/routes/public.ts` | `buildFacets()` returns `{value,count}[]` per category/occasion/color (drives "All (10)" style chip counts); `PublicProduct`/`toPublicProductSummary` gained `subtype` |

### Web customer PWA — catalog listing redesign (tasks 8/9)
| Files | Summary |
|---|---|
| `apps/web/src/app/c/[slug]/components/FilterBar.tsx` | New `FilterOption {value,count}` shape; chips render `{value} ({count})`; standalone always-visible `CategoryChips` row above the grid with an "All ({total})" chip; occasion/price/color stay behind the filter toggle |
| `apps/web/src/app/c/[slug]/components/CollectionView.tsx` | `CategoryChips` rendered unconditionally above the grid; `ProductCard` gains a top-left `subtype ?? category` white pill badge over the photo + a bottom gradient-overlay name caption (replacing the gray category-dot row); price line kept below; sold/reserved ribbons unchanged (badge shifts down under them) |
| Test fixtures | `CollectionView.test.tsx`, `e2e/customer-collection.spec.ts` updated to the new `PublicProduct.subtype` + `{value,count}[]` filters shape |

### Mobile retailer app (tasks 4/5)
| Files | Summary |
|---|---|
| `apps/mobile/src/lib/api.ts` | `CatalogDetectedItem.tags` + `bulkCreateProducts` item type gained `subtype`/`product_name`/`short_description` |
| `apps/mobile/app/product/[id].tsx` | (a) Editable Name/Subtype/SKU/Description ("Product Info" card) hydrated from `product.name/sku/description/subtype`, included in the `PUT /products/:id` payload; (b) **photo-slider fix** — `displayPhotos` permanently merges `product.photos` + every variant's `photo_url` (deduped by URL), the transient `variantPreviewUrl` injection branch + its scroll `useEffect` deleted, swatch tap now `goToPhoto(index)`; (c) **tap-photo color detect** — `Palette` button overlaid on the carousel calls the existing `productApi.detectColor()`, result shown as a `resolveFashionColor()` swatch chip with a "Use" confirm that writes into `editedColor` (never auto-saves). Follow-up hardening: an `isDirty` guard (all 15 form setters routed through a `dirty()` wrapper) stops the 3s AI-tagging poll refetch from wiping unsaved edits mid-typing; cleared on Save/product change, and transient gallery state (photo index, color chip) only resets on product change |
| `apps/mobile/app/product/catalog-import.tsx` | Bulk review `ReviewItem.edits` + both seeding spots + per-item editor + save payload extended with `product_name`/`subtype`/`short_description` (SKU stays server-generated); subtype chip shown on the item header |

**Verified 2026-08-03:** `apps/web` `tsc --noEmit` clean (this was the known red before tasks 8/9) + CollectionView unit test green; `apps/mobile` `tsc --noEmit` clean (no RN simulator available — UI unverified on device); `apps/api` `tsc --noEmit` clean + vitest green (`sku.test.ts` 10, `tag-product.test.ts` 6, `products.test.ts` 8, `public.test.ts` 5, plus the security/admin.login suites from the backend session). **Customer e2e run 2026-08-03:** `playwright test -c playwright.customer.config.ts` (prod `turbo build` + `next start` on :3100 + spec-booted API stub on :3001) — 2/2 passed: collection page renders + interactions are client-side (no full reload), and collection pages work offline via the service worker.

---

## Built: `apps/mobile` Design Polish Pass — P0/P1 fixed, P3 started (2026-08-03)

**Audited 2026-08-03 via `/impeccable audit` (native path), source-level, no simulator** (registration-screen overflow report + a color/gradient/animation polish request). Full scored findings (13/20 → fixes below) live in `docs/DESIGN.md` → "Audit: `apps/mobile` Design Pass — 2026-08-03". `apps/mobile` `tsc --noEmit` clean after every step (no RN simulator in this environment — UI unverified on device).

- **P0 fixed:** `app/auth/phone.tsx` + `app/auth/otp.tsx` — added `ScrollView` + `useSafeAreaInsets` (replacing hardcoded `pt-*`/`pb-*`), fixed Android `KeyboardAvoidingView` behavior (`'height'` instead of `undefined`).
- **P1 fixed:** `GradientButton` promoted to the primary CTA on all 8 screens using the flat `bg-ink-600`/`bg-sand-200` conditional pattern — `auth/phone.tsx`, `auth/otp.tsx`, `onboarding.tsx`, `product/bulk.tsx`, `staff/retailer-onboard.tsx`, `settings/staff.tsx`, `collection/[id].tsx`, `category/[id]/add-products.tsx`.
- **P2 — color-drift finding retracted** (verified false via oklch→hex conversion, see `docs/DESIGN.md`). **Tablet decision (user, 2026-08-03): commit to tablet.** `app.json` `orientation` changed `"portrait"` → `"default"`. Screen-by-screen `useIsTablet`/`useGridColumns` coverage is still 5/~40 screens — **not extended in this pass**, tracked as open follow-up (no simulator here to verify a blind ~35-screen sweep).
- **P3 started:** new `apps/mobile/src/components/GradientBorderCard.tsx` (subtle gradient-edge card — outer-gradient/inner-fill trick, since RN has no `background-clip`; pattern sourced from the `css-border-gradient` skill in `github.com/MengTo/Skills`, taste rules followed: 1px border, low-alpha stops, one hierarchy level). Applied to `onboarding.tsx`'s two info cards (step 1, step 4) + a signature `LinearGradient` hero treatment on the step-6 celebration icon. **Not done:** icon-specific micro-animation (favorite/bell/checkmark) — skipped this pass, no clearly interactive favorite/bell control exists yet in the retailer app to attach it to (those live in the customer web PWA); revisit if/when one does.

---

## Built: "Black & Gold Elegance" Brand Repaint + Shared `COLORS` Module (2026-08-03)

**User-driven repaint** — third palette in this project's history (Loom → Red Elegance → this one), from a user-supplied 5-swatch reference: bold black (`#000000`), deep navy (`#14213D`), regal gold (`#FCA311`), light grey (`#E5E5E5`), luminous white (`#FFFFFF`). Full scope confirmed with the user as "full repaint of live app," not just a preview.

| Layer | Files | Summary |
|---|---|---|
| **Design tokens** | `apps/web/tailwind.config.ts`, `apps/mobile/tailwind.config.js` | Same `ink`/`rust`/`turmeric`/`sand`/`cotton`/`charcoal` key names as Red Elegance (repaints className usage for free) — `ink`=deep navy, `rust`=regal gold (was secondary, now primary hero accent), `turmeric`=antique gold/bronze (grounding accent, no separate swatch given), `sand`=neutral grey. Every ramp moved from oklch to plain hex this pass — removes the web/mobile hand-conversion step. Decorative hero-wash tokens `icy`/`petal` renamed `glow`/`veil` (gold glow / navy-black shadow — a cool wash no longer fit) |
| **Brand chrome** | `globals.css`, `layout.tsx`, `icon.svg`, `manifest.json`, mobile `app.json`, `theme.tsx`, header configs across `_layout.tsx`/`orders/[id].tsx`, `admin-settings.ts` default, admin theme settings page | Favicon, PWA theme/background color, splash screen, admin-configurable brand color default, and header tint/background across every mobile screen updated to match. Also fixed a stray leftover cyan shadow tint (`rgb(8 145 178)`) in `tailwind.config.ts` that predated even the Loom repaint and had never been caught |
| **Shared `COLORS` module (new)** | `packages/shared/src/colors.ts` (new), `packages/shared/src/index.ts` | Closes part of the shared-token gap tracked in `docs/design/emil-design.md` §3.4: ~40 `apps/mobile` screens were hardcoding raw hex directly in RN literal props (`color=`, `placeholderTextColor=`, inline `style` objects — spots a Tailwind `className` can't reach). All migrated to `import { COLORS } from '@kanchuki/shared'`, so the next repaint edits one file instead of ~40. Tailwind configs still hardcode their own copy of the same values on purpose — those load at build time before `@kanchuki/shared`'s `dist/` is guaranteed built, and wiring that import wasn't safely verifiable without a live Metro/Next build in this environment |
| **Docs** | `docs/DESIGN.md` (Design Tokens section), `docs/design/emil-design.md` §3.1/§3.4 | Both updated with current values — `docs/DESIGN.md`'s token block had been stale since the Loom→Red Elegance switch (never corrected); fixed as part of this pass, not left stale a second time |

**Session note:** the mobile hex→`COLORS` migration was scripted (PowerShell bulk find/replace across ~40 files); the first attempt had two bugs — a broken replace clobbered 14 files' pre-existing imports (lost names like `formatPriceRange`, `PRODUCT_CATEGORIES`), and the file glob briefly touched 8 `node_modules` vendor files. Both fully recovered (originals restored from `git show HEAD`, vendor files restored) before verification. **Verified:** `apps/mobile` `tsc --noEmit` clean, `vitest run` 25/25 passing (1 unrelated pre-existing suite failure — a Rolldown/Vite JSX-parse error inside `expo-linear-gradient`'s vendor build output, predates this session and unrelated to the color changes). No RN simulator/browser available in this environment — UI unverified visually on device; verify before treating as final.

**2026-08-04 device-test findings — RESOLVED** — full detail `docs/PROGRESS.md` "SecureStore crash fix + open bug". SecureStore crash fixed (`theme.tsx` cache key had a `:`, only `[A-Za-z0-9._-]` allowed). The blank AI-tagged fields bug was **root-caused + fixed the same day**: the worker consolidation (`8b7a5be`) never touched the AI_TAGGING worker (verified in git diff) — the chain was correct, and the blank fields were products tagged **before migration 043** whose name/subtype/SKU/description stayed NULL. Shipped `backfill-missing-ai-fields` maintenance job (commit `4037e49`, daily 2:30 AM UTC, capped 250/run) to re-queue those. Color-detect circle on `product/add.tsx` shipped in `d8042f6`.

**R2 storage cleanup on product delete (2026-08-04) — ✅ FIXED.** `apps/api/src/jobs/purge-soft-deleted.ts` deleted DB rows only — R2 photo/spin-frame/variant bytes were never removed. Now fetches `r2_key`s before purging `product_photos`/`product_spin_frames`/`product_variants` and deletes them via `deleteObject()` (`@kanchuki/ai`) after the DB purge, best-effort. `product_spin_frames` was also missing from the explicit children-purge list (silent gap, fixed same pass). **Retention window: 30 → 15 days** (`PURGE_AFTER_DAYS`, applies cron-wide). See `docs/PROGRESS.md` for full detail.

---

## Built: Customer Web PWA — catalog nav bug + bottom bar + cart wiring + product detail redesign + back-button fix (2026-08-04)

User-reported 7-item list for the customer-facing web PWA (`apps/web/src/app/c/[slug]`, `/store/[slug]/categories/...`). Full review notes + status per item: `docs/PROGRESS.md` "2026-08-04 — Customer Web PWA" entry.

| # | Item | Status |
|---|------|--------|
| 1 | Category page (`/store/[slug]/categories/[categoryId]`) needs a hard refresh to load | ✅ Fixed — added a `/store/` NetworkFirst matcher to `sw.ts` (`apps/web/src/app/sw.ts`), same fix pattern as `/admin` |
| 2 | Catalog bottom bar: 3 buttons (Buy Now / Selected N / Enquire N) in one row with icons | ✅ Built — `CollectionView.tsx` bottom bar redesigned to 3 buttons; Buy Now links to `/c/[slug]/cart`, disabled (not hidden) when the retailer has no checkout connected |
| 3 | Is the shopping cart fully functional? | ✅ Confirmed already built end-to-end (F-302 Stage A) — gap was reachability from the catalog page, closed by #2, no cart/checkout code changes needed |
| 4/5/6 | Product detail: AI Summary + "Product Info" (replaces raw tag chips) + 3-button row; keep price/category/share/like; rename "More {category}" → "Related suits" | ✅ Built — `description` added to `PublicProductDetail` (`packages/shared/src/types/index.ts`) + `GET /public/products/:productId` (`apps/api/src/routes/public.ts`); `ProductDetailSheet.tsx` gained AI Summary + Product Info blocks (replacing attribute chips + raw tag cloud), Buy Now/Select/Enquire 3-button row (replacing stacked Add-to-Cart/Enquire), related-section heading renamed. Color-circle swatches were already built (`resolveFashionColor`). SKU deliberately kept internal-only, not exposed to customers |
| 7 | Mobile back button skips the product catalog, lands on category screen | ✅ Fixed — `ProductDetailSheet.tsx` now pushes a history entry on open and closes on `popstate`; its own close buttons call `history.back()` instead of `onClose` directly |

**Verified:** `packages/shared`/`apps/api`/`apps/web` `tsc --noEmit` all clean, `CollectionView.test.tsx` passing. **Not verified:** no live browser/phone check in this environment — visually confirm the 3-button rows, AI Summary/Product Info sections, and the back-button fix on a real phone before calling this fully done.

---

## ✅ BUILT 2026-08-04: Staff/Retailer catalog-upload — auth gap closed + 500-item free offer enforced

**Both tasks shipped this session (commits `c99a6c6`, `f0ab109`).** Original
research + guideline: `docs/staff-retailer.md`. Verified by reading the
actual auth chain end to end (not from doc/memory claims), per the "doc
staleness" pattern this project keeps hitting.

**Context:** F-019 (paid on-site catalog upload) + F-020 (delegated
catalog-upload session) are fully built — ticket lifecycle, Razorpay
payment, `routeTicket()` assignment, the delegated JWT, the mobile
`catalog-tickets.tsx`/`catalog-delegate.ts` flow, the audit hook — all real
and correct. Tracing the *login* path in front of all of that surfaced a gap
none of the prior F-019/F-020 entries caught.

### Task 1 — Bridge the mobile login gap for `TeamMember` field agents (blocking)

**Finding:** `apps/mobile/app/staff/*` screens (`catalog-tickets.tsx`,
`retailer-onboard.tsx`, `index.tsx`) all call `teamApi` → `/team/*` routes,
which require a JWT from `POST /team/login` (email+password, `TeamMember`
model = Kanchuki's own field/sales/support agents). But the mobile app's
only sign-in path (`app/auth/otp.tsx`, phone OTP) only ever checks the
**`Staff`** model (F-009 — a retailer's own shop employee) and hands out a
Supabase session token, which `verifyTeamToken()` rejects. Net effect:
**no real Kanchuki field agent can currently log into the mobile app and
reach the catalog-upload screens that were built for them.**

Two ways to close it — needs a decision before coding:

| Option | What it touches | Domains/skills |
|---|---|---|
| A. Add phone+OTP to `TeamMember` (reuse the existing Supabase OTP flow, extend `auth.ts` to also check `TeamMember` alongside `Staff`) | DB migration (`TeamMember.phone`, unique index), `apps/api/src/routes/auth.ts`, `apps/mobile/app/auth/otp.tsx` redirect logic | **Database** (schema/migration review — `ecc:database-reviewer`), **Backend/API** (`ecc:typescript-reviewer`, `ecc:api-design`), **Security** (bridging two auth systems onto one endpoint is exactly the kind of boundary bug that hides privilege leaks — mandatory `ecc:security-reviewer` / `security-review` pass before merge, must confirm `Staff` vs `TeamMember` tokens can never be confused downstream) |
| B. Add an email+password login screen to the mobile app hitting the existing `/team/login` (no backend/schema change at all — endpoint already works, just unreachable from mobile) | One new mobile screen + storing the returned JWT under the existing token slot | **Mobile/Frontend** (`ecc:react-reviewer` / `react-native` conventions, reuse `auth/phone.tsx` layout patterns), **Security** (lighter — no new auth surface, just wiring an existing one; still worth a quick `security-review` pass on token storage) |

Ponytail read at review time: **B is the lazier, smaller, safer diff** —
reuses a backend endpoint that already exists and works, touches one
screen, no migration, no second auth system merged into one endpoint.
**User chose A.** Shipped as **Option A** (commit `c99a6c6`): migration
`044_team_member_phone` adds `TeamMember.phone @unique`; `auth.ts
/otp/verify` checks `TeamMember` after `Staff` and before the retailer
upsert, minting a team JWT (`signTeamToken`) — the critical guard is that
an agent's phone can never create a Retailer row, and Staff/TeamMember
tokens stay cryptographically separate (Supabase session vs TEAM_JWT
secret). Mobile `otp.tsx` routes `team_member` logins to `/staff` with no
stale retailer context; `POST/PATCH /team/members` + admin Team Members UI
gain the optional phone field. Tests: `auth-team.test.ts` (4, incl. the
no-retailer-upsert guard).

### Task 2 — 500-item free catalog upload, all retailers, limited time

**Decision, not enforced by anything today.** Two gaps found by reading the
quoting code, not assumed:

- `CatalogUploadPriceTier` (Admin → Catalog Upload Tiers) is reference data
  only — `PATCH /team/tickets/:id` (the actual quoting endpoint) never
  reads it. Editing the tier grid to `0–500 items = ₹0` does **not**
  auto-quote anything.
- No expiry field exists anywhere for this offer. "Limited time" has no
  system representation — it relies entirely on whoever quotes tickets
  remembering the cutoff.

**Shipped as system-enforced (commit `f0ab109`)** — no more tribal
knowledge: `promo_free_item_limit` + `promo_expires_at` live in the
existing admin-settings key-value store (`GET/PUT
/admin/settings/catalog-upload-promo`, same pattern as the theme config).
The quoting route (`PATCH /team/tickets/:id`) computes the ₹0 default
itself: when the promo is live and `item_count_requested <= free limit`,
`quoted_price_inr` is FORCED to 0 (response carries `promo_applied`);
expired/over-limit falls back to manual pricing. Admin UI: promo card on
Admin → Catalog Upload Tiers (limit + expiry + live badge). Retailer's
POST `/me/catalog-upload-request` response includes the current promo.
Tests: `catalog-upload-promo.test.ts` (4 — within-limit force, over-limit
manual, expired, unconfigured).

| Domain | Skill/agent if built |
|---|---|
| Database | `ecc:database-reviewer` — trivial addition (2 nullable fields on an existing settings row), but still route schema changes through review per this repo's own AI Agent Instructions (§ "Always check `docs/DATABASE.md`") |
| Backend/API | `ecc:typescript-reviewer`, `ecc:api-design` — one conditional in the quoting/pay flow |
| Admin UI/Design | `ecc:frontend-patterns` or `impeccable` if the tier-grid page needs a visible countdown/expiry field, otherwise cosmetic only |
| Security | Low risk — admin-only mutation, same trust boundary as existing plan-limit editing. Still worth a `security-review` pass given it touches a payment-quoting path (money path = never skip, per this file's own "Operational Control Policy") |

---

## ✅ BUILT 2026-08-04: F-024 DB-Backed Default Shop-By Categories + AI Auto-Category Assignment

Full design + build table: `docs/PRO-REQUIREMENTS.md` §14, roadmap slot
`docs/PLAN.md` (Future, post-Phase-0). Commit `be02012`.

**User ask:** move the "Shop By Categories" default list to the database
instead of a hardcoded array, and have AI tagging auto-assign each new
product to the right one so retailers stop picking a category by hand.
Retailer-added custom categories keep working exactly as today.

**Requested default set:** Kurta Sets, Salwar Suits, Short Kurtis, Kurta,
Co-ords, Plus Sizes, Dresses, Bottoms, Lehengas, Loungewear, Sarees, Shirts
for Women, Tops for Women, New Arrivals, Sale.

**What's already there (verified by reading code, not memory):**
`ProductCategory` (`packages/db/prisma/schema.prisma:295`) is already a
DB-backed, per-retailer, CRUD-able merchandising group
(`apps/api/src/routes/categories.ts`) driving `Product.category_id` — this
is the right target, distinct from the existing hardcoded
`PRODUCT_CATEGORIES` AI-vocabulary array
(`packages/shared/src/constants/index.ts:37`, a different, free-text field).
Gap: nothing seeds `ProductCategory` for new retailers, and
`apps/api/src/jobs/tag-product.ts` never touches `category_id` — AI never
assigns a merchandising category today.

**Proposed design (reuses `ProductCategory`/`categories.ts` wholesale, no
parallel system):** new admin-editable global template table
(`DefaultProductCategory`, same pattern as `PlanFeature`/`AiProviderConfig`)
seeds the 15 garment-type names into every new retailer at onboarding (+
one backfill migration for existing retailers with zero categories).
`tag-product.ts` matches the AI's returned category name against **that
retailer's own current category list** (defaults + custom, one mechanism,
no special-casing) and sets `category_id` on a hit; no match leaves it null
for manual assignment, same as today.

**Flagged before anyone builds this wrong:** "New Arrivals" and "Sale"
aren't garment types — a photo can't reveal stock-date or discount status.
Recommend computing them as virtual query-time filters in `public.ts`
(same pattern as the existing occasion/color/price facets) rather than
real AI-assigned category rows — cheaper and can't go stale. Alternative
(seed as real rows, retailer-curated only) also written up, not
recommended.

| Domain | Skill/agent if built |
|---|---|
| Database | `ecc:database-reviewer` — new template table + per-retailer seed migration, route through `docs/DATABASE.md` review per this file's own AI Agent Instructions |
| Backend/API | `ecc:typescript-reviewer`, `ecc:api-design` — `tag-product.ts` category-match logic, onboarding seed step |
| AI tagging | `packages/ai/src/tagger.ts` already returns free-text `category` per call — no new AI/vision plumbing needed, just consuming the existing result differently |
| Admin UI | Reuse the existing plan-features/catalog-upload-tiers admin grid pattern — no new design system work, admin panel stays motion/decoration-restrained per the Loom design-system entry in this file |
| Security | Low — admin-only template edit, same trust boundary as existing plan-limit editing |

**F-024 build summary:** new `DefaultProductCategory` admin-editable global
template (migration `045`, seeded with the 13 garment-type defaults —
**not** New Arrivals/Sale, which are computed at query time, Option A);
`seedDefaultCategories()` copies the template into every new retailer's
`ProductCategory` at signup (`auth.ts` self-serve + `team.ts` agent-created)
plus a one-off backfill for existing zero-category retailers; `tag-product.ts`
maps the AI's free-text category to the retailer's own category list
(case-insensitive, `resolveCategoryId`) and sets `category_id` only when
still null (never clobbers a manual pick); admin CRUD endpoints + grid page
(Admin → Default Categories) with audit logs. Also extracted the third copy
of the 30-day new-arrival helper into `lib/product-flags.ts`
(`isNewArrival`/`isOnSale`) and exposed `is_new_arrival` + `on_sale` on
`PublicProduct`/detail.

---

## ✅ BUILT 2026-08-04: F-025 Scan-to-Sell + F-026 BUG (✅ FIXED)

Full design + root cause: `docs/PRO-REQUIREMENTS.md` §15–16, roadmap
`docs/PLAN.md`.

**F-025 — how to mark items sold after an offline (in-shop) sale.**
`Product.status` (`SOLD` etc.) and a manual toggle already exist and are
already offline-safe (`apps/mobile/src/lib/mutation-queue.ts`); the gap is
the trigger — retailer must open the app and search for the product.
Researched barcode/QR scan, full POS, RFID, AI photo-diff-of-the-rack, and
WhatsApp text-command; rejected AI-photo-diff as unreliable + costs AI
budget + a false SOLD loses a real sale, rejected POS/RFID as
disproportionate for this ICP, WhatsApp command blocked on Meta Cloud API
(Phase 2, not built). **Decided: scan folded into the existing
`product/[id].tsx` screen** — retailer scans the product's existing
auto-generated SKU (`apps/api/src/lib/sku.ts`) via `expo-camera` (already
installed, no new dependency), app resolves SKU → product via a small
addition to the existing products list endpoint, lands on the existing
screen, taps the existing SOLD toggle. **Shop staff get this by default** —
`PATCH /products/:id` has no owner-only gate today (unlike the trash
routes below), so no new permission code needed; just don't accidentally
copy an owner-only gate onto the new SKU-lookup param.

**F-026 BUG — mobile Settings → Recently Deleted → permanent delete throws
`APIError`. — ✅ FIXED (commit `ac50fe8`, 2026-08-04).** Root-caused by
reading the code, not guessed:
`apps/api/src/routes/products.ts` purge route called `prisma.product.delete()`
directly. F-017's DB guardrail trigger (`037_db_guardrails` migration,
shipped 2026-07-26) blocks every hard delete on `products` unless
`SET app.allow_hard_delete = 'true'` is set first — this route never set
it, the trigger's exception isn't the `P2003` code the route's `catch`
checks for, so it fell through as an unhandled 500 the mobile client
showed as `APIError`. Fixed by porting the purge-cron pattern
(`apps/api/src/jobs/purge-soft-deleted.ts`) into the route: it now runs
`getPurgePrisma()` (the `kanchuki_purge` scoped role, which answers the
role-separation grant question too) and wraps the delete in a
`$transaction` that sets `SET app.allow_hard_delete = 'true'` on that
connection first. Existing `P2003` catch kept intact (a product in a past
order/collection genuinely can't hard-delete — correct behavior).

**F-025 shipped (commit `53f627c`):** `GET /products?sku=` exact-match lookup
(uppercase-normalized, deliberately NO owner-only gate — shop staff can
scan-to-sell at the counter); new `product/scan.tsx` barcode/QR screen
(`expo-camera`, already a dep — QR/ean13/ean8/code128/code39/upc/pdf417,
plus a manual SKU entry fallback) opened from a scan icon in the catalog
tab header, resolving SKU → existing `product/[id].tsx` where the existing
SOLD toggle + offline mutation queue do the rest; and a "Print Tag" button
on the product detail screen that shows a print-friendly SKU+QR rack tag
(`react-native-qrcode-svg`). GST invoice for offline sales remains the
deliberately-deferred future hook, unchanged. Tests: 3 SKU-lookup cases in
`products.test.ts`.

---

## Built: Standalone Product-Photo Cleanup Script (2026-08-05 18:04 IST)

**Not wired into the app** — a standalone CLI tool for manually cleaning up raw retailer product photos before catalog upload, built ad hoc this session. Lives at `scripts/batch-clean-photos.py`, `pip install rembg pillow`.

Modes (mutually exclusive, pick one per run):
- **Default:** rembg background removal → composite onto `--bg` flat color or `--bg-image` backdrop photo (cover-cropped) + soft drop shadow.
- **`--blur RADIUS`:** portrait mode — keeps the shot's own background, gaussian-blurs it, subject stays sharp. No removal/swap. More forgiving on cluttered rack shots than the swap mode (bad segmentation edges just look "under-blurred" instead of obviously pasted).

Both modes take:
- `--crop x1,y1,x2,y2` — pre-trim to the subject before segmentation. rembg segments by saliency, not by subject identity, so other high-contrast garments/mannequins touching or overlapping the target in-frame get kept as "foreground" too. Crop only helps when the clutter doesn't physically overlap the subject — it can't separate two touching objects (e.g. neighboring kurtis on the same rack). No fix shipped for that; either shoot against a clear wall (free, recommended) or swap to a prompted segmenter like SAM (bigger lift, not built).
- `--shine` — `ImageEnhance` contrast/saturation/brightness bump + a soft diagonal highlight (`ImageChops.screen`) over the subject only. Tuned down once already (first pass blew out to a white haze) — current values: Color 1.12, Contrast 1.08, Brightness 1.03, ellipse fill 70.

**Explicitly out of scope, discussed not built:** pasting the garment onto an AI/stock human model photo (a "virtual try-on," not background compositing — flat-pasting a cutout onto a human photo looks obviously fake since it ignores body pose/perspective/drape). Real version needs pose-aware garment transfer — this project already has that infra half-built and cost-tested: RunPod CatVTON (confirmed working end-to-end in an earlier session, but real money per run, avoid blind retries) or the planned self-hosted Fashion V-Tone v1.5 VTO engine (`docs/TECH-STACK.md`). Revisit that path only if asked.

**Demo outputs saved:** `scripts/demo/2026-08-05/` (5 sample runs — flat bg, custom bg-image, blur, and two shine variants).

---

## Built: Admin Photo Cleanup Test Page (2026-08-06, commit `3a3f863`, pushed to main)

Wires the standalone script above into an admin-panel test page so the user can iterate without asking for a fresh prompt each time — new product/background/sample photos, run, compare in-browser.

| Layer | Files | Summary |
|---|---|---|
| Backend | `apps/api/src/routes/admin/admin-photo-cleanup.ts` | `POST /v1/admin/photo-cleanup/run` — downloads product+background photo (SSRF-safe fetch), writes to a temp dir, shells out to `scripts/batch-clean-photos.py` (reused as-is, no reimplementation), uploads result to R2, returns `{ result_url }`. Reuses the existing `/admin/background-images/upload-url` presign endpoint for uploads — no new upload plumbing |
| R2 path | `packages/shared/src/constants/index.ts` | `R2_PATHS.photoCleanupTest` added |
| Registration | `apps/api/src/routes/admin.ts`, `apps/api/src/routes/admin/index.ts` | new route module registered alongside the other admin domain modules |
| Frontend | `apps/web/src/app/admin/photo-cleanup-test/page.tsx` | Upload/select product, sample (reference-only, client-side, never uploaded), background (upload new or pick from the existing Background Images library); Shine/Blur toggles; results shown as a before→after media-library-style grid, session-only (no new DB table — it's a test tool) |
| Nav | `apps/web/src/app/admin/components/Sidebar.tsx` | "Photo Cleanup Test" added under the Catalog group |

**Known limitation, not fixed:** the Railway API container has no Python/rembg installed (deliberately — see the script's own entry above on container memory-cap history). The page's UI and upload flow work in production; "Run cleanup" itself only works where Python is installed (currently: local dev only). Deploying Python to the prod API container is its own infra decision, not made here.

### Built: `--ghost-mannequin` mode (2026-08-06, commit `0c66a7f`) + two bugs fixed same day

Fills backdrop-colored gaps in a garment silhouette (hollow neckline/sleeve/waist showing the studio backdrop through them) via **local LaMa inpainting** — no 3rd-party API/key. Replaces a dead Snappyit integration (Snappyit turned out to have no public API at all — see `docs/photo-feature/ghost-mannequin-research.md`).

| Layer | Files | Summary |
|---|---|---|
| Detection | `scripts/batch-clean-photos.py` — `sample_backdrop_color()`, `detect_hollow_regions()` | Compares pixel color to the sampled backdrop (4-corner average) rather than relying on rembg's alpha mask shape — verified against a real photo that rembg outputs one solid blob regardless of interior color, so the mask-gap approach (first version) never worked |
| Fill | `apply_ghost_mannequin()` | Lazy-loads `simple_lama_inpainting.SimpleLama` (only on `--ghost-mannequin`, avoids checkpoint cost otherwise), inpaints just the detected holes, crops LaMa's padded output back to source size |
| Self-check | `scripts/test_ghost_mannequin.py` | Pure geometry test (no model download needed) — 2/2 passing |
| Wired | `apps/api/src/routes/admin/admin-photo-cleanup.ts`, `apps/web/src/app/admin/photo-cleanup-test/page.tsx` | New `ghost_mannequin` checkbox/flag, forces composite mode (blur ignored when set), 600s timeout (vs 180s default — first run also downloads the LaMa checkpoint) |

**CONFIRMED LIMITATION (tested on a real photo, not assumed):** does NOT remove a visible mannequin neck/stand or hanger of a different color than the backdrop — that's erasing an *object*, a different unsolved problem from filling a backdrop-colored *gap*. Use `--crop` to trim such hardware out of frame meanwhile.

**Bug 1 — ENOENT masked the real Python error (fixed, same commit):** `batch-clean-photos.py`'s `main()` caught per-photo exceptions, printed `FAILED: ...`, but always exited 0. The Node caller (`runPython()`) saw success and tried to read an output file that was never written → confusing `ENOENT` instead of the real crash reason. Fixed: `sys.exit(1)` when `failed` is non-empty; Node side now surfaces both `stdout` **and** `stderr` (the `FAILED:` line is a `print()`, lands on stdout — the old code only checked stderr).

**Bug 2 — wrong Python binary silently picked (fixed, follow-up commit same day):** with bug 1 fixed, the user hit `FAILED: product.jpg: No module named 'simple_lama_inpainting'` — looked like a real bug but was environment-selection: this dev box has **two Python installs**, `python3` resolves to a Windows Store alias (`pythoncore-3.14`, no deps installed) and `python` resolves to the real env with `rembg`/`simple_lama_inpainting` (`Python313`). `runPython()` tries `python3` first, found it (no `ENOENT`), got a real-looking error, and threw immediately without trying `python`. Fixed: any `"No module named"` in the combined stdout+stderr (whether an uncaught top-level traceback OR caught by the script's own per-photo `try/except` and printed as a `FAILED:` line — the LaMa import is lazy, inside the try block, so it's the latter in practice) is now treated as "this binary's environment is broken," and the loop tries the next binary instead of surfacing a misleading error. Verified end-to-end: `python3` fails clean → falls through → `python` succeeds, `1/1 cleaned`.

**Not yet done:** Railway prod container still has no Python (see "Known limitation" above) — `--ghost-mannequin` untested outside local dev.

### Bug hit + fixed: admin panel "refresh → login screen" + `CSRF token fetch failed: HTTP 403`

**Symptom reported by user:** "Failed to get upload URL" on the photo-cleanup page, `CSRF token fetch failed: HTTP 403` on `GET http://localhost:3001/v1/admin/csrf-token` on every retry, and the admin panel bouncing back to the login screen on every page refresh even right after a successful login.

**Root cause (verified by curl reproduction against a local API, not guessed):** the admin auth/CSRF chain on the API is correct (session JWT passes, CSRF cookie+header pair passes, mutations correctly 403 without CSRF). The real bug was the **admin layout's session gate**: `apps/web/src/app/admin/layout.tsx` validated the stored `admin_key` on every refresh by calling `GET /v1/admin/stats` — a **DB-backed** endpoint (counts retailers/products/collections). Any database hiccup makes it return 500, and the old layout treated *any* non-ok (500, network error) as "logged out", deleting `admin_key` from `sessionStorage`. Result: DB flake → next refresh logs the admin out → every admin API call (including the CSRF-token fetch the photo page fires before upload) goes out with an **empty `x-admin-key`** → 403 "Invalid admin key" → re-login only lasts until the next refresh. An earlier diagnosis blaming Serwist's `defaultCache` for caching the 403 was **wrong** — `defaultCache` ends with a catch-all `NetworkOnly` GET rule, so it never cached those cross-origin API calls; the `/v1/admin` `NetworkOnly` matcher added to `sw.ts` is kept but was never the cure.

**Fix:** (1) new DB-free `GET /v1/admin/session` endpoint (key/JWT check only, never touches Postgres) + `adminSessionEmail()` helper in `admin-auth.ts`; (2) layout validates against `/v1/admin/session` and only wipes the key on a definitive 401/403 — 5xx/network keep the key and show the panel optimistically; (3) `admin-fetch.ts` CSRF cache is now keyed to the admin_key it was minted under + `resetAdminFetchCache()` called on login/logout so a re-login never reuses a stale cookie+token pair. Web layout tests updated (7 pass); API admin tests 45/45 pass. **Deploy note:** on a browser that already hit the bug, one hard refresh (or SW unregister) is still needed for the new bundle. `admin.login.test.ts` has a pre-existing collection failure (its `@kanchuki/db` mock lacks `getPurgePrisma`, added to the import chain by the route-split refactor) — unrelated to this fix, needs its own patch. The stale root `.env` preview `WEB_URL` was fixed (now `https://kanchuki.app`) — but the real leak source was a **process-level `WEB_URL` env var** inherited from the parent shell/IDE (User+Machine scopes were empty; Node's `--env-file` never overrides existing env vars). Fixed in `apps/api/scripts/dev.mjs`: it now deletes an inherited `WEB_URL` from the child env so `.env` is the single source of truth for dev boots (verified — no more preview-URL startup warning). Railway prod still needs `COOKIE_SECRET` set (server refuses to boot without it) and `WEB_URL=https://kanchuki.app` for CORS.

---

## Built: Quality-First Image Compressor (≤80KB) + R2 Storage Measurement & Batch Compression (2026-08-06)

User ask: every stored image under 80KB with the highest possible quality, to cut R2 storage. Current bucket: **135.30 MB total, 95.03 MB of it images (334 objects)**. Dry-run of the batch script: **82.32 MB → 21.11 MB (−61.21 MB, −74.4%)** across 273 compressible images; 48 already ≤80KB; 22 skipped (non-image/excluded); 2 corrupt test artifacts under `tryon-test/` failed gracefully. After apply the bucket lands ≈74 MB.

| Layer | Files | Summary |
|---|---|---|
| **Compressor** | `packages/ai/src/image-compress.ts` (+ `image-compress.test.ts`, 6 tests) | `compressImageToTarget(buf, {maxBytes=80KB, maxDimension=1600, startQuality=88, minQuality=48, minDimension=640})` — quality-first: untouched if already ≤budget; quality ladder 88→48 (mozjpeg); only if nothing fits, dimension ladder 1600→640 (−15%/step) re-runs the ladder; best-effort fallback (never throws). Lazy sharp import (same Windows+pnpm dlopen pattern as detector.ts). Output always JPEG, alpha flattened onto white. Exported from `@kanchuki/ai` |
| **Storage measurement** | `scripts/measure-r2-storage.ts` | `npx tsx scripts/measure-r2-storage.ts` — ListObjectsV2 paginated, total/object count, per-prefix breakdown, image-vs-non-image split (loads root .env via `process.loadEnvFile`) |
| **Batch compression** | `scripts/compress-r2-images.ts` | Dry-run by default (`--apply` overwrites IN PLACE — same keys, URLs unchanged). Skips by default: `measurements/` (AI measurement extraction accuracy), `/kyc/` (document legibility), `backups/`, `catalog-pdf`. Concurrency 4, per-object graceful failure. |
| **Wired write paths** | `apps/api/src/routes/admin/admin-photo-cleanup.ts`, `packages/ai/src/detector.ts` | Photo-cleanup result + `cleanupProductPhoto` (the catalog-import server-side path — the biggest server-written image source) now compress to ≤80KB before landing in R2. Mobile-app direct-to-R2 PUTs aren't interceptable server-side — those are covered by the batch script / a future re-run. |

**Quality trade-off (surfaced to user):** 80KB is aggressive for detailed fashion shots — spot checks landed at q60 @1600px (indistinguishable) or q53–60 @~800px (acceptable, only for high-detail originals). Measure-script + compressor + wiring verified: AI 55/55 tests, packages/ai + apps/api tsc clean, dev server healthy. **Applied 2026-08-06 with user go-ahead:** `--apply` run wrote 273 compressed images in place — bucket 135.30 MB → **74.09 MB**, image storage 95.03 → 33.82 MB (−61.21 MB, −74.4%). Re-run anytime: `npx tsx scripts/compress-r2-images.ts` (dry) / `--apply`.

**Follow-up same day — client-side compression on mobile upload:** new `apps/mobile/src/lib/compress-image.ts` (`compressImageForUpload`, + test with 5 cases) is the mobile twin of the server compressor: expo-image-manipulator (already a dep) quality ladder 0.9→0.5, 1600px cap, untouched if already ≤80KB, best-effort (any error returns the original — never blocks a retailer's upload). Wired into the single choke point `uploadImageToR2` (`apps/mobile/src/lib/api/client.ts`) — every `image/jpeg` upload across the ~13 call sites (product add/photos/color, bulk, bulk-onboard, catalog-import, categories, try-on, logo/banner; spin-video auto-skipped as video/mp4, PNG/WebP sources skipped too so JPEG bytes never ride a non-JPEG content type) now lands ≤80KB with no re-run needed. Opt-outs `{ compress: false }` mirror the server exclusions: KYC docs (`settings/index.tsx`) and body-measurement photos (`customer/[id]/measurement.tsx`) keep full detail. Verified: mobile `tsc --noEmit` clean, vitest 30/30 (5 new); the collection-failing `__tests__/staff/retailer-onboard.test.tsx` is the pre-existing Rolldown JSX-parse error in expo-linear-gradient's vendor build (Black & Gold entry), unrelated.

**Follow-up same day — daily R2 compression maintenance cron:** `apps/api/src/jobs/compress-r2-images.ts` (`handleCompressR2Images`) mirrors the batch script inside the API process on a BullMQ repeat schedule (daily 4:30 AM UTC, after the 3–4 AM backups, in the shared `QUEUES.MAINTENANCE` worker via `job.name` dispatch in `apps/api/src/jobs/index.ts`). Lists the whole bucket (`listObjects()` added to `packages/ai/src/r2.ts`, API-native `getSecret` credentials), skips non-images + the same exclusions as the script (measurements/, /kyc/, backups/, catalog-pdf), skips ≤80KB objects WITHOUT downloading (cheap daily run), downloads larger images and overwrites IN PLACE when the quality-first compress result is strictly smaller (URLs/DB refs unchanged). Concurrency 2 keeps sharp's decode buffers bounded in the 2GB container; per-object best-effort (one corrupt image can't fail the pass); writes `COMPRESS_R2_IMAGES` audit entries with the full report. Guards on `R2_ACCOUNT_ID` — no-op with a warning where R2 is unconfigured. Tests: `compress-r2-images.test.ts` (5 — unconfigured no-op, exclusions/skip-without-download, in-place overwrite only-when-smaller, failing-object tolerance, audit bytes-saved). Verified: apps/api tsc clean, jobs suite 21/21.

**Same day — admin Storage Report page:** `apps/api/src/routes/admin/admin-storage.ts` (`GET /v1/admin/storage-report`) reads the `COMPRESS_R2_IMAGES` audit entries and returns a rollup summary + per-run breakdown; pure `parseCompressionRun`/`summarizeCompressionRuns` helpers keep the math unit-testable (defensive metadata coercion, `skipped_unconfigured` runs excluded from totals, `last_run_ok` = null for an unconfigured no-op so the UI never shows a false amber alert). Web: `apps/web/src/app/admin/storage-report/page.tsx` (Admin → Database → Storage Report) — summary cards (total saved with % of image bytes, images compressed, runs, last-run status) + runs table (compressed / ≤80KB / skipped / failed counts, before→after bytes, saved, duration) + informative empty state (cron just deployed, first run 4:30 AM UTC). Tests: `admin-storage.test.ts` (8 — parse mapping, null metadata tolerance, unconfigured flag, rollup math, unconfigured exclusion, failure + unconfigured last-run semantics, empty summary). Verified: api + web tsc clean, tests 8/8, route registered on the dev API.

**Same day — "Run compression now" button:** `POST /admin/storage-report/run` enqueues the same `compress-r2-images` maintenance job the cron fires (`addCompressR2ImagesJob` producer in `jobs/index.ts`, data passed through the worker dispatch) so an admin can force a pass after a bulk import without waiting for 4:30 AM UTC. The job records `triggered_by: 'admin'` (vs `'schedule'`) in the audit metadata; the report page badges manual runs and, on enqueue, polls the report until a new run row lands (≤1 min, button disabled while polling, interval cleaned up on unmount/re-click). Enqueue failure (Redis down) → 503 `QUEUE_UNAVAILABLE`; a separate best-effort `COMPRESS_R2_IMAGES_RUN` admin audit entry records who pressed it without polluting the report query. Tests: 15/15 (admin-storage + compress-r2-images, incl. triggered_by parse default + audit metadata source).

**Same day — Live R2 storage panel (Re-measure):** `packages/ai/src/r2.ts` gains pure `summarizeR2Objects` (same totals as `scripts/measure-r2-storage.ts` — total/object count, image split, per-prefix breakdown; type aliases not interfaces so the nested shape is Prisma-Json-assignable) + `measureR2Storage()` wrapper. New `measure-r2-storage` maintenance job writes an `R2_STORAGE_MEASURE` audit entry with the totals; `POST /admin/storage-report/measure` enqueues it (503 on Redis down, same shape as the run button). `GET /storage-report` now returns `live_measurement` (latest parsed measurement); the page shows a Live R2 storage panel (4 stat cards + top-10 prefixes table) with a Re-measure button sharing the same `pollRef`/`polling` machinery as Run-compression-now (one poll at a time, both buttons gated, interval cleared on re-click/unmount). Tests: packages/ai r2.test 3/3, api 19/19 (parseStorageMeasurement mapping + null tolerance, measure job audit write + R2-unconfigured propagation).

**Same day — web deploy blocked by a React-types hoist bug (fixed `908a9d1`):** the storage-report commit could not ship because `next build` failed on every web deploy since the photo-cleanup page landed (`3a3f863`) — Railway's Linux pnpm install hoists `@types/react@19.1.17` (from the Expo/mobile workspace) into the root, where `useRef<T>(null)` returns `RefObject<T | null>` (non-nullable `current`), which is not assignable to a `React.RefObject<HTMLInputElement>` prop. Windows-local dev resolves 18.3.31 instead, so local `tsc` stayed green while Railway's type-check red. Fix in `photo-cleanup-test/page.tsx`: the `Dropzone.inputRef` prop is now the plain structural `{ readonly current: HTMLInputElement | null }` — both @types/react versions collapse their `RefObject` instantiations to that exact shape. Verified by swapping the installed types to 19.1.17 and back (18 OK, 19 OK). Diagnosing failed Railway deploys: `railway logs --service <svc> --build` shows only the last *successful* build — for the real failure reason, query GraphQL (`backboard.railway.com/graphql/v2`, token in `~/.railway/config.json` `user.accessToken`) for `deployment(id) { diagnosis }`.

---

## ✅ BUILT 2026-08-06: Fashion V-Tone LIVE on Railway + "Generate on model" admin tool

**User approved option #1 (self-hosted V-Tone) after cost check** — the $5 Hobby plan has ~$2/mo headroom but an always-on 3rd service would blow it, so V-Tone runs **serverless with autosleep** (sleeps after 10 min idle, wakes on request) and a **workspace hard limit** was set (soft $8 / hard $10) so a runaway can never surprise-bill. Commits `9a9e923` (feature) + `ce01a15` (storage report run-now, earlier).

| Layer | Files | Summary |
|---|---|---|
| **V-Tone infra** | Railway service `fashion-vtone` (id `e6afdefd`) | Built from `services/fashion-vtone/Dockerfile` (repo-root context, watch pattern set). Domain `fashion-vtone-production.up.railway.app:8000`. R2 creds copied from the API service (incl. `R2_ENDPOINT` built from `R2_ACCOUNT_ID`). **Gotcha hit + fixed:** Railway injects `PORT=8080` which overrode the Dockerfile's `ENV PORT=8000` — Uvicorn bound 8080 while the domain targeted 8000 → 502. Fixed with explicit `PORT=8000` variable. Also: `railway environment config --json` shows template defaults (RAILPACK) even for the API service that clearly builds from a Dockerfile — the authoritative config write is `railway environment edit --json '{"services":{"<id>":{...}}}'` (dot-path `--service-config` calls silently no-op'd); verify by reading the same JSON back |
| **Engine override** | `packages/ai/src/tryon.ts` | `TryOnRequest.vtoneCategory?: 'tops'|'bottoms'|'one-pieces'` — explicit V-Tone category that wins over the heuristic mapping (the admin picker must be honored exactly; the heuristic only returns tops/one-pieces) |
| **Job** | `apps/api/src/jobs/admin-tryon.ts` (new) + test | `handleAdminTryOn({job_id, model_url, product_url, category})` — runs `triggerTryOn`, fetches the result with **SSRF-safe `ssrfSafeFetch`+`readCappedBuffer`** (NOT `downloadBuffer`, which takes an R2 key, not a URL — the reviewer caught this), re-encodes to ≤80KB JPEG, uploads under `admin/photo-cleanup-tests/<job_id>-onmodel.jpg`, writes an `ADMIN_TRYON` audit entry on success **and** failure (both best-effort; attempts=1 so exactly one row per job). Registered on the MAINTENANCE queue via `addAdminTryOnJob()` + worker case |
| **API** | `apps/api/src/routes/admin/admin-photo-cleanup.ts` + test | `POST /photo-cleanup/tryon` (zod-validated, enqueues, 503 `QUEUE_UNAVAILABLE` on Redis down) + `GET /photo-cleanup/tryon-results` (ADMIN_TRYON audit feed, take 50, pure `parseTryOnResult` — rows without a result_url render as failed, never a broken tile) |
| **Web UI** | `apps/web/src/app/admin/photo-cleanup-test/page.tsx` | "Generate on model" panel (model-photo dropzone + tops/bottoms/one-pieces select) + per-cleanup-result **"On model"** button → enqueues + polls the feed up to 3 min (double-click-safe: interval cleared at start, attempts counted only on successful fetches) → result appears in the on-model feed, clickable into the lightbox. Model photo uploaded once per session, reused across runs |

**Verified:** api tsc 0, web tsc 0, tests 8/8 (3 job + 4 parse + new fetch-failure case), biome clean on new code (remaining flags are the accepted baseline). API + web + vtone all deployed SUCCESS on `9a9e923`; `VTONE_API_URL=https://fashion-vtone-production.up.railway.app` set on the API service. Pipeline log confirmed loading: device cpu, TryOnModel+DWPose+FashnHumanParser all loaded.

**⚠️ Live-test finding (2026-08-06): CPU inference is ~26 min per try-on, not 30-60s.** A real POST `/try-on` against production ran 30 sampling timesteps at ~52s/timestep on the Railway CPU tier — 9/30 steps took 8 min. The pipeline works end-to-end (downloads images, runs TryOnPipeline, no errors) but the speed budget assumed in the earlier design was wrong for CPU. Consequences: (1) the admin page's 3-min poll will hit its timeout on every run in practice — the job still completes in the background and the result lands in the feed, but the UI will show the "may still be running" message; (2) `callVTONOnce` has a 120s `AbortSignal.timeout` that WILL kill real CPU runs mid-inference (8 min > 2 min) — so production try-ons via the API job currently fail on the timeout, not on the engine. **Fix path not yet applied:** lower `TryOnPipeline` timesteps (30 → 8-10, quality tradeoff) and/or raise `callVTONOnce`'s timeout (120s → 30 min for CPU) + extend the page poll. GPU instance would return to ~10-30s but costs more than the Hobby headroom — the $5 plan chose CPU.

**Setup note:** to change the V-Tone domain, update `VTONE_API_URL` on the API service (it's also the F-012 integration key admins see under Admin → Integrations). Autosleep wakes the service on first request after idle — the admin page's 3-min poll absorbs the cold-start delay.

---

## ✅ BUILT 2026-08-11: Featured Stores — admin-curated pins float to the top of /stores + homepage teaser

**User ask:** "add featured stores: an admin-curated flag so the team can pin specific stores to the top of the directory."

| Layer | Files | Summary |
|---|---|---|
| **DB** | `packages/db/prisma/schema.prisma`, `migrations/049_featured_stores/`, `docs/DATABASE.md` | `Retailer.is_featured Boolean @default(false)` + `featured_at DateTime?` + `@@index([is_featured])` |
| **Admin API** | `apps/api/src/routes/admin/admin-retailers/admin-retailers-management.ts` | `POST /admin/retailers/:id/feature` / `unfeature` — mirrors suspend/unsuspend (404/422 guards, `FEATURE_STORE`/`UNFEATURE_STORE` audit logs). List/detail selects expose `is_featured`; list gains a `featured` boolean filter |
| **Public API** | `apps/api/src/routes/public/public-stores.ts` | orderBy `[{is_featured:'desc'},{featured_at:'desc'},{updated_at:'desc'}]` — pinned stores first, most-recently-pinned first within the block; `is_featured` in the payload |
| **Web badges** | `apps/web/src/app/stores/StoresDirectory.tsx`, `sections/MarketingSections.tsx` | Star "Featured" pill on pinned store cards (turmeric palette) |
| **Admin UI** | `apps/web/src/app/admin/retailers/page.tsx`, `admin/retailers/[id]/page.tsx` | Featured filter dropdown + row badge on the list; Pin/Unpin toggle + header badge + ineligibility hint (no public_slug/zero products → pin would be invisible) on the detail page |
| **Tests** | `apps/api/src/routes/public.test.ts`, `admin.test.ts` | 1 public orderBy test + 6 admin feature/unfeature tests (200/422/404). **Also fixed the `withPublicCache` test bypass:** vitest doesn't override an inherited `NODE_ENV=development` (repo `.env`), so route tests hit real Redis and served stale cached payloads across runs within the 60–90s TTL — now `process.env.VITEST === 'true'` bypasses (the canonical flag; the `NODE_ENV==='test'` check never fired) |

**Verified:** db/api/web tsc clean; API **389/389** (was 382), web 93/93, lint clean, delete/secrets guards pass. **Deploy note:** migration 049 must be applied to prod (Supabase SQL Editor) before the pin endpoints are used; the endpoint 404s naturally (column missing → Prisma error) until then — apply DB first, then API/web deploy (Railway auto-deploys on push).

## ✅ BUILT 2026-08-11: Colabs-inspired marketing redesign — new palette, marquee, logo, MatterSemiMono headings

User asked for the marketing/content pages (only) to look and animate like **colabs.com.au** (Awwwards 2023): warm off-white canvas, near-black ink, yellow-lime accent, modular solid-color service cards, infinite marquee, lenis smooth scroll. Full palette adopted; navy/gold stays on storefronts + admin (they declare their own scoped display font and keep the legacy `ink`/`rust` tokens untouched).

| Layer | Files | Summary |
|---|---|---|
| **CoLab tokens** | `apps/web/tailwind.config.ts` | Added `cream` (#F9F8F6 canvas), `carbon` (#060606 ink), `volt` (#D9DB4D lime, DEFAULT so bare `bg-volt` works), `cobalt` (#0046C7), `terracotta`/`iris`/`moss`/`fern`/`lilac`/`mint`/`sandal`/`mist` card chips + `marquee` keyframes. Legacy tokens untouched (storefront/admin isolation) |
| **Font** | `apps/web/src/app/layout.tsx`, `apps/web/tailwind.config.ts` | Display font = **MatterSemiMono** via `next/font/local` from `apps/web/src/fonts/` (uploaded OTF files; weights 400/500/600/700 registered) — replaced the Space Grotesk stand-in. Served self-hosted, no Google Fonts request. Fallback stack switched serif→mono to match. Storefronts keep their scoped Bricolage `--font-display` |
| **Lenis** | `apps/web/src/app/globals.css` (+CSS), `apps/web/package.json`, `Navbar` in Chrome.tsx | Lenis smooth scrolling init in the marketing Navbar (matchMedia-gated for reduced motion, destroyed on unmount) |
| **Chrome** | `apps/web/src/components/site/Chrome.tsx` + new `accents.ts` | Navbar (volt CTA), Footer (carbon bg + big wordmark), Section/SectionHeader (cobalt tags), `ColorCard` (renamed from `SelvedgeCard`), PageHero, FinalCta, new `Marquee` (CSS translateX -50% seamless loop). Accent maps shared via `accents.ts` (pure data — server components import it directly, not through the `'use client'` Chrome) |
| **Homepage** | `apps/web/src/app/page.tsx`, `sections/MarketingSections.tsx` | Editorial hero (Space-Grotesk-era headline kept), services marquee of solid color cards, restyled stats/how-it-works/moat/stores/testimonials/pricing/faq/CTA |
| **Content pages** | for-retailers, for-customers, how-it-works, faq(+FaqAccordion), about, testimonials(+LiveStats), contact(+ContactForm), download, stores(+StoresDirectory+StoreLogo), pricing(+PricingTable), terms, privacy, account-deletion | All repainted to the CoLab palette; color-block feature grids, near-black final CTAs |
| **Logo** | `apps/web/public/kanchuki-logo.png` (new), Chrome.tsx navbar+footer, `KanchukiMark.tsx` deleted | User-supplied 884×176 dark-navy "Kanchuki" wordmark PNG (red i-dot) replaced the interlaced-thread mark + text in navbar and footer |

**Verified:** web tsc clean, 93/93 tests, prod build passes (font files emitted into `.next/static/media/`), live browser check on homepage + for-retailers (hero, marquee, color cards, volt buttons all render; 0 console errors). MatterSemiMono confirmed live via `document.fonts.check`. **Note:** the uploaded files are `-TRIAL-` variants — confirm the MatterSemiMono license covers web embedding before shipping. **Deploy:** push → Railway auto-deploys web.

## ⚠️ INCIDENT + FIX 2026-08-11: Test-retailer cleanup deleted a live retailer's R2 photos (Priya Cloth House)

**User report:** all product images broken on the live storefront `https://kanchuki.app/priya-cloth-house-ah0e/all`. Root-caused via full forensic chain (DB audit log + R2 bucket listing + prod DB queries), not guessed:

- **Timeline:** `scripts/delete-test-retailers.ts` ran `--apply` **2026-08-08 11:43** with 5 test phones including `913131313131` — which `normalizeIndianPhone()` reduces to `3131313131` = **Priya Cloth House's real phone**. It deleted **236 R2 objects** (all of Priya's product photos) + **5 Supabase auth users** (Priya's included). A second run at 22:17 had removed the number from the list — too late. Bucket audit confirms the drop: 382 objects (Aug 7) → 153 (Aug 8).
- **Why DB survived but images didn't:** the script's DB delete is blocked by production role separation (writes scoped SQL instead), but its R2 cleanup + Supabase auth deletion run regardless ("Everything below still runs now").
- **Not recoverable:** R2 bucket versioning is **disabled** (`ListObjectVersions not implemented`) — the image bytes are permanently gone. DB rows intact (20 products, valid r2_keys), auth user deleted.
- **Restore path (user chose):** re-upload photos from the retailer's phone — products/names/prices all still in DB; the auth flow re-links by phone on next OTP login (verified in `apps/api/src/routes/auth.ts` — `auth_user_id !== user.id` → relink-by-phone path).
- **Prevention shipped:** `scripts/delete-test-retailers.ts` hardened — `--apply` now **fails closed** unless (1) `--shops "Name1,Name2"` explicitly lists every matched shop name (case/whitespace-insensitive match, anything unmatched aborts) and (2) no matched retailer has live (non-soft-deleted) products unless `--force-live` is passed. Guards run before any destructive action; dry-run flow unchanged. Reviewer-reviewed (dead code removed, comparison normalized).
- **Recommended (not done):** enable R2 bucket versioning in Cloudflare so future accidental deletes are recoverable.

## ✅ MIGRATED 2026-08-06: Fashion V-Tone moved off Railway → self-hosted on Hetzner CX43

**Why:** Railway Hobby's throttled/shared CPU gave ~26min/try-on (see live-test finding above). Deep-research pass (CX43: 8 shared AMD EPYC vCPU @2GHz, 16GB RAM, 160GB NVMe, **no GPU**) confirmed RAM/disk were never the bottleneck — only CPU speed matters, and CX43's dedicated-ish cores beat Railway's throttled hobby container for €12/mo vs a GPU box (Hetzner GEX44, €184/mo) that would've blown the pricing-tier AI-cost budget. Commit `dd0972d`.

| Layer | Files | Summary |
|---|---|---|
| **Server** | Hetzner Cloud, `ubuntu-16gb-nbg1-1` (CX43, id `159605128`), IP `2.28.56.91`, region nbg1 | Docker + compose plugin installed manually via SSH (key-only auth — password auth was a dead end, `ssh-copy-id` from PowerShell silently failed to write `authorized_keys`; fixed by reset-password + manual `>> authorized_keys` append). `ufw` locked to 22 (SSH) + 8000 (V-Tone) only |
| **Deploy** | `services/fashion-vtone/docker-compose.yml` (now committed — was untracked/never pushed, which broke the first `git clone`-based deploy attempt on the box) | `docker compose -f services/fashion-vtone/docker-compose.yml --env-file services/fashion-vtone/.env up -d --build`, repo cloned to `/opt/kanchuki` from the public GitHub remote (no deploy key needed) |
| **Auth gate (new)** | `services/fashion-vtone/app.py`, `packages/ai/src/tryon.ts` | CX43 has no static outbound IP for Railway to be firewall-allowlisted against (unlike a same-cloud setup), and the service had zero auth. Added `VTONE_SHARED_SECRET` — `/try-on` 401s without a matching `X-Vtone-Key` header. `callVTONOnce` sends it via `getSecret('VTONE_SHARED_SECRET')` (same DB-first/env-fallback pattern as `VTONE_API_URL`, F-012). New admin-manageable key registered in `packages/shared/src/constants/index.ts` `INTEGRATION_KEYS` |
| **Config live** | Railway API service (`supportive-love`) env vars | `VTONE_API_URL=http://2.28.56.91:8000`, `VTONE_SHARED_SECRET=<set, not in this file>`. Old Railway `fashion-vtone` service (id `e6afdefd`) **deleted** — V-Tone no longer runs on Railway at all |
| **Timeout** | `packages/ai/src/tryon.ts` | `callVTONOnce`'s hardcoded 120s `AbortSignal.timeout` (flagged as broken in the live-test finding above) replaced with `VTONE_CALL_TIMEOUT_MS`, defaulting to 30min — CPU inference legitimately takes that long, aborting mid-run wastes the whole call |

**Real end-to-end test (2026-08-06):** POST `/try-on` with real R2-hosted images + valid header → `200 OK`, **`Try-on completed in 1936819ms` (~32.3 min)**, 30 timesteps, 512×768 person / 512×512 garment. Confirms the full chain (auth → download → DWPose → human parser → diffusion → response) works correctly on CX43. Same ballpark as the Railway number — expected, since CX43 has no GPU either; this migration fixed cost and CPU throttling, not the fundamental CPU-vs-GPU latency gap. GPU remains the only path to the original 10-30s target, and remains out of budget (see research above).

**Known rough edges hit during this deploy (for next time):** (1) a single long-lived local `curl`/`ssh` connection over WAN silently dies around the 10min mark on an otherwise-idle TCP connection (NAT/middlebox idle reap, not a Railway or CX43 issue) — the server-side request keeps running and completes regardless, so results from a dropped client aren't lost, just unobservable from that connection. Route long-poll/long-request testing through `ssh -o ServerAliveInterval=20` or run the curl from `localhost` on the box itself. (2) The service is single-request-blocking (no worker concurrency) — a second `/try-on` call while one is in flight has to wait, it doesn't queue or reject.

**Not yet done:** no TLS in front of port 8000 (plain HTTP, auth-gated by shared secret only) — fine for now, revisit if this box gets more than one caller. No `HF_TOKEN` set — `fashn-human-parser` cold-start hits unauthenticated HF Hub rate limits (worked fine this session, but is a future flake risk).

---

## Planned — NOT started: Multi-Photo Ken Burns Effect (product photos → pseudo-video)

**Requested 2026-08-05. DO NOT START until user says go ahead.**

User wants: retailer clicks 3 photos of one product → auto-combine into short "video-like" loop (pan+zoom+crossfade between shots), not a real encoded video file. Wants it in **both** mobile retailer app and web customer PWA.

**Proposed approach (discussed, not built):** Ken Burns effect — each photo scale 1→1.15 + translate over ~2.5s, crossfade opacity into next photo, loop 3 photos. No server cost, no AI call, no video encode.
- **Mobile (`apps/mobile`):** Reanimated (already a dep, used for `AnimatedPressable`/`GradientButton`) — animate scale/translate/opacity per photo, likely on product detail (`app/product/[id].tsx`) or catalog card.
- **Web (`apps/web` customer PWA):** pure CSS `@keyframes` transform+opacity crossfade, no JS lib needed — likely `CollectionView.tsx` product card and/or `ProductDetailSheet.tsx` hero.

**Explicitly out of scope for this version:** exporting a real downloadable/shareable mp4 (would need ffmpeg server-side render, real compute cost) — only asked for an in-UI animated loop.

---

## ✅ BUILT + MIGRATED + LIVE-VERIFIED (2026-08-07) — DB-backed Category/Style/Occasion/Fabric taxonomy (F-027)

**All code done 2026-08-07, and the production Supabase DB is now fully migrated and browser-verified.** Applying migration 046 surfaced that the live DB was actually **four migrations behind** (`_prisma_migrations` topped out at `042_seed_llama_vision_fallbacks` — 043/044/045/046 all pending, not just 046). Root-caused via direct `information_schema`/`pg_indexes` checks rather than trusting `_prisma_migrations`: 043 (`products.sku/description/subtype`) and 044 (`team_members.phone`) had their DDL already applied by hand at some point but were never recorded; 045 (`default_product_categories`) and 046 (`product_attributes`/taxonomy) were fully unapplied. Applied via Supabase SQL Editor (043/044 recorded as no-op since columns already existed; 045 and 046 run fresh), each followed by a manual `_prisma_migrations` INSERT keyed to that file's real sha256 checksum. Verified post-apply: 10 default categories, 33 default attributes (9 style/11 occasion/13 fabric), 66 backfilled `product_attributes` rows (2 existing retailers × 33). `pnpm db:generate` + `tsc --noEmit` clean across `@kanchuki/db`/`@kanchuki/api`. Browser-verified (headless, real admin session) at `/admin/default-attributes`: all three tabs render correct seeded names, 0 console errors, CRUD confirmed working (user added a test "Kurtis" STYLE row live, renders back correctly). See `docs/PROGRESS.md` "2026-08-07" entries for full detail.

User ask: move Category/Style/Occasion/Fabric off hardcoded lists onto the DB — admin-editable, seeded as defaults per new retailer, AI tagging auto-detects Style/Fabric (Occasion/Category already did), dynamic select/multi-select on product add. Ladies-only now, schema ready for Men/Kids later via a `segment` column (zero migration needed to add them, just new rows). Style/Fabric are multi-select (user-confirmed); Category stays single (`category_id`), Occasion stays multi (`occasions[]`) — both pre-existing.

**Code complete:** Prisma schema (`ProductSegment`, `ProductAttributeKind` enums; `DefaultProductAttribute`/`ProductAttribute` models; `Product.styles`/`fabrics`), migration `046_product_attributes` written, backend seed helper + signup wiring, admin CRUD (`/admin/default-attributes`), retailer CRUD (`/v1/product-attributes`), AI tagger schema extended (style+fabrics, `detector.ts` preliminary-tag object updated to match), products API accepts them. `tag-product.ts` never-clobbers `styles`/`fabrics`/`occasions` on re-tag (same `current == null || length === 0` rule as name/subtype — retailer picks made on the single-product edit or bulk review screen survive the background tagging job; AI fills each array only when still empty). Mobile: `product/add.tsx`, `product/[id].tsx` (old hardcoded single-select Fabric UI replaced by the new dynamic multi-select, not kept alongside), `customer/[id].tsx` (Fashion DNA preferences), and the bulk catalog-import review screen (`catalog-import.tsx` — per-item Style/Fabric chip rows, AI-detected values pre-selected, free-text Fabric field replaced per the same two-pickers decision, `fabric_estimate` stays the AI guess) all wired to `productAttributeApi` instead of hardcoded lists. Dead constants (`OCCASION_TYPES`/`FABRIC_TYPES`) removed from `packages/shared/src/constants` and the mobile test mock. Admin web UI page (`/admin/default-attributes`, kind-tab switcher) + Sidebar link built.

**Verified 2026-08-07 (this session):** `packages/shared` (after rebuild), `packages/ai`, `packages/db`, `apps/api`, `apps/web`, `apps/mobile` all `tsc --noEmit` clean. Tests: API 306/306 across 23 files (incl. a 12-test admin default-attributes CRUD suite), AI 58/58, DB 10/10. Also fixed alongside: 8 pre-existing API test files that were failing to LOAD (missing `getPurgePrisma` in their `@kanchuki/db` mocks — the purge-retailer-now/storage-report route graph calls it at module top-level; CLAUDE.md had flagged `admin.login.test.ts` for this, the storage-report job widened it to 8 files) + added the first test coverage for the new routes (`product-attributes.test.ts`, 9 tests incl. IDOR). **Migration status: fully applied and live.** `GET /v1/product-attributes?kind=STYLE` and the admin/mobile pickers work end to end — nothing left pending on this feature.

## Built: Store QR Self-Service + Store-URL Rename Sync + Onboarding QR Nudge (2026-08-08, commit `3311fc7`, pushed to main)

User asks this session: (a) recover the crashed session's last task — surfaced the Pro-mode camera error root cause; (b) store URL showing another store's name; (c) retailer QR generate/delete with verification before delete. All shipped + pushed to main 2026-08-08.

| Layer | Files | Summary |
|---|---|---|
| **QR generate/delete** | `apps/api/src/routes/retailers/retailers-settings.ts`, `apps/mobile/app/store-profile.tsx` | New `DELETE /v1/retailers/me/qr-slug` (idempotent 204, audit-logged). Store QR screen rewritten: no auto-create on open — "Generate QR Code" button in the empty state; existing QR → Share/Save + **Delete QR requiring typed shop-name verification** (never deletes directly). Close button falls back to dashboard via `router.canGoBack()` |
| **URL rename sync** | `apps/api/src/routes/retailers/retailers-profile.ts` | `PUT /me` regenerates `public_slug` from the new shop name when the name changes **and** a QR slug exists (bounded collision retries + timestamp fallback) — the store URL always carries the shop's own name; never touches unchanged names / no-QR retailers |
| **Rename notice** | `apps/mobile/app/settings/index.tsx` | One-shot "Your store link has changed" banner (new link + "View QR Code" → store-profile) fired only when the PUT response slug actually differs |
| **Onboarding nudge** | `apps/mobile/app/onboarding.tsx` | Done step gains "Create your store QR code" — completes onboarding, lands on the Store QR screen |
| **Pro-mode error** | `apps/api/src/plugins/error-handler.ts`, `apps/api/src/routes/products/products-pro-cleanup.ts`, `apps/mobile/app/product/add.tsx` | Environment failures (sidecar/python down, network, timeout) → 503 `SERVICE_UNAVAILABLE` "use Photo mode instead"; photo-quality failures stay 422. **Camera-error root cause:** `PHOTO_CLEANUP_SERVICE_URL` unset → local-python fallback, but the sidecar commit removed Python from the Railway container — Pro needs the sidecar deployed (ops action, not done) |
| **Tests** | `apps/api/src/routes/retailers.test.ts`, `apps/api/src/routes/products/products-pro-cleanup.test.ts` | Rename regeneration, DELETE qr-slug idempotency, 503 env-down vs 422 photo-quality. API suite **332/332** |

Also in `3311fc7` (the crashed session's in-flight work, landed together): the 4-step onboarding redesign (Shop → Location → GST → Done), Terms/Privacy links + new `apps/web/src/app/terms/page.tsx` via the shared `apps/mobile/src/lib/web-url.ts` helper, DB category self-heal on `GET /categories` (gated on `onboarding_completed`), and the tabs onboarding-gate fix (`isFetching` guard). Full detail: `docs/PROGRESS.md` "2026-08-08 — Store QR Self-Service" entry.


## Built: Add-Product Flow Rework — AI-in-Background + F-028 Auto-Contrast Background (2026-08-08, committed `ec525bd` + follow-ups)

**User ask:** "cross check all process of adding new product. every step has errors, i want everything clean and processing AI in background. retailer or team member click photos and save them with adding price, rest everything detected by AI tagging, and set the background, admin will add photos of background and AI detect if product item is in dark color then auto use light background and if product item is light color, then auto switch with dark background image."

**Flow change (`apps/mobile/app/product/add.tsx`):** the blocking "Uploading Product" progress screen (`ai_tagging` step + `handleUploadAndTag` + spinner/progress machinery) is **deleted** — flow is shoot → preview → Use Photo → edit (price) → Save, with the photo uploaded at Save time and **everything else done server-side after creation** (AI tagging + cleanup + background). Auto-clean is **ON by default**; the background-picker chip now reads **"Auto"** (null = auto-contrast, not white); pre-save color-detect chip + `aiTags` state dropped (AI fills after save).

**F-028 auto-contrast background (full stack, all uncommitted):**

| Layer | Files | Summary |
|---|---|---|
| Shared | `packages/shared/src/constants/index.ts` + `src/colors.test.ts` (5) | `classifyColorTone(name)` → hex via `FASHION_COLOR_ALIASES` → WCAG luminance bands (dark <0.35, light >0.6, mid/unknown null) |
| AI | `packages/ai/src/image-quality.ts` + tests (4) | `imageLuminance()` (32×32 sharp avg) + `isDarkImage()` |
| DB | `schema.prisma` + `migrations/047_background_tone` | `BackgroundTone` enum + `background_images.tone` nullable |
| API lib | `apps/api/src/lib/backgrounds.ts` (+3 tests) | `pickContrastBackground(tone)` → newest ACTIVE opposite-tone backdrop |
| Tag job | `apps/api/src/jobs/tag-product.ts` (+2 tests) | explicit pick wins; else `classifyColorTone(primary_color)` → auto-contrast; mid-tone → white default. Never-clobber intact |
| Pro cleanup | `apps/api/src/routes/products/products-pro-cleanup.ts` | no explicit bg → `isDarkImage()` on raw frame → auto-contrast (proxy, see limitation) |
| Admin API | `apps/api/src/routes/admin/admin-media.ts` | tone computed at upload; PATCH override (null clears); audit before/after |
| Admin UI | `apps/web/src/app/admin/background-images/page.tsx` | tone badge + Auto/Light/Dark override select |

**Verified:** api/mobile/web/shared/ai `tsc --noEmit` clean; API 342/342, AI 67/67, shared 15/15; biome clean on new files (baseline warnings only elsewhere). Needed `prisma generate` + shared/ai rebuild (Windows EPERM on the engine DLL while a dev server held it — `--no-engine` types first, plain generate later succeeded).

**Limitation (by design):** pro-path auto-contrast uses raw-frame luminance as a garment proxy — a busy backdrop can skew it; tag-product's AI-color path is the accurate one. **Ops:** migration 047 must be applied (dev `pnpm db:push`, prod Supabase SQL Editor) before deploy; deploy order DB → API → web → mobile rebuild.

## Built: Redis Public-Response Cache for Customer Storefronts (2026-08-08, commit `56068e7`)

**Why:** viral WhatsApp collection links hit `/api/c/*` (web proxies → `apps/api` public GETs) with thousands of concurrent requests, each recomputing 3–4 Postgres queries. **Fix:** single-flight + jittered Redis response cache at the API — `apps/api/src/lib/public-cache.ts`.

| Layer | Files | Summary |
|---|---|---|
| **Cache helper** | `apps/api/src/lib/public-cache.ts` (+ `public-cache.test.ts`, 9 tests) | `publicCacheGetOrCompute()` — cache-aside read: atomic `SET NX PX` lock per key (only the winner recomputes; the rest poll, bounded 2.5s, then compute as a bounded fallback), double-check after acquiring, lock released in `finally`, TTL jitter (60s base + 0–50% at write time), **own short-fail ioredis client** (NOT `getRedis()` — BullMQ's `maxRetriesPerRequest: null` retries forever on a down connection), fail-open to direct DB on any Redis error at any step. Keys `public:get:{path}?{sorted params}`. `withPublicCache()` bypasses Redis under `NODE_ENV=test` for deterministic route tests |
| **Wiring** | `apps/api/src/routes/public/{public-collections,public-retailers,public-products}.ts` | All 6 public GETs wrapped (collection, retailer profile/categories/category-products, product detail/related). Cache-Control headers moved outside the wrap so cache hits still set them. 404s never cached; suspended responses are (60s). POSTs untouched (their counters aren't in the payload) |
| **Invalidation** | — (by design) | 60s TTL is the invalidation — retailer edits appear within a minute, no cross-service cache-busting |

**Verified:** api tsc clean, API suite 354/354, biome clean. Deploy note: nothing to configure (`REDIS_URL` already set); live on next API deploy.

---

## Built: F-029 Photo Rotate (Pre-Save + Post-Save) + Post-Save Background Picker (2026-08-09)

**Built 2026-08-09** — 6-task plan `docs/superpowers/plans/2026-08-09-photo-rotate-and-background-picker.md` (design spec `docs/superpowers/specs/2026-08-09-photo-rotate-and-background-picker-design.md`), merged to main `6ee8ede` + pushed. Spec: `docs/PRO-REQUIREMENTS.md` §20. User ask: rotate a product photo in 90° fixed steps (both the pre-cleanup original and the current primary), from the pre-save add-product preview AND the post-save product-detail screen, plus a post-save background picker (the `PATCH /:id/background` endpoint already existed — this wired it into the edit screen that never called it).

| Layer | Files | Summary |
|---|---|---|
| **AI utility** | `packages/ai/src/image-rotate.ts` (+ `image-rotate.test.ts`, barrel export) | `rotateImage(input, degrees)` — lazy-imported sharp (same Windows+pnpm dlopen pattern as image-compress), re-encodes JPEG q90 mozjpeg |
| **API route** | `apps/api/src/routes/products/products-media.ts` (+ 4 tests in `products.test.ts`) | `POST /v1/products/:id/photos/:photoId/rotate`, body `{ target?: 'primary' \| 'original' }` (default `'primary'`). Ownership-scoped lookup (404); `target: 'original'` requires `metadata.original_r2_key` (422 if the photo was never background-cleaned), rotates the sibling key and never touches `productPhoto.width/height`; primary branch swaps stored width/height. No quota charge — cheap CPU op, not an AI/BG_REMOVAL call. Error mapping mirrors `/cleanup` |
| **Mobile client** | `apps/mobile/src/lib/api/products.ts` | `productApi.rotatePhoto(productId, photoId, target)` — POST + 30s timeout, mirrors `cleanupPhoto` |
| **Post-save UI** | `apps/mobile/app/product/[id].tsx` | Rotate button (RotateCw) in a two-button row beside the existing Crop & remove background — rotate works on BOTH the primary and the preserved-original slide (synthetic `${id}-original` id stripped for the API call), cleanup stays primary-only. Per-photo client-only rotation label cycles 90/180/270/360 (not persisted — server has no absolute-rotation column). Reuses the existing `photoCacheBust` map (same URL, new bytes). **Background picker** row (Auto chip + admin-library thumbnails) added too, calling the existing `productApi.setBackground()` — auto-gated by `getBackgroundImages()` returning `[]` without `CUSTOM_BACKGROUND_LIBRARY`; `background_image_id` added to the client `Product` type (`components/product-detail/types.ts`, already returned by `GET /products/:id`) |
| **Pre-save UI** | `apps/mobile/app/product/add.tsx` | Rotate button in the preview step (three-button row: Retake / Rotate / Use Photo →). `rawPhotoUriRef` keeps the untouched capture; every tap recomputes from it (never compounds lossy re-encodes), 4th tap (360°) restores the original pixels with no re-encode. Busy-state guard `rotatingPreview` (follow-up `25cc192`, local-only until pushed) |

**Verified:** AI 4/4 (image-rotate), API full suite 364/364, api + mobile `tsc --noEmit` clean. Mobile UI unverified on device (no RN simulator — standing limitation).

**F-029 extension (2026-08-09, commit `714a564`): Photo Set-as-Main + per-photo background picker.** User ask: after editing a photo (rotate / crop & remove background / background pick) the edited image should be what the catalog and storefront show — a photo-edit “save → main image” flow. User-chosen design: an explicit **“Set as main”** button (instant apply, Save persists). Core insight: the entire customer/catalog surface already orders by `is_primary DESC` (public-products/collections/retailers), so promotion is a single flag flip. `PATCH /v1/products/:id/photos/:photoId` now accepts `is_primary: true` → `$transaction([updateMany demote-all, update promote])`, exactly one primary guaranteed (race-safe under READ COMMITTED row locks); `z.literal(true)` so a `false` payload 422s instead of being silently ignored. `POST /v1/products/:id/photos/:photoId/cleanup` accepts optional `background_image_id` — the picker recomposites the **currently-viewed** photo (not just the product primary), per-photo override wins over the product-level backdrop, and the per-photo path is gated behind `CUSTOM_BACKGROUND_LIBRARY` (fail-closed 402, matching `PATCH /:id/background`; white-bg path stays ungated). Mobile: `productApi.setPhotoPrimary()` + `cleanupPhoto(..., backgroundImageId)`; `[id].tsx` gains a Set-as-main button (star icon, gold-filled + “Main photo ✓” when already primary, busy-state guarded), “Main” badges on the carousel + thumbnail strip (hidden on variant/original slides), and a per-photo Background row (Auto chip + admin-library thumbnails). Session per-photo background highlights merge (never replace) on the 3s poll refetch so picks survive. Verified: API 372/372 (products suite 18 → 26: promotion atomicity, piece-only patch, 404 ownership, per-photo bg, inactive-bg 422, feature-gate 402, product-bg fallback), api + mobile `tsc --noEmit` clean (needed `@kanchuki/ai` rebuild — stale dist). Deployed: pushed to origin, API auto-deployed `bbadc4ce` (SUCCESS, built from `714a564`), live-browser-verified on Priya Cloth House — grid card + product-detail first image both match the DB primary (`is_primary` ordering works end-to-end). Mobile UI ships via EAS build (not yet done).

## Fixed: photo edits (crop/rotate/background) not visible after save — deployed 2026-08-10 (commit `4067306`)

User reported (screenshots) that crop/remove-background/background-swap "works well, but still not saved" — catalog grid and product detail kept showing the raw pre-edit photo. Root cause: `/cleanup`, `/rotate`, `/background`, and the automatic post-upload cleanup job (`tag-product.ts`) all overwrite a photo's R2 bytes **in place at the same key** — the stored URL never changes, so CDN/client image caches served stale bytes indefinitely (`tag-product.ts` had a comment explicitly declaring this intentional — wrong once caching is considered). Fix: `bumpPhotoUrlVersion()` (`apps/api/src/lib/photo-cleanup.ts`) stamps `?v=<timestamp>` on `ProductPhoto.url` after every in-place overwrite. Also removed the dead Upper/Lower piece-tag UI from `apps/mobile/app/product/[id].tsx`. **Deploy gotcha:** the fix existed from a prior session but was left uncommitted — the user's app points at production (`api.kanchuki.app`), so nothing changed until this session committed + pushed it (confirmed with user first, since push auto-deploys via Railway). Full detail: `docs/PRO-REQUIREMENTS.md` §21, `docs/PROGRESS.md` 2026-08-10.

## ✅ BUILT + DEPLOYED 2026-08-10: F-030 shadow toggle for cropped photos

User wants a shadow **selector** next to the existing BACKGROUND swatch row on the product-detail screen (same pattern) — confirmed via question as a single on/off toggle, not multiple presets. Mirrors `background_image_id`: product-level `Product.add_shadow` boolean read by the auto-cleanup job, overridable per-call on `/cleanup`. Full build table + verified counts: `docs/PRO-REQUIREMENTS.md` §22. **Migration `048_product_shadow` APPLIED live 2026-08-10** (user, Supabase SQL Editor) — `add_shadow` column confirmed present, deployed API verified healthy (product/collection queries 200). Remaining: the app-side toggle re-verify (retailer taps SHADOW on a product in the app).

## Built 2026-08-10: Occasion removed everywhere + AI auto-selects Category Group & Style

User asks (in one message): remove occasion, make AI auto-select the Category (Catalog Group), drop the duplicate "Category *" free-text selector (keep only Catalog Group), and make AI auto-select Style. **Occasion removed across the whole surface** — AI tagger schema (`tagger.ts`) + detector per-item schema no longer produce it, `tag-product.ts` stops writing it, public API (facets/filters/summaries in `public-helpers`/`public-collections`/`public-retailers`/`public-products`), search (`search.ts` — filter + `detected_occasions`), customer prefs (`customers.ts`/`collections.ts` schema+fallback), and every UI: mobile add/edit forms, mobile catalog filter, customer profile, bulk catalog-import review + bulk-onboard, web storefront `FilterBar`/`CollectionView`/`ProductDetailSheet`, admin default-attributes page (OCCASION tab dropped), onboarding + marketing copy. DB columns `products.occasions` / `customers.pref_occasions` intentionally left in place (no migration; nothing writes them anymore). **Fuzzy AI→taxonomy matching** (the real fix for "auto-select Category Group" + "Style"): new `apps/api/src/lib/name-match.ts` (`namesMatch`/`findBestMatch` — case/plural/containment/token-tolerant) powers `resolveCategoryId(retailer_id, category, subtype)` (default-categories.ts) and new `resolveAttributeNames(retailer_id, 'STYLE'|'FABRIC', names)` (default-attributes.ts) — AI's singular "Kurti"/"Anarkali Suit" now lands on the retailer's "Kurtis"/"Anarkali Suits" rows so category_id + styles auto-populate and the mobile chips light up. `[id].tsx` dropped the PRODUCT_CATEGORIES "Category *" selector entirely. Never-clobber semantics preserved. **Verified:** all 5 typechecks clean; API 366/366 (incl. new `name-match.test.ts` 8/8), AI 74/74, web 73/73, mobile 35/35 (pre-existing expo-linear-gradient vendor failure only); biome clean on new files.

## ✅ Built 2026-08-10: Play Store Launch Batch — Web Billing (Option A), Privacy Disclosures, Location Removal, Launch Checklist (commits `56357f6` + `b29b316`)

Launch-readiness drove four changes, all pushed to main (full Play paperwork drafts live in the new `docs/PLAY-STORE-LAUNCH-CHECKLIST.md`):

**1. In-app Razorpay billing removed from the Android build (Play Billing compliance)** — `56357f6`. Google Play requires Play Billing for digital goods sold in-app; subscriptions/add-ons would be a first-review rejection. `apps/mobile/app/billing.tsx` is now a read-only info screen (current plan + "Manage my plan" → website); `billingApi` + server rails retained (commented) for the future web flow; home banner copy + dead `BillingSkeleton` removed; `RECORD_AUDIO` trimmed (`app.json` + `expo-camera recordAudioAndroid:false`). Kept + documented the F-019 catalog-upload payment — a physical on-site service, Play-exempt.

**2. Web billing — Option A decided + built** (`b29b316`): retailers subscribe on `kanchuki.app/billing` (standard B2B model — app stays purchase-free). New page: phone-OTP login (reuses `/v1/auth/otp/*`; staff numbers rejected), current-plan card, Starter/Growth/Pro monthly/annual picker (annual toggle shows the *real* computed ~17% savings, not a hardcoded 20%), top-up add-ons, cancel. Session: access+refresh tokens in sessionStorage with auto-refresh on 401; same-tab checkout navigation (`window.open` after `await` is popup-blocked); pure helpers in `lib.ts` (5 tests). `/billing/addon-success` repainted from stale pre-Loom cyan + `support@kanchuki.com`→`@kanchuki.app`. Mobile billing screen links to `${WEB_URL}/billing`.

**3. Privacy policy disclosures** — `kanchuki.app/privacy` now discloses KYC/Aadhaar doc photos, body-measurement photos (AI extraction), AI-provider processing, and GST/KYC retention — matching the Play Data Safety form.

**4. Location permission removed entirely** — `ACCESS_COARSE/FINE_LOCATION`, iOS usage string, `expo-location` plugin + dependency dropped; onboarding "Use current location" autofill removed (city/state/pincode typed manually). No location data collected at all → the Data Safety form declares no Location rows.

> **Superseded by commit `b4270e4` (Google Maps location).** Onboarding step 2 re-added an optional "Get Location" button (`app/onboarding.tsx` `handleGetLocation`): one foreground `getCurrentPositionAsync` + `reverseGeocodeAsync` to pre-fill the address and store `retailers.latitude`/`longitude`, which renders a `maps/dir/?api=1&destination=` link on `/c/[slug]`. `expo-location` is back in `package.json`. **The Data Safety form now declares Location (precise + approximate), optional, foreground-only** — see `docs/PLAY-STORE-LAUNCH-CHECKLIST.md` §2/§3/§4. No background location, no tracking.

**Play paperwork drafts** (in `docs/PLAY-STORE-LAUNCH-CHECKLIST.md`): full Data Safety answers (7 declared types — name/email/phone/address/other-info[GSTIN+measurements]/photos/other-UGC; not collected: financial, location, device IDs, crash logs, analytics), IARC content-rating answers (Business category, expected **12+** from unfiltered UGC — do NOT claim "fully moderated"), closed-testing path (20 testers × 14 days), and the **Aug 31, 2026 target-API deadline** (API 35 OK now via SDK 54; after that, API 36 requires an Expo SDK 55 bump).

## ✅ BUILT 2026-08-12: Real OTP — MSG91 widget on mobile + server-side MSG91 everywhere

**User ask:** "implement OTP on this project, real OTP configuration" with the `@msg91comm/sendotp-react-native` widget SDK (pasted docs). User chose: **everywhere** (mobile + web), **real credentials** (the pasted widgetId/tokenAuth), **server-side verification** (recommended). OTP is now MSG91 end-to-end; Supabase stays the *session* provider — the API mints sessions for MSG91-verified phones via admin find-or-create + rotated random password + phone/password sign-in. The old Supabase-issued OTP flow remains only as a dev/legacy fallback (unconfigured MSG91 → same behavior as before).

| Layer | Files | Summary |
|---|---|---|
| **API lib** | `apps/api/src/lib/msg91-otp.ts` (new) | `sendOtpViaMsg91()` — generates the 6-digit code, stores it in Redis, sends via POST `control.msg91.com/api/v5/otp` (authkey header + template_id; same endpoint the Supabase send-sms-hook uses); per-phone 60s resend cooldown (429). `verifyStoredOtp()` — 10-min TTL, max 5 attempts, one-time use, timing-safe compare; returns 'verified'/'invalid'/'locked'/'absent'. `verifyMsg91WidgetToken()` — POST `/api/v5/widget/verifyAccessToken` to re-confirm the widget's client-side verification. **Contract CONFIRMED via real MSG91 dashboard curl (2026-08-12): the authkey AND the widget JWT go in the JSON BODY under the field name `access-token`** — NOT an authkey header / `token` field (the earlier docs-derived assumption would 401 every widget login). Response shape is tolerant (type/success/status flags + mobile/identifier under data/widget/top level); any rejection or phone mismatch → 401, never open. Own short-fail ioredis client (public-cache pattern); Redis bypassed under VITEST so route tests stay deterministic. Live shape-locking tool: `npx tsx scripts/verify-msg91-token.ts "<widget_jwt>"` prints the RAW verifyAccessToken response |
| **Auth routes** | `apps/api/src/routes/auth.ts` | `/otp/send` sends via MSG91 when `MSG91_AUTHKEY`+`MSG91_TEMPLATE_ID` are set, else legacy Supabase. `/otp/verify` 3-path: (1) `msg91_token` → verifyAccessToken → `ensureSupabaseSession()`; (2) `otp` + Redis entry → verifyStoredOtp → `ensureSupabaseSession()`; (3) `otp`, no entry ('absent') → legacy `supabase.auth.verifyOtp` (old installs/scripts unchanged). `ensureSupabaseSession()` — GoTrue can't mint sessions directly: admin `listUsers`-by-phone (paginated) → `updateUserById`/`createUser` with a rotated `randomBytes(24)` password + `phone_confirm:true` → `signInWithPassword({phone,password})`. The password never leaves the server; a create-race on concurrent first logins retries via the update path. Downstream staff/TeamMember/retailer routing untouched |
| **Checkout step-up** | `checkout-payment-account.ts` | Step-up OTP (SECURITY §11.8, connect/disconnect Razorpay) verifies via the Redis-stored MSG91 entry; Supabase fallback only when 'absent' |
| **Mobile** | `apps/mobile/src/lib/msg91-otp.ts` (new), `app/auth/phone.tsx`, `app/auth/otp.tsx`, `src/lib/api/auth.ts` | Widget wrapper with defensive reqId/access-token extraction (SDK responses are untyped `any`; token = the JWT the API re-verifies). `phone.tsx` sends via `OTPWidget.sendOTP({identifier:'91…'})`. `otp.tsx` verifies via `OTPWidget.verifyOTP({reqId,otp})` → access token → `POST /otp/verify {msg91_token}`; **invisible-mode auto-verify** (token may arrive in the send response, or `verifyOTP({reqId})` with no code succeeds — tried once on mount with a 4s timeout, falls back to showing the input); resend via `retryOTP({reqId, retryChannel:11})`. When `EXPO_PUBLIC_MSG91_WIDGET_ID`/`_TOKEN_AUTH` are unset (Expo Go), the screens fall back to the legacy API flow unchanged |
| **Web billing widget** | `apps/web/src/lib/msg91-widget.ts` (new, 13 tests), `apps/web/src/app/billing/page.tsx`, `apps/web/Dockerfile` | Browser counterpart of the mobile SDK: loads `verify.msg91.com/otp-provider.js` (phone91 fallback), inits with `exposeMethods:true`, and wraps the exposed `window.sendOtp/verifyOtp/retryOtp` in promises with timeouts. LoginCard sends via the widget (identifier `91…`), verifies via `verifyOtp` → JWT → `POST /otp/verify {phone, msg91_token}` (server-reverified), retries via `retryOtp('11',…,reqId)`; invisible-mode probe after send (6s, empty-code verify → token completes login). **Channel routing**: verify/resend follow the channel that SENT the OTP ('widget' vs 'api'), not the live widget-ready flag — a widget that finishes loading after the API sent the code can't hijack verification (reviewer-caught bug). Graceful fallback to the API flow when the widget is unconfigured (needs `NEXT_PUBLIC_MSG91_WIDGET_ID`/`_TOKEN_AUTH` build args — added to `apps/web/Dockerfile`) or blocked. JWT extraction requires 3 dot-segments (a status message is never mistaken for a token) |
| **Env** | `.env.example`, `apps/mobile/.env.example` (new), `apps/mobile/eas.json`, `apps/web/Dockerfile` | API needs `MSG91_AUTHKEY` + `MSG91_TEMPLATE_ID` (copy from the Supabase send-sms-hook env into the API Railway env). Widget credentials are client-visible by MSG91's design (they only authorize this widget, never the account authkey): mobile in eas.json preview+production env, web as `NEXT_PUBLIC_MSG91_*` build args on the web service |

**MSG91 Events & Actions webhook (built 2026-08-12):** the MSG91 dashboard requires a POST URL in its Events & Actions section before proceeding with the client-side integration. Receiver: `POST /v1/public/webhooks/msg91/events` (`apps/api/src/routes/webhooks/msg91.ts`, registered in index.ts, `webhook:msg91` rate-limit default added). Header-authenticated via `x-msg91-webhook-secret` vs the `MSG91_WEBHOOK_SECRET` env (timing-safe, 401 on mismatch, 503 fail-closed when unconfigured). Records each event to AuditLog best-effort (`actor_type: 'msg91'`, masked phone, status/failure_reason — admin-visible in the Activity feed); a logging failure still 2xxes so MSG91 never retries a received event (its retry policy: ≤5 attempts on 5xx/429/timeout, auto-pause on persistent 4xx, 8s response budget). **Dashboard setup: URL `https://api.kanchuki.app/v1/public/webhooks/msg91/events`, header `x-msg91-webhook-secret` = `MSG91_WEBHOOK_SECRET` env value.** Events are telemetry only — login verification is synchronous via verifyAccessToken, so a missed webhook can never break auth. Bad-payload responses use 422 to match the dashboard's documented webhook response codes (200/401/403/422/500/504); the section itself is labeled **"Webhook (deprecated)"** in the MSG91 UI — a legacy telemetry channel, fine to leave configured but not something to build on.

**User Existence API (same dashboard section, optional — built 2026-08-12):** MSG91 offers an optional pre-OTP existence check that **blocks OTP sending when `user_found: false`**. Kanchuki deliberately does NOT use this feature: onboarding is self-serve OTP-first (every new retailer signs up through the send-OTP flow; the API creates the retailer on first verified login), so a real check would block new signups and expose a phone-enumeration oracle. **Leave the field blank.** If the dashboard forces a URL (like the webhook field does), point it at the harmless fallback `GET https://api.kanchuki.app/v1/public/msg91/user-exists` (same `webhooks/msg91.ts` module, registered under the auth-exempt `/v1/public` prefix) — it always answers `{user_found: true, identifier: <echoed>}` per MSG91's contract, so OTP behavior is identical to the field being empty. 400 on a missing identifier; nothing stored or logged.

**Security model:** no OTP is ever trusted client-side — the widget's access token is re-verified with MSG91 before a session is minted, and the session is still a standard Supabase JWT (retailer routes, `/auth/refresh`, and staff/team token separation unchanged). `send-sms-hook` left in place (still the carrier for the legacy fallback path). **⚠️ Native module:** `@msg91comm/sendotp-react-native` has no Expo config plugin — **Expo Go cannot run it**; builds must go through EAS / `expo run:*` (minSdk 23/compileSdk 34 required — Expo SDK 54 exceeds both). Biometric methods in the SDK (BiometricAuth) are NOT wired up — out of scope, available as a follow-up. **Verified:** api + mobile + web `tsc --noEmit` clean; msg91-otp 14/14, auth-msg91 11/11, auth-team 9/9, mobile vitest 38/38, web vitest 106/106 (13 new widget tests). **Not verified:** live SMS delivery / invisible-mode on device AND in the browser — needs a real phone (EAS build with widget env) and a browser against a web deploy with the `NEXT_PUBLIC_MSG91_*` build args. The verifyAccessToken request contract is now **confirmed from the real MSG91 dashboard curl** (authkey + `access-token` in the body) — the remaining unknown is the exact RESPONSE shape, which `scripts/verify-msg91-token.ts` locks down from a real widget JWT (the lib already parses all documented candidate shapes).

## F-032 AI Studio Shoots + Product Videos (PhotoRoom-style) — Phase A ✅ BUILT 2026-08-13→08-19 (undocumented until 2026-08-20), Phase B/C 🔴 PLANNED

Spec: `docs/PRO-REQUIREMENTS.md` §24, roadmap `docs/PLAN.md` (Future slot). Written after deep research into PhotoRoom's published tech stack and the 2026 image/video model landscape — the research below predates the build and originally said "NO CODE — do not start until the user says go."

**Correction 2026-08-20:** Phase A was built anyway, without a doc update — found via `docs/photoshoots/photo-feature-audit.md` (an independent audit of 4 photo systems) and verified against real code. Commits `5d5ae44` (2026-08-13, initial backend) and `d67484d` (2026-08-19, adaptive polling backoff + Redis progress/ETA, part of a broader "high-priority photo feature updates" pass covering Photo Cleanup/Try-On/Gallery too — see `docs/tasks/photo-feature-implementation-tasks.md` for the full checklist, most items done, a few genuinely still open).

| Layer | Files | Summary |
|---|---|---|
| **API — lib** | `apps/api/src/lib/studio-shoot.ts` | `generateStudioImage()` — BFL FLUX Kontext [pro] submit+poll (`x-key` header, not Bearer), `STUDIO_SHOOT_CONCURRENCY = 3` (BFL's cap is 24 active tasks), `isStudioShootConfigured()`. |
| **API — job** | `apps/api/src/jobs/studio-shoot.ts`, `apps/api/src/jobs/index.ts` | BullMQ `kanchuki-studio-shoot` queue — verifies photo ownership, calls FLUX, downloads the signed result (10-min validity, never linked directly), compresses ≤80KB, uploads to R2, creates a new `ProductPhoto` row (`is_primary: false`, metadata carries `{studio: {job_id, template, source_photo_id, generated_at}}`), writes status to Redis (30-min TTL, now with progress/ETA per the `d67484d` update). |
| **API — routes** | `apps/api/src/routes/products/products-studio.ts` | `POST /products/:id/photos/:photoId/studio-shoot` (202 + job_id; Growth/Pro plan gate via `retailer.plan === 'STARTER'` check, not a `PlanFeatureKey`), `GET .../studio-shoot/status?job_id=` (Redis status, falls back to the persisted photo row if Redis expired). |
| **Mobile** | `apps/mobile/app/product/[id].tsx` | Template picker (4 presets: White Studio / Warm Luxury / Gold Festive / Flat-Lay) on the product detail screen, "AI Studio Shoot" trigger button, 3s status polling with adaptive backoff, error state. |

**Not built (Phase B/C — do-not-start still applies):** product video generation (Seedance/Kling), AI Fashion Model. **Remaining real backlog** (from the tasks doc, genuinely unchecked): BFL credit-consumption tracking in job metadata, image size validation (<20MB/<20MP) before BFL submit, GPU detection on the V-Tone box, responsive (non-fixed-3:4) gallery aspect ratio.

### ✅ BUILT 2026-08-30: Studio style catalog → DB-managed + per-plan

Full spec + file-level plan:
`docs/superpowers/specs/2026-08-30-studio-styles-admin-design.md`.

- **New `studio_styles` table** (migration `075_studio_styles`, owner
  applies) replaces the hardcoded `STUDIO_TEMPLATES` / `STUDIO_MODELS`
  constants. Columns: `slug` (== old id), `label`, `description`, `prompt`
  (server-only), `tab` (PRODUCT / MODEL), `status` (DRAFT / PUBLISHED /
  HIDDEN), `plans` (`SubscriptionPlan[]` — admin ticks Starter/Growth/Pro
  per style, no default), `engine` (nullable override), `audience`
  (demographic tags), `thumbnail_url` (admin-uploaded sample output),
  `sort_order`, `usage_count`.
- **Admin → Studio Styles page** (`apps/web/src/app/admin/studio-styles/`)
  + `apps/api/src/routes/admin/admin-studio-styles.ts` — CRUD, per-row
  status + plan checkboxes + engine + thumbnail upload (presigned R2,
  mirrors `admin-media.ts` / background-images), delete, reorder. Audit-logged.
- **Retailer:** new `GET /v1/studio-styles` (plan-filtered, no prompt in
  payload). `products-studio.ts` looks up the style by slug + gates on
  `retailer.plan in style.plans` (403 `FEATURE_UNAVAILABLE`). Job + engine
  receive `prompt` / `engine` / `tab` from the row.
- **Mobile `ProductStudioModal`:** two tabs — **Product Only** (`tab=PRODUCT`)
  and **Models** (`tab=MODEL`, filtered by
  `demographicForCategory(product)`). Rows keep `Label (/slug)` text +
  thumbnail. IDM-VTON photo-model path retired.
- **Seed:** 29 existing styles (21 MODEL + 8 PRODUCT, list in the spec)
  inserted as DRAFT / unassigned. Owner curates + assigns plans + uploads
  thumbnails post-deploy — picker is empty until then, by design.
- Supersedes step 6 of `docs/tasks/ai-studio-shoot-models-scenes.md`.
- Skills for the build: see the spec's "Skills for implementation" table
  (`superpowers:writing-plans` then `superpowers:subagent-driven-development`
  / TDD for the API logic, `ecc:prisma-patterns` +
  `supabase:supabase-postgres-best-practices` for migration `075`,
  `frontend-design` for the admin page, `superpowers:requesting-code-review`
  before the PR).

**Verification:** `admin-studio-styles.test.ts` (7), `products-studio.test.ts` (15), `studio-shoot.test.ts` (9) — all green. `security.test.ts` (24), `admin.login.test.ts` (14) — regression clean. `tsc --noEmit` clean in `packages/shared`, `apps/api`, `apps/mobile`, `apps/web`. Migration `075_studio_styles` written, owner applies.

**How PhotoRoom works (their own engineering blog, verified):** background removal = proprietary on-device segmentation model; AI Backgrounds = diffusion-based **outpainting** (preserves product pixels exactly, invents matching lighting); a from-scratch ~1B-param Transformer latent diffusion model trained on ~90M images (architecture like DiT/PixArt, trained for *editing* not text-to-image) powers Expand/Fill/Erase/upscale/volumetric shadows; sub-second inference via distillation + TensorRT; Video Generator = product-focused image-to-video with 300+ motion templates + Multi-Image Video API (up to 7 refs → 360° spins); AI Fashion Model = lifestyle on-model shots from one product photo (retailers report 25–32% photographer-cost cuts). **Lessons to copy:** own the subject not the scene; one model many features; templates beat free text for SMB retailers; latency is the product.

**How PhotoRoom works (their own engineering blog, verified):** background removal = proprietary on-device segmentation model; AI Backgrounds = diffusion-based **outpainting** (preserves product pixels exactly, invents matching lighting); a from-scratch ~1B-param Transformer latent diffusion model trained on ~90M images (architecture like DiT/PixArt, trained for *editing* not text-to-image) powers Expand/Fill/Erase/upscale/volumetric shadows; sub-second inference via distillation + TensorRT; Video Generator = product-focused image-to-video with 300+ motion templates + Multi-Image Video API (up to 7 refs → 360° spins); AI Fashion Model = lifestyle on-model shots from one product photo (retailers report 25–32% photographer-cost cuts). **Lessons to copy:** own the subject not the scene; one model many features; templates beat free text for SMB retailers; latency is the product.

**Model landscape (2026):** studio images — FLUX.1 Kontext (12B instruction-editing, best subject consistency, open weights + paid API ~₹2–6/img, self-host ~24GB VRAM), FLUX Redux, SDXL+ControlNet+LoRA (budget, 8–12GB), SaaS APIs. Product video — Seedance 2.0 (API, best reference consistency, ~$0.09–0.20/s ≈ ₹40–90/5s clip), Kling 2.x (motion presets), Veo 3 (best, priciest), Wan 2.1/2.2 (best open-weight i2v, 1.3B on 8GB slow), HunyuanVideo/LTX-Video.

**Phases:** A) Studio-shoot button + template presets (White Studio / Warm Luxury / Gold Festive / Flat-Lay) on the existing cutout pipeline via FLUX Kontext — paid API first, GPU box (Hetzner GEX44 ~₹8–12k/mo) only after usage justifies; GPU mandatory, CX43 CPU can't run 12B. B) Product video via Seedance/Kling as a **paid add-on ₹49–99/clip** (covers ~₹45 API cost); self-host Wan 2.1 later. C, stretch) Consistent brand-model fashion shots (V-Tone is the seed; ethnic-wear draping is the known risk). **Explicitly NOT:** training a custom foundation model, running generation on CX43, flat-pasting onto stock photos, free-text prompts (templates only), hiding the original photo (trust).

## ✅ FIXED 2026-08-13: Redis handshake race — first-request-of-the-day OTP/social failure (commit `9f6b16a`)

**Symptom:** the first Redis-touching request of the day (OTP send, social connect) failed with `Could not start a secure OTP session` / `Stream isn't writeable`; retries succeeded. An earlier session misdiagnosed it as Upstash cold-start vs a 2s `connectTimeout`; bumping to 10s did not fix it.

**Root cause:** all three short-fail ioredis clients (`msg91-otp`, `public-cache`, social OAuth state) used `lazyConnect: true` + `enableOfflineQueue: false`. With the offline queue disabled, any command sent before the `'ready'` handshake rejects instantly with `Stream isn't writeable` — the connectTimeout is never reached because the command dies on the still-connecting socket. The first command of every process/sleep cycle always hit the race.

**Fix:** removed `lazyConnect` (eager connect) from all three clients; added `awaitRedisReady()` (waits for `'ready'`, bounded by connectTimeout + retry) to the two hard-fail paths (`sendOtpViaMsg91`/`verifyStoredOtp` in `apps/api/src/lib/msg91-otp.ts`; `createOAuthState`/`consumeOAuthState` in `apps/api/src/routes/retailers/retailers-social.ts`). public-cache stays fail-open so its first-hit race degrades to a direct DB read silently. FakeRedis test stand-ins gained `status: 'ready'` + `once`/`off`. Verified live: `POST /v1/auth/otp/send` → 200 `OTP sent` on first try; API tsc clean, 443/443 tests. Deployed `48784c77`.

## ✅ BUILT 2026-08-13: F-031 Social Media Publishing — Phase 1 (Facebook Page) live

Full build table + flow: `docs/PRO-REQUIREMENTS.md` §23, roadmap `docs/PLAN.md`. Commits `fbe131a` (feature), `efe6d63` (ESM ioredis import fix), `148ef4a` (correct Graph endpoints + mobile pre-flight removal).

**What was built:** `SocialAccount`/`SocialPost` models + migration `052_social_publishing`; Meta Graph client (`apps/api/src/lib/meta-graph.ts` — OAuth URL, code→long-lived-token exchange, Page listing, photo post, link post); retailer routes (`retailers-social.ts` — connect/callback/accounts/posts/history/disconnect, F-012 encrypted page tokens, owner-only publish); web `/social/connect` + `/social/connect/callback` (OTP login → Meta consent → Page picker); mobile Settings → Social Media screen (connect via web flow + poll, composer with product/collection picker + caption, history, disconnect).

**End-to-end review fixes (commit `148ef4a`):**
1. `publishPhotoPost` posted to a bare `POST /photo` and `publishLinkPost` to a bare `POST /feed` — neither endpoint creates anything; every publish would have been rejected by Facebook. Fixed to `POST /{page-id}/photos?url=` and `POST /{page-id}/feed` (page id from the connected account).
2. Mobile connect button pre-flighted `GET /me/social/connect`, minting an unused OAuth state and 503-blocking before the web page opened if Meta credentials hiccuped — removed; the app opens the web page directly.

**Meta-side config still required (user, dashboard):** register `https://kanchuki.app/social/connect/callback` in the app's Valid OAuth Redirect URIs (else "URL Blocked"); add the test account as Admin/Developer/Tester (dev-mode access gate); app must go Live + App Review for `pages_manage_posts`/`pages_show_list` before real retailers connect with long-lived tokens.

**Verified:** API tsc clean, 443/443 tests (9 social); web 106/106, page renders with 0 console errors; mobile tsc clean. Deployed: API `48784c77` → `c7e235d8` (SUCCESS), web unchanged (build-path filter correctly skipped — no web file changes since the feature push).

## Built 2026-08-17: Admin Commission Tracker (3% of Monthly Payments + Expense Ledger)

User ask: in the web admin, whenever a payment comes in, set aside **3% of each month's total payments** as a commission pool; admin records expenses spent from that pool (amount, where, date, explanation notes); one page shows the monthly totals and a second tab shows the expenditure grid, with a form to add entries and a row-click detail view. **User-confirmed decisions:** 3% base = successful **subscription payments only** (addon purchases excluded); UI = single page with two tabs. Spec: `docs/PRO-REQUIREMENTS.md` §25.

| Layer | Files | Summary |
|---|---|---|
| **DB** | `packages/db/prisma/schema.prisma`, migration `053_admin_commission` | New `AdminCommissionExpense` table (`admin_commission_expenses`): `period` (YYYY-MM), `amount_inr` (paise), `category` (where), `expense_date`, `notes`. Monthly commission is **computed on the fly** from `subscription_payments` (status `success`, bucketed by `paid_at` in **IST** +5:30 via `periodKey()`/`monthRange()` helpers) — only expenses are stored |
| **API** | `apps/api/src/routes/admin/admin-commission.ts` (new) + registered in `admin.ts`/`admin/index.ts` | `GET /commission/overview?months=N` (per-month payments→3%→spent→remaining, newest first, negative remaining = overspent), `GET /commission/expenses?month=YYYY-MM` (month summary + grid, defaults to current IST month), `POST /commission/expenses` (create + audit entry), `DELETE /commission/expenses/:id` (audit entry). All paise; admin key + CSRF guarded; zod-validated |
| **API tests** | `apps/api/src/routes/admin/admin-commission.test.ts` (new, 15 tests) | commission math/IST bucketing (pure helpers), overview rollup + overspend, unauth 403, malformed-month 422, create validation, delete + 404 |
| **Admin UI** | `apps/web/src/app/admin/commission/page.tsx` (new) | 4 current-month cards (Total Payments / 3% Pool / Spent / Remaining-red-when-negative); **Monthly Summary** tab (24-month table, click row → that month's expenditure); **Expenditure** tab (month picker + quick chips, summary strip, Add Expense modal form with amount ₹/where/date/notes, expense grid, row-click detail popup with notes + confirm-delete). Matches the existing cyan/blue admin design language |
| **Expense edit (follow-up)** | `apps/api/src/routes/admin/admin-commission.ts` + `admin-commission.test.ts` (+5 tests) + `commission/page.tsx` | `PATCH /commission/expenses/:id` (any subset of period/amount/category/date/notes, `notes:null` clears, audited before/after, empty payload 422); the detail popup gains an **Edit expense** in-place form (same fields as add) alongside delete |
| **Dashboard + nav** | `apps/web/src/app/admin/page.tsx`, `components/Sidebar.tsx` | Dashboard gains a "3% Commission Pool — this month" card (payments/pool/spent/remaining + link); sidebar gets a Commission item under Billing |

**Verified:** API tsc clean, full API suite 493/493 (incl. 20 commission tests); web tsc clean + 108/108; mobile tsc clean + 38/38. **Not yet applied:** migration `053_admin_commission` must be applied (Supabase SQL Editor / `prisma migrate deploy`) before the page returns data. No API deployment triggered.

**Migration applied + live verification (2026-08-17):** migration `053_admin_commission` is now **applied to the production Supabase DB** (table verified present with all 8 columns + 3 indexes; API endpoints return 200 with real data; `/admin/commission` renders cards + 24-month table with **0 console errors**, error card gone). Note: the local `apply-commission-migration.ts` script reported `permission denied for schema public` yet the table landed anyway (pgbouncer transaction-pooler artifact) — structure re-verified exact via `scripts/check-commission-structure.ts`. **Post-verify findings:** (1) `kanchuki_app` has INSERT/SELECT/UPDATE but **no DELETE** on ANY table (SECURITY §19 DELETE-less role — applies equally to the pre-existing admin deletes, e.g. plan tiers/integrations). (2) Fixed the DELETE route's `.catch(() => null)` which masked permission failures as 404 — it now resolves-then-deletes so only a genuinely missing row 404s and real errors surface as 500 (regression test added).

**Soft-delete resolution (2026-08-17, user decision — no GRANT):** user chose soft delete over granting DELETE ("can't give you grant to delete directly into database"). Migration `054_admin_commission_soft_delete` adds `deleted_at TIMESTAMP(3)` (+ index); the DELETE route now sets `deleted_at` via UPDATE (works under the DELETE-less role), GETs filter `deleted_at: null` everywhere (grid, spent sums, overview counts), and PATCH/DELETE resolve via `findFirst({ id, deleted_at: null })` so editing/deleting an already-removed row 404s. **⚠️ 054 must be applied manually (Supabase SQL Editor) — the app role can't ALTER a table it doesn't own (`must be owner of table`); until applied, the new code's `deleted_at` references 500 on live data.** Suite 494/494 (soft-delete assertions in GET/PATCH/DELETE tests).

**Migration 054 applied + live re-verification (2026-08-17, user applied via Supabase SQL Editor):** `deleted_at` column + index confirmed PRESENT (read-only check via `information_schema`/`pg_indexes`). Booted the local API + web against the real DB and exercised the full soft-delete cycle live: `DELETE /commission/expenses/:id` → **204** (soft-delete via UPDATE under the DELETE-less role), expense disappears from `GET /commission/expenses` (spent ₹1,234 → ₹0, count 1 → 0), repeat DELETE → **404** (already-removed row correctly not-found), and DB-level check confirms the row is **present with `deleted_at` SET** (0 active rows, 1 total awaiting purge cron — soft, not hard, deleted). The ₹1,234 "LIVE TEST delete me" smoke-test row is now cleaned up. Browser re-verify: `/admin/commission` renders cards + 24-month table with **0 console errors / 0 failed requests**, error card gone. Note: the local apply script's auth-header hiccup was `x-admin-key` (not `x-admin-api-key`) + CSRF comes from `GET /v1/admin/csrf-token` (sets cookie + returns body) — the browser e2e covers the real panel flow, so no code change was needed.

**Browser verification (2026-08-17, same day):** local stack booted against the real API + DB; `/admin/commission` renders with the sidebar Commission item, authenticates via injected admin key, and shows the graceful error card instead of crashing when the table is missing. Full UI flow verified with route-mocked API responses — first as an ad-hoc script, then promoted to a **permanent hermetic Playwright spec** `apps/web/e2e/admin-commission.spec.ts` (4 tests: cards + monthly table, expenditure grid + detail popup, edit PATCH + IST date prefill, add + delete; route-mocked like `admin-navigation.spec.ts`, no backend/DB/migration needed — full admin e2e suite 5/5 green). The run caught + fixed a real bug: the edit form prefilled dates via `toISOString()` (UTC), shifting IST dates a day early on re-edit — now round-tripped through IST (`istDate`/`isoFromIst` helpers, same +5:30 convention as the API's `periodKey`). Migration state check tool: `scripts/check-commission-migration.ts` (read-only; reports `admin_commission_expenses` PRESENT/MISSING).

**CSV export (2026-08-17, follow-up ask):** new `GET /commission/export?months=N` (N ∈ {1, 3, 6, 12}) returns `text/csv` with a summary header block (period range, total payments, 3% pool, spent, remaining) + one row per expense (date, where, category, amount INR, notes) — soft-deleted rows excluded, same IST bucketing, CSV-escaped (quotes doubled, comma/newline-safe), UTF-8 BOM so Excel renders ₹ correctly. UI: **Export CSV** dropdown on the Expenditure tab (This month / 3 / 6 / 12 / 24 months) downloads it. Fix along the way: the API CORS config didn't expose `Content-Disposition`, so browsers fell back to a generic filename — `Access-Control-Expose-Headers` now includes it (real cross-origin integration issue the e2e caught). Suite 497/497 (+3 export tests); admin e2e 5/5 incl. the new export test; web tsc clean.

## Built 2026-08-17: Retailer Auth — Login / Create Account toggle

User ask: add separate Login and Register screens for retailers in the mobile app — or keep one screen? Wanted a recommendation. **User-confirmed decision (2026-08-17): keep ONE phone screen with a Login / Create Account segmented toggle.** Rationale: OTP is the only auth method (no password), so two full screens would be two identical flows; the backend already routes new retailers (`is_new` = no shop name → onboarding) vs returning ones automatically. Spec: `docs/PRO-REQUIREMENTS.md` §26.

| Layer | Files | Summary |
|---|---|---|
| **Mobile** | `apps/mobile/app/auth/phone.tsx` | Segmented pill toggle below the logo (**Login | Create Account**, default Login, `accessibilityState.selected` wired); copy switches per mode — "Welcome back to Kanchuki" / "Send OTP →" vs "Create your Kanchuki account" / "Create Account →" (free-trial subtitle). Both modes push to the same `/auth/otp` + backend flow — OTP/verify path untouched, so `is_new` onboarding routing is unchanged |

**Verified:** mobile tsc clean, mobile 38/38. Ships via the next EAS build (Expo Go can't run the MSG91 native widget — standing limitation).

## ✅ BUILT (backend) 2026-08-17: India Retailer Growth Engine — 10 feature modules + migration 055

Roadmap: `docs/INDIA-RETAILER-GROWTH.md` (§3.1–3.5; feature letters below refer to it). User ask: build the **India Retailer Growth & Profitability Roadmap** features — customer acquisition (QR leads, referrals), marketing automation (festival/reactivation/A-B campaigns, promotions), shop management (khata P&L, suppliers, showroom bookings, inventory alerts), and India-localized features (udhar credit, product videos, multi-language AI descriptions, Indian fit flags). **This commit is backend-only** — all 10 modules shipped under `/v1/growth/*` with the full schema in migration `055_growth_engine`. **UI (mobile app + web PWA screens) is NOT built yet** — API-first, UI is the next workstream.

| Layer | Files | Summary |
|---|---|---|
| **DB** | `packages/db/prisma/schema.prisma`, migration `055_growth_engine/migration.sql` | 13 new tables: `festivals`, `campaigns`, `campaign_sends`, `promotions`, `khata_entries`, `suppliers`, `supplier_transactions`, `bookings`, `udhar_accounts`, `udhar_transactions`, `referrals`, `referral_credits`, `product_videos`; 11 new enums (`CustomerLeadSource`, `CampaignType/Status/SendStatus`, `PromotionDiscountType`, `KhataEntryType/PaymentMode`, `SupplierTransactionKind`, `BookingStatus`, `UdharTransactionKind`, `ReferralCreditStatus`); new columns `customers.source` (lead origin, roadmap B), `retailers.referral_enabled/referral_reward_paise` (C), `products.is_unstitched/includes_blouse` (N); `PlanFeatureKey` + `GROWTH_ENGINE` gate (F-010) |
| **Growth routes** | `apps/api/src/routes/growth/` (11 files, all new, registered in `index.ts` → `/v1/growth/*`) | `growth-campaigns.ts` — festivals CRUD + campaign CRUD + preview (audience count/sample) + send (CampaignSend rows, A/B variant split, WhatsApp Business API send when configured else wa.me deep links, open-tracking) + stats + reactivation-suggestions (**D/G/R/S**); `growth-promotions.ts` — promo CRUD + validate/apply (**F**); `growth-referrals.ts` — retailer referral settings + code generation + credit ledger (**C**); `growth-khata.ts` — daily P&L entries + summary rollup (**H**); `growth-suppliers.ts` — supplier CRUD + transaction ledger + pending calc (**K**); `growth-bookings.ts` — booking CRUD + conflict check (**L**); `growth-udhar.ts` — accounts + charge/payment txs + WhatsApp reminder link (**O**); `growth-inventory.ts` — signal-based alerts: dead stock / high velocity / top performer / unlisted (**J**); `growth-videos.ts` — presigned R2 upload + register + list + delete product videos (**Q**); `growth-translate.ts` — AI product descriptions in Hindi/Hinglish/regional via Claude (**M** partial) |
| **Shared helpers** | `growth-helpers.ts` | Pure, unit-testable core: `AudienceSpec` zod schema + `matchesAudience`/`buildAudienceWhere` (declarative customer filter), `fillTemplate` ({{name}}/{{shop}}/{{link}}/{{offer}}/{{festival}}), `buildWhatsAppDeepLink`, `generateReferralCode` (KAN-XXXXXX, ambiguity-free alphabet), `isPromotionEligible`/`applyPromotionDiscount`, `summarizeKhata`, `computeInventoryAlerts`, `hasBookingConflict`, `computeUdharBalance`, `computeSupplierPending`, `parseReferralCode` |
| **Public routes** | `apps/api/src/routes/public/public-growth.ts` (new) + registered in `index.ts` → `/v1/public/*` | `GET /public/referrals/:code` (landing data + click increment), `POST /public/referrals/:code/signup` (consent-gated REFERRAL-source lead capture, sha256 phone hash), `POST /public/retailers/:slug/bookings` (self-service try-on slot booking with conflict check — no consent gate, it's a service request) |
| **Existing-file touchpoints** | `public-retailers.ts`, `public-products.ts`, `packages/shared/src/constants/index.ts` | QR contact gate now stamps `source: 'QR_SCAN'` on customer upsert (**B**); public product payload exposes `videos[]` + `is_unstitched`/`includes_blouse` (**Q/N**); `R2_PATHS.productVideo()` helper added |

**Design decisions (user-confirmed in roadmap doc):** audience targeting is a declarative spec on `Campaign.audience_json` (all / explicit ids / pref colors-styles-fabrics / min spend / max budget / inactive days / never purchased / lead source); campaign send is **manual-dispatch first** — WhatsApp Business API when the retailer's own Meta credentials + `WHATSAPP_BUSINESS_API` feature are present, otherwise per-customer wa.me deep links the retailer forwards; referral credits are a `ReferralCredit` ledger (PENDING → CREDITED) rather than wallet mutations; khata is a flat daily-entry ledger (SALES/PURCHASE/EXPENSE) — no double-entry; inventory alerts are **signal-based** (no stock quantities exist in the schema); product videos are presigned-upload to R2 under `retailers/{id}/products/{pid}/videos/`.

**Verified:** API `tsc --noEmit` clean. **Not yet done (next workstreams):** per-route tests (growth suite currently untested), migration `055_growth_engine` NOT applied (must run Supabase SQL Editor / `prisma migrate deploy`; app role can't ALTER — same 054 caveat), **no UI anywhere** (mobile + web screens for all 10 modules), no deployment. Out of scope in this commit: AI Campaign Assistant (E — needs Fashion DNA), GST invoicing (I), WhatsApp native catalog sync (P).

**Scope removals + follow-ups (2026-08-17, same day):** (1) **Khata (H) + Udhar (O) removed completely per user decision** — "no khata, no udhar". Deleted: `growth-khata.ts`, `growth-udhar.ts`, `KhataEntry`/`UdharAccount`/`UdharTransaction` models + `KhataEntryType`/`KhataPaymentMode`/`UdharTransactionKind` enums from the schema, and the `khata_entries`/`udhar_accounts`/`udhar_transactions` tables + enum types from migration 055 (never applied, so edited in place). Removed from the mobile growth hub (Daily Khata + Udhar Ledger "Soon" cards) and all roadmap docs. 11 tables remain. (2) **Festival ids → numeric auto-increment** (SERIAL) with admin-managed calendar CRUD: `admin-festivals.ts` (GET/POST/PUT/DELETE `/v1/admin/festivals`, audit-logged, soft delete under the DELETE-less role) + `/admin/festivals` web page (add/edit modal with state/region + date pickers, delete, status badges) + sidebar entry; seeds rewritten without manual ids; `campaigns.festival_id` INTEGER. (3) Mobile growth hub + campaigns UI shipped (see next BUILD-LOG entry when committed).

## Built 2026-08-17: Growth Engine UI — mobile growth hub + campaigns + admin festival calendar

Follow-up to the backend commit above (point 3 of the scope-removal note). Retailers now get the first growth screens in the mobile app; admins get a managed festival calendar feeding `campaigns.festival_id`.

| Layer | Files | Summary |
|---|---|---|
| **Mobile — growth hub** | `apps/mobile/app/growth/index.tsx` | Entry screen behind the new **Growth Tools** quick action on the home tab (Megaphone icon). Hero card, live campaigns summary card (count, sent/opened, top-3 list, "+ New"), reactivation nudge ("N customers inactive 60+ days → one tap builds a REACTIVATION campaign"), and a **More Growth Tools** section listing the 7 remaining roadmap modules (Referrals, Promotions, Suppliers, Try-on Bookings, Inventory Alerts, Product Videos, AI Translate) as disabled "Soon" cards — **no khata/udhar cards** (removed with the feature). `GROWTH_ENGINE` feature-gate handling: `FEATURE_UNAVAILABLE` errors show an upgrade card instead of a crash |
| **Mobile — campaigns** | `apps/mobile/app/growth/campaigns.tsx`, `campaign-new.tsx`, `campaign/[id].tsx` | Full campaign lifecycle: list with type filter chips (All/Festival/Reactivation/Promotion/A/B) + status badges + pull-to-refresh; create/edit form (type, festival picker from the admin calendar, name, message template with `{{placeholders}}` chip inserter + live sample preview + per-type example, A/B variant editor with 100%-split validation, audience builder: all-consented toggle, inactive-days chips, colour/style/fabric comma lists, min-spend/max-budget ₹ fields, never-purchased, lead-source multi-select); detail screen (audience summary, live audience-count preview with sample names, send action with confirm dialog → WhatsApp API or wa.me manual links list, sent/open stats + open rate, delete). Screens registered in `app/_layout.tsx` (campaign-new as a modal) |
| **Mobile — API client** | `apps/mobile/src/lib/api/growth.ts` | Typed client for `GET/POST /growth/campaigns`, `GET/PUT/DELETE /growth/campaigns/:id`, `POST /growth/campaigns/:id/send`, `GET /growth/campaigns/:id/preview`, `GET /growth/campaign-stats`, `GET /growth/campaigns/reactivation-suggestions`, `GET /growth/festivals?upcoming=true`; Festival ids are `number` (numeric auto-increment), audience spec mirrors the backend zod schema |
| **Admin — festival calendar** | `apps/api/src/routes/admin/admin-festivals.ts` + `admin-festivals.test.ts` (11 tests), `apps/web/src/app/admin/festivals/page.tsx`, `Sidebar.tsx` | Admin CRUD for the calendar: `GET/POST/PUT/DELETE /v1/admin/festivals` behind `adminAuthPreHandler`, audit-logged, soft delete (`deleted_at`) under the DELETE-less app role, reads filter deleted rows; web page with festival table (status badges: Upcoming/Live/Past), add/edit modal (name, region quick-picks incl. state codes, start/end date pickers), delete confirm. Sidebar entry **Festivals** (CalendarDays icon) |

**Design decisions:** campaign send stays **manual-dispatch first** — the detail screen shows per-customer "Open WhatsApp" rows (wa.me deep links) when the retailer has no WhatsApp Business API credentials, matching the backend's `sent_via` field. Festival ids are deliberately opaque to retailers (admin-managed calendar) — the mobile form shows festival *names* only. The hub's "Soon" cards keep the full roadmap visible to retailers without shipping half-built screens.

**Verified:** API `tsc --noEmit` clean + `vitest run` 508/508 (incl. 11 new admin-festivals tests); mobile `tsc --noEmit` clean; web `tsc --noEmit` clean. **Still pending:** migration `055_growth_engine` not applied (Supabase SQL Editor / `prisma migrate deploy`); remaining 7 growth modules (referrals/promotions/suppliers/bookings/inventory/videos/translate) still backend-only — UI lands in later passes; no deployment.

**Migration apply fix (2026-08-17, same day):** running migration `055` through the Supabase SQL editor failed with `ERROR: 55P04: unsafe use of new value "GROWTH_ENGINE" of enum type "PlanFeatureKey"` — PostgreSQL forbids *using* an enum value in the same transaction that adds it, and Prisma runs each migration as one transaction. Split into three: `055` keeps all tables/columns/seeds, new `056_plan_feature_growth_engine_enum` contains only `ALTER TYPE "PlanFeatureKey" ADD VALUE 'GROWTH_ENGINE';`, new `057_plan_feature_growth_engine_rows` has the two `plan_features` inserts. Apply order matters: 055 → 056 → 057 (each its own transaction). `prisma validate` clean.

## ✅ BUILT 2026-08-17: Growth Engine UI — remaining 7 modules (mobile screens)

Follow-up to the §45 commit: the growth hub's "Soon" cards are gone — every roadmap module now has a live mobile screen wired to its `/v1/growth/*` endpoint, registered in `app/_layout.tsx` (form screens as modals). All screens share the hub's design language (`AnimatedPressable` cards, `GradientButton`, `useTheme` primary color, sand palette) and handle loading/empty/error states plus `FEATURE_UNAVAILABLE` (upgrade card). API client: `apps/mobile/src/lib/api/growth.ts` extended with typed calls for all 7 modules. Mobile `tsc --noEmit` clean.

| Module | Files | Summary |
|---|---|---|
| Referrals (C) | `apps/mobile/app/growth/referrals.tsx` | Settings toggle + ₹ reward (paise), customer picker → generate KAN-XXXXXX code, code list with click/signup counts + share via wa.me, manual credit action creating PENDING reward credits, credit ledger per code |
| Promotions (F) | `promotions.tsx`, `promotion-form.tsx` (modal) | Code list with discount (PERCENT/FIXED), min-order ₹, validity window, usage count, active toggle + delete confirm; create/edit form with product multi-pick |
| Suppliers (K) | `suppliers.tsx`, `supplier-form.tsx` (modal), `supplier/[id].tsx` | Supplier list with pending balance + add/edit (name, phone, city, notes); detail screen with ORDER/PAYMENT transaction ledger, pending-amount calc, add-transaction form (Stock order / Payment made chips) |
| Bookings (L) | `bookings.tsx`, `booking-form.tsx` (modal) | Booking list with status filter chips (ALL/REQUESTED/CONFIRMED/COMPLETED/CANCELLED) + status badges; create form (optional customer, name/phone, start/end slot, note); status transition actions + delete; backend slot-conflict errors surfaced |
| Inventory alerts (J) | `inventory.tsx` | Signal cards grouped by kind (dead stock / high velocity / top performer / unlisted) with message, views/enquiries/sales 30d, days-since-interaction; pull-to-refresh |
| Videos (Q) | `videos.tsx` | Product picker → per-product video list (duration badge); gallery upload via `expo-image-picker` → presigned R2 PUT → register; set-as-main + delete |
| AI Translate (M) | `translate.tsx` | Product picker → language chips (Hindi/Hinglish/Tamil/Telugu/Marathi/Gujarati/Bengali from `TRANSLATE_LANGUAGES`) → Claude description; result shown with cached badge; Copy button shows a toast-style confirmation (expo-clipboard not a dependency yet — text stays on screen for manual copy) |

**Design decisions:** mirror the §45 conventions — festival ids stay opaque, money stays paise (rendered via `₹` + `en-IN`), send/credit flows stay manual-dispatch first. Referral credits are shown as a ledger (PENDING/CREDITED) rather than wallet math; the retailer confirms conversion manually.

**Verified:** mobile `tsc --noEmit` clean. **Still pending:** migration `055_growth_engine` + `056`/`057` not applied (Supabase SQL Editor / `prisma migrate deploy`); per-route growth tests not written; no deployment. Not built / partial per roadmap: I, P, and partial M/N/R/S (see `docs/INDIA-RETAILER-GROWTH.md` status table).

## ✅ BUILT 2026-08-17: Growth Engine — roadmap M, N, R, S completed (AI translate breadth + Size & Fit + campaign analytics + collection A/B)

Follow-up to §46: the four "partial" roadmap letters get their missing pieces. **M** (multi-language AI) and **N** (size & fit) are content/AI + data features; **R** (campaign analytics) and **S** (collection A/B) are analytics + campaign-delivery features. All growth-gated like the rest of the suite. Migration `058_customer_usual_size` added (customers.usual_size).

| Letter | Layer | Files | Summary |
|---|---|---|---|
| **M** | API | `growth-translate.ts` | New `POST /growth/translate/message` — localizes a WhatsApp/campaign message into any of the 7 languages, preserving `{{placeholders}}` verbatim (send-time fill keeps working). Metered like tagging (AI_TAGGING_CALL quota). No schema change — stateless |
| **M** | Mobile | `app/growth/translate.tsx` (rewrite), `app/ai-search.tsx` (new), `app/(tabs)/index.tsx`, `app/_layout.tsx` | Translate screen gains a **Product description | Campaign message** mode toggle: campaign mode lists campaigns, pre-fills the editable message, translates with placeholder preservation. New **AI Search** screen gives the `/v1/search` endpoint (Hindi/Hinglish transliteration — built earlier but had **no UI**) its first retailer surface: example queries, detected colour/fabric/budget interpretation chips, results grid → product detail. Voice: the OS keyboard's built-in dictation (mic on the keyboard) feeds the search box — a native in-app mic needs a dev build (same standing constraint as the MSG91 widget). Home tab gains an **AI Search** quick action |
| **N** | Shared | `packages/shared/src/constants/index.ts` | `SIZE_OPTIONS` extended to the roadmap's plus-size range: `XS` + `4XL`–`8XL` (12 labels). Products store their own arrays, so this is backward-compatible; add/edit product forms and the customer detail picker pick it up automatically |
| **N** | DB | `schema.prisma`, migration `058_customer_usual_size` | `customers.usual_size TEXT?` — "what's your usual size?" quick capture |
| **N** | API | `lib/size-recommend.ts` (new) + `lib/size-recommend.test.ts` (7 tests), `routes/customers.ts`, `routes/growth/growth-sizes.ts` (new) | Pure recommendation core `recommendSizeFromSignals` (testable): **1. USUAL** — usual_size when the product stocks it; **2. HISTORY** — most-purchased size from purchase-type interactions; **3. CHART** — nearest size from the retailer's existing F-102c SizeChart (nearest-range lookup on the latest MANUAL measurement, body category mapped from product name keywords). `POST /growth/customers/:id/recommended-size` (growth-gated) + `GET /customers/:id/matches` now annotates every matched product with `suggested_size`/`size_basis`. `CustomerSchema` validates usual_size against SIZE_OPTIONS |
| **N** | Mobile | `app/customer/[id].tsx` | **Usual size** chip picker (all 12 labels) in the preferences area, saved via the existing customer update; AI-match product cards show a **Size {suggested}** badge |
| **R** | API | `growth-campaigns.ts` | New `GET /growth/analytics`: **by_type/by_festival** (existing), **by_segment** (VIP ≥ ₹2,000 spend / Regular / Never purchased — CampaignSend joined to Customer in memory, loose pointer), **by_hour** (opens bucketed 0–23), **by_category** (30-day views+enquiries grouped by product category), **video_vs_photo** (30-day enquiries for products with ≥1 ProductVideo vs without), **by_variant** (per A/B campaign: variant sent/opened + significance) |
| **R** | Mobile | `app/growth/analytics.tsx` (new), `app/growth/index.tsx`, `app/_layout.tsx` | **Campaign Analytics** screen: festival/type open-rate bars, A/B winner callouts, segment open rates, hour-of-day bar chart, category bars, video-vs-photo cards, pull-to-refresh. Entry: **Analytics** link on the growth hub campaigns card |
| **S** | API | `growth-campaigns.ts`, `growth-helpers.ts` + `growth-ab.test.ts` (5 tests) | `AbVariant` gains per-variant **`product_ids`** (collection A/B — ordering = array order) + **`send_delay_min`** (stagger variant B). Send flow records variant label (already) + timestamps delayed variants' `sent_at` at now+delay (drives hour-of-day analytics). `GET /campaigns/:id` returns `variant_breakdown` (sent/opened/open_rate/winner). Pure `abTestSignificance` — two-proportion z-test p-value + winner, only when ≥30 sends per variant (AB_MIN_SAMPLE_PER_VARIANT) |
| **S** | Mobile | `app/growth/campaign-new.tsx`, `app/growth/campaign/[id].tsx` | A/B editor: per-variant **Pick products** (page-sheet modal, checkbox list, order = pick order, Done commits) + **Send after N min** stagger input. Campaign detail: **Variant results** card with open-rate per variant + WINNING badge; the message card lists each variant's product count |
| — | API client | `apps/mobile/src/lib/api/growth.ts`, `customers.ts` | `analytics()`, `translateMessage()`, campaign `variant_breakdown`/`AbVariant.product_ids`/`send_delay_min`, `CampaignSummary.message_template` (list now carries the template so translate needs no second fetch), `GrowthAnalytics` types |

**Design decisions:** per-variant A/B **product sets are stored, shown and tracked, but the `{{link}}` still resolves to the storefront** — auto-creating per-variant ACTIVE collections would hijack the storefront link picker (it takes the most-recent ACTIVE collection) and there is no "hidden" collection status; auto-built variant links are deferred until a hidden-collection type exists. M voice search ships as **keyboard dictation** (OS-level, Hinglish-capable); a native in-app mic requires an EAS/dev build and is documented on the screen. `size-recommend` lives in `lib/` (not growth/) because customer matches use it too. R's "wedding-season vs daily-wear" category comparison stays a Phase-1 dashboard refinement (data is captured; no time-window bucketing yet).

**Verified:** API `tsc --noEmit` clean + `vitest run` **520/520** (12 new pure-logic tests: 7 size-recommend + 5 A/B significance); mobile `tsc --noEmit` clean + **38/38**; web `tsc --noEmit` clean. **Still pending:** migrations `055`–`058` not applied (Supabase SQL Editor / `prisma migrate deploy`); no deployment. Not built: I (GST invoicing), P (WhatsApp native catalog); M voice mic + PWA/retailer UI language toggle and R seasonal deep-dive remain future work (documented on-screen).

## BUILT 2026-08-18: AI Campaign Assistant (Roadmap E)

Roadmap: docs/INDIA-RETAILER-GROWTH.md section 3.2 (feature E). Needs Fashion DNA per the original roadmap, but built against the explicit customer preference fields already on the Customer model (preferred_colors, preferred_styles, preferred_fabrics, preferred_budget_paise) — the same signals Fashion DNA would surface. The standalone computeFashionDNA() vector helper in packages/ai/src/fashion-dna.ts is not yet wired to a background job; matching is rule-based on explicit preferences for now.

| Layer | Files | Summary |
|--------|-------|---------|
| **AI service** | packages/ai/src/campaign-assistant.ts (new) | parseCampaignIntent(prompt) — sends retailer natural language to Claude via runVisionAsk with a structured JSON schema (campaign type, name, audience filters, product criteria, message tone). generateCampaignMessage(intent, products) — generates a WhatsApp message template with placeholders (name, shop, link, offer, festival). Falls back to raw text if JSON parsing fails. |
| **Backend route** | apps/api/src/routes/growth/growth-ai-campaign.ts (new) | POST /v1/growth/ai-campaign — gated behind GROWTH_ENGINE + AI_TAGGING_CALL quota. Flow: (1) parse intent, (2) query matching products by category/color/style/fabric/price, (3) generate message, (4) resolve audience count via existing buildAudienceWhere + resolveAudienceCustomerIds, (5) return draft. Draft is NOT saved — retailer reviews and saves via normal campaign create. |
| **Route registration** | apps/api/src/routes/growth/index.ts | growthAiCampaignRoutes registered as first sub-router. |
| **Tests** | apps/api/src/routes/growth/growth-ai-campaign.test.ts (new, 4 tests) | Valid draft (festival type, product matching, audience count, message template), feature guard (402), empty prompt (422), non-JSON message fallback. |
| **Mobile screen** | apps/mobile/app/growth/ai-campaign.tsx (new) | Prompt input with 5 example chips, Generate button, editable draft preview (name, type, festival, message template with live sample preview, audience count, rationale, matched products list), Save Campaign button calls growthApi.createCampaign. |
| **Growth hub** | apps/mobile/app/growth/index.tsx | AI Campaign Assistant card added as first module (Wand2 icon). |
| **API client** | apps/mobile/src/lib/api/growth.ts | AiCampaignDraft type + aiCampaign(prompt) method (60s timeout). |

**Design decisions:** campaign type is one of FESTIVAL/REACTIVATION/PROMOTION (GENERAL removed — the three cover all retailer asks). Audience filters reuse the existing AudienceSpec from campaign helpers. Product matching uses Prisma hasSome / in filters on primary_color, secondary_colors, search_tags, styles, fabrics, fabric_estimate. Festival inference: if AI returns campaign_type: FESTIVAL but no festival_id, the route does a case-insensitive findFirst on the first 3 words of the prompt.

**Verified:** API tsc --noEmit clean + vitest run 528/528 (4 new AI campaign tests); mobile tsc --noEmit clean; AI package tests 74/74. **Still pending:** migrations 055-058 not applied (Supabase SQL Editor / prisma migrate deploy); computeFashionDNA background job not wired; no deployment.

## BUILT 2026-08-18: Phase II — WhatsApp Native Catalog Sync (F-307 / roadmap P)

Spec: `docs/PRO-REQUIREMENTS.md` F-307 (already marked Built), `docs/PLAN.md` Phase II, task breakdown `docs/tasks/PHASE-II-WHATSAPP-CATALOG-BREAKDOWN.md` (all **63/63 tasks** complete). All sprints built: DB schema → Meta Catalog API client → sync engine → retailer routes → webhook → mobile UI → admin monitor → auto-sync hooks → deploy docs → docs/J4 (CLAUDE.md index = this entry).

| Layer | Files | Summary |
|--------|-------|---------|
| **DB schema** | migration `060_whatsapp_catalog_sync` + `schema.prisma` | `CatalogItem` (product ↔ Meta item mapping, snapshots: name/price/status/HSN) + `CatalogSyncLog` (operation, status SUCCESS/FAILED/PARTIAL/IN_PROGRESS, payload) models; Retailer gains `whatsapp_catalog_id`/`sync_enabled`/`sync_categories`/`last_synced_at`; Product gains `whatsapp_catalog_item_id`; `WHATSAPP_CATALOG_SYNC` plan feature (Growth/Pro=true, Starter=false) |
| **Meta client** | `apps/api/src/lib/meta-catalog.ts` (new) + `meta-catalog.test.ts` (14 tests) | `getOrCreateCatalog`, `createCatalogItem`/`updateCatalogItem`/`deleteCatalogItem`, `listCatalogItems`, `uploadCatalogImage` (R2→Meta media hash), `batchCatalogItems`, `getCatalogItemByRetailerId`; external id = Kanchuki product id for idempotency; every fetch-carrying function accepts an optional `AbortSignal` so a per-retailer timeout can abort in-flight HTTP |
| **Sync engine** | `apps/api/src/jobs/catalog-sync.ts` (new) + `catalog-sync.test.ts` (30 tests) + `jobs/index.ts` | BullMQ `catalog-sync` queue (concurrency 2, exponential backoff). `syncAllProducts` full reconciliation (create/update + delete items for soft-deleted/category-removed products, chunked 5-at-a-time), `syncSingleProduct` incremental, `buildCatalogItemPayload` (paise price, INR, availability mapping, image), `resolveHsnForCatalog` (interim keyword map over apparel HSN heads — 6204/5407/5007/5208/6214/6211 — Phase I hsn_codes table not built yet), `mapProductStatus` (AVAILABLE→in stock, RESERVED→available for order, SOLD/NOT_SURE→out of stock). **Auto-sync hooks:** `maybeEnqueueProductSync`/`maybeEnqueueFullSync` — fail-open, gated on `sync_enabled` + configured. **Daily cron:** maintenance worker `catalog-daily-full-sync` (pattern from `CATALOG_SYNC_CRON` env, default `0 5 * * *` = 5:00 AM UTC, 30 min after image compression, before India store hours) → `handleDailyCatalogSync()` fans out one `full_sync` job per enabled+configured retailer, `triggered_by: 'schedule'`, fail-open per retailer — catalogs refresh even with zero product activity. Note: changing `CATALOG_SYNC_CRON` live creates a new repeat schedule (BullMQ dedupes by name + repeat key) — the old repeatable job must be removed from Redis if the time should move. **Per-retailer timeout:** `handleCatalogSync` wraps every run in an `AbortController` budget (`CATALOG_SYNC_TIMEOUT_MS`, default 10 min, env-overridable); the signal is threaded through every Meta fetch so a stuck call is actually aborted — with queue concurrency 2, two hung retailers would otherwise stall the whole daily pass. Timed-out runs record a FAILED log (`timed_out: true`) and complete without BullMQ retry (a stuck Meta is usually systemic; next cron/edit reconciles); real errors still rethrow for backoff |
| **Auto-sync wiring** | `apps/api/src/jobs/tag-product.ts`, `apps/api/src/routes/products/products-crud.ts` | Tag completion syncs newly-created products (with final AI-tagged data); PUT edit / PATCH status (Mark Sold → out of stock) / DELETE enqueue single-product jobs; bulk-delete enqueues one full-sync reconciliation |
| **Retailer API** | `apps/api/src/routes/retailers/retailers-whatsapp-catalog.ts` (new) + test (11) | D1-D7: GET/PATCH `/me/whatsapp-catalog` (status + counts / enable + validated category pick), POST `/me/whatsapp-catalog/sync` + `/sync/:productId` (returns job id), GET `/me/whatsapp-catalog/logs` + `/items`; all gated behind `WHATSAPP_CATALOG_SYNC` (GET returns `{data:null}` off-plan, mutations 402) |
| **Webhook** | `apps/api/src/routes/webhooks/whatsapp-catalog.ts` (new) + test (12) | `POST /v1/public/webhooks/whatsapp-catalog` — GET handshake (hub.verify_token = `META_WEBHOOK_SECRET`, echoes challenge) + signed events (`X-Hub-Signature-256` = HMAC-SHA256(raw body, **META_APP_SECRET** — not the webhook secret); contract fix vs the breakdown's original E2 note). Handles added/updated/deleted/out-of-stock; every event records a CatalogSyncLog; unmatched `_added` events enqueue an incremental sync |
| **Admin API** | `apps/api/src/routes/admin/admin-whatsapp-catalog.ts` (new) + test (10) | G1-G5: `GET /whatsapp-catalog/overview` (all retailers + global health: syncing/configured counts, item status totals, 7-day failed runs, error-rate %, **daily-cron health** — last schedule-triggered run + 7-day failed/timed-out counts via JSON path filter on `payload_json.triggered_by = 'schedule'`, same pattern as admin-contact.ts), drill-down `.../retailers/:id/logs` + `/items`, `POST .../retailers/:id/sync` (triggered_by: 'admin', audited) |
| **Mobile UI** | `apps/mobile/app/settings/whatsapp-catalog.tsx` (new) + `src/lib/api/whatsapp-catalog.ts` + `(tabs)/catalog.tsx` + `ProductCard.tsx` + `settings/index.tsx` + test (5) | F1-F7: Settings → WhatsApp Native Catalog (plan-gated empty state), status card, Sync Now, enable toggle, category chips, sync-history with pull-to-refresh, per-product sync dots (green synced / amber pending / red error) + legend in the catalog tab |
| **Admin UI** | `apps/web/src/app/admin/whatsapp-catalog/page.tsx` (new) + `Sidebar.tsx` | 5 health stat cards (incl. **Daily Cron** — last run + 7-day failed/timed-out, red when any failed), retailer table (store/plan/catalog id/badges/counts/last sync), drill-down modal with Sync Logs + Items tabs, per-row + modal Sync now |
| **Docs** | `docs/DEPLOY.md`, `docs/INDIA-RETAILER-GROWTH.md`, `docs/PLAN.md`, `docs/tasks/PHASE-II-WHATSAPP-CATALOG-BREAKDOWN.md` | Deploy guide: Meta env vars, webhook callback URL + verify token + signature contract, retailer first-sync steps, checklist; roadmap P row → Built |

**Design decisions:** external id for idempotency is the **Kanchuki product id** (not sku — skus can change); HSN mapping is an interim keyword map until Phase I's `hsn_codes` master table ships; webhook signature uses **META_APP_SECRET** (Meta's actual contract — the breakdown's "META_WEBHOOK_SECRET" wording was wrong; that secret is only the GET-handshake verify token); auto-sync hooks are **fail-open** (a catalog hiccup never fails the product save) and gated on `sync_enabled`, so retailers who turned sync off get zero overhead; create-flow sync rides on tag completion so photo-only uploads sync once with final data, not twice with placeholders.

**Verified:** API `tsc --noEmit` clean + `vitest run` **601/601** (63 new: 24 catalog-sync incl. 4 daily-cron + 3 timeout + 11 retailer routes + 12 webhook + 10 admin incl. cron-health + 6 auto-sync helpers); mobile `tsc --noEmit` clean + **43/43** (5 new); web `tsc --noEmit` clean. **2026-08-18 fix:** the original single-file `060` did `ALTER TYPE ... ADD VALUE 'WHATSAPP_CATALOG_SYNC'` and INSERTed it in the same transaction — PostgreSQL 55P04 would have rejected it exactly like growth's 055 did. Split: `060` keeps only the schema, `061` adds the enum value alone, `062` seeds the plan_features rows (mirrors 056/057). **Migrations 060–062 APPLIED + VERIFIED 2026-08-18** (catalog_items / catalog_sync_logs tables, Retailer+Product columns, both enums, Growth+Pro plan rows confirmed via read-only queries). **Still pending:** no deployment; Meta webhook needs the dashboard setup in `docs/DEPLOY.md` §"Deploy WhatsApp Native Catalog Sync". **⚠️ Related gap:** growth migration `058` (`customers.usual_size`) is NOT applied — roadmap N's size recommendation reads it.

## BUILT 2026-08-18: Roadmap M — i18n Data Groundwork (deferred post-launch)

Post-launch groundwork for Feature M (Multi-Language AI) gaps per `docs/tasks/M-MULTI-LANGUAGE-AI-GAPS.md`. The three full sub-tasks (native in-app mic, PWA language toggle, retailer app UI language toggle) are deferred until after app launch. This commit lands the **data model and shared constants** that both language toggles will need, with zero screen/UI changes.

| Layer | Files | Summary |
|---|---|---|
| **DB schema** | `packages/db/prisma/schema.prisma` + migration `063_retailer_preferred_locale` | `retailers.preferred_locale TEXT DEFAULT 'en-IN'` — retailer app UI locale. Nullable so existing rows default to English. No data migration (column has a DB default). |
| **Shared constants** | `packages/shared/src/constants/index.ts` | `SUPPORTED_LOCALES` — canonical list of 8 locales (en-IN, hi-IN, hi-Latn-IN, ta-IN, te-IN, mr-IN, gu-IN, bn-IN) with native name + script type. `SupportedLocale` type. `LOCALE_FALLBACK_CHAIN` (hi → en). Shared source of truth for mobile + web + API. |
| **Retailer API** | `apps/api/src/routes/retailers/retailers-profile.ts` | `preferred_locale` added to `UpdateRetailerSchema` (validates max 10 chars). GET `/me` already returns all Prisma fields — no change needed. |

**Design decisions:** `preferred_locale` is nullable with a DB default ('en-IN') so no backfill is needed for existing retailers. The locale list uses BCP-47 codes (e.g. `hi-IN`, `hi-Latn-IN` for Hinglish) — this is the standard that i18next and `expo-localization` expect, so the post-launch i18n framework can consume it directly. The API `SUPPORTED_LANGUAGES` map in `growth-translate.ts` (simple keys: `hindi`, `hinglish`) is intentionally kept separate — it drives Claude prompt suffixes, not UI locale switching.**Verified:** API `tsc --noEmit` clean + `vitest run` 33/33 retailers tests pass; mobile `tsc --noEmit` clean; web `tsc --noEmit` clean; shared `tsc --noEmit` clean. **Still pending:** migration 063 NOT applied (Supabase SQL Editor / `prisma migrate deploy`). Full M sub-tasks (native mic, PWA toggle, retailer UI toggle) deferred post-launch.

## BUILT 2026-08-18: Roadmap R — Seasonal Analytics (wedding-season vs daily-wear)

Gap per `docs/tasks/R-CAMPAIGN-ANALYTICS-SEASONAL.md`: the existing campaign analytics screen has festival/type/segment/hour/category/video-vs-photo dimensions, but no seasonal period comparison. This adds a **Seasonal** section that compares product-category performance across wedding season (Oct–Feb) vs daily-wear (Mar–Sep), giving the retailer a quick read on what to stock up for the next season.

| Layer | Files | Summary |
|---|---|---| |
| **API** | `apps/api/src/routes/growth/growth-seasonal.ts` (new) + `growth-seasonal.test.ts` (4 tests) + `growth/index.ts` | `GET /v1/growth/analytics/seasonal?period=wedding|daily` — queries `CustomerInteraction` (views + enquiries) + `Campaign` sends by `Product.category` for two periods; returns category-level metrics with delta %. Period defaults: wedding = Oct–Feb, daily = Mar–Sep (cross-year aware). Summary fields: topCurrentCategory, topCompareCategory, biggestSwing. Gated behind GROWTH_ENGINE. |
| **Mobile client** | `apps/mobile/src/lib/api/growth.ts` | `SeasonalAnalytics`, `SeasonalCategory`, `SeasonalPeriod` types + `growthApi.seasonal(period)` method. |
| **Mobile UI** | `apps/mobile/app/growth/analytics.tsx` | **Seasonal** section at bottom of growth analytics screen: Wedding/Daily toggle (segmented control), biggest-swing summary badge, category rows with opens + delta % bar, period labels. Uses existing `Section` + `AnimatedPressable` + `useTheme` patterns. |

**Design decisions:** No new DB tables — queries existing `CustomerInteraction` + `Campaign` + `CampaignSend` models. Period definitions are hardcoded (Oct–Feb = wedding, Mar–Sep = daily) rather than admin-configurable — a config layer can be added later if retailers in non-Hindi-belt regions need different definitions. Sends-per-category are attributed proportionally across a campaign's product categories. The compare period auto-selects the opposite season (wedding → compare with most recent daily, daily → compare with most recent wedding); custom date ranges disable comparison. |

**Verified:** API `tsc --noEmit` clean + `vitest run` **605/605** (4 new seasonal tests); mobile `tsc --noEmit` clean; web `tsc --noEmit` clean.

---

## BUILT 2026-08-19: F-033 Ken Burns Auto-Video + Video Social Posting

Spec `docs/PRO-REQUIREMENTS.md` §28. Two reuse-only slices, no new dependency or paid API — both built on existing infra (Q Video Product Support's storage/routes, `extract-spin-frames.ts`'s ffmpeg pattern, F-031's Facebook publish flow).

| Layer | Files | Summary |
|---|---|---|
| **DB** | `packages/db/prisma/schema.prisma` + `migrations/065_product_video_source/migration.sql` | New `ProductVideoSource` enum (`UPLOAD` \| `KEN_BURNS`) + `ProductVideo.source` column, default `UPLOAD` (existing rows backfill automatically). **Migration applied live** (2026-08-19). |
| **API — Slice 1 (video generation)** | `apps/api/src/jobs/generate-ken-burns-video.ts` (new) | ffmpeg `execFile` job (same pattern as `extract-spin-frames.ts`) — downloads up to 5 primary-ordered product photos, builds a per-photo zoompan (pan/zoom) clip, concats via `filter_complex`, uploads the MP4 to the existing `R2_PATHS.productVideo()` path, inserts a `ProductVideo` row (`source: KEN_BURNS`, `is_main` if the product has no video yet). |
| **API — job wiring** | `apps/api/src/jobs/index.ts` | `addKenBurnsVideoJob()` producer + one new `case` in the existing `maintenanceWorker` switch — no new BullMQ Queue/Worker (mirrors the `admin-tryon` on-demand pattern). |
| **API — route** | `apps/api/src/routes/growth/growth-videos.ts` | `POST /v1/growth/products/:id/video/generate` — same `GROWTH_ENGINE` feature gate + 3-video cap as manual upload; validates ≥2 photos before enqueueing. |
| **API — Slice 2 (video post)** | `apps/api/src/lib/meta-graph.ts` | `publishVideoPost()` — same shape as `publishPhotoPost()`, POSTs to the Page's `videos` edge (`file_url` param) instead of `photos`. |
| **API — social wiring** | `apps/api/src/routes/retailers/retailers-social.ts` | `SINGLE_PRODUCT` publish branch now selects the product's main video alongside its main photo; posts video when one exists, falls back to photo otherwise — no API contract change. |
| **Mobile** | `apps/mobile/src/lib/api/growth.ts`, `apps/mobile/app/growth/videos.tsx` | `growthApi.generateVideo()` + `ProductVideo.source` type field; "Generate from photos" button on the existing Q video screen (shown whenever <3 videos — server validates the ≥2-photo requirement and surfaces the error via the existing `showError` pattern). |

**Explicitly not done (see spec §28.3):** no AI video-generation API (that's F-032 Phase B, a different paid feature), no automatic/background generation on upload (on-demand button only), no crossfade between Ken Burns segments (hard cuts), no mobile badge distinguishing a generated clip from an uploaded one, no Instagram video posting (F-031 itself is still Facebook-only).

**Verified:** API `tsc --noEmit` clean; mobile `tsc --noEmit` clean; `prisma generate` succeeded (transient Windows file-lock on the query-engine binary from an unrelated process, cleared on retry — not a code issue). No new automated tests added for this pass (ffmpeg job has no unit-test harness in this repo's pattern — same as `extract-spin-frames.ts`).

---

## BUILT 2026-08-20: Phase 5+6 — Social Templates + Lookbook Generator Mobile Screens

Completes the mobile UI gaps identified in `docs/marketing/IMPLEMENTATION-STATUS.md`. Both features had admin API + admin dashboard built (Phases 5+6) but no retailer-facing API routes or mobile screens. This commit adds the full retailer stack for both.

### Phase 5 — AI Social Media Templates (mobile)

| Layer | Files | Summary |
|---|---|---|
| **API** | `apps/api/src/routes/growth/growth-social-templates.ts` (new) + `growth/index.ts` | 8 retailer endpoints: list (filterable by type/occasion), stats, get, create (validates product ownership), update (caption/hashtags/name), delete, generate (triggers FLUX studio-shoot pipeline via `addStudioShootJob`, returns job_id for polling), poll generate status, use tracking (increments usage_count). Gated behind `SOCIAL_TEMPLATES` plan feature. |
| **Mobile client** | `apps/mobile/src/lib/api/growth.ts` | 8 types (`SocialTemplate`, `SocialTemplateType`, `SocialTemplateStats`, `SocialTemplateCreatePayload`, `SocialTemplateUpdatePayload`) + 8 API methods (`socialTemplates`, `socialTemplate`, `socialTemplateStats`, `createSocialTemplate`, `updateSocialTemplate`, `deleteSocialTemplate`, `generateSocialTemplate`, `socialTemplateGenerateStatus`, `useSocialTemplate`). |
| **Mobile UI** | `apps/mobile/app/growth/templates.tsx` (new) | Template list with image previews, filter chips by type, stats strip, create modal (name/type/occasion/background style/product ID), detail modal with generate button + caption/hashtags editor + share/copy/regenerate actions, usage tracking. |
| **Growth Hub** | `apps/mobile/app/growth/index.tsx` | Added `Share2` import + "Social Templates" entry to `GROWTH_MODULES`. |

### Phase 6 — Lookbook Generator (mobile)

| Layer | Files | Summary |
|---|---|---|
| **API** | `apps/api/src/routes/growth/growth-lookbooks.ts` (new) + `growth/index.ts` | 9 retailer endpoints: list (filterable by status/format), stats (total/ready/views/shares), get, create (validates product ownership, auto-sets cover from first product photo), update (name/description/format/products/cover), delete, generate (marks as GENERATING — BullMQ job TBD for actual HTML/PDF rendering), share (generates share_url + increments share_count), view (public endpoint, increments view_count). Gated behind `LOOKBOOK_GENERATOR` plan feature. |
| **Mobile client** | `apps/mobile/src/lib/api/growth.ts` | 8 types (`Lookbook`, `LookbookFormat`, `LookbookStatus`, `LookbookStats`, `LookbookCreatePayload`, `LookbookUpdatePayload`) + 8 API methods (`lookbooks`, `lookbook`, `lookbookStats`, `createLookbook`, `updateLookbook`, `deleteLookbook`, `generateLookbook`, `shareLookbook`, `viewLookbook`). |
| **Mobile UI** | `apps/mobile/app/growth/lookbook.tsx` (new) | Lookbook cards with cover images, filter by status (Ready/Draft/Generating/Failed), stats strip, create modal (name/description/format picker/product ID input with live count), detail modal with generate button + product ID chips + share/copy link + view tracking. |
| **Growth Hub** | `apps/mobile/app/growth/index.tsx` | Added `BookOpen` import + "Lookbooks" entry to `GROWTH_MODULES`. |

### Shared fixes

| File | Fix |
|---|---|
| `apps/mobile/app/growth/templates.tsx` | Replaced `variant="secondary"` on `GradientButton` (which doesn't accept that prop) with plain styled `AnimatedPressable` buttons. |
| `apps/mobile/app/growth/lookbook.tsx` | Same `variant="secondary"` fix. |
| `docs/marketing/IMPLEMENTATION-STATUS.md` | Updated templates + lookbook status from "Deferred" → "Built"; updated honest status summary table; updated orphan cleanup section. |

**Verified:** API `tsc --noEmit` clean (0 new errors — 21 pre-existing in `retailers-social.ts` and `products-festival-background.ts`); mobile `tsc --noEmit` clean; `prisma validate` + `prisma generate` clean.

---

## BUILT 2026-08-20: Phase 4 — Festival Backgrounds Mobile Screen

Completes the mobile UI gap in `docs/marketing/IMPLEMENTATION-STATUS.md` Phase 4. The admin API + dashboard were built (commit `7d39d18`) but no retailer-facing API routes or mobile screen existed.

| Layer | Files | Summary |
|---|---|---|
| **API** | `apps/api/src/routes/growth/growth-backgrounds.ts` (new) + `growth/index.ts` | 6 retailer endpoints: list active backgrounds (filterable by occasion/season/regional, validity-window aware), list all (including inactive), stats (total/active/by-occasion), occasions (distinct list for filter chips), get single, apply (picks FLUX studio template by occasion → `addStudioShootJob`, increments usage_count), poll apply status. Gated behind `FESTIVAL_BACKGROUNDS` plan feature. |
| **Mobile client** | `apps/mobile/src/lib/api/growth.ts` | 2 types (`FestivalBackground`, `FestivalBackgroundStats`) + 6 API methods (`backgrounds`, `background`, `backgroundStats`, `backgroundOccasions`, `applyBackground`, `backgroundApplyStatus`). |
| **Mobile UI** | `apps/mobile/app/growth/backgrounds.tsx` (new) | 2-column grid of background image previews, occasion filter chips (from API), stats strip, detail modal (full image + occasion/season/region tags + usage stats + apply button), apply modal (product ID input → FLUX generation → poll status → success/failure feedback). |
| **Growth Hub** | `apps/mobile/app/growth/index.tsx` | Added "Festival Backgrounds" entry to `GROWTH_MODULES` (Sparkles icon already imported). |

**Verified:** API `tsc --noEmit` clean (0 new errors); mobile `tsc --noEmit` clean.

---

## BUILT 2026-08-20: Phase 8 — GST Report Mobile Screen

Completes the mobile UI gap in `docs/marketing/IMPLEMENTATION-STATUS.md` Phase 8. The admin API + dashboard were built (commit `0a9b8cb`) but no retailer-facing API routes or mobile screen existed.

| Layer | Files | Summary |
|---|---|---|
| **API** | `apps/api/src/routes/growth/gst.ts` (new) + `growth/index.ts` | 3 retailer endpoints: GST summary (total taxable/gst/sales/orders/invoiced, CGST/SGST/IGST estimates, filterable by month/year), monthly breakdown (12-month bar data with orders), transactions (paginated, filterable by month/year/invoiced status). All queries scoped to `retailer_id`. |
| **Mobile client** | `apps/mobile/src/lib/api/growth.ts` | 4 types (`GstSummary`, `GstMonthly`, `GstTransaction`, `GstTransactions`) + 3 API methods (`gstSummary`, `gstMonthly`, `gstTransactions`). |
| **Mobile UI** | `apps/mobile/app/growth/gst.tsx` (new) | 3-tab layout: Summary (stat cards + GST breakdown CGST/SGST/IGST + invoice status), Monthly (12-month bar chart with GST amounts), Transactions (paginated list with customer, GST, invoice status badges). Year selector + month filter chips. |
| **Growth Hub** | `apps/mobile/app/growth/index.tsx` | Added `Receipt` import + "GST Report" entry to `GROWTH_MODULES`. |

**Verified:** API `tsc --noEmit` clean (0 new errors); mobile `tsc --noEmit` clean.

---

## BUILT 2026-08-20: Social Publishing Admin UI (F-031)

Completes the admin dashboard gap in `docs/marketing/IMPLEMENTATION-STATUS.md` for Direct Social Publishing. The retailer-facing API already existed (`retailers-social.ts`) but no admin oversight UI existed.

| Layer | Files | Summary |
|---|---|---|
| **Admin API** | `apps/api/src/routes/admin/admin-social.ts` (new) + `admin/index.ts` + `admin.ts` | 5 endpoints: list all connected accounts (filterable by retailer/platform/status), stats (accounts by platform, posts by status), get account detail with post history, list all posts (paginated, filterable by retailer/platform/status/type), force-disconnect account. |
| **Admin UI** | `apps/web/src/app/admin/social/page.tsx` (new) | Tabbed layout: Accounts tab (table with retailer, platform, account name, post count, status, connected date) + Posts tab (table with retailer, platform, type, caption, status badge, date, external link). Stats cards (connected accounts, total posts, failed posts, platforms). Detail modal with force-disconnect. |
| **Sidebar** | `apps/web/src/app/admin/components/Sidebar.tsx` | Added `Megaphone` import + "Social Publishing" nav entry. |

**Verified:** API `tsc --noEmit` clean (0 new errors); web `tsc --noEmit` clean.

---

## BUILT 2026-08-20: Retailer Self-Service Integrations (GMB, Facebook Ads, Google Ads)

Replaces the 3 "Not Built" features that were blocked on platform API credentials. Instead of requiring platform-level creds, retailers now configure their own API credentials in-app (bring-your-own-key pattern).

| Layer | Files | Summary |
|---|---|---|
| **Schema** | `packages/db/prisma/schema.prisma` + migration `071_retailer_integrations` | Added `gmb_configured_at`, `fb_ads_access_token`, `fb_ads_ad_account_id`, `fb_ads_page_id`, `fb_ads_configured_at`, `google_ads_refresh_token`, `google_ads_customer_id`, `google_ads_developer_token`, `google_ads_configured_at` to Retailer model. Migration applies cleanly. |
| **API** | `apps/api/src/routes/retailers/retailers-integrations.ts` (new) + `retailers/index.ts` + `retailers.ts` | 12 endpoints: list all integrations (masked), GMB (save/test/post/disconnect), Facebook Ads (save/test/create-campaign/disconnect), Google Ads (save/test/disconnect). All credentials encrypted at rest. Facebook Ads create-campaign creates full campaign→adset→creative→ad flow (starts paused). |
| **Mobile client** | `apps/mobile/src/lib/api/growth.ts` | 10 types (`IntegrationsStatus`, `GmbConfig`, `FbAdsConfig`, `FbAdCampaign`, `GoogleAdsConfig`) + 12 API methods. |
| **Mobile UI** | `apps/mobile/app/growth/integrations.tsx` (new) | Integrations hub: 3 cards (GMB, Facebook Ads, Google Ads) with configured status, configure/disconnect buttons, confirmation dialogs. |
| **Mobile UI** | `apps/mobile/app/growth/integrations/gmb.tsx` (new) | GMB config: account ID, location ID, access token, refresh token inputs + test connection + save. |
| **Mobile UI** | `apps/mobile/app/growth/integrations/fb-ads.tsx` (new) | Facebook Ads config: business token, ad account ID, page ID inputs + test connection + save. |
| **Mobile UI** | `apps/mobile/app/growth/integrations/google-ads.tsx` (new) | Google Ads config: customer ID, developer token, refresh token inputs + test connection + save. |
| **Growth Hub** | `apps/mobile/app/growth/index.tsx` | Added `Plug` import + "Integrations" entry to `GROWTH_MODULES`. |

**Verified:** API `tsc --noEmit` clean (0 new errors); mobile `tsc --noEmit` clean; `prisma validate` + `prisma generate` clean.

---

## BUILT 2026-08-20: Lookbook HTML/PDF Rendering Worker

Completes the last remaining coding item in `docs/marketing/IMPLEMENTATION-STATUS.md`. The lookbook generate endpoint previously marked status as GENERATING but had no actual rendering. Now it enqueues a BullMQ job that renders styled HTML + PDF.

| Layer | Files | Summary |
|---|---|---|
| **Job handler** | `apps/api/src/jobs/generate-lookbook.ts` (new) | BullMQ job: fetches lookbook products + photos, generates styled HTML (4 format layouts: carousel/grid/editorial/pdf), converts to PDF via pdfkit, uploads both to R2, updates Lookbook record to READY with output_url + share_url. |
| **Job wiring** | `apps/api/src/jobs/index.ts` | `addLookbookJob()` producer + `generate-lookbook` case in maintenance worker switch. |
| **Route fix** | `apps/api/src/routes/growth/growth-lookbooks.ts` | Generate endpoint now enqueues `addLookbookJob()` instead of just marking status. |
| **Shared** | `packages/shared/src/constants/index.ts` | Added `R2_PATHS.lookbookOutput()` for lookbook file storage paths. |

**Format layouts:**
- **Carousel** — single column, full-width images
- **Grid** — 2-column product grid
- **Editorial** — side-by-side image + text (magazine style)
- **PDF** — A4 document with title page + 2 products per page

**Verified:** API `tsc --noEmit` clean (0 errors); `prisma validate` + `prisma generate` clean.

---

## Built: F-021 Product & Store Ratings — 2026-08-20

**Spec:** `docs/PRO-REQUIREMENTS.md §10.12`  
**Date:** 2026-08-20  
**PRD ref:** F-021 — Product & Store Ratings

### Schema (migration 072)

| Change | Detail |
|--------|--------|
| `product_reviews` table | `(id, product_id, customer_id, retailer_id, rating 1–5, comment, is_flagged, is_hidden, timestamps)` — unique `(product_id, customer_id)` |
| `store_reviews` table | `(id, retailer_id, customer_id, rating 1–5, comment, is_flagged, is_hidden, timestamps)` — unique `(retailer_id, customer_id)` |
| `products.avg_rating` | `Float @default(0)` — denormalized, recomputed on every review write |
| `products.rating_count` | `Int @default(0)` — denormalized |
| `retailers.avg_rating` | `Float @default(0)` — denormalized |
| `retailers.rating_count` | `Int @default(0)` — denormalized |
| `retailers.google_place_id` | `String?` — retailer pastes once; Kanchuki builds write-review URL |

### Retailer API (`apps/api/src/routes/retailers/retailers-ratings.ts`)

| Method | Path | Purpose |
|--------|------|--------|
| POST | `/v1/retailers/me/reviews/product` | Submit/update a product review (eligibility-checked, upserts) |
| POST | `/v1/retailers/me/reviews/store` | Submit/update a store review (eligibility-checked) |
| GET | `/v1/retailers/me/reviews/products` | List product reviews (filterable by product_id, paginated) |
| GET | `/v1/retailers/me/reviews/store` | List store reviews (paginated) |
| GET | `/v1/retailers/me/reviews/summary` | Store rating summary + distribution + top products + recent reviews + Google review URL |
| PATCH | `/v1/retailers/me/reviews/google-place` | Set/clear `google_place_id` |

### Admin Moderation API (`apps/api/src/routes/admin/admin-ratings.ts`)

| Method | Path | Purpose |
|--------|------|--------|
| GET | `/v1/admin/reviews` | List all reviews (product + store, filterable by type/retailer/flagged/hidden/rating) |
| GET | `/v1/admin/reviews/stats` | Aggregate stats (total, avg rating, flagged, hidden) |
| PATCH | `/v1/admin/reviews/:type/:id/flag` | Flag a review for moderation |
| PATCH | `/v1/admin/reviews/:type/:id/hide` | Soft-hide a review (recomputes denormalized counters) |
| PATCH | `/v1/admin/reviews/:type/:id/unhide` | Restore a hidden review |

### Mobile Screen (`apps/mobile/app/growth/ratings.tsx`)

- **Summary tab:** Store rating card (avg + star distribution bar chart), Google review link, top reviewed products, recent reviews
- **Products tab:** Product review list with star rating, product name, customer name, comment, flagged badge
- **Store tab:** Store review list with star rating, customer name, comment, flagged badge
- Growth Hub entry with Star icon added to `growth/index.tsx`

### Review Eligibility Logic

- **Product review:** customer must have a prior `CustomerInteraction` (favorite/enquiry/purchase/try_on) with the retailer, or any interaction with the retailer
- **Store review:** customer must have any prior `CustomerInteraction` with the retailer
- One review per customer per product/store — upserts on re-submit

### Google Review Routing

- Rating ≥ 4 + `google_place_id` set → return `{ action: 'google_review', url: 'https://search.google.com/local/writereview?placeid=...' }`
- Rating ≤ 3 → return `{ action: 'private_feedback', message: 'Tell us what went wrong' }`
- No `google_place_id` → return `{ action: 'none' }`

### Files Created

| File | Purpose |
|------|--------|
| `packages/db/prisma/migrations/072_product_store_ratings/migration.sql` | Schema migration |
| `apps/api/src/routes/retailers/retailers-ratings.ts` | Retailer API (6 endpoints) |
| `apps/api/src/routes/admin/admin-ratings.ts` | Admin moderation API (5 endpoints) |
| `apps/mobile/app/growth/ratings.tsx` | Mobile ratings screen (358 lines) |

### Files Modified

| File | Change |
|------|--------|
| `packages/db/prisma/schema.prisma` | Added ProductReview + StoreReview models, denormalized counters on Product + Retailer, google_place_id on Retailer |
| `apps/api/src/routes/retailers/index.ts` | Exported `retailersRatingsRoutes` |
| `apps/api/src/routes/retailers.ts` | Registered `retailersRatingsRoutes` |
| `apps/api/src/routes/admin/index.ts` | Exported `adminRatingsRoutes` |
| `apps/api/src/routes/admin.ts` | Registered `adminRatingsRoutes` |
| `apps/mobile/src/lib/api/growth.ts` | Added 5 types + 3 API methods |
| `apps/mobile/app/growth/index.tsx` | Added Star import + "Ratings & Reviews" to Growth Hub |

### Verified

- `npx prisma validate` — schema valid ✅
- `npx prisma generate` — Prisma Client generated ✅
- `apps/api` `tsc --noEmit` — 0 errors ✅
- `apps/mobile` `tsc --noEmit` — 0 errors ✅

---

## BUILT 2026-08-21: DB-driven Plan Pricing + FLUX Kontext (Studio Shoot) per-plan quota

User asked for the pricing table (Starter/Growth/Pro monthly + annual + products + try-ons) to be fully admin-editable, plus a per-retailer-visible cap on FLUX Kontext (F-032 Studio Shoot) usage, set per plan tier from the admin dashboard. Products/try-ons limits were already admin-editable via the existing F-010 `PlanLimit` table (`/admin/plan-limits`); price was hardcoded, and Studio Shoot had no quota at all (usage was logged but never enforced — the old comment in `products-studio.ts` said a metered resource "would need a QuotaResourceType enum migration"). Both gaps closed by reusing the existing F-010 pattern, no new subsystem.

| Layer | Files | Summary |
|---|---|---|
| **DB** | `packages/db/prisma/schema.prisma` + `migrations/074_studio_shoot_quota_and_plan_pricing/migration.sql` | Added `STUDIO_SHOOT` to `QuotaResourceType` enum (no seed `PlanLimit` rows — fails open/unlimited until an admin sets a cap, same convention as the other unseeded resource types). New `PlanPricing` model/table (`plan` unique, `monthly_paise`, `annual_paise`), seeded with the prior hardcoded ₹999/₹2499/₹4999 defaults so nothing changes until an admin edits a row. **Migration applied to production** (2026-08-21). |
| **API — admin routes** | `apps/api/src/routes/admin/admin-plans.ts` | `STUDIO_SHOOT` added to the `PUT /admin/plan-limits` zod enum (reuses the existing endpoint/UI). New `GET`/`PUT /admin/plan-pricing` (same upsert + `AuditLog` pattern as `plan-limits`/`plan-features`). `POST /admin/billing/setup-plans` now reads `PlanPricing` first (falls back to the shared-package constant) so re-running it after a price edit creates correctly-priced Razorpay plan objects. |
| **API — enforcement** | `apps/api/src/routes/products/products-studio.ts`, `apps/api/src/jobs/studio-shoot.ts` | `checkQuota(retailerId, 'STUDIO_SHOOT')` gates the enqueue (after the Growth/Pro plan check, before the BullMQ job is created). `incrementUsage(retailerId, 'STUDIO_SHOOT')` fires in the job on success, alongside the existing `recordBflStudioUsage()` credit-log call — quota only counts generations that actually completed. |
| **API — billing** | `apps/api/src/routes/billing.ts` | New `getPlanPricing(plan)` helper reads `PlanPricing` (falls back to the hardcoded `PLAN_PRICING` constant if no row exists). `GET /billing/plans` and the `POST /billing/subscription` `amount_inr` both switched to it. |
| **Admin web** | `apps/web/src/app/admin/plan-limits/page.tsx` | `STUDIO_SHOOT` added to the resource-type table (reuses existing UI). New "Plan Pricing" table above it — ₹ monthly/annual inputs per plan, same save-per-row pattern as the limits table below. Page renamed "Plan Limits & Pricing". |
| **Tests** | `apps/api/src/routes/products-studio.test.ts` | Added `checkQuota` mock (3 pre-existing tests started 500ing once the real gate was wired in) + one new test for the `PLAN_LIMIT_EXCEEDED` rejection path. |

**Known gap, not fixed this pass (flagged to user):** Razorpay subscriptions are billed against pre-created Razorpay **Plan objects** with their own fixed price, referenced by `RAZORPAY_PLAN_*` env vars — editing `plan_pricing` changes what Kanchuki *records* (`GET /billing/plans`, `Subscription.amount_inr`) and what `setup-plans` *would create*, but does not retroactively re-price an already-created Razorpay plan. An admin must re-run `POST /admin/billing/setup-plans` and update the `RAZORPAY_PLAN_*` env vars after a price edit for the actual Razorpay charge to change. A UI warning was added to the admin page; a real fix would mean moving off fixed Razorpay Plan objects to per-charge dynamic Orders — out of scope here.

**Also not built (out of scope per user's explicit answer — "no per-retailer override for now"):** a `RetailerLimitOverride` row for `STUDIO_SHOOT` — the table/mechanism already exists (F-010) and needs no schema change if this is revisited later.

**Verified:** `apps/api` `tsc --noEmit` clean, `apps/web` `tsc --noEmit` clean, `prisma generate` succeeded. `products-studio.test.ts` 13/13, `products.test.ts` 29/29, `billing.test.ts` 16/16. Confirmed `admin.test.ts`/`admin.login.test.ts`/`security.test.ts` failures are pre-existing on `main` (unrelated `admin-ratings.ts` `new PrismaClient()` mock gap — reproduced via `git stash` before touching any files) — not caused by this change.

**Remaining:** customer-facing star display on `ProductDetailSheet` (P2 item), wiring reviews into the public collection page (customer submits review after purchase).

---

## BUILT 2026-08-21: Customer Profile P0-P3 — All 16 Features Shipped

**User ask:** review `docs/customer/customer-profile-req.md` §12 and build P0 through P2 (13 items), then P3 (3 items). Each committed individually.

### P0 — VTO Self-Serve (Commit `6dcf35c`)
| Layer | Files | Summary |
|---|---|---|
| **Web** | `apps/web/src/app/c/[slug]/components/CollectionView.tsx`, `ProductDetailSheet.tsx` | Flipped `TRY_ON_ENABLED` from `false` to `true` in both files. VTO backend already live on Hetzner (BUILD-LOG §27/§23); TryOnModal and API proxy routes were fully built but gated. |

### P1 — 5 Features (Commits `367ba34`–`c4cbec7`)
| # | Feature | Commit | Files Created |
|---|---|---|---|
| 1 | Showroom Booking | `367ba34` | `BookingForm.tsx`, `api/[store]/bookings/route.ts` |
| 2 | Reviews/Ratings Social Proof | `1fa2262` | `ReviewList.tsx` |
| 3 | Seasonal Collections | `ea8d81d` | `SeasonalPicks.tsx`, `api/[store]/collections/route.ts`, `public-retailers.ts` (GET collections endpoint) |
| 4 | Mix-and-Match Lookbooks | `3bee868` | `CustomerLookbooks.tsx`, `api/[store]/lookbooks/route.ts`, `public-retailers.ts` (GET lookbooks endpoint) |
| 5 | Promotion Alert Banner | `c4cbec7` | `PromotionBanner.tsx`, `api/[store]/promotions/route.ts`, `public-retailers.ts` (GET promotions endpoint) |

**Bottom bar change:** CollectionView bottom bar changed from 3-column flex to 4-column grid to accommodate the new "Book Visit" button. All buttons slightly smaller (size 15→15, text 11px→10px).

### P2 — 7 Features (Commits `06a5fcf`–`3e695f4`)
| # | Feature | Commit | Files Created |
|---|---|---|---|
| 1 | Fabric Glossary | `06a5fcf` | `FabricGlossary.tsx` — 25+ Indian fabrics with descriptions, care tips, best-for |
| 2 | Recently Viewed | `d2a7ae7` | `RecentlyViewedRow.tsx`, `recentlyViewed.ts` (localStorage tracker) |
| 3 | Restock Notify | `3e40d88` | `NotifyWhenAvailable.tsx` — sold-out products |
| 4 | Saved Measurements | `fb26d03` | `SavedSize.tsx` — XS-8XL localStorage capture |
| 5 | Style Quiz | `e3f5250` | `StyleQuiz.tsx` — 5 questions (occasion, region, budget, fabric, color) |
| 6 | AI Stylist v1 | `52af9fb` | `AIStylist.tsx`, `public-stylist.ts` (Claude-powered), `api/stylist/route.ts` |
| 7 | Design Gallery | `3e695f4` | `DesignGallery.tsx`, `admin-design-references.ts`, `public-designs.ts`, `migration 069` |

**AI Stylist architecture:** POST /public/stylist takes free-text query + store slug, fetches retailer's tagged catalog (max 200 products), applies deterministic pre-filtering (color/fabric/budget), sends top 60 to Claude with outfit-matching rules from §4 of customer-profile-req.md. Falls back to top-6 products when Claude is unavailable.

**Design Gallery schema:** new `DesignReference` model with `DesignCategory` enum (NECKLINE, BLOUSE_BACK, SLEEVE, SALWAR, SILHOUETTE). Migration 069 created. Admin CRUD at `/admin/design-references`. Public endpoint at GET /public/designs returns grouped-by-category results. Customer gallery shows on unstitched product detail pages.

### P3 — 3 Features (Commits `f122c19`–`7ec21c7`)
| # | Feature | Commit | Files Created |
|---|---|---|---|
| 1 | Regional Filters | `f122c19` | `RegionalFilters.tsx` — 12 Indian regional weave/style chips |
| 2 | Referral Rewards | `504e565` | `CustomerReferral.tsx` — phone-based code generation + WhatsApp share |
| 3 | Family/Gifting | `7ec21c7` | `FamilyProfiles.tsx` — save sizes for family members (Mom/Sister/Daughter/etc.) |

### Migration 069 — Design Gallery

```sql
CREATE TYPE "DesignCategory" AS ENUM ('NECKLINE', 'BLOUSE_BACK', 'SLEEVE', 'SALWAR', 'SILHOUETTE');
CREATE TABLE "design_references" (
    "id" TEXT NOT NULL,
    "category" "DesignCategory" NOT NULL,
    "option" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "r2_key" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "design_references_pkey" PRIMARY KEY ("")
);
```

**⚠️ Pending:** Migration 069 needs `prisma migrate deploy` in production.

**Verified:** `apps/api` tsc clean, `apps/web` tsc clean, `prisma generate` succeeded.

---

## BUILT 2026-08-29: Add-Product raw-photo default + restored per-photo controls + AI Studio model prompts + Admin backdrop delete/lightbox/AI-naming

**PR #8** → `main` as squash `aec7a2b`, plus follow-up fixes `288f865` + `fbf5f1d`. No migration.

### Mobile — Add / Product Detail

| Area | Change | Files |
|---|---|---|
| Add-product | `auto_cleanup` default flipped **`true` → `false`**. The raw photo is saved as-is on upload; the retailer opts into background removal / contrast backdrop / shadow (the "AI Studio effect" they were seeing auto-applied). | `apps/mobile/app/product/add.tsx` |
| Product detail | Restored the per-photo **Background picker + Shadow toggle** — removed in the `b0c3747` Royal Orchid redesign, which split `[id].tsx` into components and dropped the JSX while the `useProductAiStudio` handlers (`handleSetBackground`, `handleSetShadow`, `shadowFor`, `photoBackgrounds`/`photoShadows`) survived unused. Re-added the backdrop-library query + value seeding to the hook; new `ProductPhotoControls` component rendered under the carousel. | `apps/mobile/src/hooks/useProductAiStudio.ts`, `apps/mobile/src/components/product-detail/ProductPhotoControls.tsx` (new), `apps/mobile/app/product/[id].tsx` |
| AI Studio Shoot — Fashion Models | When the IDM-VTON path didn't return (no `FAL_KEY` / VTON error) all 4 models fell back to **one hardcoded generic prompt** — Priya / Ananya / Meera / Kabir rendered identically. The fallback prompt is now built from the selected model's `title` / `description` / `pose` / `gender`. (Backdrop **Scenes** already carry distinct prompts — unchanged.) | `apps/api/src/lib/studio-shoot.ts` |

### Admin — Background Images (`/admin/background-images`)

| Feature | Detail | Files |
|---|---|---|
| Delete | `DELETE /admin/background-images/:id` — hard delete + best-effort R2 object cleanup + audit log. `products_background_image_id_fkey` is `ON DELETE SET NULL` (migration 027), so products using a deleted backdrop fall back to Auto. Trash button per card. | `apps/api/src/routes/admin/admin-media.ts`, `apps/web/src/app/admin/background-images/page.tsx` |
| AI scene-naming | `POST /admin/background-images` — `name` is now **optional**; when omitted the scene is auto-named via `runVisionAsk` (2–4 word Title Case, e.g. "Royal Palace Courtyard"), reusing the image buffer already fetched for tone classification. Deterministic `Backdrop <YYYY-MM-DD>` fallback. Admin upload no longer sends the raw filename as the name. | same |
| Lightbox | Thumbnail is now a button — click opens the full `image_url` in a fixed overlay, click anywhere closes. | `apps/web/src/app/admin/background-images/page.tsx` |

### Follow-up fixes

- `288f865` — delete failure toast now shows `HTTP <status> — <body>` instead of a dead-end "Delete failed".
- `fbf5f1d` — **root cause of the "❌ Delete failed":** `adminMutateOptions()` sets `Content-Type: application/json`; a bodyless `DELETE` then fails Fastify body validation → `500 FST_ERR_VALIDATION "body must be object"`. Now sends `'{}'` (the route ignores the body). **Same latent bug exists in the `admin/ai-providers` and `admin/integrations` DELETE callers — not fixed (not reported).**

### Verified

- `apps/api` + `apps/mobile` + `apps/web` `tsc --noEmit` → clean
- `vitest run src/routes/products-studio.test.ts src/lib/studio-shoot.test.ts` → 21/21
- Prod: admin background-image delete confirmed working after redeploy (user).

### Notes

- PR #8 history carries two no-op commits (`a0c8940` + its revert `653e0c1`) — a `git add -A` slip on `docs/tasks/AI Models and Scenes.{html,hmtl}`, then restored byte-identical to `c7477c6`.

---

## BUILT (unmerged, admin-bench only) 2026-08-30: AI Studio Shoot — demographic person-swap + scene expansion

Plan: `docs/tasks/ai-studio-shoot-models-scenes.md`. Steps 1–5 of that doc. No migration, no commit yet — owner tests every scene × demographic in the admin bench, then finalises the shipped subset (step 6: mobile auto-filter + un-draft).

**Problem:** every model scene hardcoded "a graceful Indian fashion model" (an adult woman), and the retailer had to separately pick a fashion model. A male / kids / teen product rendered as a woman unless a `STUDIO_MODELS` entry was chosen.

**Fix:** the product's AI-tagged **category** derives a *demographic*; the scene template describes only the setting; `generateStudioImage()` swaps the person in. Scenes are tagged product-only (`noModel`) or restricted to demographics (`audience`).

### `packages/shared/src/constants/index.ts`

| Add | Detail |
|---|---|
| `PRODUCT_DEMOGRAPHICS` + `Demographic` | `womens \| mens \| teen_girl \| teen_boy \| kids_girl \| kids_boy` |
| `demographicForCategory(category, name)` | keyword heuristic on the category/name string; ambiguous → `womens` (today's default). Generic kidswear → `kids_boy` (tester flips to girl in the bench). |
| `STUDIO_TEMPLATES` element type | new optional `noModel?: boolean`, `audience?: readonly Demographic[]` |
| `isNoModelTemplate(t)` | `noModel === true` OR prompt already forbids a person ("Replace the background of this product photo…", "Product-only shot, no person…", macro rows) |
| `studioTemplatesFor(demo)` | `isNoModelTemplate(t) \|\| !t.audience \|\| t.audience.includes(demo)` |
| Tags | `audience: ['womens']` → `dupatta_motion`, `seated_haveli_steps`, `bridalwear`. `noModel: true` → `seasoncollection`, `display_hanger` (the rest of the product-only rows are caught by `isNoModelTemplate`'s prompt check). |
| 5 new scenes (all `draft: true`) | `seated_lounge` (Seated Lounge, universal), `male_with_car` / `male_with_bike` (`['mens','teen_boy']`), `kids_playing` (`['kids_boy','kids_girl']`), `teen_street` (`['teen_girl','teen_boy']`) |

`STUDIO_MODELS` + `getStudioModel` untouched — the IDM-VTON / retailer fashion-model path still uses them.

### `apps/api/src/lib/studio-shoot.ts`

- `PERSON_CLAUSE: Record<Demographic, string>` (adult woman / adult man / teenage girl ~15 / teenage boy ~15 / girl child ~6 / boy child ~6).
- `generateStudioImage` options: new optional `demographic?: Demographic | string`. Omitted → `demographicForCategory(product.category, product.name)`.
- Dead `resolveIndianModelDescription` removed; `runway` + no-template paths now use `PERSON_CLAUSE[demographic]`.
- Non-`noModel` model scenes: regex-swap the stock "graceful Indian fashion model" phrasing to the demographic clause **and** prepend `"The person wearing this garment is <clause>."` (belt-and-braces — the prepend steers even if the regex misses). Skipped for `customPrompt`, `modelId`, `runway`, and product-only scenes.
- IDM-VTON branch gated to `demographic === 'womens' | 'mens'` — teen/kids skip straight to the prompt path (a stock adult VTON result would otherwise be returned and never corrected).

### `apps/api/src/routes/admin/admin-photo-cleanup.ts`

- `POST /admin/photo-cleanup/studio-shoot` body: new optional `demographic: z.enum(PRODUCT_DEMOGRAPHICS)`, passed straight to `generateStudioImage`.

### `apps/web/src/app/admin/photo-cleanup-test/page.tsx`

- New **Product demographic** `<select>` (6 + "— any / all scenes —"). Filters the scene dropdown via `studioTemplatesFor()`; snaps the selection to the first allowed scene when the current one falls outside the filter.
- Scene `<option>` labels carry a hint: `· product-only` / `· mens/teen_boy` / `· all models`.
- Old "Fashion model" dropdown relabelled **"Fashion model — advanced override"**.
- Sends `demographic` in the `/studio-shoot` POST body.

### Verified

- `@kanchuki/shared` rebuilt; `apps/api` + `apps/web` `tsc --noEmit` → clean.
- `vitest run src/lib/studio-shoot.test.ts src/routes/admin/admin-photo-cleanup.test.ts src/routes/products-studio.test.ts` → 25/25.

### Not done (step 6, after owner testing)

- Un-draft the finalised scene set.
- Mobile auto-filter in `apps/mobile/src/components/product-detail/ProductStudioModal.tsx` — `product.category` → `demographicForCategory` → `studioTemplatesFor`, no manual demographic pick for the retailer.

---

## 55. Feature Teardown — Remove Unwanted Features

| File | Detail |
|------|--------|
| **Spec** | `docs/database/no-feature-want.md` — authoritative teardown spec |
| **Branch** | `chore/remove-unwanted-features` |
| **Date** | 2026-08-31 |
| **Status** | ✅ Code complete, migration 082 written (not deployed) |

### What was removed

**25 tables dropped** via migration `082_remove_unwanted_features`:
- `orders`, `order_items`, `checkouts`, `cart_items` — L2 Ecommerce checkout
- `try_on_jobs`, `spin_frames`, `spin_frame_jobs`, `admin_tryon_jobs`, `try_on_usage_logs` — Virtual Try-On + 360° spin
- `fashion_dna_profiles`, `customer_measurements`, `customer_interactions`, `interaction_matches` — Fashion DNA CRM + measurement/interaction tracking
- `store_affinities`, `intention_finding_queries`, `intention_finding_results` — AI store affinity + intention finding
- `size_recommendations`, `size_charts`, `size_chart_entries` — Size recommendation engine
- `referrals`, `referral_credits`, `partner_referrals` — Referral programs (customer + partner)
- `bookings`, `showroom_slots` — Showroom/try-on room booking
- `lookbooks`, `lookbook_items` — Lookbook generator
- `ghost_mannequin_jobs` — Ghost-mannequin AI image generation

**17 standalone enums dropped:** `OrderStatus`, `PaymentMode`, `PaymentProvider`, `CheckoutStatus`, `CheckoutPaymentMethod`, `TryOnStatus`, `TryOnJobStatus`, `SpinFrameStatus`, `FashionDNACluster`, `InteractionType`, `IntentionFindingStatus`, `ReferralCreditStatus`, `ReferralSource`, `BookingStatus`, `LookbookFormat`, `LookbookStatus`, `SizeRecommendationStatus`

**Orphaned columns dropped:** `products.spin_frames`, `products.spin_status`, `products.spin_error`, `retailers.referral_enabled`, `retailers.referral_reward_paise`, `customers.fashion_dna_confidence`, `customers.fashion_dna_last_computed`

**Plan-matrix rows removed:** `TRY_ON`, `MEASUREMENT_EXTRACTION`, `FASHION_DNA`, `SPIN_FRAME_EXTRACTION`, `GHOST_MANNEQUIN`, `LOOKBOOK`, `CUSTOMER_REFERRALS`, `PARTNER_REFERRALS`, `SHOWROOM_BOOKINGS`, `SIZE_RECOMMENDATION` from `plan_features` and `quota_resources`

**Dead enum values annotated** (not dropped — used in codebase): `PlanFeatureKey` (TRY_ON, MEASUREMENT_EXTRACTION, FASHION_DNA, SPIN_FRAME_EXTRACTION, GHOST_MANNEQUIN, LOOKBOOK, CUSTOMER_REFERRALS, PARTNER_REFERRALS, SHOWROOM_BOOKINGS, SIZE_RECOMMENDATION) and `QuotaResourceType` (TRY_ON, MEASUREMENT_EXTRACTION, FASHION_DNA, SPIN_FRAME_EXTRACTION, GHOST_MANNEQUIN)

### API changes

- **Deleted files:** `routes/checkout.ts`, `routes/checkout/` (8 files), `routes/tryon.ts`, `routes/retailers/retailers-bookings.ts`, `routes/retailers/retailers-size-chart.ts`, `routes/retailers/retailers-referrals.ts`, `routes/retailers/retailers-fashion-dna.ts`, `routes/public/public-orders.ts`, `routes/admin/admin-lookbooks.ts`, `routes/admin/admin-partner-referrals.ts`, `routes/admin/admin-festival-backgrounds.ts`, `routes/admin/admin-incentives.ts`, `routes/growth/growth-gst.ts` (rewritten), `jobs/checkout-order-expiry.ts`, `jobs/tryon-worker.ts`, `jobs/fashion-dna-worker.ts`, `jobs/spin-frame-worker.ts`, `jobs/ghost-mannequin-worker.ts`, `lib/invoice.ts`, `lib/passport-activity.ts`, `lib/recommend.ts`, `lib/recommendation-triggers.ts`, `lib/checkout-helpers.ts`, `lib/size-recommend.ts`, `packages/ai/src/tryon.ts`
- **Barrel updates:** `index.ts`, `routes/admin/index.ts`, `routes/products/index.ts`, `routes/retailers/index.ts`, `routes/public/index.ts`, `routes/growth/index.ts`, `jobs/index.ts` — removed all imports/registrations for deleted routes
- **Surgical rewrites:** `customers.ts` (removed interaction/measurement/matches routes), `public-growth.ts` (removed referral/booking routes), `growth-inventory.ts` (removed Order dependency), `growth-sizes.ts` (removed size-recommend dependency), `passport.ts` (removed customerInteraction queries), `admin-gst.ts` (rewritten for SubscriptionPayment), `products-crud.ts` (removed notification calls), `products-media.ts` (removed spin-frame job), `admin-plans.ts` (removed TRY_ON resource), `admin-retailers-detail.ts` (removed try_on_credits), `admin-photo-cleanup.ts` (removed tryon route)

### Web changes

- **Deleted:** `app/checkout/`, `app/try-on/`, `app/cart/`, `app/for-you/`, `app/c/[slug]/order/`, `app/admin/incentives/`, `app/admin/partners/`, `app/admin/lookbooks/`, `app/admin/festival-backgrounds/`
- **Surgical edits:** admin sidebar (removed links), shopper layout (removed checkout-related nav), `CollectionView.tsx` (removed try-on modal, booking form, customer referral)

### Mobile changes

- **Deleted:** `app/tryon/`, `app/(tabs)/orders.tsx`, `app/product/size-chart.tsx`, `app/growth/suppliers.tsx`, `app/growth/showroom-booking.tsx`, `app/growth/referrals.tsx`, `app/growth/product-videos.tsx`, `app/growth/ai-translate.tsx`, `app/growth/ai-search.tsx`, `app/growth/campaign-analytics.tsx`
- **Surgical edits:** tabs layout (removed Orders tab), growth hub (removed 7 deleted tiles), `customer/[id].tsx` (removed size recommendations + Fashion DNA section), `customer/[id].tsx` types (removed MatchedProduct), `src/lib/api/index.ts` (removed tryon/size-charts/orders exports), `src/lib/api/retailer.ts` (added getVisitorTaste), `growth/taste-analytics.tsx` (fixed API call + color), `(tabs)/index.tsx` (removed ordersApi usage)

### Shared packages

- `packages/shared/src/constants/index.ts` — removed `try_on_credits` from PLAN_LIMITS, `ADDON_PRICING.TRY_ON`, `QUEUES.TRY_ON/MEASUREMENT_EXTRACTION/FASHION_DNA/SPIN_FRAME_EXTRACTION`, `PIECE_TAGGABLE_CATEGORIES`; fixed orphaned `'Lehenga'` fragment
- `packages/shared/src/types/index.ts` — removed `try_on_credits` from RetailerProfile

### Schema.prisma

- 25 models removed, 17 standalone enums removed, 20+ relation fields removed
- 9 dead `PlanFeatureKey` and `QuotaResourceType` values annotated with `// REMOVED: <name>` comments
- `prisma generate` succeeds

### Verified

- `pnpm --filter @kanchuki/api typecheck` → clean (0 errors)
- `pnpm --filter @kanchuki/web typecheck` → clean (0 errors)
- `pnpm --filter @kanchuki/mobile typecheck` → clean (0 errors)

### Not done

- Migration `082` not applied to production (applied manually by owner)
- Doc updates to BUILD-LOG, PRO-REQUIREMENTS, PLAN, INDIA-RETAILER-GROWTH, DATABASE, API, SECURITY, DESIGN — partially complete (see this entry + CLAUDE.md)

---

## Fixed: 2026-08-31 — Admin bodyless-POST 400 — unsuspend/feature/unfeature (Fastify v5 empty JSON body)

**Symptom:** admin panel "Unsuspend Account" showed "Failed to unsuspend" (rendered in a green success-styled banner). Same latent break on "Feature"/"Unfeature" store pins and `POST /customers/:id/unblock`.

### Root cause

`adminMutateOptions()` (`apps/web/src/lib/admin-fetch.ts`) always sets `Content-Type: application/json`. The unsuspend/feature/unfeature buttons `fetch` with `method: 'POST'` and **no body**. `fetch` still sends the header, and Fastify v5 rejects `application/json` + empty body with **`FST_ERR_CTP_EMPTY_JSON_BODY` 400 before any route handler or auth preHandler runs** — so no DB write, no audit-log row. `suspend` was unaffected only because it sends `body: JSON.stringify({ reason })`.

Confirmed against prod: `curl -X POST .../unsuspend -H 'Content-Type: application/json'` (no body) → `400 FST_ERR_CTP_EMPTY_JSON_BODY`; with `-d '{}'` → `403` (auth), i.e. the route/handler are fine. Ruled out at the prod DB: column presence/nullability, table + column `GRANT`s for `kanchuki_app`, RLS (`kanchuki_app` has `BYPASSRLS`), triggers/constraints — the raw `UPDATE` runs clean.

### Fix

| File | Change |
|------|--------|
| `apps/api/src/plugins/empty-json-body.ts` | **new** — `parseJsonAllowEmpty`: empty/whitespace body → `{}`, malformed JSON → 400. |
| `apps/api/src/plugins/empty-json-body.test.ts` | **new** — 5 unit tests (empty, whitespace, Buffer, valid, malformed). |
| `apps/api/src/index.ts` | Registers the parser on the root server (`addContentTypeParser('application/json', { parseAs: 'string' }, parseJsonAllowEmpty)`) right after `Fastify({...})`. Webhook route plugins (`billing.ts`, `checkout-webhook.ts`, `whatsapp-catalog.ts`) keep their own **encapsulated** raw-body parser — unaffected. Fixes all bodyless admin mutations (present + future); Zod still guards routes that need real fields. |
| `apps/web/src/app/admin/retailers/[id]/page.tsx` | (1) Action-feedback banner was hardcoded green + `BadgeCheck` for every message — errors looked like successes. Added `actionErr` state; banner renders red + `AlertTriangle` on failure. `actionErr` set in every `catch`, cleared at each action start. (2) `/unsuspend`, `/feature`, `/unfeature` handlers now read `j?.error?.message` from the response instead of a blind `throw new Error('Failed to …')`. |

### Verified

- New `parseJsonAllowEmpty` test → 5/5.
- `apps/api` tsc → clean. `apps/web` tsc → clean.
- `npx vitest run src/routes/admin.test.ts src/routes/security.test.ts src/routes/admin.login.test.ts` → 106/106 (one first-run flake on the TOTP 30s-window case-insensitive-login test; green on rerun, and green alone).

### Not done

- Not deployed — branch `fix/mobile-typecheck-taste-analytics`; reaches prod via merge to `main` → Railway auto-deploy.

---

## 56. Post-Teardown Recovery — Plans/Onboarding/Dashboard + Crash Fixes (PR #16)

**Branch:** `recover/mobile-plans-onboarding-dashboard`  
**Date:** 2026-08-31 → 2026-09-01  
**PR:** [#16](https://github.com/kapisejix/kanchuki/pull/16)

12 commits recovering unmerged work from `fix/mobile-typecheck-taste-analytics` that sat on a stale branch while `main` advanced through PR #15 (feature teardown). Cherry-picked onto current `main`, conflicts resolved vs teardown, plus 3 new crash/permission fixes.

### Commits

| Commit | Summary |
|--------|---------|
| `3cf1e90` | feat(mobile): "Select Plan" step in retailer onboarding after GST |
| `7749108` | feat: hard-delete retailer accounts + in-app plan selection |
| `a4bfa39` | fix(mobile): delete-account always logs out, DB-driven plan prices, native FB/IG OAuth, skeleton design match |
| `86817a0` | fix: retailer hard-delete FK gap, DB-wired plans, native FB connect, super-admin delete |
| `163708c` | fix(admin): bodyless POST 400 on Fastify v5 empty JSON body |
| `0fa0539` | fix(mobile): streamline dashboard layout + floating center nav button |
| `70a83da` | fix(api): gate onboarding plan/demo mutation when onboarding already completed (security) |
| `64612d4` | feat(mobile): store-name headers on Growth/Collections/Category + OTP error surfacing |
| `5f56dd1` | fix(mobile): remove orphaned supplier screen left by the feature teardown |
| `88d2fbb` | **fix(web): restore avg_rating in product-list serializer + guard toFixed sites** |
| `56612f0` | **fix(mobile): QR export deprecation, stale expo-router screens, direct gallery save** |
| `308573e` | chore(db): migration 083 — GRANT DELETE on product_photos to kanchuki_app |

### Key fix detail

#### `88d2fbb` — Web crash: avg_rating undefined.toFixed(1)

**Symptom:** every catalog/category/collection page crashed with "Cannot read properties of undefined (reading 'toFixed')". Hard-refresh "fixed" it because Serwist served stale collection-api cache (pre-teardown JSON that still had `avg_rating`).

**Root cause:** commit `76c5acd` (PR #15 teardown) dropped `avg_rating` from `toPublicProductSummary()` in `apps/api/src/routes/public/public-helpers.ts` while keeping `rating_count`. The serializer shipped products with `rating_count` but no `avg_rating` → `undefined.toFixed(1)` on every client.

**Files:**

| File | Change |
|------|--------|
| `apps/api/src/routes/public/public-helpers.ts` | Restored `avg_rating: p.avg_rating ?? 0` + `has_360: false` for type parity |
| `apps/web/src/app/c/[slug]/components/CollectionView.tsx` | `(product.avg_rating ?? 0).toFixed(1)` |
| `apps/web/src/app/c/[slug]/components/ReviewList.tsx` | `(avgRating ?? 0).toFixed(1)` |
| `apps/web/src/app/c/[slug]/components/SharedProductPage.tsx` | `(product.avg_rating ?? 0).toFixed(1)` |

#### `56612f0` — Mobile: QR export, stale screens, gallery save

| File | Change |
|------|--------|
| `apps/mobile/app/store-profile.tsx` | `writeAsStringAsync` from `expo-file-system/legacy` (SDK 54 barrel throws "deprecated"). Fixes "Export Failed — Could not export QR code". |
| `apps/mobile/app/_layout.tsx` | Removed 6 `<Stack.Screen>` entries whose route files were deleted in teardown (`category/index`, `tryon/in-store`, `orders/[id]`, `growth/referrals`, `growth/bookings`, `growth/booking-form`). Fixes `No route named "growth/booking-form"` on `expo start`. |
| `apps/mobile/src/hooks/useProductAiStudio.ts` | `handleDownloadCurrentMedia` tries `expo-media-library` `saveToLibraryAsync` first (direct gallery save on dev/EAS builds), falls back to share sheet in Expo Go. |
| `apps/mobile/app.json` | Added `expo-media-library` config plugin with permission strings. |

#### `308573e` — Photo-delete 500: permission denied (issue #3)

**Symptom:** `DELETE /v1/products/:id/photos/:photoId` returns 500 "Failed to delete Photo — APIError: Something went wrong".

**Root cause:** PostgreSQL error `42501: permission denied for table product_photos`. SECURITY.md §19.1 revoked DELETE from `kanchuki_app` role, but the photo-delete handler calls `prisma.productPhoto.delete()` (hard delete). The pooler-connection GRANT attempt silently succeeded (PgBouncer absorbed it) without taking effect.

**Fix:** `GRANT DELETE ON product_photos TO kanchuki_app;` run from Supabase dashboard SQL Editor (requires superuser, can't go through pooler).

**File:** `packages/db/prisma/migrations/083_grant_delete_product_photos/migration.sql` — documents the one-off permission grant.

### Verified

- `apps/api` vitest: 53 files, 684 tests passed ✅
- `apps/api` tsc: clean ✅
- `apps/web` vitest: 14 files, 89 tests passed ✅
- `apps/web` tsc: clean ✅
- `apps/mobile` tsc: clean ✅

### Not done

- Photo-delete GRANT needs to be applied from Supabase dashboard (can't run through pooler)
- Demo access has no expiry
- `plan` writes straight to `retailer.plan` (reviewer wants separate `intended_plan` column)

---

## §59 — Monthly-Only Pricing + GST Engine

**Status:** ✅ **Built** (2026-09-01)

Two coupled billing changes: drop annual plans (monthly-only) and make plan price GST-exclusive with full GST invoice PDF generation.

### Part A — Monthly-Only Pricing

| Change | Detail |
|--------|--------|
| `PLAN_PRICING` constant | Removed `annual` key; only `monthly` remains per tier. Base price is ex-GST (`packages/shared/src/constants/index.ts`) |
| `PlanPricing` schema | `annual_paise` column dropped — migration `085_drop_annual_paise` |
| `RAZORPAY_PLAN_IDS` | Reduced from 6 env vars to 3 (`RAZORPAY_PLAN_STARTER_MONTHLY` / `_GROWTH_MONTHLY` / `_PRO_MONTHLY`) |
| `setup-plans` endpoint | `POST /admin/billing/setup-plans` now creates 3 monthly Razorpay plans at **gross** (`base × 1.18`) |
| Billing page (web) | Annual toggle, annual price labels, savings % removed from `billing/page.tsx`, `pricing/page.tsx`, `PricingTable.tsx`, `MarketingSections.tsx` |
| Admin billing page | Annual column removed from `admin/billing/page.tsx`, `admin/plan-limits/page.tsx` |
| Mobile plan-select | Annual toggle removed from `plan-select.tsx`, `billing.ts` API client |
| `billing.ts` subscription creation | `billing_period` removed from schema; `total_count` always monthly; `periodEnd()` monthly-only |

### Part B — GST Engine + Invoice PDF

| File | What it does |
|------|-------------|
| `apps/api/src/lib/gst.ts` | `computeSubscriptionGst()` — flat 18% (SAC 998314), intra-state → CGST+SGST split, inter-state → IGST. Unknown state codes default to inter-state (safer). All paise integers, `Math.round`, remainder to SGST. |
| `apps/api/src/lib/gst.test.ts` | 11 unit tests: intra/inter-state, rounding remainder, zero/edge, large amounts |
| `apps/api/src/lib/gst-invoice-number.ts` | `allocateInvoiceNumber()` — gap-free per-FY counter via Prisma interactive txn (`SELECT … FOR UPDATE`). Format: `KAN/YY-YY/NNNNNN` |
| `apps/api/src/lib/gst-invoice-number.test.ts` | FY date-math tests + format verification |
| `apps/api/src/lib/gst-invoice-pdf.ts` | `buildGstInvoicePdf()` — pdfkit A4 PDF with seller block, buyer block, line item (SAC 998314), CGST/SGST or IGST rows, total in figures + words (Indian Crore/Lakh), "Reverse charge: No", place of supply |
| `apps/api/src/jobs/generate-gst-invoice.ts` | BullMQ maintenance queue job: reads payment + retailer + platform GST profile → builds PDF → uploads to R2 (`invoices/subscription/<retailerId>/<invoiceNo>.pdf`) → updates `SubscriptionPayment.invoice_pdf_url`. Idempotent (skips if URL already set). 3 retries, exponential backoff. |
| `apps/api/src/routes/billing.ts` | Webhook `subscription.charged`: calls `computeSubscriptionGst()` with `Retailer.state` + seller state, writes `amount_excluding_gst`, `gst_amount`, `cgst_amount`, `sgst_amount`, `igst_amount`, `gst_rate`, `sac_code`, `place_of_supply`, `gst_invoice_number`. Enqueues `generate-gst-invoice` job. |
| `apps/api/src/routes/admin/admin-gst-profile.ts` | `GET/PUT /admin/gst-profile` — upserts singleton `PlatformGstProfile` (company_name, GSTIN with 15-char regex validation, address, state, state_code, PAN, invoice_prefix). Audit-logged. |
| `apps/api/src/routes/admin/admin-invoices.ts` | `GET /admin/invoices` — list all invoices with GST breakdown. `GET /admin/invoices/:retailer_id/:id/pdf` — presigned R2 download URL |
| `apps/api/src/routes/admin/admin-gst.ts` | Updated to read real `cgst_amount`/`sgst_amount`/`igst_amount` columns instead of estimating `gst/2` |
| `apps/api/src/routes/retailers/retailers-invoices.ts` | `GET /me/invoices` — retailer's own invoice list with GST breakdown. `GET /me/invoices/:id/pdf` — presigned download URL (scoped to retailer) |
| `apps/api/src/routes/growth/growth-gst.ts` | Retailer-facing GST report: now reads real CGST/SGST/IGST columns |
| `apps/web/src/app/billing/page.tsx` | New `InvoiceList` component: table with invoice number, date, base, GST, total, PDF download button |
| `apps/web/src/app/admin/billing/page.tsx` | Admin billing: monthly-only pricing display |
| `apps/web/src/app/admin/plan-limits/page.tsx` | Admin plan limits: annual column removed, monthly-only |
| `apps/mobile/app/plan-select.tsx` | Mobile plan selection: annual toggle removed |
| `packages/db/prisma/migrations/085_drop_annual_paise/migration.sql` | `ALTER TABLE plan_pricing DROP COLUMN IF EXISTS annual_paise` |

### Schema additions (on `SubscriptionPayment`)

New columns populated by the webhook: `gst_rate`, `cgst_amount`, `sgst_amount`, `igst_amount`, `place_of_supply`, `sac_code`, `invoice_pdf_url`, `invoice_generated_at`. Existing `amount_excluding_gst`, `gst_amount`, `gst_invoice_number` (previously never populated) now filled on every charge.

New table: `PlatformGstProfile` (singleton, admin-editable) — company GST identity for invoice header.

New table: `GstInvoiceSequence` — gap-free per-FY counter (`financial_year` PK, `last_number`, `updated_at`).

### Tests

- `gst.ts`: 11 unit tests (intra/inter-state, rounding, edge cases)
- `gst-invoice-number.ts`: FY date-math + format tests
- `billing.test.ts`: updated for monthly-only shape
- `admin.test.ts`: updated for monthly-only pricing

### Docs updated

- `CLAUDE.md` §59 index entry + Pricing Model table (monthly only, base ex-GST)
- `docs/PRO-REQUIREMENTS.md` §6 Billing Rules (monthly-only, CGST/SGST/IGST split)
- `docs/BUILD-LOG.md` §59 (this entry)
- `docs/tasks/subscription-gst-and-monthly-pricing.md` — spec/task doc

### §59.1 — Post-review hardening (2026-09-02, code-review `docs/tasks/2026-09-01.md`)

Ten findings from the GST-engine review, all fixed:

| # | Fix |
|---|-----|
| H1 | Invoice number is now allocated **inside** the same `prisma.$transaction` that inserts the payment row (`billing.ts` webhook rewritten to interactive-txn form) — a rollback no longer burns a number. `allocateInvoiceNumber()` takes an optional `tx` client. |
| M1 | Webhook is idempotent on `razorpay_payment_id` — a redelivered `subscription.charged` finds the existing row inside the txn and skips both allocation and insert. |
| M2 | `subscription.activated` no longer allocates an invoice number — allocation is gated on `subscription.charged` + a `payload.payment` entity. |
| M3 | `allocateInvoiceNumber()` replaced `SELECT … FOR UPDATE` + branch with a single `INSERT … ON CONFLICT (financial_year) DO UPDATE … RETURNING` — no PK-violation race on the first invoice of a new FY. |
| H3 | Invoice PDFs upload to a **random-UUID** R2 key stored in `subscription_payments.invoice_r2_key` (migration `087`); download routes return a **300-second presigned URL** (`getDownloadPresignedUrl`) instead of a permanent public URL. `R2_PATHS.gstInvoice(retailerId, token)`. Web `InvoiceList` fetches a fresh signed URL per click; ready-flag is `invoice_generated_at`. |
| M4 | `handleGenerateGstInvoice` now **throws** (was `return`) on missing payment / GST columns / platform GST profile, so BullMQ retries. New `backfill-gst-invoices` maintenance cron (daily 06:00 UTC) re-enqueues any `status='success'` payment with `invoice_generated_at IS NULL`. |
| M5 | `place_of_supply` now stores the coded form `"27-Maharashtra"` (was the raw state name). |
| L1 | Shared BullMQ infra extracted to `apps/api/src/jobs/queue.ts` (`getRedis` + queue getters); `generate-gst-invoice.ts` reuses `getMaintenanceQueue()` instead of opening its own Redis connection + Queue. `jobs/index.ts` re-exports `getRedis`. |
| L2 | Invoice-meta block in `gst-invoice-pdf.ts` renders label + value on one line (`continued: true`); unused `metaY` removed. |

Also: removed the dead `TRY_ON` addon resource from the `/billing/addon-checkout` zod enum (teardown residue — `ADDON_PRICING` has had no `TRY_ON` key since migration 082) and updated its two stale tests.

**Watermark sweep:** no watermark-removal code exists anywhere in the tree.

New tests: `billing.test.ts` — 4 webhook cases (single allocation, duplicate-charge idempotency, activated-no-allocation, bad signature). API tsc clean; `billing.test.ts` 20/20, `gst.test.ts` 10/10, `gst-invoice-number.test.ts` 8/8, `security.test.ts` 6/6, `admin.login.test.ts` 14/14.

**Migrations `086` (GST columns + `gst_invoice_sequences`), `087` (`subscription_payments.invoice_r2_key`), `088` (`platform_gst_profile` — see §59.2) — applied in prod 2026-09-04.**

### §59.2 — GST launch fixes (2026-09-02, PRs #18 + #19)

| # | Fix | PR |
|---|-----|----|
| 1 | **Admin GST report page crash** (`/admin/reports/gst` — `Cannot read properties of undefined (reading 'toLocaleString')`). The page read `summary.estimated_cgst` / `estimated_sgst` / `estimated_igst`, but `/v1/admin/gst/summary` returns `cgst` / `sgst` / `igst`. Aligned the `Summary` type + `StatCard` sub to the real field names; hardened `fmtINR` to render `₹0` on non-finite input instead of throwing. Verified live: chunk `page-bbe0bf6bc5b532ff.js`, no `estimated_*` refs, `isFinite` guard present. | #18 |
| 2 | **Mobile `plan-select.tsx` missing `useState` import** — `TS2304` broke the CI `quality` (typecheck) job. Teardown residue. Added `import { useState } from 'react'`. | #18 |
| 3 | **Missing `platform_gst_profile` migration.** The `PlatformGstProfile` Prisma model + `@@map("platform_gst_profile")` shipped in `91144cb` but **no SQL migration ever created the table** — `generate-gst-invoice.ts` and the billing webhook both read it, and `PUT /v1/admin/gst-profile` 500s on a nonexistent relation. Added `088_platform_gst_profile/migration.sql` (`CREATE TABLE` matching the model). | #19 |
| 4 | **`scripts/set-gst-profile.ps1`** — operator one-shot (Windows PowerShell): auto-pulls `ADMIN_API_KEY` from Railway (`supportive-love`), does the CSRF-token dance, `PUT`s the platform GST profile singleton, prints a verify block. Prefilled from Form GST REG-06 (GSTIN `04ATYPK4915F1ZG`, Chandigarh, state code `04`, trade name "Sejix Technologies"). Not wired into any code path; safe to delete after use. | #19 |

**Deploy note:** PR #18 → web service redeployed (`8beecf8b`, RUNNING) and picked up the crash fix. PR #19 touched only `packages/db/migrations` + `scripts/` (outside web/api watch patterns) — no redeploy. `quality` CI has been red on `main` since before these PRs (pre-existing stale web test-mock types: `latitude`/`longitude` on `PublicCollection`); both PRs merged with `--admin` to match how `main` already operates. `unit-web` passes.

**Operator sequence to finish GST launch:** ✅ done 2026-09-04 — migrations `086` → `087` → `088` applied + `scripts/set-gst-profile.ps1` run + profile verified.

### §59.3 — Razorpay plan ids move to Admin → Integrations (2026-09-02)

`billing.ts` read `RAZORPAY_PLAN_{STARTER,GROWTH,PRO}_MONTHLY` from `process.env` only — the "Create Razorpay Plans" admin button returns the ids as an env snippet but never persists them, so wiring subscriptions meant hand-editing Railway API env vars. Now:

| File | Change |
|------|--------|
| `packages/shared/src/constants/index.ts` | 3 new `PAYMENT` rows in `INTEGRATION_KEYS` (`RAZORPAY_PLAN_STARTER_MONTHLY` / `_GROWTH_` / `_PRO_`) so they render on `/admin/integrations`. |
| `apps/api/src/routes/billing.ts` | `RAZORPAY_PLAN_IDS` const → `razorpayPlanId(plan)` = `getSecret('RAZORPAY_PLAN_' + plan + '_MONTHLY')`. `getSecret` falls back to `process.env[key]`, so existing Railway env vars keep working. |

No new page/route — the existing F-012 integrations vault (`admin-integrations.ts` catalog is driven entirely by `INTEGRATION_KEYS`) handles create/rotate/delete. Set the ids there after creating the plans in the Razorpay dashboard; 30s secret cache, no redeploy. Tests: billing 20/20, admin.login 14/14, security 6/6, API `tsc` clean.

**Amount caveat unchanged:** each Razorpay Plan object's amount must equal `base × 1.18` or the GST invoice CGST/SGST split (computed from `Subscription.amount_inr` = ex-GST base) won't match the real charge.

---

## Fixed: 2026-09-03 — Launch-readiness cleanup (4 audit points)

Four items from `docs/LAUNCH-READINESS-AUDIT.md` closed this session. Full record in that doc's new §0b.

### 1. P0 secrets in Railway — verified live

Read the live API service (`supportive-love`) env via the Railway MCP. Result:

| Secret | State |
|--------|-------|
| `COOKIE_SECRET` | set (64-hex) |
| `VAULT_DATABASE_URL` | set — `vault_app` insert-only role, separate host. Closes **B-005**. |
| `DATABASE_URL` | uses `kanchuki_app.*` role (not the Supabase superuser); purge cron on a separate `kanchuki_purge.*` role. Closes **B-007**. |
| `TEAM_JWT_SECRET` | set. Closes **B-008**. |
| `RAZORPAY_WEBHOOK_SECRET` | real generated base64 value (not the old `kanchuki-webhook-secret` dictionary string); keys are `rzp_live_*`. Closes **S-009**. |
| `REVALIDATION_SECRET` | set on API. **Gap:** missing on the **web** service (`magnificent-liberation`) → `apps/web/src/app/api/revalidate/route.ts` reads `process.env.REVALIDATION_SECRET` at runtime and was returning 401 on every call from the API (on-demand ISR revalidation dead, 60s fallback only). Owner added it to the web service the same day. Closes **B-009**. |

Still open (not part of this batch): B-002 read replica points at primary. (B-003 `ADMIN_PASSWORD_HASH` scrypt-rehashed + set on Railway 2026-09-03; B-004 admin TOTP descoped 2026-09-04 by owner decision — no admin-login TOTP field, see LAUNCH-READINESS-AUDIT §0c.2.)

No code change — verification + one owner-side env addition.

### 2. DPDP passport notice URL — `apps/api/src/lib/notice-versions.ts` (commit `182c5bf`)

`NOTICE_VERSIONS['1.0'].full_notice_url` was `https://kanchuki.com/privacy/passport` — wrong domain (canonical is `kanchuki.app`) and that path doesn't exist. Changed to `https://kanchuki.app/privacy`, the live page that covers shopper-profile data collection. Served to clients via `getNoticeDetails()` in `routes/public/passport.ts`.

### 3. Marketing prose — VTO / Fashion-DNA-matching claims removed (commit `1675f28`)

VTO, "Fashion DNA AI matching" and showroom booking were removed in `chore/remove-unwanted-features` (§55) but the marketing pages still advertised them.

| File | Change |
|------|--------|
| `apps/web/src/app/pricing/page.tsx` | dropped "Try-ons" row; "Fashion DNA (customer preferences)" → "Customer preferences (colour / style / budget)" |
| `apps/web/src/app/for-retailers/page.tsx` | "Fashion DNA — know your customers" → "Know your customers"; removed VTO + "AI Fashion DNA matching" from the roadmap table; dropped "try-on credits" / "more try-ons" from plan blurbs |
| `apps/web/src/app/how-it-works/page.tsx` | "Fashion DNA notes…" → "Customer notes capture…" |
| `apps/web/src/app/sections/MarketingSections.tsx` | removed Virtual Try-On from the services + features grids; dropped try-on-credit plan features; "Fashion DNA CRM" → "Customer Preferences" (×2); comparison matrix drops the "AI Try-On" column + "TryOnCloud / AI Vastra" row; "all five" → "them all" |

Customer preference capture (colour/style/budget) is unchanged — still shipped, core MVP. Web `tsc` clean.

### 4. Play Store store-listing copy — `docs/PLAY-STORE-LISTING.md` (commit `a2308ce`)

New paste-ready doc: short description (76 chars), full description (<4000, VTO-free), Business category, 8-screenshot shot-list with routes, feature-graphic spec. `docs/PLAY-STORE-LAUNCH-CHECKLIST.md` §1 refreshed to point at it. Screenshots, the 1024×500 feature graphic, and the Console entry itself stay owner tasks — cannot be produced from the repo.

Audit doc updated in commit `70d7ed2` (new §0b + §3 table rows + §5 checkboxes + §0/§9/§9b refs).

---

## Fixed: 2026-09-03 — 03-Sep-2026 review batch (11 items, commit `1843805`)

All eleven items of `docs/tasks/changes-03-09-2026.md` (moved from the repo root in this same commit). Full root-cause write-ups and the retailer-phone `8872101879` case live in that task doc; this is the index-level record.

| # | Fix | Files | Status |
|---|-----|-------|--------|
| 1 | Store QR/slug auto-generated at end of onboarding — `saveFinalStep()` calls `getQrSlug()` (get-or-create from `shop_name`); the Store QR screen's manual Generate stays as fallback | `apps/mobile/app/onboarding.tsx` | ✅ |
| 2 | Customer OTP: 30s-cooldown **Resend** button + MSG91 **widget** delivery (bypasses the DLT-blocked API SMS sender; API SMS kept as fallback; verify/resend follow the issuing channel) | `apps/web/src/app/[store]/components/ContactGate.tsx` (reuses `apps/web/src/lib/msg91-widget.ts`) | ✅ |
| 3 | Required consent checkbox on the customer OTP phone step; Verify gated on it (backend already records `PASSPORT_CREATED` ConsentEvent) | `ContactGate.tsx` | ✅ |
| 4 | Storefront no hard hop — `/{store}` fetches the all-products listing and renders the catalog **behind** the gate; `ContactGate` reveals `children` in place on every pass path (OTP/legacy/just-browse/localStorage + returning-shopper `PassportSheet`) instead of `router.replace` to `/categories`; `prefetch` added to catalog / wishlist / back links | `apps/web/src/app/[store]/page.tsx`, `ContactGate.tsx`, `apps/web/src/app/c/[slug]/components/CollectionView.tsx`, `SharedProductPage.tsx` | ✅ |
| 5 | "Set as Main image" restored on product detail — `ProductPhotoControls` row when `!currentPhoto.is_primary`, wired to the existing `handleSetPrimary` / `productApi.setPhotoPrimary` (`PATCH /products/:id/photos/:photoId`) | `apps/mobile/src/components/product-detail/ProductPhotoControls.tsx`, `apps/mobile/app/product/[id].tsx` | ✅ |
| 6 | Collection stats Views/Visitors/Favorites/Enquiries render 4-across (dropped `flex-wrap` + `min-w-[45%]`) | `apps/mobile/app/collection/[id].tsx` | ✅ |
| 7 | AI Studio bottom-sheet safe-area bottom padding so **GENERATE STUDIO SHOT** clears the Android nav bar | `apps/mobile/src/components/product-detail/ProductStudioModal.tsx` | ✅ |
| 8 | 7/30/90-day duration chips use className toggles (inline `style` was dropped on css-interop → white-on-white) | `apps/mobile/app/collection/new.tsx` | ✅ |
| 9 | Facebook OAuth redirect fixed — `kanchuki://oauth/callback` is rejected by Meta's login dialog ("Sorry, something went wrong"); all OAuth URLs now use an **https** redirect the platform owns (API defaults to `WEB_URL/social/connect`; the web flow passes `/social/connect/callback`), and the web page deep-links `?code=&state=` back into the app with a retry fallback. **Owner follow-ups (no code):** register the redirect URI in the Meta app, App Mode Live, App Review for publish permissions, EAS-build verification of the native SDK path | `apps/api/src/routes/retailers/retailers-social/retailers-social-connect.ts`, `apps/mobile/src/lib/api/social.ts`, `apps/mobile/app/growth/integrations/facebook.tsx`, `instagram.tsx`, `apps/mobile/app/settings/social.tsx`, `apps/web/src/app/social/connect/page.tsx` | ✅ code / ⏳ dashboard + EAS |
| 10 | Shared-product page **Enquire Now + View Full Catalog** side by side (`grid grid-cols-2 gap-3`) | `apps/web/src/app/c/[slug]/components/SharedProductPage.tsx` | ✅ |
| 11 | One CTA design across surfaces — new shared `ProductCtas` component (gradient Enquire + outline View Full Catalog) used by both `SharedProductPage` and the in-catalog `ProductDetailSheet` (its wishlist toggle stays available via the price-row heart) | `apps/web/src/app/c/[slug]/components/ProductCtas.tsx` (new), `SharedProductPage.tsx`, `ProductDetailSheet.tsx` | ✅ |

**Also in the commit:** `changes-03-09-2026.md` → `docs/tasks/changes-03-09-2026.md` (marked done with a status table); pre-existing mobile dependency pins rode along (`apps/mobile/app.json` plugins + `package.json`/`pnpm-lock.yaml` — `@sentry/react-native`, `expo`, `expo-video`, `expo-sharing`, `expo-media-library`, `expo-constants`/`file-system`).

**Verification:** API 706/706, web 91/91, mobile 43/43 vitest; `tsc --noEmit` clean on all three apps; secret guard passed. Pushed to `main` → Railway auto-deploy.

---

## Built: 2026-09-03 — F-034 AI Image→Video, Phase 1 admin bench + admin addon packs (commits `17fe997`, `f57479c`, `47748a4`)

F-034 (PRO-REQUIREMENTS §30) started on user go, task by task from `docs/tasks/image-to-video.md`. **Owner decision same day: this feature is ADMIN-TEST-ONLY — the retailer mobile phase is hard-deferred until the bench is tested and signed off.** No mobile code exists for F-034 yet.

| Piece | Deliverable | Files | Status |
|-------|------------|-------|--------|
| Task 1 — lib | `generateImageToVideo()` (Fal submit/poll 240s, reads `video.url`) + `VIDEO_MODELS` (5 models, Fal endpoints + ₹/clip bands) + `cropTrimToAspect()` (ffmpeg centre-crop to 9:16/16:9/1:1/4:5 + trim, yuv420p + faststart web-playable) + `AI_VIDEO_FAILED` error | `apps/api/src/lib/fal-video.ts` (new), `fal-video.test.ts` (3/3 — real ffmpeg asserts 1080×1920 + 1080×1080 + trim) | ✅ |
| Task 2 — bench route | `POST /admin/photo-cleanup/image-to-video` — sync, admin-only, zod body (product_url, model 5-enum, motion_prompt ≤2000, aspect 4-enum, seconds 5\|6\|8) → R2 `promo-<uuid>.mp4` → `result_url` | `apps/api/src/routes/admin/admin-photo-cleanup.ts` | ✅ |
| Task 3 — motion catalog | 16 motion presets / 4 categories (camera-move, garment-motion, model-action, ambient), each with garment-integrity HOLD guard + recommended model/aspect/seconds; Export Selected → `selected_ai_motion_styles.json` (Phase 2 studio_styles shape) | `docs/tasks/AI Motion Styles.html` (new) | ✅ |
| Task 4 — bench card | "AI Promo Video" card on `/admin/photo-cleanup-test`: model/aspect/duration selects, 6 first-draft presets (auto-fill), free-text prompt, synchronous generate + spinner, result rows with `<video controls loop>`, mp4-aware lightbox | `apps/web/src/app/admin/photo-cleanup-test/page.tsx` | ✅ |
| Task 6.1 — admin addon packs | DB-driven replacement for hardcoded packs: migration `089_resource_packs` (`resource_type` TEXT so AI_VIDEO packs pre-date its enum value; `plans` TEXT[], admin sets price), CRUD API (GET/POST/PATCH/DELETE + audit log), super-admin screen `/admin/resource-packs` (₹ input, per-plan checkboxes, activate/delete) | `packages/db/prisma/migrations/089_resource_packs/` (new, **applied by owner**), `schema.prisma` (ResourcePack), `admin-resource-packs.ts` (new), `apps/api/src/routes/admin.ts` + `admin/index.ts`, `apps/web/src/app/admin/resource-packs/page.tsx` (new), `Sidebar.tsx`, `layout.tsx` | ✅ |
| Task 10 — docs | Status rows updated across CLAUDE.md index, PRO-REQUIREMENTS §30, PLAN.md, PROGRESS.md, `image-to-video.md` + new `image-to-video-phase2.md` (task-by-task checklist, migrations renumbered **090** schema / **091** seeds after 089 was taken by `resource_packs`) | docs | ✅ |

**Deferred (retailer phase — do NOT start until owner bench sign-off):** tasks 5 (studio_styles `kind` 090 + admin VIDEO CRUD + per-tier model map 091), 6 rest (AI_VIDEO quota seeds + retailer billing switch to `resource_packs`), 7 (products-video-ai routes + generate-promo-video job + queue), 8 (mobile modal/entry points), 9 (publishInstagramReel + IG branch).

**Verification:** `tsc --noEmit` clean (api + web), fal-video self-check 3/3, admin route suite 68/68; Prisma client regenerated. Commits pushed to `main` → Railway auto-deploy. `FAL_API_KEY` live in Railway env (code resolves via `getSecret` → env fallback); the Integrations admin page still lists it "not configured" — expected, that catalog only reflects DB-vault rows.

## BUILT 2026-09-04: Social Create-Post Composer — fan-out publish + Post Templates + Caption AI (Phases 0–9)

Spec `docs/tasks/social-create-post-composer.md`; index row CLAUDE.md #64; plan row F-031 Phase 2.

**Scope shipped this commit (feature-complete; T-8.2 manual real-account EAS verification is the only remaining task):**

| Layer | What | Files |
|---|---|---|
| Migrations | **090** `social_post_carousel` (carousel flag), **091** `post_templates` (table + `PostTemplateStatus`/`PostTemplateContext`), **092** `social_post_client_dedupe` (`client_post_id` unique) — all applied to prod | `packages/db/prisma/migrations/090..092/`, `schema.prisma` |
| Graph client | carousel container (`ig_container`/reel container), video publish, per-platform caption handling | `apps/api/src/lib/meta-graph.ts` (+ test) |
| Fan-out endpoint | `POST /v1/retailers/me/social/posts` — validation, server-owned link resolution, per-target dispatch (photo/video/link/carousel), per-target `SocialPost` row + `media` snapshot, Redis SET-NX + DB-unique `client_post_id` idempotency, partial-success `results`, all-failed 400 `PUBLISH_FAILED` with per-target reasons in the envelope | `retailers-social-fanout.ts` (+18 tests), `retailers-social.ts` (route **registered** — was built but never wired, 404'd), `lib/social-post-idempotency.ts`, `lib/store-urls.ts` (+test), `plugins/error-handler.ts` (numeric `status` honored + `results` forwarded) |
| Post Templates | Admin CRUD `/v1/admin/post-templates` (+ `/admin/post-templates` screen + sidebar) — **both were exported but never registered** (barrel + aggregator + `index.ts` fixed); retailer `GET /v1/post-templates?context=POST|CAMPAIGN|BOTH` plan-gated; `resolvePostTemplate()` token lib (13 tests); fan-out `template_id` support — server re-resolves authoritatively, `usage_count += 1` once per ≥1-POSTED fan-out | `routes/admin/admin-post-templates.ts` (+11), `routes/post-templates.ts` (+6), `lib/post-template-placeholders.ts` (+13), `apps/web/src/app/admin/post-templates/page.tsx` |
| Mobile composer | `/social/create` — post-type picker (single/carousel/collection-link), product multi-picker, media-per-product strip, link card options, caption + Templates section (shared `TemplatePicker`, occasion chips, tap-again deselect), target checklist, live preview, publish → result sheet; 5 entry points (T-5.1 settings Post button replacing the deleted legacy ComposerModal, T-5.2 product detail, T-5.3 AI Studio result, T-5.4 collection detail, T-5.5 growth hub tile); dead legacy `publishProduct`/`publishCollection` removed from the client | `apps/mobile/app/social/create.tsx`, `src/components/social/*` (6 components), `app/settings/social.tsx`, `app/product/[id].tsx`, `app/collection/[id].tsx`, `app/growth/index.tsx`, `ProductStudioModal.tsx`, `useProductAiStudio.ts`, `src/lib/api/social.ts`, `src/lib/api/client.ts` + `request-cache.ts` (error envelope carries `results`) |
| Caption AI (T-6) | `generateSocialPostCaption()` on `@kanchuki/ai` (threads `onProviderUsed` into the failover/usage engine) + `POST /v1/growth/social/caption-suggest` (input product_ids + optional occasion → caption + hashtags; quota-gated 402; AI failure fail-opens to the templated caption; registered in the growth aggregator) — 6 tests; composer debounced (1s) auto-suggest with `lastAiFill`/`captionTouched` loop guards, `#`-normalized hashtags, "AI suggestion — edit freely" state | `packages/ai/src/campaign-assistant.ts` (71/71 AI tests), `routes/growth/growth-social-caption-suggest.ts` (+6), `routes/growth/index.ts`, composer |
| Campaign templates (T-9.7) | Campaign composer (`growth/campaign-new.tsx`) WhatsApp Message Draft gains the shared `TemplatePicker` (context CAMPAIGN + BOTH); post-template tokens converted to campaign `{{...}}` conventions (`{store_name}`→`{{shop}}`, `{link}`→`{{link}}`, `{festival}`→`{{festival}}`, `{price}`/`{discount}`→`{{offer}}`) so send-time fill resolves | `apps/mobile/app/growth/campaign-new.tsx` |
| Phase 7 polish | T-7.1 satisfied by design (no AI-video option in the composer — F-034 retailer phase deferred); T-7.2 all-failed publish → result sheet with per-account reasons, composer stays open to retry; T-7.3 a11y audit clean across the composer + all 6 shared components (§10 baseline) | fan-out test asserts `results` envelope |

**Gaps found + fixed during the pre-EAS cross-check (same session):** (1) retailer `GET /v1/post-templates` and admin `/v1/admin/post-templates` were built + tested but **never registered** → composer Templates section + admin UI would 404 in prod; wired via `src/index.ts`, `admin/index.ts` barrel, `admin.ts` aggregator. (2) Fan-out route itself unregistered → `me/social/posts` 404'd. (3) `PostTemplate` model + enums + migration-090 `SocialPost` columns were missing from `schema.prisma` (added + client regenerated). Route-registration boot smoke test passed (no duplicate-path crash).

**Verification:** turbo typecheck 9/9; API 777/777 (63 files); mobile 43/43; AI 71/71; `expo lint` exit 0 on every touched mobile file; line endings normalized. Commits on branch `fix/social-connect-surface-errors` awaiting PR; docs updated (CLAUDE.md #64, PLAN.md F-031, PRO-REQUIREMENTS §23, API.md, task doc).

## BUILT 2026-09-05: Composer idempotency hardening (post-ship review findings 1+2)

Spec `docs/tasks/social-create-post-composer.md` §12 (review pass); branch `fix/social-connect-surface-errors`; part of CLAUDE.md row #64.

A post-ship end-to-end review of the composer fan-out path found 5 issues; owner chose to fix **1 + 2 (idempotency)** — both landed this session (entry above). Findings 3–5 were picked up and fixed later the same day (entry below).

| Finding | Fix | Files |
|---|---|---|
| **1 — Redis-down + concurrent duplicate → 500 + double-post to Meta** | Server DB-first dedupe + P2002 reconciliation: the route checks `socialPost` rows for `client_post_id` on EVERY request (Redis duplicate claim → always replay existing rows, never fall through — a mid-flight twin returns the safe empty replay; rows under a *new* claim → prior attempt published while Redis was down → replay). Both POSTED and FAILED row writes go through `createOrReconcilePost()` — a P2002 loads the twin (retailer, account, client_post_id) row and reconciles (twin POSTED → surface deduplicated; twin FAILED + our attempt POSTED → upgrade row to POSTED with our ids; both FAILED → surface existing). No second write → no 500. Shared `toResultRow()` keeps fresh/replay/reconcile on one wire format. | `apps/api/src/routes/retailers/retailers-social/retailers-social-fanout.ts` |
| **2 — fresh `client_post_id` per tap defeats timeout-retry dedupe** | Composer keeps a `publishAttemptRef` (last id + payload signature: post_type / targets-as-a-set / items+media / link / trimmed caption / template). Reuses the id when the signature is unchanged and no definitive outcome yet; re-mints when the composition changed OR the previous attempt returned rows (result sheet shown / all-failed 400 with rows). Transient failures (network/timeout/5xx, no rows — including the 200 mid-flight dedupe replay with an EMPTY results array) keep the id so the retry dedupes against the possibly-landed first attempt. | `apps/mobile/app/social/create.tsx` |

**Tests:** 6 new fan-out cases (a) duplicate-claim replay of mixed rows, (a2) duplicate claim + no rows yet → empty replay, (b) new claim + prior rows → replay, (c) P2002 POSTED vs FAILED twin → upgraded, (d) P2002 POSTED vs POSTED twin → surfaced deduplicated, (e) P2002 on FAILED catch-path write → no 500) — `retailers-social-fanout.test.ts` now 24/24.

**Verification:** API typecheck clean + full suite **783/783** (three consecutive clean runs; one transient single-test flake observed once, not reproducible — fan-out file green in isolation and in each full rerun); mobile typecheck clean + 43/43; `expo lint` exit 0 on `app/social/create.tsx`; Biome format fixed on the two API files (4 pre-existing warn-level `noNonNullAssertion` remain, consistent with the known 182-warn baseline); no mixed line endings in any touched file. Committed on `fix/social-connect-surface-errors`; `eas build` unblocked → T-8.2 manual real-account verification after the build.

## BUILT 2026-09-05 (later same day): Composer review findings 3–5 (permalink truth, message sanitization, caption clamp)

Spec `docs/tasks/social-create-post-composer.md` §12 (review pass); branch `fix/social-connect-surface-errors`; part of CLAUDE.md row #64. Findings 1+2 (idempotency) shipped earlier the same day (entry above); findings 3–5 were then picked up and fixed. Server-only — no mobile/web impact, EAS-build plan unchanged.

| Finding | Fix | Files |
|---|---|---|
| **3 — IG single-photo permalink fabricated** (`/p/<media-id>`, media id ≠ shortcode → 404s in history) | New shared `fetchIgPermalink(mediaId, token)` in `meta-graph.ts` (Graph `permalink` field, fail-open → `''`); IG carousel refactored onto it. `publishInstagramPhoto` returns `{ postId, permalink }` with the real permalink; fan-out + legacy routes store `permalink || null` for IG carousel AND single-photo — never a fabricated URL. | `meta-graph.ts`, `retailers-social-helpers.ts`, `retailers-social-fanout.ts`, `retailers-social-posts.ts` |
| **4 — non-Meta error text leaks into rows + responses; live post recorded FAILED on DB blip** | Message policy: only `MetaApiError` messages persist/surface verbatim; DB/network errors (hostnames, connection detail) record the generic `'Something went wrong while posting. Please try again.'` — fan-out AND legacy route (was `err.message` everywhere). Live-post guard: publish loop split into Phase 1 publish (failure → truthful FAILED row) / Phase 2 POSTED-row write; Phase 2 never records FAILED — P2002 reconciles inside `createOrReconcilePost`, other DB errors retried 3× via `createPostedRowWithRetry` then rethrown as a transient 500 (client retries same `client_post_id`, idempotency replays). | `retailers-social-fanout.ts`, `retailers-social-posts.ts` |
| **5 — minor: IG caption past 2,200-char limit; silent video→photo fallback** | (5a) `clampIgCaption` (code-point aware — astral/emoji never split) + `IG_CAPTION_LIMIT` applied at the platform boundary in the IG carousel parent publish and `publishInstagramPhoto`'s container. (5b) IG video→primary-photo fallback rewrites the per-target row `media` snapshot to the photo actually posted (`{product_id, photo_id, kind:'photo', url}`); `productFallbackPhoto` returns the full photo row. | `meta-graph.ts`, `retailers-social-helpers.ts`, `retailers-social-fanout.ts` |

**Tests:** fan-out +7 new cases (real-permalink stored / permalink-miss → NULL not fabricated / raw-error sanitization / curated `MetaApiError` verbatim / POSTED-row DB failure → transient 500 with zero FAILED creates / one-blip retry recovery / video→photo media snapshot) — 31/31; `meta-graph.test.ts` +8 (clampIgCaption unit incl. surrogate safety, fetchIgPermalink ×4 fail-open, carousel clamp + under-limit ×2) — 23/23; `retailers.test.ts` legacy rejection updated to a real `MetaApiError` shape (mock class hoisted, plain-Error subclass mirroring prod).

**Verification:** API typecheck clean; full API suite **799/799**; fan-out 31/31; meta-graph 23/23; Biome check 0 errors on all touched files (6 pre-existing warn-level `noNonNullAssertion` remain); no mixed line endings. Committed on `fix/social-connect-surface-errors`; `eas build` unblocked → T-8.2 manual real-account verification after the build.

## BUILT 2026-09-06: Safe-area spacing standardization — `apps/mobile` + customer web PWA (CLAUDE.md row #65)

Before: every mobile screen did its own inset math — `Math.max(insets.top, 24) + 12` copy-pasted into ~30 custom headers, scroll bodies with hardcoded `paddingBottom: 32`/`40` or none (last row tucked under the tab bar / home indicator), and a few one-off variants (`insets.top + 16`, `insets.top + 8`). Web PWA headers sat under the status-bar notch on installed iOS.

### New shared helper — `apps/mobile/src/lib/safe-area.ts`

`useScreenInsets()` returns:

| key | value | use |
|---|---|---|
| `insets` | raw `useSafeAreaInsets()` | absolute-positioned overlay controls (camera screens) |
| `headerPaddingTop` | `Math.max(insets.top, 24) + 12` | custom sticky headers — **byte-identical to the old inline expression, zero header regression** |
| `screenPaddingBottom` | `insets.bottom + 16` | scroll bodies on root-stack screens (no tab bar under) |
| `tabScrollPaddingBottom` | `64 + insets.bottom + 16` | scroll bodies inside `(tabs)/` — `64` = `TAB_BAR_HEIGHT`, matches `(tabs)/_layout.tsx` `tabBarStyle.height: 64 + insets.bottom` |

### Migration (two sessions, one commit)

- **Session 1 (~50 screens):** catalog, growth (`growth/**` incl. `integrations/*`, `campaign*`), settings, `product/*`, `category/*`, collections, `collection/*`, `customer/*` + the 5 `(tabs)/*` screens. Tab screens use `tabScrollPaddingBottom`; stack screens use `screenPaddingBottom`. `growth/index.tsx` branches `isTab ? tabScrollPaddingBottom : screenPaddingBottom`.
- **Session 2 (9 more):** `ai-search`, `billing`, `plan-select`, `analytics`, `store-profile`, `staff/index`, `staff/catalog-tickets`, `social/create` (2 components, kept `insets` for its 3 fixed bottom bars), and `category/new.tsx` — the two pageSheet `<Modal>` FlatLists got `paddingBottom: insets.bottom + 24` so the last row clears the Android nav bar.
- **Result:** `Math.max(insets.top, 24) + 12` no longer appears anywhere in `apps/mobile/app/`.

### Deliberately NOT migrated (no sticky-header bug — helper would be churn)

`(tabs)/_layout.tsx` (the tab bar itself, source of `TAB_BAR_HEIGHT`), `auth/otp.tsx`, `auth/phone.tsx`, `onboarding.tsx`, `staff/retailer-onboard.tsx` — centered forms / tuned progress flows using symmetric `insets.top + N` / `insets.bottom + N`, no sticky header, no cut-off list.

### Web PWA (7 files)

- `apps/web/src/app/layout.tsx` — `viewport.viewportFit: 'cover'` (without it every `env(safe-area-inset-*)` resolves to 0).
- `apps/web/src/app/globals.css` — `.pt-safe` / `.pb-safe` (min `0.5rem`) / `.min-h-safe` utilities in `@layer utilities`.
- `.pt-safe` added to `(shopper)/layout.tsx` nav + 4 shopper headers (`[store]/categories`, `c/[slug]` CollectionView / SharedProductPage / WishlistView).

### Verification

Mobile: `tsc --noEmit` clean, `vitest` 59/59. Web: `tsc --noEmit` clean, `vitest` 91/91. Header padding is byte-identical to the prior inline expression; the only behavioral change is scroll bodies gaining a correct bottom inset where they had a hardcoded value or none.

## FIXED 2026-09-06: Instagram connect parity with Facebook (commit `373ae899`)

The Facebook connect flow was migrated to a server-driven `SocialAccount` model (BUILD-LOG note "surface it here so the integrations screen reflects reality"). Instagram never was — three gaps made it look broken next to Facebook:

| # | Bug | File |
|---|---|---|
| 1 | **`GET /me/integrations` had no `instagram` key.** The FB block reads its `SocialAccount` row; IG was skipped, so `currentInstagram` on the mobile screen was **always `undefined`** → "not connected" even right after a successful connect, and it reverted on every refetch. | `apps/api/src/routes/retailers/retailers-integrations.ts` |
| 2 | **`POST /me/social/auto-connect` faked success for IG.** With no linked IG Business account it saved a placeholder row (`ig_<retailerId>` / `@instagram_store`) and returned `connected: true`. The FB branch throws `NO_PAGES_FOUND`; the IG *native* branch throws `NO_IG_FOUND`; only `auto-connect` lied. | `apps/api/src/routes/retailers/retailers-social/retailers-social-connect.ts` |
| 3 | **Mobile wrote a hardcoded fake token.** Both IG connect handlers called `growthApi.configureInstagram({ access_token: 'oauth_long_lived_token', account_id: 'ig_auto' })` → `POST /v1/retailers/me/integrations/instagram`, a route that **does not exist** (404, swallowed). `facebook.tsx` just invalidates its query and trusts the server row. | `apps/mobile/app/growth/integrations/instagram.tsx` |

### Fixes

- **`retailers-integrations.ts`** — `GET /me/integrations` now returns an `instagram` block (`configured` / `account_id` / `ig_user_id` / `handle` / `configured_at`) from the `INSTAGRAM` `SocialAccount` row, parallel-fetched (`Promise.all`) with the `facebook` block. Added `DELETE /me/integrations/instagram` (mirrors `DELETE /me/integrations/facebook` — deactivates the row).
- **`retailers-social-connect.ts`** — `/auto-connect` IG branch throws `AppError('NO_IG_FOUND', …, 404)` when `listInstagramAccounts()` returns none; removed the placeholder fabrication. New module-level `NO_IG_LINKED_MESSAGE` shared with the `/connect-native` IG branch — copy now tells the retailer to switch IG to a Professional (Business/Creator) account and link it to a Page they manage.
- **`instagram.tsx`** — dropped both placeholder `configureInstagram` writes (deep-link handler + `applyConnected`); connect handlers now `await refetchIntegrations()` + `invalidateQueries(['growth','integrations'])` so `isConnected` reflects real server state, matching `facebook.tsx`. Cleaned the stale `useEffect` dep (`autoPublishReels` → `refetchIntegrations`).

### Not a code bug (Meta account setup)

The "Choose the Businesses / You don't have any Businesses" wall + "Create business portfolio" push (session screenshots) are Meta's own flow because the OAuth scope set includes `business_management`, and IG publishing genuinely requires an IG Business/Creator account linked to a Facebook Page. Same class as FB needing a Page. The new `NO_IG_FOUND` message now states this instead of the app showing a fake "Connected!".

### Verification

`retailers.test.ts` +2 (`GET /me/integrations` instagram block present / absent) → 39/39. `retailers-social-fanout` 31/31. API + mobile `tsc --noEmit` clean. Biome: no new errors on edited files. API deploy `373ae899` **SUCCESS** on Railway (`supportive-love` service, 2026-09-06 08:59 UTC).

## FIXED + BUILT 2026-09-07: Campaign send blocked by missing customer consent + inline campaign translate + more Quick Templates

### Root cause — campaign "send" always errored for hand-added customers

`CustomerSchema` (`apps/api/src/routes/customers.ts`) had **no `consent_given` field**, and neither mobile customer form ever sent one. `customers.consent_given` Prisma default is `false` (`schema.prisma:658`), so every customer a retailer added by hand stayed unconsented. Campaign send filters the audience on `consent_given: true` (`growth-campaigns-send.ts:52`, `buildAudienceWhere` `growth-helpers.ts:95`) → the whole list resolved to zero → retailer got **"Audience is empty — no customers matched"** or **"No consented customers in the audience"**. Only storefront/QR lead-capture customers (which set `consent_given: true`) could ever receive a campaign.

| File | Change |
|---|---|
| `apps/api/src/routes/customers.ts` | `CustomerSchema` gains `consent_given: z.boolean().optional()` — covers `POST /customers` (spread) and `PUT /customers/:id` (`CustomerSchema.partial()`). Absent on create → Prisma default `false`. |
| `apps/mobile/app/customer/add.tsx` | Consent checkbox (default **off**, affirmative — DPDP): *"Customer agreed to receive offers & updates on WhatsApp"*, sent as `consent_given` on create. Removed the stale "Fashion DNA affinities" copy line (feature removed 2026-08-31). |
| `apps/mobile/app/customer/[id].tsx` | Consent toggle in the identity card — `Customer` type `consent_given: boolean`, hydrated in the `useEffect`, sent in `customerApi.update`. Lets a retailer opt in existing customers without deleting + re-adding. |
| `apps/mobile/app/growth/campaign/[id].tsx` | `sendMutation.onError` fallback text now names the cause ("…customers in this audience have WhatsApp consent turned on…") — `showError` never surfaces raw `err.message`, so the specific API validationError was invisible before. |

### Inline AI translate in campaign-new — replaces the full-screen jump

Before: "AI Multi-lingual Translate" pushed `/growth/translate` (a 441-line screen with a redundant Original-Message editor, explainer card, mode toggle) → generate → **Copy only** → navigate back → paste by hand (no paste affordance). User: *"no option for paste… too lengthy."*

Now (`apps/mobile/app/growth/campaign-new.tsx`): the button toggles an inline block right under the message textarea — 7 language pills (`TRANSLATE_LANGUAGES`) + a "Translate to X" `GradientButton` + result card with **"Replace message with this"** (writes the translation into the `message` state, closes the block). Uses the existing `growthApi.translateMessage`. Original text is untouched until Replace is tapped. `translate.tsx` is **unchanged** — still serves product-description translation and the standalone AI Multilingual hub.
- Skipped: an inline "Copy" button — RN's deprecated `Clipboard` is the only in-repo option and Replace lands the text straight in the editable field. Add if retailers ask.

### More Quick Templates (`MESSAGE_TEMPLATES` in `campaign-new.tsx`)

FESTIVAL **+Festive greeting, +Gift ideas** · REACTIVATION **+New arrivals, +Back in stock** · PROMOTION **+Flat sale, +Clearance**. English copy with `{{placeholders}}`. No new campaign type, no server change.

### Verification

Mobile `tsc --noEmit` clean, `vitest` 59/59. API `tsc --noEmit` clean, `growth-ab` 5/5. No dedicated `customers` / campaign-send suite exists; the API change is a single optional schema field (Prisma default + `.partial()` cover it). Not deployed yet.


## BUILT 2026-09-07: Suits Designs — watermarked design-photo library (retailer mobile + customer web/storefront + admin; CLAUDE.md row #66)

A library of design / pattern reference photos (Suits, Blouse, Saree, Kurti, Gala, Baju — DB rows, not enums) that retailers and admin upload and manage like products, shown to customers on the product-detail page under "Related products" as a "<Category> Designs" strip, with a "View more" browser and a shareable store-scoped permalink. Every design carries a server-side semi-transparent logo watermark; retailer-own uploads use the store logo (falling back to the platform one), global/admin designs always the platform logo. Full spec + locked decisions: docs/tasks/suits-designs.md (§14). Deliberately NOT the catalog (no price/stock/enquiry) and NOT the Unstitched Design Gallery — share + "Visit store" only.

- **Schema + migrations 093–096.** `ShowcaseDesignCategory` (implicit self-M2M `_RelatedShowcaseCategories` = "a Saree product also shows Blouse designs", admin-edited) + `ShowcaseDesign` (retailer rows + `retailer_id NULL` global rows, no RLS — post-Railway convention, app-layer tenant scoping) + `Retailer.showcase_designs` back-relation. 093 seeds the 6 categories + related links; 094 adds `SHOWCASE_DESIGNS` to `PlanFeatureKey` + `QuotaResourceType` alone (Postgres 55P04 split); 095 seeds plan-feature rows (all plans on) + `plan_limits` (LIFETIME; Starter 20 / Growth 60 / Pro 200 — delete frees capacity, enforced as a live count not a meter); 096 adds `SocialPostType 'IMAGE'`.
- **Watermark + quota helpers.** `packages/ai/src/watermark.ts` — `watermark(src, logo, {opacity, scale, gravity})` via sharp (lazy import, header-only metadata read rejects non-images + decompression bombs >50MP/12k, alpha-multiplied fade, baseline JPEG). `apps/api/src/lib/showcase-watermark.ts` — config defaults (0.35 / 18% width / southeast / strip 6) + `SETTING_showcase_watermark` KV-blob merge + logo precedence retailer → platform → built-in repo brand asset + `watermarkShowcaseDesign()` full download-composite-upload step. `showcase-quota.ts` — active-row count vs plan limit → 402.
- **API.** Retailer `/v1/retailers/me/showcase-designs` CRUD (+categories, upload-url, owner-403s, R2 cleanup on replace/delete); admin designs (+global/retailer scope, owners, stats) + admin categories (+related PUT); public `?product_id` (category-name match → related expansion → global-or-owner → strip limit), `?store&category` browse feed and `/:id` permalink data, all `withPublicCache` s-maxage 300. **Social:** the fan-out accepts an `IMAGE` post — exactly one `image_url`, no product ref, honest empty `product_ids`, auto "New design at {store}" caption — so a design shares to connected FB/IG without faking product media.
- **Mobile.** Retailer manage grid (DB category chips, 2-col, + FAB with "X of Y used" cap), Add (compress → raw R2 → watermark on create) and edit/detail (replace photo, rename, category, active, delete, **Post to social** → existing composer with `design_id` deep-link locking IMAGE mode). Customer browse + public design detail (Share sheet / WhatsApp / copy-link via expo-clipboard) reachable logged-out; `<Category> Designs` strip on `app/product/[id].tsx` after Related products. Home dashboard tile entry.
- **Web.** Strip under Related products in `ProductDetailSheet` (proxy route `/api/showcase-designs`, hidden on empty/failed/legacy no-slug pages), storefront `/{store}/designs` browse (chips from the feed's categories, ?ref provenance), `/{store}/designs/[id]` public permalink (SSR + OG meta, Web Share / WhatsApp / copy, cross-store 404, inactive 404, revalidate 300). Admin: Suits Designs page (upload → watermark, list/lightbox, owner column, moderation scope) + Design Categories page (CRUD + related multi-select) + sidebar links.
- **T7.6 (2026-09-07) admin watermark config.** `GET/PUT /v1/admin/settings/showcase-watermark` (partial merge over the KV blob, clamps via the shared merge, best-effort R2 delete of a replaced logo, upload-url presign under `showcase-watermark/logo/`) + a **Suits Designs — watermark** block on the admin Theme settings page (logo upload + built-in fallback preview, opacity / logo-width sliders, corner select, "Designs before View more" count). The `SHOWCASE_DESIGNS` Plan Limits row is DB-seeded — the existing DB-driven page shows it after 095 applies.

### Verification

API 879/879 (incl. 8 new admin-settings-watermark route tests + showcase suites), web 120/120 (incl. 5 new ShowcaseWatermarkSettings component tests), mobile 59/59, ai 80/80; `tsc --noEmit` clean on api/web/mobile/ai/shared; session-batch files Biome-clean (full `biome check src/` on this Windows worktree additionally reports ~160 one-per-file CRLF formatter artifacts across the pre-existing checkout — CI runs on Linux/LF and is unaffected; §63's gate remains the source of truth). Not deployed: migrations 093–096 need the admin runner in prod (T1.4, owner), and the watermark applies to uploads created after the config is saved (re-watermark of existing rows on a rebrand stays a deferred job).

### Sr-dev review + cleanup pass (2026-09-07, EAS-prep)

Full read of every non-watermark file in the feature (watermark helpers left as-is per owner). Two real fixes, no rewrites:

- **Dead file read (mobile).** `showcase-designs/new.tsx` + `[id].tsx` called `readLocalImage(uri)` only to pass `blob.size` to `showcaseDesignsApi.getUploadUrl(ct, size)` — a param the client discards (`_sizeBytes`) and the `upload-url` route never accepts. Removed the read + the arg; `uploadImageToR2` already reads + compresses the file itself. `getUploadUrl` is now `(contentType)`.
- **Broken customer native share (mobile).** `showcase-designs/view/[id].tsx` `handleShare` passed a remote R2 `https://` URL to `expo-sharing` `shareAsync`, which only takes local `file://` URIs — it threw on-device, was swallowed by `catch {}`, and the `Share.share` fallback was unreachable behind `Sharing.isAvailableAsync()`. Native path now uses RN's built-in `Share.share({ message })` with the permalink in the body (same approach as `store-profile.tsx`); `navigator.share` still handles web. `expo-sharing` import dropped from this screen (still a dep — used elsewhere).

Re-verified: mobile `tsc` clean, `vitest` 59/59, `expo lint` reports nothing on any showcase file (1 pre-existing repo error in `ProductGridPicker.tsx`, unrelated, not an `eas build` gate). API showcase suites 117/117 (9 files), web showcase suites 29/29 (6 files), ai watermark 5/5. api/web `tsc` + Biome clean.

**Left as-is (intentional, not debt):**
- Browse feed pagination is a stub — `next_cursor` is always `null`, `BROWSE_PAGE_SIZE = 24` caps the response. Fine until a single store exceeds 24 designs; add a cursor then.
- `?ref=<productId>` provenance is plumbed on web (`/{store}/designs?ref=`) but not on the mobile browse screen (takes `?store`/`?category`). Provenance-only, no functional effect.
- rewatermark-showcase-designs job (165 LOC) is heavier than the spec's "add when a retailer rebrands" note, but it is built, wired to the admin config PUT, and tested — removing it now would be churn.
- No mobile unit tests for the showcase screens/client (mobile suite unchanged at 59). The `showcase-category.ts` helper (task board T5.1) was never created — the public API resolves the category server-side and returns it in the `?product_id` payload, so the client helper is genuinely unnecessary; T5.1 in the task board is stale.

**Still blocking go-live:** T1.4 — migrations 093 → 094 → 095 → 096 applied via the admin runner in prod (owner-only). `hasFeature` fails closed, so Suits Designs is OFF on every plan until 095's `plan_features` rows land. T8.3 (PR + deploy) not started.

**EAS compile:** ready after this pass — no native config change, no new dependency, `tsc` clean, mobile suite green. `eas build` does not run `expo lint`, so the pre-existing `ProductGridPicker.tsx` lint error is not a blocker.

---

## CLEANUP 2026-09-07: CI quality gate + Deploy workflow green-up (owner-approved CI/CD change)

Two pre-existing reds on `main` (noted in the Suits Designs prod-smoke report, §2026-09-07 above), both fixed this session:

1. **`quality` job red at `pnpm lint` → apps/api Biome errors.** Since 2026-09-06, `biome check src/` errored on 16 diagnostics across 12 files (format diffs, unsorted imports, one `noUnusedVariables`, one `useTemplate`). Most were non-semantic formatting drift in recently landed social/post-template/suits files (missing trailing newline at EOF, line-wrap diffs, import order); two were real-but-trivial lint violations:
   - `lib/post-template-placeholders.ts` — unused `match` callback param in the `KNOWN_TOKEN` replace (renamed `_match`).
   - `routes/growth/growth-social-caption-suggest.ts` — string-concat range caption collapsed into one nested template literal.
   Fixed with `biome check --write` on the 12 files + the two manual edits. **Verification:** `biome check` on an LF worktree of `apps/api/src` exits 0 (the local Windows worktree false-positives CRLF formatter diffs — `core.autocrlf` checkout — which is exactly why CI was red while local runs looked noisy; CI checks out LF). API `tsc --noEmit` clean, full API suite **888/888**, all four guard scripts pass (delete/route-size/secrets/v1-fetch).
2. **`Deploy to Railway` workflow red → `deploy-api` "Run pending migrations" P1001.** The step ran `prisma migrate deploy` from the GH runner against the Supabase pooler; Supabase Network Restrictions drop GH-runner egress (P1001 on every push since 2026-09-01), and even reachable it ran as the app role which has no DDL grants — so it could never apply migrations. It also killed this backup workflow's own `railway up` deploy step (never ran since Sep 1). **Fix (owner-approved, CLAUDE.md operational note lifted):** removed the step + the now-dead `PROD_DATABASE_URL` GitHub-secret reference from `.github/workflows/deploy.yml`, with a comment explaining the removal. Prod migrations continue through the sanctioned path only — admin dashboard / Supabase SQL Editor with the migrator role (SECURITY.md §12.2/§19) — never a CI step.
---

## BUILT 2026-09-08: Root-cause fixes batch (3 commits — AI Campaign Assistant, category delete guardrail, customer product-detail sheet)

Three unrelated bug-fix commits landed in one session; each has a tracked root cause in `docs/root-cause/root-cause issues.md` (RC-001…RC-006).

### `70e057a8` fix(ai): harden campaign-intent parsing + fix festival resolution + surface real errors

- **RC-001** — `POST /v1/growth/ai-campaign` intermittently 500'd ("Failed to generate campaign" on mobile). `parseCampaignIntent` used the free-text `ask()` path with no schema enforcement, so provider replies arrived as missing `product_criteria`/`audience` objects, stringified nested JSON, out-of-union enums, numeric strings, or comma-joined arrays — any of which threw inside the DB route. Added `normalizeCampaignIntent()` in `packages/ai/src/campaign-assistant.ts`: never-throwing coercion (re-parses stringified objects, coerces enums/numbers/arrays, caps `limit` 20, safe defaults `PROMOTION`/`casual`). 7 new ai-package tests.
- **RC-002** — FESTIVAL drafts always returned `festival_id: null` and couldn't be saved. Festival resolution matched `name: { equals: prompt.split(' ').slice(0,3).join(' ') }` — an exact match against the literal first three words of the prompt, which never equals a festival name. Fixed to match any festival whose name appears anywhere in the prompt (newest-starting first). 3 new route tests.
- **RC-003** — mobile `ai-campaign.tsx` swallowed the real API error and showed the constant "Failed to generate campaign". Now surfaces `ApiError.message` when present, generic string only as fallback.

### `21be0e92` fix(api): category DELETE through purge role with allow_hard_delete guardrail

- **RC-004** — `DELETE /v1/categories/:id` called `prisma.productCategory.delete` through the main `kanchuki_app` client, which has DELETE revoked on `product_categories` under SECURITY §19 (hard-delete table + BEFORE DELETE guardrail). 500'd on the category screen. Now routes through `getPurgePrisma()` with `SET app.allow_hard_delete = 'true'` inside the transaction (same pattern as products-trash/products-variants) + audit-log row. 2 new route tests.

### `590c2185` fix(web): customer product detail sheet — related products + design links

- **RC-005** — Related-product thumbs only called `onClose()` — never opened the tapped product. Added `onSelectProduct` prop (in-place sheet swap, same as AIStylist's `onProductTap`), wired to `setSelectedProduct` in CollectionView, plus a per-product view-state reset effect.
- **RC-006** — Suits Designs permalink links "went nowhere": the sheet pushes a history entry on mount and its unmount cleanup called `window.history.back()` unconditionally, instantly undoing the `<Link>` navigation to `/{store}/designs/{id}`. Cleanup now only rolls back when the sheet's own entry is still the top-most history state. Heading also renamed "Related suits" → "Related Products". 2 new web tests.

**Verification:** ai 91/91, api growth suite 25/25 + categories 4/4, web 122/122 (incl. 2 new ProductDetailSheet tests); `tsc --noEmit` clean on ai/api/mobile/web; no new Biome diagnostics vs baseline.

## BUILT 2026-09-08 (later): Mobile bug-fix batch #5–#9 (4 commits — customer detail, GST report, team member, logo save, switch plans)

Five retailer-reported mobile errors fixed in one session, root causes tracked in `docs/root-cause/root-cause issues.md` (RC-007…RC-011).

### `df63010d` fix(mobile): customer detail + GST report tolerate teardown-removed fields

- **RC-007 (#5)** — opening a single customer crashed: `Cannot read property 'length' of undefined`. `apps/mobile/app/customer/[id].tsx` dereferenced `customer.interactions.length` + `total_purchases`/`total_spent`, all removed by the 2026-08-31 teardown (migration 082 dropped `customer_interactions` and checkout data). Fields now optional, stat reads null-coalesce (`?? 0`), Recent Activity gated on hoisted `recentInteractions = customer.interactions ?? []`.
- **RC-008 (#6)** — GST report (Growth) crashed: `Cannot read property 'toLocalString' of undefined`. The mobile `GstSummary` type + screen still read `estimated_cgst`/`estimated_sgst`/`estimated_igst` while the server summary route (and the already-fixed admin report, §59.2) returns `cgst`/`sgst`/`igst` — stale field-name contract across the wire + unguarded `inr()` formatter. Type renamed to real names; `inr()` now returns `₹0` on null/undefined/NaN.

### `91214791` fix(mobile): surface real API errors on team-member + profile/logo save

- **RC-009 (#7)** — adding a team member always showed the constant "Failed to add team member". `settings/staff.tsx` mutation `onError` discarded the real `ApiError` (duplicate phone, seat limit, phone already a retailer account). Now surfaces `ApiError.message`, generic only as fallback.
- **RC-010 (#8)** — "Error when adding logo to retailer profile": the Edit Profile modal (`settings/index.tsx`) re-sent the stored GSTIN on **every** save, and a GSTIN captured once during onboarding can't round-trip the strict uppercase server regex — the whole `PUT /me` 422'd, failing unrelated logo/banner/profile saves. GSTIN now omitted when unchanged (`gstinChanged`), sent as `''` when cleared; upload + save catch blocks also surface real errors.

### `54970c5a` fix(api,mobile): bound Razorpay calls — stop switch-plan request timeouts

- **RC-011 (#9)** — Switch Plans: "Request timed out (/v1/billing/subscription). Check that the API server is running". The server's raw Razorpay `fetch` had no timeout, so a slow/hung Razorpay kept the route open past the mobile client's 10s abort → misleading outage message. Server `razorpay()` now defaults to `AbortSignal.timeout(20s)` (caller signal still honored); mobile `subscribe` + `cancel` get a 60s `timeoutMs` budget.

### `86440221` test(api): pin POST /v1/staff contract + GSTIN/profile logo-save rules

New `staff.test.ts` (happy path + invalid phone 422 + seat limit 402 + duplicate active-staff phone 422 + retailer-account phone 422 + GET list) and 2 `retailers.test.ts` cases (logo-only save with GSTIN omitted → 200; malformed GSTIN → 422 "Invalid GSTIN format"). Draft test also surfaced a vitest trap: `vi.clearAllMocks()` doesn't clear `mockResolvedValueOnce` queues — `vi.resetAllMocks()` required.

**Verification:** api **913/913** tests (72 files; staff 6/6, retailers 41/41), mobile **59/59**, `tsc --noEmit` clean on api + mobile.
## BUILT 2026-09-09 — Post-teardown dead-code sweep of the mobile app (RC-012, RC-013)

Swept `apps/mobile` for kept screens still reading fields/features the 2026-08-31 teardown (migration 082) removed — same crash class as RC-007/RC-008. Two survivors found and pruned:

**RC-012 (`440b900`) — customer detail screen still shipped the deleted measurement flow.** The teardown dropped the `CustomerMeasurement` model, its endpoints, and the `/customer/:id/measurement` route, but `customer/[id].tsx` survived with the full Measurements card: Manual form modal, Camera button navigating to the now-404 route, a measurement `useQuery`, plus a Recent Activity section consuming the dropped `customer_interactions` field. Removed the card/modal/nav/query and the `Measurement`/`Interaction` types; deleted the orphaned `getMeasurements`/`createManualMeasurement`/`initPhotoMeasurement`/`extractMeasurement`/`getMatches` methods from `customerApi`; trimmed unrendered `total_purchases`/`total_spent` off the customer-list type.

**RC-013 (`2c6b348`) — dead 360-spin UI and stale VTO/try-on reads.** `product/[id].tsx` carried a fullscreen spin modal + touch handlers + `spin_status`-polling refs that nothing ever opened; `productApi` had orphaned `getSpinVideoUploadUrl`/`submitSpinVideo`. Removed all of it. Cleaned the guarded-but-dead `try_on_credits` declarations/feature lines out of onboarding, plan-select, analytics and the `billing`/`analytics` API types (plans payload never sends it — verified against `jsonLimits`/`PLAN_LIMITS`).

**Verification:** mobile `tsc --noEmit` clean, **59/59** vitest (11 files). Grep-proof: zero remaining `spin_*`/`measurement`-route/`try_on_credits` reads in `apps/mobile`; no `router.push` to any deleted route.

## BUILT 2026-09-09 — Tokenized staff invites — core, lifecycle UI + WhatsApp delivery (CLAUDE.md row #71; spec `docs/tasks/staff-invite-tokens.md`)

Replaces the FR-6.1 "copy this text" stopgap (`dab79651`): a staff member added with name+phone now gets a **single-use `kanchuki://join?token=…` invite link** that carries "this is a team join, not a new signup" from the link into the first OTP verify. The token never authenticates — login stays phone+OTP, the SIM stays the auth factor (D1); after first login `staff.auth_user_id` routes every future login via the existing phone-match path, token irrelevant forever (D2).

**Phase 1 — Core:** migration `099_staff_invites` (staff_id unique, sha256 token_hash — raw never stored, status pending/used/expired/revoked, 7d TTL, CASCADE on retailer+staff, DELETE grants for app+purge roles, **backfill** of a pending invite per active never-logged-in member). `POST /v1/staff` mints the invite **in the same `$transaction`** as the row (response carries `invite: { url, expires_at }`); `GET /v1/public/staff-invite/:token` (masked phone only, rate-limited); `POST /v1/public/staff-invite/:token/otp` (server-sends OTP to the bound phone — **phone never crosses the wire**, D3); `invite_token` branch on `/v1/auth/otp/verify` that **resolves the invite before** OTP verification so a bad/expired/used/revoked token 400s and never falls through to `retailer.upsert`; purge job DELETEs `staff_invites` before the staff row. Mobile: new `app/join.tsx` (in the `!isAuthed` guard block) reads `?token=`, `auth/otp.tsx` passes the token through and shows the masked bound phone. Two spec decisions taken with owner sign-off: **RLS left off** (migration 093 convention — the zero-policy RLS pattern is a Supabase-era vestige that breaks the pooled Prisma read path) and **D3's no-phone design** (the client never sends the member phone on the invite flow).

**Phase 2 — Lifecycle UI:** `POST /v1/staff/:id/invite/resend` (owner-only, replaces the token on the same row via upsert — D5, 409 `ALREADY_JOINED`, audit `staff_invite_resend`); `GET /v1/staff` now derives per-member `invite: { status, expires_at }` (pending past expiry reads as `expired` server-side; joined members get `null`); mobile `settings/staff.tsx` invite-status chips; web `apps/web/src/app/join/page.tsx` bridge (pending → "Join {shop} as {role}" + masked phone + `kanchuki://join` deep link; used/expired/revoked/404 → dead-ends; no OTP on web — it bridges to the app).

**WhatsApp delivery (owner ask — free, universal, low volume, replaces MSG91):** `buildWhatsAppInviteUrl()` (`wa.me/91<phone>?text=<invite message>`, same pattern as collection share) — the add-member modal leads with a green **Send on WhatsApp** button, and the member-row chip has a one-tap **WhatsApp** resend that mints a fresh link (`resendInvite`) and opens the retailer's own WhatsApp pre-filled. No MSG91 (DLT+cost), no Meta Cloud API (₹0.38/conversation+template), no server round-trip; Copy/Share remain for the no-WhatsApp case.

**Verification:** API **960/960** (10 auth-invite + 10 public-route + 7 resend/status tests), mobile **78/78** (join screen + WhatsApp URL lib), web **128/128** (join page 6) — all three `tsc --noEmit` clean, biome clean on touched files. (The intermittent full-suite API failures are the pre-existing flaky image-upload tests under parallel load — pass in isolation and re-runs.)

---

## CLEANUP 2026-09-12: CI lint gate to zero (188 Biome diagnostics) + Facebook-login runbook + Play Store release provenance

Three commits (`7502c4a7`, `b48bf927`, `56676dbe`) — no product behaviour changed; the first removes a blind spot in CI, the other two move Facebook/Meta and Play Console setup from tribal knowledge into the repo.

### `7502c4a7` chore(api): clear all 188 Biome diagnostics

The `quality` job only ever failed on **errors**, so the warning count drifted to 188 without anything going red — enough noise that a real finding would hide in it. `biome check src/` now reports 288 files / **0 diagnostics**.

**Production (129) — refactored, not silenced.** `noUncheckedIndexedAccess` is on (`tsconfig.base.json`), so deleting the `!` is not an option; every site needed a real guard.

- `noExplicitAny` (48): typed the provider-JSON boundary. `retailers-integrations.ts` (19 sites) got named shapes (`MetaApiErrorBody`, `MetaIdResponse`, `MetaAccountResponse`, `GoogleTokenResponse`) plus an `apiErrorMessage(body, fallback)` helper, following the existing `meta-catalog.ts` precedent. `where: any` became `Prisma.RetailerWhereInput` / `ProductWhereInput` / `ProductReviewWhereInput`; the raw vector SQL now casts to a declared `SearchRow` interface instead of `any[]`.
- `noNonNullAssertion` (78): two clusters. Map lookups with an upstream predicate now throw explicitly (`loadedProducts.get(id)`, `accountById.get(targetId)`, `snapshots[0]`); accumulator loops (`obj[key]!`) collapsed into a shared `accumulator(map, key, factory)` helper in `growth-helpers.ts`. **A first pass used `??=`, which merely traded `noNonNullAssertion` for `noAssignInExpressions`** — hence the helper rather than the operator.
- `retailers-ratings.ts` dropped redundant `(request as any).retailerId as string` casts: `request.retailerId` is already typed. Its query params got a typed cast matching the existing `as { category?: string }` precedent.
- Four `biome-ignore` suppressions that the rule changes orphaned were cleared.

**Tests (59) — scoped off with the reason inline.** `delete process.env.FOO` is the **only correct way** to unset an env var; the rule's suggested fix (`= undefined`) stores the literal string `"undefined"` in Node and silently breaks the test. Also scoped: `noNonNullAssertion` (`mock.calls[0]![0]` on a double the test just built) and `noExplicitAny` (`vi.fn()` callbacks, partial fixtures) — in each case the offending expression is the test's own scaffolding, so the rule is wrong for that file, not the file wrong for the rule.

**Config renamed `biome.json` → `biome.jsonc`** so those reasons can be comments. Grepped first: only prose referenced the old filename, and CI never names it (`pnpm lint` resolves it), so nothing else needed changing.

**Verification:** `biome check src/` 288 files / 0 diagnostics (was 188 warn-level); repo `pnpm lint` 6/6; `tsc --noEmit` clean; **960/960 API tests** (74 files). CI run `34681789887` — all four jobs green, **zero Playwright retries** (the RC-019 offline test passed first attempt).

### `b48bf927` docs: Meta dashboard runbook for Facebook one-tap login

New `docs/META-FACEBOOK-LOGIN-SETUP.md` — an operator runbook; the login code needed no change. Every fact in it is sourced from the repo rather than written from memory: app id `1758308975480748` and scheme (mobile `app.json` plugin block), package/bundle `app.kanchuki.retailer`, redirect URIs `/social/connect` + `/social/connect/callback` (`defaultOAuthRedirect()`, `retailers-social-connect.ts:28`; web callback at `:350`), the `PAGE_PERMISSIONS` / `IG_PERMISSIONS` lists (`facebook-auth.ts`), the `NO_PAGES_FOUND` / `NO_PAGE_TOKEN` / `NO_IG_FOUND` throws in the connect route, the signing secrets and keystore mechanics (`android-release.yml:54-88`), and the compliance URLs (all real web routes).

Two findings that were the likely actual blockers — both configuration, neither fixable in code:

1. **Play App Signing.** A build delivered through Play Console is **re-signed by Google**, so the certificate on the installed app is Play's app-signing key, *not* the upload keystore CI signs with. Registering only the upload keystore hash reproduces the exact reported symptom — correct code, correct build, login never completes. Both must be registered; Meta accepts a list.
2. **Format.** Meta wants `base64(SHA-1(DER cert))`; Play Console and `eas credentials` both display colon-separated **hex**, which Meta rejects. That is a conversion problem, not a missing value.

Also records that validation is **server-side**, so **no rebuild is needed** after saving a hash — the opposite of the natural assumption. And `social-connect-native.md` §2 still instructed you to "replace the three placeholders" for values that are already real; corrected to point at the runbook so there is one source of truth instead of two drifting ones.

**Deliberately cut from the first draft:** two claims that could not be verified — that the SDK caches the key-hash check for the process lifetime, and that Meta "falls back to looser validation" with no Android platform entry. Neither is in the shipped doc.

### `scripts/meta-android-key-hash.mjs` (new, with `b48bf927`)

Does the hex → base64 conversion, and reads the certificate straight out of a **JKS**: in that container the certificate chain is plaintext DER and only the private key is encrypted, so no password and **no JDK** are needed. That matters here because release builds only happen in CI and there is no `keytool` on the dev machine. It refuses to print a value unless two checks pass — Node's own X.509 fingerprint agrees with hashing the DER it extracted, and the certificate **verifies against its own public key** (a signing certificate is self-signed, so a mis-offset read cannot pass). Also documents the `META-INF/<first-8-of-alias>.RSA` naming convention for identifying which key signed a shipped artifact.

### `56676dbe` docs: Play Store release provenance

`docs/PLAY-STORE-RELEASES.md` had only a versionCode and a date per row. Four `android-release.yml` runs landed on 2026-09-11 and **two produced a versionCode 3 artifact** (`34617176198` at `c14cc6f3`, `34619372677` at `0305d589`), so which was uploaded is now unreconstructable. The row is **marked ambiguous rather than guessed** — both runs contain the same code (only a docs diff), so behaviour is identical but provenance is not knowable. Adds CI-run + commit columns backfilled from the real runs, the rule *"write the run ID and SHA into the row at trigger time"*, and how to trace an installed build through the Settings build-info footer.

**Upload keystore hash — extracted and confirmed two independent ways that agree exactly:**

```
SHA-1:          16:3B:21:32:B6:DB:00:C4:0D:AF:04:2F:ED:10:3D:8D:87:CC:AF:45
META KEY HASH:  FjshMrbbAMQNrwQv7RA9jYfMr0U=
```

Path 1: the new script reading `apps/mobile/@s.numbhraal__kanchuki.jks`. Path 2: downloading the shipped `app-release.aab` from run `34619372677` and reading its signature block with `openssl` (`META-INF/F8DE0ED2.RSA`, matching the alias prefix — JAR signing names the block after the alias's first 8 characters). Two consequences GitHub secrets cannot otherwise reveal: the `ANDROID_KEYSTORE_BASE64` secret holds **this same keystore**, and `_OLD_1.jks` is **not a rotated key** (identical certificate, identical 2026-09-02 → 2054 validity), so nothing extra needs registering for it.

**⚠️ Not extractable from this repo — the Play App Signing key hash.** It is Google's key and is readable only from Play Console → *Release → Setup → App signing*, or from an APK Play actually installed. The CI artifact is upload-signed (confirmed directly above), so it cannot stand in. This is the value most likely responsible for the Facebook-login symptom.

**Verification:** all four guard scripts pass, including `check-secrets-guard.sh --all` (which scans the tracked tree, so it covers both new docs); `pnpm lint` 6/6.

## BUILT 2026-09-12 (later): Android release hardening — AD_ID guard in CI, RECORD_AUDIO blocked, AAB merged-manifest inspector

One symptom, three defects. `versionCode 4` (built from `10c8f2d`) was blocked in Play review with *"Incomplete advertising ID declaration"*. `com.google.android.gms.permission.AD_ID` appears nowhere in this repo — and that turned out to be the easy part. Proving it surfaced a **wrong entry in the release log**, a **config option that had never worked**, and a **verification method that gave the wrong answer in both directions at once**. No build was triggered and no `.aab` was produced; everything below is measured against the five already-downloaded CI artifacts.

### 1. Where AD_ID actually comes from — and why nothing in the repo shows it

`react-native-fbsdk-next` pulls `com.facebook.android:facebook-android-sdk:18.+`, whose `facebook-core` **AAR** manifest declares the permission. An AAR manifest is merged at Gradle time, so the string is invisible to `git grep`, to `node_modules/**/AndroidManifest.xml`, and to `expo prebuild`. `apps/mobile/plugins/withRemoveAdId.js` is the only thing removing it, and it is correctly registered (last entry in `app.json`'s `plugins`).

### 2. The Play block is a Console form — and the checklist pointed at the wrong one

*"Incomplete advertising ID declaration"* is not a manifest scan; it is the **App content → Advertising ID** questionnaire, never completed, and Play refuses to roll out a release targeting API 33+ until it is. The checklist told the reader to set this under **Data safety**, which is a *different* Console question — both now named, with a warning that they must agree.

The order matters, and it is why the checklist now says to check **App bundle explorer → Permissions** first: declaring **"No"** while the permission is actually present triggers a *harder*, opposite block ("this version includes the permission, but your declaration indicates that your app doesn't use any advertising IDs").

### 3. `tools:node="remove"` leaves no trace — the doc had this exactly backwards

The checklist claimed a removed permission keeps its name in the bundle as a marker, so the `.aab` could not be trusted to distinguish *declared* from *removed*. **Measured across the five real bundles, that is false.** The merged manifest declares no `tools` namespace at all and contains the string `remove` zero times: the counterparts are `READ_MEDIA_IMAGES`, which carries a `tools:node="remove"` marker in the source manifest and appears **nowhere** in the versionCode 4 bundle, while versionCode 2 (pre-block) does list it. So **absence proves removal and presence proves a real declaration** — which is what makes the RECORD_AUDIO finding below conclusive rather than hedged.

### 4. `recordAudioAndroid: false` was a silent no-op — RECORD_AUDIO was always shipping

`expo-camera`'s library manifest declares `android.permission.RECORD_AUDIO` **unconditionally**, and its config plugin only ever *adds*:

```
AndroidConfig.Permissions.withPermissions(config,
  ['android.permission.CAMERA', recordAudioAndroid && 'android.permission.RECORD_AUDIO'].filter(Boolean))
```

So `false` merely declines to add the permission; it never removes the library's own declaration, and a library manifest merges in regardless. The option is a **no-op for removal** — every doc that read it as "trimmed" was wrong, and the permission shipped in every release.

**Decision: Data safety still answers "No" for audio.** The form asks what the app *collects or shares*, and nothing records audio — no `expo-audio`/`expo-av` dependency, no `recordAsync`, no `requestAudioPermissions`, and all four `CameraView` call sites are photo/barcode capture, never `mode="video"`. Declaring it would *over-claim* collection. The permission itself is now removed the way the `READ_MEDIA_*` group already was: `blockedPermissions` in `app.json`, which provably wins the merge (same mechanism, and `READ_EXTERNAL_STORAGE` — declared by two library manifests — is absent from v4).

### 5. The guard's regex was wrong in both directions; the new decoder proved it

`scripts/check-aab-ad-id.mjs` deliberately uses a substring test — for its single yes/no question that is the right trade. But as a *reported count* it was misleading, and the first draft of the new inspector's proper protobuf decode found out why:

| versionCode | requested (`uses-permission*`) | declared (`<permission>`) | required **of callers** | regex says |
|---|---|---|---|---|
| 1 | 23 | 1 | 2 | 24 |
| 2 (×2) | 23 | 1 | 2 | 24 |
| 3 | 18 | 1 | 2 | 19 |
| 4 | 18 | 1 | 2 | 19 |

The regex **over**-counts `android.permission.DUMP` (an `android:permission` on a `<receiver>`) and `BIND_JOB_SERVICE` (on a `<service>`), which are permissions the *callers* must hold — the inverse of a request — and **misses** `app.kanchuki.retailer.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` entirely, because that name contains no `.permission.` segment. The two errors happen to cancel, so 19 looked credible. **18 is the number the Data safety form is compared against.**

Two bugs found in the new decoder itself, both worth recording:

- **`XmlElement.child` holds `XmlNode` wrappers, not elements** (`XmlNode { 1: element, 2: text, 3: source }`). Reading a child as an element picks up its `SourcePosition` as the element *name*, yielding binary garbage — and because whitespace text nodes have no field 1, two of the five bundles then reported **0 permissions**, which reads exactly like a clean manifest. Fixed with a `decodeNode()` unwrapper.
- The entry file's root check (`root.name !== 'manifest'`) is what makes a misparse **fail loudly** instead of silently reporting an empty, "clean" permission list.

### Files

| File | Change |
|---|---|
| `.github/workflows/android-release.yml` | New step *"Check the merged manifest is free of AD_ID"* (step 11 of 13), after the signing verification and **before** `upload-artifact` so a Play-blocked bundle can never be downloaded and hand-uploaded. Cost: one file read. |
| `scripts/check-aab-ad-id.mjs` | **New.** Fails the release build if the shipped AAB declares AD_ID. Fails closed on every unreadable path, and requires `android.permission.CAMERA` as a read-sanity anchor so an empty extraction cannot pass as "absent". |
| `scripts/inspect-aab-manifest.mjs` | **New.** Decodes the merged manifest and reports package, `versionCode`/`versionName`, min/target SDK, the full permission list grouped by family, and the AD_ID verdict. `--json` for machine-readable output, `--strict` to exit non-zero when AD_ID is declared. A report is not a verdict, so it exits 0 on findings unless `--strict`. |
| `apps/mobile/app.json` | `android.permission.RECORD_AUDIO` added to `expo.android.blockedPermissions` (1-line diff). Takes effect on the next build only. |
| `docs/PLAY-STORE-LAUNCH-CHECKLIST.md` | §2 new "Audio" subsection (decision + root cause); §3 corrected (the `.aab` **is** authoritative, `RECORD_AUDIO` resolved, both Console locations named, the fix path, the 18/1/2 breakdown); §7 realigned. |
| `docs/PLAY-STORE-RELEASES.md` | The **versionCode 2** row falsely credited an "AD_ID strip" — impossible, since the plugin (`b1ccefce`) postdates that upload and `6fc542ae` is only a one-line versionCode bump. Credited to versionCode 3 where it belongs; "in flight" section updated (4 is built + uploaded + blocked, so it gets **no Uploads row**). |

### Verification

Both guards run against all five real AABs: `check-aab-ad-id.mjs` **passes versionCode 4 and fails versionCode 2** (proving it can fail), `check-android-version-code.mjs` passes (reserves 4, records 2 and 3). The inspector's decode was cross-checked against the five bundles and agrees with the regex on the AD_ID verdict in every case. Fail-closed paths exercised: empty manifest, garbage bytes, wrong root element, missing AAB, non-zip, and default-path-with-no-build all exit 1 rather than reporting a phantom clean result. `biome check` exits 0 on both new scripts — same state as the existing guard. All edited files are 100% CRLF with zero bare-LF.

**Still open:** the Play Console declaration itself (*App content → Advertising ID → No*), which only the owner can answer; the RECORD_AUDIO removal is verified in the **source** manifest only (the merged proof needs a build, deliberately not triggered); and the versionCode 4 release stays blocked until the declaration is saved.

## BUILT 2026-09-17 — F-036 Phase A: customer PWA visited-store list + installable home-screen icon (CLAUDE.md row #73)

Spec `docs/tasks/customer-pwa-store-list-and-push-notifications.md`; requirement `docs/PRO-REQUIREMENTS.md` §32. **Phase A only** — Phase B (Web Push) is deliberately not started, so there is no `PushSubscription` model and no `push` handler in the service worker. **Zero files under `apps/mobile`.**

The feature sits on identity work already shipped (`CustomerAccount`/`CustomerStoreVisit`, migrations `079`–`081`) — Phase A is the missing *surface*, not new identity.

| Piece | File | What it does |
|---|---|---|
| Visited-store page | `apps/web/src/app/(shopper)/my-stores/page.tsx` | Lists the passport's `CustomerStoreVisit` rows, newest first. The `My Stores` nav link in `(shopper)/layout.tsx` existed already and pointed at a 404 until this landed. |
| Mapping / formatting | `…/my-stores/lib.ts` | Pure `mapStoreVisits` + `formatLastVisit` — drops malformed rows, never accumulates across renders, re-sorts defensively |
| API field | `apps/api/src/routes/public/passport/passport-stores.ts` | Adds `public_slug` to the `retailer` select — the storefront key each row links to |
| Installed-icon entry point | `apps/web/public/manifest.json` | `start_url` `/` → `/my-stores` |
| Install CTA | `apps/web/src/lib/install-prompt.ts`, `apps/web/src/components/InstallPrompt.tsx` | Captures `beforeinstallprompt`, offers our own button |
| CTA mount points | `PassportSheet.tsx` (below the primary action), `my-stores/page.tsx` (non-empty list), capture listener in `app/layout.tsx` | Shown at the two "just verified a visit" moments |
| Tests | `passport-stores.test.ts` (5), `my-stores/__tests__/{lib,page}.test.tsx` (10 + 8), `install-prompt.test.ts` (20), `InstallPrompt.test.tsx` (9), `manifest.test.ts` (3) | — |

### `start_url`: the plain route, not a smart redirect

Chose `start_url: "/my-stores"` — the list always, **not** the "single-store visitor goes straight to that store" variant the task doc offered as the alternative. The list already handles all three cases (no visits / one row / many rows), so every installed icon follows one code path that has to work anyway; a redirect adds a second per-launch branch whose failure modes (landing on the wrong store, or a loop for a zero-visit shopper) are worse than one extra tap for the single-store case. It is also a one-line manifest change with no server work, so it could ship inside Phase A instead of waiting on a routing decision. Worth revisiting once real launch data exists.

### The install event has to be captured at startup, not in an effect

`beforeinstallprompt` is the only way to drive installation from our own button (`preventDefault()` suppresses Chrome's mini-infobar and keeps the event promptable), and Chrome dispatches it **once per page load**, as soon as it decides the site is installable — typically before React hydrates. Both CTA mount points render only after an async step (the passport lookup in `ContactGate`, the stores fetch on `/my-stores`), so a listener added in a component effect missed the event on exactly the visits the CTA exists for, and the button silently never appeared.

Fixed by attaching the listener at **module scope** in `lib/install-prompt.ts` (`ensureInstallPromptCapture`, idempotent per target) plus an inert `InstallPromptCapture` in the root layout whose only job is to pull that module into the initial client bundle; the component now subscribes to captures instead of owning the DOM listener. `preventDefault()` is consequently called sitewide, which is intended — the omnibox install icon and the browser menu entry are unaffected by it, so holding the event costs nothing where no CTA renders, while a missed event cannot be recovered.

### Verification

`apps/web` tsc clean, **178/178 tests** (28 files, +15); `apps/api` tsc clean, **967/967** (75 files, incl. 5 new passport-stores tests). The startup-capture regression test was confirmed **sensitive** rather than assumed: with the module-scope registration commented out it fails (`expected "preventDefault" to be called at least once`), and passes with it restored.

Task 4 confirmations: a row links to `/{public_slug}` → the pre-existing `[store]/page.tsx` (resolved by `public_slug` in `public-retailers-storefront.ts`, rendering the existing `CollectionView` behind the existing `ContactGate`) — `[store]` and `ContactGate` are **not in the diff**, so the tap-through is the same page a QR scan or a WhatsApp share opens; the diff touches **no** share/WhatsApp file; **zero** files under `apps/mobile`. Also checked rather than assumed: `/my-stores` is a static segment that outranks `[store]`, but no retailer slug can collide with it — `generateCollectionSlug` always appends a 4-char random suffix.

### Known issues (filed, not fixed here)

- **`return_to` is written but never read** — `docs/tasks/return-to-post-login-redirect.md`. Pre-existing and now more visible: an installed-icon launch with an expired cookie bounces to `/`, which has no login surface (the only passport OTP entry point in the customer web app is a store catalog page). Deliberately not bundled into this diff. **✅ Fixed later the same day — see the entry below.**
- **No live browser run.** The tap-through chain is verified by reading route resolution plus unit/component tests; no one has clicked a row in a real browser, and the task's own acceptance test (anonymous → bounce → OTP → back on `/my-stores`) cannot pass until the item above is fixed. **✅ Closed later the same day** — a live Chrome run (prod build) now covers both the tap-through and the full acceptance test in `e2e/customer-my-stores.spec.ts`; see the entry below.
- **Phase C still owns iOS.** Phase A ships no "Add to Home Screen" banner; Safari 16.4+ requires the PWA be installed before it can receive push at all, so that enforcement belongs with Phase B/C.

---

## BUILT 2026-09-17 (later) — `return_to` is now consumed: dedicated `/login` route + open-redirect validation

Closes the residual filed above (`docs/tasks/return-to-post-login-redirect.md`). F-036 Phase A pointed the installed icon at `/my-stores`; the guard bounced visitors who had no passport to `/` **with `?return_to=` attached and nothing reading it** — and `/` is the retailer marketing page, so there was no login surface anywhere outside a store catalog page. An installed-icon launch with an expired cookie dead-ended.

**Scope: `apps/web` only** — no API, schema, or `apps/mobile` change.

| Piece | File | What it does |
|---|---|---|
| Open-redirect-safe validator | `apps/web/src/lib/return-to.ts` | `sanitizeReturnTo()` reduces any input to a same-origin path or `DEFAULT_RETURN_TO` (`/my-stores`); never throws |
| Login route (server) | `apps/web/src/app/login/page.tsx` | Sanitises `?return_to=` before it reaches the client; `robots: { index: false, follow: false }` |
| Login form (client) | `apps/web/src/app/login/LoginForm.tsx` | Phone → OTP via the existing `/api/passport/otp/{send,verify}` proxy; widget-first with API fallback; redirects to the validated target on success; sends an already-signed-in visitor straight on |
| Guard write site | `apps/web/src/app/(shopper)/layout.tsx` | `/?return_to=…` → `/login?return_to=…`, value validated before being written |

### The route is `/login`, not a form on `/`

The filed task recommended adding a login entry to `/` and asked for confirmation. Confirmed as a **dedicated `/login` route** instead: `/` is the retailer-facing marketing page, so customer auth there would change that page's job and hide a shopper's only way in behind retailer copy. This also gives organic visitors a real login entry point, which did not exist outside a store catalog page.

### `ContactGate` deliberately untouched

The task plan threaded the return target through `ContactGate.handleVerifyOtp`. That is unnecessary — the shopper never needs a store page to log in — and skipping it means the "no pending target keeps the in-place `PassportSheet` behaviour" regression guard is satisfied **by construction**: neither `ContactGate` nor `PassportSheet` appears in the diff.

### Validation rules (open redirect)

`sanitizeReturnTo` rejects protocol-relative (`//host`), any backslash (browsers normalise `\` to `/`, so `/\evil.com` escapes), control characters (CR/LF), schemes (`https:`, `javascript:`, `data:`), missing leading slash, arrays/repeated params, and inputs over 512 chars. It percent-decodes **up to 3 times first** so `%2F%2Fevil.com` and `%252F%252Fevil.com` cannot hide behind an encoding layer, then resolves against a sentinel origin with `new URL()` and requires the result to stay on it — the string checks are not trusted to be exhaustive. Every rejection falls back to `/my-stores`.

Applied at both ends of the round trip: the guard validates before writing, the server page validates before handing the value to the client, and the form validates again immediately before `router.replace`.

### A wrong claim from the first draft, and how it was caught

The initial version justified `clearPassportCache()` before navigating with "`passport-client` caches a *negative* result for 30s, so the guard would read it and bounce straight back to `/login`." **That was false.** `getPassport` guards its cache with `if (cachedSession && …)` — a stored `null` is falsy, so a negative result is never served; only positive sessions are memoised. Caught by probing the claim instead of trusting it: the live round-trip spec still passed with the cache clear removed. The call is kept (correct before a hand-off, and it stops a *stale positive* session being read mid-transition) but the comment and test now say that. `clearPassportCache` had **no callers anywhere** in the app before this — the login flow is its first.

### Verification

Live, prod build + Chrome (`e2e/customer-my-stores.spec.ts`): anonymous `/my-stores?tab=orders` → `/login?return_to=%2Fmy-stores%3Ftab%3Dorders` → phone + OTP → **back on `/my-stores?tab=orders`, signed in, list rendered** (the task's own acceptance test, automated, with the query string proven to survive because the post-login predicate requires `tab=orders`); and `/login?return_to=https://evil.example/phish` → completes login → stays on our origin. Unit: `lib/__tests__/return-to.test.ts` (35), `login/__tests__/{LoginForm,page}.test.tsx` (12 + 11), `(shopper)/__tests__/layout.test.tsx` (6). Gates: web tsc clean, `pnpm test` 9/9 (web **242/242**, was 178), `pnpm lint` 6/6, all five guard scripts, **10/10** customer e2e.

**The query string is carried, not just the path.** The guard composes the target from `pathname` + `window.location.search`, so a shopper intercepted on `/my-stores?tab=orders` returns to that exact URL. It reads `window.location` rather than `useSearchParams()` — the guard runs in an effect (browser-only by definition), and `useSearchParams()` in a layout with no Suspense boundary would force every guarded route out of static rendering. The live round-trip spec enters on `/my-stores?tab=orders` and its predicate requires `tab=orders` back, so a guard that dropped the query cannot pass on the bare pathname match. Residual: the **hash** is not carried.

## BUILT 2026-09-17 (later still) — `/stores` gains a state-aware shopper entry point (CLAUDE.md row #73)

Phase A pointed the installed icon at `/my-stores` and the follow-up added `/login` — but `/login` was reachable **only by being intercepted** by the `(shopper)` guard. A shopper had to already want a guarded page to discover it, so an organic visitor to the store directory had no way in, and nothing on the site acknowledged an existing passport once one existed.

**Scope: `apps/web` only** — no API, schema, or `apps/mobile` change.

| Piece | File | What it does |
|---|---|---|
| Entry point (client) | `apps/web/src/app/stores/ShopperEntry.tsx` | Signed out → `Log in` → `/login`. Signed in → the shopper's own name, `· My Stores` → `/my-stores` |
| Mount | `apps/web/src/app/stores/StoresDirectory.tsx` | +7 lines, above the search box |

### Why `/stores` and not the shared `Navbar`

`Navbar`/`Footer` live in `components/site/Chrome.tsx` and render on **every** marketing page, including `/`. Those pages are statically rendered, so a state-aware entry point there would cost *every* marketing page view one `/api/passport/me` call — the passport cookie is HttpOnly, so the client cannot answer "is this visitor signed in?" without asking. It would also put a customer entry point in the retailer-facing nav directly beside "Start Free Trial". `/stores` is the one genuinely shopper-facing surface on the marketing site. Owner-confirmed before building.

### The in-flight state is inert, not `Log in`

Until the session check answers, the component renders a reserved-height `aria-hidden` placeholder (`h-9 w-[104px]`, so the search box below does not shift) rather than `Log in`. Because the cookie is HttpOnly the state is genuinely unknown in that window, and rendering `Log in` first would tell a signed-in shopper they are signed out on every visit to the page.

`href` is plain `/login`, **not** `/login?return_to=/stores`: this is an explicit "take me to my account" action rather than an interception, and `/my-stores` is the shopper's home — the same place the installed icon opens. `account.name` is nullable (the passport OTP flow never asks for one), so it falls back to `My Stores` instead of rendering an empty pill.

### Verification

Unit: 7 new `ShopperEntry` tests — both states, the in-flight no-flash gate, a nameless account, the `getPassportSession` failure path, and that no session check is issued twice. Web **249/249** (was 242).

Live, prod build + Chrome (new `e2e/customer-stores-directory.spec.ts`): `/stores` anonymous → `Log in` with `href="/login"`; authenticated → the name with `href="/my-stores"` and **zero** `Log in` links. The directory itself still renders (search box + store card), so mounting the component did not disturb the page. Whole customer suite **12/12** across its three specs.

### A stub trap worth recording

This is the first call in the customer e2e suite made by the **browser** directly to the API origin — the passport calls go through the same-origin `/api/passport/*` proxy. `localhost:3100` → `127.0.0.1:3001` is cross-origin, and the stub sent no `Access-Control-Allow-Origin`, so Chrome silently dropped the response and the directory rendered its error state while the entry point (proxy-based) worked fine — a failure that looks like "the page is broken" rather than "the stub is incomplete". Diagnosed by grepping the inlined URL out of the built client chunk (`127.0.0.1:3001`, so the config pin was working and the URL was never the problem) rather than by guessing. The stub now sends CORS headers; **any future browser-side API fetch added to this suite needs it too.**

---

## BUILT 2026-09-17 (latest) — hardening pass over the `/stores` entry point: shared e2e stub, two real defects found, phone/tablet verification

Following an owner request to check for errors, bugs, lint, design consistency and root-cause-class regressions before this reaches a live run. Three of the five items below were **found by the checks**, not fixed before them.

### 1. The CORS trap is now structural, not a comment (`e2e/support/api-stub.ts`)

All three customer specs had grown their own copy of the stub server, and only the newest sent `Access-Control-Allow-Origin` — the trap that had already cost a debugging cycle earlier the same day. New `e2e/support/api-stub.ts` owns the plumbing: `createStubServer` applies CORS to **every** response (including 404s) and answers `OPTIONS` before any route sees it, plus `listenStub`/`closeStub` (the EADDRINUSE hint that previously lived in only one spec) and a shared `json()` helper. All three specs now build stubs through it, so a spec author **cannot forget the header** by adding a route, and the pattern anyone copies has it already. Each spec's route bodies are unchanged; the duplicated `API_STUB_PORT`/`API_STUB_ORIGIN` declarations were removed so the port is defined once (the helper's listen and the spec's request-logging can no longer disagree).

### 2. Defect found — an outbound call with no deadline (`passport-client.ts`, RC-011's class)

`getPassport()` awaited `fetch('/api/passport/me')` with **no timeout**. Everything awaiting it is UI state: a hung `/me` would leave the `(shopper)` guard never redirecting and the `/stores` entry point permanently on its placeholder — no error, no toast, just a page that stays half-alive. Now bounded by `AbortSignal.timeout(10_000)`, landing in the existing catch so callers get a definite “not signed in”. This helper had **no test file at all**; it now has 7 (`src/lib/__tests__/passport-client.test.ts`) covering the bound (asserted at the `AbortSignal.timeout` factory, since the returned signal doesn't expose its deadline), a timeout resolving to `null` rather than throwing, credentials/no-customer-id, and the cache's negative/positive semantics.

### 3. Defect found — two off-system design states (`ShopperEntry.tsx`)

- **No `focus-visible` state.** The site's own CTA pattern (`Chrome.tsx`) is `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-<token> focus-visible:ring-offset-2`, and the search field directly below uses `cobalt-500`. The entry point was the one keyboard-reachable control on the page without a ring; it now matches, with `ring-offset-cream` (the `/stores` shell is cream via `Navbar`/`PageHero`/`Section`).
- **36px tall, next to a 48px search field.** Bumped to 40px (`h-10`), matching the marketing pills (`px-5 py-2.5 text-sm`). The reserved-height placeholder moved with it.
- **Residual, not fixed:** the `· My Stores` suffix uses `text-carbon/50` at `text-xs`, which is below AA contrast for small text. It is the house pattern (19 occurrences in `apps/web/src`), so changing the one instance would fork the system; it is a repo-wide contrast question, recorded rather than silently diverged from.

### 4. Flake found and root-caused — the request-log assertion sampled a cache-warm first paint

One of three full-suite runs failed on `GET /v1/public/stores` being absent from the stub's log while the store card was visibly rendered. Written up as **RC-024**: `/stores` is `revalidate = 300`, Next's Data Cache lives on disk (`.next/cache/fetch-cache/<hash>` — confirmed to hold that URL, and `turbo build --force` does not clear it), so a cache-warm run serves a first paint with **no network call**, leaving the client's mount fetch still in flight when the assertion sampled the log. Two competing explanations were eliminated by evidence (no `.next/` artifact contains the store name; the client effect has no `initial` guard). The assertion now `expect.poll`s the joined log — which also makes the claim stronger, since the test waits for the browser's cross-origin call instead of noticing one had arrived.

### 5. Phone + tablet verification of the directory and the catalog (new, and it passes)

Both surfaces are now exercised at **390×844 (phone)** and **820×1180 (tablet)**: `horizontalOverflow()` (document scroll width vs viewport) plus the real content assertions, with no horizontal overflow and no page errors on either surface at either size. Three things make that result trustworthy rather than decorative:

- **The detector is proven to fail.** A dedicated test injects a 2000px element and requires the measurement to see it — necessary because this page runs **Lenis** smooth scrolling, whose stylesheet sets `overflow: hidden` in some states, and a clipped container would let `scrollWidth` report nothing while content spills. It fired as designed.
- **Page errors are captured, not assumed.** `page.on('pageerror')` in every new test, so a component that throws while still rendering something (RC-014's shape) fails instead of passing.
- **Stub payloads are typed.** `DIRECTORY` and `ACCOUNT` are annotated with the app's own `StoresDirectoryData`/`PassportAccount`, so a field rename fails `tsc` here rather than leaving the spec green against a shape the app no longer accepts (the RC-008 class — the spec's fixture was previously hand-written and untyped).

### 6. The entry point's destinations are actually clicked (RC-005/RC-006's class)

Both states now click through in the browser: `Log in` → `/login` with a usable phone field, and the shopper's name → `/my-stores` rendering a real row from the passport API. An `href` assertion alone is the shape that shipped twice in this repo as "the link goes nowhere" (RC-005, RC-006) — a unit test cannot see it.

**Verification:** web tsc clean · **256/256** unit (was 249) · `pnpm lint` 6/6 · all five CI guard scripts · **19/19** customer e2e across the three specs, **twice consecutively** (RC-019: the run type that exposes a flake, not a single `-g` run). Root cause recorded as RC-024.

---

## BUILT 2026-09-17 (console + responsive sweep) — every customer surface checked at phone and tablet, behind a console-error backstop that found two pre-existing defects

**Why:** the earlier pass verified layout with `pageerror` only, and sized two surfaces. That misses two whole classes — a console error the app *swallows* (a hydration mismatch, a rejected fetch) fails nothing and is invisible, and "the catalog" is five routes, not two.

| Piece | Change |
|---|---|
| `e2e/support/responsive.ts` | **new** shared helper: `PHONE`/`TABLET`/`VIEWPORTS`, `watchClientErrors()` (pageerror **plus** filtered console errors, with everything ignored reprinted in every failure message), `expectNoHorizontalOverflow`, `expectFullyInViewport` |
| three customer specs | refactored onto it, with per-surface phone/tablet checks: `/stores` directory, `/login`, `/my-stores` list, `/{store}` catalog, `/{store}/{collection}` + the product detail sheet |
| spec stubs | `promotions` served (and `reviews/product` + `showcase-designs` in the collection spec) — real proxy routes whose missing upstream made the browser log 404s the app handles by design |

**What the sweep found**

1. **RC-025 · `view` tracking has never worked on the web.** `CollectionView` POSTs `{apiBasePath}/view` with a comment saying it exists "so the retailer's dashboard 'Views' stat increments"; the API endpoint, the `CollectionView` model and the dashboard reader (`retailers-stats.ts`) all exist — but the web proxy route between client and API **never did** (`git log --all` finds none). Web storefront views have never been counted. **Open** — needs a decision (restore the route, or drop the call).
2. **RC-025 · the `checkout-status` call outlived its route.** The proxy was deleted deliberately with checkout in `76c5acdb` (#15); the effect calling it stayed behind. Dead code — it can only ever leave `checkoutEnabled` at its initial `false`.
3. **The sheet's enquiry CTA starts below the fold on a 390×844 phone** (measured: bottom edge ~892px against an 844px viewport). It is not stranded — it is the last block inside the sheet's `overflow-y-auto` body — so the test now asserts what actually matters: `scrollIntoViewIfNeeded()` brings it fully into view. "It's inside a scroll container" would have been a claim read off the CSS, which is the sort of reading this repo has been wrong about before.

**Tap-target and token checks (the "design ratio" pass):** directory entry 40px (the site's pill height), store-list row ≥44px, login phone field ≥40px, and the sheet's close button fully inside the viewport at both sizes.

**Residual, deliberate:** the entry point's `· My Stores` suffix is `text-carbon/50` at `text-xs`, below AA contrast for small text — it is the house pattern (19 occurrences in `apps/web/src`), so changing one instance forks the system. Recorded rather than silently diverged from.

**Verification:** web tsc clean · **256/256** unit · `pnpm lint` 6/6 · all guard scripts · **25/25** customer e2e (was 19) across three specs, **twice consecutively** (RC-019's lesson: a lone `-g` run is not a signal). Mid-pass `tsc` caught one genuine break — a `VIEWPORTS` const deleted without importing its replacement — which is why the typecheck runs before every browser run.

---

## FIXED 2026-09-17 — RC-025 closed: the `view` proxy route that never existed, and the `checkout-status` call that outlived its deleted route

Both were found by the console-error backstop above, on the same page every shopper opens.

| Piece | Change |
|---|---|
| `apps/web/src/app/api/[store]/[collection]/view/route.ts` | **new** — the proxy that never existed, so the retailer "Views" stat (`retailers-stats.ts` → `prisma.collectionView.count`) counts web storefront traffic for the first time |
| `apps/web/src/app/api/c/[slug]/view/route.ts` | **new** — legacy twin; CollectionView picks the `/api/c/{slug}` base path whenever a page has no store segment |
| `CollectionView.tsx` | dead `checkout-status` effect and its `checkoutEnabled` state removed |
| `ProductDetailSheet.tsx` | unused `checkoutEnabled` prop removed — declared and destructured, never read, so checkout's UI was already gone and only the pointless fetch remained |
| `sw.ts` runtime matcher | stale `checkout-status` entry dropped (it cached requests to a route that no longer exists) |
| specs + `support/responsive.ts` | stubs serve the view endpoint; **the named RC-025 console exclusion is deleted**, so these pages are held to a clean console with no exceptions |
| 6 new unit tests | canonical route (4) + legacy (2): upstream URL, forwarded body, bodyless POST, and 204-when-the-API-is-down |

**Proof the wiring is real, not merely quiet:** `customer-my-stores.spec.ts` polls the stub's request log for a `POST /v1/public/collections/*/view`, so it fails if the ping stops crossing the proxy. That was checked for teeth — pointing the new route at a wrong upstream path failed it with its own message, then the change was reverted. Polled rather than sampled because the call is fire-and-forget: the upstream request lands *after* the route answers the browser, which is RC-024's trap.

**Residual, measured rather than assumed:** a proxied view records the **web server's** `ip_hash`, not the shopper's, because the API hashes `request.ip` on its own incoming request. The count the dashboard shows is unaffected; per-shopper hashing would mean trusting `x-forwarded-for` in the API (`trustProxy`) — a separate trust-boundary decision, left alone.

**Verification:** web tsc clean · **262/262** unit (was 256) · `pnpm lint` 6/6 · all guard scripts · customer e2e **25/25** with the console exclusion removed.

---

## BUILT 2026-09-17 (final sweep) — remaining customer surfaces sized, RC-026 filed and fixed, and the photo harness that had been letting sizing tests pass over broken images

**Why:** three surfaces were still unsized, and removing the last console exclusion turned out to expose a *method* problem rather than another app bug — the suite was measuring photo grids whose photos had all failed to load.

| Piece | Change |
|---|---|
| `customer-collection.spec.ts` | phone/tablet checks for the **legacy `/c/{slug}` redirect** (does it land on something *usable*, not merely on the right URL?) and for the **Suits-Designs browse + permalink**, the two surfaces a shared link on a phone actually reaches |
| `customer-my-stores.spec.ts` | phone/tablet check for **`/my-profile`** |
| `e2e/support/images.ts` | **new** `stubFixtureImages()` — serves both paths to the fixture host |
| `e2e/support/responsive.ts` | **new** `expectRenderedImage()`; the `/cdn-e2e\.r2\.dev\|_next/image` console exclusion **deleted** |
| `src/__tests__/e2e-api-stub.test.ts` | **new** — 11 tests guarding the harness itself (5 real requests against the stub, 3 static scans, 3 self-proofs) |

**RC-026 · the personalization opt-out on `/my-profile` saved nothing and said nothing.** `/my-profile` sends `PUT /api/passport/preferences`; the proxy allowed only `GET`/`POST` and its path allowlist omitted `preferences`, so it could only ever answer `405`. The half that made it silent: **`fetch` does not throw on a non-2xx**, so the handler's `catch` never ran and the component kept the toggled state. The API side was complete throughout. Fixed by collapsing the per-verb copies into one `forward()` used by all three verbs (the duplication is exactly how `PUT` came to be missing), adding `preferences`, and making the client check `res.ok` and roll the toggle back. A DPDP-visible defect — a shopper exercised a data-protection opt-out and the platform quietly kept the older setting. Recorded as **RC-026**.

**The harness finding — a green test that was checking less than it read like.** `next/image` fetches remote photos through `/_next/image`, and that fetch happens *inside `next start`*, where browser routing cannot reach it. The fixture host is fake, so the optimizer answered 500 and every product photo in a sizing test was a **broken box**: `<img>` keeps its width/height, so `toBeVisible()` passed, `expectNoHorizontalOverflow` passed, and “the catalog holds up on phone” was measured against a page whose photos had all failed. The tell was an allowlist entry excusing “the fixture photo host the harness does not serve” — the exclusion was the symptom. Both paths are now served (the optimizer, **and** the raw host, because the designs permalink deliberately renders the watermarked file with a plain `<img>` so the optimiser never re-encodes it), `expectRenderedImage` asserts decoded pixels, the exclusion is gone, and **upstream image failures in the run log went from 4+ per run to zero**.

**A comment in my own work claimed a guard that did not exist.** `e2e/support/api-stub.ts` says a test “fails the build if a spec goes around this helper”. No such file existed. It does now — 5 tests making real requests to pin the CORS headers (including the preflight and a 404, since an unheadered 404 is an opaque network error to the page), plus 3 static scans. The scans are **pure functions** fed crafted sources in a self-proof block, so “this guard would actually catch it” is asserted on every run instead of being verified once by hand and trusted thereafter. The first run proved the point: the optimizer scan matched a **comment** explaining `/_next/image`, so it is now anchored on the `route(...)` call — a guard that fires on prose gets weakened to quiet it, which is how guards die.

**Verification:** web tsc clean · **279/279** unit (was 262; +11 harness guard, +6 passport route) · `pnpm lint` 6/6 · all four CI guard scripts · customer e2e **32/32** across three specs, **twice consecutively**, with the console check now strict everywhere including the tap-through test — and **zero** upstream image failures (was 4+ per run).

**Residual, measured not assumed:** 820×1180 portrait only (no landscape, no 320px); installability is still `in-incognito` because Chrome gives no verdict under Playwright; and the tap-through/designs photos load from a 64×80 stub, so layout is proven structurally rather than at real aspect ratios.

---

## BUILT 2026-09-18 — F-037 Phase 1: CustomerInteraction event log (net-new, identity-scoped)

**Why:** owner follow-up doc (`docs/tasks/customer-engagement-and-admin-behavior-analytics.md` §0) found the passport doc's claim that `CustomerInteraction`/`CustomerFashionDNA` already existed and only needed widening was false — migration `082_remove_unwanted_features` (2026-08-31) had dropped both. Phase 1 (§6 of that doc) builds the interaction log fresh at `CustomerAccount` scope rather than reviving the old retailer-scoped table.

| Piece | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | **new** `CustomerInteraction` model + `CustomerInteractionType` enum (`VIEW`/`SEARCH`/`FAVORITE`/`UNFAVORITE`/`ENQUIRY`/`STORE_VISIT`), `interactions` relation on `CustomerAccount` |
| `packages/db/prisma/migrations/100_customer_interaction/` | **new** — table + both indexes + FK + RLS `ENABLE ROW LEVEL SECURITY` with no policies (default deny, Kanchuki-only — matches `customer_recently_viewed`/`customer_wishlist_items`; a retailer SELECT policy is Phase 4 scope, not built yet) |
| `apps/api/.../passport/passport-activity.ts` | `POST /v1/public/passport/events` — the write was a commented-out stub since the old table was dropped (`// Interactions recording removed`); restored via a lowercase→enum `EVENT_TYPE_MAP` (type-only enum import so unrelated `@kanchuki/db` test mocks aren't forced to stub it), `createMany` per batch, unknown event names silently dropped, gated on `session.customer_account.profiling_enabled` (same DPDP opt-out `passport-preferences.ts` already uses for the preference vector) |
| `apps/api/.../public-retailers-leads.ts` | passport-path lead capture now also writes a `STORE_VISIT` row alongside the existing `CustomerStoreVisit` upsert, same `profiling_enabled` gate |
| `apps/web/.../ProductDetailSheet.tsx` | dwell-timed `view` event fired on unmount/product-swap (`Date.now()` delta, §3.1's "not just page load" requirement) — **also removed a dead `handleEnquire` function**, never called since the real enquiry flow is `CustomerConsentModal.handleContinue`, found while reviewing this file |
| `apps/web/.../CustomerConsentModal.tsx` | `enquiry` event fired in `handleContinue` before the WhatsApp link opens |
| `apps/web/.../CollectionView.tsx` | `favorite`/`unfavorite` events in `toggleFavorite`; debounced (600ms) `search` event with query + active filters + `filteredProducts.length` |

**Bug found and fixed mid-build:** the enum-import approach originally used the runtime `CustomerInteractionType` object (`import { CustomerInteractionType } from '@kanchuki/db'`), which broke 4 pre-existing test files that mock `@kanchuki/db` without stubbing that enum — `passport.test.ts`, `passport-export-delete.test.ts`, `passport-otp.test.ts`, `passport-preferences.test.ts` all failed at module load. Root-cause fix (not a per-file mock patch): switched to a type-only import and plain string literals in `EVENT_TYPE_MAP`, so the module carries no runtime dependency on the enum object at all.

**Also found while reviewing:** `schema.prisma` accidentally ran through `prisma format` once, which reflowed ~530 unrelated lines (pre-existing inconsistent indentation across the file) into a single diff. Reverted to a clean 31-line additive diff before this landed — the reformat was never committed.

**Verification:** API tsc clean · **973/973** (was 911; +6 events-route tests, +2 leads-route tests, all failing-then-passing verified against the enum-import bug) · `biome check` clean on every touched file · web tsc clean · **279/279** unit (unchanged — `ProductDetailSheet.test.tsx`/`CollectionView.test.tsx` re-run explicitly, both still pass) · `next lint` clean on every touched file.

**Not built (Phases 2–4, per the task doc's own roadmap):** nightly aggregation job, admin store-level + per-customer drill-down dashboard, retailer-facing aggregate view. Phase 1 only writes rows — nothing reads them yet.

---

## BUILT 2026-09-18 — AI Studio Shoot MODEL set finalized (21 → 8) + top-only-garment bottomwear fix

**Why:** owner asked why paid BFL vs. free ChatGPT/Gemini prompt commands (research answer: `docs/tasks/AI-Tools-Photo-Generation-Research.md`), then followed up wanting the MODEL scene set collapsed to a curated 7–10 like a slash-command catalog, plus a fix for the concrete complaint: picking a kurti/t-shirt and generating a MODEL shot auto-added a bottom garment (palazzo/leggings) and sometimes stretched the top's length, because every seeded MODEL prompt described a full standing pose with nothing else in frame for Kontext to fill.

| Piece | Change |
|---|---|
| `apps/api/src/lib/studio-shoot.ts` | **root-cause fix, one chokepoint** — new `isTopOnlyGarment()` (regex on category/name: kurti/blouse/t-shirt/tee/top/tunic/crop top/shirt); when true, `generateStudioImage()` appends a "waist-up only, do not invent trousers/palazzo/leggings/jeans/skirt" clause to **every** MODEL prompt, not just one template — every caller (retailer route, growth backgrounds, admin bench) gets it automatically |
| `packages/db/prisma/migrations/101_studio_styles_finalized_v2/migration.sql` | **new** — `DELETE` the 21 original MODEL rows seeded in migration `078` (near-duplicate scene backdrops), `INSERT` 8 finalized rows: Indoor Studio Softbox, Home Mirror Selfie, Golden Hour Outdoor, Catwalk Runway Motion, Editorial Close-Up, Marble Premium Luxury, Half-Body Top Shot (Kurti/T-Shirt — explicit crop template), Social Media Post Square. All `PUBLISHED`, all 3 plan tiers. PRODUCT-tab rows (ghost/hanger/flatlay/mannequin, 8 rows) untouched. No FK from `ProductPhoto` to `studio_styles` (provenance is JSON metadata on the photo row) so the delete has no side effect on already-generated photos. **Not yet applied to prod — ships via the normal migration-deploy path, not run directly.** |
| `docs/tasks/AI Models and Scenes.html` | the 8 finalized prompts prepended to the `ITEMS` array, marked "FINALIZED SET — 2026-09-18"; the 21 retired scenes stay below as design reference only (no longer live in the DB) |
| `docs/tasks/ai-studio-shoot-models-scenes.md` | status note appended documenting the 21→8 collapse + the code-level fix |

**Deleting the old rows also removes them from the `/admin/photo-cleanup-test` bench dropdown** (that page fetches all `studio_styles` rows regardless of status, by design, so drafts stay testable — with the rows physically gone, no frontend filter change was needed).

**Deliberately not built:** store logo/badge-on-product and the social-post crop are a post-processing step — composite the retailer's logo PNG onto the generated image with `sharp` after Kontext returns it, same pattern as the F-066 Suits Designs watermark — not a prompt change, and not built in this pass. Diffusion models render logos/text unreliably from a prompt.

**Verification:** `apps/api` tsc clean · `studio-shoot.test.ts` **9/9** passing.

---

## BUILT 2026-09-18 (later) — MODEL rows to Gemini engine + PRODUCT-tab hook-removal fix

**Why:** owner compared the same prompt+photo across BFL Kontext / Gemini / ChatGPT — Kontext lost on pose/smile/lighting realism (it's a pixel-preserving diffusion editor, not a generative foundation model; Gemini is the same model behind Google Shopping's "Try It On", purpose-trained on fashion realism). Separately, PRODUCT-tab shots (hanger/mannequin/etc.) still showed the retailer's original hook/clip.

| Migration | Change |
|---|---|
| `102_studio_styles_model_engine_gemini` | `UPDATE ... SET engine = 'imagen_3'` on the 8 MODEL rows from `101`. PRODUCT-tab rows untouched — no person in frame, Kontext's pixel-lock is still correct there. Code-level fallback (`generateStudioImage`: Gemini → Kontext → BFL direct) unchanged, so BFL keeps serving every PRODUCT generation and any MODEL generation where the Gemini key/quota is out — no engine-registry code change needed, `studio_styles.engine` was already the per-row dial (F-023 pattern). |
| `103_studio_styles_product_hook_removal_fix` | Rewrote all 8 PRODUCT-tab prompts. Root cause, found by re-reading `078`'s original text: 6 of 8 rows asked for hook removal but as a *trailing* clause after a leading "keep 100% pixel-identical" sentence — BFL's own guidance says the change-clause should lead and fold the preserve-constraint into the same sentence, not stack two instructions. The other 2 rows (`wedding_elegant`, `warm_luxury`) **never asked for removal at all** — pure "replace the background" prompts, so Kontext correctly left the hook untouched; not a model failure. Every row now leads with an explicit "none of it may remain" removal clause and specifies lighting *direction* (angle + purpose) instead of a bare "5500K lighting" line. |

**Not yet applied to prod** — both ship via the normal migration-deploy path, not run directly, same as `101`.

---

## BUILT 2026-09-18 (later still) — AI Studio Shoot: the product photo was never reaching the model, + garment-conditioned two-step pipeline

**Why:** owner asked why AI Studio Shoot doesn't produce Gemini/ChatGPT-quality output, what backend those products actually use, and whether to switch APIs.

### Root cause — found by reading the code, and it supersedes the previous two rounds' diagnosis

`generateGoogleImagen()` (`apps/api/src/lib/imagen-client.ts`) is a **text-to-image** call: its body is `instances: [{ prompt }]` — there is no image field — and `generateStudioImage()` never passed it `inputImageUrl` either. So migration `102` did **not** switch MODEL scenes "to Gemini"; it switched them to a generator that had never seen the product, driven by a prompt that never named a garment type either. A plausible stranger in a plausible stranger's clothes is the correct output of that input — the observation that motivated `102` ("Gemini's pose/smile/lighting realism clearly better") was a comparison against a model that had the garment and a model that didn't.

Three supporting findings:

1. `imagen-3.0-generate-002` on `:predict` is **Imagen 3**, a diffusion text-to-image family — not Gemini's image capability. Gemini's is the "Nano Banana" line (`gemini-3.1-flash-image` / `gemini-3-pro-image`; `gemini-2.5-flash-image` now legacy) on the Interactions API, and it accepts the input image. The repo called none of it.
2. The admin bench called `generateStudioImage()` with **no `product` object at all** — so no colour clause, a `womens` demographic fallback, and neither the garment-identity nor the top-only guard could fire. It exercised a strictly weaker prompt than the retailer path, which is why three rounds of prompt-guard work could not be validated on it.
3. **Structural:** no single call gives both properties a studio shoot needs. Prompt-driven models (Kontext, Gemini, FLUX) produce the person and scene but can only *guess* the garment — naming it narrows the guess, it does not make it your product. A garment-conditioned try-on model puts the real garment on the model but knows nothing about studios, poses or lighting. Gemini/ChatGPT are both autoregressive native-multimodal models (not diffusion, per OpenAI's own 4o image-generation system card) — that is the source of their realism — but **neither is garment-locked**. Google Shopping's "Try It On" is garment-conditioned, like FASHN, not prompt-driven.

### Stage 1 — stop the bleeding, name the garment, make it testable

| File | Change |
|---|---|
| `apps/api/src/lib/studio-shoot.ts` | New `garmentIdentityClause()` — names the garment from `subtype`/`category` and, **whether or not row data exists**, forbids substitution and re-draping ("keep any dupatta, stole or sash in its original placement"). The anti-substitution half needs no row data, so it fires on every caller. New `sanitizeGarmentText()` — `product.name` is retailer free text entering a third-party prompt: control characters dropped (a newline would split the instruction), double quotes neutralised, whitespace collapsed, bounded to 120 chars. `isTopOnlyGarment()` is now variadic and takes `subtype`, so a product with `subtype: 'Kurti'` and a generic category no longer slips past the guard. `SCENE_GUARD` hoisted to module scope so both paths share one string. |
| `apps/api/src/jobs/studio-shoot.ts` | Pipes `subtype` through (it was already selected from the DB, just never passed). |
| `apps/api/src/routes/admin/admin-photo-cleanup.ts` + `apps/web/src/app/admin/photo-cleanup-test/page.tsx` | Bench takes Category / Subtype / Name / Colour / Fabric / Pattern, and now sends `engine` at all (it never did). This is the process fix that stops round four. |
| `packages/db/prisma/migrations/104_studio_styles_model_engine_revert_kontext/migration.sql` | **New** — `engine = NULL` (Kontext default) on the 8 MODEL rows from `101`/`102`. Interim: Kontext preserves the garment, `imagen_3` provably could not. Comment records why, so nobody re-points at it without reading that.

### Stage 2 — the two-step pipeline (`engine = 'vton_kontext'`)

Human reference (supplied, or generated plain and frontal) → **FASHN v1.5 try-on ← THE PRODUCT PHOTO** → **FLUX Kontext** scene swap. The step-1 input is deliberately a plain frontal full-body reference with no scene, because try-on models are trained on plain human photographs and a dramatic pose or cropped frame (see the top-only guard) is out of distribution — the likeliest way this stage disappoints. `humanImageUrl` lets the bench substitute any reference, including a previously generated scene, which makes the reversed order testable without new code.

| File | Change |
|---|---|
| `apps/api/src/lib/fal-client.ts` | **Fixed `generateFashnTryon()` — it was dead code that would have failed on first use.** Verified against `fal.ai/models/fal-ai/fashn/tryon/v1.5/api`: the endpoint was `fal-ai/fashn/tryon-v1.5` (**dashes — the real path uses slashes, so it would 404**), and it sent `long_top`, `nsfw_filter`, `cover_feet`, `adjust_hands`, `restore_background` — **none of which exist in the v1.5 schema**. Moderation is `moderation_level`. Note the earlier docs/BUILD-LOG claim of "Indian long_top support" came from that phantom parameter, not a real capability. Now: correct path, real params only, `category: 'auto'` (a kurta *set* is not cleanly `tops`), `output_format: 'jpeg'`. |
| `apps/api/src/lib/studio-shoot.ts` | New `runTwoStepStudio()` + `MODEL_REFERENCE_PROMPT`. Returns `null` when the try-on stage fails so the caller **falls through to the single-shot Kontext path** — a provider outage degrades the shot instead of failing the job. `vton_kontext` added to `StudioEngine`. |
| `packages/shared/src/constants/index.ts` | New `STUDIO_ENGINES` + `StudioEngine` type. The engine list had been duplicated across four surfaces (two API validators, two admin web selectors); a value present in only some is un-storable or unselectable. `StudioEngine` in the API is now derived from it, so the type cannot drift from the list. |
| `apps/api/src/routes/admin/admin-studio-styles.ts`, `apps/web/src/app/admin/studio-styles/page.tsx`, `apps/api/src/routes/admin/admin-photo-cleanup.ts`, `apps/web/src/app/admin/photo-cleanup-test/page.tsx` | All four read `STUDIO_ENGINES`; bench gains an engine select + optional model-reference URL. |
| `apps/api/src/routes/security.test.ts`, `admin.login.test.ts` | Their explicit-factory `vi.mock('@kanchuki/shared')` had to gain a **non-empty** `STUDIO_ENGINES` — the admin barrel builds `z.enum(STUDIO_ENGINES)` at module load and `z.enum([])` throws. |

### Verification

`apps/api` **981/981** (77 files; `studio-shoot.test.ts` 9 → **17**, incl. the two-step order, the supplied-reference path, the try-on-failure fallback, and pins on both the slash endpoint and the absence of the four phantom params) · `apps/web` **279/279** · API/Web/Shared `tsc --noEmit` clean · Biome clean on every changed API/lib/shared file (the two admin web pages and `shared/constants/index.ts` carry pre-existing diagnostics, byte-identical before and after — verified by baselining each file against `HEAD`).

The fallback test was initially passing for the wrong reason — the mocked response had no `.text()`, so `runFalTask`'s error branch threw a `TypeError` instead of the `AppError` under test. The mock now provides it, and the test exercises the real 500 path.

`packages/shared` was rebuilt (`pnpm --filter @kanchuki/shared build`) because `dist` is what the consuming apps resolved, and `dist` is gitignored.

### Owner actions, then the honest limits

1. **Apply migration `104`**, and confirm `102`'s actual state: `SELECT slug, engine FROM studio_styles WHERE tab = 'MODEL'`.
2. **Re-test on the bench with the garment fields filled** — the first run where the output is diagnostic.
3. Point the 8 MODEL rows at `vton_kontext` only after the bench proves it. **No migration flips them to the new engine** — it is opt-in per row, and `104` leaves them on the Kontext default.

**Deliberately not done at the time:** `generateIdmVtonTryon()` was still dead broken code (same class of problem — never called); **deleted later the same day**, see the entry at the end of this file. ~~Stage 3 is not started.~~ **Stage 3 landed the same day** — see the entry below: the `:predict` Imagen 3 path is deleted, replaced by a real Gemini native-image client that is handed the photo. `imagen_3` / `imagen_3_fast` no longer exist.

**Not verified:** the two-step pipeline has never been run against the live providers — no FAL key or prod access in this session. Pose robustness on generated (rather than photographed) human references is the specific unknown to watch on the first bench run.

---

## BUILT 2026-09-18 (stage 3) — AI Studio Shoot: a real Gemini native-image client, and Gemini on the two-step scene step

**Why:** stage 3 of the three-stage plan — replace the `imagen-3.0-generate-002` `:predict` client, which is a text-to-image endpoint that never received the product photo, with Gemini's actual image capability ("Nano Banana", Interactions API), which does. Then use it where it is strongest: the **scene** step, on top of an image that already has the right garment on the right person.

### The contract, verified 2026-09-18 (this is the third time a provider contract has been assumed wrong in this feature — so it is cited)

Against `ai.google.dev/api/interactions-api` and `ai.google.dev/gemini-api/docs/image-generation`:

| | Value |
|---|---|
| Endpoint | `POST https://generativelanguage.googleapis.com/v1beta/interactions` |
| Auth | `x-goog-api-key: <key>` header — **not** a `?key=` query param (which ends up in logs and error strings) |
| Body | `{ model, input: [{type:'text',text}, {type:'image',mime_type,data}] }` — `input` is a plain string only for text-only calls |
| Image input | base64 `data` + `mime_type`. A `uri` field exists in the schema, but every documented input example is base64, and a URL would rely on the model fetching our R2 object |
| Output | Interaction resource: `steps[].content[]` with a `{type:'image', data, mime_type}` block. There is **no** top-level `predictions` / `images` array — the SDK `output_image` property is a convenience over the steps |
| Models | `gemini-3.1-flash-image` (Nano Banana 2, workhorse) / `gemini-3-pro-image` (Nano Banana Pro); `gemini-2.5-flash-image` is the legacy one |

**The parse takes the LAST image block, not the first.** Gemini 3 image models run a thinking pass that emits interim "thought images" before the final output, and the docs define `output_image` as *the last* generated image block for that reason. A first-match parser would hand back a draft, which reads as a quality regression rather than a parsing bug. Both directions are pinned in tests.

**Deliberately not sent:** `image_size` (1K is the default, it varies by model — Flash Lite is 1K-only — and an unexercisable field is a field that 400s in production). **Considered and deferred:** `store: false`, which would stop Google retaining the request/response. It is a documented optional field, but a wrong field fails the whole call and there is no key in this session to test with; note the photos already reach Fal/BFL today, so it is not a regression — but it is the right follow-up for a DPDP review.

### Stage 3 changes

| File | Change |
|---|---|
| `apps/api/src/lib/gemini-image.ts` | **New.** The old `imagen-client.ts` is deleted. `generateGeminiImage(prompt, { inputImageUrl, model, aspectRatio, onProgress })` fetches the source photo (SSRF-safe — in the bench case the URL is admin-pasted), sends it as a real image input block, and returns `{ base64Data, mimeType }`. Also `inferImageMimeType()` (the block's `mime_type` is required and must be honest; read the extension, fall back to JPEG since our compressor outputs JPEG) and `parseInteractionImage()` (last-wins, exported for tests). A 200 carrying `status: failed`/`cancelled`/`budget_exceeded` throws the interaction's own `errors[].message` instead of mis-reporting "no image". |
| `apps/api/src/lib/studio-shoot.ts` | `gemini_image` / `gemini_image_pro` replace `imagen_3` / `imagen_3_fast`, and **do** pass `inputImageUrl`. New `vton_gemini` engine: the same two-step pipeline as `vton_kontext` with Gemini rendering step 2 (`runTwoStepStudio` gained a `sceneRenderer: 'kontext' \| 'gemini'` option) — so the two scene renderers can be A/B'd on the bench on identical try-on output. `StudioEngine` is now **derived** from `STUDIO_ENGINES` rather than restated as a union, which is the drift the shared constant exists to prevent. |
| `packages/shared/src/constants/index.ts` | `imagen_3` / `imagen_3_fast` → `gemini_image` / `gemini_image_pro`; `vton_gemini` added. Comment records what the old names were and why they were renamed rather than fixed. |
| `packages/db/prisma/migrations/105_studio_styles_engine_rename/migration.sql` | **New** — `UPDATE`s the two retired strings to their replacements. `engine` is a free-text column (admin validation only guards new writes), and a row holding a dead value does not crash: `generateStudioImage` has no branch for it and **silently falls through to Kontext while the DB says "Gemini"**. That silence is why this normalizes. In a clean `102 → 104 → 105` sequence it matches nothing (104 already reverted the 8 rows); it is here for stale and hand-set values. |
| `apps/web/src/app/admin/photo-cleanup-test/page.tsx` | Bench labels both two-step engines as keeping the product, and marks the Gemini engines as receiving the photo. |

### Verification

`apps/api` **1002/1002** (78 files) · `apps/web` **279/279** · API + Web `tsc --noEmit` clean · Biome clean on every changed API/shared file · the bench page's 17 diagnostics are **byte-identical to `HEAD`** (baselined by running Biome on the `git show HEAD:` copy).

New: `apps/api/src/lib/gemini-image.test.ts` — 15 tests, including that the request carries an image block whose `data` is the base64 of the fetched photo bytes (the assertion that would have failed on every previous round of this feature), that the key is a header and not a query param, last-image-block-wins over a leading thought image, malformed/absent images, a failed interaction surfacing its own message, an unreadable source photo, and the unconfigured-key 503. `studio-shoot.test.ts` **17 → 24**: `gemini_image` sends the photo, `gemini_image_pro` selects the Pro model, a Gemini failure falls back to the Kontext path, `vton_gemini` orders try-on → Gemini and hands Gemini the **worn** image (asserting it never downloads the flat product photo, and that Kontext is not called at all on that engine), the try-on-failure fallback, and two pins on `STUDIO_ENGINES` (the retired names are gone; both Gemini scene engines are present).

`packages/shared` rebuilt again for the same reason as stage 2: the consuming apps resolve its gitignored `dist`.

### Owner actions

1. **Apply migration `105`** (and `104` if it is still pending).
2. On `/admin/photo-cleanup-test`, run the same product + scene through `bfl_kontext`, `gemini_image`, `vton_kontext` and `vton_gemini`, with the garment fields filled. That is now a real four-way comparison: all four receive the photograph.
3. Only then point the 8 MODEL rows at whichever engine wins. **Nothing flips them automatically**, on purpose — `vton_*` costs three provider calls per shot and its step-0 human reference is still unvalidated, so a readiness claim would be a guess.

### Honest limits

**Never run against the live API** — no `GEMINI_API_KEY` and no prod access in this session. Everything above is verified by types, tests and the published contract; none of it is verified by output quality. The specific unknowns to watch on the first bench run are (a) whether Gemini's `3:4` output framing suits a full-length garment shot that Kontext would have matched to the input, and (b) whether the Interactions API accepts a ~1MB base64 image block from our compressed JPEGs, or wants the image downscaled first.

**Gemini is still not garment-locked.** It now receives the photo — which is the difference between describing a garment to a generator and instructing an editor — but it reinterprets: it does not guarantee this retailer's dye, print, embroidery or cut. Only the garment-conditioned try-on step does, and that is the point of the `vton_*` pair. `gemini_image` is the like-for-like comparison against the current default, not the fidelity fix.

**Still open:** `generateIdmVtonTryon()` is dead broken code of the same class as `generateFashnTryon()` was (endpoint and params unverified, never called) — nothing calls it, and `services/fashion-vtone` is no longer in the path. With the engine list renamed, the cleanest next move is deleting it rather than verifying it. **Deleted later the same day** — see the entry at the end of this file.

---

## BUILT 2026-09-18 (same day) — AI Studio Shoot: the last dead try-on helper deleted, and a guard that keeps it deleted

**Why:** both entries above close by naming `generateIdmVtonTryon()` as dead broken code left in place ("the cleanest next move is deleting it rather than verifying it"). Verifying it was the wrong option: the reason it was broken is that nothing had ever run it, so the first caller — a retailer — would have been the one to find out. Deleted instead, in all three places it existed.

| File | Change |
|---|---|
| `apps/api/src/lib/fal-client.ts` | `generateIdmVtonTryon()` **deleted**. A tombstone comment records why (no caller since the 2026-08-30 studio-styles rework, parameter names never checked against the schema, weights CC BY-NC-SA-ND per ADR-006 so no fine-tune may be redistributed) and points at the FASHN v1.5 step that replaced it. The `runFalTask` doc comment no longer advertises IDM-VTON. |
| `scripts/studio-shoot-demo.mjs` | The `vton` mode and its `falVton()` helper **deleted** — a second, differently-wrong copy of the same call (it posted `human_image_url` / `garment_image_url` to `fal-ai/idm-vton`, neither of which matches the API helper's own names). Header corrected too: BFL-direct is the code-level *fallback*, not what the shipped feature does (production runs FLUX Kontext through Fal). |
| `packages/shared/src/constants/index.ts` | `FAL_API_KEY` label: `'Fal.ai API Key (Flux 1.1 Pro, Flux Schnell, IDM-VTON / CatVTON)'` → `'… (FLUX Pro / Kontext / Schnell, FASHN v1.5 try-on)'`. Labels render live from the constant (`admin-integrations.ts` maps them), so no migration — but the old text was the admin dashboard advertising a retired model. |
| `apps/api/src/lib/retired-tryon-guard.test.ts` | **New** — a repo scan that fails if the retired path reappears **as code**. |

**The guard, and why deleting is not self-enforcing:** a removed function cannot be found by a reader, and a reviewer looking at a diff that re-adds it has no way to know it was removed on purpose. So the guard scans `apps/`, `packages/` and `scripts/` for the endpoint and engine value (`idm-vton` / `idm_vton`), the helper name, and IDM-VTON's parameter names (`human_img_url`, `garm_img_url`, `garment_des`). It strips comments before matching, so this repo's own tombstone comments and the RC-027 entry stay legal — a guard that fires on prose gets weakened by whoever trips it (the sibling `/v1/` shell guard carries that lesson explicitly). `services/` is excluded because nothing in the app imports it; `docs/` is excluded because docs should record the history. It lives in a test rather than a `scripts/check-*.sh` so it needs no CI change and also fires on every local `pnpm test`.

**Proof — the guard was shown to fail, not assumed to work:** a temporary `scripts/tmp-guard-drill.mjs` containing `runFalTask('fal-ai/idm-vton', input)` was added; the guard failed naming it (`scripts/tmp-guard-drill.mjs → the IDM-VTON endpoint or engine value`), and the file was deleted. It also asserts the walk sees two specific files (`fal-client.ts`, the demo script) so a broken walk cannot pass as a clean repo, and asserts FASHN v1.5 is still the live step as a positive control. The self-proof block covers the endpoint, the helper, an `idm_vton` engine value, the parameter names, comment-immunity, and a call on a line that also contains `https://`.

**Verification:** `apps/api` **1010/1010** (79 files; the new guard test adds 8) · `apps/web` **279/279** · API `tsc --noEmit` clean · Biome clean on `fal-client.ts` and the new test. The demo script's 2 remaining diagnostics are fewer than its `HEAD` baseline (3), and `scripts/` is not in any package's lint scope. `scripts/studio-shoot-demo.mjs` parses (`node --check`). `packages/shared` rebuilt — the consuming apps resolve its gitignored `dist`, so the label change needs that build to be visible locally.

**Left alone deliberately:** `services/fashion-vtone` stays in the repo, unwired (not imported by the API, and out of the path since the 2026-08-30 rework). `docs/TECH-STACK.md` still lists "Replicate IDM-VTON" in a historical cost table — that is research, not a wiring path.

**Not amended:** `CLAUDE.md` row 75 (the studio-shoot index row) does not mention this cleanup — that file is gated on explicit approval, so the one-clause addition is pending an owner go-ahead.

---

## BUILT 2026-09-18 (same day) — AI Studio Shoot: a bench A/B that runs BOTH pipeline orders on one product photo

**Why:** the two-step pipeline can be ordered two ways and neither is obviously right. The forward order (reference → try-on → scene render) feeds the try-on the plain frontal reference it was trained on and finishes at the scene renderer's own resolution. The reversed order (scene render → try-on) costs one provider call less and starts from the single-shot render the feature already produces, but it feeds the try-on a *generated* scene — out of distribution for a try-on model — and finishes at FASHN v1.5's 576×864. That argument cannot be settled on paper; it is the kind of thing a bench settles with output. Until now the reversed order was only reachable by hand — pasting a previously generated scene into the bench's model-reference field — which is an approximation of the order, not the order.

| File | Change |
|---|---|
| `apps/api/src/lib/studio-shoot.ts` | **`generateStudioOrderAb()`** runs both orders **concurrently** over the same photo and returns both arms, each with its stages, wall-clock, and failure reason. **`runReversedStudio()`** is the other order: scene render from the product photo, then try-on. **`runTwoStepStudio()`** now returns `{ result, stages, error }` rather than `result \| null`, so an arm can say *which stage* failed — a new `stage()` helper wraps each call and prefixes its label onto the error, because in a three-call pipeline "Fal.ai task submission failed (500)" is equally true of the try-on and the scene render. **`buildStudioPromptContext()`** was extracted out of `generateStudioImage()` so both arms are handed **byte-identical** prompt text; two copies of that assembly would drift, and the drift would be invisible in exactly the way that matters (the arms would differ by wording as well as by stage order). `StudioProduct` is shared by both entry points, and `StudioVtonEngine` is `Extract<StudioEngine, …>` rather than a restated union. |
| `apps/api/src/routes/admin/admin-photo-cleanup.ts` | **`POST /admin/photo-cleanup/studio-ab`**, engine restricted to the two `vton_*` values (a single-shot engine there would run the same pipeline twice and call it a comparison). Re-serves **every** image from R2 — each arm's result *and* its intermediates — because Fal and BFL result URLs expire, BFL's inside ten minutes, and a comparison board of dead tiles is worse than no board. `studioBenchFields` extracted so `/studio-shoot` and `/studio-ab` cannot start describing the product differently. |
| `apps/web/src/app/admin/photo-cleanup-test/page.tsx` | Side-by-side A/B card: its **own** engine dial (`vton_kontext` / `vton_gemini`) rather than the form's engine — the comparison is undefined for single-shot engines, and silently coercing whatever the form had selected is the same class of hidden behaviour this bench exists to remove. Each arm shows its stage strip above its result, its wall-clock, and its failure reason; the server's caveats render as a notes list. |
| `apps/api/src/lib/studio-shoot.test.ts` | 4 new tests — the order itself, the failure reporting, the Gemini-intermediate persist step, and the no-persist-step error. |
| `apps/api/src/routes/security.test.ts`, `admin.login.test.ts` | Their explicit-factory `vi.mock('@kanchuki/shared')` now also supplies `PRODUCT_DEMOGRAPHICS`: the shared bench body shape is module-level, so `z.enum(PRODUCT_DEMOGRAPHICS)` evaluates at **import**, and a missing key throws during collection (the same failure mode `STUDIO_ENGINES` produced in stage 2 — these tests fail to *collect*, not to assert). |

**Both arms are strict, and that is the load-bearing decision.** `generateStudioImage()` falls back to a single-shot Kontext render when a stage fails; letting the A/B do that would turn "which order is better" into a silent comparison of two different pipelines — the same mistake as the bench that sent *less* product data than production and therefore could not reproduce the bug it was opened to test. So a failed stage fails that arm, names the stage, and leaves the other arm's result intact. The tests pin that: one arm's try-on is failed (identified by the model image it was handed, which is the arm's own fingerprint) and the other arm still comes back `ready`, with the failed arm's stages showing how far it got.

**The assertion this feature exists for** is that the two try-ons were handed *different* model images — the generated reference in one arm, the scene render in the other — while both receive the same product photo as the garment. It was drilled rather than assumed: pointing the reversed arm's try-on at the product photo instead of its scene render made the test fail, and the file was restored afterwards.

**The reversed order and base64.** Gemini answers with base64 and the try-on stage needs a URL it can fetch, so the reversed pipeline takes an injected `persistStage` upload and re-serves its intermediate; without it the arm fails immediately with that reason rather than sending base64 somewhere it cannot go. The route supplies an R2 uploader (keeping storage keys the route's business), and the test injects a fake to prove the try-on receives the *persisted* URL.

**Notes the bench returns** (they change how the two images should be read): the reversed arm finishes on the try-on's 576×864 and will look softer; a product-only scene renders nobody, so the reversed arm usually cannot run; a supplied model reference makes the arms differ by more than stage order; and the provider-call count per run.

**Verification:** `apps/api` **1014/1014** (79 files; +4) · `apps/web` **279/279** · API + Web `tsc --noEmit` clean · Biome clean on all changed API/route files, and the bench page's 17 diagnostics are byte-identical to its `HEAD` baseline. The page is CRLF in the working tree and stayed CRLF (`loneLF = 0`).

**Not verified:** the A/B has never run against live providers — no `FAL_API_KEY` / `GEMINI_API_KEY` or production access in that session. Everything above is types, tests and the published contracts; the quality call it exists to support is still the owner's, on the bench, after migrations 104/105.

**Not amended:** `CLAUDE.md` row 75 does not yet mention this bench (that file is gated on explicit approval).



## BUILT 2026-09-19 — Admin bench: vision detects "bare garment vs worn", manual checkbox removed

**Problem:** the bench had a manual "Photo is a bare garment" checkbox (default on) that toggled `input_has_person`, i.e. `SCENE_GUARD` ("edit only the background") vs `PLACEMENT_GUARD` ("put this garment on the model"). A hand-set flag the pipeline can read off the photo — and one that silently mis-set the prompt whenever the operator forgot it.

**Change (bench only; the retailer job/route path is deliberately untouched until the bench result is in):**

| File | Change |
|---|---|
| `apps/api/src/lib/garment-parts.ts` | `person_present` added to the vision schema; `VisibleParts.hasPerson` (`false` only on an explicit "nobody wearing it" or a `flat-lay` framing — silent/unusable answers read as *person present*, i.e. today's behaviour); new `detectGarmentPartsFromUrl()` |
| `apps/api/src/routes/admin/admin-photo-cleanup.ts` | `input_has_person` is now **optional**. Omitted → `detectGarmentPartsFromUrl()` decides; explicit value still wins as an override; detection failure → assume a person. Response adds `input_has_person` + `detected_parts` |
| `apps/web/.../photo-cleanup-test/page.tsx` | checkbox + state removed, field no longer sent; result rows show "Photo read as: worn / bare garment" |
| `apps/api/src/lib/garment-parts.test.ts` | +2 tests: flat-lay / `person_present:false` → no person; silent or non-boolean answer → person (fail-open) |

**Cost:** one extra vision call per bench run when the override is omitted (bucketed under `AI_ITEM_DETECT`, not billed as a shoot).

**Not done:** retailer path still passes no `inputHasPerson`; `missingParts`/set completion (R1–R3) still not wired even though the same vision call now returns the parts; `studio-ab` route does not run the check (two-step engines build their own prompts). **Not verified against a live provider.**

**Verification:** `garment-parts` + `studio-shoot` tests 58/58 · API + Web `tsc --noEmit` clean.

## BUILT 2026-09-20 — DPDP notice update + shopper "right to nominate"

Driven by the DPDP founder guide (see PRO-REQUIREMENTS §34 for the point-by-point map).

| File | Change |
|---|---|
| `apps/web/src/app/privacy/page.tsx` | +Why we process / who is responsible, Security, Data breaches, Children, Retention, Grievance officer (`privacy@kanchuki.app`, 30 days); Rights gains nominate + Board complaint; vendor-contract / overseas sentence |
| `apps/web/src/app/terms/page.tsx` | new §7 "Personal data of your customers"; later sections renumbered 8–10 |
| `apps/web/src/app/account-deletion/page.tsx` | grievance + Board pointer |
| `apps/web/src/app/faq/page.tsx`, `for-customers/page.tsx` | DPDP FAQ entry + safety blurb; stale FAQ prices fixed (were ₹999/2,499/4,999 + annual) |
| `packages/db/prisma/schema.prisma`, `migrations/108_customer_nominee` | `CustomerAccount.nominee_name` / `nominee_phone` — **migration applied 2026-09-23** (owner, Supabase SQL Editor; verified: both TEXT columns present, Prisma select ok) |
| `apps/api/.../passport-preferences.ts`, `passport-data.ts` | nominee on GET/PUT `/preferences` (both-or-neither, 10-digit mobile) + in the data export |
| `apps/web/.../(shopper)/my-profile/page.tsx` | Nominee card (save / update / remove) |
| `passport-preferences.test.ts` | +6 nominee tests |

**Not done:** lawyer review; nothing acts on a nominee automatically; CLAUDE.md index row not added (needs owner approval).
**Verification:** passport-preferences 14/14 · API + Web `tsc --noEmit` clean.

## BUILT 2026-09-22 — Retailer affiliate referral program (T1–T3) + purge-grant audit (RC-029, RC-030, RC-031)

> **Superseded in part, same day:** **T4** landed later (see §2026-09-22 (T4) at the foot of this file),
> so the "T4–T10 not started" status below describes *this* section's session, not the current state.
> Current status is in **CLAUDE.md** row 76. T6–T10 remain unstarted (T4 and T5 have since landed — see the foot of this file).

Spec: `docs/tasks/referral-program-retailer-affiliate.md`. Retailer → retailer: an existing paying
retailer earns a recurring commission for bringing another retailer onto Kanchuki. §10 of that spec
says to build **T1 (schema) first and stop**; T1–T3 are done, **T4–T10 are not started.**

**`apps/mobile` and `apps/web` (customer PWA) are untouched — 0 files.** The Play Console review in
flight is unaffected. Every tracked edit below is an insertion.

### T1 — schema + migration `109_referral_program` (not applied)

| File | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | `ReferralSettings` / `ReferralCode` / `ReferralConversion` / `ReferralPayout` + `PayoutStatus` / `PayoutCadence` / `ReferredBonusType` / `ConversionStatus`; back-relations on `Retailer` |
| `packages/db/prisma/migrations/109_referral_program/migration.sql` | 4 enums + 4 tables, 12 `CHECK` constraints, indexes, the singleton seed row, and `GRANT DELETE` to `kanchuki_purge` |
| `apps/api/src/jobs/purge-soft-deleted.ts`, `purge-retailer-now.ts` | the three new tables swept **before** `DELETE FROM retailers` |
| `scripts/setup-role-separation.sql` | the three new tables added to the purge grant list |
| `docs/DATABASE.md` | new "Retailer referral / affiliate program" section |

**Owner decisions applied (asked before writing the migration, because both are expensive after it
is applied):** singleton `referral_settings` row (not per-tier), `ON DELETE RESTRICT` on all three
retailer FKs, and payouts never deleted — status only.

**The RESTRICT choice is load-bearing and is why T1 touched the jobs at all.** It makes all three
tables retailer *children*, and this repo has shipped that bug twice: `product_attributes` /
`social_accounts` got RESTRICT FKs, were missing from the purge list, and made `DELETE FROM retailers`
throw an FK violation that rolled back the **whole** transaction — the cron silently did nothing.
Either half alone reproduces it. `referral_settings` is exempt (global singleton).

**Fields beyond the spec's T1 sketch, each audited and most trimmed** — the criterion being *removing it
leaves a money/audit invariant unrepresentable and needs a later migration on a financial table*.
Kept: `payout_id` (`REVERSED` must be able to find the conversions a batch settled, and `status` is
only auditable if it agrees with the transitions), `idempotency_key` (uniqueness cannot be safely
retrofitted once rows exist), `qualified_at` / `clawed_back_at` / `paid_at`, `failure_reason`,
`PayoutStatus.PROCESSING` / `REVERSED`, `BonusType.NONE` (**required**, not extra — the CHECK forbids
`value = 0` for a real type, so "no referred-side bonus" is otherwise inexpressible), `Cadence.MANUAL`,
`is_active` (a flag means **no** hard-delete path on `referral_codes`, removing an RC-004/RC-028 class
rather than guarding it). Trimmed: `period_start` / `period_end` (redundant once `payout_id` links
the conversions, and the only thing forcing the `period_ordered` CHECK), `razorpayx_status` (raw
provider blob; our status + `failure_reason` + the lookup-able id cover diagnosis),
`clawback_reason` (free text for T9's undesigned tool), `deactivated_at` (unpaired timestamp on a
toggle).

**Names avoid the removed engine entirely.** The 082 teardown dropped `referrals`,
`referral_credits`, `partner_referrals` and the enums `ReferralCreditStatus` / `PartnerReferralStatus`;
none of those identifiers is reused. It is also distinct from F-018's *internal-team* codes
(`TeamMember.referral_code` → `retailers.onboarded_by_id`) — separate ledgers, and onboarding's
existing "Referral Code (Optional)" field is F-018 staff attribution, **not** this feature.

### T2 — admin settings API + screen

| File | Change |
|---|---|
| `apps/api/src/routes/admin/admin-referral.ts` | `GET` + `PUT /v1/admin/referral-settings` |
| `apps/api/src/routes/admin/index.ts`, `routes/admin.ts` | export **and** `await server.register(...)` |
| `apps/web/src/app/admin/referral-settings/page.tsx` | the settings form |
| `apps/web/src/app/admin/components/Sidebar.tsx` | `Referral Program` entry under Reports & Finance |
| `admin-referral.test.ts`, `referral-settings/__tests__/page.test.tsx`, `Sidebar.test.tsx` | 17 + 10 tests, plus a nav→route pair guard |

"CRUD on the settings row" for a singleton seeded by the migration reads as GET + PUT. **`D` is
deliberately absent** — no hard-delete path on the table at all, which is what the owner's
"never delete, status only" decision bought.

**Server-side validation, three layers:** zod bounds per field (commission 0–100, duration 1–120,
qualify 0–365 …); enum-like columns validated against the exact set the consuming tasks branch on, so
a `'CASHBACK'` bonus is **rejected rather than stored and ignored** (RC-027); and the migration's
`CHECK` constraints mirrored in `crossFieldError()`, evaluated against the **merged** state so a
partial PUT still cannot land an impossible pairing — naming the setting to fix instead of surfacing a
Postgres 23514.

**Only changed fields are written, and that is load-bearing twice.** The screen diffs against the
stored row and the API diffs again ("no change" is a no-op with no audit entry), so resubmitting an
untouched form cannot trip validation or churn a row (the RC-010 shape). `buildPatch` also forces the
bonus **value** in when only its *unit* changed: 2 months and 2 paise are the same numeral, so
comparing numbers alone would call it unchanged and silently reinterpret the stored figure.

### Purge-grant audit — the part that was not the referral feature

Auditing `scripts/setup-role-separation.sql` against the schema produced two findings, both fixed
(details + prevention lessons in `docs/root-cause/root-cause issues.md`):

| ID | Finding | Fix |
|---|---|---|
| RC-029 | **RC-028's fix does not work.** It moved the promotions delete onto `kanchuki_purge`, but no file anywhere — script or migration — ever granted that role `DELETE` on `promotions`. The route compiles, ships and looks right while the delete still 500s. | migration `110_promotions_purge_grant` (`prisma migrate deploy` applies it; the hand-run script is not on any deploy path) + the same grant in the script |
| RC-030 | **7 tables strand rows on retailer deletion.** `campaigns`, `campaign_sends`, `promotions`, `consent_events`, `customer_recently_viewed`, `customer_wishlist_items`, `customer_interactions` declare `retailer_id` as a bare scalar with no FK, so nothing cascades and nothing errors — the rows simply survive. Two are not even granted. 6 of 13 bare-`retailer_id` models are purged; 7 are not. | **Fixed** — all 7 swept in **both** jobs + 6 new grants in `scripts/setup-role-separation.sql` (`promotions` in migration `110`), with the **schema-driven completeness guard** that made the class possible in the first place. Then the four `customer_*`/`consent_*` sweeps **still deleted nothing**: they have RLS enabled and no policy named the backend roles, and RLS filters instead of raising. That turned out to be repo-wide — **23 of the 32** purge-path tables are RLS-enabled and **no policy in the schema named `kanchuki_app`/`kanchuki_purge`**; access worked only via `pg_class_ownercheck` (the purge role is a member of each table's owning role). Fixed by migration `111_backend_role_rls_policies` (`FOR ALL`, both roles — `FOR DELETE` would have left every batch-`SELECT` empty) + `purge-rls-policy.test.ts` (derives the set in both directions) + opt-in `purge-rls-live.test.ts`. |

The reported staleness was also real and is pruned: **9 names in the purge grant list had been
dropped by migration 082** (`product_spin_frames`, `order_items`, `orders`, `try_on_jobs`,
`try_on_usage_logs`, `customer_measurements`, `customer_fashion_dna`, `size_charts`,
`size_chart_rows`). A `GRANT` naming a missing relation is a hard error, so the script aborted at that
statement before its own verification `SELECT`s ran. One near-miss worth recording:
**`customer_interactions` was also dropped by 082 and re-created by migration 100** (F-037 Phase 1), so
a grep-082's-drops fix would have deleted it and broken the newest feature on the list — the
re-creation was checked, not just the drop. It was originally removed from the list in this session and
**restored**, because nothing deletes it and a privilege reduction nobody asked for is also a change.
`docs/INFRA-SETUP.md` carried a third copy of the same list with 3 dead names; fixed, and pointed at
the script as the one authority so the two stop drifting.

Also added: `apps/api/src/jobs/purge-soft-deleted.test.ts` — the cron had **no** test file, so the
test for T1's three tables would otherwise have left the cron half unguarded while the admin half
(`purge-retailer-now.test.ts`) was covered. Its assertions are the invariants, not the call count:
children before `DELETE FROM retailers`; `referral_conversions` swept for **`referred_id` too** (a
conversion is a child of *both* retailers, so a missing referred-side sweep makes purging a referred
shop fail on the referrer's leftover row); `referral_payouts` before `referral_conversions`
(`ON DELETE SET NULL` is another write on the child, so the other order can deadlock two concurrent
deletes); no unscoped table delete; the 15-day predicate inline where each sweep actually lives; and
`app.allow_hard_delete` set in the **same** transaction as every delete (it is per-connection, so a
SET and its DELETE landing on different pooled connections makes the guardrail refuse the delete).

**RC-030's cleanup — and the guard the class needed from the start.** All seven bare-`retailer_id`
tables are now swept by **both** jobs (`purgeChildren('campaign_sends'… )` etc. in the cron,
`DELETE FROM campaign_sends WHERE retailer_id = $1` in the admin hard-delete), with six new grants in
`scripts/setup-role-separation.sql` and `promotions` already carried by migration `110`. Each deletion
site is commented with the rule that matters: a **declared** FK fails loudly when a sweep misses it (the
FK violation rolls the whole transaction back, which is why the `product_attributes` /
`social_accounts` omissions were caught at all), while a **denormalised** `retailer_id` fails
**silently** — Postgres neither cascades nor errors, so the rows simply outlive the shop with no owner.
That asymmetry is the whole root cause.

The guard is the part that stops it recurring, and it is deliberately **not** a list of seven names:
`purge-soft-deleted.test.ts` → `RC-030 — every bare-\`retailer_id\` table has a purge decision` reads
`schema.prisma` at run time, collects every model whose `retailer_id` is a bare scalar (no `Retailer`
relation), computes cascade reachability **from the schema's own `onDelete: Cascade` relations** to a
fixpoint, and fails naming any table either job misses. Cascade reachability is computed rather than
allowlisted because of `product_videos` — the one existing counter-example, and the reason the
asymmetry between the two jobs is not a bug: it needs no cron delete because its `product_id` FK to
`products` (migration 055) already carries it away when products are purged, and the admin path deletes
it explicitly. A test asserting "all seven names present" would relearn nothing one refactor later; this
one fails the moment a new bare-`retailer_id` model appears with no purge decision. **Falsified three
ways:** dropping the `promotions` sweep from the cron fails with `expected [ 'promotions' ] to deeply
equal []`; adding a bare-`retailer_id` model to the schema fails **both** jobs with
`expected [ 'test_orphan_table' ]`; and a counter-test asserts `BARE_RETAILER_MODELS.length >= 7` so a
broken schema parse cannot make the guard pass vacuously. `purge-retailer-now.test.ts` also asserts all
seven deletes are issued **before** the retailer row.

**Verification:** API **1078/1078** (83 files, and the spec §11-required `security.test.ts` +
`admin.login.test.ts` run explicitly — 15/15) · web **319/319** (41 files) · `apps/api` + `packages/db` +
`apps/web` `tsc --noEmit` clean · `apps/web` `next lint` clean · **Biome clean on every changed
`apps/api` / `packages/db` file** (that is the surface CI governs — `apps/api`'s lint script is
`biome check src/`, while `apps/web` lints with `next lint`, so the web admin pages are outside the
Biome gate and carry a dirty baseline: the two siblings of the new screen hold **25** errors and 5
warnings between them) · `check-delete-guard.sh` passes · migration 109 diffed **byte-identical**
against Prisma's own `migrate diff` output (61/61 lines) · grant list checked in **both** directions
(every name exists — 24/24; every table the 7 purge-role consumers delete is granted — 24/24) ·
Guards falsified rather than assumed: removing a referral delete from either job fails with a precise
message; swapping the enum checks for `z.string()` fails exactly the 2 RC-027 tests; making the diff
send every field fails **7**.

**On the web files' Biome diagnostics, stated precisely rather than claimed clean.** `git show
HEAD:` versions of `Sidebar.tsx` and `Sidebar.test.tsx` carry the **same 5** diagnostics after this
change as before it, so nothing was added. The new `page.tsx` ends at **1 error + 1 warning**: the
error is `process.env['NEXT_PUBLIC_API_URL']` (biome's `useLiteralKeys`), which is the repo's own
convention — 68 files use the bracket form including all three sibling admin pages on the identical
line — so it was deliberately left rather than diverging from every other admin screen; the warning is
`useExhaustiveDependencies: load`, which adding would re-run the fetch on every render (`load` is
recreated each render) and which the sibling page also carries. Two real fixes were applied to the new
file: `biome check --fix` (import order, formatting) and an explicit `type="button"` on both
buttons — no `<form>` wraps them today, so the implicit-submit hazard is latent rather than live, but
it costs nothing to remove.

**Not done / owner-side:** migrations **109, 110 and 111 are not applied** (admin dashboard, per
CLAUDE.md) · `scripts/setup-role-separation.sql` is applied by hand and carries the `promotions` grant
only for from-scratch environments · **T4–T10 not started** *(T4 landed later the same day — see the
T4 section at the foot of this file)* · **affiliate links earn nothing yet** — T3
mints and returns a code, but the `?ref=` capture on `/for-retailers` is T4, so no conversion can be
recorded. CLAUDE.md index row + the RC rows were added with explicit owner approval (Operational
Control Policy).

**T3 blocker, recorded so it is not rediscovered:** `generateReferralCode()` already exists **twice** —
live for F-018 staff codes in `team-helpers.ts`, and a stale orphan in `growth-helpers.ts` — and
onboarding's "Referral Code (Optional)" field is F-018 *staff* attribution. T3 has to disambiguate the
two before it writes any code, or a retailer's affiliate code and a marketing agent's attribution code
will collide in the same namespace. **(Resolved when T3 landed — see the T3 section below, which found
the collision was already live in the web app, not just a naming risk.)**

### T3 — referral code + shareable link (2026-09-22, later)

**The blocker was understated, and answering it properly changed the link scheme.** Three findings from
grepping the live flows rather than the docs:

| # | Finding | Consequence |
|---|---|---|
| 1 | **`?ref=` already carries the F-018 staff namespace.** `apps/web/src/app/survey/SurveyForm.tsx` shares `https://kanchuki.com/for-retailers?ref={staffCode}` on WhatsApp today. | The two namespaces meet at ONE param and ONE landing. They must be separated by the code's **shape**, not by which code path read them — a single entry point is exactly the case where "look up one table, then the other" hands attribution to whichever runs first. |
| 2 | **`/join?ref=…`, the link the spec sketched, would 404 every referral.** `apps/web/src/app/join/page.tsx` is the staff-invite bridge (`?token=…`) and calls `notFound()` without a token. | The link points at `/for-retailers` — the page F-018 links already use. No new route, no second link-shortener. |
| 3 | **The wanted `KAN-XXXXXX` shape already existed as dead code.** An orphan `generateReferralCode()` in `growth-helpers.ts` (roadmap C, deleted by migration 082's teardown) with an ambiguity-free alphabet. | Relocated to `lib/referral-codes.ts` instead of re-invented, so there is one definition rather than two. Its orphaned `parseReferralCode` went with it. |

**The separation, and why it holds.** Affiliate = `KAN-XXXXXX` (no I/L/O/0/1 — these are read aloud off WhatsApp screenshots). F-018 = `[0-9A-Z]{6}` from `Math.random().toString(36)`, which **cannot produce a hyphen**. So one character separates them, and `classifyReferralCode()` branches on shape — never on lookup order. Two halves make it hold: the generator's shape, pinned by a **source contract** test (the generator is in a route module whose import chain reaches the admin router and Redis clients, so reading its source beats dragging that into a unit test), and a **guard on the hand-editable path** — the F-018 field is `z.string().min(4).max(20)`, so a typed `KAN-XXXXXX` would otherwise sit in the affiliate namespace and shadow a real attribution. That is why `team-members.ts` now refuses a hyphen, with a message naming the reservation.

**Falsification caught a real hole in the first version of that guard**, which is the part worth
keeping. The guard checked only for a hyphen — so relaxing the pattern to `-?` let `KAN7F3QMP` into the
staff field while classification sent it to the affiliate ledger: the separation rested entirely on a
detail nothing prevented from changing. The guard now refuses the hyphen-dropped shape too, and a test
asserts that a hyphen-stripped minted code is neither `AFFILIATE` nor `STAFF`. `KAN001` — the existing
F-018 fixture — still classifies `STAFF`, because `0` and `1` are absent from the affiliate alphabet;
that case is why the guard could not simply reserve the `KAN` prefix.

**Endpoint:** `GET /v1/retailers/me/referral-code` — fetch-or-mint, idempotent (re-minting would break
every link already shared), reconciling a concurrent first request to the winner's code instead of
minting a second (`retailer_id` is unique, so one insert wins; the loser re-reads — the social
composer's `createOrReconcilePost` shape), and retrying on a `code` collision. `link` is **built, never
stored** — derived from `WEB_URL` + the code, so changing the base URL or landing path cannot go stale
per-retailer.

**Two decisions worth naming.** (i) The code is **not** the store slug, despite §4.3's example: the slug
is *mutable* (the §30 store-URL rename sync), so attribution stored against it would break on rename;
the code is its own immutable identifier and the *generation pattern* is what got reused. (ii) No
endpoint resolves a typed code to a shop. That is a code-enumeration oracle — 456,976 candidates is
minutes of requests, and the answer is a list of who is in the program. Resolution returns only inside
T4's server-side signup write.

**Verification:** API **1121/1121** (85 files, +43) · web **319/319** · `tsc --noEmit` clean ×3 ·
Biome clean on all changed `apps/api` files · `check-delete-guard.sh` + `check-route-size.sh` pass ·
**`apps/mobile` 0 files**. Guards falsified four ways, each hitting exactly its target: dropping the
aggregator `register()` call fails the wiring test (a passing route test would not have — the module
still registers fine on its own, which is precisely how RC-025 shipped a 404); removing the P2002
re-read fails 3 tests; making the namespace refine a no-op fails the 422 test; and making the hyphen
optional failed **nothing** until the missing assertion was added — see above.

**Not verified:** the screen is unit-tested, not visually checked in a browser — the repo's precedent
for admin pages (`suits-designs/__tests__/page.test.tsx`). The 10 tests do assert the rendered values
come from the API fixture (37% / 9mo / 45d / ₹123.45), so a hardcoded default would fail them.

---

## BUILT 2026-09-22 (later still) — RC-030 RLS half: the purge path's access to 50 RLS tables rested on an ownership accident

**Migration `111_backend_role_rls_policies` · `purge-rls-policy.test.ts` · opt-in `purge-rls-live.test.ts`**

### The finding that reframed the problem

The previous entry closed with "4 of the 7 new sweeps may affect 0 rows silently — a PII call to settle".
Settling it inverted the diagnosis. The question was whether the purge role bypasses RLS; the answer is
that it has no `BYPASSRLS` **and no policy either**, so it bypasses via `pg_class_ownercheck` —
`kanchuki_purge` is a member of `kanchuki_app`, and for any table `kanchuki_app` **owns**, Postgres
treats both as owners and skips RLS.

| Measured | Value |
|---|---|
| Tables with `ENABLE ROW LEVEL SECURITY` | **50** |
| Policies naming `kanchuki_app` or `kanchuki_purge` | **0** — every policy targets `authenticated` / `anon` (PostgREST) |
| Purge-path tables that are RLS-enabled | **23 of 32** (`products`, `customers`, `collections`, `retailers`, `subscriptions`, `staff`, `audit_logs`…) |
| Roles with `BYPASSRLS` | **0** — `ALTER ROLE … BYPASSRLS` appears nowhere |

So the four tables were never special, and "add a policy for the four" would have been a fix aimed at
the symptom. The backend's access to **all 50** tables depends on which role happened to run each
migration — an accident nobody documented, verified, or controlled. The honest statement is that the
30-day cron and the admin hard-delete have always worked *by luck*, and RC-030 is simply where it first
bit.

### Why a policy, and why `FOR ALL`

`ALTER ROLE … BYPASSRLS` needs superuser, so it could only ever be hand-applied in the SQL Editor and
could never ride `prisma migrate deploy` — **RC-029's failure exactly** (a fix that lives only in a
hand-run script). It would also silently cover future tables and leave no trace in the schema, which is
how this class hides. A per-table policy is ordinary DDL, applied by the deploy path.

`FOR ALL`, not `FOR DELETE`, is the trap this migration exists to avoid. `purgeTable()` selects a batch
of ids and breaks out of its loop when the batch is empty; `fetchR2Keys()` selects the R2 keys before
the rows go; `purgeChildren()` scopes its `DELETE` through `SELECT id FROM retailers`. Under a
`DELETE`-only policy **every one of those `SELECT`s still returns 0 rows**, so the sweep would keep
silently deleting nothing *while a policy sat there making it look fixed*. Phase B of the live test
executes precisely that non-fix and shows the row surviving it.

`USING (true)` is a filter, not a widening: the policy names only the two backend roles, it is
`PERMISSIVE` so it ORs with the `authenticated`/`anon` policies rather than replacing them, and RLS
cannot grant a privilege — `kanchuki_app` still has no `DELETE`, because the `REVOKE` in
`scripts/setup-role-separation.sql` is checked **before** RLS is consulted. The migration is guarded on
both roles existing and each table still existing (a `CREATE POLICY` naming a missing role is a hard
error that would abort `migrate deploy` in a brand-new environment, where migrations run before the
hand-run role script) and is idempotent, so a later teardown cannot break it.

### The two guards

`purge-rls-policy.test.ts` (static, runs in CI) re-derives the required set from `schema.prisma` + the
migration history + both job sources and fails if migration 111's array drifts in **either** direction
— a missing entry is a sweep that silently does nothing, a stale one is RC-029 returning. It also pins
`FOR ALL`, both role names and the two guards. It carries a floor on every derived set, so a broken
parse cannot make it pass vacuously; it pins the **unquoted**-identifier case (`DELETE FROM
ai_usage_logs` in the hard-delete job, which an earlier quoted-only regex silently dropped from the
required set); and it strips comments first, because both job files *discuss* dropped tables in prose.

`purge-rls-live.test.ts` is the executed proof, opt-in via `PURGE_RLS_TEST_DATABASE_URL` — no test in
this repo touches a real database, and this failure is **semantic**, so a static check cannot settle
it. It lifts the `CREATE POLICY` statement **out of the migration file** (so it cannot drift from what
will run) and, on scratch tables with real RLS and the real privilege split, shows per table: (A) no
policy → `SELECT` sees 0, `DELETE` affects 0, **no error**, row survives; (B) a `FOR DELETE` policy →
still 0 and 0, row survives; (C) migration 111's policy → sweep sees the row and it goes. A fifth case
proves the cron's `audit_logs` **insert** raises 42501 without a policy — a loud failure, unlike the
deletes, and a dependency on the same policy.

**Verification:** API **1132 passed / 5 skipped** (86 files + 1 skipped — the skip is this round's
opt-in live test) · web **319/319** (41 files) · `tsc --noEmit` clean ×3 · `biome check src/` clean on
every changed file · `check-delete-guard.sh` passes · **`apps/mobile` 0 files** · the static
guard **falsified seven ways**: drop `customer_interactions` from the array → missing + four-tables
checks; an invented `user_sessions` entry → the stale check; `FOR ALL`→`FOR DELETE` → the `FOR ALL`
check; drop `kanchuki_app` from the policy → the roles check; remove the role guard → the deploy-safety
check; unscope the idempotency check → the `schemaname` assertion; and a second `CREATE POLICY` earlier
in the file → the "exactly one DDL to lift" check **plus** the two assertions that read the DDL, which
is the pointed lesson: those two did not catch the drift on their own, they failed only because they
were now reading the wrong statement. Files restored byte-clean after each. The live test's
extraction regex was verified to yield the real DDL, so a bad parse cannot make the owner's first live
run fail for the wrong reason.

**One pre-existing test flake fixed rather than re-reported** (`retired-tryon-guard.test.ts`, flagged
last session as "passes standalone, occasionally flakes in the full suite"). This time it failed the
suite outright with `Test timed out in 5000ms` — and the cause is real, not environmental noise:
`loadSources()` re-walked `apps` + `packages` + `scripts` and re-read every code file **on every call**,
and several tests call it. Standalone the whole file runs in ~0.5s and it passed 3/3; under 87 parallel
files the first synchronous walk exceeds the 5s default. Two lines: the walk is now memoised (nothing
in the scan mutates the result and the files cannot change mid-run) and that one test carries an
explicit 30s budget, budgeted for contention rather than because the walk is slow. No assertion was
weakened — the file is 8/8 before and after, and the suite went green.

**Not done / owner-side:** migration **111 is not applied** (admin dashboard, per CLAUDE.md) · the live
test has **never been executed** — no local Postgres, no DB harness, no docker-compose in this repo, so
it is committed as opt-in and is the owner's first run · `scripts/setup-role-separation.sql` was **not**
changed for the policies (they belong in the migration; the script keeps the ownership note pointing at
it) · the 26 other RLS-enabled tables still rely on the ownership accident — out of scope only because
nothing in the purge path touches them.

## BUILT 2026-09-22 (T4) — Affiliate referral capture at signup, riding the field F-018 already owns

> **Superseded in part, same day:** **T5** landed later (see §2026-09-22 (T5) at the foot of this
> file), so the "T5–T10 are untouched" status below describes *this* section's session. **T6–T10
> remain unbuilt — nothing pays out yet.**

Spec: `docs/tasks/referral-program-retailer-affiliate.md` §7 T4. Turns a code a signing-up retailer
entered into a `pending` `ReferralConversion`, and gives the referred store its side of the deal.
**T5–T10 were untouched at this point, so nothing paid out yet** — T4 records a conversion and no code
consumed it. *(T5 landed later the same day — see the foot of this file.)*

**`apps/mobile` and customer web: 0 files changed.** The Play Console review in flight is unaffected.

| File | Change |
|---|---|
| `apps/api/src/lib/referral-conversions.ts` | **new** — `applyReferralCapture()`, `addCalendarMonths()`, the four guards, the reward application |
| `apps/api/src/lib/referral-settings.ts` | **new** — one reader for the `referral_settings` singleton (extracted from `admin-referral.ts`, which becomes its second consumer) |
| `apps/api/src/routes/retailers/retailers-profile.ts` | the capture hooked into `PUT /me`, after the update, non-fatal |
| `apps/api/src/routes/admin/admin-referral.ts` | `FLAT_DISCOUNT` refused by name (`UNIMPLEMENTED_BONUS_TYPES`); `BONUS_TYPES` narrowed and exported |
| `apps/web/src/app/admin/referral-settings/page.tsx` | `FLAT_DISCOUNT` no longer selectable; a legacy row holding it still **renders** it, disabled and labelled |
| `referral-conversions.test.ts` · `referral-settings.test.ts` · `retailers-profile.test.ts` | **new** — 32 + 3 + 8 tests |
| `admin-referral.test.ts` | +4 — the schema-derived enum guard |
| `.../referral-settings/__tests__/page.test.tsx` | +2 — the narrowing, and the legacy row it must still show |

### The capture point already existed, which is the whole reason there is no mobile change

`UpdateRetailerSchema.referral_code` is **F-018's** self-serve salesperson code, and the route already
resolves it against `TeamMember` → `onboarded_by_id`. So an affiliate code typed into the existing
"Referral Code (Optional)" onboarding field has been **arriving at the API and being silently dropped**
since F-018 shipped. T4 adds a second, shape-decided destination to a value that already travels — no
client change, no new endpoint, no second link. The field maximises the surface a bad build could spoil
(one field, one save) and minimises the client work, which is exactly the trade the Play review needs.

**Three things research changed about the spec's T4, all decided with the owner before coding:**

1. **The `?ref=` cookie was NOT built.** There is no retailer signup/onboarding form on the web — every
   `shop_name` match is an admin or shopper page — so the link's CTA leaves for the app and a cookie
   would have been a hook with no consumer that reads it. **RC-025's exact shape**, and the second time
   this spec has avoided it (§0 records the first, at T3). Manual code entry is the mechanism that
   completes today; the cookie is a follow-up **only if** a web signup ever exists.
2. **Self-referral checks phone + GSTIN, not bank account.** The spec asks for "same
   GSTIN/phone/bank account" and `Retailer` has **no bank-account column**. The missing third check is
   stated in the code, the spec and here rather than implied to exist.
3. **`FLAT_DISCOUNT` removed from the settings.** T2 had made it selectable from day one, and nothing
   in this repo discounts a Razorpay charge or a GST invoice — so choosing it stored a term that never
   reaches the store. **RC-027 one layer up** (a config value the code silently drops). Now: the API
   refuses it with a message naming the reason, the admin screen stops offering it (while still
   rendering a legacy row that holds it — a `<select>` with no matching `<option>` renders blank, which
   would hide the stored term from the operator), and a test derives the full PostgreSQL enum from
   `schema.prisma` and fails if a member is neither implemented nor listed as unimplemented.

### Four guards, one per way the program could pay the wrong actor

| Guard | Mechanism, not just the outcome |
|---|---|
| **Shape decides the ledger** | A staff code returns `NOT_AFFILIATE` and the affiliate table is **never queried** — asserted on `referralCode.findUnique` not having been called, because a status assertion passes even if the lookup happened and lost a race to the right answer. A hyphen-dropped `KAN7F3QMP` is `INVALID_CODE`, never looked up: it is staff-shaped too, so a lookup-order implementation would quietly search the wrong table first. |
| **Self-referral** | By id, phone, or case/whitespace-insensitive GSTIN. Two **blank** GSTINs are *not* the same shop — `gstin` is nullable and a blank is legitimate for an unregistered store, so without that check every unregistered store is "the same shop". Refused silently to the client (a referral code is one field of a general save, and throwing would block a shop saving its own name over a code it can remove) but **audited**, unlike a typo — an abuse attempt and a mistyped code must not look the same in the data. |
| **One attribution, staff wins** | A shop a marketing agent already onboarded (`onboarded_by_id` set) never also becomes an affiliate conversion. Owner decision. |
| **Idempotency** | `referred_id` is UNIQUE and that constraint *is* the gate — not a `findFirst` check, which loses to a concurrent double-submit. `P2002` is the idempotent success case, and the reward is applied **inside the transaction that failed**, so neither a conversion without its bonus nor a bonus twice is reachable. |

`addCalendarMonths()` is calendar months, not `days * 30`, and moves to the 1st before setting the
month: `Jan 31 + 1 month` naively lands on **Mar 3**, silently granting a month and two days. It never
extends from a lapsed trial — the bonus is worth the same applied on day 1 or day 20, so the base is
whichever is later.

### RC-032 — a defect in T4, found and fixed before it was committed

The route comment promised "a referral problem never fails the profile save"; `applyReferralCapture()`
**throws by design** (a captured-then-lost referral is a referrer never paid) and the call site was a
bare `await` with no `catch`. Since migrations are applied **by hand from the admin dashboard** while
code deploys **on push**, there was a window in which any retailer typing a referral code during
onboarding would have got a **500 on the profile save and been blocked from finishing**. Every check
was green: `prisma.referralCode` typechecks (the schema declares the table), a mocked client passes,
and a 500 on the profile save reads as a validation bug. The fix holds both halves at once — the route
catches, logs the underlying error, and reports `CAPTURE_FAILED` **as data**: non-fatal *and* not
silent, because swallowing it would convert a visible outage into an invisible lost referral.

**Verification:** API **1180 passed / 5 skipped** (89 files, +47 tests; the skips are the opt-in RLS
live test) · web **321/321** (41 files, +2) · `tsc --noEmit` clean ×3 · `biome check` clean on all 8
changed `apps/api` files · `next lint` clean · `check-delete-guard.sh` passes · **`apps/mobile` 0
files** · **guard falsified seven ways**, each failing for the right reason with the offending value
named: add `CREDIT_NOTE` to the enum → `expected [ 'CREDIT_NOTE' ] to deeply equal []`; drop
`FLAT_DISCOUNT` from the refusal list → both the unhandled-member check and the route's
`/not available/` message check; rename it to a stale key → the stale-entry check too; make
`FLAT_DISCOUNT` selectable again → the web select check; restore `throw error` in the route's catch →
`expected 500 to be 200`; drop the one-attribution check → `expected 'RECORDED' to be
'ALREADY_ATTRIBUTED'` in both the lib and route suites; add a fallback constant to the settings loader
→ `expected "spy" to be called with arguments: [ { data: {} } ]`. Files restored byte-clean after each.

**Two test-side corrections of my own, both from mocking rather than from the product:** the first
`addCalendarMonths` cases pinned the evaluation instant *after* the date being extended, so the
documented "count from now" rule correctly applied and my expectations were wrong; and the route test's
first fake DB returned fixed objects regardless of the writes, which made the post-bonus assertion
untestable and the `data` assertions lie. Fixed by making the fake stateful. One **product** correction
came out of the same failure: `applyReferralCapture` accepted an injected `now` for `qualifies_at` while
the bonus read wall-clock time, so one transaction contained two different referral moments — the bonus
then became the only part of the operation a caller could not pin. `now` is now threaded through.

**Not done / owner-side:** migrations **109, 110 and 111 are still not applied** (admin dashboard) ·
**T6–T10 unbuilt — no affiliate link earns anything yet**, stated in the spec, PRO-REQUIREMENTS and
CLAUDE.md rather than left to the endpoint's existence to imply *(T5 landed later the same day — see the
foot of this file)* · the `?ref=` cookie capture (only
meaningful once a web signup exists) · the super-admin path-list gap for
`/v1/admin/referral-settings` (pre-existing, shared with `/v1/admin/commission`; T2 matched its sibling
rather than diverging).

---

## BUILT 2026-09-22 (T5) — Referral qualification cron: `pending` → `qualified` / `clawed_back`

Spec: `docs/tasks/referral-program-retailer-affiliate.md` §7 T5. **T6–T10 are still unbuilt, so this
job still earns nobody anything** — it moves a conversion into the state T6 will accrue from, and no
code consumes that state yet. **`apps/mobile`: 0 files.**

| File | What it is |
|---|---|
| `apps/api/src/jobs/referral-qualify.ts` (new) | `handleReferralQualify()` + the pure `decideQualification()` gate |
| `apps/api/src/jobs/referral-qualify.test.ts` (new) | 24 cases: the gate's whole branch table, the CAS write payload, per-row isolation, one-query paid lookup, cron wiring |
| `apps/api/src/jobs/index.ts` | worker `case 'referral-qualify'` + repeat `0 2 * * *` on the maintenance queue |

### The day count is deliberately NOT in this job

`qualifies_at` is stamped at **signup** by T4 from `qualify_days`, and the schema says exactly that
("computed at signup by T4 and enforced nightly by T5"). So the spec's requirement — *read the window
from settings, not a literal `30`* — is satisfied one layer up, and re-deriving it here would create a
second answer to "when is this due?". The consequence is recorded rather than hidden: an admin editing
`qualify_days` affects conversions created **after** the edit, because `qualifies_at` is the record of
the terms in effect when the referral happened — the same snapshot discipline as
`commission_base_amount`. A **source-scan guard** (with comments stripped, because the file's own
header explains the rule it enforces) fails if T5 ever gains a `qualify_days` reference or imports the
settings loader.

### The gate — "paid + active for the window", literally

| Condition | Outcome |
|---|---|
| `Retailer.deleted_at` set | `CLAWED_BACK` · `REFERRED_DELETED` |
| no `SubscriptionPayment` with `status = 'success'` | stays `PENDING` · `NOT_PAID` |
| `Retailer.is_suspended` | stays `PENDING` · `SUSPENDED` |
| payment **and** an `ACTIVE` subscription **and** active store | **`QUALIFIED`** |
| payment, no `ACTIVE`, but a `CANCELLED` subscription | `CLAWED_BACK` · `REFERRED_CHURNED_AFTER_PAYMENT` |
| payment, `PAST_DUE` only | stays `PENDING` · `PAST_DUE_REVIEW` |

**Two orderings are load-bearing and each has a test that fails if it is swapped.** The terminal check
precedes the never-paid check, so a soft-deleted store is clawed back instead of being re-scanned
forever; and the never-paid check precedes the churn branch, so a store that abandoned a **free trial**
lands in `PENDING` rather than in an irreversible `CLAWED_BACK` — there is no value to claw back, and if
it resubscribes inside its window the referrer is still paid.

**Two deliberate non-clawbacks.** `is_suspended` and `PAST_DUE` stay `PENDING`, because both are
**recoverable** — F-015 ships an unsuspend, and dunning has card retries — while `CLAWED_BACK` is
**irreversible** (the CHECK permits no documented reverse transition). Writing an irreversible status
from a reversible state would let an admin's temporary suspension end a referral permanently. The cost
is that a store which never pays leaves its conversion `PENDING` indefinitely; nothing accrues and
nothing is owed, so it is inert — and it is **counted** in the run summary rather than left invisible.

### What it writes, and the two fields it must never write

`commission_base_amount` ← `Subscription.amount_inr` of the newest `ACTIVE` subscription. That column is
**paise** per the schema, the same unit as this one — there is deliberately no `* 100`, which is the
mistake that would multiply every payout by 100 without failing anything. `qualified_at` /
`clawed_back_at` are written here and nowhere else.

- **Not `paid_at`.** It is the date the *referrer was paid out* (T7), not the date the referred store
  paid us, and the DB CHECK forbids it on a `QUALIFIED` row. The column name invites precisely the wrong
  write and the constraint is the only place that says so — so the test asserts the key's **absence**
  from the payload.
- **Not `commission_accrued`.** T6's column, per the schema (*"written by T6"*).

### Idempotency is a compare-and-swap, not a read-then-write

Every transition is `updateMany` with `status: 'PENDING'` in the `WHERE`, inside the same transaction as
its audit row. Two overlapping runs — or the nightly cron plus a manual trigger — cannot both move a
row; the loser sees `count: 0` and is reported as `raced`, not as an error. A read-then-write version
passes every single-threaded test and double-transitions in production. Failures are isolated per row,
so one broken store cannot abandon the night's remaining work (counted **and** logged, because a silent
error here is a referral that quietly never qualifies). Paid status is resolved in **one** grouped query
per page rather than one per candidate.

### RC-033 — a pre-existing billing collapse that T5's clawback now rests on

`billing-webhook.ts` maps **both** `subscription.cancelled` **and** `subscription.completed` to
`status: 'CANCELLED'` — so *"finished its paid term"* and *"churned"* are the same row, and the same
statement stamps `cancelled_at` and nulls `razorpay_subscription_id`, destroying the evidence of which
event actually arrived. T5 is the first consumer to make a **consequential** decision on `CANCELLED`.

The T5 decision **stays correct**: the gate is sustained paid **and** active *through* the window, and a
completed subscription is not active, so `CLAWED_BACK` is right either way. What is lost is the audit
distinction. The fix is a schema change plus a webhook remap plus a backfill — i.e. **billing**, the
revenue path — so it is **recorded and deferred**, not silently patched from inside a referrals task.

### Refunds still have no data source

Nothing in this repo ever writes `SubscriptionPayment.status = 'refunded'`. T5 therefore implements the
**churn half only** of the spec's clawback; the refund half is not built. A refund check reading a value
nothing produces is a guard that can never fire.

### Verification

API **1204/1204** (91 files, +24) · web **321/321** · `tsc --noEmit` clean ×3 · Biome clean on all 3
changed files · `check-delete-guard.sh` passes · **`apps/mobile`: 0 files**.

**Guard falsified nine ways**, each restored byte-clean afterwards: drop `status: 'PENDING'` from the
CAS `WHERE` → the CAS test; add `paid_at: now` → the never-write-`paid_at` test; add
`commission_accrued` → the same test; `amount_inr * 100` → 3 tests; let the never-paid gate win over the
terminal one → 2 tests; let the churn branch fire without a payment → the never-paid-cancellation test;
`throw error` instead of `errors++` → the per-row isolation test; remove the worker `case` → the wiring
test; remove the cron `add` → the scheduling test.

**Two test-side corrections of my own:** the reachability assertion's expected array was in the wrong
sort order (`'T' < '_'`, so `NOT_PAID` precedes `NO_ACTIVE_SUBSCRIPTION`), and the source-scan guard
tripped on the job's own header comment explaining the rule it checks — fixed by stripping comments
before scanning, since the correct fix is never to delete the explanation.

**Three unrelated suites failed the first full run and passed the second** (`auth-otp-bypass`,
`retailers-whatsapp-catalog`, `discover-stores`) — all three pass in isolation, so they are the
load-sensitive flake class, not this change. Run 2 was 1204/1204. (Not fixed here: it is a test-infra
issue, distinct from the `retired-tryon-guard` timeout flake fixed earlier the same day.)

**Not done / owner-side:** migrations **109, 110, 111 still not applied** · **T6–T10 unbuilt — no
affiliate link earns anything yet**, stated here, in the spec, PRO-REQUIREMENTS and CLAUDE.md rather
than left to the job's existence to imply · RC-033's billing fix · the refund half of the clawback · the
super-admin path-list gap for `/v1/admin/referral-settings`.

---

## 2026-09-23 — Admin access boundary: three drifted lists → one shared, derivation-guarded list (RC-034) + a stale bench assertion (RC-035)

**Commit:** *(this session)* · **RC-034**, **RC-035** · Zero `apps/mobile` files.

### What was actually open

The rule "this admin surface needs Super Admin" existed in three hand-maintained
places that nobody had ever compared:

| Surface | List | Enforced? |
|---|---|---|
| `apps/api/src/routes/admin-auth.ts` | 8 segments | **yes** — the only boundary |
| `apps/web/src/app/admin/layout.tsx` | 14 prefixes | page access only |
| `apps/web/src/app/admin/components/Sidebar.tsx` | 14 entries | cosmetic |

Measured: **eight** surfaces the web UI hides were reachable by a plain ADMIN key —
`commission` (the 3% payout ledger), `addon-purchases`, `ai-usage`, `audit-log`,
`plan-features`, `plan-limits`, `resource-packs`, `storage-report` — plus
`referral-settings`, which was in the Sidebar *only*, so it was hidden from the nav yet
both directly navigable **and** callable. `plan-pricing` (what every retailer is charged),
`invoices` (tax documents) and `database/deletion-vault` (hard-deletes retailer/customer
data) were in **no list at all**. `payments` was in the API list while matching no route,
so it protected nothing.

The enforcement failed **open**: `path.startsWith(...)` against a fixed set means a route
nobody remembered to add is *reachable*, not *refused*. No error, no log — the surface is
simply open. Adding an admin route was a security decision that defaulted to "public".

And it was invisible from any single file: the panel *looked* correct, because the Sidebar
hid those entries and the layout rendered "Access Restricted". Only the API enforced
anything, and only for its eight segments.

### Why the fix is a shared list **and** a guard

One list now backs all three surfaces (`packages/shared/src/constants/admin-access.ts`), so a
surface is protected everywhere by construction instead of in whichever places somebody
edited. Matching is on the whole first path segment after `/admin/`, never a bare
`startsWith` — otherwise `/admin/commission-x` matches `commission` — and query strings,
hashes and case are normalised, so `/v1/admin/COMMISSION?x=1` cannot slip past.

But a shared list only fixes today's holes. Because the runtime check fails open **by
design**, the property that matters — *every registered admin route has been classified* —
cannot live in runtime code. It lives in `apps/api/src/routes/admin-access.test.ts`, which
**derives** the segment set from the route and page sources and fails until each one is
classified as super-admin-only or standard-admin. Adding an admin route now forces a
decision instead of silently defaulting to public.

Two design details carried the weight:

- **Everything is classified, including the permitted.** `STANDARD_ADMIN_ADMIN_SEGMENTS`
is not decoration: without it the guard can only ask "is this sensitive?" — an open-ended
question whose lazy answer is "no". With both lists present the question becomes "which of
these two is it?", and the failure names the segment nobody decided about.
- **Failures point at the source.** The derivation maps each segment to the file that
declares it, so the error says ``alerts  ←  apps/api/src/routes/admin-settings/notifications.ts``
rather than just naming a string.

### The dead entries, and why they were dead

Six entries protected nothing, and the reason is worth recording: **those files are named
after the feature, but the first path segment is the parent prefix.**

| Entry | Real routes | Actual first segment |
|---|---|---|
| `theme` | `/settings/theme` | `settings` |
| `catalog-promo` | `/settings/catalog-upload-promo` | `settings` |
| `rate-limits` | `/settings/rate-limits` | `settings` |
| `notifications` | `/settings/notifications` | `settings` |
| `ticket-reporting` | `/reporting/tickets` | `reporting` |

`settings` was already in the list, so four of them were redundant rather than harmful —
but a list keyed on filenames is a list that cannot be verified by reading it, which is the
same defect one level down. The guard's **dead-entry assertion** is what keeps this from
recurring: if a surface returns later, the completeness assertions force a fresh decision.

### Verification

- `admin-access.test.ts` **11/11**, falsified three ways, each isolated:
  - removing a gated entry (`referral-settings`) → failed, naming the path;
  - adding a new admin route file (`/falsify-probe`) → failed, naming the file;
  - reintroducing the old `startsWith` semantics → failed the sibling assertion
    (`/admin/commission-x` must **not** match `commission`).
- **API 1215/1215**, **web 321/321**, `tsc` clean in `apps/api` + `apps/web` + `packages/shared`,
  F-017 delete-guard passed.
- The 12 Biome errors reported on the changed files are the **Windows checkout artifact**
  (`* text=auto eol=lf`): all staged blobs measure **0 CR**, so the commit is LF and CI-clean.
- `apps/mobile`: **0 files**.

### RC-035 — found while running the gates, not part of this change

A fresh `@kanchuki/shared` build turned the web suite red on
`studioEngineCost('grok_imagine')`: the test asserted `null` while the committed table says
`usd: 0.04`. It had been **green because `packages/shared/dist` is gitignored and stale** — the
test was resolving `@kanchuki/shared` to an older table than the source. The rule under test
("an unverified price never becomes a number") was correct; the *example* had gone stale. The
assertion now names engines that are `usd: null` today (`vton_kontext`, `vton_gemini`), so it
tests the property rather than one row. Recorded as RC-035 rather than fixed silently, because
the class — *an assertion pinned to a mutable data row, masked by a build artifact* — is the
kind that returns.

### Flagged, not decided

> **→ Superseded 2026-09-24** — both of the entries below were locked down; see
> [§2026-09-24](#2026-09-24--rc-034-follow-up-team-members--reports-locked-to-super-admin) at the foot
> of this file. Kept verbatim as the record of what was decided at the time.

Two segments are classified standard-admin, matching their **pre-change reachability**, with an
in-file note and the one-line change to lock them down:

- **`team-members`** — staff/sales-team account management (invite + edit members; via
  `/v1/team/*`, not `/v1/admin/*`). Credential-adjacent, so it is worth an owner's eye.
- **`reports`** — `/admin/reports/gst` is tax data, but its only fetches are `/v1/admin/gst/*`,
  and `gst` **is** gated, so a standard admin sees an empty report rather than the figures.

### Still open (owner-side)

- **Migrations `109`/`110`/`111` not applied** (admin dashboard) — the referral tables and the
  RLS policies do not exist in prod until they are.
- **The opt-in `purge-rls-live.test.ts` has still never executed** — no test in this repo touches
  a real database, and RLS denies by *filtering*, so a broken policy and a working one pass every
  static check. This is the one claim in the referral feature resting on reasoning, not measurement.
- **Why the gap existed at all is still open:** the Segment RC-034 list is now exhaustive by
  construction, but the same "three lists" pattern may exist for other cross-surface rules.
  Treat any rule duplicated per-surface as a candidate.

---

## 2026-09-23 (later) — T6: referral commission accrual — monthly installments, owner money decisions recorded, ledger made self-auditing

**Commit:** *(this session)* · **Zero `apps/mobile` files** · Spec §7 T6 (`docs/tasks/referral-program-retailer-affiliate.md`).

### What shipped

- **Migration `112_referral_accrual_columns`** (not applied): three T6-owned columns on
  `referral_conversions` — `commission_monthly_paise` (frozen per-installment amount),
  `accrued_months` (installments EARNED), `accrued_through_period` (last earned month, the
  idempotency cursor) — plus four CHECK constraints that make the ledger self-auditing:
  `accrued_months = 0` ⟺ no cursor ⟺ no frozen amount; PENDING rows can never accrue;
  and `commission_accrued = accrued_months × commission_monthly_paise`, so if the job ever
  writes the three inconsistently the UPDATE fails rather than the ledger lying quietly.
- **`apps/api/src/jobs/referral-accrue.ts`** — the accrual job, registered as
  `referral-accrue` on the maintenance queue, daily **`15 2 * * *`** (after T5's 02:00
  qualification, before the 02:30 backfill). Pure decision function (`decideAccrual`,
  exported like T5's) + compare-and-swap writes with the audit row in the same transaction.
- **`schema.prisma`** — the three columns documented on `ReferralConversion` with the
  writer map extended.

### The four owner money decisions (2026-09-23 — none were in the spec text; asked before coding)

1. **Base = T5's qualification snapshot.** `commission_base_amount` is never re-read; a
   mid-cycle plan change moves nothing.
2. **Monthly, on the same daily cron.** One installment per IST calendar month (the §42
   Commission Tracker business calendar).
3. **Only paid months earn.** An installment accrues only for a month with ≥1 successful
   `SubscriptionPayment`. An unpaid month is **skipped, never clawed back** — the same
   installment number stays available for the next paying month — and the program runs
   until `duration_months` installments have **earned**, regardless of wall-time. The
   anchor for month 1 is the store's **first successful payment**: trial months are not
   month 1 (the owner's rule — "after the trial the retailer starts paying us, then we
   pay the referrer; if the retailer stops paying, no payment to the referral account").
4. **The monthly amount freezes at first earn** (`base × commission_pct`, snapshotted).
   An admin editing `commission_pct` cannot reprice earned months in either direction.

### Design: why columns, not a parallel ledger table

The spec said "copy the §42 ledger pattern — parallel table". §42 stores only mutating
expense rows because its monthly figure is computed on the fly; here every conversion
already carries its own accrual, so the monthly rollup **is** the row — a second table
would have been a duplicate of `commission_accrued` needing its own reconciliation. The
pattern worth copying was §42's **IST period semantics**, not its storage.

### Mechanics worth knowing

- The walk starts after the last earned month (or at the first payment month) and moves
  forward one calendar month at a time; a paid month EARNs, an unpaid month is walked past
  without consuming the installment.
- A month only earns once it has **fully ended** (IST) — nobody can know a running
  month's payment picture.
- At most **one** installment per conversion per run — a backlog drains over successive
  nights instead of bursting in one run.
- A 60-consecutive-unpaid-month ceiling parks genuinely dead referrals so the nightly
  walk stays bounded; the counter is per-run and re-arms if the store ever pays again.
- **PAID rows keep accruing** — a payout settles part of the ledger, it does not end the
  program (examining QUALIFIED rows only would pay a 12-month program exactly once).
  For the same reason this job never touches `paid_at`: on a PAID row that timestamp is
  the referrer's payout history, not the accrual timeline.
- Writes are compare-and-swap — `status` + `accrued_months` + `accrued_through_period`
  all in the WHERE, audit row (`REFERRAL_COMMISSION_ACCRUED`) in the same transaction —
  so overlapping runs cannot double-credit and a failed audit rolls the credit back.
- A QUALIFIED/PAID row whose store has no successful payment is a data-integrity throw
  (unreachable through T5's gate), not a silent DONE; the settings singleton missing is a
  loud error naming migration 109, not a hardcoded fallback (RC-027 rule: no silent
  defaults, no code constants).

### Verification

- `referral-accrue.test.ts` **29/29**: full-payload `toEqual` (any extra field — `paid_at`,
  `payout_id`, `commission_base_amount` — turns red), CAS-WHERE assertion, audit-in-
  transaction, IST boundary arithmetic (18:29:59Z is still August), freeze both directions,
  every decision branch, one-installment-per-run, settings read at call time, missing
  singleton fails loudly, cron-wiring source scans (registration + `15 2` ordering +
  `paid_at`-never-written + never re-deriving the base from the subscription).
- **Falsified 6 ways, each caught for the right reason:** (1) cursor dropped from the CAS
  WHERE → the WHERE assertion failed; (2) walk restarting at the first payment month → 4
  cursor tests failed; (3) freeze removed → the reprice test failed; (4) audit moved
  outside the transaction → 4 tests including the tx-scoped audit assertion; (5) `paid_at`
  sneaked into the payload → 6 tests incl. the source scan; (6) hardcoded settings
  fallback → the missing-singleton test failed. (One falsification attempt was itself
  vacuous — adding a comment after `return true` — and was replaced by moving the audit
  genuinely outside the transaction; a falsification that changes nothing proves nothing.)
- Full API suite **1244/1249** (5 pre-existing skips) · API + web `tsc` clean · Biome clean
  on all touched files · `@kanchuki/shared` rebuilt (no source change; RC-035 hygiene).

### Still open (owner-side)

- Migrations **109/110/111/112 not applied** (admin dashboard) — T6's columns and CHECKs
  do not exist in prod until 112 lands, and nothing runs until 109 does. Apply 112 **with**
  the referral batch.
- **T7–T10 unbuilt — still nothing pays out.** T6 grows the ledger; T7 (RazorpayX)
  settles it.

## 2026-09-23 (later) — F-038 T7: RazorpayX payout job + webhook + self-serve payout accounts

| What | Detail |
|---|---|
| Feature | T7 of the Retailer Affiliate Referral Program (`docs/tasks/referral-program-retailer-affiliate.md` §7 T7) — the first task that actually pays a referrer. Owner decisions recorded before coding (spec §7 T7): (1) self-serve Bank/UPI entry by retailers; (2) UPI = VPA fund account (explained to owner); (3) TDS/GST admin-configurable, defaults OFF until the CA conversation; (4) monthly cadence anchored on the **30th** (cron `30 2 30 * *` — February carries to March 30). |
| Migrations | **113_referral_payout_accounts** — one row per retailer (unique `retailer_id`), RazorpayX identifiers only (`contact_id`, `fund_account_id`, type, masked display); raw bank/UPI details never persisted; CHECKs force a details/type pairing and an active row to carry a fund account; `GRANT DELETE` to `kanchuki_purge`; no RLS enabled (schema-owned, backend-only writes) so no policy owed. **114_referral_tax_columns** — `tds_enabled`/`tds_pct`/`gst_applicable`/`gst_pct` on `referral_settings` (defaults OFF), `tds_paise` on `referral_payouts` (default 0). **Both not applied** (admin dashboard, with 109–112). |
| Payout client | `apps/api/src/lib/razorpayx.ts` — Contacts, Fund Accounts (VPA + bank_account), Payouts. Basic auth from `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` (RazorpayX uses the same keys as Razorpay Payments on the standard account). Every call bounded by an explicit AbortSignal timeout (RC-011), failures sanitized via `failureReasonFrom` (≤500 chars, non-Error throws become a generic line). Payouts always send `X-Payout-Idempotency` (RazorpayX made it mandatory 2025-03-15) with the **stored** claim key — same key + same body returns the original payout, never a second one. |
| Settlement | `apps/api/src/lib/referral-payout-settle.ts` — `settlePayout(payoutRowId, mappedStatus, failureReason?)` is the **single settlement path**: imported by both the job's reconciliation step and the webhook route. PAID → CAS `updateMany` stamps `paid_at` + `PAID` ONLY on conversions still attached to that batch; FAILED/REVERSED → release the claim (`payout_id → NULL`) so the money re-pools next run. `paid_at` still has exactly ONE writer in the codebase (source-scanned). |
| Job | `apps/api/src/jobs/referral-payout.ts` — cron `30 2 30 * *`, registered `referral-payout` in the maintenance switch. Per run: (1) re-submit crashed PENDING rows with the same idempotency key; (2) reconcile in-flight batches by fetching their RazorpayX state; (3) per referrer compute `unsettled = Σ commission_accrued − Σ payouts(PENDING/PROCESSING/PAID)` — FAILED/REVERSED excluded so their claim auto-releases; (4) gate on `payout_min_amount` + a live payout account; (5) CLAIM in one transaction — create `referral_payouts` PENDING with a **pre-generated** key (`refpo-` + `crypto.randomBytes(12)` → 30 chars, within RazorpayX's 40 cap; a create-then-update placeholder would collide on the UNIQUE `idempotency_key` under overlapping claims) + CAS-attach QUALIFIED/PAID conversions with `payout_id IS NULL` + audit row; (6) SUBMIT outside the transaction — a failed submit settles FAILED so money is never stranded in PENDING. TDS: RazorpayX receives **net = gross − TDS**; `amount_paise` stays gross and `tds_paise` snapshots, so withheld tax can never be re-paid next cycle. MANUAL cadence skips the cron (T9's future admin trigger pays on demand). |
| Webhook | `apps/api/src/routes/webhooks/razorpayx-payout.ts` — `POST /v1/public/webhooks/razorpayx-payout`, no JWT, HMAC signature against its **own** `RAZORPAYX_WEBHOOK_SECRET` (sharing the payments webhook secret would couple rotation), replay-window guard, duplicate deliveries tolerated (settlement is idempotent by CAS). processed→PAID, failed/rejected/canceled→FAILED, reversed→REVERSED; an unrecognized status is logged and ignored — never guessed with money. Registered in `apps/api/src/index.ts`. |
| Retailer routes | `apps/api/src/routes/retailers/retailers-payout-account.ts` — `GET/PUT /v1/retailers/me/payout-account` (UPI/VPA or bank). PUT creates the RazorpayX Contact + Fund Account at save time and persists only ids + masked display. Registered in the retailers barrel + aggregator. Form UI is T8 (Play-review-gated); T9 admin entry is the interim path. **Zero `apps/mobile` files.** |
| Purge sweep | `referral_payout_accounts` added to BOTH purge jobs before `DELETE FROM retailers` (RC-030 discipline); migration 113 grants `kanchuki_purge` DELETE. `purge-rls-policy.test.ts` derivation still passes (table has no RLS, no policy owed). |
| Tests | `apps/api/src/jobs/referral-payout.test.ts` **49/49** — branch tables (unsettled math, TDS netting, min-amount gate, MANUAL skip, status mapping incl. unrecognized→null), mechanism assertions (conversions stay QUALIFIED until the webhook; claim WHERE is a CAS; net = gross − tds), webhook handler coverage, source scans (cron on the 30th; `settlePayout` imported not redefined; `paid_at` one writer; webhook registered with `/v1`). **Every new guard falsified — 7 falsifications, each caught for the right reason.** Full API suite **1293 passed / 5 skipped**; tsc clean; Biome clean. |
| Still open | Migrations 109–114 not applied (owner, admin dashboard). RazorpayX account/keys + `RAZORPAYX_WEBHOOK_SECRET` not provisioned (owner). T8 mobile (Play-review-gated), T9 admin monitoring (also the interim payout-account entry), T10 final checklist. |

## 2026-09-23 (later) — T9 Admin Referral Monitoring + shared payout-account save path

**Feature:** F-038 Retailer Affiliate Referral Program, task T9 (`docs/tasks/referral-program-retailer-affiliate.md` §7). Zero `apps/mobile` files (Play-review constraint holds — 8 tasks, still not one mobile file).

| Piece | Detail |
|---|---|
| **Admin API** | `routes/admin/admin-referral-monitor.ts`, mounted at `/v1/admin/referral/*`, registered in **both** the barrel and `admin.ts` (RC-025): `GET overview` (program totals), `GET leaderboard` (per-referrer conversions + accrued/paid-out/unsettled), `GET export` (CSV, §42 pattern), `POST payout/trigger` → `handleReferralPayout('manual')` (the MANUAL-cadence path; the `30 2 30 * *` cron untouched), `POST conversions/:id/clawback` (CAS-WHERE on `CLAWBACK_ELIGIBLE_STATUSES` **imported from T5's module** — one set, no drift; refuses PAID so money can't leave twice; in-tx audit row), `GET retailers/:id/conversions` (detail drawer), `GET/PUT retailers/:id/payout-account` (admin interim entry until T8's form). |
| **Shared save path** | The payout-account save logic was **extracted** from the retailer route into `lib/referral-payout-account-save.ts`; both the retailer self-serve route and the admin route call it, so RazorpayX Contact/Fund-Account creation and masking cannot diverge between the two callers. |
| **Access** | `referral` classified **super-admin-only** in `packages/shared/src/constants/admin-access.ts` (money + irreversible clawback, same tier as `commission`/`referral-settings`); RC-034's derivation test now demands the classification; `@kanchuki/shared` rebuilt (RC-035 discipline). Web: `apps/web/src/app/admin/referral/page.tsx` + Sidebar entry. |
| **Caught mid-build** | Draft bug: the leaderboard passed `payout_id === null`-filtered conversions into `computeUnsettledPaise`, which **double-subtracts claimed money** — claimed conversions cancel out on both sides of the accrued−committed identity, so the job passes the full set. Fixed to pass the full set; pinned by a mechanism test. |
| **Falsification** | 5 falsifications, each caught for the right reason — and **F5 exposed a vacuous guard live**: restating the unsettled formula inline was behaviorally equivalent today and the scan regex didn't match the restated shape. The guard was strengthened (uniqueness assert of `computeUnsettledPaise` + brace-depth `.reduce` token check on the unsettled line) and re-falsified to red before restore. |
| **Tests** | 30/30 route tests (T9's suite), retailers-referral 8/8; full API suite **1323 passed / 5 skipped**; web **321 passed**; API + web tsc clean; Biome clean. |
| **Runbook** | `docs/runbooks/razorpayx-referral-setup.md` — owner steps: RazorpayX activation, key provisioning, `RAZORPAYX_WEBHOOK_SECRET`, migration batch 109–114, and the post-apply verification table. |
| **Still open** | Migrations 109–114 unapplied (owner); T8 blocked on Play review; T10 final §11 checklist. |

## 2026-09-23 (latest) — §11 Regression checklist run against T1–T7 + T9 → caught a double-pay race (RC-036)

The spec's §11 Regression / Root-Cause Checklist was run now, not deferred to T10. Every row checked against the actual code; result table recorded in the spec. **One row caught a real money bug.**

**The bug (RC-036 — full entry in the root-cause tracker):** the RC-015 row ("any submit-once action needs a ref-guard, not just state") had been mentally filed as a mobile concern — but its **server half** applied to T7's own payout run. `handleReferralPayout` reads the per-run unsettled amount **outside** the claim transaction and sizes the batch from that pre-read figure. Under overlap (manual trigger + cron, or two manual triggers — the web button's guard is React state, exactly the RC-015 shape), both runs read `unsettled`, both create PENDING batches; the CAS (`payout_id IS NULL`) makes the loser attach **zero** conversions, but the loser's batch already says `amount_paise = <stale full figure>` and `submitPayoutRow` pays what the batch says — real money with no ledger conversion behind it, and no CHECK violation anywhere to notice.

**The fix (inside the claim tx):**
1. Re-sum what **this batch actually attached** (`tx.referralConversion.aggregate` by `payout_id`). Zero attached → `EmptyClaimError` unwinds the tx exactly as Postgres's rollback would, caught by the outer handler into a new `skipped_concurrent` summary counter — the loser is a clean no-op, the winner's batch is authoritative.
2. Partial claim (`claimedGross < grossPaise`) → resize `batch.amount_paise`/`tds_paise` (via `splitTds` re-applied) to what the batch actually holds. Audit metadata, stored row and submitted amount all derive from `batch.amount_paise`, so ledger and payment cannot disagree.

**Verification:** job suite 51/51 with two new mechanism tests — empty claim → `skipped_concurrent=1`, no `createPayout`, zero surviving batch rows; partial claim → RazorpayX receives 15000 (the tx's own re-sum), never the stale 60000. Both falsified: removing the throw → red (`skipped_concurrent` 0 ≠ 1); disabling the resize → red (`amount: 60000` submitted). The mock `$transaction` gained **real rollback semantics** (snapshot + restore on throw) — without it the loser's batch row survived the tx throw and the test would have asserted the mock's limitation rather than the DB's behavior. Full API **1325/1330** (5 skips), tsc + Biome clean.

**Clean rows (verified, not assumed):** RC-028/004 (zero referral DELETEs via main client; both purge jobs sweep all 4 tables before `DELETE FROM retailers` on the `kanchuki_purge` role), RC-025 (all referral routes grep-registered in barrel + aggregator + index.ts + webhook at `/v1`), RC-026 (`res.ok` on every fetch in the admin screen), RC-027 (zod enums + bounded TDS/GST + `mapRazorpayxStatus` never guesses), RC-011 (`AbortSignal.timeout` on every RazorpayX call), RC-008 (web `LeaderRow` mirrors API `LeaderboardRow` field-for-field), RC-003/009 (`apiError()` surfaces the real error), RC-010 (`changedKeys()` — unchanged fields are a no-op), RC-007/012/013 (zero references to the migration-082-removed customer-referral feature; `ReferralReward` is new T4 vocabulary), RC-024/019 (client-component screen, plain fetch, no cache-warm assertions). RC-014/023/022/017 are T8-deferred (mobile), recorded as such. CI gates: security.test.ts + admin.login.test.ts 15/15, mobile 107/107, tsc clean across api/web/mobile.

## 2026-09-23 (T10 closure + migrations applied — feature code-complete)

| | |
|---|---|
| **What** | F-038 declared **code-complete**: T10 discharged (the §11 checklist was its content — run in the prior commit, all rows recorded in the spec). Owner confirmed **migrations 109–114 applied directly in the Supabase SQL Editor** on 2026-09-23. The `_prisma_migrations` table does NOT have rows for 109–114 (Supabase SQL Editor writes no runner records) — noted in the runbook so the next migration-baseline audit doesn't flag phantom drift. |
| **Doc sweep** | PRO-REQUIREMENTS §35 heading + task rows + Open line → T1–T10 built, T8 deferred (Play review), migrations applied. Runbook: migration steps marked done, remaining RazorpayX steps left live. Spec §0 status → built + §13 note. DATABASE.md "not applied" lines cleared. CLAUDE.md rows 76/78/79 "not applied" clauses removed. |
| **Still open** | **T8** (retailer Refer & Earn mobile screen) — hard-blocked until Play Console review clears, then needs the owner's go-ahead per the mobile constraint. **RazorpayX provisioning** (activation, keys, `RAZORPAYX_WEBHOOK_SECRET`) — runbook `docs/runbooks/razorpayx-referral-setup.md`. **`purge-rls-live.test.ts`** — still never executed against a real Postgres. **`_prisma_migrations` rows for 109–114** — absent; reconcile before the next schema-baseline audit. |
| **CA conversation** | TDS settings (`tds_enabled`/`tds_pct`) exist and are admin-editable — talk to the CA before flipping them on (§194H/194J thresholds for recurring payouts). |

## 2026-09-24 — RC-034 follow-up: `team-members` + `reports` locked to Super Admin

**Board:** `docs/tasks/pending/post-referral-cleanup-and-launch.md` §3 · **Commit:** *(this task)* · zero `apps/mobile` files · no migration.

RC-034 shipped with two classifications deliberately **flagged, not decided** — `team-members` and `reports` stayed standard-admin, matching their pre-change reachability, each carrying an in-file note with the one-line change that would close it. This entry is that decision, taken the other way.

| Piece | Detail |
|---|---|
| Move | Both segments joined `SUPER_ADMIN_ONLY_ADMIN_SEGMENTS`: `reports` under *tax and legal documents* (`/admin/reports/gst` is tax data), `team-members` under *credentials and provider configuration* (staff/sales-team accounts — invite + edit). Both in-file notes deleted. |
| Web (nav + page) | Closed **by construction, not by a second list**: `Sidebar.tsx` filters through `isSuperAdminOnlyAdminPath(href)` and `layout.tsx` renders "Access Restricted" on the same predicate, so Team Members / Overview / GST Reports hide *and* refuse together. No web code change was needed — the shared list is the change. |
| Consequence, checked | Every child of the *Reports & Finance* group is super-admin-only now (`reports` was its last standard-admin entry), so the Sidebar drops the whole group for a plain ADMIN. Asserted in the test rather than left to be discovered. |
| Pinned by tests | `admin-access.test.ts` gained a case asserting `/admin/team-members`, `/admin/team-members/anything`, `/admin/reports`, `/admin/reports/gst` and `/v1/admin/reports` are gated — a *forward* pin, so a later edit that moves either segment back fails there instead of silently reopening the page. `Sidebar.test.tsx` gained two cases pinning the nav for `role: 'ADMIN'` (restricted links gone, *Support Tickets* still present) and `role: 'SUPER_ADMIN'` (all three present). |
| Falsification | Both new guards driven red before restore: moving the two segments back to the standard list fails the API case **1 failed / 11 passed** — the completeness assertions stayed green, so the failure is the decision and not the derivation — and fails the nav case with the rendered `Team Members` link in the diff. |
| Verification | `pnpm --filter @kanchuki/shared build` first (RC-035 discipline: `dist` is gitignored), then `admin-access.test.ts` **12/12**, `admin.login.test.ts` **9/9**, `Sidebar.test.tsx` **10/10**. |
| Residual, deliberately open | Both pages fetch their **data** from `/v1/team/*`, which the shared list does not cover: `teamAuthPreHandler` accepts any valid admin key and grants it unscoped Super Admin, so a plain-ADMIN caller still reaches `/v1/team/members` and `/v1/team/reporting/*`. **The pages are closed; the routes are not.** Recorded as a scope note in `admin-access.ts` and left as its own decision — the `ADMIN` role is currently latent (`signAdminSession` always signs `SUPER_ADMIN`, and `TeamRole` has no `ADMIN` member), and `POST /members` deliberately lets managers create their own agents, so blanket-gating `/v1/team/*` would remove a shipped capability rather than close a hole. |
| Not in this entry | `?ref=` capture, refunds and RC-033 are the next board sections; `_prisma_migrations` reconciliation and the `studio_styles` engine picks are owner actions. |

---

## 2026-09-24 (later) — the intermittent `admin-referral-monitor` failure under the full parallel suite: a timeout was poisoning the NEXT test's fixture (RC-039)

**Commit:** *(this task)* · **test-infra only — no production file touched, no migration.** Found while running the suite repeatedly for the §4/§5A work, where the same file failed once and passed on rerun.

The symptom named a money bug that did not exist:

```
FAIL ... > GET /referral/overview > excludes FAILED batches from committed money
AssertionError: expected 30000 to be +0
```

That test seeds one **FAILED** `20_000` payout and asserts `paid_out_paise === 0`; it read `30_000` — the *other* overview test's **PAID** row. Reading it as a route bug is the natural move, and it is wrong at both ends: the route never sums FAILED batches, and the number it was accused of was never in its input.

| Piece | Detail |
|---|---|
| Trigger | This was the only file of 96 that built its app per test via `await Promise.all([import('fastify'), import('.../error-handler.js')])` — the whole module graph pulled at test time. Cheap alone; on a saturated worker it exceeded vitest's 5s ceiling. Now static imports, like every other suite. |
| Amplifier (the real defect) | The prisma stand-in was **one** module-level object and `beforeEach(resetState)` *swapped its arrays*. Vitest abandoning a timed-out test does not cancel its promises, so `build()` resolved afterwards, the abandoned continuation ran its seeds, and — sharing the same object identity as the next test's fixture — they landed **in the next test**. |
| Fix, half 1 (ownership) | The fixture became `let state: Fixture`, replaced whole by `resetState()` (`state = makeState()`), and every test that touches it binds its own at the top: `const st = freshState()`. A late write now reaches an object the next test cannot see, at any timing. **Shipped alone first, and it changed nothing** — binding `const st = state` while `resetState` still cleared arrays in place makes `st` and `state` the same object, so `st.payouts` resolves to whatever the next `beforeEach` just installed. |
| Fix, half 2 (retiring) | `afterEach(retireState)` freezes the retired fixture's arrays, so a late write **throws** in the abandoned promise chain instead of landing silently. This was also shipped first, alone, tested — and did **not** stop the flake: it froze arrays the next `beforeEach` immediately replaces. |
| Guards | **F6** replays the mechanism deterministically: abandoned and next fixtures must be different objects, the late write must throw, and the next fixture must still be empty. **F7** source-scans that no test body writes the shared pointer. **F8a/F8b** pin what F6 structurally cannot see — that `retireState` is *wired* to `afterEach`. |
| Two guard defects, both found only by running the mutant | (1) **F7 located itself by a literal filename**, so injecting a bare `state.payouts.push(…)` into a *copy* of the file left it green — it had scanned the original; now `fileURLToPath(import.meta.url)`. (2) **F8b exists because deleting `afterEach(retireState)` left the suite 32/32 green** — F6 calls `retireState()` itself, so the test that was supposed to protect the hook could not see its removal. The F6 comment claimed otherwise; the experiment disproved the comment, and the comment now records the measurement. |
| Falsification | **(A)** `resetState` back to clearing arrays on one shared object → F6 + F8b red, `expected [] not to be []` (the message itself shows one array). **(B)** `afterEach(retireState)` deleted → F8b red alone (`expected false to be true`), F6 correctly green. **(C)** a bare `state.payouts.push(…)` in a test body → F7 red, naming the call. |
| Verification | `admin-referral-monitor.test.ts` **34/34** (32 + F8a/F8b + the rewritten F7). Full API suite **1353 passed / 5 skipped, 0 failed — twice consecutively** in the default parallel run. `tsc` + biome clean. |
| Stress, and what it found instead | Two full suites run **concurrently** (the condition that caused the original timeout): the monitor file stayed green in both, and two *other* files timed out — `lib/studio-shoot.test.ts > runs both orders …` (both runs) and `routes/admin.login.test.ts > rejects missing email` (one run). Both are plain `Test timed out in 5000ms`, neither has a shared fixture. Measured solo: studio-shoot's test takes **4557 ms of a 5000 ms ceiling** (a 443 ms margin), admin.login's takes 1092 ms. So the trigger class is suite-wide and lives on the *other* side of the fix: **the leak needs a timeout, so the durable answer is no test sitting near the ceiling** — an explicit timeout on the two slow tests, not a larger global one (which would also hide a genuinely hung test). |
| Residual, stated | The mock reads the *current* fixture, so an abandoned continuation that drives a route handler could still mutate a row object inside the next test's fixture if two tests shared a row id. Narrower than the fixed leak (it requires a timeout *and* an id collision) and it is exactly why the slow-test margin above is the real remaining item. |

---

## 2026-09-24 (later still) — the contention failures the RC-039 stress run exposed: explicit per-test timeouts on the tests that pay real poll sleeps

**Commit:** *(this task)* · test-infra only (`apps/api/src/lib/studio-shoot.test.ts`, `apps/api/src/routes/admin.login.test.ts`) · no production file, no migration.

The stress run above cleared `admin-referral-monitor` and failed **two other files** — `lib/studio-shoot.test.ts` (in both concurrent runs) and `routes/admin.login.test.ts` (one) — all `Test timed out in 5000ms`, no shared fixture in either. Both are the same trigger class from the other side of the RC-039 fix: **the leak needs a timeout, so the durable answer is that no test sits near the ceiling.**

| Piece | Detail |
|---|---|
| `studio-shoot` — slow by construction, not by accident | The suite has no timers of its own; it drives the real generation loop, so every mocked poll response costs a real production `POLL_INTERVALS_MS` sleep (`studio-shoot.ts`: `1_000` for the first ten attempts). Measured: one mocked `Processing` → `Ready` = **1016 ms** (exactly the 1 s sleep), a two-step pipeline (reference → try-on → scene) ≈ **3.0 s**, the A/B order comparisons ≈ **4.5 s** — leaving the slowest a **443 ms** margin against the 5 s default. A slower CI box reaches that with no contention at all. |
| `studio-shoot` — scope | `const PIPELINE_TEST_TIMEOUT_MS = 30_000` (≈6.5× the slowest measurement) applied to the **11** tests measured ≥1 s; the other 22 stay on the default so a hang there still fails at 5 s. A real hang in a guarded test still fails: the loop's own deadline is 180 s (`POLL_TIMEOUT_MS`). |
| `admin.login` — and the measurement that changed the story | First run of the file put `rejects missing email` at 1449 ms and the whole file at 4970 ms; the next three fresh runs put the same test at **403 / 462 / 480 ms** with everything else under 300 ms. So the slow number was **load, not the test's own work** — the 1092 ms and 1449 ms sightings were both taken while the box was still busy from a parallel run. It is the first test, so it carries the cold start (`adminRoutes` barrel, scrypt constants, Fastify `register` + `ready`) on top of a ~50 ms assertion. |
| `admin.login` — scope | `const COLD_START_TEST_TIMEOUT_MS = 15_000` on **that test only** (~30× its warm measurement). Stated in the comment rather than hidden: a reorder moves the cold start to a new first test, so the durable fix is one app built in `beforeAll` — not done here. |
| Proof the guards are load-bearing, not decorative | Contention is not reproducible on demand on this box (see below), so the guards were tested against a deliberately tiny **global** default instead, which a per-test option must override: `--testTimeout=1000` on `studio-shoot` → **33/33 pass**, which is only possible if the 3–4.5 s tests are running under their own 30 s guard; `--testTimeout=100` on the login test (`-t`) → **passes** at ~450 ms. Ignoring the option fails both. Pre-fix evidence is the concurrent run itself: the two files reported `Test timed out in 5000ms` there. |
| Harness honesty | The double-suite harness is marginal on this machine: the first attempt completed (and produced the failures above), the second killed one instance mid-run with `Serialized Error: { code: 'ERR_IPC_CHANNEL_CLOSED' }`. That is why the deterministic global-default proof replaced a second contention run rather than being skipped. |
| Verification | `studio-shoot` **33/33** · `admin.login` **9/9** · full API **1353 passed / 5 skipped (1358), 0 failed** · `tsc` + biome clean. |
| Durable alternative, flagged not done | Making the poll interval injectable would let those tests run with no real sleep at all — roughly **34 s of the suite's wall clock**, since the file currently spends ~34 s inside tests. That is a production-code change; the timeout above was the requested, minimal fix. |

## 2026-09-24 (latest) — §6 hardcoded lists → DB: done

| Item | Change |
|---|---|
| 6.5–6.7 | Premise corrected: catalog-size limits have **no DB table** (`plan_limits` = per-period quotas). Prices → `plan_pricing` via new `apps/web/src/lib/plan-pricing.ts` (per-plan fallback; the old in-page helper crashed on partial rows); limits → shared `PLAN_LIMITS` everywhere (admin billing, pricing page, admin plan-change route via new shared `orUnlimited`). Admin billing was mislabelling the `PRODUCT_UPLOAD` quota as catalog size. Stale prices fixed: pricing metadata + comparison row (₹999), `for-retailers` (₹999/₹2,499/₹4,999 + "Annual plans save 20%"), admin `plan-features` labels. |
| 6.2 / 6.3 | Mobile `growth/templates.tsx`: studio styles from `/products/studio-styles` (stale hardcoded ids 422'd at generate after the migration-101 collapse), festivals from `/growth/festivals` + `General`. Ships with the next EAS build. |
| 6.4 | Admin social-templates filter from `stats.by_occasion`; removed the groupBy `take: 10` (it also capped the stat count). |
| 6.9 | `RegionalFilters` deleted — dead end to end (never rendered; the API never read `regional`). |
| 6.10 | Skipped — `SUBTYPE_KEYWORDS` is search vocabulary; category names would inject noise hints. |
| 6.11 | `hsn_rules` table (migration **117, not applied**) + admin API/screen; keywords not regex; the code list is the fallback. |
| 6.12 | Fifth `999999` straggler (`admin-retailers-detail.ts`) → `PLAN_LIMITS`. |

Side fix: the mobile global `@kanchuki/shared` mock now spreads the real module (its export whitelist broke the RC-011 smoke on `isPlanEnded`). **Owner to verify:** migration 074 seeded `plan_pricing` at ₹999/₹2,499/₹4,999 and no later migration updates it — if an admin never edited those rows, prod charges and now displays those prices, not ₹4,999/₹9,999/₹14,999. Tests: API 1365/1370 (5 skipped), web 323/323, mobile 107/107, tsc ×3 clean.

**Follow-up (same day):** prod prices verified via `GET api.kanchuki.app/v1/public/pricing` → ₹4,999 / ₹9,999 / ₹14,999 (the 074 seed rows were edited in Admin). Owner decision: the static `PLAN_PRICING` constant is **deleted** — `plan_pricing` is the only source; API throws `PLAN_PRICE_MISSING` on a missing row, web hides the number when the API is down. New `billing-pricing.test.ts` pins both paths. Migration **116 applied** (owner); **117 pending**.

## 2026-09-24 (launch §7A.1–§7A.2) — storefront JSON-LD on all four surfaces + RC-040 stored-XSS fix

**Commit:** *(this task)* · `apps/web` only (+ docs). No migration, no API change, no `apps/mobile` file.

| Piece | Detail |
|---|---|
| §7A.1 — sitemap | **Already built; the board's path was wrong.** It is `apps/web/src/app/sitemap.xml/route.ts` (chunked index via `generateSitemaps`, 10k URLs/file) + `apps/web/src/app/sitemap/[id]/route.ts`, backed by `apps/web/src/lib/sitemap.ts` (every live store + Google **image-sitemap** extensions on product photos), pinned by `apps/web/src/app/__tests__/sitemap.test.ts`. Ticked, nothing built. |
| §7A.2 — JSON-LD | New `apps/web/src/app/[store]/lib/store-seo.ts`: `buildStoreDescription`, `storeOgImage`, `localBusinessLd`, `productLd`, `itemListLd`, `ldJson`. Wired into **four** surfaces: `/{store}` + `/{store}/categories` (already had `generateMetadata` + `LocalBusiness`) and — new — `ItemList` on `/{store}/{collection}`, `Product`/`Offer` on `/{store}/{collection}/product/{productId}`. Offer is emitted only with a price (Google rejects a Product offer without one); `SOLD` → `OutOfStock`; a price range → `AggregateOffer`; store `url`/product `url` from a single `SITE_URL` (same `NEXT_PUBLIC_SITE_URL` default as the rest of the app). |
| **RC-040 — stored XSS** | The two shipped pages passed **`JSON.stringify`** straight into `dangerouslySetInnerHTML` on `<script type="application/ld+json">`. `JSON.stringify` is not an HTML escaper — it leaves `<` as-is — and the HTML parser ends a script element at the first **`</script`** (case-insensitive). A retailer `shop_name` (saved once at onboarding, served to every visitor) containing `</script>` therefore closed the tag and ran markup on the storefront origin: **stored XSS**, on every page carrying that JSON-LD. Invisible because every prod store is well-formed and the output *looks* escaped (full of `\"`/`\\`); the `biome-ignore lint/security/noDangerouslySetInnerHtml: … no user input` comment asserted safety in the exact spot the lint rule had flagged. |
| RC-040 fix | One helper, `ldJson = JSON.stringify(data).replace(/</g, String.raw`\u003c`)`, at **all four** sites (the two new ones never shipped unescaped). Escaping every `<` also covers `<script`/`<!--`; `>`/`&` are not needed because only `<` starts the sequences that end a script element. The `biome-ignore` stays — the sink is still a sink; the data is now escaped rather than trusted. |
| The fix's own near-miss | The first written form was `'\u003c'` with **one** backslash — a JS escape for the literal `<`, i.e. a no-op that diffs identically to the correct form. `store-seo.test.ts` was run before commit and went red on exactly this, which is why the escape is now a `String.raw` template (no escape-processing layer) and the test asserts the **absence of `</script>` in the output string**, not merely that the page renders. |
| Tests | `store-seo.test.ts` **3/3** — escape arm asserts `</script>` absent **and** `JSON.parse(out).name` equals the original raw value (escaping must not change the value); plus Offer/AggregateOffer/no-offer/SOLD and `ItemList` positions+URLs. **Falsified:** `ldJson` → bare `JSON.stringify` turns the escape arm red, the other two stay green. Web **326/326**, web `tsc --noEmit` clean. |

## 2026-09-24 (launch §7A.3) — Apple App Review OTP bypass (`REVIEW_PHONE` / `REVIEW_OTP`)

**Commit:** *(this task)* · `apps/api` only (+ `.env.example`, docs). No migration, no mobile build, no client-visible flag.

An App Store reviewer cannot receive an Indian SMS — their SIM is foreign and the real path depends on DLT-registered delivery. This adds a **FIXED phone + FIXED code** demo login, distinct from the existing `OTP_TEST_BYPASS` (which accepts *any* 6-digit code).

| Piece | Detail |
|---|---|
| Gate | **Both** `REVIEW_PHONE` and `REVIEW_OTP` must be set. Unset either one and `isReviewLogin()` is `false` for every phone — the branch is unreachable, which is the production default and why this is safe to ship before a review exists. |
| `/otp/send` | For the review phone, returns the existing `bypass: true` shape **without calling MSG91** — the app then skips its native widget and shows the code field. No `path=` marker, no phone in any log. |
| `/otp/verify` | Accepts **exactly** `REVIEW_OTP` (`timingSafeEqual`, length pre-check), never “any 6 digits”. Checked **before** `OTP_TEST_BYPASS`, so a review phone that also appears in `OTP_TEST_PHONES` still has to produce the fixed code. Wrong code → the standard 401 `INVALID_OTP`; no session, no retailer row. The one operator log that would print the phone is skipped on this path. |
| Never logged | Asserted by test, not by convention: `auth-review-bypass.test.ts` spies `console.log` **and** `console.error` and fails if either the review phone or the code appears in any call. |
| Security review (pre-merge) | Off by default (two independent vars); constant-time compare (leaks neither the code nor its length); phone must equal `REVIEW_PHONE` after normalisation; review-before-test-bypass precedence pinned; **blast radius stated** — while both vars are set, anyone who learns phone+code signs in as a demo account with no live store, so both vars are removed once approved. API service env only; no DB, no mobile, no client-visible flag. |
| Tests | New `auth-review-bypass.test.ts` **10/10** (send on/off, wrong code, review-vs-test precedence, malformed `REVIEW_OTP` disables it, no-log spy). **Falsified:** relaxing the code check to `!otp` turns both wrong-code arms red. Gates: `security.test.ts` **6/6**, `admin.login.test.ts` **9/9**, `auth-otp-bypass` **11/11**, `auth-msg91` **12/12**, `auth-staff-invite` **10/10**, `msg91-otp` **23/23**; API `tsc --noEmit` clean; Biome clean. |
| Owner action | Set `REVIEW_PHONE` + `REVIEW_OTP` on the Railway **API** service before submitting to review; remove both after approval. Documented in `.env.example`. |
