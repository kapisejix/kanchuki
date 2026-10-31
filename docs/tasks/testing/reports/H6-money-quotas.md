# H6 — Money + quotas, hacker mode

- **Task:** H6 (`task-4-hacker.md`): fake/replayed Razorpay callbacks and webhooks, plan-downgrade evasion, quota bypass on AI tagging / studio shoot / try-on, referral fraud
- **Date:** 2026-10-26
- **Branch:** `fix/team-otp-fail-closed-rc085` (no code changes)
- **Target:** code-only review. No local harness was run, so nothing here is "Confirmed". No Razorpay, DB or prod calls.
- **Tooling note:** `rtk` is not installed. Plain `grep`/`sed` via Git Bash plus the Grep/Glob tools were used.

## Commands run

```
grep -rln "razorpay_signature|x-razorpay-signature|verifyWebhook" apps/api/src
sed -n … apps/api/src/lib/quota.ts            (effectiveLimit, checkQuota, incrementUsage)
grep -rn "checkQuota(|incrementUsage(|checkCustomerQuota(|incrementCustomerUsage(" apps/api/src
sed '/enum QuotaResourceType/,/}/p' packages/db/prisma/schema.prisma
grep plan_limits seeds: migrations/*, packages/db/prisma/seed-plan-limits.ts, migration 074 header
sed -n … billing-webhook.ts, billing-addons.ts, billing-subscription.ts, public-catalog-payment.ts,
         webhooks/razorpayx-payout.ts, jobs/plan-lapse.ts, jobs/studio-shoot.ts,
         routes/products/products-studio.ts, lib/referral-conversions.ts, retailers-profile.ts
```

## Result summary

| Severity | Count | IDs |
| --- | --- | --- |
| Critical | 0 | — |
| High | 1 | H6-1 |
| Medium | 1 | H6-2 |
| Low | 2 | H6-3, H6-4 |
| Not exploitable (attack disproved) | 8 | A1–A8 below |

All 4 findings are **Plausible** (code-only). None applied. H6-1's real severity depends on one prod fact the owner can check (below).

## Findings table

| ID | Sev | File:line | Issue | Fix |
| --- | --- | --- | --- | --- |
| H6-1 | High | `quota.ts:135-140`, `products-studio.ts:101-110`, migration `074…/migration.sql:5-7` | `STUDIO_SHOOT` (paid FLUX/Gemini) is not seeded, and `checkQuota` treats a missing row as unlimited. It is the only limiter, every plan incl. a fresh STARTER trial can call it, and it has no per-route rate limit. | Fail closed for metered resources. Seed the rows (needs approval). Add a route rate limit |
| H6-2 | Medium | `products-studio.ts:110` + `jobs/studio-shoot.ts:222`; `public-my-style-analyze.ts:101` + `jobs/my-style-analyze.ts:85,126`; `jobs/tag-product.ts:29` + `lib/ai-usage.ts:55` | Quota is checked at the route but only counted when the job finishes. A burst of N requests all pass against the same count, so a cap of 5 can become N paid generations. | Atomic reserve-at-route (conditional increment), refund on job failure; same shape try-on already uses (`1 + pending`) |
| H6-3 | Low | `jobs/plan-lapse.ts:22-28` | Lapse covers only `TRIAL` past `trial_ends_at` and `PAST_DUE/CANCELLED/COMPLETED`. An `ACTIVE` retailer whose `plan_expires_at` is long past (a missed `subscription.halted` webhook) keeps the paid plan forever. | Add `ACTIVE` + `plan_expires_at < now − grace` |
| H6-4 | Low | `lib/referral-conversions.ts:229-236`, `retailers-profile.ts:159,311` | The self-referral check is same id, same phone, or same GSTIN. GSTIN is nullable, so a second phone number with no GSTIN passes. The referred account gets the FREE_MONTH bonus, and the referrer earns commission on their own second store. | Re-check at accrual: block when the referred retailer has no GSTIN; compare payout bank account. Built differently, see Status below |

---

