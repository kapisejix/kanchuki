import { prisma } from '@kanchuki/db';
import type { QuotaPeriod, QuotaResourceType } from '@kanchuki/db';
import { planLimitExceeded } from '../plugins/error-handler.js';

// F-010 (docs/PRO-REQUIREMENTS.md): one gate + one counter for every metered
// resource instead of a hardcoded column per resource. Call checkQuota before
// the metered action runs, incrementUsage after it succeeds.

function periodStart(period: QuotaPeriod, now = new Date()): Date {
  if (period === 'DAY') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'MONTH') return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(0); // LIFETIME — one counter row forever
}

async function effectiveLimit(
  retailerId: string,
  resourceType: QuotaResourceType,
): Promise<{ limit: number; period: QuotaPeriod } | null> {
  const override = await prisma.retailerLimitOverride.findUnique({
    where: { retailer_id_resource_type: { retailer_id: retailerId, resource_type: resourceType } },
  });
  if (override) return { limit: override.limit_per_period, period: override.period };

  const retailer = await prisma.retailer.findUniqueOrThrow({
    where: { id: retailerId },
    select: { plan: true },
  });
  const planLimit = await prisma.planLimit.findUnique({
    where: { plan_resource_type: { plan: retailer.plan, resource_type: resourceType } },
  });
  // ponytail: plan_limits has no seed rows yet (business numbers not decided
  // for AI_TAGGING_CALL/IMAGE_CROP/BG_REMOVAL/API_REQUEST) — fail-open until
  // an admin adds a row, instead of blocking every retailer on every call.
  if (!planLimit) return null;
  return { limit: planLimit.limit_per_period, period: planLimit.period };
}

export async function checkQuota(
  retailerId: string,
  resourceType: QuotaResourceType,
  amount = 1,
): Promise<void> {
  const effective = await effectiveLimit(retailerId, resourceType);
  if (!effective || effective.limit === -1) return; // unlimited, or not yet configured

  const counter = await prisma.usageCounter.findUnique({
    where: {
      retailer_id_resource_type_period_start: {
        retailer_id: retailerId,
        resource_type: resourceType,
        period_start: periodStart(effective.period),
      },
    },
  });
  const used = counter?.count ?? 0;
  if (used + amount > effective.limit) {
    throw planLimitExceeded(resourceType.toLowerCase().replace(/_/g, ' '));
  }
}

// ponytail: checkQuota + incrementUsage are two separate calls (not one
// transaction), so two concurrent requests can both pass the check before
// either increments — same race the existing try_on_credits decrement
// already accepts (apps/api/src/routes/tryon.ts). Fine for a billing quota;
// revisit with a DB-level constraint if overshoot ever matters financially.
export async function incrementUsage(
  retailerId: string,
  resourceType: QuotaResourceType,
  amount = 1,
): Promise<void> {
  const effective = await effectiveLimit(retailerId, resourceType);
  const start = periodStart(effective?.period ?? 'MONTH');

  await prisma.usageCounter.upsert({
    where: {
      retailer_id_resource_type_period_start: {
        retailer_id: retailerId,
        resource_type: resourceType,
        period_start: start,
      },
    },
    create: {
      retailer_id: retailerId,
      resource_type: resourceType,
      period_start: start,
      count: amount,
    },
    update: { count: { increment: amount } },
  });
}

export interface QuotaStatusResult {
  used: number;
  limit: number;
  remaining: number;
  period: QuotaPeriod;
  unlimited: boolean;
}

export async function getQuotaStatus(
  retailerId: string,
  resourceType: QuotaResourceType,
): Promise<QuotaStatusResult> {
  const effective = await effectiveLimit(retailerId, resourceType);
  if (!effective || effective.limit === -1) {
    // If not explicitly configured yet, default to standard tier limits (Growth: 30, Pro: 100)
    const retailer = await prisma.retailer.findUnique({
      where: { id: retailerId },
      select: { plan: true },
    });
    const defaultLimit = retailer?.plan === 'PRO' ? 100 : retailer?.plan === 'GROWTH' ? 30 : 0;
    return {
      used: 0,
      limit: defaultLimit,
      remaining: defaultLimit,
      period: 'MONTH',
      unlimited: defaultLimit === 0 && retailer?.plan !== 'STARTER',
    };
  }

  const counter = await prisma.usageCounter.findUnique({
    where: {
      retailer_id_resource_type_period_start: {
        retailer_id: retailerId,
        resource_type: resourceType,
        period_start: periodStart(effective.period),
      },
    },
  });
  const used = counter?.count ?? 0;
  const remaining = Math.max(0, effective.limit - used);
  return {
    used,
    limit: effective.limit,
    remaining,
    period: effective.period,
    unlimited: false,
  };
}
