import { beforeEach, describe, expect, it, vi } from 'vitest';

// F-040 / T2 — the customer-side half of the F-010 quota lib. Context:
// a try-on from a passport-logged-in shopper must clear BOTH the retailer's
// monthly cap AND that shopper's own, and the two rejections must be
// distinguishable so the route can say which one was hit.
const mockOverrideFindUnique = vi.fn();
const mockRetailerFindUniqueOrThrow = vi.fn();
const mockRetailerFindUnique = vi.fn();
const mockPlanLimitFindUnique = vi.fn();
const mockUsageCounterFindUnique = vi.fn();
const mockUsageCounterUpsert = vi.fn();
const mockCustomerLimitFindUnique = vi.fn();
const mockCustomerCounterFindUnique = vi.fn();
const mockCustomerCounterUpsert = vi.fn();
const mockExecuteRaw = vi.fn();

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailerLimitOverride: { findUnique: mockOverrideFindUnique },
    retailer: {
      findUniqueOrThrow: mockRetailerFindUniqueOrThrow,
      findUnique: mockRetailerFindUnique,
    },
    planLimit: { findUnique: mockPlanLimitFindUnique },
    usageCounter: {
      findUnique: mockUsageCounterFindUnique,
      upsert: mockUsageCounterUpsert,
    },
    customerResourceLimit: { findUnique: mockCustomerLimitFindUnique },
    customerUsageCounter: {
      findUnique: mockCustomerCounterFindUnique,
      upsert: mockCustomerCounterUpsert,
    },
    $executeRaw: mockExecuteRaw,
  },
}));

const {
  checkCustomerQuota,
  checkQuota,
  getEnforcedQuota,
  getQuotaStatus,
  incrementCustomerUsage,
  markCustomerJobQuotaSpent,
  refundCustomerJobQuota,
  reserveCustomerJobQuota,
  reserveJobQuota,
  reserveQuota,
} = await import('./quota.js');

const CUSTOMER = 'customer_account_1';

