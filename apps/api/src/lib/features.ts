import { prisma } from '@kanchuki/db';
import type { PlanFeatureKey, SubscriptionPlan } from '@kanchuki/db';

/**
 * F-013: Check if a feature is enabled for a retailer's current plan.
 *
 * **Fails CLOSED** — the opposite of checkQuota()'s fail-open behavior:
 * a missing PlanFeature row means the feature is OFF by default.
 * This ensures a newly shipped feature is disabled everywhere until an
 * admin explicitly enables it via the plan-features admin grid.
 */
export async function hasFeature(retailerId: string, featureKey: PlanFeatureKey): Promise<boolean> {
  const retailer = await prisma.retailer.findUniqueOrThrow({
    where: { id: retailerId },
    select: { plan: true },
  });

  return hasFeatureForPlan(retailer.plan, featureKey);
}

/**
 * Check if a feature is enabled for a specific plan tier directly,
 * without needing a retailer ID. Used by plan-level gating logic.
 */
export async function hasFeatureForPlan(
  plan: SubscriptionPlan,
  featureKey: PlanFeatureKey,
): Promise<boolean> {
  const row = await prisma.planFeature.findUnique({
    where: { plan_feature_key: { plan, feature_key: featureKey } },
  });

  // Fails closed: no row = feature OFF (safe default).
  // Admin must explicitly add a row via the plan-features admin grid.
  return row?.enabled ?? false;
}

/**
 * Get all enabled features for a retailer's plan.
 * Useful for returning a "plan capabilities" object to the frontend.
 */
export async function getEnabledFeatures(retailerId: string): Promise<PlanFeatureKey[]> {
  const retailer = await prisma.retailer.findUniqueOrThrow({
    where: { id: retailerId },
    select: { plan: true },
  });

  const rows = await prisma.planFeature.findMany({
    where: { plan: retailer.plan, enabled: true },
    select: { feature_key: true },
  });

  return rows.map((r: { feature_key: PlanFeatureKey }) => r.feature_key);
}

/**
 * Toggle a feature ON or OFF for a plan tier.
 * Creates the row if it doesn't exist yet. Returns the updated row.
 * Audit-logging is handled by the calling route.
 */
export async function setFeature(
  plan: SubscriptionPlan,
  featureKey: PlanFeatureKey,
  enabled: boolean,
  updatedById?: string,
) {
  return prisma.planFeature.upsert({
    where: { plan_feature_key: { plan, feature_key: featureKey } },
    create: { plan, feature_key: featureKey, enabled, updated_by_id: updatedById },
    update: { enabled, updated_by_id: updatedById },
  });
}
