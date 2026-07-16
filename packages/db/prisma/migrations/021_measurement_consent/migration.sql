-- Retailer captures the customer's measurement photos in-app (F-102c) —
-- track that the customer consented before those photos were taken.
-- Manual (inch-tape) measurements have no photo, so consent stays false there.
ALTER TABLE "customer_measurements" ADD COLUMN IF NOT EXISTS "consent_given" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "customer_measurements" ADD COLUMN IF NOT EXISTS "consent_at" TIMESTAMP(3);
