/**
 * RC-102: reserveQuota is one atomic take, not check-then-increment.
 *
 * The fake models the guarantee the SQL gives (a single INSERT .. ON CONFLICT DO UPDATE ..
 * WHERE count + n <= limit is atomic row-wise), by running each statement's read-modify-write
 * synchronously. The race window under test is everything BEFORE the statement: every caller
 * awaits effectiveLimit first, so all of them are in flight together when they reach it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  override: vi.fn(),
  retailerFind: vi.fn(),
  planLimit: vi.fn(),
  exec: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailerLimitOverride: { findUnique: m.override },
    retailer: { findUniqueOrThrow: m.retailerFind },
    planLimit: { findUnique: m.planLimit },
    $executeRaw: m.exec,
  },
}));

import { reserveQuota } from './quota.js';

// counter rows keyed retailer|type|start
const rows = new Map<string, number>();

/** Tagged-template stand-in: values order mirrors the SQL in quota.ts. */
function fakeExec(strings: TemplateStringsArray, ...v: unknown[]) {
  const sql = strings.join('?');
  if (sql.includes('INSERT INTO usage_counters')) {
    // [id, retailer, type, start, amount, amountOnConflict, amountInWhere, limit]
    const [, retailer, type, start, amount, , , limit] = v as [
      string,
      string,
      string,
      Date,
      number,
      number,
      number,
      number,
    ];
    const key = `${retailer}|${type}|${start.getTime()}`;
    const cur = rows.get(key);
    if (cur === undefined) {
      rows.set(key, amount);
      return Promise.resolve(1);
    }
    if (cur + amount > limit) return Promise.resolve(0);
    rows.set(key, cur + amount);
    return Promise.resolve(1);
  }
  // refund: [amount, retailer, type, start]
  const [amount, retailer, type, start] = v as [number, string, string, Date];
  const key = `${retailer}|${type}|${start.getTime()}`;
  rows.set(key, Math.max((rows.get(key) ?? 0) - amount, 0));
  return Promise.resolve(1);
}

const count = () => [...rows.values()].reduce((a, b) => a + b, 0);

beforeEach(() => {
  vi.resetAllMocks();
  rows.clear();
  m.exec.mockImplementation(fakeExec);
  m.override.mockResolvedValue({ limit_per_period: 3, period: 'MONTH' });
});

describe('reserveQuota', () => {
  it('10 concurrent callers against a limit of 3: exactly 3 get in, counter ends at 3', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => reserveQuota('ret1', 'GBP_REVIEW_REPLY')),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected).toHaveLength(7);
    expect(rejected.every((r) => r.reason.code === 'PLAN_LIMIT_EXCEEDED')).toBe(true);
    expect(count()).toBe(3);
  });

  it('refund hands the slot back, so the next caller gets in', async () => {
    const refunds = await Promise.all(
      [1, 2, 3].map(() => reserveQuota('ret1', 'GBP_REVIEW_REPLY')),
    );
    await expect(reserveQuota('ret1', 'GBP_REVIEW_REPLY')).rejects.toMatchObject({ status: 402 });
    await refunds[0]?.();
    expect(count()).toBe(2);
    await expect(reserveQuota('ret1', 'GBP_REVIEW_REPLY')).resolves.toBeTypeOf('function');
    expect(count()).toBe(3);
  });

  it('refund never takes the counter below zero', async () => {
    const refund = await reserveQuota('ret1', 'GBP_REVIEW_REPLY');
    await refund();
    await refund();
    expect(count()).toBe(0);
  });

  it('a batch bigger than the whole limit is refused before anything is written', async () => {
    await expect(reserveQuota('ret1', 'PRODUCT_UPLOAD', 4)).rejects.toMatchObject({ status: 402 });
    expect(m.exec).not.toHaveBeenCalled();
  });

  it('a batch that no longer fits the remaining room is refused and leaves the counter alone', async () => {
    await reserveQuota('ret1', 'PRODUCT_UPLOAD', 2);
    await expect(reserveQuota('ret1', 'PRODUCT_UPLOAD', 2)).rejects.toMatchObject({ status: 402 });
    expect(count()).toBe(2);
  });

  it('limit -1 is unlimited: nothing written, refund is a no-op', async () => {
    m.override.mockResolvedValue({ limit_per_period: -1, period: 'MONTH' });
    const refund = await reserveQuota('ret1', 'GBP_REVIEW_REPLY');
    await refund();
    expect(m.exec).not.toHaveBeenCalled();
  });

  it('no limit row at all is unlimited too (same fail-open as checkQuota)', async () => {
    m.override.mockResolvedValue(null);
    m.retailerFind.mockResolvedValue({ plan: 'GROWTH' });
    m.planLimit.mockResolvedValue(null);
    await reserveQuota('ret1', 'GBP_REVIEW_REPLY');
    expect(m.exec).not.toHaveBeenCalled();
  });

  it('counters are per retailer', async () => {
    await Promise.all([1, 2, 3].map(() => reserveQuota('ret1', 'GBP_REVIEW_REPLY')));
    await expect(reserveQuota('ret2', 'GBP_REVIEW_REPLY')).resolves.toBeTypeOf('function');
  });
});
