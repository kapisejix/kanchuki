# Kanchuki — Launch Readiness Audit

**Generated:** 2026-08-01, refreshed 2026-08-11. **Source:** full read of every `.md` doc in the repo + live cross-check against `apps/`, `packages/`, `.github/workflows/ci.yml`, git log, and (2026-08-11) actual `gh run` CI logs + a direct read of the DB schema/index list, the Redis cache implementation, and the rate-limit config. This file is the single source of truth for "what stage are we at" — it supersedes scattered status lines in other docs where they conflict (conflicts are called out explicitly in §0).

**How to use this doc:** each checklist item is tagged `P0` (blocks a safe launch), `P1` (should do before/soon after launch), or `P2` (post-launch, not blocking). Go through §5–§9, mark what you want vs. don't want at this stage, and that becomes the launch scope.

---

## 0a. 2026-08-11 follow-up audit — what changed since Aug 1

A lot shipped between the Aug 1 and Aug 11 sessions (see `CLAUDE.md` — F-027 taxonomy, Store QR, add-product rework, F-028/029/030, occasion removal, Play Store compliance batch, web billing). This pass re-checked the three things asked about — DB indexes, cache, security — against the **current** code and **live CI**, not the Aug 1 snapshot. Two new findings outrank everything already in this doc.

### 🔴 NEW P0 — rate limiter is bypassable on admin login + retailer OTP (confirmed by reading the code)

`apps/api/src/index.ts:121`, the global `@fastify/rate-limit` registration:

```ts
keyGenerator: (request) => (request.headers['x-retailer-id'] as string | undefined) ?? request.ip,
```

`x-retailer-id` is a **raw, client-supplied header** — nothing verifies it (verified `request.retailerId` only exists after JWT auth runs, which happens *after* the rate-limit hook). Grepped the whole repo: nothing legitimate ever sends this header — it's dead weight that happens to also be a bypass.

Any route that doesn't override `keyGenerator` per-route inherits this. Confirmed two that don't:
- **`POST /admin/login`** (`apps/api/src/routes/admin.ts:45-47`) — has a `max: 5 / 15min` override, intended as brute-force protection, but does **not** override `keyGenerator`. Send a different `X-Retailer-Id` value on every request → unlimited password guesses against the admin panel.
- **`POST /v1/auth/otp/send` and `/otp/verify`** (`apps/api/src/routes/auth.ts:39,70`) — no per-route rate limit at all, so they inherit the same bypassable global one. Enables OTP brute-force and SMS-bomb amplification against any phone number.

Compare with the routes that got this right: `checkout-flow.ts:37` and `checkout-flow.ts:322` (`public/checkout/create-order`, `public/orders/:id`) both explicitly set `keyGenerator: (req) => req.ip` — so checkout is **not** exposed. The pattern exists in the codebase, it just wasn't applied to admin login or OTP.

**Fix (root-cause, one line, not three):** since nothing legitimately relies on `x-retailer-id`, drop it — change the global `keyGenerator` to always use `request.ip`. That fixes every current and future route in one place instead of chasing per-route overrides. I have not applied this — it's a security-sensitive route change, say the word and I'll make the one-line edit + rerun `security.test.ts`.

### 🔴 NEW P0 — CI has been red on `main` for the last 3 pushes; the F-017 DB-guardrail check would fail too

Checked via `gh run list` / `gh run view`, not assumed:

- `quality` job has failed on the last 3 pushes to main (`1e813fd`, `b29b316`, `56357f6` — the Play Store launch batch), on the **`pnpm lint`** step (8 real Biome errors in `apps/api`: non-null-assertion/formatting/import-order issues in `backfill-missing-ai-fields.ts`, `compress-r2-images.ts`/`.test.ts`, `sku.ts`, `tag-product.ts`, `default-categories.ts`, `team-members.ts`, `auth.ts`, `public-helpers.ts`, `products.test.ts`).
- Because lint runs before it in the same job, **every step after it never ran on those 3 pushes**: `check-delete-guard.sh`, `check-secrets-guard.sh`, `check-route-size.sh`, `check-v1-fetch-guard.sh`, and the whole `pnpm test` suite. `build` and `e2e-web` didn't run either (they depend on `quality`).
- "Deploy to Railway" is a **separate, ungated workflow** — it succeeded on top of the failing CI. Production has been running code for 3 commits that never passed its own quality gate.
- Bonus: even with lint fixed, `check-delete-guard.sh` would **still fail** — `scripts/reset-demo-data.sql` (committed `ff8c643`, correctly DB-trigger-safe via `SET app.allow_hard_delete`) was never added to the script's own `SQL_ALLOWLIST` (`scripts/check-delete-guard.sh:143-146`, which only lists 2 of what should be 3 files). One-line fix.

