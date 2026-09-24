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
- **Migration allocation — decided 2026-09-24:** `116` stays reserved for §4.3's `ALTER TYPE ... ADD VALUE 'COMPLETED'` (it must be its own migration — a PG `55P04` enum add cannot share a transaction with its use, the same split as 060/061). **§6.11's HSN table therefore takes `117`.** Order does not matter between them: §4.3 must precede §4.4, and 6.11 is independent — the only rule is that neither claims the other's number.
- ⚠️ **§6.11 is now larger than this table implies.** Owner decision 2026-09-24 was **DB-editable, not the default**: `HSN_RULES` (`apps/api/src/jobs/catalog-sync.ts:76`) becomes a real table + admin screen + migration `117`, seeded from the current in-code list, with the code list kept as the documented fallback. Treat it as its own task, not a list move.

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

- [x] **4.1** Inventory — **done 2026-09-24** (below). Three of this bullet's own premises are wrong: there is **no billing gate**, **no plan-limit fallback**, and the **admin billing page reads no status at all**.

**THE DECISIVE FACT: one enum, two columns.** `SubscriptionStatus` is used by **both** `Retailer.plan_status` *and* `Subscription.status` (`schema.prisma:276`, `:978` — the baseline enum is `TRIAL | ACTIVE | PAST_DUE | CANCELLED`, `migrations/000_baseline:14`). So the `ALTER TYPE` in §4.3 changes *both*, and every `plan_status` reader below is in scope for §4.4 — not just the webhook.

**Writers of the literal (4):**
| Where | What it writes |
|---|---|
| `billing-webhook.ts:180–194` | **RC-033 itself** — `case 'subscription.cancelled': case 'subscription.completed':` share one block → `Subscription.status='CANCELLED'`, `Retailer.plan_status='CANCELLED'`, `razorpay_subscription_id=null` |
| `billing-subscription.ts:170–182` | retailer self-cancel: `updateMany({ status: { not: 'CANCELLED' } })` + `plan_status='CANCELLED'` + `razorpay_subscription_id=null` |
| `admin-retailers-detail.ts:146,167` | admin PATCH plan/status — **zod enum is the literal 4** (`admin-retailers-list.ts:56` same), so `COMPLETED` is *unsettable and unfilterable* until both are widened |
| `packages/db/prisma/seed.ts:69…` | seeds `ACTIVE`/`TRIAL` only |

**Readers that DECIDE something (§4.4 must reason about each):**
| Reader | Reads | Means "not active"? |
|---|---|---|
| `jobs/referral-qualify.ts:185` (T5) | `subscriptions.some(s => s.status === 'CANCELLED')` → `CLAW_BACK REFERRED_CHURNED_AFTER_PAYMENT` | **Yes — money.** This is the §4.2 decision's single site |
| `billing-subscription.ts:65` (subscribe) | `findFirst({ status: { in: ['TRIAL','ACTIVE'] } })` → blocks a second subscription | **Already correct for both** — a `COMPLETED` **or** `CANCELLED` row does not block, so a finished term can resubscribe either way (no change needed) |
| `billing-subscription.ts:152` (cancel) | `plan_status === 'CANCELLED'` → 422 "No active subscription to cancel" | Needs review: a `COMPLETED` retailer also has `razorpay_subscription_id=null`, so the first clause already refuses — but the message/behaviour should be stated, not inherited |
| `admin-plans.ts:520` (GET /admin/usage MRR) | `subscription.findMany({ status: 'ACTIVE' })` → `mrr_inr` | **Correctly excludes `COMPLETED` already** — a finished term is not recurring revenue |
| `admin-retailers/*.ts` status filter + `admin/retailers/[id]/page.tsx:255` | `status: plan === retailer.plan ? retailer.plan_status : 'ACTIVE'` | Writer, not a reader — but it is how a `COMPLETED` retailer gets moved off the state |

