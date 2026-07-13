-- Add r2_key column to product_variants for presigned URL fallback
ALTER TABLE "product_variants" ADD COLUMN "r2_key" TEXT;
