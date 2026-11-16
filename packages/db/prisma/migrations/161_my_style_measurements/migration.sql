-- 161: My Style self-entered body measurements (spec docs/tasks/pending/my-style-body-profile.md §3).
-- NOT APPLIED by the agent; the owner applies it BEFORE deploying code that reads these columns
-- (a whole-row CustomerAccount query would 500 with P2022 otherwise, see RC-160).
--
-- ADDITIVE ONLY: five nullable columns on customer_accounts, no default, no backfill, no index.
-- The CHECKs mirror MY_STYLE_MEASUREMENT_RANGES in packages/shared (NULL passes a CHECK).
-- No weight column on purpose (spec §3).
--
-- No grants or RLS change: kanchuki_app already has table-level SELECT, INSERT, UPDATE on
-- customer_accounts, and that covers new columns.
--
-- ROLLBACK:
--   ALTER TABLE "customer_accounts"
--     DROP COLUMN "height_cm", DROP COLUMN "bust_cm", DROP COLUMN "waist_cm",
--     DROP COLUMN "hip_cm", DROP COLUMN "measurements_at";

ALTER TABLE "customer_accounts"
  ADD COLUMN "height_cm" INTEGER,
  ADD COLUMN "bust_cm" INTEGER,
  ADD COLUMN "waist_cm" INTEGER,
  ADD COLUMN "hip_cm" INTEGER,
  ADD COLUMN "measurements_at" TIMESTAMP(3),
  ADD CONSTRAINT "customer_accounts_height_cm_range" CHECK ("height_cm" BETWEEN 100 AND 220),
  ADD CONSTRAINT "customer_accounts_bust_cm_range" CHECK ("bust_cm" BETWEEN 50 AND 160),
  ADD CONSTRAINT "customer_accounts_waist_cm_range" CHECK ("waist_cm" BETWEEN 50 AND 160),
  ADD CONSTRAINT "customer_accounts_hip_cm_range" CHECK ("hip_cm" BETWEEN 50 AND 160);
