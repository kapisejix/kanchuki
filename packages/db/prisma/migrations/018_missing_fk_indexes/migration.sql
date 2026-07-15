-- Migration: missing_fk_indexes
-- Supabase perf lint (unindexed_foreign_keys): 7 FK columns had no covering
-- index, forcing a seq scan on the referenced side of every join/cascade
-- check. CREATE INDEX IF NOT EXISTS is naturally idempotent.

CREATE INDEX IF NOT EXISTS "collection_products_product_id_idx" ON "collection_products"("product_id");
CREATE INDEX IF NOT EXISTS "collections_customer_id_idx" ON "collections"("customer_id");
CREATE INDEX IF NOT EXISTS "customer_interactions_product_id_idx" ON "customer_interactions"("product_id");
CREATE INDEX IF NOT EXISTS "products_section_id_idx" ON "products"("section_id");
CREATE INDEX IF NOT EXISTS "store_sections_parent_id_idx" ON "store_sections"("parent_id");
CREATE INDEX IF NOT EXISTS "subscription_payments_subscription_id_idx" ON "subscription_payments"("subscription_id");
CREATE INDEX IF NOT EXISTS "try_on_jobs_measurement_id_idx" ON "try_on_jobs"("measurement_id");
