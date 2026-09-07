import { beforeEach, describe, expect, it, vi } from 'vitest';

// T3.1 — mocked @kanchuki/db (same pattern as showcase-watermark.test.ts):
// retailer.plan lookup + planLimit row + override lookup + the active-design
// count the cap is computed against.
const mockOverrideFindUnique = vi.fn();
const mockRetailerFindUniqueOrThrow = vi.fn();
const mockPlanLimitFindUnique = vi.fn();
const mockShowcaseDesignCount = vi.fn();

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailerLimitOverride: { findUnique: mockOverrideFindUnique },
    retailer: { findUniqueOrThrow: mockRetailerFindUniqueOrThrow },
    planLimit: { findUnique: mockPlanLimitFindUnique },
    showcaseDesign: { count: mockShowcaseDesignCount },
  },
}));

const { assertShowcaseQuota, getShowcaseUsage, countActiveShowcaseDesigns } = await import(
  './showcase-quota.js'
);

const RETAILER = 'retailer_1';

beforeEach(() => {
  mockOverrideFindUnique.mockReset();
  mockRetailerFindUniqueOrThrow.mockReset();
  mockPlanLimitFindUnique.mockReset();
  mockShowcaseDesignCount.mockReset();
  mockOverrideFindUnique.mockResolvedValue(null);
  mockRetailerFindUniqueOrThrow.mockResolvedValue({ plan: 'GROWTH' });
});

describe('getShowcaseUsage', () => {
  it('plan row present → used = live active count, remaining computed', async () => {
    mockPlanLimitFindUnique.mockResolvedValue({ limit_per_period: 60 });
    mockShowcaseDesignCount.mockResolvedValue(24);
    const usage = await getShowcaseUsage(RETAILER);
    expect(usage).toEqual({ used: 24, limit: 60, remaining: 36, unlimited: false });
    expect(mockShowcaseDesignCount).toHaveBeenCalledWith({
      where: { retailer_id: RETAILER, is_active: true },
    });
  });

  it('limit -1 → unlimited', async () => {
    mockPlanLimitFindUnique.mockResolvedValue({ limit_per_period: -1 });
    const usage = await getShowcaseUsage(RETAILER);
    expect(usage.unlimited).toBe(true);
    expect(mockShowcaseDesignCount).not.toHaveBeenCalled();
  });

  it('no plan row (e.g. TRIAL not in 095 seeds) → fail-open unlimited', async () => {
    mockPlanLimitFindUnique.mockResolvedValue(null);
    const usage = await getShowcaseUsage(RETAILER);
    expect(usage.unlimited).toBe(true);
  });

  it('per-retailer override beats the plan row', async () => {
    mockOverrideFindUnique.mockResolvedValue({ limit_per_period: 3 });
    mockShowcaseDesignCount.mockResolvedValue(2);
    const usage = await getShowcaseUsage(RETAILER);
    expect(usage.limit).toBe(3);
    expect(mockPlanLimitFindUnique).not.toHaveBeenCalled();
  });
});

describe('countActiveShowcaseDesigns', () => {
  it('counts only active rows for the retailer', async () => {
    mockShowcaseDesignCount.mockResolvedValue(0);
    await countActiveShowcaseDesigns(RETAILER);
    expect(mockShowcaseDesignCount).toHaveBeenCalledWith({
      where: { retailer_id: RETAILER, is_active: true },
    });
  });
});

describe('assertShowcaseQuota', () => {
  it('under the cap → resolves', async () => {
    mockPlanLimitFindUnique.mockResolvedValue({ limit_per_period: 60 });
    mockShowcaseDesignCount.mockResolvedValue(59);
    await expect(assertShowcaseQuota(RETAILER)).resolves.toBeUndefined();
  });

  it('at the cap → throws 402 PLAN_LIMIT_EXCEEDED', async () => {
    mockPlanLimitFindUnique.mockResolvedValue({ limit_per_period: 60 });
    mockShowcaseDesignCount.mockResolvedValue(60);
    await expect(assertShowcaseQuota(RETAILER)).rejects.toMatchObject({
      code: 'PLAN_LIMIT_EXCEEDED',
      status: 402,
    });
  });

  it('unlimited plan never throws', async () => {
    mockPlanLimitFindUnique.mockResolvedValue(null);
    await expect(assertShowcaseQuota(RETAILER)).resolves.toBeUndefined();
  });
});
