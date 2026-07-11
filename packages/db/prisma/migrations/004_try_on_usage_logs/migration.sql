-- Migration: add_try_on_usage_logs
-- Creates TryOnSource enum and TryOnUsageLog table for per-retailer GPU cost tracking.

-- CreateEnum
CREATE TYPE "TryOnSource" AS ENUM ('IN_STORE', 'REMOTE');

-- CreateTable
CREATE TABLE "try_on_usage_logs" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "try_on_job_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "cost_usd" DOUBLE PRECISION NOT NULL,
    "source" "TryOnSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "try_on_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "try_on_usage_logs_retailer_id_idx" ON "try_on_usage_logs"("retailer_id");
CREATE INDEX "try_on_usage_logs_retailer_id_created_at_idx" ON "try_on_usage_logs"("retailer_id", "created_at");
CREATE INDEX "try_on_usage_logs_created_at_idx" ON "try_on_usage_logs"("created_at");

-- AddForeignKey
ALTER TABLE "try_on_usage_logs" ADD CONSTRAINT "try_on_usage_logs_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
