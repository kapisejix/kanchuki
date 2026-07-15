-- Migration: product_photo_phash
-- F-001d guided bulk onboarding: perceptual-hash column used to flag likely
-- duplicate crops (same rack shot twice, or already present via a supplier
-- PDF import) during bulk review. Non-blocking — retailer can still save.
-- No RLS change needed — RLS was enabled on product_photos in 001_pgvector_indexes,
-- policy content added later in 016_unbuilt_feature_rls_policies; a nullable
-- ADD COLUMN doesn't touch either.

ALTER TABLE "product_photos" ADD COLUMN "phash" TEXT;

-- flagDuplicates() (apps/api/src/routes/catalog-import.ts) queries every
-- phash-tagged photo for a retailer on each detect/import call — without an
-- index this is a seq scan, which is exactly what F-001d (500-3000+ SKU
-- stores) will hit hardest.
CREATE INDEX IF NOT EXISTS "idx_product_photos_retailer_phash"
  ON "product_photos" ("retailer_id")
  WHERE "phash" IS NOT NULL;
