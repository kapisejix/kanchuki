import { beforeEach, describe, expect, it, vi } from 'vitest';

// F-039 Phase 2 / T2 — the customer-side half of the F-010 quota lib. Context:
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
  },
}));

const { checkCustomerQuota, checkQuota, incrementCustomerUsage } = await import('./quota.js');

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
  it('fails OPEN when no customer_resource_limits row exists', async () => {
    // Unconfigured must not be an outage — same direction as checkQuota. (The
    // seed in migration 119 means the metered try-on resource is never actually
    // unconfigured in practice.)
    mockCustomerLimitFindUnique.mockResolvedValue(null);

    await expect(checkCustomerQuota(CUSTOMER, 'TRY_ON_GENERATION')).resolves.toBeUndefined();
    expect(mockCustomerCounterFindUnique).not.toHaveBeenCalled();
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
