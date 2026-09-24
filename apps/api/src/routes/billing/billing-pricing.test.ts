import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindUnique } = vi.hoisted(() => ({ mockFindUnique: vi.fn() }));

vi.mock('@kanchuki/db', () => ({
  prisma: { planPricing: { findUnique: mockFindUnique } },
  getSecret: vi.fn(),
}));

import { getPlanPricing } from './billing-helpers.js';

beforeEach(() => mockFindUnique.mockReset());

// plan_pricing is the only source of plan prices (PLAN_PRICING constant removed).
describe('getPlanPricing', () => {
  it('returns the DB price in paise', async () => {
    mockFindUnique.mockResolvedValue({ plan: 'GROWTH', monthly_paise: 999900 });
    await expect(getPlanPricing('GROWTH')).resolves.toEqual({ monthly: 999900 });
  });

  it('a missing row is a loud PLAN_PRICE_MISSING error, never a guessed price', async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(getPlanPricing('PRO')).rejects.toMatchObject({ code: 'PLAN_PRICE_MISSING', status: 500 });
  });
});
