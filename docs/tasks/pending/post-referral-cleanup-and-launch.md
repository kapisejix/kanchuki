# Post-Referral Cleanup + Launch Batch — PENDING

> Created 2026-09-24. One work board for: referral follow-ups, admin-access classification,
> RC-033, refunds, `?ref=` capture, hardcoded lists → DB, and `launch-readiness.md`.
> Work top to bottom. One commit per task. Tick `[x]` + commit hash when done.

---

## ⚠️ 0. Branch — read first

**The referral work (F-038, T1–T7 + T9, RC-033…RC-037) is on branch
`chore/remove-text-to-image-studio-engines`, which is 23 commits ahead of `main` and NOT merged.
It is NOT on `docs/reorganize` and NOT on `main`.**

`packages/shared/src/constants/admin-access.ts`, `apps/api/src/jobs/referral-*.ts`,
the T5 / `billing-webhook.ts` interaction, migrations `106`–`115` — all only exist on that branch.

- [ ] **0.1** Open PR `chore/remove-text-to-image-studio-engines` → `main` (owner approves + merges; push to main = Railway auto-deploy, never `railway up`).
- [ ] **0.2** Branch every task below from the merged `main` (or from that branch if the PR is still open). Do NOT build on `docs/reorganize`.

---

## 1. Migration state — ✅ CHECKED 2026-09-24

Script: `scripts/check-pending-migrations.ts` (read-only, SELECTs only).
Run: `cd apps/api && npx tsx --env-file .env ../../scripts/check-pending-migrations.ts`

Result against `aws-1-ap-south-1.pooler.supabase.com` (prod):
**063, 104, 105, 106, 108, 109, 110, 111, 112, 113, 114, 115 → all APPLIED.**
`_prisma_migrations` has **zero rows** for any of them (applied via Supabase SQL Editor).

- [ ] **1.1 (owner)** Reconcile `_prisma_migrations` — insert runner rows for 063, 104–115 (the admin migration runner otherwise thinks they are pending). Same fix as 083–089 on 2026-09-04.
- [ ] **1.2** Update docs that still say "not applied": `launch-readiness.md` (063, 104/105 lines), CLAUDE.md row 75, referral spec §12 "OWNER ACTIONS" #1 and #4.
- [ ] **1.3 (owner)** Pick the engine for the 8 MODEL `studio_styles` rows in `/admin/studio-styles` (all currently NULL → Kontext).
- Next free migration number: **116**.

---

## 2. Referral leftovers (F-038)

- [ ] **2.1 Run `apps/api/src/jobs/purge-rls-live.test.ts` for real.** Never executed. Needs a real Postgres (local Docker `postgres:16` with migrations applied — NOT prod). Record pass/fail in the referral spec §11. Fails → new RC entry.
- [ ] **2.2 (owner)** RazorpayX account live + `referral_payout_accounts` rows (runbook `docs/runbooks/razorpayx-referral-setup.md`). Until then T7 pays nobody.
- [ ] **2.3 (owner)** CA conversation before touching TDS settings.
- [ ] **2.4** T8 mobile "Refer & Earn" — blocked on Play Console review. Leave until owner says go.

---

## 3. Admin-access classification (RC-034 follow-up) — FIX

File: `packages/shared/src/constants/admin-access.ts` (lines ~118–137 carry the notes).

- [x] **3.1** Move `team-members` into the super-admin list (manages staff accounts via `/v1/team/*` — credential-adjacent). Delete the FLAGGED note.
- [x] **3.2** Move `reports` into the super-admin list (`/admin/reports/gst` is tax data — the only reason it was borderline). Delete the NOTE.
- [x] **3.3** Sidebar (`apps/web/src/app/admin/components/Sidebar.tsx`) derives from the shared list — confirm Team Members / Overview / GST Reports now hide for plain ADMIN, and the API + page guard refuse them. **Nav + page guard: confirmed, and now *pinned* (both were comment-only before) — `Sidebar.test.tsx` gained a case per role, `admin-access.test.ts` a case per path, each falsified by moving the segments back. Consequence found and asserted: every child of *Reports & Finance* is super-admin-only now, so that group disappears for a plain ADMIN. API: the built-in list governs `/v1/admin/*` and does NOT cover `/v1/team/*`, which is where both pages actually fetch from — `teamAuthPreHandler` promotes any valid admin key to unscoped Super Admin. Reported to the owner 2026-09-24; decision was **document and defer** (see the scope note in `admin-access.ts`), so those two API surfaces remain reachable by a plain-ADMIN key.**
- [x] **3.4** `pnpm --filter @kanchuki/shared build` (dist is gitignored — RC-035 trap), then the admin-access test + `npx vitest run src/routes/admin.login.test.ts`. → **12/12, 9/9, Sidebar 10/10, shared build clean.**

---

