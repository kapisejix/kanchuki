# RazorpayX + Referral Program Setup Runbook

**Feature:** F-038 Retailer Affiliate Referral Program (T7 payouts + T9 admin monitoring)
**Audience:** The owner, working in the Razorpay dashboard, Railway dashboard, and admin panel.
**Time:** ~30 minutes of clicking + one wait for RazorpayX activation.
**Order matters:** migrations 109–112 must land **before** 113–114's code is meaningful, and RazorpayX activation is the long pole — start it first.

Everything here is **owner-only**: CLAUDE.md's operational control policy forbids the AI agent from applying migrations or touching production secrets, so this document is the checklist for the human.

---

## Part 0 — Start the RazorpayX activation wait (do this first)

1. Sign in at **razorpay.com** with the same account the app already bills through (`RAZORPAY_KEY_ID` in Admin → Integrations is this account's key).
2. RazorpayX is a separate product on the same login: **Dashboard → left sidebar → RazorpayX** (or razorpay.com/business → activate X). Onboarding asks for:
   - Business PAN + GSTIN (the ones already on Kanchuki's invoices),
   - **current account details** — RazorpayX pays out *from* this account; payouts debit it,
   - authorized signatory KYC.
3. Wait for activation (typically 1–3 working days). Payout APIs return `ACCOUNT_NOT_ACTIVATED` until then — that is expected, not a code bug.
4. While waiting, activate **RazorpayX Payouts** product flag on the account (X dashboard → Settings → Payouts → Activate). UPI payouts also need **"Allow UPI payouts"** enabled there.

**Why the same account matters:** `lib/razorpayx.ts` reuses `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` (Admin → Integrations) for X's Basic auth. If payouts should run on a *different* account, those two secret rows must move to the X account's keys first — but that also moves the payments account, so the default assumption is one account, two products.

---

## Part 1 — Apply migrations 109 → 114 (admin dashboard SQL runner, in this order)

Run these from the admin dashboard's SQL runner as `kanchuki_migrator` (the role every prior migration has been applied as). **In numeric order — each builds on the last:**

| # | File | What it does | Depends on |
|---|------|--------------|-----------|
| 1 | `109_referral_program` | 4 enums + 4 tables (`referral_settings` singleton, `referral_codes`, `referral_conversions`, `referral_payouts`) + the CHECK constraints. Seeds the settings singleton. | — |
| 2 | `110_promotions_purge_grant` | `GRANT DELETE` on the promotions table to `kanchuki_purge` (RC-029's fix). | independent |
| 3 | `111_backend_role_rls_policies` | RLS policies naming `kanchuki_app`/`kanchuki_purge` on the 24 purge-path tables (RC-030's fix). **Run in one statement batch — it creates all policies together.** | tables from many migrations must exist |
| 4 | `112_referral_accrual_columns` | 3 T6-owned columns on `referral_conversions` + the 4 ledger-consistency CHECKs. | 109 |
| 5 | `113_referral_payout_accounts` | The payout-accounts table + `GRANT DELETE` to `kanchuki_purge`. | 109 |
| 6 | `114_referral_tax_columns` | Tax knobs on `referral_settings` + `referral_payouts.tds_paise`. | 109 |

**Warning about 110 before 111:** 110 grants DELETE on one table; 111 creates the RLS policies that make the purge role's access *explicit* across the path. If you apply 111 and skip 110, the promotions sweep is still broken (RC-029). Apply both.

**After 114, run these seed/no-op statements** (the tax defaults the migration already carries — verify rather than trust):

```sql
-- Verify singleton exists with defaults off:
SELECT tds_enabled, tds_pct, gst_applicable, gst_pct, payout_cadence, payout_min_amount
FROM referral_settings WHERE id = 'singleton';
-- Expect: false | 0 | false | 0 | MONTHLY | <your min>

-- Record the batch in _prisma_migrations so future audits see it
-- (the 083–089 gap happened because out-of-band application skipped this):
INSERT INTO _prisma_migrations (id, checksum, migration_name, logs, started_at, finished_at, applied_steps_count)
SELECT gen_random_uuid()::text, '', m.migration_name, 'applied via admin dashboard',
       now(), now(), 1
FROM (VALUES ('109_referral_program'),('110_promotions_purge_grant'),
             ('111_backend_role_rls_policies'),('112_referral_accrual_columns'),
             ('113_referral_payout_accounts'),('114_referral_tax_columns')) AS m(migration_name)
WHERE NOT EXISTS (
  SELECT 1 FROM _prisma_migrations p WHERE p.migration_name = m.migration_name
);
```

**Per-migration verification queries** (run after each):

```sql
-- After 109:
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('referral_settings','referral_codes','referral_conversions','referral_payouts');
-- Expect 4 rows.

-- After 112:
SELECT column_name FROM information_schema.columns
WHERE table_name='referral_conversions'
  AND column_name IN ('commission_monthly_paise','accrued_months','accrued_through_period');
-- Expect 3 rows.

-- After 113:
SELECT column_name FROM information_schema.columns
WHERE table_name='referral_payout_accounts' AND column_name='razorpayx_fund_account_id';
-- Expect 1 row.

-- After 114:
SELECT column_name FROM information_schema.columns
WHERE table_name='referral_settings' AND column_name IN ('tds_enabled','tds_pct','gst_applicable','gst_pct');
-- Expect 4 rows.

-- After ALL six (this is the real proof — see Part 4 for running the live test):
SELECT policyname FROM pg_policies WHERE policyname LIKE '%purge%' LIMIT 5;
-- Expect rows (111's policies exist).
```

**When migrations land, what comes alive:** T2's settings screen (was 404ing its own data), T3 code minting, T4 conversion capture on signup, T5's nightly qualification (02:00 UTC), T6's nightly accrual (02:15 UTC), T7's monthly payout run (02:30 UTC on the 30th). Nothing pays until Part 2 is done.

---

## Part 2 — RazorpayX keys, account number, and webhook secret

### 2a. Verify the API keys (already exist)

- RazorpayX authenticates with the **same Key ID / Key Secret** as payments on a standard account.
- Confirm in **Admin → Integrations** (the `getSecret` store): rows `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` exist and are the **live** keys.
- If they're the *test* keys, payouts will 401 against X even though payments work in test mode — swap to live keys, then re-check that payments still work (same account, so they will).

### 2b. Set `RAZORPAYX_ACCOUNT_NUMBER` (the one NEW mandatory secret)

Payouts debit a **business account number** shown on the X dashboard (X → Home → Account Details — a number like `9027...`, *not* the account's IFSC or the key id). Test and live accounts have **different** numbers.

- Test-mode first (recommended): **Admin → Integrations → add secret** `RAZORPAYX_ACCOUNT_NUMBER` = the **test** account number; flip to live at Part 5.
- This is read by `requireRazorpayxAccountNumber()` at payout time; without it every payout fails loudly with "RazorpayX account number not configured" — correct, but you want to set it before the first real run.

### 2c. Set `RAZORPAYX_WEBHOOK_SECRET` (the payouts webhook's own secret)

The payouts webhook verifies HMAC with its **own** secret — deliberately NOT the payments webhook's (`RAZORPAY_WEBHOOK_SECRET`), so rotating one never breaks the other.

1. Generate a strong random string (e.g. `openssl rand -hex 32` locally) — 32 hex chars is plenty.
2. **Admin → Integrations → add secret** `RAZORPAYX_WEBHOOK_SECRET` = that string. (The code reads it via `getSecret`, with an env fallback of the same name on Railway if you prefer env vars.)
3. Keep the same value handy for Part 3 — RazorpayX must be told the identical string.

### 2d. Current Railway env inventory (what should exist once done)

| Secret | Set via | Purpose |
|---|---|---|
| `RAZORPAY_KEY_ID` | Admin → Integrations (already) | payments + X auth |
| `RAZORPAY_KEY_SECRET` | Admin → Integrations (already) | payments + X auth |
| `RAZORPAY_WEBHOOK_SECRET` | existing (payments webhook) | subscription/payment events — unchanged |
| `RAZORPAYX_ACCOUNT_NUMBER` | **new** | the account payouts debit |
| `RAZORPAYX_WEBHOOK_SECRET` | **new** | payouts webhook signature |

---

## Part 3 — Register the payouts webhook in the RazorpayX dashboard

- **URL:** `https://api.kanchuki.app/v1/billing/razorpayx-payout-webhook` (replace with the real prod API host if different — the payments webhook in `docs/DEPLOY.md` uses the same host).
- **Secret:** exactly the `RAZORPAYX_WEBHOOK_SECRET` string from 2c.
- **Events:** subscribe to **`payout.processed`**, **`payout.failed`**, **`payout.rejected`**, **`payout.canceled`**, **`payout.reversed`**. The route maps: processed → PAID; failed/rejected/canceled → FAILED (claim released, money re-pools); reversed → REVERSED. An unrecognized status is logged and ignored — never guessed.
- **Active:** yes.

**Verification:** from the X dashboard's webhook settings, use "Send test event"; then check the API logs for `[razorpayx-payout-webhook]` lines. A 401 means the dashboard's secret ≠ 2c's secret (most common miss); a 404 means the URL path is wrong.

---

## Part 4 — Prove the RLS fix actually works (the never-executed test)

Migration 111's policies are the one claim in this feature resting on reasoning rather than measurement — RLS denies by *filtering*, so a broken policy and a working one pass every static check. Close that with the opt-in live test against a throwaway Postgres:

```bash
# Any local Postgres 15+ works; the test creates and drops its own schema.
cd apps/api
PURGE_RLS_TEST_DATABASE_URL="postgresql://postgres@localhost:5432/postgres" \
  npx vitest run src/jobs/purge-rls-live.test.ts
```

This executes the real policies with the real roles and is the only *executed* evidence the purge path can actually see and delete rows. If it fails, the failure names the table/policy — bring that back before going live.

---

## Part 5 — Dry run in TEST mode, then flip live

### 5a. Test-mode dry run

1. Ensure X is activated for the **test** account and `RAZORPAYX_ACCOUNT_NUMBER` is the test number.
2. Admin panel → **Referral Program** (`/admin/referral-settings`): confirm the terms read sensibly (commission %, duration, qualify window, min payout, cadence). Leave `payout_cadence` on **MONTHLY**; you'll trigger manually.
3. Optionally seed a fake conversion by hand in SQL (or wait for a real referred signup): a `retailers` row + a `referral_conversions` row (`status='QUALIFIED'`, `commission_base_amount` in paise) + a `referral_payout_accounts` row pointing at your own VPA (test VPAs like `success@razorpayx` simulate a successful payout).
4. Admin panel → **Referral Monitor** (`/admin/referral`) → **Run payouts now**. Expect: 1 batch claimed + submitted, the payout row `PROCESSING` with a `razorpayx_payout_id`, then the test webhook flipping it to `PAID` with `webhook_confirmed=true` and the conversion's `paid_at` stamped.

### 5b. Flip live

1. `RAZORPAYX_ACCOUNT_NUMBER` → the **live** account number.
2. Confirm RazorpayX keys are live (2a).
3. Re-visit `/admin/referral-settings`: set the payout minimum (₹500 is a sane floor) and decide TDS with your CA — `tds_enabled`/`tds_pct` default OFF; when turned on, RazorpayX receives NET and `tds_paise` snapshots the withholding.
4. Leave cadence on MONTHLY — the cron runs 02:30 UTC on the **30th** (February carries to March 30). Use the Monitor's **Run payouts now** any time you want money to move sooner.

---

## Part 6 — What "working" looks like (steady state)

- A referred store pays → T4 records the conversion at signup → T5 qualifies it after `qualify_days` → T6 accrues a monthly installment for every month the store actually pays → T7 pays the referrer monthly (or on demand via T9) → the webhook settles the batch and stamps `paid_at`.
- **Referral Monitor** (`/admin/referral`) shows: totals, per-referrer leaderboard (accrued / paid out / unsettled — unsettled uses the exact ledger identity the job acts on), Run payouts now, CSV export, per-referrer detail with clawback + the interim payout-account form.
- Failed payouts release their claim automatically — the money re-pools and the next run retries; nothing is ever stranded in PENDING longer than 24h without reconciliation.

---

## Rollback notes (if something goes wrong)

| Problem | Action |
|---|---|
| A payout sent to wrong details | RazorpayX → Payouts → (if not yet processed) **Cancel**; if processed, raise a RazorpayX support ticket for a recall. Then fix the account (Monitor → detail → payout-account form) — replacement deactivates the old fund account first, so it can never receive again. |
| A conversion must be un-earned | Monitor → referrer detail → Clawback (PENDING/QUALIFIED only, irreversible, reason required, audit-logged). PAID conversions cannot be clawed back from the panel — reverse via RazorpayX instead. |
| Webhook storms / duplicate deliveries | Harmless by design: settlement is CAS-idempotent, duplicates no-op. |
| Migrations applied out of order | Do not improvise — 109→114 in order is idempotent-safe to re-run *only* via the dashboard's runner on unapplied ones; check `_prisma_migrations` first (query in Part 1). |