### H6-1 STUDIO_SHOOT quota fails open, so free accounts get unlimited paid AI generations             Severity: High
Attacker: retailer (any plan, including a brand-new 14-day STARTER trial created with any phone number via OTP)
Goal: burn the platform's FLUX Kontext / Gemini image credits with no cap, or get unlimited studio images for free.
Preconditions: no `plan_limits` row for `(plan, 'STUDIO_SHOOT')` in prod, which is the shipped default. Migration 074 says so directly: "No PlanLimit seed rows for STUDIO_SHOOT are inserted here — checkQuota() fails open on a missing row … so this ships with no cap until an admin sets one." `seed-plan-limits.ts` seeds only PRODUCT_UPLOAD / AI_TAGGING_CALL / TRY_ON. **Owner check:** Admin → Plan Limits, is a STUDIO_SHOOT row set for all three plans?
Steps:
1. Sign up a new retailer (fake phone). `auth.ts:628` creates `plan: 'STARTER', plan_status: 'TRIAL'`.
2. Upload one product photo.
3. Loop `POST /v1/products/<id>/photos/<photoId>/studio-shoot {"template":"<any published slug>"}`.
4. `products-studio.ts:101-110`: "All plans get AI Studio Shoots — the STUDIO_SHOOT quota … is the only limiter". `checkQuota` → `effectiveLimit` returns `null` (no row) → `return` (`quota.ts:140`). Every call enqueues a paid generation.
5. The only brake is the global 200 req/min/IP limiter (no route-level `config.rateLimit` on this route), so about 12k paid generations per hour per IP.
Impact: direct AI spend; the hourly `ai-spend-alert` (RC-081) alerts but does not stop it. The same fail-open applies to `BG_REMOVAL` / `IMAGE_CROP` (unseeded; `products-pro-cleanup.ts:150-151`) if that route is reachable on a plan without a row. Not checked in time.
Evidence: `apps/api/src/lib/quota.ts:12-27,135-140`; `packages/db/prisma/migrations/074_studio_shoot_quota_and_plan_pricing/migration.sql:5-7`; `packages/db/prisma/seed-plan-limits.ts:7-38`; `apps/api/src/routes/products/products-studio.ts:98-110`; `apps/api/src/routes/auth.ts:628`.
Fix: metered resources fail **closed**. That is one guard in the shared function, so every caller is covered:
```diff
--- a/apps/api/src/lib/quota.ts
+++ b/apps/api/src/lib/quota.ts
@@
+// Resources that cost real money per call: an unconfigured row means "none", not "unlimited".
+// ponytail: hand list; move to a column on plan_limits if it grows.
+const METERED: ReadonlySet<QuotaResourceType> = new Set([
+  'STUDIO_SHOOT',
+  'TRY_ON_GENERATION',
+  'BG_REMOVAL',
+  'IMAGE_CROP',
+]);
+
 export async function checkQuota(
   retailerId: string,
   resourceType: QuotaResourceType,
   amount = 1,
 ): Promise<void> {
   const effective = await effectiveLimit(retailerId, resourceType);
+  if (!effective && METERED.has(resourceType)) {
+    throw planLimitExceeded(resourceType.toLowerCase().replace(/_/g, ' '));
+  }
   if (!effective || effective.limit === -1) return; // unlimited, or not yet configured
```
Also: (a) **before** deploying the guard, the owner sets STUDIO_SHOOT rows in Admin → Plan Limits, otherwise the feature turns off for everyone. No migration is needed, because the admin UI writes the rows. (b) Add `config: { rateLimit: { max: 10, timeWindow: 60_000 } }` to the studio-shoot route (same shape as RC-079). `getQuotaStatus` (`quota.ts:196-210`) would also need its no-row branch to report 0 for metered types (RC-073 shape: the screen and the server must agree).
Status: Plausible

---

