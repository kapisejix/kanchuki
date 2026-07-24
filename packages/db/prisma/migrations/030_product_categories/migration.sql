-- Migration: product_categories
-- Retailer-curated merchandising group (name + cover image) — distinct from
-- the free-text Product.category AI tag. Drives the customer-facing
-- "browse by category" screen after storefront signup.

-- CreateTable
CREATE TABLE "product_categories" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image_url" TEXT,
    "image_r2_key" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_categories_retailer_id_name_key" ON "product_categories"("retailer_id", "name");
CREATE INDEX "product_categories_retailer_id_idx" ON "product_categories"("retailer_id");

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "category_id" TEXT;

CREATE INDEX "products_retailer_id_category_id_idx" ON "products"("retailer_id", "category_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS (retailer isolation, matches product_spin_frames in 026_product_spin_frames)
ALTER TABLE "product_categories" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retailer_own_product_categories" ON "product_categories"
  FOR ALL TO authenticated
  USING (retailer_id IN (SELECT id FROM retailers WHERE auth_user_id = (select auth.uid())::text));
