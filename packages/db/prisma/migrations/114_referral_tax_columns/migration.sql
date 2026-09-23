-- 114_referral_tax_columns
-- T7 of docs/tasks/referral-program-retailer-affiliate.md — admin-settable
-- tax configuration. Owner decision 2026-09-23: add the OPTION now so the
-- owner can flip it from /admin/referral-settings after discussing with their
-- CA; defaults are all OFF/zero, so behavior does not change one rupee until
-- an admin turns it on.
--
-- referral_settings gains the policy knobs; referral_payouts gains
-- tds_paise — the amount withheld at source on a batch. Deliberate design:
-- amount_paise remains the GROSS claim against the ledger and RazorpayX is
-- asked for NET = amount_paise − tds_paise. If RazorpayX were sent the gross,
-- the withheld TDS would still be counted as "paid" and would be repaid in
-- the next batch — silently paying tax twice.

-- ─── referral_settings: policy knobs ────────────────────────────
ALTER TABLE "referral_settings"
    ADD COLUMN "tds_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "tds_pct" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "gst_applicable" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "gst_pct" INTEGER NOT NULL DEFAULT 0;

-- Ranges mirror commission_pct's (0..100). An impossible TDS rate must be
-- unrepresentable in the DB, not merely rejected by one route.
ALTER TABLE "referral_settings"
    ADD CONSTRAINT "referral_settings_tds_pct_range"
        CHECK ("tds_pct" BETWEEN 0 AND 100),
    ADD CONSTRAINT "referral_settings_gst_pct_range"
        CHECK ("gst_pct" BETWEEN 0 AND 100),
    -- TDS enabled with a 0% rate is an impossible state (a toggle that does
    -- nothing) — same pairing discipline as second_tier_pct_required.
    ADD CONSTRAINT "referral_settings_tds_pct_required"
        CHECK ("tds_enabled" = false OR "tds_pct" > 0),
    ADD CONSTRAINT "referral_settings_gst_pct_required"
        CHECK ("gst_applicable" = false OR "gst_pct" > 0);

-- ─── referral_payouts: the withheld amount ──────────────────────
ALTER TABLE "referral_payouts"
    ADD COLUMN "tds_paise" INTEGER NOT NULL DEFAULT 0;

-- The withheld slice can never be negative, and can never swallow the whole
-- batch (net must remain positive — RazorpayX rejects amounts < 100 paise
-- anyway, but the DB should not even represent net <= 0).
ALTER TABLE "referral_payouts"
    ADD CONSTRAINT "referral_payouts_tds_paise_range"
        CHECK ("tds_paise" >= 0 AND "tds_paise" < "amount_paise");