**Readers that only DISPLAY (each needs a `COMPLETED` case or it leaks the raw enum string):**
- `apps/web/src/app/billing/lib.ts:28` `planStatusLabel` — `switch` with `default: return status` → renders the literal **"COMPLETED"** on the retailer billing page (pinned today for the other four by `billing/__tests__/lib.test.ts:24–29`).
- `apps/web/src/app/billing/page.tsx:711,736,786,791,798,831` — `statusActive = status === 'ACTIVE'` drives "Renews …" vs "No active subscription", the cancel button, and the plan-switch buttons.
- `apps/web/src/app/admin/retailers/page.tsx:176,253` + `[id]/page.tsx:297` — `statusColor` switches (they have fallbacks) and the **admin status `<select>`**, which cannot offer `COMPLETED` until the zod enums are widened.
- `apps/mobile`: `plan-select.tsx:79–92,255` (`isCancelled` deliberately re-enables the current plan), `billing.tsx:62,66` (`=== 'ACTIVE' ? 'active' : 'free trial'` → a `COMPLETED` retailer would be told they are **on a free trial**), `analytics.tsx:429`, `settings/index.tsx:1436`, `staff/index.tsx:362–375` `StatusBadge` (has a fallback).

**Counters / reporting:** `team-reporting.ts:162–164` (TRIAL / ACTIVE / CANCELLED buckets — a third bucket means the three no longer sum to the total; decide whether `COMPLETED` folds into `CANCELLED` here or gets its own), `admin-retailers-list.ts:25–26` (headline `ACTIVE`/`TRIAL` counts; unaffected).

**What does NOT read it — the corrections (do not chase these):**
- **There is no billing gate.** `plugins/auth.ts:340` *selects* `plan_status` and never uses it (a dead select); the only session gate is `is_suspended` (F-015). Cancelling does not lock anyone out of the API or the app.
- **There is no plan-limit fallback.** `lib/quota.ts` and `lib/showcase-quota.ts` resolve on `retailer.plan` + `plan_limits` rows only — neither file mentions `status`; `billing-addons.ts:220` likewise. Nothing degrades a limit on cancellation.
- **T6 never reads `Subscription.status`.** `jobs/referral-accrue.ts` earns off `SubscriptionPayment.status = 'success'` per IST month (its own header says so) — so `COMPLETED` cannot affect accrual, and a *refund* is the only payment-status event that could (§5A).
- **The §42 Commission Tracker never reads it.** `admin-commission.ts` aggregates `subscriptionPayment.status = 'success'` (lines 164, 217, 313).
- **`apps/web/src/app/admin/billing/page.tsx` has zero status reads** — the board's "admin billing page" is the *retailer* `/billing` page above.

**Test surface that pins today's rule:** `jobs/referral-qualify.test.ts:138,180–198,247–287` (the `CANCELLED` → `CLAW_BACK` arm, incl. the reason-enumeration assertion) and `billing/__tests__/lib.test.ts:26` (the label). These are what §4.5's falsification should turn red.
- [x] **4.2 (owner decision)** — **DECIDED 2026-09-24: a completed term is NOT a clawback.** Completed = "not active" for access and labels; the referrer keeps everything accrued and paid. Rationale: a term that ran its full course is success, not churn, and T5's clawback is irreversible by design (RC-036 / §11) — there is no undo if this is got wrong in the strict direction.
  - **§4.3:** unchanged — `ALTER TYPE "SubscriptionStatus" ADD VALUE 'COMPLETED'` (widens **both** columns, see §4.1).
  - **§4.4:** `subscription.completed` → `Subscription.status = 'COMPLETED'` **and** `Retailer.plan_status = 'COMPLETED'` — otherwise the collapse has only moved, and the UI would keep saying "Cancelled" for a term that finished.
  - **§4.5:** T5's churn branch keys on `'CANCELLED'` only. A completed term falls through to the existing `WAIT: 'NO_ACTIVE_SUBSCRIPTION'` path: inert, nothing accrueable, nothing owed — and **no** `CLAW_BACK`. Falsification: a completed-subscription conversion must not yield `CLAW_BACK` (revert the branch → red).
  - **Reader rule (≥3 readers → shared helper):** one predicate for "this plan is no longer live" = `CANCELLED | COMPLETED`, living next to `PlanStatus` in `@kanchuki/shared`. **`PAST_DUE` is deliberately NOT in it** — dunning is recoverable, which is T5's own documented precedent (a card retry must not end a referral).
  - ⚠️ **Edge case for §4.5, flagged not assumed:** a referral with a historical `CANCELLED` row *and* a later `COMPLETED` row. The literal `.some(s => s.status === 'CANCELLED')` claws back. Intended, or does a later completed term outrank it? Decide when editing 4.5 rather than silently picking.
  - **Reachability, for honesty:** subscriptions are created with `total_count: 120` (`billing-subscription.ts`), so `subscription.completed` fires ~10 years out. This is a correctness fix with a money reader, **not** a live-flow bug — do not expect it to fire before it ships.
