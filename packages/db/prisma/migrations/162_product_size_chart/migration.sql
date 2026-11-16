-- 162: retailer size chart per product (spec docs/tasks/pending/my-style-body-profile.md §3, step 3).
-- NOT APPLIED by the agent; the owner applies it BEFORE deploying code that reads this column
-- (a whole-row Product query would 500 with P2022 otherwise, see RC-160).
--
-- ADDITIVE ONLY: one nullable JSONB column on products. No default, no backfill, no index, no CHECK
-- (the API validates the shape with parseSizeChart in @kanchuki/shared). NULL = no chart, and then
-- My Style shows no size suggestion for the product.
--
-- No grants or RLS change: kanchuki_app already has table-level SELECT, INSERT, UPDATE on products,
-- and that covers new columns.
--
-- ROLLBACK:
--   ALTER TABLE "products" DROP COLUMN "size_chart";

ALTER TABLE "products" ADD COLUMN "size_chart" JSONB;
