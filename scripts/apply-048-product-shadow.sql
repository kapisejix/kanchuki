-- ============================================================================
-- Migration 048: product_shadow (F-030 retailer shadow toggle)
--
-- HOW TO USE (Supabase SQL Editor — paste ALL of this, run once):
--   1. This applies the exact DDL from packages/db/prisma/migrations/048_product_shadow/migration.sql
--   2. The final INSERT records it in _prisma_migrations so `prisma migrate
--      deploy` (Railway deploy) doesn't try to re-run it. Keyed to the real
--      sha256 of the migration.sql file: b2f43ce4fc7a7c3c96b5f3b45dd356874ebb7772ca51533d9f640909b63fdfaf
--   3. If the checksum ever mismatches on a future deploy, the official
--      alternative is `npx prisma migrate resolve --applied 048_product_shadow`
--      (records the migration as applied using Prisma's own checksum).
--
-- IDEMPOTENT — safe to re-run. DDL uses ADD COLUMN IF NOT EXISTS, and the
-- _prisma_migrations INSERT uses a WHERE NOT EXISTS guard (NOT ON CONFLICT —
-- _prisma_migrations has no unique constraint on migration_name, only on the
-- `id` primary key; ON CONFLICT would throw ERROR 42P10, same as 047's first
-- version did).
-- ============================================================================

-- ── 1. DDL (idempotent — identical to migration.sql) ────────────────────────
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "add_shadow" BOOLEAN NOT NULL DEFAULT false;

-- ── 2. Record in _prisma_migrations (keyed to the real sha256) ───────────────
INSERT INTO "_prisma_migrations"
  ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
SELECT
  gen_random_uuid(),
  'b2f43ce4fc7a7c3c96b5f3b45dd356874ebb7772ca51533d9f640909b63fdfaf',
  now(), '048_product_shadow', NULL, NULL, now(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '048_product_shadow'
);

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT "migration_name", "finished_at" IS NOT NULL AS applied
FROM "_prisma_migrations"
WHERE "migration_name" = '048_product_shadow';
