-- 147: RC-159 drift backfill. Three objects the live app reads were declared in
-- schema.prisma and (we believe) hand-applied in prod, but no migration created
-- them, so a database built from the history lacked them. All statements are
-- idempotent: a no-op on prod, a real create on a fresh database.
--   retailers.latitude / longitude + index  (geo-targeting, near-me, My Style)
--   bug_reports.resolved_at                 (admin resolve flow)
-- SocialPostStatus SCHEDULED/DRAFT already exist via 090; only schema.prisma lagged.

ALTER TABLE "retailers"
  ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "retailers_latitude_longitude_idx"
  ON "retailers"("latitude", "longitude");

ALTER TABLE "bug_reports"
  ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMP(3);
