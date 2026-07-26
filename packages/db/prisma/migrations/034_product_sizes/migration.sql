-- Migration: product_sizes
-- Retailer-selected sizes (S, M, L, XL, XXL, XXXL) available per product.

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "sizes" TEXT[] NOT NULL DEFAULT '{}';
