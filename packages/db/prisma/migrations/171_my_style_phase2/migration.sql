-- 171_my_style_phase2
--
-- My Style Phase 2 (docs/tasks/pending/customer-profile-research.md §9). Requires 170.
-- NOT APPLIED by the agent; the owner applies it BEFORE deploying the Phase 2 code: a
-- whole-row CustomerAccount query would 500 with P2022 otherwise (RC-160).
--
-- 1. customer_accounts.profile_source: where the saved undertone came from (D4).
--    photo = the vision read, confirmed = the shopper's drape-test answer, manual = a manual
--    pick. Nullable, no default, no backfill: NULL on a row saved before 171 reads as photo.
--    Cleared with the rest of the profile (STYLE_PROFILE_CLEARED: "Clear my data", the job's
--    compensation, account erasure) and included in the data export (RC-172).
--    No grants change: kanchuki_app already has table-level SELECT/INSERT/UPDATE.
-- 2. style_analysis_failures_daily: failed photo reads per UTC day, mode and reason (R10).
--    NO customer id on purpose (same rule as 134): a per-person log would be a record of who
--    sent a selfie. RLS shape as 134: policy for the backend roles first, then ENABLE (RC-030).
--    Global table: nothing to add to hardDeleteRetailer() (RC-050). No DELETE needed (RC-049).
-- 3. Quota split (D5): selfie 5/month (prod row read 2026-11-27 was 10/MONTH, an admin edit;
--    the owner's D5 sets 5), Find similar its own 10/month row. Admin-editable afterwards.
--
-- ROLLBACK (run as one block):
--   DROP TABLE "style_analysis_failures_daily";
--   ALTER TABLE "customer_accounts" DROP CONSTRAINT "customer_accounts_profile_source_chk",
--     DROP COLUMN "profile_source";
--   UPDATE "customer_resource_limits" SET "limit_per_period" = 10, "updated_at" = CURRENT_TIMESTAMP
--     WHERE "resource_type" = 'STYLE_ANALYSIS';
--   UPDATE "customer_resource_limits" SET "limit_per_period" = -1, "updated_at" = CURRENT_TIMESTAMP
--     WHERE "resource_type" = 'STYLE_SIMILAR';   -- -1 = unlimited; DELETE is revoked (RC-049)
--   (Roll the code back first: the Phase 2 job charges Find similar to STYLE_SIMILAR.)

-- ── 1. profile_source ───────────────────────────────────────────
ALTER TABLE "customer_accounts"
  ADD COLUMN "profile_source" TEXT,
  ADD CONSTRAINT "customer_accounts_profile_source_chk" CHECK ("profile_source" IN ('photo', 'confirmed', 'manual'));

-- ── 2. failure counter ──────────────────────────────────────────
CREATE TABLE "style_analysis_failures_daily" (
  "day"        DATE NOT NULL,
  "mode"       TEXT NOT NULL,                              -- selfie | garment
  "reason"     TEXT NOT NULL,                              -- enum reason, read_failed or expired
  "count"      INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "style_analysis_failures_daily_pkey" PRIMARY KEY ("day", "mode", "reason"),
  CONSTRAINT "style_analysis_failures_daily_mode_chk" CHECK ("mode" IN ('selfie', 'garment')),
  CONSTRAINT "style_analysis_failures_daily_reason_chk" CHECK ("reason" ~ '^[a-z_]{1,40}$'),
  CONSTRAINT "style_analysis_failures_daily_count_chk" CHECK ("count" >= 0)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_app')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN
    RAISE WARNING '171: kanchuki_app/kanchuki_purge missing - RLS skipped. Run scripts/setup-role-separation.sql, then re-run this block (enabling RLS without the policy would make the API see 0 rows).';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE tablename = 'style_analysis_failures_daily' AND policyname = 'backend_roles_full_access'
      AND schemaname = ANY (current_schemas(false))
  ) THEN
    CREATE POLICY "backend_roles_full_access" ON "style_analysis_failures_daily"
      FOR ALL TO kanchuki_app, kanchuki_purge USING (true) WITH CHECK (true);
  END IF;
  ALTER TABLE "style_analysis_failures_daily" ENABLE ROW LEVEL SECURITY;
END $$;

-- ── 3. quota split (D5) ─────────────────────────────────────────
UPDATE "customer_resource_limits"
  SET "limit_per_period" = 5, "updated_at" = CURRENT_TIMESTAMP
  WHERE "resource_type" = 'STYLE_ANALYSIS';

INSERT INTO "customer_resource_limits" ("id", "resource_type", "limit_per_period", "period", "updated_at")
VALUES ('crl_style_similar', 'STYLE_SIMILAR', 10, 'MONTH', CURRENT_TIMESTAMP)
ON CONFLICT ("resource_type") DO NOTHING;
