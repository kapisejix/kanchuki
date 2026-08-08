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
-- ============================================================================

-- ── 1. DDL (identical to migration.sql) ──────────────────────────────────────
CREATE TYPE "BackgroundTone" AS ENUM ('LIGHT', 'DARK');

ALTER TABLE "background_images"
  ADD COLUMN "tone" "BackgroundTone";

-- ── 2. Record in _prisma_migrations (keyed to the real sha256) ───────────────
INSERT INTO "_prisma_migrations"
  ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
VALUES
  (gen_random_uuid(), '4b7ff87e50ccfc0f1b31ed3e1b3aa407babb98db5453e1fe94f264a85de6ffb5',
   now(), '047_background_tone', NULL, NULL, now(), 1)
ON CONFLICT ("migration_name") DO NOTHING;

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT "migration_name", "finished_at" IS NOT NULL AS applied
FROM "_prisma_migrations"
WHERE "migration_name" = '047_background_tone';
