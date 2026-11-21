import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  retailerFindOrThrow: vi.fn(),
  override: vi.fn(),
  planLimit: vi.fn(),
  counter: vi.fn(),
  executeRaw: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findUniqueOrThrow: db.retailerFindOrThrow },
    retailerLimitOverride: { findUnique: db.override },
    planLimit: { findUnique: db.planLimit },
    usageCounter: { findUnique: db.counter },
    $executeRaw: db.executeRaw,
  },
}));

import { checkQuota, isAiBlocked, reserveJobQuota, reserveQuota } from './quota.js';

const PAST = new Date(Date.now() - 86_400_000);
const FUTURE = new Date(Date.now() + 86_400_000);
const lapsedTrial = { plan_status: 'TRIAL', trial_ends_at: PAST, plan_expires_at: null };
const liveTrial = { plan_status: 'TRIAL', trial_ends_at: FUTURE, plan_expires_at: null };
const AI = [
  'AI_TAGGING_CALL',
  'STUDIO_SHOOT',
  'TRY_ON_GENERATION',
  'BG_REMOVAL',
  'IMAGE_CROP',
  'AI_CUSTOM_TEMPLATE',
  'AI_VIDEO',
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  db.retailerFindOrThrow.mockResolvedValue({ plan: 'STARTER' });
  db.override.mockResolvedValue(null);
  db.planLimit.mockResolvedValue({ limit_per_period: 100, period: 'MONTH' });
  db.counter.mockResolvedValue({ count: 0 });
  db.executeRaw.mockResolvedValue(1);
});

describe('AI after a trial or paid term lapses', () => {
  for (const resource of AI) {
    it(`refuses ${resource} on every gate and writes nothing`, async () => {
      db.retailerFindOrThrow.mockResolvedValue({ plan: 'STARTER', ...lapsedTrial });
      const refused = { code: 'AI_PLAN_ENDED', status: 402 };
      await expect(checkQuota('r1', resource)).rejects.toMatchObject(refused);
      await expect(reserveQuota('r1', resource)).rejects.toMatchObject(refused);
      await expect(reserveJobQuota('r1', resource, 'job1')).rejects.toMatchObject(refused);
      expect(db.executeRaw).not.toHaveBeenCalled();
    });
  }

  it('an explicit unlimited override does not reopen AI', async () => {
    db.retailerFindOrThrow.mockResolvedValue({ plan: 'STARTER', ...lapsedTrial });
    db.override.mockResolvedValue({ limit_per_period: -1, period: 'MONTH' });
    await expect(checkQuota('r1', 'STUDIO_SHOOT')).rejects.toMatchObject({ code: 'AI_PLAN_ENDED' });
  });

  it('leaves non-AI resources alone', async () => {
    db.retailerFindOrThrow.mockResolvedValue({ plan: 'STARTER', ...lapsedTrial });
    await expect(checkQuota('r1', 'SCHEDULED_POST')).resolves.toBeUndefined();
  });

  it('allows AI during a live trial', async () => {
    db.retailerFindOrThrow.mockResolvedValue({ plan: 'STARTER', ...liveTrial });
    await expect(checkQuota('r1', 'STUDIO_SHOOT')).resolves.toBeUndefined();
    expect(await isAiBlocked('r1')).toBe(false);
  });

  it('allows AI for an active plan inside its term', async () => {
    db.retailerFindOrThrow.mockResolvedValue({
      plan_status: 'ACTIVE',
      trial_ends_at: null,
      plan_expires_at: FUTURE,
    });
    expect(await isAiBlocked('r1')).toBe(false);
  });
});