### H6-2 Check-at-route, count-at-job-end lets a burst overshoot any cap             Severity: Medium
Attacker: retailer (studio shoot, AI tagging); signed-in shopper (My Style `STYLE_ANALYSIS`, free account by phone OTP)
Goal: N paid AI calls against a cap of K < N.
Preconditions: a cap is configured (otherwise see H6-1).
Steps (studio shoot, cap 5, used 0):
1. Send 30 `POST …/studio-shoot` in parallel (e.g. `Promise.all` from one client).
2. Each runs `checkQuota` → `used = 0`, `0 + 1 ≤ 5` passes (`quota.ts:142-155`) → 202, job enqueued.
3. `incrementUsage` runs only in the job **after** the generation succeeds (`jobs/studio-shoot.ts:218-224`). The window is queue wait plus generation time (tens of seconds), not the few milliseconds the comment at `quota.ts:157-164` accepts.
4. All 30 generations are paid for; the counter ends at 30, 6× the cap.
- Same shape: `STYLE_ANALYSIS`: check at `public-my-style-analyze.ts:101`, increment in the job (`my-style-analyze.ts:85,126`). `AI_TAGGING_CALL`: check in `tag-product.ts:29`, increment after the provider call (`ai-usage.ts:55`). Try-on is already safe, because it counts in-flight jobs (`products-tryon.ts:348`, `1 + pending`).
Impact: cap overshoot on every metered AI resource; for shoppers, any free phone-OTP account can do it.
Evidence: file:line above; `apps/api/src/lib/quota.ts:157-164` (the race is acknowledged, but sized as a few-ms window, not a job-length one).
Fix: reserve atomically at the route and give it back if the job fails. One new shared helper, so callers stay one line:
```diff
--- a/apps/api/src/lib/quota.ts
+++ b/apps/api/src/lib/quota.ts
@@
+/**
+ * Check + count in one statement: the row is only bumped while it stays within the
+ * limit, so concurrent callers cannot all pass the same `used` value. Call
+ * `incrementUsage(…, -amount)` if the work then fails.
+ */
+export async function reserveQuota(
+  retailerId: string,
+  resourceType: QuotaResourceType,
+  amount = 1,
+): Promise<void> {
+  const effective = await effectiveLimit(retailerId, resourceType);
+  if (!effective || effective.limit === -1) return checkQuota(retailerId, resourceType, amount);
+  const start = periodStart(effective.period);
+  await incrementUsage(retailerId, resourceType, 0); // ensure the row exists
+  const n = await prisma.$executeRaw`
+    UPDATE usage_counters SET count = count + ${amount}
+    WHERE retailer_id = ${retailerId} AND resource_type = ${resourceType}::"QuotaResourceType"
+      AND period_start = ${start} AND count + ${amount} <= ${effective.limit}`;
+  if (n === 0) throw planLimitExceeded(resourceType.toLowerCase().replace(/_/g, ' '));
+}
```
```diff
--- a/apps/api/src/routes/products/products-studio.ts
+++ b/apps/api/src/routes/products/products-studio.ts
-    await checkQuota(request.retailerId, 'STUDIO_SHOOT');
+    await reserveQuota(request.retailerId, 'STUDIO_SHOOT');
--- a/apps/api/src/jobs/studio-shoot.ts
+++ b/apps/api/src/jobs/studio-shoot.ts
-    incrementUsage(retailer_id, 'STUDIO_SHOOT').catch((err) => {
-      console.error(`[studio-shoot] failed to record quota usage for ${retailer_id}:`, err);
-    });
+    // counted at enqueue (reserveQuota); the catch below refunds a failed job
```
Plus `incrementUsage(retailer_id, 'STUDIO_SHOOT', -1)` in the job's terminal-failure branch. Check before applying: the actual table/column names match Prisma `@@map`; whether a reserve that fails before enqueue (validation error after the reserve) needs a refund, which argues for moving the reserve to just before `queue.add`. Same pattern for `checkCustomerQuota` / `STYLE_ANALYSIS`.
Status: Plausible

---

Status: Fixed locally (RC-102 for the flat-spend flows, RC-155 for weighted tagging via `reserveTaggingQuota`), not deployed, mock tests only. Found while fixing it: RC-156 (translate charged 1 + credits). Also fixed: RC-157 (`showcase-designs/suggest` and the nameless save spent `AI_TAGGING_CALL` with no check; now `reserveTaggingQuota`, fail-open to nulls). Also fixed: RC-158 (`growth-ai-campaign` flat reserve with no give-back; now `reserveTaggingQuota`, both AI calls metered). No known open sibling.

