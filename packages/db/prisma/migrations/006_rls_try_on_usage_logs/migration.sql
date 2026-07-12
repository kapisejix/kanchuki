-- Migration: rls_try_on_usage_logs
-- try_on_usage_logs (billing/GPU-cost data) had RLS disabled — flagged by
-- Supabase's live advisory scan (2026-07-11). Same retailer-isolation gap
-- already fixed for try_on_jobs/audit_logs in 003_rls_try_on_audit.
-- _prisma_migrations intentionally left alone: internal Prisma bookkeeping,
-- not tenant data, enabling RLS there risks breaking migrate deploy tooling.

ALTER TABLE "try_on_usage_logs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retailer_own_try_on_usage_logs" ON "try_on_usage_logs"
  FOR ALL TO authenticated
  USING (retailer_id IN (SELECT id FROM retailers WHERE auth_user_id = auth.uid()::text));
