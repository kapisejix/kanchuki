import { randomUUID } from 'node:crypto';
import { prisma } from '@kanchuki/db';
import type { QuotaPeriod, QuotaResourceType } from '@kanchuki/db';
import { isLapsed } from '../jobs/plan-lapse.js';
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

// Resources that cost real money per call: no limit row means "none", not "unlimited" (H6-1).
// An explicit -1 row is still unlimited. ponytail: hand list; move to a plan_limits column if it grows.
const METERED: ReadonlySet<QuotaResourceType> = new Set([
  'STUDIO_SHOOT',
  'TRY_ON_GENERATION',
  'BG_REMOVAL',
  'IMAGE_CROP',
  'AI_CUSTOM_TEMPLATE', // T5: a FLUX generation per call
  'AI_VIDEO', // F-034: a paid Fal image-to-video clip per call
  'GBP_REVIEW_REPLY', // audit #9: a reply is a real Google write; no row must not mean unlimited
]);
const NO_ROW_METERED: { limit: number; period: QuotaPeriod } = { limit: 0, period: 'MONTH' };

// Paid AI work a shop may not start once its trial or paid term has lapsed. Checked before the
// limit, so a row, an override or an explicit -1 cannot reopen it; paying or an admin trial
// extension does, because nothing is stored.
const AI_RESOURCES: ReadonlySet<QuotaResourceType> = new Set([
  'AI_TAGGING_CALL',
  'STUDIO_SHOOT',
  'TRY_ON_GENERATION',
  'BG_REMOVAL',
  'IMAGE_CROP',
  'AI_CUSTOM_TEMPLATE',
  'AI_VIDEO',
]);

export async function isAiBlocked(retailerId: string): Promise<boolean> {
  const retailer = await prisma.retailer.findUniqueOrThrow({
    where: { id: retailerId },
    select: { plan_status: true, trial_ends_at: true, plan_expires_at: true },
  });
  return isLapsed(retailer);
}

async function assertAiAllowed(retailerId: string, resourceType: QuotaResourceType): Promise<void> {
  if (!AI_RESOURCES.has(resourceType) || !(await isAiBlocked(retailerId))) return;
  throw new AppError(
    'AI_PLAN_ENDED',
    'Your free trial or plan has ended, so AI features are off. Choose a plan to turn them back on.',
    402,
  );
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
  // ponytail: plan_limits has no seed rows yet for the non-metered types
  // (AI_TAGGING_CALL/API_REQUEST) — fail-open until an admin adds a row, instead
  // of blocking every retailer on every call. METERED types fail CLOSED (H6-1).
  if (!planLimit) return METERED.has(resourceType) ? NO_ROW_METERED : null;
  return { limit: planLimit.limit_per_period, period: planLimit.period };
}

/**
 * Customer-side twin of `effectiveLimit`: one global admin-editable number per
 * resource (shoppers have no plan), or null when unconfigured. An unseeded
 * non-metered resource fails OPEN ("no limit" rather than an outage); a METERED
 * one (real GPU/AI cost per call) fails CLOSED with limit 0 (H6-1). Migration 119
 * seeds TRY_ON_GENERATION, so that path is not reachable in practice.
 */
