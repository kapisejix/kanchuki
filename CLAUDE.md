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
- Guided bulk onboarding for large stores (500–3000+ SKUs, F-001d, planned): rack/shelf batch-photo capture reusing F-001c multi-item detection + supplier PDF/catalog reuse reusing F-001b import — see `docs/PRO-REQUIREMENTS.md`
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
| **Role separation docs** | `docs/SECURITY.md` §19 | Updated to [x] Phase D checklist + §19.6 build table. Role-creation SQL in §19.1: `kanchuki_app` (no DELETE/TRUNCATE/DROP) vs `kanchuki_migrator` (human-only, never in `.env`) |
| **Purge cron** | `apps/api/src/jobs/purge-soft-deleted.ts` | Daily cron (1:30 AM UTC). Batch-purges soft-deleted records >30 days old. Uses `SET app.allow_hard_delete = 'true'` to bypass triggers. Cursor-based batching, FK-safe order (children before parents). Writes audit log |
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

---

## Built: Marketing Page Redesign — Loom Design System (Option A)

**Built 2026-07-28** — design direction decided + implemented. Full audit, four direction options with pros/cons, and the chosen system spec live in `docs/design/emil-design.md`.

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

## Built: Product-Level WhatsApp Share Button (F-006 gap) + Ratings Reviewed

**Built 2026-07-30.** Full research on three user-proposed features (cross-store coupon network, ratings, WhatsApp share) in `docs/design/feature-ideas-2026-07-30.md`. Two of three acted on:

- **WhatsApp share on product detail (done):** `CollectionView.tsx` already had a working share button (`navigator.share` Web Share API). `ProductDetailSheet.tsx` (single-product view) did not — added the same pattern (`Share2` icon next to the favorite heart), sharing the current page URL + product name/category as title. No new dependency — Web Share API was already in use in this codebase. Falls back to clipboard copy on browsers without `navigator.share`. Spec updated in `docs/PRO-REQUIREMENTS.md` F-006, `docs/PLAN.md` Month 4c.
- **Ratings system (planned, not built):** spec written as F-021 in `docs/PRO-REQUIREMENTS.md` §10.12, roadmap slot in `docs/PLAN.md` (Future, post-MVP). Gate rating eligibility behind a prior enquiry/order — open ratings on a catalog with no purchase-verification invite fake reviews. Not in locked MVP scope; candidate for early Phase 1. Includes a `Retailer.google_place_id` Google-review deep-link CTA (rating ≥4 → prompt; ≤3 → private feedback instead) — flagged in spec as "review gating," a pattern against Google's Business Profile policy; built because explicitly requested, risk is the retailer's/platform's call.
- **Cross-store coupon network:** reviewed, not spec'd — deferred, needs retailer density Kanchuki doesn't have yet plus an unresolved money-settlement/GST question between two retailers. See the doc for the cheap way to test the idea first (manual redemption, no ledger).

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

**Still open (not part of this pass):** dark mode (0 `useColorScheme` usage in `apps/mobile`), the 6-destination bottom tab bar (exceeds the 3–5 spec both platforms give — recommend `/impeccable shape` to redesign), tablet/window-size adaptivity (only 4/48 screens are size-aware), and the mobile/web accent-color drift on `rust`/`turmeric`/`sand` tokens (only `ink`/navy is currently kept in sync). See `docs/design/design-work.md` for the full P0–P3 list.

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
