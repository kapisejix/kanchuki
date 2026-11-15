-- 160: who a product is for (My Style adult / kids split) + kids age band.
-- NOT APPLIED by the agent; the owner applies it BEFORE deploying code that reads these columns
-- (a whole-row Product query would 500 with P2022 otherwise, see RC-160).
--
-- ADDITIVE ONLY: two enum types and two nullable columns on products. No default, no backfill
-- (a dry-run-first script does that, owner-run), no index (the My Style candidate query is bounded
-- by retailer/geo and capped at 300 rows), no CHECK (the API clears kids_age_group when the
-- audience is not a kids value). NULL audience = adult unisex / not decided.
--
-- No grants or RLS change: kanchuki_app already has table-level SELECT, INSERT, UPDATE on
-- products, and that covers new columns. Adding a nullable column does not rewrite the table.
--
-- ROLLBACK:
--   ALTER TABLE "products" DROP COLUMN "audience", DROP COLUMN "kids_age_group";
--   DROP TYPE "ProductAudience"; DROP TYPE "KidsAgeGroup";

CREATE TYPE "ProductAudience" AS ENUM ('WOMEN', 'MEN', 'BOYS', 'GIRLS', 'KIDS_UNISEX');
CREATE TYPE "KidsAgeGroup" AS ENUM ('NEW_BORN', 'AGE_0_2', 'AGE_3_5', 'AGE_6_8', 'AGE_9_12', 'AGE_13_16');

ALTER TABLE "products"
  ADD COLUMN "audience" "ProductAudience",
  ADD COLUMN "kids_age_group" "KidsAgeGroup";
