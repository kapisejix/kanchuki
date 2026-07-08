-- Enable RLS on remaining tables (matches pattern in 001_pgvector_indexes)

-- try_on_jobs: retailer isolation — retailer sees only own jobs
ALTER TABLE "try_on_jobs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retailer_own_try_on_jobs" ON "try_on_jobs"
  FOR ALL TO authenticated
  USING (retailer_id IN (SELECT id FROM retailers WHERE auth_user_id = auth.uid()::text));

-- audit_logs: no client access at all. RLS enabled with zero policies denies
-- anon + authenticated; only the API's service role (which bypasses RLS)
-- writes and reads audit entries per SECURITY.md.
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
