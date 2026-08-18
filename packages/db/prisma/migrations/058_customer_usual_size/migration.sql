-- Roadmap N — Indian Size & Fit System: retailer quick-capture of a
-- customer's usual size (S, M, XL, 4XL …), drives per-customer product
-- size recommendation. Plain TEXT — validated against SIZE_OPTIONS in the
-- API layer so new labels never require a migration.

ALTER TABLE "customers" ADD COLUMN "usual_size" TEXT;
