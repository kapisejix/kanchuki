-- WhatsApp Native Catalog Sync (Phase II)
-- Adds catalog item tracking and sync logs for WhatsApp Business native catalog

-- Enum for catalog sync status
CREATE TYPE "CatalogSyncStatus" AS ENUM ('SUCCESS', 'FAILED', 'PARTIAL', 'IN_PROGRESS');

-- Add WhatsApp catalog fields to retailers
ALTER TABLE "retailers" 
ADD COLUMN "whatsapp_catalog_id" TEXT,
ADD COLUMN "sync_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sync_categories" TEXT[] NOT NULL DEFAULT '{}',
ADD COLUMN "last_synced_at" TIMESTAMPTZ;

-- Add WhatsApp catalog item ID to products
ALTER TABLE "products" 
ADD COLUMN "whatsapp_catalog_item_id" TEXT;

-- Create catalog_items table
CREATE TABLE "catalog_items" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "retailer_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "whatsapp_catalog_item_id" TEXT NOT NULL,
    "whatsapp_catalog_id" TEXT NOT NULL,
    "status" "CatalogSyncStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "last_synced_at" TIMESTAMPTZ,
    "error_message" TEXT,
    "product_name_snapshot" TEXT NOT NULL,
    "product_price_paise" INTEGER NOT NULL,
    "product_status_snapshot" TEXT NOT NULL,
    "hsn_code_snapshot" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

-- Create catalog_sync_logs table
CREATE TABLE "catalog_sync_logs" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "retailer_id" TEXT NOT NULL,
    "catalog_item_id" TEXT,
    "operation" TEXT NOT NULL,
    "product_id" TEXT,
    "meta_item_id" TEXT,
    "meta_catalog_id" TEXT,
    "status" "CatalogSyncStatus" NOT NULL,
    "error_message" TEXT,
    "payload_json" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "catalog_sync_logs_pkey" PRIMARY KEY ("id")
);

-- Add unique constraint on product_id (one product = one catalog item per retailer)
CREATE UNIQUE INDEX "catalog_items_product_id_key" ON "catalog_items"("product_id");

-- Add indexes
CREATE INDEX "catalog_items_retailer_id_idx" ON "catalog_items"("retailer_id");
CREATE INDEX "catalog_items_whatsapp_catalog_id_idx" ON "catalog_items"("whatsapp_catalog_id");

CREATE INDEX "catalog_sync_logs_retailer_id_created_at_idx" ON "catalog_sync_logs"("retailer_id", "created_at");
CREATE INDEX "catalog_sync_logs_catalog_item_id_idx" ON "catalog_sync_logs"("catalog_item_id");

-- Add foreign keys
ALTER TABLE "catalog_items" 
ADD CONSTRAINT "catalog_items_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "catalog_items" 
ADD CONSTRAINT "catalog_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "catalog_sync_logs" 
ADD CONSTRAINT "catalog_sync_logs_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add PlanFeatureKey enum value
ALTER TYPE "PlanFeatureKey" ADD VALUE 'WHATSAPP_CATALOG_SYNC';

-- Seed plan_features for WHATSAPP_CATALOG_SYNC
-- Starter=off, Growth=on, Pro=on (matches Phase II roadmap)
INSERT INTO "plan_features" ("plan", "feature_key", "enabled") VALUES
  ('GROWTH', 'WHATSAPP_CATALOG_SYNC', true),
  ('PRO', 'WHATSAPP_CATALOG_SYNC', true);