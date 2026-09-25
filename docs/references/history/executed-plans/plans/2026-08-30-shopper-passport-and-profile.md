# Shopper Passport + Unified Profile + Recommendations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Documentation-first:** this plan is the task map. Each task lists files, interfaces, the skills to load, the test approach, and acceptance criteria. Per-task bite-sized TDD steps (failing test → run → implement → run → commit) are expanded by the executor when that task starts, using `superpowers:test-driven-development`. **No code is written until a task is picked up.**

**Goal:** Give every Kanchuki shopper one OTP-verified identity ("Shopper Passport") reused across all partner-store QR codes, then build the cross-store activity profile and recommendation engine that identity unlocks.

**Architecture:** One root domain (`kanchuki.com/{store}`) → a server-set `HttpOnly` session cookie carries the passport between stores. A global `CustomerAccount` sits above the existing retailer-scoped `Customer` rows; contact flows into a retailer's CRM only on an explicit per-store consent tap. Activity from every store attaches to `CustomerAccount`; a pgvector cosine + rules pipeline (no ML training) powers a "For You" feed, personalized search, and store discovery.

**Tech Stack:** Next.js 14 (customer web), Fastify + TypeScript (API), Prisma + PostgreSQL 16 + pgvector, Redis (session cache + rate limit), MSG91 (OTP + WhatsApp), BullMQ (jobs), existing WhatsApp Catalog Sync.

**Spec:** `docs/customer/customer-qr-identity-solution.md` (§1–§14 identity, §15–§19 profile/recommendations). Prior context: `docs/customer/customer-profile-req.md` (Option C = roadmap item 21; items 22–24 delivered here).

## Global Constraints

- **INR only** — all money in **paise** (integer). Never hardcode USD.
- **DPDP Rules 2025** — consent is free / informed / specific / **affirmative**. No pre-ticked boxes, no timer-as-consent. Every consent + withdrawal writes a `ConsentEvent` row with `notice_version`.
- **RLS from day one** on every new PII table (`kanchuki-rls-convention`). Retailer role sees only its own `retailer_id` rows, and only `contact_shared = true`.
- **No new deploy paths** — push to `main`, Railway auto-deploys. Never `railway up`.
- **Redis clients** — eager connect + `awaitRedisReady()`; never reintroduce `lazyConnect` (CLAUDE.md "Redis handshake race").
- **OTP** — WhatsApp-first, SMS fallback. SMS blocked on DLT sender-ID registration (account-side).
- **Security tests** after any auth/checkout change: `npx vitest run src/routes/security.test.ts`; after admin-auth change: `npx vitest run src/routes/admin.login.test.ts`.
- **Cookie** — `Set-Cookie` header from the apex origin only. `HttpOnly; Secure; SameSite=Lax; Domain=kanchuki.com`. No PII in the cookie. Never `document.cookie`.
- **Frequency cap** on proactive messages: 2 / week / store, muted stores skipped, checked at send time.

---

## Codebase Reality Check (2026-08-30 review — read before executing any task)

A pass over the live codebase changed several assumptions. **Blockers must be resolved before Phase 1; reuse notes shrink Phases 4–7.**

### 🔴 Blockers

1. **No server-side WhatsApp OTP.** `apps/api/src/lib/msg91-otp.ts` is SMS-only (`MSG91_TEMPLATE_ID` = a DLT **SMS** template) plus widget-token verify (`verifyMsg91WidgetToken`). SMS delivery is blocked on DLT sender-ID registration (CLAUDE.md, still open). ⇒ **New Task 0** (below) decides + builds the OTP delivery channel before Task 2. Options: (a) build MSG91 WhatsApp-OTP send, (b) embed the MSG91 **widget** on web (mobile already uses it; `verifyMsg91WidgetToken` already server-verifies its JWT — likely the fastest path), (c) wait for DLT. Passport cannot ship without this.
2. **No public customer search endpoint.** `routes/search.ts` is retailer-scoped (`request.retailerId`, in-store AI search). The customer storefront only does category/tag filtering (`public-products.ts`, `public-retailers.ts`). ⇒ **Task 22 rescoped**: it must first stand up a *new* `POST /v1/public/search` (reusing `embedSearchQuery` + the `search.ts` hybrid pattern), then personalize it — not "re-rank an existing endpoint."
3. **Customer-side activity logging is net-new.** Exactly one `customerInteraction.create` exists (`routes/customers.ts:268` — a *retailer* logging against a customer). Public favorite = anonymous `favorite_count++` + client localStorage (`public-collections.ts:274`). No per-customer view/enquiry record anywhere. ⇒ **Tasks 11–12 rescoped**: there are ~no existing call sites to "update"; the write path is new and the client beacon (Task 12) is the *primary* ingestion, not a supplement.

### 🟢 Reuse — do NOT rebuild