### H6-3 `plan-lapse` never lapses an ACTIVE plan whose paid period has ended             Severity: Low
Attacker: retailer (passive): stop paying, or have the card fail, at a time when the `subscription.halted` / `pending` webhook is not processed (endpoint down, signature-secret rotation, a stale-event 401 from clock skew, `billing-webhook.ts:50-56`)
Goal: keep GROWTH/PRO after payments stop.
Preconditions: `retailer.plan_status = 'ACTIVE'` and `plan_expires_at` in the past.
Steps: none by the attacker; the state arises from one missed webhook. Razorpay does retry webhooks, but retries stop after a while.
Impact: `lapsedWhere` (`plan-lapse.ts:22-28`) matches only `TRIAL` with `trial_ends_at < now`, or `PAST_DUE/CANCELLED/COMPLETED` with an expired or null `plan_expires_at`. `ACTIVE` is never selected, so RC-082 is fixed for every path except the one where the webhook that should move the status never arrives.
Evidence: `apps/api/src/jobs/plan-lapse.ts:20-30`.
Fix:
```diff
--- a/apps/api/src/jobs/plan-lapse.ts
+++ b/apps/api/src/jobs/plan-lapse.ts
@@
       { plan_status: 'TRIAL', trial_ends_at: { lt: now } },
+      // A paid period that ended with no renewal webhook. Grace covers Razorpay's charge retries.
+      // ponytail: 3 days is a guess; match it to the Razorpay subscription retry setting.
+      { plan_status: 'ACTIVE', plan_expires_at: { lt: new Date(now.getTime() - 3 * 86_400_000) } },
```
Check before applying: confirm `subscription.charged` always moves `plan_expires_at` forward (`billing-webhook.ts:~215-224` sets `plan_expires_at: end`), otherwise this lapses paying retailers. A test is required (`plan-lapse.test.ts` exists).
Status: Fixed (RC-144), not deployed. `ACTIVE` with `plan_expires_at` more than 3 days past now lapses; the 3 days cover renewal-webhook lag (`subscription.charged` is the only writer that moves `plan_expires_at` forward, checked at `billing-webhook.ts:239-240`). `lt` skips NULL, so admin-granted ACTIVE with no expiry is safe. Known limit, owner decision option A: `change-plan` can grant ACTIVE over a stale expiry, which then lapses after the grace; pinned by a test, route unchanged. Before deploy: count ACTIVE rows with `plan_expires_at < now() - 3 days` (each downgrades on the next hourly run).

---

### H6-4 Self-referral check bypassed by a second phone with no GSTIN             Severity: Low
Attacker: retailer (an affiliate with a referral code)
Goal: earn affiliate commission on their own second store (effectively a discount on their own subscription) and give that store the referred-side FREE_MONTH bonus.
Preconditions: a second phone number; the second store saves its profile without a GSTIN (nullable, `retailers-profile.ts:258`, `'' → null`).
Steps:
1. Store B (new phone) → `PATCH /v1/retailers/me { "referral_code": "<A's code>" }` with no `gstin`.
2. `applyReferralCapture` (`referral-conversions.ts:229-236`): `selfReferral = id equal || phone equal || sameGstin(...)`. `sameGstin` returns false when either side is blank (`:129-134`), so it passes.
3. Conversion `PENDING` is created and B's `trial_ends_at` is extended by the FREE_MONTH bonus. After `qualify_days`, T6 accrues commission to A on B's paid subscription.
Impact: commission paid on payments A makes for their own store, plus extra trial time. Bounded: commission is a percentage of money actually paid, so the platform loses margin, not cash beyond the commission.
Evidence: `apps/api/src/lib/referral-conversions.ts:129-134,225-250`; `apps/api/src/routes/retailers/retailers-profile.ts:159,258,311-313`.
Fix: re-check at accrual, when GST onboarding has had time to complete, and make the missing GSTIN count against the conversion:
```diff
--- a/apps/api/src/jobs/referral-accrue.ts   (T6 accrual, per conversion)
+++ b/apps/api/src/jobs/referral-accrue.ts
+    // Self-referral re-check (capture-time check cannot see a GSTIN added later,
+    // and a store that never adds one is not a verified separate business).
+    if (!referred.gstin || sameGstin(referrer.gstin, referred.gstin)) {
+      // mark conversion REJECTED (reason SELF_REFERRAL_UNVERIFIED), skip accrual
+    }
```
Optionally also block payout when the referrer's payout bank account equals the referred store's (`referral_payout_accounts`). Business decision whether a GSTIN-less store can ever qualify; owner to decide.
Status: Fixed (RC-147), not deployed. The nightly `referral-qualify` job re-checks with both GSTINs from the database: same GSTIN is `CLAW_BACK` (`SELF_REFERRAL`, final); a paid active store with no GSTIN is `WAIT` (`NO_GSTIN`, stays `PENDING`, qualifies once it adds a different GSTIN). Owner chose this 2026-10-31. Payout-account comparison dropped (only a masked display is stored, migration 115). Residual: GSTIN is format-checked, not verified, so a made-up different GSTIN still qualifies; FREE_MONTH is still granted at capture. Before deploy, count `PENDING` conversions with a null or blank referred GSTIN (each waits on the next run).

