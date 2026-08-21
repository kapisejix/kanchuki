-- FLUX Kontext (F-032 Studio Shoot) per-plan-tier quota + DB-driven plan
-- pricing, both admin-editable from /admin (plan-limits reuses the existing
-- F-010 PlanLimit UI; pricing gets its own small table).
--
-- No PlanLimit seed rows for STUDIO_SHOOT are inserted here — checkQuota()
-- fails open on a missing row (same convention as the other unseeded
-- resource types), so this ships with no cap until an admin sets one.

ALTER TYPE "QuotaResourceType" ADD VALUE 'STUDIO_SHOOT';

CREATE TABLE "plan_pricing" (
    "id" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "monthly_paise" INTEGER NOT NULL,
    "annual_paise" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_pricing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plan_pricing_plan_key" ON "plan_pricing"("plan");

-- Seed with the current hardcoded PLAN_PRICING values so nothing changes
-- until an admin edits a row.
INSERT INTO "plan_pricing" ("id", "plan", "monthly_paise", "annual_paise", "updated_at") VALUES
  ('plan_pricing_starter', 'STARTER', 99900, 999900, now()),
  ('plan_pricing_growth', 'GROWTH', 249900, 2499900, now()),
  ('plan_pricing_pro', 'PRO', 499900, 4999900, now());