- [x] **4.3** Migration `116_subscription_status_completed`: `ALTER TYPE ... ADD VALUE 'COMPLETED'` in its own migration (PG 55P04 — enum add can't share a tx with its use; see the 060/061 split). — **done 2026-09-24** (`72d3806d`). The file is the `ALTER TYPE` alone, with the 55P04 reasoning written into it so the next person does not "helpfully" fold the webhook change in. ⚠️ **Not applied** — owner runs it from the admin runner (code first is fine here: nothing *writes* `COMPLETED` until the enum exists, and the webhook's write would 22P02 if it fired first, which is ~10 years out).
- [x] **4.4** Webhook: `subscription.completed` → `COMPLETED`. Every reader from 4.1 that means "not active" treats `COMPLETED` like `CANCELLED` (shared helper only if ≥3 readers). — **done 2026-09-24** (`72d3806d`). Split onto **both** columns (`Subscription.status` + `Retailer.plan_status`), `cancelled_at` deliberately left null. Readers: shared `isPlanEnded()` in `@kanchuki/shared` (4 call sites), `planStatusLabel` → `Completed`, mobile `billing.tsx` (was telling a completed retailer they were on a **free trial**) and `plan-select.tsx` (`isCancelled` → `isPlanEnded`, so the current plan can be re-picked), the admin list's status **filter** gained the option the widened zod enum accepted but no UI offered, and `team-reporting.ts` folds `COMPLETED` into its ended bucket rather than letting the funnel silently shrink as terms expire.
- [x] **4.5** T5 job applies the 4.2 decision. Test: completed-subscription conversion → expected status; falsify by reverting the branch. — **done 2026-09-24** (`72d3806d`). `decideQualification` gains `COMPLETED` in its facts type and keys the clawback on `CANCELLED` **only**; a completed term lands on the inert `WAIT: NO_ACTIVE_SUBSCRIPTION` (nothing accrued is taken back). Two tests: the completion arm (falsified — adding `'COMPLETED'` to the `.some()` turns it red) and the 4.2 edge case (a historical `CANCELLED` **plus** a later `COMPLETED` still claws back — decided, not inherited, and pinned so the reading is visible).
- [x] **4.6** RC-033 → "Fixed in `<hash>`" in `docs/root-cause/root-cause issues.md` + CLAUDE.md RC table row. — **done 2026-09-24** (`72d3806d`). The tracker entry's own "why the T5 decision is nevertheless CORRECT" argument was **revised, not deleted** (finding-time reading kept verbatim, marked as superseded by the ruling), and the "deferred because it touches billing" reasoning is answered in place.

---

## 5. Refunds + `?ref=` capture — FIX

### 5A. Refunds (nothing writes `SubscriptionPayment.status = 'refunded'`)

**What a refund is here, exactly** — worth stating because it is the whole scope: this is the **retailer's subscription charge to Kanchuki** (the ₹4,999 / ₹9,999 / ₹14,999 plan charge). It is **not** any referral payout and **not** the referrer's money. The referrer is only affected second-hand, through the accrual and qualification rules below.