---

## Attacks disproved (Not exploitable, with proof)

| # | Attack | Result | Proof |
| --- | --- | --- | --- |
| A1 | Forged subscription webhook | HMAC on raw body; missing signature, missing raw body or bad signature → 401; an empty secret fails (RC-076) | `billing-webhook.ts:18-30`, `billing-helpers.ts` `verifyWebhookSignature` |
| A2 | Replay a captured webhook (resurrect a cancelled plan) | `created_at` ±300 s window → 401 `STALE_EVENT`; `subscription.charged` is idempotent on `razorpay_payment_id`. A replay needs the signed request, which travels Razorpay → API over TLS | `billing-webhook.ts:48-56,232-240` |
| A3 | Underpay / non-INR / authorized-only payment activates a plan | Requires `captured`, INR, `amount ≥ subscription.amount_inr` (server-written from `plan_pricing`) | `billing-webhook.ts:169-190`; `billing-subscription.ts:~108-116` |
| A4 | Upgrade the plan without paying | `retailer.plan` is written only by the webhook (from the server `subscription.plan`) or by admin routes. No retailer route writes `plan` (grep) | grep `plan:` writes; `billing-subscription.ts:41-146` sets only `razorpay_subscription_id` |
| A5 | Several real subscriptions during a trial / plan-switch race | Blocked: an existing `TRIAL`/`ACTIVE` row → 422 | `billing-subscription.ts:66-73` |
| A6 | Fake / replayed add-on callback, or a callback for a different pack | Payment-link HMAC (link id bound to payment id), Razorpay lookup (`captured` + exact `amount`), PENDING→COMPLETED CAS in the same transaction as the credit (RC-071) | `billing-addons.ts:201-260,268-355` |
| A7 | Catalog-upload payment callback for another ticket / wrong amount | Ticket must be `CATALOG_UPLOAD` and its `razorpay_order_id` must equal the link id; `captured`, INR, exact `quoted_price_inr × 100`; `paid_at: null` CAS. `/billing/verify-payment` only verifies and credits nothing | `public-catalog-payment.ts:40-60,86-115`; `billing-addons.ts:423-448` |
| A8 | RazorpayX payout webhook forgery / double pay (RC-036) | HMAC + empty-secret-fails + ±300 s window + status CAS; batch claim reads money inside the claim tx (RC-036 fix) | `webhooks/razorpayx-payout.ts:32-38,63-79,87-113` |

## Not checked / follow-ups

- **Owner check (decides H6-1):** Admin → Plan Limits, whether a `STUDIO_SHOOT` row exists for STARTER/GROWTH/PRO, and the same for `BG_REMOVAL`/`IMAGE_CROP`. Read-only, no prod access by me.
- **Local harness not run** (time). Next: `inject()` 30 parallel studio-shoot calls against a fake Prisma with cap 5 to confirm H6-2.
- Not reviewed: staff code (F-018) payout/attribution abuse, `retailer_limit_overrides` write paths (admin-only?), whether `periodStart` (`quota.ts:6-10`) using server-local time (UTC on Railway) puts the monthly reset at 05:30 IST (cosmetic), `AI_TAGGING_CALL` credit weighting (`reserveAiCredits`) vs actual provider cost, try-on top-up packs pricing.
- Cross-refs: RC-071, RC-073 (quota screen vs server; the H6-1 fix must update `getQuotaStatus` too), RC-076, RC-079 (route rate-limit pattern), RC-081 (spend alert is alert-only), RC-082 (H6-3 is its remaining gap), RC-036, RC-031/RC-033.
