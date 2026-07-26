-- Migration: product_photo_metadata
-- F-001e: adds a flexible metadata JSON column to product_photos for storing
-- ghost-mannequin generation provenance (provider name, generated_at timestamp,
-- original photo URL on failure, etc.). JSON allows future expansion without
-- schema changes.

ALTER TABLE "product_photos"
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;