- [x] **5A.1** Handle Razorpay `refund.processed` in `billing-webhook.ts` → set the matching `SubscriptionPayment.status = 'refunded'`. Idempotent (same event twice = no-op). HMAC check unchanged. — **done 2026-09-24** (`13b50ea8`). **Placed above the subscription lookup on purpose:** a refund event carries `payload.refund` + the payment it reverses and need not carry `payload.subscription` at all, so a handler inside the switch would have been dropped by the `if (!rzpSub) return { received: true }` early return — silently, as a 200. That placement has its own test (asserting the **write** happened, not just the status code, since the broken version is also a 200). Idempotency is the WHERE (`status: { not: 'refunded' }`) → a redelivery is a 0-row no-op. Unknown payment row → warn + 200 (never a 404/500, which Razorpay would retry forever). Only `refund.processed`; `refund.created`/`refund.failed` do not mean money moved back.
  - **Partial refunds — DECIDED 2026-09-24 (owner): ignored, deliberately.** Razorpay refunds can be partial, but a plan charge is refunded in full or not at all in practice. The row has one whole-month `status` flag and no column for a refunded amount, so a partial refund is **logged at warn and NOT applied** — flipping the flag would erase a month the retailer mostly paid for, from both T6's accrual and the §42 commission pool. If partials ever do appear, the answer is a `refunded_amount` column (**migration 117** — 116 is taken by RC-033) plus a pro-rata rule, **not** a quiet flip of this flag. Pinned by test, so the direction has to be argued with rather than edited away.
- [x] **5A.2** — **done 2026-09-24** (`13b50ea8`), and the bullet's own proposal was **overturned by the owner**.
  - **T6 — a refunded month stops earning: ✅ confirmed by test.** The loader reads `status: 'success'` (a whitelist, deliberately not `not: 'refunded'`), so a refunded month is simply absent from `paid_periods` and the walk skips it **without consuming the installment** — a refund skips a month, it does not advance the program. Pinned by test, plus a test asserting the filter is an exact whitelist (it fails if relaxed).
  - **T6 — the honest boundary, stated because the opposite is the intuitive reading:** a refund **after** a month already earned does **not** un-earn it. The cursor only moves forward and the job writes no negative accrual, so **a refund stops FUTURE months; it never revokes a past one.** Pinned by test so an owner setting refund policy reads the real behaviour.
  - **T5 — owner ruling: a refund stops future earning, it NEVER claws back.** The bullet's `refund → CLAWED_BACK` was **rejected** on the same ground as RC-033: the clawback is irreversible, and a refund's cause is not always churn (billing dispute, duplicate charge, plan correction) — and once T7 has paid installments out, a clawback means recovering real money from the referrer. The lenient direction leaves an *uncollected* accrual a future rule can still act on; the strict one cannot be undone. Cost stated, not hidden: **a referrer keeps commission on revenue later handed back.**
  - **No T5 code was needed**, and that is worth recording: `hasSuccessfulPayment` is already `status: 'success'`-only, so a refund **before** qualification reads as never-paid → `WAIT: NOT_PAID` (not ended — the store can still pay again inside its window), and a refund **after** qualification changes nothing because T5 selects `status: 'PENDING'` rows **only**. Two tests pin both halves, including the gate-ordering case (refunded **and** cancelled → `NOT_PAID`, not `CLAWED_BACK`: no successful payment is the more fundamental fact).
- [ ] **5A.3** GST: a refund needs a credit note against the original invoice (`GstInvoiceSequence`). Owner/CA decision — if deferred, write that here; never skip silently. — **DEFERRED by owner 2026-09-24**, stated here as this bullet requires rather than skipped silently. A refunded GST invoice **stands as-is** for now; no credit note is issued, and the filing position is the CA's call (the original invoice remains the declared supply). Building it needs the CA's credit-note format before any code is worth writing.
- [ ] **5A.4 (owner)** Razorpay dashboard: subscribe the webhook to `refund.processed`. — **still open.** Until this is done, 5A.1 is deployed but **never fires**: nothing will write `status = 'refunded'`, so T5/T6's refund paths remain unreachable in production even though they are tested.

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

