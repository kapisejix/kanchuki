-- Drop annual_paise from plan_pricing — monthly-only billing.
-- Column is no longer written to (billing.ts, admin-plans.ts updated).
-- Applied via admin dashboard with approval (CLAUDE.md operational policy).
ALTER TABLE "plan_pricing" DROP COLUMN IF EXISTS "annual_paise";
