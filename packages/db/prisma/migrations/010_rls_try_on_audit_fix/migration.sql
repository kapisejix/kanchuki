-- Migration: rls_try_on_audit_fix
-- Enables RLS on try_on_jobs and audit_logs with the same retailer-isolation
-- pattern used by every other tenant-scoped table (001_pgvector_indexes,
-- 002_customer_measurements, 006_rls_try_on_usage_logs, etc.).
--
-- Uses DO blocks for idempotency (PostgreSQL doesn't support IF NOT EXISTS
-- on CREATE POLICY or ALTER TABLE ... ENABLE ROW LEVEL SECURITY).

-- ─── try_on_jobs: retailer isolation ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies WHERE tablename = 'try_on_jobs'
  ) THEN
    ALTER TABLE "try_on_jobs" ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "retailer_own_try_on_jobs" ON "try_on_jobs"
      FOR ALL TO authenticated
      USING (retailer_id IN (SELECT id FROM retailers WHERE auth_user_id = auth.uid()::text));
  END IF;
END $$;

-- ─── audit_logs: service-role only ────────────────────────────────
-- audit_logs intentionally has zero policies. RLS enabled blocks all
-- anon/authenticated access; only the API's service role (which bypasses
-- RLS) can read/write audit entries per SECURITY.md.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies WHERE tablename = 'audit_logs'
  ) THEN
    ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
