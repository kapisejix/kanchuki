-- 134_style_analysis_daily
--
-- F-045 My Style, PR-8: per-day counter behind the admin usage chart.
-- ADDITIVE ONLY: one new table. No customer id on purpose - a per-person log would be a
-- record of who sent a selfie. The job upserts (count + 1) per UTC day; no DELETE is
-- granted or needed (RC-049), rows are tiny (one per day).
--
-- RLS: same shape as 133 - policy for the two backend roles first, then ENABLE, so the
-- API never sees 0 rows (RC-030). Global table, no retailer_id/customer_id, nothing to
-- add to hardDeleteRetailer() (RC-050).

CREATE TABLE "style_analysis_daily" (
  "day"        DATE NOT NULL,
  "count"      INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "style_analysis_daily_pkey" PRIMARY KEY ("day"),
  CONSTRAINT "style_analysis_daily_count_chk" CHECK ("count" >= 0)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_app')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN
    RAISE WARNING '134: kanchuki_app/kanchuki_purge missing - RLS skipped. Run scripts/setup-role-separation.sql, then re-run this block (enabling RLS without the policy would make the API see 0 rows).';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE tablename = 'style_analysis_daily' AND policyname = 'backend_roles_full_access'
      AND schemaname = ANY (current_schemas(false))
  ) THEN
    CREATE POLICY "backend_roles_full_access" ON "style_analysis_daily"
      FOR ALL TO kanchuki_app, kanchuki_purge USING (true) WITH CHECK (true);
  END IF;
  ALTER TABLE "style_analysis_daily" ENABLE ROW LEVEL SECURITY;
END $$;