**Landed 2026-09-24 (`55ef9057`) — 6.1, 6.8, 6.12:** `my-profile` style chips now come from the new `GET /v1/public/attributes?kind=STYLE` (own test file, 6 cases, de-dupe arm falsified); `SIZE_OPTIONS` imported from `@kanchuki/shared` in both customer components; `999999` replaced by `UNLIMITED` in all four files. A fifth straggler the table missed — `admin-retailers-detail.ts` (admin plan-change limits) — swept 2026-09-24, dead `try_on` field dropped with it.
**Landed 2026-09-24 — 6.5, 6.6, 6.7 (premise corrected):** catalog-size limits (`max_products`/`max_customers`/links) have **no DB table** — `plan_limits` holds per-period quotas (AI calls, studio, showcase) and has no `PRODUCT_UPLOAD` seed; the one real source is shared `PLAN_LIMITS`, which the billing webhook writes into `retailers.max_products`. So: prices → DB (`plan_pricing`, via new `apps/web/src/lib/plan-pricing.ts` with per-plan fallback — the old in-page helper crashed on a partial row set), limits → `PLAN_LIMITS` everywhere (admin billing, pricing page, admin plan-change route via new shared `orUnlimited`). Admin billing was also **mislabelling** the `PRODUCT_UPLOAD` upload quota as catalog size — removed. Stale prices fixed on the way: pricing-page metadata + comparison row said ₹999, `for-retailers` said ₹999/₹2,499/₹4,999 + "Annual plans save 20%" (annual removed §59), admin `plan-features` said ₹999/₹2,499/₹4,999 — all now live from `plan_pricing`. **Owner call if wanted:** making catalog-size limits admin-editable needs a migration (new columns on `plan_pricing` or a new table) — not built.
**Landed 2026-09-24 — 6.2, 6.3, 6.4, 6.9; 6.10 skipped:** 6.2/6.3 mobile `growth/templates.tsx` now reads `GET /products/studio-styles` (published + plan — the exact set `resolveStudioStyleJob` accepts; the hardcoded 18 ids predated the migration-101 collapse, so a stale id 422d at generate time) and `GET /growth/festivals` + `General`, with loading/error/empty states — **ships with the next EAS build**. 6.4 admin social-templates filter now lists `stats.by_occasion` (occasions templates actually carry — festivals alone would drop "Wedding" and list options matching nothing); dropped the groupBy `take: 10` that also capped the Occasions stat count. 6.9 deleted: `RegionalFilters` was dead end-to-end (never rendered, state only set to null, API never read `regional`) — both branches of the rule end with the list gone; `check-regional-tags.ts` stays for a possible rebuild. **6.10 skipped:** `SUBTYPE_KEYWORDS` is garment search vocabulary, not admin data — default category names ("Kurta Sets", "Plus Sizes", "Shirts for Women") would inject "sets"/"plus"/"women" as hints and lack sherwani/gown/anarkali/palazzo/sharara/kaftan.
**Landed 2026-09-24 — 6.11 (DB-editable, owner decision):** migration **`117_hsn_rules`** (**not applied — owner runs it**) creates `hsn_rules` (keywords `text[]`, hsn CHECK 4/6/8 digits, sort_order, is_active; no DELETE — disabled via `is_active`, SECURITY §19), seeded verbatim from the code list. **Keywords, not regex:** admin-edited patterns run per product in the sync, so regex would be a ReDoS/footgun — the one translation is `cotton fabric|fabric.*cotton|^fabric$` → keyword `cotton fabric`. `catalog-sync.ts`: `HSN_RULES_FALLBACK` (documented fallback when the table is empty/unreadable — so the code works before 117 is applied), `refreshHsnRules()` at the start of both sync paths (keeps the last good set on a read error), `resolveHsnForCatalog(product, rules)` stays pure. Admin: `GET/POST/PATCH /v1/admin/hsn-rules` (super-admin segment `hsn-rules`, audit-logged, keywords trimmed/lowercased/de-duped) + `/admin/hsn-rules` screen under Reports & Finance. Tests: refresh (DB rows / empty → fallback / error → last good, falsified) + route validation + a PATCH-doesn't-reset-defaults pin.

