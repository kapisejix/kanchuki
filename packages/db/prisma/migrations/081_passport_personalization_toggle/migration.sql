-- T25: Add profiling_enabled toggle to CustomerAccount
-- When false, behavioral writes (view/favorite/search) are suppressed
-- and the preference vector is frozen/cleared.

ALTER TABLE "customer_accounts"
ADD COLUMN "profiling_enabled" BOOLEAN NOT NULL DEFAULT true;
