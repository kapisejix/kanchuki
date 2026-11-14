-- 159: record who undid a Scan & Sell bill (F-047 follow-up to 158 / T4).
-- NOT APPLIED by the agent; the owner applies it.
--
-- ADDITIVE ONLY: one nullable TEXT column on product_sales. No default, no FK, no backfill.
-- Same meaning as sold_by_staff_id: Staff.id of the person who undid it, NULL = the owner.
-- Plain column with no FK on purpose, so removing a staff row never blocks the sale history or a
-- retailer purge (158 reasoning).
-- Rows undone BEFORE this migration keep NULL, which reads as "owner"; their actor was never
-- recorded and cannot be recovered. Only rows with undone_at set carry a meaningful value.
--
-- No grants or RLS change: kanchuki_app already has table-level SELECT, INSERT, UPDATE on
-- product_sales (158), and that covers a new column.
--
-- DEPLOY ORDER (RC-160): apply this BEFORE the API build that writes the column ships. Every
-- whole-row productSale read selects every Prisma column, so code that knows the column fails with
-- P2022 on a database that lacks it. Applying the migration first is always safe: nothing reads
-- the column until that build is live.
-- Idempotent. Rollback: ALTER TABLE "product_sales" DROP COLUMN "undone_by_staff_id";

ALTER TABLE "product_sales" ADD COLUMN IF NOT EXISTS "undone_by_staff_id" TEXT;