/** Same boundary the lib buckets on: local midnight on the 1st. */
function monthStart(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

beforeEach(() => {
  vi.resetAllMocks();
  mockOverrideFindUnique.mockResolvedValue(null);
  mockRetailerFindUniqueOrThrow.mockResolvedValue({ plan: 'GROWTH' });
  mockRetailerFindUnique.mockResolvedValue({ plan: 'GROWTH' });
  mockPlanLimitFindUnique.mockResolvedValue(null);
});

describe('checkCustomerQuota', () => {
  it('fails OPEN when no row exists for a NON-metered resource', async () => {
    mockCustomerLimitFindUnique.mockResolvedValue(null);

    await expect(checkCustomerQuota(CUSTOMER, 'STYLE_ANALYSIS')).resolves.toBeUndefined();
    expect(mockCustomerCounterFindUnique).not.toHaveBeenCalled();
  });

  it('fails CLOSED when no row exists for a METERED resource (H6-1)', async () => {
    mockCustomerLimitFindUnique.mockResolvedValue(null);
    mockCustomerCounterFindUnique.mockResolvedValue(null);

    await expect(checkCustomerQuota(CUSTOMER, 'TRY_ON_GENERATION')).rejects.toMatchObject({
      code: 'CUSTOMER_LIMIT_EXCEEDED',
    });
  });

  it('treats -1 as unlimited', async () => {
    mockCustomerLimitFindUnique.mockResolvedValue({ limit_per_period: -1, period: 'MONTH' });

    await expect(checkCustomerQuota(CUSTOMER, 'TRY_ON_GENERATION')).resolves.toBeUndefined();
    expect(mockCustomerCounterFindUnique).not.toHaveBeenCalled();
  });

  it('passes while the shopper is under the cap', async () => {
    mockCustomerLimitFindUnique.mockResolvedValue({ limit_per_period: 3, period: 'MONTH' });
    mockCustomerCounterFindUnique.mockResolvedValue({ count: 2 });

    await expect(checkCustomerQuota(CUSTOMER, 'TRY_ON_GENERATION')).resolves.toBeUndefined();
  });

  it('passes exactly at the limit when one more is requested (boundary)', async () => {
    mockCustomerLimitFindUnique.mockResolvedValue({ limit_per_period: 3, period: 'MONTH' });
    mockCustomerCounterFindUnique.mockResolvedValue({ count: 2 });

    // 2 used + 1 requested = 3, which is allowed (the cap is inclusive).
    await expect(checkCustomerQuota(CUSTOMER, 'TRY_ON_GENERATION')).resolves.toBeUndefined();

    // ...but a second one in the same period is not. This is the assertion the
    // off-by-one would show up in.
    mockCustomerCounterFindUnique.mockResolvedValue({ count: 3 });
    await expect(checkCustomerQuota(CUSTOMER, 'TRY_ON_GENERATION')).rejects.toMatchObject({
      code: 'CUSTOMER_LIMIT_EXCEEDED',
      status: 402,
    });
  });

  it('rejects over the cap with a customer-specific code that names the limit', async () => {
    mockCustomerLimitFindUnique.mockResolvedValue({ limit_per_period: 3, period: 'MONTH' });
    mockCustomerCounterFindUnique.mockResolvedValue({ count: 3 });

    await expect(checkCustomerQuota(CUSTOMER, 'TRY_ON_GENERATION')).rejects.toMatchObject({
      code: 'CUSTOMER_LIMIT_EXCEEDED',
      status: 402,
      message: expect.stringContaining('3 per month'),
    });
  });

  it('buckets the counter on the configured period boundary', async () => {
    mockCustomerLimitFindUnique.mockResolvedValue({ limit_per_period: 3, period: 'MONTH' });
    mockCustomerCounterFindUnique.mockResolvedValue(null);

    await checkCustomerQuota(CUSTOMER, 'TRY_ON_GENERATION');

    expect(mockCustomerCounterFindUnique).toHaveBeenCalledWith({
      where: {
        customer_account_id_resource_type_period_start: {
          customer_account_id: CUSTOMER,
          resource_type: 'TRY_ON_GENERATION',
          period_start: monthStart(),
        },
      },
    });
  });

  it('counts a missing counter row as zero used', async () => {
    mockCustomerLimitFindUnique.mockResolvedValue({ limit_per_period: 3, period: 'MONTH' });
    mockCustomerCounterFindUnique.mockResolvedValue(null);

    await expect(checkCustomerQuota(CUSTOMER, 'TRY_ON_GENERATION')).resolves.toBeUndefined();
  });
});

describe('incrementCustomerUsage', () => {
  it('upserts the counter for the current period', async () => {
    mockCustomerLimitFindUnique.mockResolvedValue({ limit_per_period: 3, period: 'MONTH' });

    await incrementCustomerUsage(CUSTOMER, 'TRY_ON_GENERATION');

    expect(mockCustomerCounterUpsert).toHaveBeenCalledWith({
      where: {
        customer_account_id_resource_type_period_start: {
          customer_account_id: CUSTOMER,
          resource_type: 'TRY_ON_GENERATION',
          period_start: monthStart(),
        },
      },
      create: {
        customer_account_id: CUSTOMER,
        resource_type: 'TRY_ON_GENERATION',
        period_start: monthStart(),
        count: 1,
      },
      update: { count: { increment: 1 } },
    });
  });

  it('defaults to MONTH when the resource is unconfigured', async () => {
    mockCustomerLimitFindUnique.mockResolvedValue(null);

    await incrementCustomerUsage(CUSTOMER, 'TRY_ON_GENERATION');

    expect(mockCustomerCounterUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ period_start: monthStart() }),
      }),
    );
  });
});

describe('the two caps are distinguishable', () => {
  it('retailer cap and customer cap reject with different codes', async () => {
    // Retailer side: a real plan_limits row.
    mockPlanLimitFindUnique.mockResolvedValue({ limit_per_period: 20, period: 'MONTH' });
    mockUsageCounterFindUnique.mockResolvedValue({ count: 20 });
    await expect(checkQuota('retailer_1', 'TRY_ON_GENERATION')).rejects.toMatchObject({
      code: 'PLAN_LIMIT_EXCEEDED',
      status: 402,
    });

    // Customer side: same resource, different gate, different code — which is
    // what lets T3's route report which one blocked the request, and what keeps
    // the shopper from being told to "upgrade their plan".
    mockCustomerLimitFindUnique.mockResolvedValue({ limit_per_period: 3, period: 'MONTH' });
    mockCustomerCounterFindUnique.mockResolvedValue({ count: 3 });
    await expect(checkCustomerQuota(CUSTOMER, 'TRY_ON_GENERATION')).rejects.toMatchObject({
      code: 'CUSTOMER_LIMIT_EXCEEDED',
      status: 402,
    });
  });
});

// RC-102: shopper-scope job reservations. The SQL is only a fake here (no Postgres), so these pin
// the control flow around it: what is skipped, what is refused, and which statement is sent.
const sqlOf = (call: unknown[]) => (call[0] as string[]).join('?');

