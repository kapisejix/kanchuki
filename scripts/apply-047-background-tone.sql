-- ============================================================================
-- Migration 047: background_tone (F-028 auto-contrast background selection)
--
-- HOW TO USE (Supabase SQL Editor — paste ALL of this, run once):
--   1. This applies the exact DDL from packages/db/prisma/migrations/047_background_tone/migration.sql
--   2. The final INSERT records it in _prisma_migrations so `prisma migrate
--      deploy` (Railway deploy) doesn't try to re-run it. Keyed to the real
--      sha256 of the migration.sql file: 4b7ff87e50ccfc0f1b31ed3e1b3aa407babb98db5453e1fe94f264a85de6ffb5
--   3. If the checksum ever mismatches on a future deploy, the official
--      alternative is `npx prisma migrate resolve --applied 047_background_tone`
--      (records the migration as applied using Prisma's own checksum).
--
-- FIX (2026-08-08): this script is now IDEMPOTENT — safe to re-run. The first
-- version used `INSERT ... ON CONFLICT ("migration_name") DO NOTHING`, which
-- fails with ERROR 42P10 because _prisma_migrations has NO unique constraint
-- on migration_name (only `id` is the primary key). The INSERT below now uses
-- a WHERE NOT EXISTS guard instead. The DDL is also guarded (DO block + ADD
-- COLUMN IF NOT EXISTS) so a partial first run (enum/column already applied,
-- row not recorded) won't error on re-paste.
-- ============================================================================

-- ── 1. DDL (idempotent — identical to migration.sql) ────────────────────────
DO $$
BEGIN
  CREATE TYPE "BackgroundTone" AS ENUM ('LIGHT', 'DARK');
EXCEPTION WHEN duplicate_object THEN
  NULL; -- type already exists (e.g. partial first run) — fine
END $$;

ALTER TABLE "background_images"
  ADD COLUMN IF NOT EXISTS "tone" "BackgroundTone";

-- ── 2. Record in _prisma_migrations (keyed to the real sha256) ───────────────
INSERT INTO "_prisma_migrations"
  ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
SELECT
  gen_random_uuid(),
  '4b7ff87e50ccfc0f1b31ed3e1b3aa407babb98db5453e1fe94f264a85de6ffb5',
  now(), '047_background_tone', NULL, NULL, now(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '047_background_tone'
);

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT "migration_name", "finished_at" IS NOT NULL AS applied
FROM "_prisma_migrations"
WHERE "migration_name" = '047_background_tone';