## 4. RC-033 — billing collapses `completed` into `cancelled` — FIX

`billing-webhook.ts` maps both `subscription.cancelled` and `subscription.completed` → `Subscription.status = CANCELLED`. T5 clawback decides money on it.

- [ ] **4.1** Read the subscription status enum + grep every reader of `'CANCELLED'` (billing gating, plan-limit fallback, T5 qualification job, T6 accrual, admin billing page, commission tracker). List them here before editing.
- [ ] **4.2 (owner decision — money, ask first)** Does a *completed* term (paid the full term, not renewed) claw back a referral like churn? Default proposal: **completed = not active for access, but NOT a clawback**.
- [ ] **4.3** Migration `116_subscription_status_completed`: `ALTER TYPE ... ADD VALUE 'COMPLETED'` in its own migration (PG 55P04 — enum add can't share a tx with its use; see the 060/061 split).
- [ ] **4.4** Webhook: `subscription.completed` → `COMPLETED`. Every reader from 4.1 that means "not active" treats `COMPLETED` like `CANCELLED` (shared helper only if ≥3 readers).
- [ ] **4.5** T5 job applies the 4.2 decision. Test: completed-subscription conversion → expected status; falsify by reverting the branch.
- [ ] **4.6** RC-033 → "Fixed in `<hash>`" in `docs/root-cause/root-cause issues.md` + CLAUDE.md RC table row.

---

## 5. Refunds + `?ref=` capture — FIX

### 5A. Refunds (nothing writes `SubscriptionPayment.status = 'refunded'`)
- [ ] **5A.1** Handle Razorpay `refund.processed` in `billing-webhook.ts` → set the matching `SubscriptionPayment.status = 'refunded'`. Idempotent (same event twice = no-op). HMAC check unchanged.
- [ ] **5A.2** T6: confirm a refunded month stops earning (T6 earns only on `success` — test it). T5: refund of the *qualifying* payment → `CLAWED_BACK` (irreversible — owner confirms rule first).
- [ ] **5A.3** GST: a refund needs a credit note against the original invoice (`GstInvoiceSequence`). Owner/CA decision — if deferred, write that here; never skip silently.
- [ ] **5A.4 (owner)** Razorpay dashboard: subscribe the webhook to `refund.processed`.

### 5B. `?ref=` link capture
Spec §0 T4: not built because there is **no web signup** — a cookie nobody reads is the RC-025 shape.
- [ ] **5B.1** Carry the code into the app: link `https://kanchuki.app/r/<CODE>` → page shows the code + Play Store button with Install Referrer (`&referrer=ref%3D<CODE>`) + `kanchuki://signup?ref=<CODE>` deep link for installed apps.
- [ ] **5B.2** Mobile: read Install Referrer / deep-link param once at first launch → prefill the existing manual code field in onboarding (T4 server write unchanged; server still validates). ⚠️ `apps/mobile` → EAS build; ask owner whether it rides with T8.
- [ ] **5B.3** Tests: unknown code still refused server-side; prefill never auto-submits.

---

## 6. Hardcoded lists → DB — FIX

Rule: admin-editable data comes from the DB; true constants (fixed enum options) live once in `@kanchuki/shared`, never copied per file.

| # | File:line | List | Source to use |
|---|---|---|---|
| 6.1 | `apps/web/src/app/(shopper)/my-profile/page.tsx:27` | `STYLE_CHIPS` (**duplicate `'Gown'`**) | `default_product_attributes` `kind = STYLE`. No public read route exists (only `GET /admin/default-attributes`, `admin-misc.ts:130`) → add `GET /v1/public/attributes?kind=STYLE` with the Redis public-cache. |
| 6.2 | `apps/mobile/app/growth/templates.tsx:64` | `STUDIO_TEMPLATES` (18 styles) | `GET /products/studio-styles` (`products-studio.ts:44`, `studio_styles`) — exists. |
| 6.3 | `apps/mobile/app/growth/templates.tsx:85` | `OCCASIONS` festivals | `GET /growth/festivals` (`growth-campaigns-crud.ts:63`, `Festival`) — exists. Keep `'General'` as the one literal. |
| 6.4 | `apps/web/src/app/admin/social-templates/page.tsx:78` | `OCCASIONS` (differs from 6.3) | `GET /admin/festivals` (`admin-festivals.ts:35`) — exists. |
| 6.5 | `apps/web/src/app/admin/billing/page.tsx:42-44` | `₹4,999/₹9,999/₹14,999` + product counts | `GET /admin/plan-pricing` (`admin-plans.ts:159`) + `plan_limits`. Violates "plan_pricing is source of truth". |
| 6.6 | `apps/api/src/routes/admin/admin-retailers/admin-retailers-detail.ts:157-159` | per-plan limits + dead `try_on` | `PlanLimit` table (F-010). Delete `try_on` (VTO removed). |
| 6.7 | `apps/web/src/app/pricing/page.tsx:32` | `ROWS` limits (500 / 2,000 / 50/month) | Numeric cells from `/v1/public/pricing` (extend with limits if missing); ✅/— feature rows may stay static copy. |
| 6.8 | `apps/web/src/app/c/[slug]/components/SavedSize.tsx:6`, `FamilyProfiles.tsx:6` | `SIZE_OPTIONS` copied twice | Import from `@kanchuki/shared` (`constants/index.ts:79`). Fixed enum — no DB. |
| 6.9 | `apps/web/src/app/c/[slug]/components/RegionalFilters.tsx:5` | `REGIONAL_STYLES` | Check first whether any product carries these tags. None → delete the component. Some → `default_product_attributes`. |
| 6.10 | `apps/api/src/routes/public/public-stylist.ts:137` | `SUBTYPE_KEYWORDS` | Names from `default_product_categories` (cached). |
| 6.11 | `apps/api/src/jobs/catalog-sync.ts:76` | `HSN_RULES` | GST — owner call. Default: leave in code, move next to GST helpers in `@kanchuki/shared`. |
| 6.12 | `999999` in `billing-webhook.ts:107`, `retailers-settings.ts:73`, `apps/mobile/app/analytics.tsx:272`, `admin/retailers/[id]/page.tsx:1015` | magic "unlimited" | One `UNLIMITED` constant in `@kanchuki/shared`. |
| 6.13 | `apps/mobile/app/(tabs)/catalog.tsx:50` | `PRICE_BUCKETS` | Skip — UI filter constant. |
| 6.14 | `apps/web/src/app/admin/photo-cleanup-test/page.tsx:105` | `VIDEO_MODELS` ₹ costs | Skip — admin bench only. |

- [ ] **6.a** Web/API items (6.1, 6.4–6.10, 6.12). Every list now fetched gets loading + empty + error states (RC-003: surface the real error).
- [ ] **6.b** Mobile items (6.2, 6.3) — ships with next EAS build.
- [ ] **6.c** Re-grep `const [A-Z_]+ = \[` with string literals across `apps/` for stragglers.

---

## 7. Launch readiness (absorbs `launch-readiness.md`)

### 7A. Code — Claude can do
- [ ] **7A.1** `apps/web/src/app/sitemap.ts` (missing; `robots.ts` exists) — stores + collections from the API, `revalidate`.
- [ ] **7A.2** Per-page `generateMetadata` + JSON-LD (`Store`/`Product`/`ItemList`) on `/{store}` + collection pages — check what exists first.
- [ ] **7A.3** Apple reviewer bypass: fixed test phone + fixed OTP, env-gated (`REVIEW_PHONE`/`REVIEW_OTP`), off by default, never logged. Security review before merge.
- [ ] **7A.4** Disaster-recovery runbook `docs/references/guides/disaster-recovery.md` (Supabase backups/PITR, R2, Redis, Railway rollback, secret rotation order).
- [ ] **7A.5** Load-test script against **staging** (`docs/SCALING.md` §5); owner runs it.
- [ ] **7A.6** Retailer-facing training-photo retention/deletion notice (copy + placement); legal review after (7B.1).
- [ ] **7A.7** Pre-production: re-test every RC-### (`docs/root-cause/README.md`) — pass/fail per RC.

### 7B. Owner-only
- [ ] **7B.1** Lawyer review: privacy + terms (PR #37), training-data consent copy.
- [ ] **7B.2** Play Store: 8 screenshots, 1024×500 feature graphic, Data Safety form, submit.
- [ ] **7B.3** Set `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` in Railway.
- [ ] **7B.4** Rotate every credential from the dev `.env` (Anthropic, OpenAI, Supabase, R2, Redis).
- [ ] **7B.5** Lock MSG91 `verifyAccessToken` shape: `npx tsx scripts/verify-msg91-token.ts "<widget_jwt>"`.
- [ ] **7B.6** AI Studio Shoot live run on the admin bench (`FAL_API_KEY`, `GEMINI_API_KEY`).
- [ ] **7B.7** B-002 read replica (not needed for pilot).
- [ ] **7B.8** Real-device pass: OTP login/create, onboarding→GST→plan, photo→AI tag→save + bg/shadow, sizes, customer prefs, WhatsApp link on a 2nd phone off-LAN, FB/IG connect + post (T-8.2), bulk onboarding, account settings, Growth hub, a11y (Reduce Motion, labels, 44px), offline add → sync.

---

## Done log
| Task | Commit | Date |
|---|---|---|
| 1 — migration check script + prod result (all applied) | uncommitted: `scripts/check-pending-migrations.ts` | 2026-09-24 |
| 3 — admin-access: `team-members` + `reports` → super-admin (RC-034 follow-up) | `36b764c3` | 2026-09-24 |