- [x] **6.a** Web/API items — 6.1, 6.4–6.9, 6.11, 6.12 done; 6.10 skipped with reason. Fetched lists surface the real error (RC-003).
- [x] **6.b** Mobile items (6.2, 6.3) — code done; **ships with the next EAS build**.
- [x] **6.c** Re-grep done 2026-09-24 (152 hits): no admin-editable data left. The rest are true constants — mime types, enum mirrors, UI options, marketing copy, bench presets. Noted, not changed: `DESIGN_CATEGORIES` is duplicated in `admin-design-references.ts` + `public-designs.ts`, but both are validated by the Prisma `DesignCategory` enum (drift fails loudly); `ALLOWED_MIME_TYPES` ×3 and `PLANS` ×several are enum mirrors.

---

## 7. Launch readiness (absorbs `launch-readiness.md`)

### 7A. Code — Claude can do
- [x] **7A.1** Sitemap — **already built, no work needed.** The board's `apps/web/src/app/sitemap.ts` path was wrong: it lives at `apps/web/src/app/sitemap.xml/route.ts` (chunked index via `generateSitemaps`, 10k URLs/file) + `apps/web/src/app/sitemap/[id]/route.ts` backed by `apps/web/src/lib/sitemap.ts`, enumerating every live store with Google **image-sitemap** extensions on product photos. Pinned by `apps/web/src/app/__tests__/sitemap.test.ts`.
- [x] **7A.2** Per-page `generateMetadata` + JSON-LD — **done 2026-09-24.** New `apps/web/src/app/[store]/lib/store-seo.ts` (`buildStoreDescription`, `storeOgImage`, `localBusinessLd`, `productLd`, `itemListLd`, `ldJson`). Surfaces: `/{store}` + `/{store}/categories` already had `generateMetadata` + `LocalBusiness`; added `ItemList` on `/{store}/{collection}` and `Product`/`Offer` on `/{store}/{collection}/product/{productId}` (Offer emitted only with a price — Google rejects a Product offer without one; `SOLD` → `OutOfStock`; a price range → `AggregateOffer`). **This item also found + fixed RC-040:** the two shipped pages passed `JSON.stringify` straight into `dangerouslySetInnerHTML`, so a retailer `shop_name` containing `</script>` closed the JSON-LD `<script>` tag and ran markup on the storefront — **stored XSS**. All four sites now route through `ldJson()`, which escapes `<` → `\u003c` (a bare `JSON.stringify` is not an HTML escaper). Falsified by reverting to `JSON.stringify` → the escape arm goes red. Web **326/326**, web `tsc --noEmit` clean. Also: the first form of the escape had **one** backslash (`'\u003c'` = the literal `<`, a no-op) — `store-seo.test.ts` asserts the **absence of `</script>` in the output string**, which is what makes that mistake fail.
- [x] **7A.3** Apple reviewer bypass — **done 2026-09-24.** `apps/api/src/routes/auth.ts`: `REVIEW_PHONE` + `REVIEW_OTP`, **both** required (unset either → the entire branch is unreachable). `/otp/send` returns the existing `bypass: true` shape (no MSG91 dispatch, no widget) and `/otp/verify` accepts **exactly** `REVIEW_OTP` — never "any 6 digits" — via `timingSafeEqual`, and is checked **before** `OTP_TEST_BYPASS` so the fixed code is not weakened by the any-code bypass being on. Never logged: no `path=` marker, and the one operator line that would print the phone is skipped on this path. New `auth-review-bypass.test.ts` **10/10**, incl. a `console.log`/`console.error` spy asserting **neither the phone nor the code reaches a log**; falsified by relaxing the code check to `!otp` → the two wrong-code arms go red. Documented in `.env.example` with the remove-after-approval warning.
  **Security review (2026-09-24, pre-merge):** (1) **Off by default** — two independent env vars, either missing disables it; no code path enables it implicitly. (2) **Fixed code, constant-time compare** — `timingSafeEqual` with a length pre-check, so the compare leaks neither the code nor its length. (3) **Cannot be reached with the wrong phone** — the phone must equal `REVIEW_PHONE` after `normalizeIndianPhone`. (4) **Review > test-bypass precedence** — pinned by test, so enabling `OTP_TEST_BYPASS` cannot silently downgrade the review phone to any-code. (5) **No log leakage** — asserted by test, not by convention (phone + code both absent from every `console.*` call on the path). (6) **Blast radius stated, not hidden:** while both vars are set, anyone who learns the phone + code can sign in as that demo account; the account has no live store and the vars must be removed once approved. Two operator-facing env vars on the API service only — no DB, no mobile build, no client-visible flag. Gates run: `security.test.ts` **6/6**, `admin.login.test.ts` **9/9**, `auth-otp-bypass` **11/11**, `auth-msg91` **12/12**, `auth-staff-invite` **10/10**, `msg91-otp` **23/23**; API `tsc --noEmit` clean; Biome clean on both files.
