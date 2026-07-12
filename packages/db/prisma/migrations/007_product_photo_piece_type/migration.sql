-- Migration: add_product_photo_piece_type
-- Lets a retailer tag a product photo as the "upper" or "lower" piece of a
-- multi-piece outfit (kameez+salwar, kurta+pajama, choli+skirt) so try-on can
-- chain two CatVTON calls instead of masking the whole body from one photo.
-- See PRO-REQUIREMENTS.md F-102, packages/ai/src/tryon.ts.
-- No RLS change needed — product_photos RLS already applied in 001_pgvector_indexes.

ALTER TABLE "product_photos" ADD COLUMN "piece_type" TEXT;
