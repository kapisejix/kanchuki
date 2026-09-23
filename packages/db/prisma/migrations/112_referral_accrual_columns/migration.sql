-- 112_referral_accrual_columns
-- T6 of docs/tasks/referral-program-retailer-affiliate.md — the monthly
-- commission accrual. Three columns on referral_conversions, all owned by T6
-- (apps/api/src/jobs/referral-accrue.ts); T5 never writes them and its test
-- asserts their absence from its own payload.
--
-- OWNER DECISIONS RECORDED 2026-09-23 (none of them are in the spec text):
--   1. The commission base is T5's qualification snapshot
--      (commission_base_amount) — a mid-cycle plan change moves nothing.
--   2. Accrual is monthly, on the same daily maintenance cron, one installment
--      per calendar month (IST — the §42 Commission Tracker business calendar).
--   3. An installment accrues only for a month in which the referred store made
--      a successful payment. A month with no payment is SKIPPED — never clawed
--      back — and the program continues until duration_months installments
--      have EARNED (so the program extends in wall-time while the store is not
--      paying, and resumes when it resumes). The anchor for month 1 is the
--      store's FIRST successful payment, which is the owner's stated rule:
--      "after the trial the retailer starts paying us, then we pay the
--      referrer; if the retailer stops paying, no payment to the referral".
--   4. The per-month amount is FROZEN at the first earn (base × pct), so an
--      admin editing commission_pct can never retroactively reprice months
--      already earned — the same snapshot discipline as the base.

ALTER TABLE "referral_conversions" ADD COLUMN "commission_monthly_paise" INTEGER;
ALTER TABLE "referral_conversions" ADD COLUMN "accrued_months" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "referral_conversions" ADD COLUMN "accrued_through_period" TEXT;

-- ─── Accrual consistency ─────────────────────────────────────────
-- The ledger cannot drift from its own parts. These CHECKs are what make
-- commission_accrued auditable without replaying the job:
--
--   * earned months ⟺ a settlement cursor ⟺ a frozen monthly amount. A row
--     cannot have earned a month without all three, and cannot have a cursor
--     or a frozen amount before its first earn.
--   * a PENDING row has never accrued (T6 accrues only on QUALIFIED and PAID
--     rows; PAID means "a payout settled part of it", so later months keep
--     accruing after the first payout — paid_at does not end the program).
--   * commission_accrued is EXACTLY accrued_months × the frozen monthly
--     amount. If the job ever writes those three fields inconsistently the
--     UPDATE fails rather than the ledger lying quietly.
ALTER TABLE "referral_conversions" ADD CONSTRAINT "referral_conversions_accrual_consistency" CHECK (
    ("accrued_months" = 0 AND "accrued_through_period" IS NULL)
    OR ("accrued_months" > 0
        AND "accrued_through_period" IS NOT NULL
        AND "commission_monthly_paise" IS NOT NULL
        AND "commission_monthly_paise" >= 0)
);

ALTER TABLE "referral_conversions" ADD CONSTRAINT "referral_conversions_accrual_requires_progress" CHECK (
    ("status" = 'PENDING' AND "accrued_months" = 0)
    OR "status" <> 'PENDING'
);

ALTER TABLE "referral_conversions" ADD CONSTRAINT "referral_conversions_accrued_matches_parts" CHECK (
    "commission_monthly_paise" IS NULL
    OR "commission_accrued" = "accrued_months" * "commission_monthly_paise"
);

ALTER TABLE "referral_conversions" ADD CONSTRAINT "referral_conversions_accrued_months_non_negative"
    CHECK ("accrued_months" >= 0);

-- No new purge obligation: these are columns, not a new child table. The three
-- referral tables are already swept in BOTH purge jobs before the retailer row
-- and already granted to kanchuki_purge (migration 109) — the RC-029/RC-030
-- pair that must never be half-done.
--
-- No RLS, matching migration 109's header: the zero-policy deny-all pattern
-- breaks the pooled Prisma read path; tenant scoping is app-layer through the
-- privileged app role.
