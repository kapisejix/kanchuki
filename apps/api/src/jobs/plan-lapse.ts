// RC-078 — hourly: retailers whose trial ended or whose subscription lapsed drop
// to STARTER. Every paid gate (`hasFeature`, `checkQuota`, ~12 direct readers)
// trusts `retailer.plan`, and nothing used to change it when a trial ended or a
// subscription was cancelled, so PRO stayed free forever. Fixing the stored
// plan here closes every reader at once.
//
// Cancel keeps access until `plan_expires_at` (owner decision 2026-10-22):
// the subscription statuses only lapse once that date is past. `plan_status`
// is left as-is so billing screens still show why. Re-subscribing restores the
// plan in the webhook (`billing-webhook.ts`).
import { type Prisma, prisma } from '@kanchuki/db';
import { PLAN_LIMITS, orUnlimited } from '@kanchuki/shared';

export interface PlanLapseResult {
  downgraded: number;
  /** TRIAL rows with no `trial_ends_at` (admin-granted). Left alone; owner decides. */
  trialWithoutEnd: number;
}

function lapsedWhere(now: Date): Prisma.RetailerWhereInput {
  return {
    plan: { not: 'STARTER' },
    deleted_at: null,
    OR: [
      { plan_status: 'TRIAL', trial_ends_at: { lt: now } },
      {
        plan_status: { in: ['PAST_DUE', 'CANCELLED', 'COMPLETED'] },
        OR: [{ plan_expires_at: null }, { plan_expires_at: { lt: now } }],
      },
    ],
  };
}

export async function handlePlanLapse(now = new Date()): Promise<PlanLapseResult> {
  const where = lapsedWhere(now);
  const lapsed = await prisma.retailer.findMany({ where, select: { id: true, plan: true } });

  let downgraded = 0;
  for (const r of lapsed) {
    // The predicate is repeated in the write: a re-subscribe webhook that lands
    // between the read and here must not be downgraded.
    const { count } = await prisma.retailer.updateMany({
      where: { ...where, id: r.id },
      data: {
        plan: 'STARTER',
        max_products: orUnlimited(PLAN_LIMITS.STARTER.max_products),
        max_customers: orUnlimited(PLAN_LIMITS.STARTER.max_customers),
      },
    });
    if (count === 0) continue;
    downgraded++;
    await prisma.auditLog.create({
      data: {
        actor_type: 'system',
        action: 'update',
        resource_type: 'Retailer',
        resource_id: r.id,
        metadata: { from_plan: r.plan, reason: 'plan_lapsed' },
      },
    });
  }

  const trialWithoutEnd = await prisma.retailer.count({
    where: { plan: { not: 'STARTER' }, deleted_at: null, plan_status: 'TRIAL', trial_ends_at: null },
  });

  console.info(
    `[plan-lapse] downgraded=${downgraded} of ${lapsed.length}; trial_without_end=${trialWithoutEnd}`,
  );
  return { downgraded, trialWithoutEnd };
}
