import { randomUUID } from 'node:crypto';
import { prisma } from '@kanchuki/db';
import type { QuotaPeriod, QuotaResourceType } from '@kanchuki/db';
import { AppError, planLimitExceeded } from '../plugins/error-handler.js';

// F-010 (docs/PRO-REQUIREMENTS.md): one gate + one counter for every metered
// resource instead of a hardcoded column per resource. Call checkQuota before
// the metered action runs, incrementUsage after it succeeds.
//
// F-040 added the customer-side pair below (checkCustomerQuota /
// incrementCustomerUsage): a shopper has no plan, so they get one admin-editable
// number per resource (customer_resource_limits) instead of the per-tier
// plan_limits matrix. A try-on from a passport-logged-in shopper must pass BOTH
// gates — the retailer's monthly cap AND that shopper's own — and the two
// failures are deliberately different error codes so the caller can say which
// one was hit.

export function periodStart(period: QuotaPeriod, now = new Date()): Date {
  if (period === 'DAY') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'MONTH') return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(0); // LIFETIME — one counter row forever
}

export async function effectiveLimit(
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

/**
 * Customer-side twin of `effectiveLimit`: one global admin-editable number per
 * resource (shoppers have no plan), or null when unconfigured. Like the retailer
 * side this fails OPEN — an unseeded resource is "no limit" rather than an
 * outage. Migration 119 seeds TRY_ON_GENERATION so that default is not reachable
 * in practice for a metered GPU call, which is the case where fail-open would
 * cost real money.
 */
async function effectiveCustomerLimit(
  resourceType: QuotaResourceType,
): Promise<{ limit: number; period: QuotaPeriod } | null> {
  const row = await prisma.customerResourceLimit.findUnique({
    where: { resource_type: resourceType },
  });
  if (!row) return null;
  return { limit: row.limit_per_period, period: row.period };
}

/**
 * 402 for a shopper who has spent their allowance.
 *
 * A distinct code from PLAN_LIMIT_EXCEEDED on purpose: that message tells the
 * reader to upgrade their plan, which is meaningless advice to someone who has
 * no plan. It also keeps the two caps distinguishable in the response, which is
 * what T3's route needs to report which limit was reached.
 */
function customerLimitExceeded(
  resourceType: QuotaResourceType,
  limit: number,
  period: QuotaPeriod,
): AppError {
  const resource = resourceType.toLowerCase().replace(/_/g, ' ');
  const periodWord = period === 'DAY' ? 'day' : period === 'LIFETIME' ? 'lifetime' : 'month';
  return new AppError(
    'CUSTOMER_LIMIT_EXCEEDED',
    `You've reached your limit for ${resource} (${limit} per ${periodWord}).`,
    402,
  );
}

export async function checkCustomerQuota(
  customerAccountId: string,
  resourceType: QuotaResourceType,
  amount = 1,
): Promise<void> {
  const effective = await effectiveCustomerLimit(resourceType);
  if (!effective || effective.limit === -1) return; // unlimited, or not yet configured

  const counter = await prisma.customerUsageCounter.findUnique({
    where: {
      customer_account_id_resource_type_period_start: {
        customer_account_id: customerAccountId,
        resource_type: resourceType,
        period_start: periodStart(effective.period),
      },
    },
  });
  const used = counter?.count ?? 0;
  if (used + amount > effective.limit) {
    throw customerLimitExceeded(resourceType, effective.limit, effective.period);
  }
}

export async function incrementCustomerUsage(
  customerAccountId: string,
  resourceType: QuotaResourceType,
  amount = 1,
): Promise<void> {
  const effective = await effectiveCustomerLimit(resourceType);
  const start = periodStart(effective?.period ?? 'MONTH');

  await prisma.customerUsageCounter.upsert({
    where: {
      customer_account_id_resource_type_period_start: {
        customer_account_id: customerAccountId,
        resource_type: resourceType,
        period_start: start,
      },
    },
    create: {
      customer_account_id: customerAccountId,
      resource_type: resourceType,
      period_start: start,
      count: amount,
    },
    update: { count: { increment: amount } },
  });
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
// either increments. Callers whose work runs in the same request use
// reserveQuota (RC-102) instead. Callers that check at enqueue and increment
// in a later job (tryon, studio-shoot, tagging) still have this race, as does
// the customer-side pair below.
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

/**
 * Atomic check-and-take (RC-102). One statement both tests `count + amount <= limit` and bumps
 * the counter, so concurrent callers cannot both pass a check that only one has room for — the
 * gap `checkQuota` + `incrementUsage` leave. Returns a refund to call if the work then fails.
 * Same limit rules as `checkQuota`: no row or -1 means unlimited, nothing is written, refund is a no-op.
 * Only for callers whose work runs inside the same request; a check at enqueue with the
 * increment in a later job still uses the two-call pair.
 */
export async function reserveQuota(
  retailerId: string,
  resourceType: QuotaResourceType,
  amount = 1,
): Promise<() => Promise<void>> {
  const effective = await effectiveLimit(retailerId, resourceType);
  if (!effective || effective.limit === -1) return async () => {};
  const limit = effective.limit;
  const label = resourceType.toLowerCase().replace(/_/g, ' ');
  // The ON CONFLICT guard only covers an existing row; a first insert must be bounded here.
  if (amount > limit) throw planLimitExceeded(label);

  const start = periodStart(effective.period);
  const taken = await prisma.$executeRaw`
    INSERT INTO usage_counters (id, retailer_id, resource_type, period_start, count, updated_at)
    VALUES (${randomUUID()}, ${retailerId}, ${resourceType}::"QuotaResourceType", ${start}, ${amount}, now())
    ON CONFLICT (retailer_id, resource_type, period_start)
    DO UPDATE SET count = usage_counters.count + ${amount}, updated_at = now()
    WHERE usage_counters.count + ${amount} <= ${limit}`;
  if (taken === 0) throw planLimitExceeded(label);

  return async () => {
    await prisma.$executeRaw`
      UPDATE usage_counters SET count = GREATEST(count - ${amount}, 0), updated_at = now()
      WHERE retailer_id = ${retailerId}
        AND resource_type = ${resourceType}::"QuotaResourceType"
        AND period_start = ${start}`;
  };
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

/**
 * The numbers `checkQuota` will actually enforce, for a screen to show. No limit row, or -1,
 * means nothing is enforced (checkQuota returns), so this says unlimited instead of inventing
 * a plan default the way getQuotaStatus does (RC-073). `reserved` is work already in flight
 * that the enforcing route adds to its own request (e.g. PENDING try-on jobs).
 */
export async function getEnforcedQuota(
  retailerId: string,
  resourceType: QuotaResourceType,
  reserved = 0,
): Promise<{ used: number; limit: number; remaining: number; unlimited: boolean }> {
  const effective = await effectiveLimit(retailerId, resourceType);
  if (!effective || effective.limit === -1) {
    return { used: 0, limit: -1, remaining: -1, unlimited: true };
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
  return {
    used,
    limit: effective.limit,
    remaining: Math.max(0, effective.limit - used - reserved),
    unlimited: false,
  };
}
