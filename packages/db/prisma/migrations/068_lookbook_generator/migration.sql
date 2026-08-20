-- AlterEnum: Add LOOKBOOK_GENERATOR to PlanFeatureKey
ALTER TYPE "PlanFeatureKey" ADD VALUE IF NOT EXISTS 'LOOKBOOK_GENERATOR';

-- CreateEnum
CREATE TYPE "LookbookFormat" AS ENUM ('CAROUSEL', 'GRID', 'EDITORIAL', 'PDF');

-- CreateEnum
CREATE TYPE "LookbookStatus" AS ENUM ('DRAFT', 'GENERATING', 'READY', 'FAILED');

-- CreateTable: Lookbook Generator
CREATE TABLE "lookbooks" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cover_url" TEXT,
    "format" "LookbookFormat" NOT NULL DEFAULT 'CAROUSEL',
    "status" "LookbookStatus" NOT NULL DEFAULT 'DRAFT',
    "product_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "output_url" TEXT,
    "output_r2_key" TEXT,
    "thumbnail_url" TEXT,
    "share_url" TEXT,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "share_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lookbooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lookbooks_retailer_id_idx" ON "lookbooks"("retailer_id");

-- CreateIndex
CREATE INDEX "lookbooks_status_idx" ON "lookbooks"("status");

-- AddForeignKey
ALTER TABLE "lookbooks" ADD CONSTRAINT "lookbooks_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
