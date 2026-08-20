-- AlterEnum: Add CHANNEL_SYNC to PlanFeatureKey
ALTER TYPE "PlanFeatureKey" ADD VALUE IF NOT EXISTS 'CHANNEL_SYNC';

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('MEESHO', 'INSTAMOJO', 'GLOAD', 'CRAFTSVILLA', 'FLIPKART', 'AMAZON', 'OTHER');

-- CreateEnum
CREATE TYPE "ChannelSyncStatus" AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'SYNCING', 'ERROR', 'SUSPENDED');

-- CreateTable: Aggregator / Marketplace Sync
CREATE TABLE "channel_syncs" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "status" "ChannelSyncStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "api_key_encrypted" TEXT,
    "api_secret_encrypted" TEXT,
    "auth_token_encrypted" TEXT,
    "webhook_secret" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "last_sync_error" TEXT,
    "products_synced" INTEGER NOT NULL DEFAULT 0,
    "orders_synced" INTEGER NOT NULL DEFAULT 0,
    "channel_shop_id" TEXT,
    "channel_shop_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique per retailer+channel)
CREATE UNIQUE INDEX "channel_syncs_retailer_id_channel_key" ON "channel_syncs"("retailer_id", "channel");

-- CreateIndex
CREATE INDEX "channel_syncs_retailer_id_idx" ON "channel_syncs"("retailer_id");

-- CreateIndex
CREATE INDEX "channel_syncs_channel_idx" ON "channel_syncs"("channel");

-- CreateIndex
CREATE INDEX "channel_syncs_status_idx" ON "channel_syncs"("status");

-- AddForeignKey
ALTER TABLE "channel_syncs" ADD CONSTRAINT "channel_syncs_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
