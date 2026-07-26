-- F-016 Deletion Vault — initial schema
-- This migration runs against the vault database (VAULT_DATABASE_URL),
-- NOT the primary Supabase database. Create the vault DB first, then run:
--   cd packages/db && prisma migrate deploy --schema=prisma/vault-schema.prisma

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

-- The app's DB role for VAULT_DATABASE_URL should have INSERT only.
-- Verify with:
--   SELECT has_table_privilege('vault_app_user', 'deleted_records', 'INSERT');
-- It should return true for INSERT and false for UPDATE/DELETE.
