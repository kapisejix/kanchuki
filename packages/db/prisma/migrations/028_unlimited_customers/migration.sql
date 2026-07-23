-- No customer cap on any plan (PLAN_LIMITS.max_customers is now Infinity for
-- STARTER/GROWTH too). 999999 is the existing "unlimited" sentinel already
-- used for PRO's max_products/max_customers.
ALTER TABLE "retailers" ALTER COLUMN "max_customers" SET DEFAULT 999999;

UPDATE "retailers" SET "max_customers" = 999999 WHERE "max_customers" < 999999;
