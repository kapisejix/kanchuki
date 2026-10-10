-- 126: Row-level security on design_references.
--
-- 069 created design_references without RLS (093's header documents the then-
-- convention: tables added after the Railway move ship without it and rely on
-- the app role). Owner decision 2026-10-10: enable it, so the table is not
-- reachable through PostgREST with the anon / authenticated keys.
--
-- Same two-part shape as 111, for the same reason (RC-030):
--   1. ENABLE ROW LEVEL SECURITY  → deny-all for anon / authenticated (the
--      background_images / plan_limits pattern: global admin config, no
--      retailer_id, all access goes through apps/api).
--   2. An explicit PERMISSIVE policy for the two backend roles. Without it the
--      API's access would depend on the roles being members of the table's
--      owner — an accident of which role ran which migration — and an RLS
--      table the app role cannot see fails by returning 0 rows, not an error.
--      USING (true) is not a widening: it names only kanchuki_app /
--      kanchuki_purge, and RLS is a filter, not a grant (DELETE privilege is
--      still governed by GRANT, see 125).
--
-- Idempotent: ENABLE is a no-op when already on; the policy is skipped if it
-- exists; a missing table or role is a WARNING, not a failure.

DO $$
DECLARE
  policy_name constant text := 'backend_roles_full_access';
BEGIN
  IF to_regclass('design_references') IS NULL THEN
    RAISE WARNING '126: design_references does not exist — skipped (apply 069_design_gallery first)';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_app')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN
    RAISE WARNING '126: kanchuki_app/kanchuki_purge missing — skipped. Run scripts/setup-role-separation.sql first, then re-apply (enabling RLS without the policy would make the API see 0 rows).';
    RETURN;
  END IF;

  -- Policy first, then RLS: never a window where RLS is on and the backend has no policy.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE tablename = 'design_references'
      AND policyname = policy_name
      AND schemaname = ANY (current_schemas(false))
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge USING (true) WITH CHECK (true)',
      policy_name,
      'design_references'
    );
  END IF;

  ALTER TABLE design_references ENABLE ROW LEVEL SECURITY;
END $$;
