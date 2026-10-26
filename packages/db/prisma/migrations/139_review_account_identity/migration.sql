-- 139: Reviews are keyed on the passport session account, not an unverified phone
-- (H4-3 / RC-098).
--
-- Until now product_reviews / store_reviews were keyed on customer_id, the retailer-scoped
-- CRM Customer row, which the public route created from a body phone with no OTP. Now the
-- review carries the shopper's CustomerAccount (customer_account_id) plus its own
-- display_name, and never touches the CRM.
--
-- ADDITIVE ONLY: two nullable columns per table, customer_id relaxed to nullable, two
-- unique indexes, two FKs. NO backfill: legacy rows keep customer_id (their phone was
-- never verified, so they are not attributed to any account).
-- FK is ON DELETE SET NULL so a hard delete of an account never trips an RC-050-style
-- RESTRICT. There is deliberately NO "owner not null" CHECK: SET NULL on a row whose
-- customer_id is already null would violate it and make the account delete fail.
-- RLS is unchanged: both tables already exist with their policies; no new table here.
-- Idempotent: every statement is guarded.

ALTER TABLE "product_reviews" ADD COLUMN IF NOT EXISTS "customer_account_id" TEXT;
ALTER TABLE "product_reviews" ADD COLUMN IF NOT EXISTS "display_name" TEXT;
ALTER TABLE "product_reviews" ALTER COLUMN "customer_id" DROP NOT NULL;

ALTER TABLE "store_reviews" ADD COLUMN IF NOT EXISTS "customer_account_id" TEXT;
ALTER TABLE "store_reviews" ADD COLUMN IF NOT EXISTS "display_name" TEXT;
ALTER TABLE "store_reviews" ALTER COLUMN "customer_id" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "product_reviews_product_id_customer_account_id_key"
  ON "product_reviews"("product_id", "customer_account_id");
CREATE INDEX IF NOT EXISTS "product_reviews_customer_account_id_idx"
  ON "product_reviews"("customer_account_id");
CREATE UNIQUE INDEX IF NOT EXISTS "store_reviews_retailer_id_customer_account_id_key"
  ON "store_reviews"("retailer_id", "customer_account_id");
CREATE INDEX IF NOT EXISTS "store_reviews_customer_account_id_idx"
  ON "store_reviews"("customer_account_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_reviews_customer_account_id_fkey') THEN
    ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_customer_account_id_fkey"
      FOREIGN KEY ("customer_account_id") REFERENCES "customer_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_reviews_customer_account_id_fkey') THEN
    ALTER TABLE "store_reviews" ADD CONSTRAINT "store_reviews_customer_account_id_fkey"
      FOREIGN KEY ("customer_account_id") REFERENCES "customer_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
