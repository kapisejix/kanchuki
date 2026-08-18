# Kanchuki — Build Log (Feature History)

Full chronological build history for Kanchuki. **CLAUDE.md** keeps only a
one-line index of these entries; this file is the detail for every feature,
incident, migration, and decision recorded after 2026-07-26.

## Table of Contents

| # | Section | Status | Date |
|---|---------|--------|------|
| 1 | [Admin Control Center — Permission Matrix, Trust & Safety, Deletion Vault, DB Guardrails (F-013…F-017)](#built-admin-control-center--permission-matrix-trust--safety-deletion-vault-db-guardrails) | Built | 2026-07-26 |
| 2 | [Phase 0.5: Internal Team Management](#phase-05-internal-team-management--all-code-items-completed-) | Built | — |
| 3 | [L2 Ecommerce Checkout (planned)](#planned-l2-ecommerce-checkout-whatsapp-stays-messaging-only) | Planned | 2026-07-24 |
| 4 | [Sales Referral Attribution + Paid Catalog Upload (F-018/F-019)](#built-sales-referral-attribution--paid-on-site-catalog-upload-service-f-018f-019) | Built | 2026-07-28 |
| 5 | [Marketing Page Redesign — Loom Design System](#built-marketing-page-redesign--loom-design-system-option-a) | Built | 2026-07-29 |
| 6 | [Admin-Configurable Platform Theme](#built-admin-configurable-platform-theme-2026-07-29) | Built | 2026-07-29 |
| 7 | [Product-Level WhatsApp Share + Ratings Reviewed](#built-product-level-whatsapp-share-button-f-006-gap--ratings-reviewed) | Built | 2026-07-30 |
| 8 | [F-023 AI Provider Registry](#built-f-023-ai-provider-registry--admin-configurable-tagging-models--per-provider-usage) | Built | 2026-08-01 |
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
| 39 | [F-032 AI Studio Shoots + Product Videos](#planned-2026-08-13-f-032-ai-studio-shoots--product-videos-photoroom-style) | Planned | 2026-08-13 |
| 42 | [Admin Commission Tracker — 3% of Monthly Payments + Expense Ledger](#built-2026-08-17-admin-commission-tracker--3-of-monthly-payments--expense-ledger) | Built | 2026-08-17 |
| 43 | [Retailer Auth — Login / Create Account toggle](#built-2026-08-17-retailer-auth--login--create-account-toggle) | Built | 2026-08-17 |
| 48 | [AI Campaign Assistant (E)](#built-2026-08-18-ai-campaign-assistant-roadmap-e) | Built | 2026-08-18 |
| 49 | [Phase II — WhatsApp Native Catalog Sync](#built-2026-08-18-phase-ii--whatsapp-native-catalog-sync-f-307--roadmap-p) | Built | 2026-08-18 |

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

## Planned: L2 Ecommerce Checkout (WhatsApp stays messaging-only)

**Decided 2026-07-24** — full spec `docs/PRO-REQUIREMENTS.md` F-302/F-307, schema `docs/DATABASE.md`, threat model `docs/SECURITY.md` §11, roadmap slot `docs/PLAN.md` Month 15–16.

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

## 🔴 PLANNED 2026-08-13: F-032 AI Studio Shoots + Product Videos (PhotoRoom-style)

Spec: `docs/PRO-REQUIREMENTS.md` §24, roadmap `docs/PLAN.md` (Future slot). Written after deep research into PhotoRoom's published tech stack and the 2026 image/video model landscape. NO CODE — do not start until the user says go.

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

**Design decisions:** `preferred_locale` is nullable with a DB default ('en-IN') so no backfill is needed for existing retailers. The locale list uses BCP-47 codes (e.g. `hi-IN`, `hi-Latn-IN` for Hinglish) — this is the standard that i18next and `expo-localization` expect, so the post-launch i18n framework can consume it directly. The API `SUPPORTED_LANGUAGES` map in `growth-translate.ts` (simple keys: `hindi`, `hinglish`) is intentionally kept separate — it drives Claude prompt suffixes, not UI locale switching.

**Verified:** API `tsc --noEmit` clean + `vitest run` 33/33 retailers tests pass; mobile `tsc --noEmit` clean; web `tsc --noEmit` clean; shared `tsc --noEmit` clean. **Still pending:** migration 063 NOT applied (Supabase SQL Editor / `prisma migrate deploy`). Full M sub-tasks (native mic, PWA toggle, retailer UI toggle) deferred post-launch.