async function effectiveCustomerLimit(
  resourceType: QuotaResourceType,
): Promise<{ limit: number; period: QuotaPeriod } | null> {
  const row = await prisma.customerResourceLimit.findUnique({
    where: { resource_type: resourceType },
  });
  if (!row) return METERED.has(resourceType) ? NO_ROW_METERED : null;
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
  await assertAiAllowed(retailerId, resourceType);
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
// reserveQuota (RC-102) instead; queued jobs (studio-shoot, try-on, My Style) use
// reserve*JobQuota. Only AI tagging (provider-weighted, retried) still has this race.
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
 * Same limit rules as `checkQuota`: -1 (or no row on a non-metered type) means unlimited, nothing is
 * written, refund is a no-op. No row on a METERED type means limit 0 (H6-1).
 * Only for callers whose work runs inside the same request; a check at enqueue with the
 * increment in a later job still uses the two-call pair.
 */
export async function reserveQuota(
  retailerId: string,
  resourceType: QuotaResourceType,
  amount = 1,
): Promise<((give?: number) => Promise<void>) & { reserved: boolean }> {
  await assertAiAllowed(retailerId, resourceType);
  const effective = await effectiveLimit(retailerId, resourceType);
  if (!effective || effective.limit === -1)
    return Object.assign(async () => {}, { reserved: false });
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

  // `give` lets a batch hand back part of what it took (pro-cleanup: one slot per failed photo).
  // `reserved` tells a caller that settles later whether anything was written (unlimited = false).
  return Object.assign(
    async (give = amount) => {
      await prisma.$executeRaw`
      UPDATE usage_counters SET count = GREATEST(count - ${give}, 0), updated_at = now()
      WHERE retailer_id = ${retailerId}
        AND resource_type = ${resourceType}::"QuotaResourceType"
        AND period_start = ${start}`;
    },
    { reserved: true },
  );
}

/**
 * Job-scoped twin of `reserveQuota` for work that runs in a queued job after the request
 * returns (docs/tasks/pending/quota-reserve-at-enqueue.md). Same limit rules and the same
 * atomic counter bump, but the same statement also records WHO holds the slot in
 * `quota_reservations` (keyed by the payload `jobId`), so a refund by job id is idempotent
 * across the handler, the BullMQ `failed` hook and a sweep. Retailer scope only.
 * -1 (or no row on a non-metered type) = unlimited: nothing is written, and refund/mark-spent find
 * no row and no-op. No row on a METERED type is limit 0 (H6-1).
 * A repeated (jobId, resource) hits the unique index and throws, never double-reserves.
 */
export async function reserveJobQuota(
  retailerId: string,
  resourceType: QuotaResourceType,
  jobId: string,
  amount = 1,
): Promise<void> {
  await assertAiAllowed(retailerId, resourceType);
  const effective = await effectiveLimit(retailerId, resourceType);
  if (!effective || effective.limit === -1) return;
  const limit = effective.limit;
  const label = resourceType.toLowerCase().replace(/_/g, ' ');
  if (amount > limit) throw planLimitExceeded(label);

  const start = periodStart(effective.period);
  // The final INSERT only runs when `bump` returned a row, i.e. the guarded upsert took the slot.
  const taken = await prisma.$executeRaw`
    WITH bump AS (
      INSERT INTO usage_counters (id, retailer_id, resource_type, period_start, count, updated_at)
      VALUES (${randomUUID()}, ${retailerId}, ${resourceType}::"QuotaResourceType", ${start}, ${amount}, now())
      ON CONFLICT (retailer_id, resource_type, period_start)
      DO UPDATE SET count = usage_counters.count + ${amount}, updated_at = now()
      WHERE usage_counters.count + ${amount} <= ${limit}
      RETURNING 1
    )
    INSERT INTO quota_reservations (id, job_id, retailer_id, resource_type, period_start, amount)
    SELECT ${randomUUID()}, ${jobId}, ${retailerId}, ${resourceType}::"QuotaResourceType", ${start}, ${amount}
    FROM bump`;
  if (taken === 0) throw planLimitExceeded(label);
}

/**
 * Hand a job's reserved slot back, once. The UPDATE flips RESERVED -> REFUNDED and the counter
 * drops only for the row that flip touched, so calling this again (handler `finally`, `failed`
 * hook, sweep) is a no-op. A SPENT or missing reservation is left alone.
 */
export async function refundJobQuota(
  jobId: string,
  resourceType: QuotaResourceType,
): Promise<void> {
  await prisma.$executeRaw`
    WITH r AS (
      UPDATE quota_reservations SET state = 'REFUNDED', refunded_at = now()
      WHERE job_id = ${jobId}
        AND resource_type = ${resourceType}::"QuotaResourceType"
        AND retailer_id IS NOT NULL
        AND state = 'RESERVED'
      RETURNING retailer_id, resource_type, period_start, amount
    )
    UPDATE usage_counters u SET count = GREATEST(u.count - r.amount, 0), updated_at = now()
    FROM r
    WHERE u.retailer_id = r.retailer_id
      AND u.resource_type = r.resource_type
      AND u.period_start = r.period_start`;
}

/** Mark a job's slot as used for good, so a later refund call (or the sweep) leaves it alone. */
export async function markJobQuotaSpent(
  jobId: string,
  resourceType: QuotaResourceType,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE quota_reservations SET state = 'SPENT'
    WHERE job_id = ${jobId}
      AND resource_type = ${resourceType}::"QuotaResourceType"
      AND retailer_id IS NOT NULL
      AND state = 'RESERVED'`;
}

/**
 * Shopper-side twin of `reserveJobQuota`: same one-statement counter bump + reservation row, on
 * `customer_usage_counters` and the `customer_account_id` scope. Same unlimited rules as
 * `checkCustomerQuota` (no configured limit or -1 = nothing written; refund/spent then no-op).
 * Throws CUSTOMER_LIMIT_EXCEEDED, never the plan error.
 */
export async function reserveCustomerJobQuota(
  customerAccountId: string,
  resourceType: QuotaResourceType,
  jobId: string,
  amount = 1,
): Promise<void> {
  const effective = await effectiveCustomerLimit(resourceType);
  if (!effective || effective.limit === -1) return;
  const limit = effective.limit;
  if (amount > limit) throw customerLimitExceeded(resourceType, limit, effective.period);

  const start = periodStart(effective.period);
  const taken = await prisma.$executeRaw`
    WITH bump AS (
      INSERT INTO customer_usage_counters (id, customer_account_id, resource_type, period_start, count, updated_at)
      VALUES (${randomUUID()}, ${customerAccountId}, ${resourceType}::"QuotaResourceType", ${start}, ${amount}, now())
      ON CONFLICT (customer_account_id, resource_type, period_start)
      DO UPDATE SET count = customer_usage_counters.count + ${amount}, updated_at = now()
      WHERE customer_usage_counters.count + ${amount} <= ${limit}
      RETURNING 1
    )
    INSERT INTO quota_reservations (id, job_id, customer_account_id, resource_type, period_start, amount)
    SELECT ${randomUUID()}, ${jobId}, ${customerAccountId}, ${resourceType}::"QuotaResourceType", ${start}, ${amount}
    FROM bump`;
  if (taken === 0) throw customerLimitExceeded(resourceType, limit, effective.period);
}

/** `refundJobQuota` for the shopper scope: idempotent by job id, SPENT/missing rows untouched. */
export async function refundCustomerJobQuota(
  jobId: string,
  resourceType: QuotaResourceType,
): Promise<void> {
  await prisma.$executeRaw`
    WITH r AS (
      UPDATE quota_reservations SET state = 'REFUNDED', refunded_at = now()
      WHERE job_id = ${jobId}
        AND resource_type = ${resourceType}::"QuotaResourceType"
        AND customer_account_id IS NOT NULL
        AND state = 'RESERVED'
      RETURNING customer_account_id, resource_type, period_start, amount
    )
    UPDATE customer_usage_counters u SET count = GREATEST(u.count - r.amount, 0), updated_at = now()
    FROM r
    WHERE u.customer_account_id = r.customer_account_id
      AND u.resource_type = r.resource_type
      AND u.period_start = r.period_start`;
}

/** `markJobQuotaSpent` for the shopper scope. */
export async function markCustomerJobQuotaSpent(
  jobId: string,
  resourceType: QuotaResourceType,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE quota_reservations SET state = 'SPENT'
    WHERE job_id = ${jobId}
      AND resource_type = ${resourceType}::"QuotaResourceType"
      AND customer_account_id IS NOT NULL
      AND state = 'RESERVED'`;
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
 * a plan default the way getQuotaStatus does (RC-073). In-flight queued work is already in the
 * counter (reserveJobQuota), so there is nothing to add on top.
 */
export async function getEnforcedQuota(
  retailerId: string,
  resourceType: QuotaResourceType,
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
    remaining: Math.max(0, effective.limit - used),
    unlimited: false,
  };
}
