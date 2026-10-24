# Security audit — 5 points (secrets, data access, uploads, paid gates, AI caps)

**Status (2026-10-24):** ✅ Code complete and merged — #151 (T1–T4) and #152 (`content_length` required, `0e85aea7`) are on `main`; #145 (staged uploads) is merged. Still owner-side: R2 lifecycle rules (`uploads/pending/`, `catalog-pdf/`, `catalog-source/`, 1 day) and a device test of uploads on the new EAS build; watch API logs for 422s from old app builds. Original per-task status follows. 🟨 T1 ✅ `b9616811` (RC-082), T2 ✅ `e59d78ff` (RC-079), T3 server side ✅ `48e84013` (RC-080; client side split to `mobile-presign-content-length.md`), T4 part 1 ✅ `10fa64ec` (`admin-route-guard.test.ts`). **T4 RLS closed 2026-10-22, no migration** (live check, see §2 T4: all 86 public tables have RLS on). Pushed: PR #151 (open). T3 client side built (`9b2ec714`, `2909ec4f`) and made required on the server in draft PR #152 (`c4e38e25`), pending owner R2 check, device test and build rollout. Owner approved T1–T4 and the expired-plan rule (**drop to STARTER**) on 2026-10-22.
**Branch:** `fix/security-audit-5pts` (created from `fix/upload-staging`). T3 builds on the upload-staging code. This branch already contains `fix/upload-staging` (PR #145), so merging #151 covers #145.
**Surfaces audited:** `apps/api`, `apps/web` (customer PWA + admin), `apps/mobile`.

---

## 1. Audit result

| # | Check | Result |
|---|---|---|
| 1 | API keys / secrets in frontend code | ✅ Pass |
| 2 | Customer data readable without access rules | 🟨 API ok; DB-layer RLS unverified |
| 3 | Uploads with no size or rate limit | 🟨 Partial |
| 4 | Paid features not checked on the server | 🔴 Gap |
| 5 | AI loops with no step / time / cost cap | 🟨 One open cost hole + SDK timeouts |

### 1.1 Secrets in frontend — ✅ (no task)
- Web reads only `NEXT_PUBLIC_API_URL`, `_SITE_URL`, `_R2_PUBLIC_URL`, `_SENTRY_DSN`, `_MSG91_WIDGET_ID`, `_MSG91_TOKEN_AUTH`, `_WHATSAPP_NUMBER`. All public by design.
- Mobile reads the same set as `EXPO_PUBLIC_*`; the auth token is in `expo-secure-store` (`apps/mobile/src/lib/storage.ts`).
- No server key name (`ANTHROPIC/OPENAI/R2_SECRET/RAZORPAY_KEY_SECRET/SUPABASE_SERVICE_KEY/ADMIN_API_KEY`) appears in client code. A regex scan for hardcoded keys found only base64 PNG fixtures in e2e tests.
- `.jks` keystores in `apps/mobile/` are gitignored and not tracked.
- Low: the admin session token lives in `sessionStorage` (`apps/web/src/app/admin/components/LoginScreen.tsx:103`), so an XSS on an admin page can read it. The IP allowlist and CSRF reduce the risk. Not scheduled.
- **Re-check (owner, optional):** `gitleaks detect` over git history, then grep the built `.next/static` and the EAS JS bundle for `sk-`, `rzp_`, `AKIA`.

### 1.2 Customer data access — 🟨 (T4)
- ✅ The global auth hook is default-deny (`apps/api/src/plugins/auth.ts:468`). Only `/v1/public`, `/v1/admin`, `/v1/team`, `/v1/auth` and `/v1/try-on/remote/` skip it, and admin and team add their own hooks.
- ✅ Every admin module has `adminAuthPreHandler`. `admin-bug-reports`, `admin-design-references`, `admin-invoices` and `admin-retailers` inherit it from `routes/admin.ts:65`.
- ✅ `routes/customers.ts` filters every query by `retailer_id`. Passport uses an opaque cookie session. Phone masking is in place (RC-066).
- ⚠️ The admin guard is added per module, so a new module that forgets it fails open (the RC-034 shape). No test enumerates every `/v1/admin/*` route.
- ⚠️ DB RLS: a rough static scan of migrations suggests many tables have no RLS (`retailers`, `products`, `staff`, `social_accounts` (holds tokens), `subscriptions`, `collections`, …). The regex is noisy (it missed `customers` in `001`, which does have RLS). This only matters if the Supabase anon key leaks, because PostgREST would then serve those tables. **Must be confirmed live** with the Supabase Security Advisor.

### 1.3 Uploads — 🟨 (T3)
- ✅ Multipart routes (try-on `products-tryon.ts:180`, My Style `public-my-style-analyze.ts:62`) set `fileSize` + `files: 1`; My Style also has 5/min.
- ✅ Presigned uploads go through `verifyUpload` (`apps/api/src/lib/upload-guard.ts`): ownership, magic bytes and `maxBytes` are checked, but only **after** the bytes landed.
- ❌ `getUploadPresignedUrl` (`packages/ai/src/r2.ts:34`) does not bind `ContentLength`, so one 5-minute URL accepts a PUT of up to 5 GB into `uploads/pending/`. The R2 lifecycle rule for that prefix is still an owner step (`docs/build-log/part-7.md`, line 43).
- ❌ The 11 `upload-url` routes have only the global 200/min/IP limit.

### 1.4 Paid features — 🔴 (T1)
Server gates exist: `hasFeature` (27 call sites, fails closed) and `checkQuota` (21 call sites). Both trust `retailer.plan` only:
- `hasFeature` (`lib/features.ts:30`) and `effectiveLimit` (`lib/quota.ts:24`) never read `plan_status`, `trial_ends_at` or `plan_expires_at`. The auth plugin loads `plan_status` (`plugins/auth.ts:609`) and ignores it.
- Nothing ever ends a trial. `auth.ts:676` sets `trial_ends_at` to now + 14 days, and onboarding `demo_plan` sets PRO + TRIAL (`retailers/retailers-settings.ts:69`). No job or check reads `trial_ends_at` afterwards, so **PRO is free forever**.
- The webhook moves `plan_status` to `PAST_DUE` / `CANCELLED` / `COMPLETED` (`billing/billing-webhook.ts:289,310,327`), and `POST /billing/cancel` does the same (`billing/billing-subscription.ts:182`). None of them change `plan`, so a **cancelled store keeps its paid features**.
- About 12 other places read `retailer.plan` directly (`showcase-quota.ts:31`, `billing-addons.ts:38`, `catalog-import.ts:375`, `products-studio.ts:59,128`, `post-templates.ts:37`, `retailers-social-fanout.ts:302`, `public-products.ts:227`, `quota.ts:211`, …). Patching each reader is the wrong fix, so T1 fixes the stored data instead.
- Separate owner decision, not in T1: `checkQuota` fails **open** when no `plan_limits` row exists (`quota.ts:39`). Seeding rows for every metered AI resource closes it with no code change.

### 1.5 AI loops — 🟨 (T2)
- ✅ No multi-step agent loops exist; every model call is single-turn. The fal/studio polls have deadlines (`fal-client.ts:84`, `fal-video.ts:171`, `studio-shoot.ts:1040`). BullMQ attempts are 1–3. The provider fallback is bounded by the provider list. Retailer AI reserves quota credits (`reserveAiCredits`).
- ❌ `POST /v1/public/stylist` (`routes/public/public-stylist.ts:79`) needs **no login** and makes a synchronous Claude call on every request, with up to 60 products of catalog JSON in the prompt. It has no per-route rate limit, no fetch timeout (`:401`) and no cache, so anyone can spend Claude credit at 200 req/min per IP.
- ❌ The Anthropic and OpenAI SDK clients (`packages/ai/src/providers.ts:387,466`, `packages/ai/src/embedder.ts:8`) set no `timeout`. The SDK default is 10 min with 2 retries, multiplied by up to 3 BullMQ attempts.
- ❌ There is no platform-wide daily AI spend cap or alert in code. CLAUDE.md §5 describes one, but it was never built. It is deferred (see T2.4).
- Aside: `POST /v1/public/collections/:slug/enquire` has no per-route limit (enquiry spam).

---

## 2. Task breakdown

Order: **T1 → T2 → T3 → T4** (impact first). One commit per task. Each commit that fixes a shipped bug mints an RC entry (`docs/root-cause/root-cause issues.md` + CLAUDE.md RC row). The next free id is RC-083; check the tracker first.

### T1 — Lapsed plans drop to STARTER (paid-gate fix) · RC-082
**Root cause:** `plan` is never downgraded when a trial ends or a subscription lapses, and every gate reads `plan`.
**Fix the data, not the ~14 readers:**
1. New `apps/api/src/jobs/plan-lapse.ts` → `handlePlanLapse(now = new Date())`:
   - `findMany` retailers where `plan != STARTER` AND `deleted_at IS NULL` AND
     (`plan_status = TRIAL` AND `trial_ends_at < now`) OR
     (`plan_status IN (PAST_DUE, CANCELLED, COMPLETED)` AND (`plan_expires_at IS NULL` OR `plan_expires_at < now`)).
   - `updateMany` on those ids: `plan: 'STARTER'`, `max_products: orUnlimited(PLAN_LIMITS.STARTER.max_products)`, `max_customers: orUnlimited(PLAN_LIMITS.STARTER.max_customers)`. `plan_status` is left unchanged.
   - `auditLog.createMany`, one row per retailer (`actor_type: 'system'`, `action: 'update'`, metadata `{ from_plan, reason: 'plan_lapsed' }`).
   - Log the count of `TRIAL` rows with `trial_ends_at IS NULL` but **do not touch them** (admin-granted; owner decides).
2. Register in `jobs/index.ts`: add a `case 'plan-lapse'` to the maintenance switch, plus a repeat with `pattern: '0 * * * *'` (hourly) and **no `limit`** (RC-062).
3. Cancel keeps access until period end. That matches the existing comment in `billing-subscription.ts:186` and works because the job keys on `plan_expires_at`. PAST_DUE has `plan_expires_at` at the end of the paid term, which is already past, so it downgrades on the next run.
4. Re-subscribe already restores the plan (`billing-webhook.ts:222` sets `plan` + ACTIVE). No change needed.

**Tests (`jobs/plan-lapse.test.ts`, mocked prisma like other job tests):** expired TRIAL → STARTER; TRIAL in the future → untouched; TRIAL with null date → untouched and counted; CANCELLED with `plan_expires_at` in the future → untouched; CANCELLED or PAST_DUE in the past → STARTER; ACTIVE → untouched; already STARTER → not selected; the audit row is written.
**Done when:** tests pass, `pnpm --filter @kanchuki/api typecheck` is clean, and `npx vitest run src/routes/security.test.ts` passes.
**Owner:** none (no migration). After deploy, watch the first run's log count.

### T2 — AI cost caps · RC-079
1. `routes/public/public-stylist.ts`: add `config: { rateLimit: { max: 10, timeWindow: 60_000 } }` on `POST /stylist`, and `signal: AbortSignal.timeout(20_000)` on the Anthropic `fetch`. A timeout lands in the existing `catch` and then `fallback(...)`; check that the fallback logs to Sentry (RC-059).
2. `packages/ai/src/providers.ts:387,466` + `embedder.ts:8`: pass `timeout: 60_000, maxRetries: 1` to `new Anthropic(...)` / `new OpenAI(...)`.
3. `routes/public/public-collections.ts:225` (`/enquire`) and the My Style enquiry route: add `rateLimit { max: 10, timeWindow: 60_000 }`.
4. Deferred: a platform daily spend cap. Add it when `ai_usage_log` cost totals are trusted. If you want it now, ask the owner for a ₹/day threshold.

**Tests:** extend `public-stylist.test.ts`: the 11th request inside a minute → 429; a hanging fetch → fallback response (fake timers). Add a unit assertion that the client constructors receive `timeout` and `maxRetries`.

### T3 — Upload size bound + per-route rate limit · RC-080
1. `packages/ai/src/r2.ts` `getUploadPresignedUrl(key, contentType, expiresIn, contentLength)`: set `ContentLength` on the `PutObjectCommand` so it is part of the signature.
   **⚠️ Verify against real R2 first:** presign a 1 KB URL, then `curl -X PUT --data-binary @50mb.bin` must fail (403). If R2 or the presigner does not enforce it, stop and report; the post-hoc `verifyUpload` check stays the guard.
2. All 11 `upload-url` routes (`products-media.ts:22`, `growth-videos.ts:25`, `categories.ts:56`, `catalog-import.ts:112`, `retailers-uploads.ts:14,42,72`, `retailers-showcase-designs.ts:166`, `admin-media.ts:76`, `admin-showcase-designs.ts:215`, `showcase-watermark.ts:145`, plus `admin-studio-styles` / `admin-post-templates` if they presign): accept `size: z.number().int().positive().max(<same max verifyUpload uses>)` and pass it through. Reuse one shared max per kind; do not copy numbers.
3. Same routes: add `config: { rateLimit: { max: 30, timeWindow: 60_000 } }`. Key by IP, because rate limiting runs before auth.
4. Clients send `size`: mobile (`apps/mobile/src/lib/api*` upload helpers) and web admin upload helpers. The PUT must send exactly that many bytes, which `fetch(blob)` does by default.
5. Owner: add the R2 lifecycle rule (`uploads/pending/` expires after 1 day; `catalog-pdf/` and `catalog-source/` after 1 day).

**Tests:** route test: missing or oversized `size` → 400; the presign mock receives `contentLength`; the 31st call → 429. Manual: the curl check from step 1, then a real product-photo upload on device (Expo Go) and in admin.
**Risk:** an old mobile build without `size` breaks uploads. Make `size` optional for one release (no bound when it is absent and a warning is logged), or ship after the EAS update. Ask the owner.

### T4 — Admin route-guard test + RLS gap · (RC only if a hole is found)
1. New `apps/api/src/routes/admin-route-guard.test.ts`: build the server the way `admin-access.test.ts` does, collect every route under `/v1/admin` via `server.addHook('onRoute')`, and `inject` each one without `x-admin-key`. Expect 403 for all except `/v1/admin/login`. This catches the next module that forgets `adminAuthPreHandler`.
2. **RLS — CLOSED 2026-10-22, no migration.** Live check (Supabase Security Advisor + read-only catalog queries, project `thpqcylmcxokajxoerjx`): 86 of 86 `public` tables have RLS on, none off. The 52 advisor findings are INFO `rls_enabled_no_policy` (deny-all for `anon`/`authenticated`, so a leaked anon key reads nothing). `kanchuki_app` and `kanchuki_purge` have `BYPASSRLS = true`, so the backend is unaffected. The static-scan premise in §1.2 was wrong. Owner decision: drop the migration; backend-role `FOR ALL` policies on the 52 tables are only a guard against someone removing `BYPASSRLS` and are not being added. Remaining advisor WARN: Supabase Auth leaked-password protection is off (dashboard toggle; login is phone OTP).
   - Original plan (not executed): get the real list of tables without RLS: Supabase dashboard → Advisors → Security (project `thpqcylmcxokajxoerjx`), or the Supabase MCP `get_advisors` after the owner authenticates.
   - Write migration `NNN_enable_rls_remaining/migration.sql`: `ENABLE ROW LEVEL SECURITY` on each listed table **plus** the backend-role `FOR ALL` policy pattern from migration `111_backend_role_rls_policies`.
   - **⚠️ Warning:** enabling RLS without that policy makes every backend query on a table the backend role does not own return zero rows, silently (see SECURITY.md §19 notes around line 875). The policy is not optional.
   - **Owner applies the migration** (the agent never runs migrations). Re-run the advisor afterwards, then smoke-test retailer login, product list and customer list.

**Tests:** the guard test passes and fails if you temporarily remove one module's hook (check this once by hand). RLS: advisor clean + smoke test.

---

## 3. Skills to use (new session)

| When | Skill |
|---|---|
| Start, keep code minimal | `ponytail:ponytail` (already the session default) |
| Each task, test first | `superpowers:test-driven-development` |
| Running this spec task by task | `superpowers:executing-plans` |
| Security patterns (rate limit, timeouts, upload, authz) | `agent-skills:security-and-hardening`, `ecc:security-review` |
| RLS migration (T4) | `supabase:supabase-postgres-best-practices`, `ecc:database-migrations` |
| If a test fails unexpectedly | `superpowers:systematic-debugging` |
| Before saying "done" | `superpowers:verification-before-completion` |
| Review before PR | `superpowers:requesting-code-review` (or `/code-review`) |
| Independent re-scan after fixes | `claude-security:claude-security` (scan this branch's diff) |
| Merge / PR | `superpowers:finishing-a-development-branch` |

## 4. Verification commands

```bash
pnpm --filter @kanchuki/api typecheck
pnpm --filter @kanchuki/api test
cd apps/api && npx vitest run src/routes/security.test.ts src/routes/admin.login.test.ts
cd apps/api && npx vitest run src/jobs/plan-lapse.test.ts src/routes/public/public-stylist.test.ts src/routes/admin-route-guard.test.ts
```
