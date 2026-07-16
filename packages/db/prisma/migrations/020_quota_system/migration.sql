-- Migration: quota_system
-- F-010 (docs/PRO-REQUIREMENTS.md): admin-configurable limits per plan/resource,
-- per-retailer overrides, a rolling usage counter checked before every metered
-- action, and self-serve overage purchases. Generalizes the 3 hardcoded columns
-- on retailers (max_products, max_customers, try_on_credits) to any resource
-- type without further schema changes.

-- CreateEnum
CREATE TYPE "QuotaResourceType" AS ENUM ('PRODUCT_UPLOAD', 'AI_TAGGING_CALL', 'TRY_ON', 'IMAGE_CROP', 'BG_REMOVAL', 'API_REQUEST');
CREATE TYPE "QuotaPeriod" AS ENUM ('DAY', 'MONTH', 'LIFETIME');
CREATE TYPE "QuotaAddonStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "plan_limits" (
    "id" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "resource_type" "QuotaResourceType" NOT NULL,
    "limit_per_period" INTEGER NOT NULL,
    "period" "QuotaPeriod" NOT NULL DEFAULT 'MONTH',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retailer_limit_overrides" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "resource_type" "QuotaResourceType" NOT NULL,
    "limit_per_period" INTEGER NOT NULL,
    "period" "QuotaPeriod" NOT NULL DEFAULT 'MONTH',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retailer_limit_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_counters" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "resource_type" "QuotaResourceType" NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_addon_purchases" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "resource_type" "QuotaResourceType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount_inr" INTEGER NOT NULL,
    "status" "QuotaAddonStatus" NOT NULL DEFAULT 'PENDING',
    "razorpay_order_id" TEXT,
    "razorpay_payment_id" TEXT,
    "gst_amount" INTEGER,
    "gst_invoice_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "quota_addon_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_limits_plan_resource_type_key" ON "plan_limits"("plan", "resource_type");

-- CreateIndex
CREATE INDEX "retailer_limit_overrides_retailer_id_idx" ON "retailer_limit_overrides"("retailer_id");
CREATE UNIQUE INDEX "retailer_limit_overrides_retailer_id_resource_type_key" ON "retailer_limit_overrides"("retailer_id", "resource_type");

-- CreateIndex
CREATE INDEX "usage_counters_retailer_id_idx" ON "usage_counters"("retailer_id");
CREATE UNIQUE INDEX "usage_counters_retailer_id_resource_type_period_start_key" ON "usage_counters"("retailer_id", "resource_type", "period_start");

-- CreateIndex
CREATE INDEX "quota_addon_purchases_retailer_id_idx" ON "quota_addon_purchases"("retailer_id");
CREATE INDEX "quota_addon_purchases_retailer_id_created_at_idx" ON "quota_addon_purchases"("retailer_id", "created_at");

-- AddForeignKey
ALTER TABLE "retailer_limit_overrides" ADD CONSTRAINT "retailer_limit_overrides_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quota_addon_purchases" ADD CONSTRAINT "quota_addon_purchases_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS
-- plan_limits is global admin config (no retailer_id column) — same pattern as
-- team_members/territories (014_internal_team): RLS enabled, no policy, so it's
-- deny-all to the `authenticated` role. Only the backend service-role key
-- (bypasses RLS) reads/writes it, from the admin panel.
ALTER TABLE "plan_limits" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "retailer_limit_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usage_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quota_addon_purchases" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retailer_own_retailer_limit_overrides" ON "retailer_limit_overrides"
  FOR ALL TO authenticated
  USING (retailer_id IN (SELECT r.id FROM retailers r WHERE r.auth_user_id = ((select auth.uid()))::text));

CREATE POLICY "retailer_own_usage_counters" ON "usage_counters"
  FOR ALL TO authenticated
  USING (retailer_id IN (SELECT r.id FROM retailers r WHERE r.auth_user_id = ((select auth.uid()))::text));

CREATE POLICY "retailer_own_quota_addon_purchases" ON "quota_addon_purchases"
  FOR ALL TO authenticated
  USING (retailer_id IN (SELECT r.id FROM retailers r WHERE r.auth_user_id = ((select auth.uid()))::text));
