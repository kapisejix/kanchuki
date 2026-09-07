// T3.1 — SHOWCASE_DESIGNS upload cap (docs/tasks/suits-designs.md §14.2).
//
// Unlike the usageCounter-style metered resources (F-010's checkQuota/
// incrementUsage — a counter that only ever goes up), Suits Designs cap is a
// LIVE ACTIVE-COUNT: deleting a design or toggling it inactive frees a slot.
// So the limit row (plan_limits, period LIFETIME) is read directly and the
// "used" number is a COUNT of the retailer's active rows — never a counter.
// Same effectiveLimit shape as apps/api/src/lib/quota.ts (retailer override →
// plan limit → fail-open when unconfigured / -1 = unlimited).

import { prisma } from '@kanchuki/db';
import type { QuotaResourceType } from '@kanchuki/db';
import { planLimitExceeded } from '../plugins/error-handler.js';

const RESOURCE_TYPE: QuotaResourceType = 'SHOWCASE_DESIGNS';

async function showcaseLimit(retailerId: string): Promise<{ limit: number } | null> {
  const override = await prisma.retailerLimitOverride.findUnique({
    where: {
      retailer_id_resource_type: { retailer_id: retailerId, resource_type: RESOURCE_TYPE },
    },
  });
  if (override) return { limit: override.limit_per_period };

  const retailer = await prisma.retailer.findUniqueOrThrow({
    where: { id: retailerId },
    select: { plan: true },
  });
  const planLimit = await prisma.planLimit.findUnique({
    where: {
      plan_resource_type: { plan: retailer.plan, resource_type: RESOURCE_TYPE },
    },
  });
  // Fail-open until an admin adds/limits the row (same as quota.ts). 095 seeds
  // all three paid plans, so this only bites TRIAL/DEMO retailers.
  if (!planLimit) return null;
  return { limit: planLimit.limit_per_period };
}

function isUnlimited(limit: number): boolean {
  return limit === -1;
}

/** Live active-design count for a retailer (delete/inactive frees a slot). */
export async function countActiveShowcaseDesigns(retailerId: string): Promise<number> {
  return prisma.showcaseDesign.count({
    where: { retailer_id: retailerId, is_active: true },
  });
}

export interface ShowcaseUsage {
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
}

export async function getShowcaseUsage(retailerId: string): Promise<ShowcaseUsage> {
  const effective = await showcaseLimit(retailerId);
  if (!effective || isUnlimited(effective.limit)) {
    return { used: 0, limit: -1, remaining: Number.POSITIVE_INFINITY, unlimited: true };
  }
  const used = await countActiveShowcaseDesigns(retailerId);
  return {
    used,
    limit: effective.limit,
    remaining: Math.max(0, effective.limit - used),
    unlimited: false,
  };
}

/** Throw 402 (PLAN_LIMIT_EXCEEDED) when the retailer is at their design cap. */
export async function assertShowcaseQuota(retailerId: string): Promise<void> {
  const usage = await getShowcaseUsage(retailerId);
  if (!usage.unlimited && usage.remaining <= 0) {
    throw planLimitExceeded('Suits Designs');
  }
}
