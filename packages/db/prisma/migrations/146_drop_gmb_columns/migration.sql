-- 146: drop the legacy Google My Business token-paste columns from retailers.
-- NOT APPLIED by the agent; the owner applies it.
--
-- RC-101 removed the integration (routes, mobile screen, client methods); nothing reads or
-- writes these columns. The owner confirmed on prod that every row holds NULL in all six
-- (count of rows with any gmb_* value = 0, 2026-10-31), so no data is lost.
--
-- Only gmb_configured_at ever had a migration (071). The other five were added to prod by
-- hand, so IF EXISTS keeps this replay-safe on a fresh database (RC-159).
ALTER TABLE "retailers"
  DROP COLUMN IF EXISTS "gmb_account_id",
  DROP COLUMN IF EXISTS "gmb_location_id",
  DROP COLUMN IF EXISTS "gmb_access_token",
  DROP COLUMN IF EXISTS "gmb_refresh_token",
  DROP COLUMN IF EXISTS "gmb_token_expiry",
  DROP COLUMN IF EXISTS "gmb_configured_at";
