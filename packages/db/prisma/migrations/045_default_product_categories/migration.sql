-- F-024 (2026-08-04): DB-backed default "Shop By Categories" template +
-- AI auto-category-assignment support.
--
-- 1. New admin-editable global template table (DefaultProductCategory).
-- 2. Seed the 13 garment-type defaults (NOT "New Arrivals"/"Sale" — those
--    are date/price-derived virtual filters computed at query time, they
--    can't be seen in a photo, see PRO-REQUIREMENTS.md §14 Option A).
-- 3. Backfill: copy the template into every EXISTING retailer that has zero
--    ProductCategory rows so nobody regresses (new signups get seeded by the
--    app at onboarding).

CREATE TABLE "default_product_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "default_product_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "default_product_categories_name_key" ON "default_product_categories"("name");

-- Seed the template (13 garment types — New Arrivals/Sale are virtual filters)
INSERT INTO "default_product_categories" ("id", "name", "sort_order", "is_active") VALUES
  (gen_random_uuid()::text, 'Kurta Sets', 1, true),
  (gen_random_uuid()::text, 'Salwar Suits', 2, true),
  (gen_random_uuid()::text, 'Short Kurtis', 3, true),
  (gen_random_uuid()::text, 'Kurta', 4, true),
  (gen_random_uuid()::text, 'Co-ords', 5, true),
  (gen_random_uuid()::text, 'Plus Sizes', 6, true),
  (gen_random_uuid()::text, 'Dresses', 7, true),
  (gen_random_uuid()::text, 'Bottoms', 8, true),
  (gen_random_uuid()::text, 'Lehengas', 9, true),
  (gen_random_uuid()::text, 'Loungewear', 10, true),
  (gen_random_uuid()::text, 'Sarees', 11, true),
  (gen_random_uuid()::text, 'Shirts for Women', 12, true),
  (gen_random_uuid()::text, 'Tops for Women', 13, true);

-- Backfill for existing retailers with zero categories (F-024, one-off).
INSERT INTO "product_categories" ("id", "retailer_id", "name", "sort_order", "created_at", "updated_at")
SELECT gen_random_uuid()::text, r."id", d."name", d."sort_order", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "retailers" r
CROSS JOIN "default_product_categories" d
WHERE d."is_active" = true
  AND r."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "product_categories" pc WHERE pc."retailer_id" = r."id"
  );
