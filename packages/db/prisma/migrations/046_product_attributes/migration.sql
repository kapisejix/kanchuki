-- Category/Style/Occasion/Fabric taxonomy expansion (2026-08-07), ladies-only
-- today with MEN/KIDS ready via the new `segment` column (zero schema change
-- to add them later, just new rows).
--
-- 1. ProductSegment (LADIES/MEN/KIDS) + ProductAttributeKind (STYLE/OCCASION/FABRIC) enums.
-- 2. `segment` column on default_product_categories/product_categories.
-- 3. Generic DefaultProductAttribute/ProductAttribute tables covering Style/Occasion/Fabric
--    (one pair instead of three near-duplicate Category-style tables).
-- 4. Replace the F-024 default_product_categories seed with the retailer's new
--    10-item Shop-By-Categories list. Forward-only, same precedent as migration
--    045 — existing retailers keep their already-copied product_categories rows.
-- 5. Seed Style/Occasion/Fabric defaults + backfill every existing retailer
--    with zero rows per kind (mirrors 045's category backfill).
-- 6. products gains styles/fabrics array columns (AI-detected + retailer-picked,
--    soft-matched against product_attributes by name, no FK — same convention
--    the pre-existing `occasions` column already used).

CREATE TYPE "ProductSegment" AS ENUM ('LADIES', 'MEN', 'KIDS');
CREATE TYPE "ProductAttributeKind" AS ENUM ('STYLE', 'OCCASION', 'FABRIC');

ALTER TABLE "default_product_categories" ADD COLUMN "segment" "ProductSegment" NOT NULL DEFAULT 'LADIES';
ALTER TABLE "product_categories" ADD COLUMN "segment" "ProductSegment" NOT NULL DEFAULT 'LADIES';

-- Replace the default category template (forward-only — only affects NEW
-- retailer signups from here on).
DELETE FROM "default_product_categories";
INSERT INTO "default_product_categories" ("id", "name", "segment", "sort_order", "is_active") VALUES
  (gen_random_uuid()::text, 'New Arrivals', 'LADIES', 1, true),
  (gen_random_uuid()::text, 'Sarees', 'LADIES', 2, true),
  (gen_random_uuid()::text, 'Salwar Suits', 'LADIES', 3, true),
  (gen_random_uuid()::text, 'Kurtis', 'LADIES', 4, true),
  (gen_random_uuid()::text, 'Tops & Tunics', 'LADIES', 5, true),
  (gen_random_uuid()::text, 'Dresses', 'LADIES', 6, true),
  (gen_random_uuid()::text, 'Co-ords', 'LADIES', 7, true),
  (gen_random_uuid()::text, 'LUXE', 'LADIES', 8, true),
  (gen_random_uuid()::text, 'Woolen', 'LADIES', 9, true),
  (gen_random_uuid()::text, 'Sale', 'LADIES', 10, true);

CREATE TABLE "default_product_attributes" (
    "id" TEXT NOT NULL,
    "kind" "ProductAttributeKind" NOT NULL,
    "segment" "ProductSegment" NOT NULL DEFAULT 'LADIES',
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "default_product_attributes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "default_product_attributes_kind_segment_name_key" ON "default_product_attributes"("kind", "segment", "name");

CREATE TABLE "product_attributes" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "kind" "ProductAttributeKind" NOT NULL,
    "segment" "ProductSegment" NOT NULL DEFAULT 'LADIES',
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_attributes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "product_attributes_retailer_id_kind_name_key" ON "product_attributes"("retailer_id", "kind", "name");
CREATE INDEX "product_attributes_retailer_id_kind_idx" ON "product_attributes"("retailer_id", "kind");
ALTER TABLE "product_attributes" ADD CONSTRAINT "product_attributes_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed Style / Occasion / Fabric defaults (all LADIES segment, exact list requested).
INSERT INTO "default_product_attributes" ("id", "kind", "segment", "name", "sort_order", "is_active") VALUES
  (gen_random_uuid()::text, 'STYLE', 'LADIES', 'Sharara Suits', 1, true),
  (gen_random_uuid()::text, 'STYLE', 'LADIES', 'Anarkali Suits', 2, true),
  (gen_random_uuid()::text, 'STYLE', 'LADIES', 'Palazzo Suits', 3, true),
  (gen_random_uuid()::text, 'STYLE', 'LADIES', 'Patiala Suits', 4, true),
  (gen_random_uuid()::text, 'STYLE', 'LADIES', 'Pakistani Suits', 5, true),
  (gen_random_uuid()::text, 'STYLE', 'LADIES', 'Straight Cut Suits', 6, true),
  (gen_random_uuid()::text, 'STYLE', 'LADIES', 'Indo Western', 7, true),
  (gen_random_uuid()::text, 'STYLE', 'LADIES', 'Unstitched Salwar Suits', 8, true),
  (gen_random_uuid()::text, 'STYLE', 'LADIES', 'Readymade Salwar Suits', 9, true),

  (gen_random_uuid()::text, 'OCCASION', 'LADIES', 'Bridal', 1, true),
  (gen_random_uuid()::text, 'OCCASION', 'LADIES', 'Casual / Daily', 2, true),
  (gen_random_uuid()::text, 'OCCASION', 'LADIES', 'Engagement', 3, true),
  (gen_random_uuid()::text, 'OCCASION', 'LADIES', 'Festive', 4, true),
  (gen_random_uuid()::text, 'OCCASION', 'LADIES', 'Haldi', 5, true),
  (gen_random_uuid()::text, 'OCCASION', 'LADIES', 'Mehendi', 6, true),
  (gen_random_uuid()::text, 'OCCASION', 'LADIES', 'Office Wear', 7, true),
  (gen_random_uuid()::text, 'OCCASION', 'LADIES', 'Party', 8, true),
  (gen_random_uuid()::text, 'OCCASION', 'LADIES', 'Reception', 9, true),
  (gen_random_uuid()::text, 'OCCASION', 'LADIES', 'Sangeet', 10, true),
  (gen_random_uuid()::text, 'OCCASION', 'LADIES', 'Wedding', 11, true),

  (gen_random_uuid()::text, 'FABRIC', 'LADIES', 'Rayon', 1, true),
  (gen_random_uuid()::text, 'FABRIC', 'LADIES', 'Cotton', 2, true),
  (gen_random_uuid()::text, 'FABRIC', 'LADIES', 'Georgette', 3, true),
  (gen_random_uuid()::text, 'FABRIC', 'LADIES', 'Crepe', 4, true),
  (gen_random_uuid()::text, 'FABRIC', 'LADIES', 'Chiffon', 5, true),
  (gen_random_uuid()::text, 'FABRIC', 'LADIES', 'Organza', 6, true),
  (gen_random_uuid()::text, 'FABRIC', 'LADIES', 'Bhagalpuri Silk', 7, true),
  (gen_random_uuid()::text, 'FABRIC', 'LADIES', 'Banarasi', 8, true),
  (gen_random_uuid()::text, 'FABRIC', 'LADIES', 'Chanderi', 9, true),
  (gen_random_uuid()::text, 'FABRIC', 'LADIES', 'Jacquard', 10, true),
  (gen_random_uuid()::text, 'FABRIC', 'LADIES', 'Tapetta Silk', 11, true),
  (gen_random_uuid()::text, 'FABRIC', 'LADIES', 'Tussar Silk', 12, true),
  (gen_random_uuid()::text, 'FABRIC', 'LADIES', 'Net', 13, true);

-- Backfill: every existing retailer gets the full default attribute set per
-- kind (same one-off pattern as migration 045's category backfill) — only
-- NEW retailers get seeded by the app at signup from here on.
INSERT INTO "product_attributes" ("id", "retailer_id", "kind", "segment", "name", "sort_order", "created_at", "updated_at")
SELECT gen_random_uuid()::text, r."id", d."kind", d."segment", d."name", d."sort_order", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "retailers" r
CROSS JOIN "default_product_attributes" d
WHERE d."is_active" = true
  AND r."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "product_attributes" pa WHERE pa."retailer_id" = r."id" AND pa."kind" = d."kind"
  );

ALTER TABLE "products" ADD COLUMN "styles" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "products" ADD COLUMN "fabrics" TEXT[] NOT NULL DEFAULT '{}';