describe('reserveCustomerJobQuota', () => {
  it('-1, or no row on a non-metered type: nothing is written', async () => {
    mockCustomerLimitFindUnique.mockResolvedValue(null);
    await reserveCustomerJobQuota(CUSTOMER, 'STYLE_ANALYSIS', 'job1');
    mockCustomerLimitFindUnique.mockResolvedValue({ limit_per_period: -1, period: 'MONTH' });
    await reserveCustomerJobQuota(CUSTOMER, 'TRY_ON_GENERATION', 'job1');
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it('no row on a METERED type is refused without touching the DB (H6-1)', async () => {
    mockCustomerLimitFindUnique.mockResolvedValue(null);
    await expect(
      reserveCustomerJobQuota(CUSTOMER, 'TRY_ON_GENERATION', 'job1'),
    ).rejects.toMatchObject({ code: 'CUSTOMER_LIMIT_EXCEEDED' });
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it('takes the slot in ONE statement that bumps the shopper counter and records the holder', async () => {
    mockCustomerLimitFindUnique.mockResolvedValue({ limit_per_period: 3, period: 'MONTH' });
    mockExecuteRaw.mockResolvedValue(1);
    await reserveCustomerJobQuota(CUSTOMER, 'TRY_ON_GENERATION', 'job1');
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    const call = mockExecuteRaw.mock.calls[0] as unknown[];
    const sql = sqlOf(call);
    expect(sql).toContain('customer_usage_counters');
    expect(sql).toContain('quota_reservations');
    expect(sql).toContain('<=');
    expect(call).toContain('job1');
    expect(call).toContain(CUSTOMER);
  });

  it('zero rows = over the limit: CUSTOMER_LIMIT_EXCEEDED, not the plan error', async () => {
    mockCustomerLimitFindUnique.mockResolvedValue({ limit_per_period: 3, period: 'MONTH' });
    mockExecuteRaw.mockResolvedValue(0);
    await expect(
      reserveCustomerJobQuota(CUSTOMER, 'TRY_ON_GENERATION', 'job1'),
    ).rejects.toMatchObject({ code: 'CUSTOMER_LIMIT_EXCEEDED' });
  });

  it('an amount above the limit is refused without touching the DB', async () => {
    mockCustomerLimitFindUnique.mockResolvedValue({ limit_per_period: 1, period: 'MONTH' });
    await expect(
      reserveCustomerJobQuota(CUSTOMER, 'TRY_ON_GENERATION', 'job1', 2),
    ).rejects.toMatchObject({ code: 'CUSTOMER_LIMIT_EXCEEDED' });
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });
});

describe('refundCustomerJobQuota / markCustomerJobQuotaSpent', () => {
  it('refund is one RESERVED -> REFUNDED statement scoped to the shopper rows', async () => {
    mockExecuteRaw.mockResolvedValue(1);
    await refundCustomerJobQuota('job1', 'TRY_ON_GENERATION');
    const call = mockExecuteRaw.mock.calls[0] as unknown[];
    const sql = sqlOf(call);
    expect(sql).toContain("state = 'RESERVED'");
    expect(sql).toContain('customer_account_id IS NOT NULL');
    expect(sql).toContain('customer_usage_counters');
    expect(call).toContain('job1');
  });

  it('mark-spent only moves a RESERVED shopper row', async () => {
    mockExecuteRaw.mockResolvedValue(1);
    await markCustomerJobQuotaSpent('job1', 'TRY_ON_GENERATION');
    const sql = sqlOf(mockExecuteRaw.mock.calls[0] as unknown[]);
    expect(sql).toContain("state = 'SPENT'");
    expect(sql).toContain("state = 'RESERVED'");
    expect(sql).toContain('customer_account_id IS NOT NULL');
  });
});

// RC-073: the screen must report what checkQuota enforces, not a plan default.
describe('getEnforcedQuota', () => {
  it.each([
    ['no limit row on a non-metered type (fail-open)', 'AI_TAGGING_CALL', null],
    [
      'an explicit unlimited (-1) row',
      'TRY_ON_GENERATION',
      { limit_per_period: -1, period: 'MONTH' },
    ],
  ] as const)('%s -> unlimited, and checkQuota agrees', async (_n, resource, row) => {
    mockPlanLimitFindUnique.mockResolvedValue(row);
    for (const plan of ['STARTER', 'GROWTH', 'PRO']) {
      mockRetailerFindUniqueOrThrow.mockResolvedValue({ plan });
      expect(await getEnforcedQuota('r1', resource)).toEqual({
        used: 0,
        limit: -1,
        remaining: -1,
        unlimited: true,
      });
      await expect(checkQuota('r1', resource, 99)).resolves.toBeUndefined();
    }
  });

  it('limited: remaining = limit - used, never negative, and checkQuota agrees', async () => {
    mockPlanLimitFindUnique.mockResolvedValue({ limit_per_period: 20, period: 'MONTH' });
    mockUsageCounterFindUnique.mockResolvedValue({ count: 17 });
    // in-flight jobs hold a reservation, so they are already inside `used` (RC-102)
    expect(await getEnforcedQuota('r1', 'TRY_ON_GENERATION')).toEqual({
      used: 17,
      limit: 20,
      remaining: 3,
      unlimited: false,
    });
    mockUsageCounterFindUnique.mockResolvedValue({ count: 25 });
    expect((await getEnforcedQuota('r1', 'TRY_ON_GENERATION')).remaining).toBe(0);
    mockUsageCounterFindUnique.mockResolvedValue({ count: 17 });
    await expect(checkQuota('r1', 'TRY_ON_GENERATION', 4)).rejects.toMatchObject({
      code: 'PLAN_LIMIT_EXCEEDED',
    });
  });

  it('reads the current period counter', async () => {
    mockPlanLimitFindUnique.mockResolvedValue({ limit_per_period: 20, period: 'MONTH' });
    mockUsageCounterFindUnique.mockResolvedValue(null);
    await getEnforcedQuota('r1', 'TRY_ON_GENERATION');
    expect(
      mockUsageCounterFindUnique.mock.calls[0]?.[0].where.retailer_id_resource_type_period_start
        .period_start,
    ).toEqual(monthStart());
  });
});

// H6-1: a resource that costs real money per call must fail CLOSED when no plan_limits row exists.
// beforeEach already leaves override and plan_limits empty, i.e. the shipped default.
describe('metered resources with no plan_limits row (H6-1)', () => {
  const METERED = ['STUDIO_SHOOT', 'TRY_ON_GENERATION', 'BG_REMOVAL', 'IMAGE_CROP'] as const;

  it.each(METERED)('checkQuota(%s) is refused', async (resource) => {
    mockUsageCounterFindUnique.mockResolvedValue(null);
    await expect(checkQuota('r1', resource)).rejects.toMatchObject({ code: 'PLAN_LIMIT_EXCEEDED' });
  });

  it.each(METERED)('reserveQuota(%s) is refused before any SQL', async (resource) => {
    await expect(reserveQuota('r1', resource)).rejects.toMatchObject({
      code: 'PLAN_LIMIT_EXCEEDED',
    });
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it.each(METERED)('reserveJobQuota(%s) is refused before any SQL', async (resource) => {
    await expect(reserveJobQuota('r1', resource, 'job1')).rejects.toMatchObject({
      code: 'PLAN_LIMIT_EXCEEDED',
    });
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it('getQuotaStatus and getEnforcedQuota report 0 left, agreeing with checkQuota (RC-073)', async () => {
    mockUsageCounterFindUnique.mockResolvedValue(null);
    for (const plan of ['STARTER', 'GROWTH', 'PRO']) {
      mockRetailerFindUnique.mockResolvedValue({ plan });
      mockRetailerFindUniqueOrThrow.mockResolvedValue({ plan });
      expect(await getQuotaStatus('r1', 'STUDIO_SHOOT')).toMatchObject({
        limit: 0,
        remaining: 0,
        unlimited: false,
      });
      expect(await getEnforcedQuota('r1', 'STUDIO_SHOOT')).toEqual({
        used: 0,
        limit: 0,
        remaining: 0,
        unlimited: false,
      });
    }
  });

  it('an explicit -1 plan row is still unlimited', async () => {
    mockPlanLimitFindUnique.mockResolvedValue({ limit_per_period: -1, period: 'MONTH' });
    await expect(checkQuota('r1', 'STUDIO_SHOOT', 99)).resolves.toBeUndefined();
    await expect(reserveJobQuota('r1', 'STUDIO_SHOOT', 'job1')).resolves.toBeUndefined();
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it('a retailer override row is honoured even with no plan row', async () => {
    mockOverrideFindUnique.mockResolvedValue({ limit_per_period: 5, period: 'MONTH' });
    mockUsageCounterFindUnique.mockResolvedValue({ count: 1 });
    await expect(checkQuota('r1', 'STUDIO_SHOOT')).resolves.toBeUndefined();
  });

  it('a NON-metered resource with no row stays fail-open', async () => {
    await expect(checkQuota('r1', 'AI_TAGGING_CALL', 99)).resolves.toBeUndefined();
    const refund = await reserveQuota('r1', 'AI_TAGGING_CALL');
    await refund();
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });
});