- [x] **7A.4** Disaster-recovery runbook — **done 2026-09-24:** `docs/references/guides/disaster-recovery.md`. Data inventory + RPO/RTO, then a scenario per failure mode: **(A)** DB loss/corruption (bad-migration rollforward, restore-to-a-new-instance-then-repoint, PITR, the `<role>.<project_ref>` pooler gotcha, vault); **(B)** bad deploy (Railway **Redeploy from the last good deployment**, the "Deployed via GitHub" check, the domain-target-port 502); **(C)** R2 loss; **(D)** Redis loss (ephemeral by design — but **repeatable-job schedules must be re-checked**, since a changed cron var can leave a duplicate schedule behind); **(E)** region/host outage table; **(F)** secret compromise with an explicit **rotation order**; a **known-gaps** table (R2 versioning unconfirmed, Supabase retention plan-dependent, no read replica, `_prisma_migrations` gaps, vault backup retention); and a post-incident checklist that routes code/process causes into a new `RC-###`. Deliberately states the two real risks rather than implying coverage: **R2 has no confirmed versioning** and **Supabase retention is plan-dependent** — both owner actions, both listed in §8.
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
| 7A.4 — disaster-recovery runbook (`docs/references/guides/disaster-recovery.md`) | *(this commit)* | 2026-09-24 |
| 7A.3 — Apple reviewer bypass (`REVIEW_PHONE`/`REVIEW_OTP`, fixed code, never logged) + security review + `auth-review-bypass.test.ts` 10/10 | *(this commit)* | 2026-09-24 |
| 7A.1 + 7A.2 — sitemap ticked (already built) + storefront JSON-LD on all 4 surfaces; **RC-040** stored-XSS fix (`ldJson`) | *(this commit)* | 2026-09-24 |
| 1 — migration check script + prod result (all applied) | uncommitted: `scripts/check-pending-migrations.ts` | 2026-09-24 |
| 3 — admin-access: `team-members` + `reports` → super-admin (RC-034 follow-up) | `36b764c3` | 2026-09-24 |
| 6 — partial: 6.1 (style chips → `GET /v1/public/attributes`), 6.8 (`SIZE_OPTIONS` shared), 6.12 (`UNLIMITED`) | `55ef9057` | 2026-09-24 |
| 4.1 — reader inventory (`CANCELLED` / `plan_status`), incl. 3 premise corrections | `8ce942ab` | 2026-09-24 |
| 4.2 — owner ruling: completed ≠ clawback (recorded with its §4.3–4.5 consequences) | `1cc10515` | 2026-09-24 |
| 4.3–4.6 — RC-033 fix: enum `COMPLETED` (migration `116`, **not applied**), webhook split on both columns, `isPlanEnded()` shared predicate, T5 keys on `CANCELLED` only, reader + test surface | `72d3806d` | 2026-09-24 |
| 5A.1 + 5A.2 — refunds: `refund.processed` → `status = 'refunded'` (placed above the subscription early return; unknown row + partial refund are warned, not applied) + the refund-vs-referral rules pinned by test (T6 stops future earning, never revokes a past one; T5 claws back nothing). **5A.3 deferred by owner; 5A.4 owner still open — until it is set, the handler never fires** | `13b50ea8` | 2026-09-24 |
