-- Retailer toggle: composite a soft drop shadow under the cutout garment
-- during background removal (cleanupProductPhoto), same on/off pattern as
-- the existing background_image_id picker.

ALTER TABLE "products"
  ADD COLUMN "add_shadow" BOOLEAN NOT NULL DEFAULT false;
