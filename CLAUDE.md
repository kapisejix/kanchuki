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
| Logomark | `apps/web/src/components/KanchukiMark.tsx` (new) | Interlaced-thread device, shared by Navbar + Footer |
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

## Planned — NOT started: Multi-Photo Ken Burns Effect (product photos → pseudo-video)

**Requested 2026-08-05. DO NOT START until user says go ahead.**

User wants: retailer clicks 3 photos of one product → auto-combine into short "video-like" loop (pan+zoom+crossfade between shots), not a real encoded video file. Wants it in **both** mobile retailer app and web customer PWA.

**Proposed approach (discussed, not built):** Ken Burns effect — each photo scale 1→1.15 + translate over ~2.5s, crossfade opacity into next photo, loop 3 photos. No server cost, no AI call, no video encode.
- **Mobile (`apps/mobile`):** Reanimated (already a dep, used for `AnimatedPressable`/`GradientButton`) — animate scale/translate/opacity per photo, likely on product detail (`app/product/[id].tsx`) or catalog card.
- **Web (`apps/web` customer PWA):** pure CSS `@keyframes` transform+opacity crossfade, no JS lib needed — likely `CollectionView.tsx` product card and/or `ProductDetailSheet.tsx` hero.

**Explicitly out of scope for this version:** exporting a real downloadable/shareable mp4 (would need ffmpeg server-side render, real compute cost) — only asked for an in-UI animated loop.

---

## Key Risks

1. **VTO quality for ethnic wear** — saree draping, unstitched suit layering hard for existing APIs
2. **Retailer upload behavior** — many will try once and drop off
3. **WhatsApp API dependency** — Meta can change pricing/access
4. **AI cost per try-on** — margin tight at ₹999/month plan

---

## Project File Index

| File | Purpose |
|------|---------|
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
10. **Docs must track commits** — when a feature commit lands, update its status ("Planned"→"Built") + date in CLAUDE.md, `docs/PLAN.md`, and `docs/PRO-REQUIREMENTS.md` in the same session. Stale status here (F-018/F-019 sat marked "nothing built" after the build commit) caused a wrong status report on 2026-07-28 — check `git log` against doc status before trusting either.
