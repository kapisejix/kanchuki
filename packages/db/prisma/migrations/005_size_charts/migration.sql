-- Migration: add_size_charts
-- Creates SizeChartCategory enum plus SizeChart/SizeChartRow tables for F-102c
-- (retailer size-chart lookup, no GPU cost — see docs/PRO-REQUIREMENTS.md F-102c).

-- CreateEnum
CREATE TYPE "SizeChartCategory" AS ENUM ('UPPER', 'LOWER');

-- CreateTable
CREATE TABLE "size_charts" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "category" "SizeChartCategory" NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "size_charts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "size_chart_rows" (
    "id" TEXT NOT NULL,
    "size_chart_id" TEXT NOT NULL,
    "size_label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "bust_min_cm" DOUBLE PRECISION,
    "bust_max_cm" DOUBLE PRECISION,
    "waist_min_cm" DOUBLE PRECISION,
    "waist_max_cm" DOUBLE PRECISION,
    "hip_min_cm" DOUBLE PRECISION,
    "hip_max_cm" DOUBLE PRECISION,
    "length_min_cm" DOUBLE PRECISION,
    "length_max_cm" DOUBLE PRECISION,

    CONSTRAINT "size_chart_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "size_charts_retailer_id_idx" ON "size_charts"("retailer_id");
CREATE UNIQUE INDEX "size_charts_retailer_id_category_key" ON "size_charts"("retailer_id", "category");

-- CreateIndex
CREATE INDEX "size_chart_rows_size_chart_id_idx" ON "size_chart_rows"("size_chart_id");
CREATE UNIQUE INDEX "size_chart_rows_size_chart_id_size_label_key" ON "size_chart_rows"("size_chart_id", "size_label");

-- AddForeignKey
ALTER TABLE "size_charts" ADD CONSTRAINT "size_charts_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "size_chart_rows" ADD CONSTRAINT "size_chart_rows_size_chart_id_fkey" FOREIGN KEY ("size_chart_id") REFERENCES "size_charts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