**Net effect:** the guardrail/secrets CI gates this repo relies on for its own security posture haven't actually run in 3 releases. Not a data-loss risk (the DB triggers from F-017 are enforced independently at the Postgres level, not just in CI) but it means nothing has been checking for new raw `.delete()` calls or leaked secrets since Aug 10.

### DB indexes — reviewed the full schema, mostly solid, one real gap

45 models, 62 `@@index`, plus a hand-written raw-SQL migration (`001_pgvector_indexes`) with GIN indexes on `search_tags`/`occasions`/`secondary_colors`, an `ivfflat` cosine index on `product_embeddings.embedding` (semantic search) and `customer_fashion_dna.preference_vector`, and a partial composite `(retailer_id, status, category) WHERE deleted_at IS NULL`. This is genuinely well-designed — someone thought about query shape, not just slapped `@@index` on every FK.

- ✅ Every hot retailer-scoped table (`Product`, `Customer`, `Collection`, `Order`, `SupportTicket`, `TryOnJob`, `AiUsageLog`) has `retailer_id` covered, several with the right composite (`retailer_id, status`, `retailer_id, category_id`, etc.).
- ✅ `Product` SKU scan-to-sell lookup (`GET /products?sku=`) hits the `@@unique([retailer_id, sku])` index directly — confirmed retailer-scoped in `products-crud.ts`, no full-table scan risk.
- ✅ Vector search (`search.ts`) has its `ivfflat` index — not missing, as I first assumed before checking the raw migration.
- ✅ Public storefront filters (category, color) only ever hit scalar-indexed fields, not the `styles`/`fabrics` array columns — those two arrays (added in F-027) aren't used as customer-facing filters, so the lack of a GIN index on them isn't a live gap.
- 🟡 **Gap, low severity:** `apps/api/src/routes/admin/admin-retailers/admin-retailers-detail.ts:241` — the per-retailer admin activity timeline queries `AuditLog` with `OR: [{ resource_type: 'Retailer', resource_id: id }, { resource_id: id }]`. The second branch filters on `resource_id` alone, but the only index covering that column is the composite `@@index([resource_type, resource_id])` — Postgres can't use a composite index efficiently when the leading column isn't constrained. `AuditLog` is a write-on-every-mutation, never-pruned table, so this will get slower as it grows. Admin-only, paginated, not customer/retailer-facing — P2, not a launch blocker. Fix is a 1-line `@@index([resource_id])` + migration whenever it's convenient.
- 🟢 `occasions` GIN index is now dead weight (occasion filtering was removed 2026-08-10 per this file's own history) — harmless, just unused disk. Not worth a migration on its own.

### Cache — real, well-built, correctly wired

`apps/api/src/lib/public-cache.ts` (built 2026-08-08) is a genuine single-flight + jittered-TTL Redis cache-aside layer, not a stub:
- Its own short-fail ioredis client (`maxRetriesPerRequest: 1`, no offline queue) — deliberately **not** `getRedis()`, because BullMQ's connection retries forever and would turn a Redis blip into a hung public request. Good call, and documented as such in the file's own header.
- NX lock for single-flight recompute, bounded wait for the rest of the herd, TTL jitter (60s base + 0-50%) so co-expiring keys don't all miss at once.
- Every failure path (`get`, lock, `set`) degrades to a direct DB compute — confirmed by reading every `catch` block, not just the comments claiming it.
- **Wired**: grepped all 6 public GET handlers (`public-collections.ts`, `public-products.ts` ×2, `public-retailers.ts` ×4) — all import and call `withPublicCache`. Nothing is silently uncached.
- 60s TTL is the invalidation strategy (no cross-service busting) — fine for a catalog app, means a retailer's edit can take up to ~90s (base + jitter) to show on the storefront. Worth knowing, not worth fixing pre-launch.

No action needed here — this is one of the better-built pieces of the stack.

### Security — spot-checked beyond the rate-limit bug above

- ✅ Redis-backed rate limiting confirmed live (`getRedis()` passed to `@fastify/rate-limit` at `index.ts:116`) — the Aug 1 audit's "in-memory, breaks multi-instance" concern was already stale then and still is.
- ✅ `COOKIE_SECRET` production guard confirmed still in place (`index.ts:102-105`) — throws at boot if unset in prod.
- ✅ Anonymous order-lookup IDOR protection confirmed real: `GET /public/orders/:id` requires order ID **and** phone number as a second factor, IP-keyed rate limit correctly overridden (`checkout-flow.ts:315-324`).
- ✅ `@fastify/helmet` with CSP registered (`index.ts:75`).
- ✅ `scripts/check-secrets-guard.sh --all` run fresh — clean, no committed credentials.
- ✅ `security.test.ts` (24 tests) + `admin.login.test.ts` (14 tests) both green when run directly (`npx vitest run`) — the CI breakage above means this hasn't been confirmed by CI itself in 3 pushes, but the code is fine.
- ⚠️ Could not verify live Railway env vars this session (MCP Railway token expired — `railway login` needed, and this repo's own operational policy is "no direct production access" regardless). The Aug 1 P0 checklist below (§5) — rotate leaked dev secrets, set `TEAM_JWT_SECRET`/`VAULT_DATABASE_URL`/`REVALIDATION_SECRET`, real Razorpay webhook secret, `kanchuki_app` role — was marked "values generated, ready to paste" on 2026-08-01 (§9b). **Unverified whether that was actually done** — confirm directly in Railway, I can't check for you this session.

### SEO — §8 below is stale, most of it already got built

The Aug 1 audit said "current state: zero SEO." That's no longer true — confirmed by reading the actual files, not trusting a doc claim:
- ✅ `apps/web/src/app/sitemap.xml/route.ts` + `apps/web/src/app/sitemap/[id]/route.ts` exist, with a test (`__tests__/sitemap.test.ts`).
- ✅ `apps/web/src/app/robots.ts` exists (also referenced in this file's own Aug 2 entry — the Aug 1 SEO section just never got updated to match).
- ✅ JSON-LD structured data exists: `apps/web/src/app/[store]/lib/store-seo.ts`, used on both `[store]/page.tsx` and `[store]/categories/page.tsx`.
- ❌ Still not built: the admin-managed marketing-content page (headline/meta/OG editable from Admin) — this part of §8 is still accurate.

Treat §8 below as historical (what the gap looked like on Aug 1) — the sitemap/robots/JSON-LD action items in it are done.

### Still open, unchanged since Aug 1

- No load test has ever been run (`k6`/Artillery) — confirmed again, still nothing in the repo.
- Admin-managed marketing content page — not built (see above).
- Everything in §5's P0 secrets list — status unverifiable this session, needs a direct Railway check.

---

## 0. Where the docs disagree with each other (read this first)

Docs decay faster than code. These are live contradictions found across the doc set — don't trust the "done" claim on either side without checking code:

| Topic | Claim A | Claim B | What's actually true |
|---|---|---|---|
| Deletion Vault / DB replica / guardrails | `PLAN.md`, `26-night-report.md`: "Executed" | `omp-review.md` §13 action list: still open (B-002 replica points at primary, B-005 vault URL unset, B-007 DB still on superuser creds) | **omp-review is right** — migration 037 (DB triggers) is applied, but the replica/vault URL/role-separation items are still open. See §6.
| GST invoice numbering | `omp-review.md` flagged `Math.random()` for invoice numbers | Same doc's B-011 marks it fixed | Fixed — trust B-011, the earlier flag is stale.
| F-006B offline PWA | `omp-review.md` §6/§8/§11 (early pass): "not built" | Same doc §15 (later addendum) + `PROGRESS.md` + `PRO-REQUIREMENTS.md`: built 2026-07-27 | **Built.** Read `omp-review.md` §15, not §6.
| Subscription billing (Razorpay) | `PRO-REQUIREMENTS.md` §6: "code complete, deferred, free trial only" | `PRO-REQUIREMENTS.md` F-302: "✅ Built" | Both true, different flows — **F-302 customer checkout is live**; **plan subscription billing is intentionally off** for launch (free trial only).
| Mobile/web design token drift | `DESIGN.md`: flags `rust`/`turmeric`/`sand` as drifted between mobile and web | `docs/design/design-work.md` (later): already fixed, doc note was stale | Already fixed, ignore the drift warning in DESIGN.md.

---

## 1. What stage is the app at — one paragraph

You have a working MVP plus a large chunk of Phase 0.5/1 already built: photo-to-catalog AI tagging, WhatsApp-shareable customer collection links, virtual try-on (self-hosted V-Tone), a real Razorpay checkout (direct-to-retailer), a full admin control center (suspension, deletion vault, DB guardrails, AI provider failover, activity logs), and an internal sales/support team system. Code quality is good — Zod validation is broad, rate limiting and CSRF are wired, secrets aren't committed, TODO-debt is essentially zero (1 hit in the whole repo). **What's missing for a real production launch is not features, it's operational hardening**: a handful of unrotated/unset secrets, an unapplied read-replica/vault split, zero SEO surface, no admin-editable marketing content, and a load/security test that has never been run. None of these are big builds — most are config, not code.

---

## 2. Feature inventory — by phase

### MVP (all built)
Photo upload + AI auto-tagging, bulk PDF/catalog import, multi-item detection, guided bulk onboarding, product catalog + sizes, customer list + preference capture, WhatsApp collection link generator, customer mobile web page (view/favorite/enquire/share), in-store AI search, analytics dashboard.

### Phase 0.5 / Post-MVP (built)
Retailer account & team settings (F-009), quota/limits + self-serve addon purchase (F-010), custom background library (F-011), encrypted integration settings (F-012), full Admin Control Center — plan feature matrix, activity tracking, suspension, deletion vault, DB guardrails (F-013–F-017), sales referral attribution (F-018), paid on-site catalog upload service (F-019/F-020), AI provider registry with DB-driven failover (F-023), Virtual Try-On via self-hosted Fashion V-Tone (F-102), body measurement capture (mobile), consented training-data collection, L2 checkout direct-to-retailer (F-302), offline catalog browsing (web + mobile, F-006B), internal team system (support ticket routing, manager reporting dashboard, staff Expo mode), product-level WhatsApp share, marketing page redesign (Loom design system).

### Explicitly deferred / not started
- **F-101** Fashion DNA AI matching — needs 3–6 months of behavior data first, don't build yet.
- **F-102c** Size recommendation on customer web — deferred (no anonymous customer identity on share-link flow).
- **F-201–F-204** B2B wholesaler/manufacturer layer — no schema, Phase 2.
- **F-301** WhatsApp Business API automation, **F-303** order/delivery tracking, **F-305/306** multi-store / regional language UI.
- **F-307** Razorpay Route (merchant-of-record) — Stage B, only after Stage A (direct-to-retailer) is validated live.
- **F-021** Ratings — spec'd, not built. Has a flagged policy risk (Google review-gating) — your call if/when built.
- **F-022** Auto-post to Google Business Profile — **do not start**, blocked on external Google API approval per your own instruction in CLAUDE.md.
- **F-001e** Ghost-mannequin generation (Snappyit) — planned, P2.
- Founder story / About page — not built, needs your real story as input, won't be invented.
- Shared design-token package (single source for web+mobile) — proposed, not built; currently two separately-maintained token files that happen to be in sync.

**Your stated launch scope** (retailer app + customer link + admin functional + marketing frontend with admin-managed content + SEO) needs **nothing from the "not started" list above**. It needs the operational items in §5–§9 below.

---

## 3. Consolidated open bugs/issues

Deduplicated from `PROGRESS.md` + `omp-review.md`. Everything not listed here as open is fixed.

| ID | Issue | Status |
|---|---|---|
| — | Collection share link uses LAN IP, not a real hyperlink | 🔴 Open — config only, fix by setting `WEB_URL` to your real domain at deploy time |
| — | QR code export is PNG-only, no JPG/PDF | 🟡 Open, cosmetic, P2 |
| B-002 | `DATABASE_URL_REPLICA` currently points at the primary DB, not a real replica | 🔴 Open |
| B-003 | `ADMIN_PASSWORD_HASH` still in legacy HMAC format | 🔴 Open |
| B-004 | Admin TOTP (2FA) not enabled (`ADMIN_TOTP_SECRET` unset) | 🔴 Open |
| B-005 | `VAULT_DATABASE_URL` not configured — Deletion Vault has nowhere to write | 🔴 Open |
| B-007 | `DATABASE_URL` still uses the Supabase superuser role, not the restricted `kanchuki_app` role | 🔴 Open |
| B-008 | `TEAM_JWT_SECRET` missing — **staff login is broken** until this is set | 🔴 Open |
| B-009 | `REVALIDATION_SECRET` missing — ISR cache isn't purging on content changes | 🔴 Open |
| S-009 | Razorpay webhook secret is a weak dictionary string (`kanchuki-webhook-secret`) | 🔴 Open |
| — | `034_product_sizes` migration apply-status to live DB unverified | 🟡 Verify before launch |
| — | Local `.env` files (web/mobile) point at an ephemeral devtunnel URL — will break the moment that tunnel closes | 🔴 Open, fix at deploy |
| — | `admin.ts` (2,545 lines) and `checkout.ts` (1,087 lines) are large and un-split | 🟢 Tech debt, not a launch blocker |
| ~~—~~ | ~~CI vault-test false-pass~~ | ✅ **Correction (2026-08-01):** checked live CI logs (`gh run view`) — `vault.test.ts` correctly reports "2 skipped" in every recent run. The earlier concern (env-var-set-but-unreachable) doesn't manifest in practice. No fix needed. |
| ~~—~~ | ~~Rate limiter is in-memory, breaks under >1 API instance~~ | ✅ **Correction (2026-08-01):** checked `apps/api/src/index.ts` — `@fastify/rate-limit` is already registered with `redis: getRedis()`. Already multi-instance-safe. SECURITY.md's in-memory claim was stale. |
| — | **New finding (2026-08-01, fixed same day):** `COOKIE_SECRET` had no production guard — if unset, admin CSRF cookie signing key was regenerated from `Date.now()` on every process restart, silently invalidating every admin session/CSRF cookie on each deploy | ✅ Fixed in `apps/api/src/index.ts` — now throws at startup in production if `COOKIE_SECRET` is unset, so misconfiguration is loud instead of silent |

All credential items above (B-003/004/005/007/008/009, S-009) are the same root task: **rotate/set the missing env vars in your real hosting environment.** That's one deploy-day checklist item (§6), not six separate engineering tasks.

---

## 4. How to review code and functionality (your process, going forward)

1. **Code review** — you already have `agent-skills:code-reviewer` and language-specific reviewers (`ecc:typescript-reviewer`, `ecc:react-reviewer`, `ecc:security-reviewer`) available as subagents. Run `agent-skills:code-reviewer` or `/code-review` on any branch before merge — don't hand-review large diffs yourself.
2. **Functionality review** — no browser automation was run as part of this audit (text/doc audit only). Before you call any user-facing flow "done," open it in a real browser/device: retailer photo upload → tag → publish, customer collection link → view → favorite → enquire → checkout, admin suspend/unsuspend, WhatsApp share. CLAUDE.md already commits you to this ("start dev server, test golden path + edge cases before reporting UI complete") — hold future sessions to it.
3. **Security review** — re-run `docs/SECURITY.md §12–18` mentally against any new checkout/auth/admin code; the two required regression suites are already defined: `npx vitest run src/routes/security.test.ts` and `npx vitest run src/routes/admin.login.test.ts`. Run both after any auth/checkout touch.
4. **API review** — `docs/API.md` is your contract; when a route changes, update it same-session (per your own CLAUDE.md rule #10 — docs must track commits, which has slipped before).
5. **Ultra review** — for a pre-launch full sweep, `/code-review ultra` (a paid, multi-agent cloud review of the whole branch) is available on request — I can't trigger it myself, you'd run it.

---

## 5. Security — what's done, what's not

**Already solid** (verified in code, not just docs): rate limiting on auth/checkout/admin routes (`@fastify/rate-limit`), CSRF token flow on the admin panel, `@fastify/helmet` CSP headers, Zod validation on 18 route files, no secrets committed to git, scrypt+TOTP+IP-allowlist admin auth, JWT (HS256/ES256) retailer/staff auth with role-based route allowlists, an admin SQL console locked to SELECT-only + replica-scoped + audited, RLS policies on retailer tables (including a pre-pilot fix that added a missing `order_items` policy).

**P0 — must fix before real user data hits production:**
- [ ] Rotate every credential currently in your local `.env` (Anthropic, OpenAI, Supabase, R2, Redis) — they were exposed locally during dev and should not become production secrets as-is.
- [ ] Set `TEAM_JWT_SECRET` (staff login is currently broken without it).
- [ ] Set `COOKIE_SECRET` (code now throws at startup in production if this is missing — see §3, fixed 2026-08-01 — so this is no longer silent, but it still has to be set before a prod deploy will boot).
- [ ] Set `VAULT_DATABASE_URL` (Deletion Vault silently no-ops without it — you lose your safety net for accidental deletes).
- [ ] Switch `DATABASE_URL` from the Supabase superuser role to the restricted `kanchuki_app` role (this is the whole point of the F-017 DB guardrail work — right now the app *can* bypass its own guardrails). **Test on staging first** — flipping this in prod without a staging pass first is exactly the kind of change that could "break the server" if any code path still assumes superuser privileges.
- [ ] Replace the Razorpay webhook secret (`kanchuki-webhook-secret`) with a real generated secret.
- [ ] Set `REVALIDATION_SECRET` so ISR cache purges when admin/retailer content changes.
- [ ] Point `DATABASE_URL_REPLICA` at an actual read replica, or remove replica-only code paths (admin query console, reports) from relying on isolation you don't have yet. *Not required to unblock a 12-retailer pilot — replica-only paths are admin tooling, not the retailer/customer flow.*

**P1 — should do soon after launch:**
- [ ] Rehash `ADMIN_PASSWORD_HASH` out of the legacy HMAC format.
- [ ] Enable admin TOTP (2FA) — currently off.
- [ ] Fix the CI vault-test false-pass (see §3) so CI stays a trustworthy gate.
- [ ] Legal review pass on training-data consent copy (flagged, not done).
- [ ] Retailer-facing data-retention/deletion notice for training photos (flagged, not built).

**P2 — backlog, not blocking:**
- [ ] Disaster-recovery runbook (not written).
- [ ] Split `admin.ts`/`checkout.ts` into smaller modules.

None of the P0 items are code changes — they're all "generate a value / set an env var in Railway." This is a half-day, not a sprint.

---

## 6. App-flow review checklist (before you call it launch-ready)

Manually walk each of these end to end on a real deploy (not localhost):

- [ ] **Retailer:** signup/OTP login → upload photo → AI tags product → edit/publish → appears in catalog.
- [ ] **Retailer → Customer:** generate collection link → open on a phone that isn't on your LAN (this is exactly where the "LAN IP, not hyperlinked" bug in §3 will bite if `WEB_URL` isn't set correctly) → WhatsApp share renders a proper preview.
- [ ] **Customer:** view collection → try-on → favorite → enquire → (if L2 enabled) checkout → payment → order confirmation.
- [ ] **Admin:** login (+2FA once enabled) → suspend/unsuspend a retailer → view activity log → deletion vault shows a soft-deleted record → AI provider dashboard shows usage.
- [ ] **Staff (if using internal team features):** OTP login → territory-scoped retailer list → ticket routing. *(Currently broken — see B-008, `TEAM_JWT_SECRET`.)*
- [ ] **Offline:** airplane-mode test on both the customer PWA and retailer app — confirm cached catalog still renders and queued mutations replay on reconnect.

---

## 7. Performance — web / admin / API / mobile

Nothing alarming was found, but nothing has been measured either — you're flying blind on real numbers.

- **Web/Admin (Next.js):** image optimization is on (R2/Cloudflare `remotePatterns` configured), no bundle analyzer wired in. **Add one** (`@next/bundle-analyzer`) before launch — it's a 10-minute add and tells you if the admin bundle is bloated. No Core Web Vitals reporting at all — add `next/web-vitals` reporting to Axiom/Sentry (both already integrated per `DEPLOY.md`) so you have real field data instead of guessing.
- **API (Fastify):** Redis is used for the BullMQ job queue but there's no separate response-caching layer — fine at current scale. Two loop-with-`await` patterns found (`checkout.ts` per-item update inside the order transaction, `team.ts` bulk ticket routing) — both are low-N in practice (garment quantity is always 1, ticket batches are small), not worth optimizing pre-launch.
- **Mobile:** no measured startup time or bundle size on record. `expo-image` prefetch and React Query offline-first caching are already in place, which covers the main perceived-speed lever for a catalog app.
- **Database:** SCALING.md already gives you the honest verdict: **current stack holds MVP scale (50–500 retailers), not the 1M target — and that's fine, you don't need 1M-scale infra for a launch.** The one item worth doing now because it's cheap: move the rate-limit store to Redis before you ever run more than one API instance (currently in-memory per SECURITY.md, breaks multi-instance rate limiting silently).
- **Load/security test:** none has ever been run (`SCALING.md §1`: "Load testing: None found in repo"). A single `k6`/`Artillery` smoke run against staging before launch (not before every deploy) is the one performance action item that's actually worth doing pre-launch — it'll catch anything the code review can't.

---

## 8. SEO — current state and what you need

**Current state: zero.** No `sitemap.ts`/`robots.ts`, no JSON-LD structured data, no `next-seo`, and only 8 files use `generateMetadata`/`export const metadata` at all (mostly admin pages, which don't need SEO). Only `apps/web/src/app/c/[slug]/page.tsx` (collection pages) has Open Graph tags. The marketing homepage itself has no per-page metadata beyond whatever's in the root layout.

**What you asked for — admin-managed SEO + content:** does not exist today. The 31 admin pages are all platform-ops/retailer/billing/database — there is zero admin surface for editing marketing copy, meta titles/descriptions, or landing sections. `apps/web/src/app/page.tsx` is hardcoded, not admin-editable.

**Minimum to launch with real SEO** (all missing, all small):
- [ ] `apps/web/src/app/sitemap.ts` (Next.js has a built-in convention for this — one file, auto-generates `sitemap.xml`).
- [ ] `apps/web/src/app/robots.ts` (same — built-in convention, one file).
- [ ] Per-page `generateMetadata` on the marketing homepage, retailer store pages (`store/[slug]`), and collection pages (title/description at minimum — OG image would help WhatsApp share previews too, and you already have WhatsApp share as a feature).
- [ ] JSON-LD structured data on retailer store pages (`LocalBusiness`/`Product` schema) — biggest SEO lever for "clothing store near me" searches, currently zero.

**Admin-managed content — this is a real build, not a config toggle.** Decide scope before committing to it:
- *Minimum viable:* a single admin settings page with editable fields for homepage headline/subhead, meta title/description per page type, and OG image upload — reuses the existing `AdminSetting`-style pattern already in the codebase (theme, notifications settings pages exist as a template to copy).
- *Full CMS:* editable marketing sections, blog, etc. — bigger scope, probably not needed for a launch that's mainly about retailer/customer/admin functionality.

Recommendation: build the **minimum viable** version (one settings page, few fields) — it satisfies "admin can manage SEO/content" without opening a CMS-shaped hole in your timeline. Say the word and I'll scope it as an F-xxx spec the same way everything else in this repo is tracked.

---

## 9. Pre-deploy checklist — code, API, server/infra

Pull this straight from `DEPLOY.md`'s own (currently all-unchecked) production checklist plus what this audit found:

**Code**
- [ ] `pnpm typecheck && pnpm lint && pnpm test` clean across all workspaces (currently clean per CI, but see the vault-test caveat in §3).
- [ ] Fix the CI vault-test issue so a green CI run is actually trustworthy.
- [ ] Run `/code-review ultra` (or the individual reviewer subagents) on the full branch before merge to main.

**API / Server**
- [ ] Health checks already exist (`GET /health` on API, `/api/health` on web) and are wired into `railway.json` — nothing to add.
- [ ] Apply the P0 security env-var items in §5 — this is the bulk of "server readiness."
- [ ] Confirm `034_product_sizes` migration is actually applied to the live DB (unverified per PROGRESS.md).
- [ ] Point `WEB_URL` and all mobile/web `.env` values at real production domains, not the devtunnel URL.

**Infra / DNS**
- [ ] Custom domain + SSL on both Railway services.
- [ ] R2 bucket set to public-read for product images.
- [ ] Razorpay webhook URL pointed at production, secret rotated (§5).
- [ ] Automated DB backups enabled (cron exists per `jobs/backup-database.ts`, confirm it's scheduled in prod).
- [ ] Sentry/Axiom logging enabled (both are already integrated, just confirm DSNs are set in prod env).

**Performance/Load**
- [ ] One load test run against staging (§7) — the single item on this whole list that's genuinely untested, not just unconfigured.

**Mobile app stores** (only if launching the retailer app via app stores rather than Expo Go/internal distribution)
- [ ] Google Play: $25 one-time, privacy policy URL hosted, Data Safety form, content rating questionnaire.
- [ ] Apple App Store: $99/yr, **and build a reviewer bypass for phone-OTP login** (a fixed test number + fixed OTP) — without this, Apple review will almost certainly reject the app. Nothing in the docs shows this has been planned yet; do it before submitting.

---

## 9b. 12-Retailer Pilot — First Steps, In Order

**Scope decision (2026-08-01):** you asked to do everything in §5–§9, starting with security, but the near-term goal is one controlled test with 12 retailers without breaking the server, port, or AI tagging. SEO (§8), admin-managed content (§8), and mobile app-store submission (§9) don't affect a 12-retailer pilot — nobody's finding you via Google search or an app store yet. **Deferring those three until after the pilot proves the app stable is the lazy-correct call, not scope-cutting** — building a CMS or filing app-store paperwork right now doesn't reduce your risk of the pilot breaking. Say so if you want them done in parallel anyway.

Do these in order. Nothing below requires touching CI/CD config or running a migration blind — where an action needs Railway/Supabase dashboard access, that's called out (per this project's own operational policy, I don't touch production env vars, deployments, or migrations directly).

1. **Set the P0 secrets in Railway (§5).** Values already generated this session (given to you in chat, not committed to this file — never commit secrets to git):
   - `COOKIE_SECRET`, `TEAM_JWT_SECRET`, `REVALIDATION_SECRET`, `RAZORPAY_WEBHOOK_SECRET` — ready to paste in as-is.
   - `ADMIN_PASSWORD_HASH` + `ADMIN_TOTP_SECRET` — run `npx tsx scripts/generate-admin-hash.ts '<your-chosen-password>' --totp` yourself (needs your password as input, so it has to be you, not me) — it prints both the hash and a QR-scannable TOTP URI for your authenticator app.
   - This step alone fixes: broken staff login (B-008), silently-rotating admin sessions (new finding, already patched in code), the weak webhook secret (S-009), stale ISR cache (B-009), and gets 2FA onto the admin panel (B-004).

2. **Switch `DATABASE_URL` to the `kanchuki_app` role — on staging/a test deploy first, not directly on the pilot deploy.** SQL is already written in `docs/SECURITY.md` §19.1. This is the one change with real "could break the server" risk if some code path assumes superuser privileges it doesn't actually need — validate it doesn't 500 on a basic retailer/product/order flow before pointing the pilot's `DATABASE_URL` at it.

3. **Confirm the web service has an explicit `PORT` Railway variable.** `docs/DEPLOY.md` documents a real 2026-08-01 incident: the web service had no `PORT` variable, drifted from the domain's target port, and every path 502'd. The API service already has `PORT=3001` set explicitly — mirror that on the web service (e.g. `PORT=3000`) so this can't recur during the pilot. This is the direct answer to your "don't break the port" concern — it already happened once.

4. **AI tagging — already safe for 12 retailers, nothing to change.** Each plan's `AI_TAGGING_CALL` quota is a *lifetime* cap (Starter: 575, Growth: 2,300, Pro: unlimited) — 12 pilot retailers tagging a normal catalog won't get near that. The provider registry already fails over across 5 seeded providers (Claude → OpenAI → Gemini → 2 free Llama fallbacks) with a 5-minute cooldown per provider, so one provider running out of credits mid-pilot won't stop tagging. Just confirm in Admin → AI Providers that at least 2 providers show as active with keys configured before the pilot starts — that's the only manual check needed here.

5. **Confirm `034_product_sizes` migration is applied to the live DB.** Unverified per `PROGRESS.md` (§3) — check via Supabase dashboard or `prisma migrate status`, apply via the admin dashboard's migration flow if it's missing, don't run it ad hoc from a terminal against prod.

6. **Manual smoke test (§6 checklist) — do this on the actual pilot deploy, not localhost**, before any retailer gets the link: retailer OTP login → upload/tag a photo → publish → generate collection link → open it on a phone off your LAN (this is exactly where the old LAN-IP bug would resurface if `WEB_URL` isn't set to the real domain) → WhatsApp share preview renders → customer favorite/enquire → admin sees the activity in the log.

7. **Skip the full k6/Artillery load test for this round.** `SCALING.md` recommends one before general launch, but 12 retailers is nowhere near the scale where load testing catches something a manual smoke test won't — running it now is effort spent on a risk that doesn't exist yet at this scale. Re-add it before opening up beyond a small pilot.

8. **During the pilot window:** confirm Sentry/Axiom DSNs are set (§9) so you actually see errors as they happen instead of hearing about it from a retailer, and keep the previous known-good Railway deployment one click away from rollback in case something in steps 1–3 misbehaves under real traffic.

Once the 12-retailer pilot has run cleanly for a few days, come back to §8 (SEO + admin-managed content) and app-store prep (§9) — those are the right next phase, not this one.

---

## 10. Bottom line — what to tell me you want at this stage

Everything in §2 is already built for your stated launch scope. The real work left is entirely in §5 (env vars/secrets — half a day), §8 (SEO — a few small files, plus a decision on how much admin-content-management you actually want), and §9 (one load test + DNS/domain setup). None of it is "tough" in an engineering sense — it's checklist work, not architecture work.

Tell me which of these you want done now vs. deferred:
1. SEO minimum-viable build (sitemap/robots/metadata/JSON-LD) — small, worth doing before launch.
2. Admin-managed content page (headline/meta/OG image) — small if scoped minimally, skippable if you're fine editing `page.tsx` by hand for now.
3. Security P0 checklist (§5) — not optional, do this regardless of what else you skip.
4. Load test — recommended once, before launch traffic, not recurring.
5. App-store submission prep — only if launching via app stores this round; skip if retailer app ships as a web/Expo-Go link first.
6. **(Added 2026-08-11) Rate-limit bypass fix** — one-line, drop `x-retailer-id` header trust from the global rate limiter. Not optional, do this regardless of what else you skip — it currently defeats admin-login brute-force protection.
7. **(Added 2026-08-11) Fix CI** — `apps/api` has 8 real lint errors blocking `main`'s `quality` job, which also means the DB-guardrail/secrets CI checks haven't run in 3 pushes. Small, mechanical fix (`biome check --fix` handles most of it) + one allowlist line in `check-delete-guard.sh` for `reset-demo-data.sql`.

For the Google Play Store question specifically: `docs/PLAY-STORE-LAUNCH-CHECKLIST.md` (updated Aug 10) is the actionable doc — store listing, Data Safety form, content rating, and the closed-testing path are all filled in and current. The **Aug 31, 2026 target-API-level deadline** (§5 of that doc) is already satisfied — Expo SDK 54 defaults `targetSdkVersion` to 36, so no SDK 55 bump or Play Console extension is needed. Nothing else in that doc changed this session.
