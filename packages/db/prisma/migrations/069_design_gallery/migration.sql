-- CreateEnum
CREATE TYPE "DesignCategory" AS ENUM ('NECKLINE', 'BLOUSE_BACK', 'SLEEVE', 'SALWAR', 'SILHOUETTE');

-- CreateTable
CREATE TABLE "design_references" (
    "id" TEXT NOT NULL,
    "category" "DesignCategory" NOT NULL,
    "option" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "r2_key" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "design_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "design_references_category_idx" ON "design_references"("category");

-- CreateIndex
CREATE INDEX "design_references_category_is_active_idx" ON "design_references"("category", "is_active");