| Plan said "new" | Actually exists | Use it |
| --- | --- | --- |
| `lib/fashion-dna.ts` (affinity + vector) | `jobs/update-fashion-dna.ts` + `@kanchuki/ai` `computeFashionDNA`, `formatPreferenceVector`, `MIN_INTERACTIONS_FOR_DNA` + `FASHION_DNA` queue + `addFashionDNAJob` — **worker is commented out** in `jobs/index.ts` (~line 305), logic is retailer-scoped | **Tasks 15–16 = re-enable the worker + generalize to `customer_account_id`**, extend `@kanchuki/ai/fashion-dna.js`. Not a greenfield lib. |
| `jobs/product-embedding-backfill.ts` | `jobs/generate-embedding.ts` + `addEmbeddingJob` + `EMBEDDINGS` queue, already fired on product create (`products-crud.ts:368`) and post-tag (`tag-product.ts:205`); raw upsert `ON CONFLICT (product_id)` | **Task 17 = one-time backfill sweep + confirm bulk-onboard / status→ACTIVE paths enqueue.** Reuse `EmbeddingJobData = { product_id, retailer_id }`. |
| `lib/recommend.ts` from scratch | `routes/search.ts` = pgvector KNN + `extractBudgetFromQuery` + `normalizeSearchQuery` + `isNewArrival` boost; `embedSearchQuery`/`formatVectorLiteral` in `@kanchuki/ai` | **Task 20 extends the `search.ts` pattern**, shares the KNN + budget + new-arrival code. |
| 6 new BullMQ job files (implied own queues) | `jobs/index.ts` — queues registered via `QUEUES` enum in **`@kanchuki/shared`**; low-volume cron jobs share the **`MAINTENANCE`** queue, dispatched on `job.name` (see `catalog-daily-full-sync`) | Add cron jobs to the `MAINTENANCE` switch + a `repeat` schedule. Only high-volume (activity ingest, vector recompute) warrant a new queue. |
| — | `@fastify/cookie` **already registered** with `COOKIE_SECRET` (`index.ts:116`), used for admin CSRF | Task 3 reuses it; pick a cookie name that can't collide with the admin cookie. |
| new `phone_hash` logic | `createHash('sha256').update(normalizeIndianPhone(phone)).digest('hex')` — **unsalted** (`public-retailers.ts:785`); `normalizeIndianPhone` is a shared helper | Tasks 1 / 5 / 6 must use this exact formula so `CustomerAccount.phone_hash` matches existing `Customer.phone_hash`. |
| "hand-written RLS SQL" | raw SQL in `migration.sql`; templates: `038_order_items_rls`, `050_integration_settings_rls`, `031_l2_ecommerce_checkout` | Copy the `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + `CREATE POLICY … USING (…)` shape. **First verify how `retailer_id` is set on the PG session** (the policy predicate depends on it). |
| — | `public-stylist.ts` (AI Stylist, public), `near-me.ts` (geo/city, public) | Context for Tasks 20 / 23 (discovery). |

### 🟡 Missing scope — add or expand

- **Cross-store web shell (new Task 18a).** `/my-profile`, `/my-stores`, `/for-you`, `/discover-stores` live **outside `app/[store]/`** and have no layout/nav/PWA shell today (the customer bottom bar is `[store]`-scoped). Needs its own `app/(shopper)/layout.tsx` + "no passport cookie → sign-in prompt" guard.
- **MSG91 inbound-message webhook (Task 7).** Codebase has MSG91 *delivery-events* + WhatsApp *catalog* webhooks (HMAC), but an **inbound user-message** webhook (needed for `wa.me` deep-link login) is unconfirmed. Verify first; Task 7 grows if it must be built.
- **Retailer push lib (Task 5).** "Reuse the retailer push-notification lib" — existence unverified (Expo push token store + send). Confirm before depending on it for the lead alert; degrade gracefully if absent.
- **`CustomerFashionDNA` dual `@unique` (Task 15).** Keeping `customer_id @unique` and adding `customer_account_id @unique` = two rows per person. Need an explicit precedence rule (identity row wins for recs) + a migration that folds existing retailer rows. Not just a column add.
- **`consent/revoke` + `account-deletion` — VERIFIED, not reusable.** `/account-deletion` is a **retailer-only** static instructions page (delete your *store* via the app). `/consent/revoke` is customer-facing but **VTO-training-data only** — token from the try-on screen → `POST /v1/consent/revoke` → deletes retained training photos; not a general consent hub. ⇒ The passport needs its **own** withdrawal + deletion: new `POST /v1/public/passport/delete` (soft-delete `CustomerAccount`, cascade sessions + revoke, mark `Customer` rows deleted, `ConsentEvent{PASSPORT_DELETED}`) surfaced on `/my-profile` (Task 18/26), plus per-store mute/remove already in Task 8. Copy the `/consent/revoke` card UX; do **not** wire into either existing page.
- **Consent retrofit (Tasks 6 + 27).** Task 6 copies old `Customer.consent_given` → `whatsapp_consent` under the *new* notice text = re-basing prior consent. Explicit item for the Task 27 legal checkpoint, not just copy.

### ⚪ Corrections

- Leads route: param is **`:slug`**, handler at **`apps/api/src/routes/public/public-retailers.ts:756`** (`server.post('/retailers/:slug/leads')`), not a `routes/public/.../leads` file. Fix Task 5's `Files`.
- Cold-start threshold: use the existing **`MIN_INTERACTIONS_FOR_DNA`** constant (`@kanchuki/ai`), not a fresh "5".
- `QUEUES` enum is in **`@kanchuki/shared`**, not `apps/api`.

### Net effect

- **Phase 1 grows**: add Task 0 (OTP channel) on the critical path; Task 18a (shopper shell).
- **Phases 4–7 shrink ~40%**: Fashion DNA, embeddings, and hybrid search already exist — the work is *generalize retailer-scope → identity-scope* + *re-enable a paused worker*, not build.

### Second-pass findings (2026-08-30, deeper verification)

- **🔴 No retailer notification / inbox mechanism exists.** Nothing in `routes/retailers/` for alerts. **Task 5's "retailer gets a push alert" has no backend.** Options: (a) build a minimal `RetailerNotification` table + unread count + mobile poll, (b) drop the real-time alert — the retailer sees the new lead in their Customers tab on next open. Pick (b) for v1 unless the owner wants (a) as its own task.
- **🔴 Automated WhatsApp send is gated per-retailer.** The only automated send path is `routes/growth/growth-campaigns.ts` → `graph.facebook.com/v21.0/{whatsapp_api_phone_number_id}/messages` (Meta WhatsApp **Cloud API**), and it **falls back to `wa.me` deep links the retailer forwards manually** when `whatsapp_api_phone_number_id` is unset (most MVP retailers). ⇒ **Tasks 10 & 24 auto-dispatch only fires for Cloud-API-configured retailers**; for everyone else the "welcome / trigger" is a queued `wa.me` link surfaced in the retailer app, or nothing. State this in each task; don't assume universal auto-send.
- **🔴 `webhooks/msg91.ts` is events-only** (OTP/SMS lifecycle → `AuditLog`), **not an inbound-message webhook.** **Task 7** (`wa.me` deep-link login) needs a **new** inbound webhook — MSG91 WhatsApp inbound *or* the Meta WhatsApp Cloud API inbound webhook (`hub.challenge` verify + message payload). Bigger than "extend the webhook." If this is too heavy for Phase 1, ship Task 7 as "Open in Chrome" nudge only and defer WhatsApp login.
- **🟡 `canMessage` (Task 9) hook points** = the send loop in `growth-campaigns.ts` (~line 532) and any `collections.ts` send path — name those explicitly, not "the dispatch path."
- **⚪ Latest migration is `078_studio_styles`** — number new migrations from **079**.
- **⚪ `QUEUES` lives at `packages/shared/src/constants/index.ts:494`** (re-exported by `@kanchuki/shared`). `normalizeIndianPhone` — confirm its export path before importing (not in the shared barrel root).
- **⚪ MSG91 already has a per-phone resend cooldown** (`msg91-otp.ts`, "SMS-cost guard") — Task 2 reuses it; don't invent a fresh "6 sends / 10 min" rule.
- **⚪ `auth_user_id` on `CustomerAccount` is speculative** — Supabase Auth is **retailer-only** (CLAUDE.md); the passport is cookie-based. Drop the field (YAGNI) or mark it explicitly "future, unused" so nobody wires Supabase for customers.
- **✅ verified — `normalizeIndianPhone`** at `packages/shared/src/utils/index.ts:140`, re-exported via the `@kanchuki/shared` barrel. Import works as written.
- **✅ verified — restock** = `apps/web/src/app/c/[slug]/components/NotifyWhenAvailable.tsx` + `apps/api/src/routes/growth/growth-helpers.ts`. **Recently-viewed** = `apps/web/src/app/c/[slug]/lib/recentlyViewed.ts` + `RecentlyViewedRow.tsx` (localStorage, `ssr:false`).
- **🟡 NEW — two customer storefront surfaces.** The built profile features (#8 recently-viewed, #9 restock) live under **`app/c/[slug]/`** (legacy collection route). The **`app/[store]/`** canonical route has `ContactGate` / `CustomerLookbooks` / `SeasonalPicks` but **not** recently-viewed or restock. **Before Phase 4/6:** resolve which surface a QR / WhatsApp link lands on, whether `c/[slug]` has its own contact gate (Task 4 only touches `[store]`), and whether profile features get ported to `[store]` or `c/[slug]` stays. Task 13's "swap the localStorage tracker" targets `c/[slug]/lib/recentlyViewed.ts`; `[store]` has no tracker to swap.

---

## File Structure

**API (`apps/api/src/`)**
- `routes/public/passport.ts` — OTP send/verify, session `me`, event beacon, `/my-stores` data, data export (new)
- `lib/passport-session.ts` — cookie mint/verify, session store (DB row + Redis cache) (new)
- `lib/passport-activity.ts` — `recordInteraction()` helper, signal weights, called from every event point (new)
- `lib/fashion-dna.ts` — affinity aggregation + `preference_vector` compute (new; may absorb existing retailer-scoped logic)
- `lib/recommend.ts` — the one ranking pipeline (candidates → filters → re-rank → diversity) (new)
- `jobs/fashion-dna-batch.ts`, `jobs/store-affinity.ts`, `jobs/product-embedding-backfill.ts`, `jobs/interaction-retention.ts` (new)
- `jobs/recommendation-triggers.ts` — new-arrival / restock / price-drop / collection (new)
- `routes/public/for-you.ts`, `routes/public/discover-stores.ts` (new)
- `routes/public/retailers/*/leads` — extend with `customer_account_id` + `contact_shared` (modify)
- `routes/retailers/analytics-visitors.ts` — aggregate taste report (new)

**DB (`packages/db/prisma/`)**
- `schema.prisma` — `CustomerAccount`, `CustomerStoreVisit`, `ConsentEvent`, `CustomerRecentlyViewed`, `CustomerWishlistItem`, `StoreAffinity`, `PassportSession`; modify `Customer`, `CustomerInteraction`, `CustomerFashionDNA`, `CustomerLeadSource` (modify)
- `migrations/NNN_*` — one migration per phase, plus hand-written RLS SQL

**Web (`apps/web/src/`)**
- `app/[store]/components/ContactGate.tsx` — passport-aware rework (modify)
- `app/[store]/components/PassportSheet.tsx` — returning-shopper 1-tap sheet (new)
- `lib/passport-client.ts` — session check, event beacon batcher (new)
- `app/my-stores/page.tsx`, `app/my-profile/page.tsx`, `app/for-you/page.tsx`, `app/discover-stores/page.tsx` (new)
- `app/api/passport/**` — thin proxies to API (new, follow existing `app/api/[store]/leads/route.ts` proxy pattern)

**Mobile (`apps/mobile/`)** — retailer visitor-analytics screen only (Phase 8). No customer surfaces.

---

## Skill Legend

| Tag | Skill / agent to load |
| --- | --- |
| `[plan]` | `superpowers:brainstorming` (before the phase), this plan |
| `[db]` | `ecc:database-migrations`, `ecc:prisma-patterns`, `ecc:postgres-patterns`; review via `ecc:database-reviewer` agent |
| `[api]` | `ecc:api-design`, `ecc:backend-patterns`, `ecc:fastapi-patterns` (patterns transfer to Fastify) |
| `[redis]` | `ecc:redis-patterns` |
| `[sec]` | `ecc:security-review`, `security-review`; `ecc:security-reviewer` agent |
| `[fe]` | `frontend-design:frontend-design`, `ecc:react-patterns`, `ecc:react-performance` |
| `[fe-feel]` | `emil-design-eng` or `apple-design` (the 1-tap sheet, gestures) |
| `[a11y]` | `ecc:frontend-a11y`; `ecc:a11y-architect` agent |
| `[recsys]` | `ecc:recsys-pipeline-architect`, `ecc:mle-workflow` |
| `[viz]` | `dataviz` (retailer analytics) |
| `[test]` | `superpowers:test-driven-development`, `ecc:react-testing`, `ecc:e2e-testing`; `agent-skills:test-engineer` agent |
| `[verify]` | `superpowers:verification-before-completion` |
| `[ship]` | `superpowers:finishing-a-development-branch`, `agent-skills:ship` |

Every task ends with `[verify]` + a `code-review` pass before its gate.

---

# PHASE 1 — Identity foundation (delivers `customer-profile-req.md` item 21 / Option C)

### Task 0: OTP delivery channel — decide + build (CRITICAL PATH, blocks Task 2)

**Skills:** `[plan]` `[api]` `[sec]` `[test]`
**Why:** `msg91-otp.ts` sends OTP over **SMS only**, and SMS is blocked on DLT sender-ID registration (CLAUDE.md). The passport needs a working verification channel first.

**Step A — decision (`superpowers:brainstorming` with the owner):**
- **Option 1 — MSG91 web widget** (recommended): mobile already ships it; `verifyMsg91WidgetToken(token, expectedPhone)` already exists server-side (`msg91-otp.ts:304`). Work = drop the widget script on the web gate with `NEXT_PUBLIC_MSG91_WIDGET_ID` / `_TOKEN_AUTH`, POST the returned JWT to the API, call the existing verifier. No DLT dependency (MSG91's provisioned route).
- **Option 2 — build MSG91 WhatsApp-OTP send** — new `sendOtpViaWhatsApp()` in `msg91-otp.ts` using MSG91's WhatsApp API + an approved template; keep `verifyStoredOtp` as-is (same Redis-stored code). SMS as fallback once DLT clears.
- **Option 3 — wait for DLT** — not acceptable as the only path; blocks launch.

**Files (Option 1):**
- Modify: `apps/api/src/routes/public/passport.ts` — `POST /v1/public/passport/otp/verify` accepts `{ phone, widget_token }`, calls `verifyMsg91WidgetToken`, then upserts `CustomerAccount` + mints the session (Task 3)
- Modify: `apps/web/src/app/[store]/components/ContactGate.tsx` — load the MSG91 widget, hand back the JWT
- Modify: `apps/web/Dockerfile` — `NEXT_PUBLIC_MSG91_*` build args (mirror the existing widget args)
- Test: `apps/api/src/routes/public/__tests__/passport-otp.test.ts`

**Files (Option 2 additions):** `apps/api/src/lib/msg91-otp.ts` — `sendOtpViaWhatsApp(phone, code)`; `send` route picks channel (`whatsapp` → fallback `sms`).

**Test plan:** valid widget JWT for the entered phone → verified, account upserted; JWT for a different phone → `401`; replay of a used token → `401`; (Option 2) WhatsApp send failure → SMS fallback attempted, and if SMS unconfigured → clear `503`, not a false "sent".

**Acceptance:** a real phone completes verify end-to-end on web in the chosen channel; decision + rationale recorded in `docs/customer/customer-qr-identity-solution.md` §13-c.

---

### Task 1: Schema + migration — passport core tables

**Skills:** `[plan]` `[db]` `[sec]`
**Files:**
- Modify: `packages/db/prisma/schema.prisma` — add `CustomerAccount`, `CustomerStoreVisit`, `ConsentEvent`; add `Customer.customer_account_id`; add `WHATSAPP_LINK`, `DIRECT_WEB` to `enum CustomerLeadSource`
- Create: `packages/db/prisma/migrations/079_passport_core/migration.sql` (latest is `078_studio_styles`) + hand-written RLS SQL (template: `038_order_items_rls`, `050_integration_settings_rls`; **first confirm how `retailer_id` is set on the PG session** so the policy predicate is right)
- Test: `apps/api/src/lib/__tests__/passport-schema.test.ts`

**Interfaces produced:**
- `CustomerAccount { id, phone (unique, E.164), phone_hash (unique, SHA-256), name?, gender?, city?, state?, usual_size?, is_verified, created_at, updated_at, deleted_at? }` — **no `auth_user_id`**: Supabase Auth is retailer-only, the passport is cookie-based (Task 3). Add it later only if customers ever get full accounts.
- `CustomerStoreVisit { id, customer_account_id, retailer_id, source: CustomerLeadSource=QR_SCAN, first_visited_at, last_visited_at, visit_count, contact_shared=false, whatsapp_consent=false, whatsapp_consent_at?, is_muted=false }` — `@@unique([customer_account_id, retailer_id])`
- `ConsentEvent { id, customer_account_id, retailer_id?, kind: string, notice_version, ip_hash?, user_agent?, created_at }`

**Test plan:** migration applies clean on a fresh DB + on a copy with existing `customers` rows; `phone` / `phone_hash` uniqueness enforced; RLS: a retailer session cannot `SELECT` a `customer_store_visits` row for another `retailer_id` or one with `contact_shared = false`.

**Acceptance:** `prisma migrate deploy` green; RLS test passes; schema matches spec §7 exactly (defaults included — `whatsapp_consent = false`).

**Docs to update:** `docs/DATABASE.md` (tables + RLS), `docs/SECURITY.md` (new PII surface).

---

### Task 2: Passport OTP endpoints

> **Reality check:** delivery channel is decided + built in **Task 0** (SMS is DLT-blocked, no WhatsApp-OTP exists yet). This task wires the `/otp/send` + `/otp/verify` routes around whatever Task 0 chose. If Task 0 picked the widget (Option 1), `/otp/send` may be a no-op and verify takes `widget_token`.

**Skills:** `[api]` `[redis]` `[sec]` `[test]`
**Files:**
- Create: `apps/api/src/routes/public/passport.ts` (routes `POST /v1/public/passport/otp/send`, `POST /v1/public/passport/otp/verify`)
- Reuse: `apps/api/src/lib/msg91-otp.ts` (`sendOtpViaMsg91`, `verifyStoredOtp`, `awaitRedisReady`)
- Test: `apps/api/src/routes/public/__tests__/passport-otp.test.ts`

**Interfaces:**
- Consumes: `msg91-otp.ts` exports.
- Produces: `send` → `{ ok: true, channel: "whatsapp"|"sms" }`; `verify` → `{ ok: true, account_id, is_new }` + sets session (Task 3). Rejects: invalid phone shape, OTP mismatch (`401`), rate limit (`429`).

**Test plan:** happy path (send → verify → account upserted); wrong OTP → `401`; 6th send to same number within 10 min → `429`; a `verify` for an unknown number creates `CustomerAccount` with `is_new: true`; an existing `phone_hash` returns `is_new: false` and does not duplicate.

**Acceptance:** tests green; MSG91 WhatsApp-first with SMS fallback wired; no `lazyConnect`.

---

### Task 3: Passport session — cookie + store

**Skills:** `[api]` `[redis]` `[sec]` `[test]`
**Files:**
- Create: `apps/api/src/lib/passport-session.ts`
- Modify: `packages/db/prisma/schema.prisma` — `PassportSession { id, customer_account_id, created_at, last_seen_at, expires_at, revoked_at?, user_agent?, ip_hash? }` (+ migration, RLS: no retailer access)
- Modify: `apps/api/src/routes/public/passport.ts` — `GET /v1/public/passport/me`
- Test: `apps/api/src/lib/__tests__/passport-session.test.ts`

**Interfaces produced:**
- `mintSession(accountId, ctx): { cookieValue, setCookieHeader }` — opaque id, DB row + Redis cache (`px_sess:{id}` TTL 180 d), `Set-Cookie: kanchuki_passport=…; HttpOnly; Secure; SameSite=Lax; Domain=kanchuki.com; Max-Age=15552000`
- `getSession(cookieValue): { account } | null` — Redis first, DB fallback, slides `expires_at` + `last_seen_at` on read
- `revokeSession(cookieValue)` / `revokeAllForAccount(accountId)`
- `GET /v1/public/passport/me` → `{ account: { id, name?, phone_masked, usual_size? } }` or `401`

**Test plan:** mint → `me` returns masked phone; tampered cookie → `401`; expired row → `401` even if Redis stale; `revokeAllForAccount` invalidates every session; cookie string has all 5 attributes and no PII.

**Acceptance:** tests green; `me` never returns the raw phone; Redis-down falls back to DB (fail-safe read).

**Docs:** `docs/API.md` (endpoints), `docs/SECURITY.md` (session model).

---

### Task 4: `ContactGate.tsx` rework + PassportSheet

**Skills:** `[fe]` `[fe-feel]` `[a11y]` `[test]`
**Files:**
- Modify: `apps/web/src/app/[store]/components/ContactGate.tsx`
- Create: `apps/web/src/app/[store]/components/PassportSheet.tsx`
- Create: `apps/web/src/lib/passport-client.ts` (`getPassport()`, wraps `GET /api/passport/me`)
- Create: `apps/web/src/app/api/passport/[...path]/route.ts` (proxy, mirrors `app/api/[store]/leads/route.ts`)
- Test: `apps/web/src/app/[store]/components/__tests__/ContactGate.test.tsx`

**Interfaces:**
- Consumes: `GET /v1/public/passport/me`, `POST /v1/public/passport/otp/{send,verify}`, `POST /v1/public/retailers/{store}/leads` (Task 5).
- Produces: three render states — (a) **returning** → `PassportSheet` (name greeting, **unticked** "Send my contact to {store}" toggle, `[Enter catalog →]`); (b) **first-time** → phone → OTP → itemised notice + **unticked** consent → enter; (c) **just browse** → dismiss, catalog opens, gate re-armed on any contact-requiring action.

**Test plan (RTL):** no cookie → first-time form; `me` 200 → sheet with greeting, toggle default **unchecked**; "Enter catalog" with toggle off → catalog, **no** `leads` POST; toggle on + Enter → one `leads` POST with `share_contact: true`; "just browse" → catalog, `leads` never called; keyboard-only nav reaches every control; sheet has an accessible label + focus trap.

**Acceptance:** tests green; consent never pre-checked; entering the catalog never sends PII on its own; `a11y-architect` review clean.

---

### Task 5: Lead write on consent tap + retailer alert

**Skills:** `[api]` `[sec]` `[test]`
**Files:**
- Modify: `apps/api/src/routes/public/public-retailers.ts:756` — `server.post('/retailers/:slug/leads')` (param is `:slug`, not a `leads/` file)
- Create: `apps/api/src/lib/passport-activity.ts` (stub — here only the `store_visit` write; full helper in Task 11)
- Reuse: retailer push-notification lib **if it exists** (unverified — see Reality Check §🟡); degrade gracefully to no alert if absent
- Test: `apps/api/src/routes/public/__tests__/leads-passport.test.ts`

> **Reuse `phone_hash` formula:** `createHash('sha256').update(normalizeIndianPhone(phone)).digest('hex')` (unsalted, as `public-retailers.ts:785` already does) so `CustomerAccount` ↔ `Customer` match.

**Interfaces:**
- Body gains `customer_account_id?`, `share_contact: boolean`.
- On `share_contact: true`: upsert `Customer(retailer_id, phone)` from `CustomerAccount` (name/phone/phone_hash), `source = QR_SCAN`, `consent_given = true`, `consent_at = now`; set `CustomerStoreVisit.contact_shared = true`, `whatsapp_consent = true`, `whatsapp_consent_at`; write `ConsentEvent{ kind: "STORE_CONSENT_GRANTED", notice_version }`; enqueue retailer push.
- On `share_contact: false` (or absent): upsert `CustomerStoreVisit` (visit only, `contact_shared` unchanged); no `Customer` row; no push.

**Test plan:** first share → `Customer` created + `ConsentEvent` + `visit.contact_shared true` + push enqueued; repeat scan same store → `visit_count++`, no duplicate `Customer`, no second `ConsentEvent`; browse-only → `CustomerStoreVisit` exists, `contact_shared = false`, no `Customer`; fake `customer_account_id` → `403`.

**Acceptance:** tests green; existing `security.test.ts` still green; retailer never receives the number for a browse-only visit.

**Docs:** `docs/API.md`.

---

### Task 6: Backfill — link existing customers to accounts

**Skills:** `[db]` `[test]`
**Files:**
- Create: `apps/api/scripts/backfill-customer-accounts.ts` (idempotent, batched, `--dry-run` flag)
- Test: `apps/api/scripts/__tests__/backfill-customer-accounts.test.ts`

**Interfaces:** for each distinct `Customer.phone_hash` → upsert `CustomerAccount`; set `Customer.customer_account_id`; seed one `CustomerStoreVisit` per `(account, retailer)` with `contact_shared = true`, `whatsapp_consent = Customer.consent_given`, `whatsapp_consent_at = Customer.consent_at`.

**Test plan:** two retailers with the same customer phone → one `CustomerAccount`, two `CustomerStoreVisit`; existing `consent_given = false` → `whatsapp_consent = false` (not forced true); re-run → no new rows (idempotent); `--dry-run` writes nothing.

**Acceptance:** dry-run report reviewed; consent is **not** retroactively widened; re-runnable.

---

### Task 7: WhatsApp deep-link login (in-app WebView fallback)

**Skills:** `[api]` `[sec]` `[test]`
**Files:**
- Modify: `apps/api/src/routes/public/passport.ts` — `POST /v1/public/passport/wa-login/start` → `{ deeplink: "https://wa.me/<num>?text=LOGIN-<nonce>" }`; extend the MSG91/WhatsApp inbound webhook to consume `LOGIN-<nonce>` and mint a session on the return poll `GET /v1/public/passport/wa-login/status?nonce=`
- Modify: `ContactGate.tsx` — detect WebView UA → show "Open in Chrome" + "Login with WhatsApp" button
- Test: `apps/api/src/routes/public/__tests__/passport-wa-login.test.ts`

**Interfaces:** nonce single-use, 5-min TTL in Redis; inbound message sender phone must equal a known `CustomerAccount.phone` (or create one) to bind; `status` returns `{ ready: true, ... }` once bound, then invalidates the nonce.

**Test plan:** start → deeplink contains a fresh nonce; webhook with matching sender + nonce → `status` flips ready once, second poll → `410`; nonce reuse → rejected; unknown sender → new `CustomerAccount` created and bound.

**Acceptance:** tests green; nonce never reusable; webhook HMAC still verified.

**Phase 1 gate:** `ContactGate` E2E (`ecc:e2e-testing`) — scan store A (first-time OTP) → scan store B (1-tap) → `security.test.ts` green → `[ship]` merge.

---

# PHASE 2 — Consent & control surface

### Task 8: `/my-stores` page + data endpoint

**Skills:** `[api]` `[fe]` `[a11y]` `[test]`
**Files:**
- Modify: `apps/api/src/routes/public/passport.ts` — `GET /v1/public/passport/stores`, `POST …/stores/:retailerId/mute`, `POST …/stores/:retailerId/remove`
- Create: `apps/web/src/app/my-stores/page.tsx` + proxy
- Test: API `passport-stores.test.ts`; web RTL `my-stores.test.tsx`

**Interfaces:** `stores` → `[{ retailer: { shop_name, city, logo_url }, first_visited_at, last_visited_at, is_muted, phone_masked }]`; `mute` toggles `CustomerStoreVisit.is_muted` + `ConsentEvent{ kind: "STORE_MUTED" }`; `remove` → soft-delete the `Customer` row for that retailer + `ConsentEvent{ kind: "STORE_CONSENT_WITHDRAWN" }`, keep the `CustomerStoreVisit` (visit history) with `contact_shared = false`.

**Test plan:** list shows only this account's stores, number always masked; `mute` → `is_muted true` + event; `remove` → `Customer.deleted_at` set, still absent from retailer's active list; unauth (no cookie) → `401`.

**Acceptance:** tests green; number never rendered unmasked. **Note:** `/consent/revoke` and `/account-deletion` are NOT reusable (verified — VTO-training-only / retailer-only); `/my-stores` mute/remove is self-contained, and whole-passport deletion is a new flow (Task 26 / `POST /v1/public/passport/delete`).

---

### Task 9: WhatsApp send-time consent enforcement

**Skills:** `[api]` `[sec]` `[test]`
**Files:**
- Modify: the retailer WhatsApp dispatch path (collection send, catalog send) + `apps/api/src/lib/` send helper
- Create: `apps/api/src/lib/messaging-guard.ts` — `canMessage(accountId, retailerId): Promise<boolean>`
- Test: `apps/api/src/lib/__tests__/messaging-guard.test.ts`

**Interfaces:** `canMessage` = `whatsapp_consent && !is_muted && withinFrequencyCap(2, "week", retailerId)`. Every outbound shopper message routes through it.

**Test plan:** muted store → blocked; no consent → blocked; 3rd message in a week → blocked; consented + unmuted + under cap → allowed; cap resets after 7 days.

**Acceptance:** tests green; no shopper-facing send path bypasses the guard (grep the send call sites in review).

---

### Task 10: Auto welcome/catalog dispatch on consent

**Skills:** `[api]` `[test]`
**Files:**
- Modify: `apps/api/src/routes/public/…/leads` (Task 5) — on `STORE_CONSENT_GRANTED`, enqueue a job
- Create: `apps/api/src/jobs/passport-welcome.ts` — sends the retailer's catalog link via existing WhatsApp Catalog Sync / MSG91
- Test: `apps/api/src/jobs/__tests__/passport-welcome.test.ts`

**Interfaces:** job payload `{ account_id, retailer_id }`; message = retailer template + `kanchuki.com/{store}`; passes through `canMessage` (Task 9).

**Test plan:** consent tap → job enqueued once; job respects `canMessage`; muted-before-send → not delivered; retailer with no WhatsApp configured → job no-ops cleanly.

**Acceptance:** tests green; one welcome per store per account (not per scan).

**Phase 2 gate:** consent E2E (share → receive welcome → mute → next send blocked) → merge.

---

# PHASE 3 — (identity + control surface complete above; nothing extra)

---

# PHASE 4 — Cross-store activity tracking

### Task 11: `CustomerInteraction` identity-scope + `recordInteraction()`

**Skills:** `[db]` `[api]` `[test]`
**Files:**
- Modify: `schema.prisma` — `CustomerInteraction`: add `customer_account_id String?`, index `[customer_account_id, created_at]`; widen the `type` doc-comment to the §15.2 set (stays a string)
- Create migration + RLS (retailer sees only own `retailer_id` rows)
- Modify: `apps/api/src/lib/passport-activity.ts` — full `recordInteraction({ accountId?, retailerId, productId?, collectionId?, type, metadata })`
- Modify: the **one** existing server-side write site (`routes/customers.ts:268`, retailer-scoped) is untouched; the public favorite (`public-collections.ts:274`) today only bumps `favorite_count` — add a `recordInteraction` call there and in the public enquiry handler when a session exists
- Test: `apps/api/src/lib/__tests__/passport-activity.test.ts`

> **Reality check:** customer-side behavioral logging is net-new. Server has ~no per-customer interaction writes to "update"; the beacon (Task 12) is the primary ingestion path. Reuse `MIN_INTERACTIONS_FOR_DNA` (`@kanchuki/ai`) for the cold-start threshold, not a fresh number.

**Interfaces produced:** `recordInteraction(args): Promise<void>` — writes the row, fire-and-forget safe (never throws into the request path), triggers a debounced `preference_vector` recompute (Task 16, no-op until then).

**Test plan:** favorite with session → row has both `customer_id` and `customer_account_id`; without session → `customer_account_id` null, still writes; bad `type` → rejected at the helper; helper failure never 500s the caller (mock a DB error → caller still returns 200).

**Acceptance:** tests green; every existing interaction call site updated (grep proof in review); RLS test green.

**Docs:** `docs/DATABASE.md`.

---

### Task 12: Client event beacon (view / dwell / search / not_interested)

**Skills:** `[fe]` `[fe-feel]` `[api]` `[test]`
**Files:**
- Modify: `apps/web/src/lib/passport-client.ts` — `track(event)` batcher (`navigator.sendBeacon`, flush on 10 events or 5 s or `visibilitychange`)
- Modify: `apps/api/src/routes/public/passport.ts` — `POST /v1/public/passport/events` (array, max 20, session cookie required, per-account rate limit)
- Modify: customer-web product card / detail / search / feed to call `track(...)`
- Test: API `passport-events.test.ts`; web `passport-client.test.ts`

**Interfaces:** `track({ type, product_id?, collection_id?, retailer_id?, metadata })`; endpoint validates each against the §15.2 metadata contract, drops malformed, calls `recordInteraction` per valid item.

**Test plan:** 10 `view`s → one beacon call with 10 items; malformed item → that one dropped, rest recorded; no cookie → `401`, batcher discards; 100 events in 10 s from one account → rate-limited.

**Acceptance:** tests green; no event blocks render; dwell measured on detail-view unmount.

---

### Task 13: `CustomerRecentlyViewed` (identity-scoped)

**Skills:** `[db]` `[api]` `[fe]` `[test]`
**Files:**
- Modify: `schema.prisma` — `CustomerRecentlyViewed` (spec §15.5) + migration + RLS
- Modify: `apps/api/src/routes/public/passport.ts` — `GET /v1/public/passport/recently-viewed`; upsert on `view` events in `recordInteraction`
- Modify: customer-web "Recently viewed" row → use the endpoint when a session exists, else keep localStorage (built item 8)
- Test: API + web RTL

**Interfaces:** upsert `(customer_account_id, product_id)` → refresh `viewed_at`; cap 50 (trim oldest); `GET` returns newest-first with product summary.

**Test plan:** view 3 products across 2 stores → all 3 in the row, cross-store; re-view → moves to front, no dupe; 51st → oldest evicted; logged-out → localStorage path unchanged.

**Acceptance:** tests green; cross-store row visible on `/my-profile`.

---

### Task 14: Interaction retention cron + `ConsentEvent` kinds

**Skills:** `[db]` `[api]` `[test]`
**Files:**
- Create: `apps/api/src/jobs/interaction-retention.ts` (daily; delete `CustomerInteraction` where `created_at < now() - 24 months` **and** `type` not in `{purchase, enquiry}`)
- Modify: `ConsentEvent.kind` allowed set → add `PROFILING_ENABLED`, `PROFILING_DISABLED`, `DATA_EXPORTED`
- Test: `apps/api/src/jobs/__tests__/interaction-retention.test.ts`

**Test plan:** a 25-month-old `view` → deleted; a 25-month-old `purchase` → kept; a 1-month-old `view` → kept; job idempotent.

**Acceptance:** tests green; retention window is a config constant.

**Phase 4 gate:** activity E2E (browse across 2 stores → `/my-profile` recently-viewed populates) → merge.

---

# PHASE 5 — Unified Fashion DNA

### Task 15: `CustomerFashionDNA` identity-scope + affinity aggregation

**Skills:** `[db]` `[recsys]` `[api]` `[test]`

> **Reality check — this is a re-enable + generalize, not a build.** `jobs/update-fashion-dna.ts` + `@kanchuki/ai` `computeFashionDNA` / `formatPreferenceVector` / `MIN_INTERACTIONS_FOR_DNA` already do exactly this, retailer-scoped, with the worker **commented out** in `jobs/index.ts` (~line 305). Tasks 15–16 = (1) un-comment the worker + `handleUpdateFashionDNA` import, (2) generalize `computeFashionDNA` in `packages/ai/src/fashion-dna.js` to accept `customer_account_id` and read cross-store interactions, (3) add the `not_interested` negative weight + the §15.3 weights/decay if they differ. **Do not create `apps/api/src/lib/fashion-dna.ts`.**

**Files:**
- Modify: `schema.prisma` — `CustomerFashionDNA`: add `customer_account_id String? @unique` **alongside** the existing `customer_id @unique` → explicit precedence: the identity row is the recs source of truth; migration folds existing retailer rows (keep them, mark identity row canonical). Migration + RLS.
- Modify: `packages/ai/src/fashion-dna.js` — `computeFashionDNA` accepts an account scope; `@kanchuki/ai` re-exports unchanged
- Modify: `apps/api/src/jobs/update-fashion-dna.ts` + `jobs/index.ts` — re-enable worker, `FashionDNAJobData` gains `customer_account_id?`
- Create: `apps/api/src/jobs/fashion-dna-batch.ts` — nightly reconcile over all active accounts (add to the `MAINTENANCE` queue `job.name` switch + a `repeat` schedule)
- Test: `apps/api/src/jobs/__tests__/update-fashion-dna.test.ts` (extend the existing one)

**Interfaces produced:** `aggregateAffinities(accountId): Promise<AffinitySnapshot>`; writes the identity `CustomerFashionDNA` row; `confidence_score = min(1, interaction_count/20)`.

**Test plan:** 1 purchase (silk, ₹6k) + 3 views (cotton) → silk weight > cotton (10 vs 3); a `not_interested(silk)` → silk affinity drops; a 90-day-old signal contributes ~¼ of a today signal (half-life 60 d); `budget_range` p50 tracks purchase prices.

**Acceptance:** tests green; deterministic given a fixed `now()`; retailer rows untouched.

---

### Task 16: `preference_vector` compute

**Skills:** `[recsys]` `[db]` `[test]`
**Files:**
- Modify: `apps/api/src/lib/fashion-dna.ts` — `computePreferenceVector(accountId)` = recency-decayed signal-weighted mean of `ProductEmbedding.embedding` over interacted products; write to `CustomerFashionDNA.preference_vector`
- Modify: `passport-activity.ts` — debounce a recompute (≤1/min/account) after `recordInteraction`
- Test: `apps/api/src/lib/__tests__/preference-vector.test.ts`

**Interfaces produced:** `computePreferenceVector(accountId): Promise<number[] | null>` (null if <1 embedded interaction).

**Test plan:** interactions with 3 products → vector ≈ weighted mean (cosine to the hand-computed mean > 0.999); a `not_interested` product subtracts; a product without an embedding → skipped, not fatal; debounce → 5 rapid events → 1 recompute.

**Acceptance:** tests green; recompute never on the request thread; missing embeddings tolerated.

---

### Task 17: `ProductEmbedding` coverage backfill

**Skills:** `[api]` `[db]` `[test]`

> **Reality check — mostly done.** `addEmbeddingJob` already fires on product create (`products-crud.ts:368`) and post-tag (`tag-product.ts:205`); `jobs/generate-embedding.ts` upserts `ON CONFLICT (product_id)`. This task = a **one-time backfill sweep** + verifying the bulk-onboard and status→ACTIVE paths also enqueue. Reuse `EmbeddingJobData = { product_id, retailer_id }` and `addEmbeddingJob`.

**Files:**
- Create: `apps/api/src/jobs/product-embedding-backfill.ts` — sweep public products with no fresh `ProductEmbedding` (by `input_hash`), call `addEmbeddingJob` for each; add to the `MAINTENANCE` queue switch, run once (or weekly, capped)
- Modify: bulk-onboard + product status→ACTIVE handlers → `addEmbeddingJob` if not already enqueued
- Test: `apps/api/src/jobs/__tests__/product-embedding-backfill.test.ts`

**Test plan:** product with no embedding → embedded; product whose text is unchanged (`input_hash` match) → skipped; new product → embed enqueued on tag completion; batch respects a rate limit.

**Acceptance:** tests green; a coverage query (`% ACTIVE public products with a fresh embedding`) reported by the job.

**Phase 5 gate:** `[verify]` — for a seeded shopper, `preference_vector` is non-null and cosine-nearest products match their dominant affinity.

---

# PHASE 6 — Profile screen

### Task 18a: Cross-store shopper shell (blocks 18, 19, 21, 23 web)

**Skills:** `[fe]` `[a11y]` `[test]`
**Why:** `/my-profile`, `/my-stores`, `/for-you`, `/discover-stores` live **outside `app/[store]/`** and there is no cross-store layout/nav today (the customer bottom bar is `[store]`-scoped).
**Files:**
- Create: `apps/web/src/app/(shopper)/layout.tsx` — shopper shell (header with masked name, bottom nav: For You / Discover / Saved / Profile), PWA-consistent
- Create: `apps/web/src/lib/require-passport.ts` — server component guard: no passport cookie → render a sign-in prompt (phone + Task 0 channel), not a hard 404
- Move the new pages under `app/(shopper)/`
- Test: RTL — guard renders prompt when unauth, shell renders nav when authed; `a11y` keyboard nav

**Acceptance:** tests green; one shell wraps all four routes; deep-link to `/my-profile` while logged-out lands on the prompt then returns to the target.

---

### Task 18: `/my-profile` page

**Skills:** `[fe]` `[fe-feel]` `[a11y]` `[viz]` `[test]`
**Files:**
- Modify: `apps/api/src/routes/public/passport.ts` — `GET /v1/public/passport/profile`, `PATCH …/profile/style` (chip add/remove override), `PATCH …/profile/notifications`
- Create: `apps/web/src/app/my-profile/page.tsx` + proxy + sub-components
- Test: API `passport-profile.test.ts`; web RTL `my-profile.test.tsx`

**Interfaces:** `profile` → `{ style_chips: [{tag, kind: "inferred"|"override"}], saved: n, recently_viewed: [...], enquiries: [...], orders: [...], notifications: { master, new_arrivals, restock, price_drop, collections } }`; a style override writes to `CustomerAccount` explicit-prefs and is honored as a hard filter downstream.

**Test plan:** removing an inferred chip → persists as a negative override, no longer in recs candidate tags; toggling a notification off → reflected in `canMessage`/trigger checks; masked phone shown; all sections keyboard-navigable; empty states render.

**Acceptance:** tests green; `a11y-architect` clean; edits round-trip.

---

### Task 19: Cross-store favorites (`CustomerWishlistItem`)

**Skills:** `[db]` `[api]` `[fe]` `[test]`
**Files:**
- Modify: `schema.prisma` — `CustomerWishlistItem` (spec §15.5) + migration + RLS
- Modify: `apps/api/src/routes/public/passport.ts` — `GET/POST/DELETE /v1/public/passport/wishlist`
- Modify: customer-web favorite button → write to wishlist when a session exists (plus the existing retailer-scoped favorite for back-compat), also emits a `favorite` interaction
- Test: API + web RTL

**Test plan:** favorite in store A + store B → both on `/my-profile` Saved; unfavorite → removed + `unfavorite` interaction; logged-out favorite → localStorage only (unchanged).

**Acceptance:** tests green; Saved list is cross-store; delivers item 22.

**Phase 6 gate:** profile E2E (favorite across stores → edit a style chip → toggle a notification) → merge.

---

# PHASE 7 — Recommendations & discovery

### Task 20: Ranking pipeline service

**Skills:** `[recsys]` `[api]` `[test]`
**Files:**
- Create: `apps/api/src/lib/recommend.ts` — `rankProducts({ accountId, surface, city?, limit })`
- Test: `apps/api/src/lib/__tests__/recommend.test.ts`

**Interfaces produced:** `rankProducts(args): Promise<RankedProduct[]>` — pipeline per spec §16.1: pgvector KNN (~200) → hard filters (size vs `usual_size`, price vs `budget_range` ±20%, city/radius when bound, active retailer, exclude muted / `not_interested` / out-of-stock) → re-rank (cosine + boosts: followed +0.10, same-city +0.05, new <14 d +0.05, price-drop +0.05) → diversity cap 3/retailer in top 20. Cold (`interaction_count < 5` or null vector) → quiz-tag + `usual_size` + trending.

**Test plan:** muted-store product never appears; `not_interested` product excluded; a followed-store product outranks an equal-cosine non-followed one; no retailer has >3 of the top 20; cold-start path returns trending filtered by quiz tags; out-of-budget product filtered.

**Acceptance:** tests green; single entry point (feed + search + discovery all call it); deterministic given fixed inputs.

---

### Task 21: "For You" feed

**Skills:** `[api]` `[fe]` `[a11y]` `[test]`
**Files:**
- Create: `apps/api/src/routes/public/for-you.ts` — `GET /v1/public/for-you?cursor=` (calls `rankProducts`, paginates)
- Create: `apps/web/src/app/for-you/page.tsx` + proxy + nav entry (separate tab, not the home replacement — decision §13-j)
- Test: API + web RTL

**Test plan:** session with history → personalized order; no session → trending; pagination stable across pages; empty catalog → friendly empty state.

**Acceptance:** tests green; first paint within the existing catalog-page budget (`web-perf` check).

---

### Task 22: Public customer search + personalized re-rank

> **Reality check — rescoped.** There is **no public customer search endpoint** today; `routes/search.ts` is retailer-scoped (`request.retailerId`). This task first stands one up, then personalizes it.

**Skills:** `[recsys]` `[api]` `[test]`
**Files:**
- Create: `apps/api/src/routes/public/public-search.ts` — `POST /v1/public/search` — port the `routes/search.ts` hybrid pattern (`embedSearchQuery`, `extractBudgetFromQuery`, `normalizeSearchQuery`, `isNewArrival`, pgvector KNN) scoped to **all public ACTIVE products** instead of one retailer
- Modify: same handler — when a passport session exists, blend text-relevance 50/50 with `cosine(preference_vector, product)`; seed autocomplete from top affinity tags
- Create: `apps/web/src/app/(shopper)/search/page.tsx` + proxy
- Test: `apps/api/src/routes/public/__tests__/public-search.test.ts`

**Test plan:** anon query "cotton pink suits under ₹2000" → budget + tag filter works (parity with `search.ts`); same query with a silk-festive session → silk-festive results rank up; no session → deterministic text order; autocomplete for an empty query with a session → the shopper's top tags.

**Acceptance:** tests green; anon path matches the `search.ts` semantics; personalization only activates with a session.

---

### Task 23: `StoreAffinity` job + `/discover-stores`

**Skills:** `[recsys]` `[api]` `[fe]` `[test]`
**Files:**
- Modify: `schema.prisma` — `StoreAffinity` (spec §15.5) + migration + RLS
- Create: `apps/api/src/jobs/store-affinity.ts` (nightly: store-catalog centroid = mean of the store's `ProductEmbedding`s; `score` = `cosine(preference_vector, centroid)` + same-city + co-visitation from `CustomerStoreVisit`)
- Create: `apps/api/src/routes/public/discover-stores.ts` — `GET /v1/public/discover-stores`
- Modify: `/stores` directory → optional "for you" sort using `StoreAffinity`
- Test: job test + API test

**Test plan:** a shopper who favorited bridal items → bridal-heavy stores rank top; same-city store gets the bonus; a store two similar-taste shoppers visited surfaces via co-visitation; store with no embeddings → excluded, not crashed.

**Acceptance:** tests green; job writes one `StoreAffinity` row per `(account, retailer)` with a recent `computed_at`.

---

### Task 24: Proactive recommendation triggers

**Skills:** `[api]` `[test]`
**Files:**
- Create: `apps/api/src/jobs/recommendation-triggers.ts` — new-arrival match, restock (identity-scoped, reuse built NotifyWhenAvailable), price-drop, followed-store collection
- Reuse: `messaging-guard.ts` (Task 9)
- Test: `apps/api/src/jobs/__tests__/recommendation-triggers.test.ts`

**Test plan:** new product `cosine 0.85` to a shopper who visited that store → message queued; `cosine 0.5` → not; restock of a favorited sold-out item → queued; muted store → nothing; 3rd message that week → capped.

**Acceptance:** tests green; every send path goes through `canMessage`; each trigger independently toggle-able via profile notification prefs.

**Phase 7 gate:** recs E2E (seed history → "For You" personalized → search re-ranked → discover-stores relevant) + `web-perf` on the feed → merge.

---

# PHASE 8 — Profiling compliance & retailer analytics

### Task 25: "Personalized recommendations" toggle

**Skills:** `[api]` `[sec]` `[fe]` `[test]`
**Files:**
- Modify: `passport-profile` PATCH — `personalization: boolean`; OFF ⇒ `recordInteraction` no-ops for behavioral types, `preference_vector` frozen then cleared after 24 h, feed/search fall back to non-personalized; write `PROFILING_ENABLED`/`PROFILING_DISABLED` `ConsentEvent`
- Test: `apps/api/src/routes/public/__tests__/personalization-toggle.test.ts`

**Test plan:** OFF → new `view` events not written; `rankProducts` returns the cold/trending path; `ConsentEvent` recorded; ON again → tracking resumes, vector rebuilds on next batch.

**Acceptance:** tests green; OFF genuinely stops writes (grep the guarded call sites in review).

---

### Task 26: "Download my data" export

**Skills:** `[api]` `[sec]` `[test]`
**Files:**
- Modify: `passport.ts` — `GET /v1/public/passport/export` → JSON (`CustomerAccount`, `CustomerStoreVisit[]`, `CustomerInteraction[]` summary, wishlist, affinities); write `DATA_EXPORTED` `ConsentEvent`; rate-limited 1/day
- Test: `apps/api/src/routes/public/__tests__/passport-export.test.ts`

**Test plan:** export contains every section, phone in full only for the account owner's own export, nothing from other accounts; 2nd call same day → `429`.

**Acceptance:** tests green; export is self-serve, no admin step.

---

### Task 27: DPDP notice-copy pass + `notice_version`

**Skills:** `[sec]` `[plan]` `[verify]`
**Files:**
- Create: `apps/web/src/app/consent/notice-versions.ts` — versioned notice strings; `CURRENT_NOTICE_VERSION`
- Modify: `ContactGate` / `PassportSheet` / `/my-profile` to render the current notice and pass `notice_version` on every consent write
- Modify: `docs/SECURITY.md` §12–18 (governance — **human review required**)
- Test: RTL asserts the notice text is present at each consent point; API asserts `ConsentEvent.notice_version` set

**Test plan:** every `ConsentEvent` write includes a non-empty `notice_version`; the notice covers: what's collected, purposes (identity + per-store sharing + profiling), withdrawal routes.

**Acceptance:** tests green; **legal / human sign-off checkpoint** before this task's gate (do not self-approve `SECURITY.md §12–18`).

---

### Task 28: Retailer aggregate taste analytics

**Skills:** `[api]` `[viz]` `[fe]` `[test]`
**Files:**
- Create: `apps/api/src/routes/retailers/analytics-visitors.ts` — `GET /v1/retailers/me/visitor-taste` (aggregate over own `customer_store_visits` where `contact_shared = true`; k-anon: suppress buckets < 5)
- Create: mobile screen `apps/mobile/app/(tabs)/insights/visitor-taste.tsx` (charts per `dataviz` guidance)
- Test: API test + mobile component test

**Test plan:** report shows category / price / occasion distribution for this retailer's shared visitors only; a bucket with 3 people → suppressed; another retailer's visitors never counted; no individual row retrievable.

**Acceptance:** tests green; RLS + k-anon both enforced; no PII, no cross-store leakage.

**Phase 8 gate:** `security-review` skill pass over the whole passport + profile surface → `[ship]` finalize branch.

---

## Self-Review (against `docs/customer/customer-qr-identity-solution.md`)

**Spec coverage:**
- OTP delivery (spec §3.1, §13-c) → **Task 0** (critical path — SMS is DLT-blocked, no WhatsApp-OTP exists)
- Cross-store web shell (spec §17 routes) → **Task 18a**
- §1–4 (problem, passport UX, trust) → Tasks 4, 7, 8
- §6 DPDP identity consent → Tasks 1, 5, 8, 27
- §7 schema → Tasks 1, 3, 11, 13, 15, 19, 23
- §8 cookie/session → Task 3; §8.3 WebView → Task 7
- §9 abuse/rate-limit → Tasks 2, 12, 26 (+ `messaging-guard` Task 9)
- §10 migration → Task 6
- §12 phases 1–3 → Tasks 1–10
- §15 activity → Tasks 11–14
- §15.5 derived tables → Tasks 13 (`RecentlyViewed`), 19 (`WishlistItem`), 23 (`StoreAffinity`)
- §16 recommendation engine → Tasks 20–24
- §17 profile screen → Tasks 18, 19, 25, 26
- §18 profiling DPDP → Tasks 14, 25, 26, 27, 28
- §19 phases 4–9 → Tasks 11–28

**Gaps / deferred (called out, not in this plan):** native mic for AI search, PWA/retailer UI language toggle (pre-existing deferrals, unrelated); learned ranker (only if cosine+rules underperforms — decision §13); seasonal deep-dive dashboards.

**Type consistency:** `customer_account_id` used throughout; `recordInteraction` signature fixed in Task 11, consumed unchanged in 12/13/16/19; `canMessage` fixed in Task 9, consumed in 10/24; `rankProducts` fixed in Task 20, consumed in 21/22.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-08-30-shopper-passport-and-profile.md`. **No code until a task is picked up.** When ready:

1. **Subagent-Driven (recommended)** — `superpowers:subagent-driven-development`: fresh subagent per task, two-stage review between tasks.
2. **Inline** — `superpowers:executing-plans`: batch with checkpoints.

Start each phase with `superpowers:brainstorming` to confirm the open decisions (§13 a–j of the spec) that touch that phase.
