-- AI tagging expansion: garment subtype, auto-generated SKU, auto-generated
-- short description. `name` already existed but was never populated by the
-- tagger — now sits alongside these as one AI-generated record.

ALTER TABLE "products" ADD COLUMN "sku" TEXT;
ALTER TABLE "products" ADD COLUMN "description" TEXT;
ALTER TABLE "products" ADD COLUMN "subtype" TEXT;

CREATE UNIQUE INDEX "products_retailer_id_sku_key" ON "products"("retailer_id", "sku");
CREATE INDEX "products_retailer_id_subtype_idx" ON "products"("retailer_id", "subtype");
