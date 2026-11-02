-- 148: ai_content_reports — shopper "Report this AI content" (Google Play AI-Generated
-- Content policy; docs/tasks/pending/ai-content-reporting.md). NOT APPLIED by the agent;
-- the owner applies it.
--
-- Text only: the AI output is never stored. Retailer-side reports use bug_reports.
-- ADDITIVE ONLY: a new table + indexes, nothing reads it until the route ships.
--
-- GRANTS: ALTER DEFAULT PRIVILEGES (scripts/setup-role-separation.sql §19.1) gives
-- SELECT/INSERT/UPDATE on new tables to kanchuki_app. DELETE is not granted and nothing
-- deletes these rows directly (RC-049); they go with the account via ON DELETE CASCADE.
-- RLS: same `backend_roles_full_access` policy as 111/136/141/144, idempotent, skipped
-- with a warning when the backend roles are missing.
--
-- Rollback:
--   DROP TABLE IF EXISTS "ai_content_reports";

CREATE TABLE IF NOT EXISTS "ai_content_reports" (
    "id" TEXT NOT NULL,
    "customer_account_id" TEXT, -- NULL = anonymous visitor (AI Stylist has no sign-in)
    "feature" TEXT NOT NULL,
    "content_ref" TEXT,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_content_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_content_reports_status_check" CHECK ("status" IN ('NEW', 'REVIEWED'))
);

CREATE INDEX IF NOT EXISTS "ai_content_reports_created_at_idx"
  ON "ai_content_reports" ("created_at");
CREATE INDEX IF NOT EXISTS "ai_content_reports_customer_account_id_created_at_idx"
  ON "ai_content_reports" ("customer_account_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "ai_content_reports" ADD CONSTRAINT "ai_content_reports_customer_account_id_fkey"
    FOREIGN KEY ("customer_account_id") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
DECLARE
  policy_name constant text := 'backend_roles_full_access';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_app')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN
    RAISE WARNING '148: kanchuki_app/kanchuki_purge missing — RLS policy skipped. Run scripts/setup-role-separation.sql first, then re-apply.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE tablename = 'ai_content_reports'
      AND policyname = policy_name
      AND schemaname = ANY (current_schemas(false))
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge USING (true) WITH CHECK (true)',
      policy_name,
      'ai_content_reports'
    );
  END IF;
  ALTER TABLE "ai_content_reports" ENABLE ROW LEVEL SECURITY;
END $$;
