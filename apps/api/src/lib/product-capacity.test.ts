// RC-177 (free tier after a lapsed trial/term) + RC-178 (live-product cap, not a lifetime counter).
import { FREE_TIER_MAX_PRODUCTS, UNLIMITED } from '@kanchuki/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  retailerFind: vi.fn(),
  productCount: vi.fn(),
  effectiveLimit: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findUniqueOrThrow: m.retailerFind },
    product: { count: m.productCount },
  },
}));
vi.mock('./quota.js', () => ({ effectiveLimit: m.effectiveLimit }));

import { isLapsed } from '../jobs/plan-lapse.js';
import { assertProductCapacity, getProductCapacity } from './product-capacity.js';

const DAY = 86_400_000;
const past = new Date(Date.now() - 10 * DAY);
const future = new Date(Date.now() + 10 * DAY);
const activeTrial = { plan_status: 'TRIAL', trial_ends_at: future, plan_expires_at: null };

beforeEach(() => {
  vi.resetAllMocks();
  m.retailerFind.mockResolvedValue({ max_products: 500, ...activeTrial });
  m.effectiveLimit.mockResolvedValue({ limit: 500, period: 'LIFETIME' });
  m.productCount.mockResolvedValue(0);
});

describe('isLapsed', () => {
  const now = new Date();
  it('trial: lapsed only once trial_ends_at is past', () => {
    expect(isLapsed({ ...activeTrial, trial_ends_at: past }, now)).toBe(true);
    expect(isLapsed(activeTrial, now)).toBe(false);
    expect(isLapsed({ ...activeTrial, trial_ends_at: null }, now)).toBe(false);
  });
  it('active: lapsed only after the 3-day renewal grace', () => {
    const r = (d: Date | null) => ({
      plan_status: 'ACTIVE',
      trial_ends_at: null,
      plan_expires_at: d,
    });
    expect(isLapsed(r(new Date(now.getTime() - DAY)), now)).toBe(false);
    expect(isLapsed(r(new Date(now.getTime() - 4 * DAY)), now)).toBe(true);
    expect(isLapsed(r(null), now)).toBe(false);
  });
  it('cancelled/past-due/completed: lapsed once the paid period is over', () => {
    for (const s of ['CANCELLED', 'PAST_DUE', 'COMPLETED']) {
      expect(isLapsed({ plan_status: s, trial_ends_at: null, plan_expires_at: future }, now)).toBe(
        false,
      );
      expect(isLapsed({ plan_status: s, trial_ends_at: null, plan_expires_at: past }, now)).toBe(
        true,
      );
      expect(isLapsed({ plan_status: s, trial_ends_at: null, plan_expires_at: null }, now)).toBe(
        true,
      );
    }
  });
});

describe('getProductCapacity / assertProductCapacity', () => {
  it('counts LIVE products only (deleted ones free their slot)', async () => {
    await getProductCapacity('r1');
    expect(m.productCount).toHaveBeenCalledWith({ where: { retailer_id: 'r1', deleted_at: null } });
  });

  it('allows up to the cap, refuses one past it', async () => {
    m.productCount.mockResolvedValue(499);
    await expect(assertProductCapacity('r1')).resolves.toBeUndefined();
    m.productCount.mockResolvedValue(500);
    await expect(assertProductCapacity('r1')).rejects.toMatchObject({ status: 402 });
  });

  it('a batch is checked as a whole', async () => {
    m.productCount.mockResolvedValue(498);
    await expect(assertProductCapacity('r1', 2)).resolves.toBeUndefined();
    await expect(assertProductCapacity('r1', 3)).rejects.toMatchObject({ status: 402 });
  });

  it('the smaller of max_products and the PRODUCT_UPLOAD limit wins (override raises it)', async () => {
    m.retailerFind.mockResolvedValue({ max_products: UNLIMITED, ...activeTrial });
    m.effectiveLimit.mockResolvedValue({ limit: 5000, period: 'LIFETIME' });
    expect((await getProductCapacity('r1')).cap).toBe(5000);
    m.effectiveLimit.mockResolvedValue({ limit: -1, period: 'LIFETIME' });
    expect((await getProductCapacity('r1')).cap).toBe(-1);
    m.effectiveLimit.mockResolvedValue(null);
    m.retailerFind.mockResolvedValue({ max_products: 200, ...activeTrial });
    expect((await getProductCapacity('r1')).cap).toBe(200);
  });

  it('lapsed trial: free tier cap with its own message, whatever the plan allows', async () => {
    m.retailerFind.mockResolvedValue({ max_products: 500, ...activeTrial, trial_ends_at: past });
    m.productCount.mockResolvedValue(FREE_TIER_MAX_PRODUCTS - 1);
    expect(await getProductCapacity('r1')).toEqual({
      live: FREE_TIER_MAX_PRODUCTS - 1,
      cap: FREE_TIER_MAX_PRODUCTS,
      freeTier: true,
    });
    await expect(assertProductCapacity('r1')).resolves.toBeUndefined();
    m.productCount.mockResolvedValue(FREE_TIER_MAX_PRODUCTS);
    await expect(assertProductCapacity('r1')).rejects.toMatchObject({
      code: 'FREE_TIER_LIMIT',
      status: 402,
    });
  });
});
