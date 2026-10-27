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

import { markJobQuotaSpent, refundJobQuota, reserveJobQuota, reserveQuota } from './quota.js';

// counter rows keyed retailer|type|start
const rows = new Map<string, number>();

// job reservations keyed job|type
const reservations = new Map<
  string,
  { key: string; amount: number; state: 'RESERVED' | 'SPENT' | 'REFUNDED' }
>();

/** Tagged-template stand-in: values order mirrors the SQL in quota.ts. */
function fakeExec(strings: TemplateStringsArray, ...v: unknown[]) {
  const sql = strings.join('?');
  if (sql.includes('UPDATE quota_reservations')) {
    // refund / mark-spent: [jobId, type]; a row is touched once, only while RESERVED
    const [jobId, type] = v as [string, string];
    const r = reservations.get(`${jobId}|${type}`);
    if (!r || r.state !== 'RESERVED') return Promise.resolve(0);
    if (sql.includes("'REFUNDED'")) {
      r.state = 'REFUNDED';
      rows.set(r.key, Math.max((rows.get(r.key) ?? 0) - r.amount, 0));
    } else {
      r.state = 'SPENT';
    }
    return Promise.resolve(1);
  }
  if (sql.includes('INSERT INTO quota_reservations')) {
    // [id, retailer, type, start, amount, amountOnConflict, amountInWhere, limit,
    //  reservationId, jobId, retailer, type, start, amount]
    const [, retailer, type, start, amount, , , limit, , jobId] = v as [
      string,
      string,
      string,
      Date,
      number,
      number,
      number,
      number,
      string,
      string,
    ];
    const rKey = `${jobId}|${type}`;
    // The unique index fails the WHOLE statement, counter bump included.
    if (reservations.has(rKey)) return Promise.reject(new Error('duplicate key value'));
    const key = `${retailer}|${type}|${start.getTime()}`;
    const cur = rows.get(key);
    if (cur !== undefined && cur + amount > limit) return Promise.resolve(0);
    rows.set(key, (cur ?? 0) + amount);
    reservations.set(rKey, { key, amount, state: 'RESERVED' });
    return Promise.resolve(1);
  }
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
  reservations.clear();
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

  it('refund(n) hands back part of a batch (one slot per failed item)', async () => {
    const refund = await reserveQuota('ret1', 'PRODUCT_UPLOAD', 3);
    expect(count()).toBe(3);
    await refund(1);
    expect(count()).toBe(2);
    await refund(); // no argument still means the whole batch
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

// Queued-job quota: reserve at enqueue keyed by job_id, refund/spent by job_id (idempotent).
describe('reserveJobQuota / refundJobQuota / markJobQuotaSpent', () => {
  it('10 concurrent jobs against a limit of 3: exactly 3 reserve, counter and rows agree', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => reserveJobQuota('ret1', 'STUDIO_SHOOT', `job${i}`)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected.every((r) => r.reason.code === 'PLAN_LIMIT_EXCEEDED')).toBe(true);
    expect(count()).toBe(3);
    expect(reservations.size).toBe(3);
  });

  it('refund hands the slot back once; repeating it (handler, failed hook, sweep) is a no-op', async () => {
    await reserveJobQuota('ret1', 'STUDIO_SHOOT', 'job1');
    await reserveJobQuota('ret1', 'STUDIO_SHOOT', 'job2');
    await refundJobQuota('job1', 'STUDIO_SHOOT');
    await refundJobQuota('job1', 'STUDIO_SHOOT');
    await refundJobQuota('job1', 'STUDIO_SHOOT');
    expect(count()).toBe(1); // job2 still holds its slot
    await expect(reserveJobQuota('ret1', 'STUDIO_SHOOT', 'job3')).resolves.toBeUndefined();
    expect(count()).toBe(2);
  });

  it('a spent slot is never refunded, even if a late refund arrives', async () => {
    await reserveJobQuota('ret1', 'STUDIO_SHOOT', 'job1');
    await markJobQuotaSpent('job1', 'STUDIO_SHOOT');
    await refundJobQuota('job1', 'STUDIO_SHOOT');
    expect(count()).toBe(1);
  });

  it('refund of a job that never reserved (unlimited plan, or wrong id) changes nothing', async () => {
    await reserveJobQuota('ret1', 'STUDIO_SHOOT', 'job1');
    await refundJobQuota('nope', 'STUDIO_SHOOT');
    expect(count()).toBe(1);
  });

  it('the same job id cannot reserve twice: the statement fails and the counter is untouched', async () => {
    await reserveJobQuota('ret1', 'STUDIO_SHOOT', 'job1');
    await expect(reserveJobQuota('ret1', 'STUDIO_SHOOT', 'job1')).rejects.toThrow('duplicate');
    expect(count()).toBe(1);
  });

  it('over the limit writes no reservation row', async () => {
    await Promise.all([1, 2, 3].map((i) => reserveJobQuota('ret1', 'STUDIO_SHOOT', `job${i}`)));
    await expect(reserveJobQuota('ret1', 'STUDIO_SHOOT', 'job4')).rejects.toMatchObject({
      status: 402,
    });
    expect(reservations.has('job4|STUDIO_SHOOT')).toBe(false);
  });

  it('unlimited (-1): nothing written, refund and mark-spent are no-ops', async () => {
    m.override.mockResolvedValue({ limit_per_period: -1, period: 'MONTH' });
    await reserveJobQuota('ret1', 'STUDIO_SHOOT', 'job1');
    await refundJobQuota('job1', 'STUDIO_SHOOT');
    await markJobQuotaSpent('job1', 'STUDIO_SHOOT');
    expect(reservations.size).toBe(0);
    expect(count()).toBe(0);
  });
});
