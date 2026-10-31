/**
 * H6-2 / RC-155: AI tagging reserves its credits atomically BEFORE the provider call and settles
 * to what the provider actually charged, instead of check-then-increment.
 *
 * The fake models the guarantee the SQL gives (one INSERT .. ON CONFLICT .. WHERE
 * count + n <= limit is atomic row-wise) by running each statement synchronously; the race under
 * test is everything before it, since all callers await the limit lookup first.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  override: vi.fn(),
  retailerFind: vi.fn(),
  planLimit: vi.fn(),
  exec: vi.fn(),
  upsert: vi.fn(),
  logCreate: vi.fn(),
  credits: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailerLimitOverride: { findUnique: m.override },
    retailer: { findUniqueOrThrow: m.retailerFind },
    planLimit: { findUnique: m.planLimit },
    usageCounter: { upsert: m.upsert },
    aiUsageLog: { create: m.logCreate },
    $executeRaw: m.exec,
  },
}));
vi.mock('@kanchuki/ai', () => ({ reserveAiCredits: m.credits }));

import { recordAiUsage, reserveTaggingQuota } from './ai-usage.js';

const rows = new Map<string, number>();
const count = () => [...rows.values()].reduce((a, b) => a + b, 0);

/** Values order mirrors the SQL in quota.ts (reserveQuota insert / refund update). */
function fakeExec(strings: TemplateStringsArray, ...v: unknown[]) {
  const sql = strings.join('?');
  if (sql.includes('INSERT INTO usage_counters')) {
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
    if (cur !== undefined && cur + amount > limit) return Promise.resolve(0);
    rows.set(key, (cur ?? 0) + amount);
    return Promise.resolve(1);
  }
  const [give, retailer, type, start] = v as [number, string, string, Date];
  const key = `${retailer}|${type}|${start.getTime()}`;
  rows.set(key, Math.max((rows.get(key) ?? 0) - give, 0));
  return Promise.resolve(1);
}

const served = (credits: number) => ({
  provider_id: 'p1',
  provider_type: 'ANTHROPIC' as const,
  model_name: 'm',
  credits_per_call: credits,
  resource_type: 'AI_TAGGING_CALL' as const,
});

beforeEach(() => {
  vi.resetAllMocks();
  rows.clear();
  m.exec.mockImplementation(fakeExec);
  m.upsert.mockResolvedValue({});
  m.logCreate.mockResolvedValue({});
  m.credits.mockResolvedValue(4); // worst-case provider cost
  m.override.mockResolvedValue({ limit_per_period: 10, period: 'MONTH' });
});

describe('reserveTaggingQuota', () => {
  it('6 concurrent callers, limit 10, worst case 4 credits: only 2 get in', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => reserveTaggingQuota('ret1')),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected.every((r) => r.reason.code === 'PLAN_LIMIT_EXCEEDED')).toBe(true);
    expect(count()).toBe(8);
  });

  it('settles down to what the serving provider charged', async () => {
    const q = await reserveTaggingQuota('ret1');
    q.onProviderUsed(served(1));
    await q.settle();
    expect(count()).toBe(1);
    expect(m.upsert).not.toHaveBeenCalled(); // no second increment on top of the reserve
    expect(m.logCreate).toHaveBeenCalledOnce(); // attribution row is still written
  });

  it('gives everything back when the provider never served (failure)', async () => {
    const q = await reserveTaggingQuota('ret1');
    await q.settle();
    expect(count()).toBe(0);
    expect(m.logCreate).not.toHaveBeenCalled();
  });

  it('counts the excess if the serving provider cost more than was reserved', async () => {
    const q = await reserveTaggingQuota('ret1');
    q.onProviderUsed(served(6)); // pricier provider came up mid-call
    await q.settle();
    expect(count()).toBe(4); // reserve kept whole
    expect(m.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { count: { increment: 2 } } }),
    );
  });

  it('on an unlimited plan nothing is reserved but the spend is still counted', async () => {
    m.override.mockResolvedValue({ limit_per_period: -1, period: 'MONTH' });
    const q = await reserveTaggingQuota('ret1');
    q.onProviderUsed(served(1));
    await q.settle();
    expect(m.exec).not.toHaveBeenCalled();
    expect(m.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { count: { increment: 1 } } }),
    );
  });
});

describe('recordAiUsage', () => {
  it('meters by default (other callers unchanged) and not with { meter: false }', async () => {
    recordAiUsage('ret1')(served(1));
    recordAiUsage('ret1', { meter: false })(served(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(m.upsert).toHaveBeenCalledTimes(1);
    expect(m.logCreate).toHaveBeenCalledTimes(2);
  });
});

describe('no check-then-increment pair on AI_TAGGING_CALL', () => {
  // A file that meters per provider call (recordAiUsage default) AND gates with checkQuota /
  // reserveQuota on the same resource either races (check) or charges twice (reserve), so it must
  // go through reserveTaggingQuota, which owns both halves.
  const srcDir = fileURLToPath(new URL('../', import.meta.url));
  const files: string[] = [];
  (function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const p = `${dir}${name}`;
      if (statSync(p).isDirectory()) walk(`${p}/`);
      else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) files.push(p);
    }
  })(srcDir);

  it('every such file uses reserveTaggingQuota', () => {
    const offenders = files.filter((f) => {
      if (f.endsWith('lib/ai-usage.ts') || f.endsWith('lib/quota.ts')) return false;
      const src = readFileSync(f, 'utf8');
      const metered = /recordAiUsage\((?![^)]*meter: false)[^)]*\)/.test(src);
      const gated = /(checkQuota|reserveQuota)\([^)]*'AI_TAGGING_CALL'/.test(src);
      return metered && gated && !src.includes('reserveTaggingQuota');
    });
    expect(offenders.map((f) => f.split('/src/')[1])).toEqual([]);
  });
});
