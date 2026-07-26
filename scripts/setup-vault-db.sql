-- ============================================================
-- F-016 Deletion Vault — INSERT-only role setup
-- ============================================================
-- Run this SQL against the VAULT Postgres instance (NOT Supabase)
-- AFTER provisioning it (e.g., Railway Postgres).
--
-- Steps:
-- 1. Provision a new Postgres instance on Railway
-- 2. Connect via Railway CLI: railway connect <vault-db-name>
--    OR use psql with the Railway connection string
-- 3. Run this script
-- 4. Verify: run the SELECT queries at the bottom
-- ============================================================

-- ─── 1. Create the INSERT-only application role ───────────────
-- The app uses this role for vault writes. It can INSERT but
-- never UPDATE or DELETE — tamper-resistant by permission.
CREATE ROLE vault_app WITH LOGIN PASSWORD 'VaultApp_InsertOnly!2026';
GRANT CONNECT ON DATABASE "railway" TO vault_app;
GRANT USAGE ON SCHEMA public TO vault_app;

-- ─── 2. Create the vault table ────────────────────────────────
-- Prisma would do this via db push, but here's the raw SQL
CREATE TABLE IF NOT EXISTS deleted_records (
  id            TEXT PRIMARY KEY,
  source_table  TEXT NOT NULL,
  source_id     TEXT NOT NULL,
  retailer_id   TEXT,
  payload       JSONB NOT NULL,
  delete_reason TEXT,
  deleted_by    TEXT,
  deleted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deleted_records_source
  ON deleted_records (source_table, source_id);

CREATE INDEX IF NOT EXISTS idx_deleted_records_retailer
  ON deleted_records (retailer_id);

-- ─── 3. Grant INSERT only, explicitly revoke UPDATE/DELETE ────
GRANT INSERT ON deleted_records TO vault_app;

-- Explicitly revoke everything else
REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON deleted_records FROM vault_app;

-- Also ensure no access to other tables
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM vault_app;
GRANT INSERT ON deleted_records TO vault_app;

-- Default privileges: new tables get INSERT only for vault_app
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT INSERT ON TABLES TO vault_app;

-- ─── 4. Verify permissions ─────────────────────────────────────
-- These should all return true/false as indicated:
--
-- SELECT has_table_privilege('vault_app', 'deleted_records', 'INSERT');
--   → true
--
-- SELECT has_table_privilege('vault_app', 'deleted_records', 'SELECT');
--   → false
--
-- SELECT has_table_privilege('vault_app', 'deleted_records', 'UPDATE');
--   → false
--
-- SELECT has_table_privilege('vault_app', 'deleted_records', 'DELETE');
--   → false
