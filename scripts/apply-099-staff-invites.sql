-- ============================================================================
-- Migration 099: staff_invites (tokenized staff invites — staff-invite-tokens.md)
--
-- HOW TO USE (admin SQL Editor / psql with the kanchuki_migrator role — paste
-- ALL of this, run once):
--   1. This applies the exact DDL from
--      packages/db/prisma/migrations/099_staff_invites/migration.sql
--      (guarded idempotent where Postgres allows, so a double-paste is safe).
--   2. The final INSERT records it in _prisma_migrations so `prisma migrate
--      deploy` (Railway deploy) doesn't try to re-run it. Keyed to the real
--      sha256 of the migration.sql file:
--      ddebb39191270225a492d8407097de05e80bc1b08e0bc2c0261bdb4f73b83c52
--   3. If the checksum ever mismatches on a future deploy, the official
--      alternative is `npx prisma migrate resolve --applied 099_staff_invites`
--      (records the migration as applied using Prisma's own checksum).
--
-- NOTE on pending history: _prisma_migrations in prod records up to 092;
-- migrations 093–098 (showcase_designs, resource packs, social posts) are also
-- unapplied. 099 has NO dependency on them (it only touches `staff` +
-- `retailers`), so applying 099 alone is safe and sufficient for the invite
-- feature. When a future deploy runs `prisma migrate deploy`, 093–099 will
-- apply in order and 099 will be skipped (already recorded).
--
-- Backfill: every staff row with is_active = true AND auth_user_id IS NULL
-- gets a pending invite expiring in 7 days with a placeholder token_hash
-- (never distributed — the retailer must hit Resend to mint a real link).
-- The backfill guard makes re-runs safe (no duplicate invites on staff_id).
-- ============================================================================

-- ── 1. Table (idempotent) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "staff_invites" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "role_snapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_invites_pkey" PRIMARY KEY ("id")
);

-- ── 2. Indexes (idempotent) ─────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "staff_invites_staff_id_key" ON "staff_invites"("staff_id");
CREATE UNIQUE INDEX IF NOT EXISTS "staff_invites_token_hash_key" ON "staff_invites"("token_hash");
CREATE INDEX IF NOT EXISTS "staff_invites_retailer_id_idx" ON "staff_invites"("retailer_id");

-- ── 3. Foreign keys (guarded — Postgres has no ADD CONSTRAINT IF NOT EXISTS) ─
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_invites_staff_id_fkey') THEN
    ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_staff_id_fkey"
      FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_invites_retailer_id_fkey') THEN
    ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_retailer_id_fkey"
      FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── 4. Grants (naturally idempotent) ────────────────────────────────────────
GRANT DELETE ON "staff_invites" TO kanchuki_app;
GRANT DELETE ON "staff_invites" TO kanchuki_purge;

-- ── 5. Backfill (guarded against re-run double-inserts) ─────────────────────
INSERT INTO "staff_invites" ("id", "staff_id", "retailer_id", "token_hash", "role_snapshot", "status", "expires_at", "created_at", "updated_at")
SELECT
  'inv_' || md5(random()::text || clock_timestamp()::text || s.id),
  s.id,
  s.retailer_id,
  md5(random()::text || clock_timestamp()::text || s.id || s.retailer_id),
  s.role,
  'pending',
  now() + interval '7 days',
  now(),
  now()
FROM "staff" s
WHERE s.is_active = true
  AND s.auth_user_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "staff_invites" si WHERE si.staff_id = s.id
  );

-- ── 6. Record in _prisma_migrations (keyed to the real sha256) ───────────────
INSERT INTO "_prisma_migrations"
  ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
SELECT
  gen_random_uuid(),
  'ddebb39191270225a492d8407097de05e80bc1b08e0bc2c0261bdb4f73b83c52',
  now(), '099_staff_invites', NULL, NULL, now(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '099_staff_invites'
);

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT "migration_name", "finished_at" IS NOT NULL AS applied
FROM "_prisma_migrations"
WHERE "migration_name" = '099_staff_invites';

SELECT count(*) AS backfilled_pending_invites
FROM "staff_invites" WHERE "status" = 'pending';