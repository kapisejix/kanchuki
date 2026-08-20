-- AlterEnum: Add FESTIVAL_BACKGROUNDS to PlanFeatureKey
ALTER TYPE "PlanFeatureKey" ADD VALUE IF NOT EXISTS 'FESTIVAL_BACKGROUNDS';

-- CreateTable: Festival Background Library
CREATE TABLE "festival_backgrounds" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT NOT NULL,
    "image_r2_key" TEXT,
    "thumbnail_url" TEXT,
    "occasion" TEXT NOT NULL,
    "season" TEXT,
    "region" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "festival_backgrounds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "festival_backgrounds_retailer_id_idx" ON "festival_backgrounds"("retailer_id");

-- CreateIndex
CREATE INDEX "festival_backgrounds_occasion_idx" ON "festival_backgrounds"("occasion");

-- CreateIndex
CREATE INDEX "festival_backgrounds_is_active_valid_from_valid_to_idx" ON "festival_backgrounds"("is_active", "valid_from", "valid_to");

-- AddForeignKey
ALTER TABLE "festival_backgrounds" ADD CONSTRAINT "festival_backgrounds_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
