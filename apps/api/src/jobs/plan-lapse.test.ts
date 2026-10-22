// RC-078 — lapsed plans drop to STARTER. Every paid gate reads `retailer.plan`,
// so the job's WHERE clause is the whole security boundary: it must catch
// expired trials and lapsed subscriptions, and nothing else.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlePlanLapse } from './plan-lapse.js';

const { mockFindMany, mockUpdateMany, mockCount, mockAuditCreate } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockCount: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findMany: mockFindMany, updateMany: mockUpdateMany, count: mockCount },
    auditLog: { create: mockAuditCreate },
  },
}));

const NOW = new Date('2026-10-22T10:00:00Z');
const PAST = new Date('2026-10-01T00:00:00Z');
const FUTURE = new Date('2026-11-01T00:00:00Z');

type Row = {
  id: string;
  plan: 'STARTER' | 'GROWTH' | 'PRO';
  plan_status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'COMPLETED';
  trial_ends_at: Date | null;
  plan_expires_at: Date | null;
  deleted_at: Date | null;
};

// Evaluates the Prisma `where` the job builds against an in-memory row, so the
// tests assert behaviour (which rows lapse) rather than the query's shape.
function matches(where: Record<string, unknown>, r: Row): boolean {
  return Object.entries(where).every(([k, cond]) => {
    if (k === 'OR') return (cond as Record<string, unknown>[]).some((w) => matches(w, r));
    if (k === 'AND') return (cond as Record<string, unknown>[]).every((w) => matches(w, r));
    const v = r[k as keyof Row];
    if (cond === null) return v === null;
    if (typeof cond !== 'object' || cond instanceof Date) return v === cond;
    const c = cond as Record<string, unknown>;
    if ('not' in c) return v !== c.not;
    if ('in' in c) return (c.in as unknown[]).includes(v);
    if ('lt' in c) return v instanceof Date && v < (c.lt as Date);
    throw new Error(`unsupported condition on ${k}`);
  });
}

function row(over: Partial<Row>): Row {
  return {
    id: 'r1',
    plan: 'PRO',
    plan_status: 'TRIAL',
    trial_ends_at: null,
    plan_expires_at: null,
    deleted_at: null,
    ...over,
  };
}

function useRows(rows: Row[]) {
  mockFindMany.mockImplementation(async ({ where }) =>
    rows.filter((r) => matches(where, r)).map(({ id, plan }) => ({ id, plan })),
  );
  mockUpdateMany.mockImplementation(async ({ where }) => ({
    count: rows.filter((r) => matches(where, r)).length,
  }));
  mockCount.mockImplementation(async ({ where }) => rows.filter((r) => matches(where, r)).length);
}

async function lapsedIds(rows: Row[]) {
  useRows(rows);
  await handlePlanLapse(NOW);
  return mockUpdateMany.mock.calls.map((c) => c[0].where.id);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuditCreate.mockResolvedValue({});
});

describe('handlePlanLapse', () => {
  it('drops an expired TRIAL to STARTER with STARTER limits', async () => {
    useRows([row({ trial_ends_at: PAST })]);
    const result = await handlePlanLapse(NOW);

    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockUpdateMany.mock.calls[0]?.[0].data).toEqual({
      plan: 'STARTER',
      max_products: 500,
      max_customers: 999999,
    });
    expect(result.downgraded).toBe(1);
  });

  it('leaves a TRIAL that has not ended', async () => {
    expect(await lapsedIds([row({ trial_ends_at: FUTURE })])).toEqual([]);
  });

  it('leaves a TRIAL with no end date, but counts it', async () => {
    useRows([row({ trial_ends_at: null })]);
    const result = await handlePlanLapse(NOW);
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(result.trialWithoutEnd).toBe(1);
  });

  it('keeps a CANCELLED store paid until plan_expires_at', async () => {
    expect(
      await lapsedIds([row({ plan_status: 'CANCELLED', plan_expires_at: FUTURE })]),
    ).toEqual([]);
  });

  it.each(['CANCELLED', 'PAST_DUE', 'COMPLETED'] as const)(
    'drops %s past plan_expires_at (or with none) to STARTER',
    async (plan_status) => {
      expect(
        await lapsedIds([
          row({ id: 'past', plan_status, plan_expires_at: PAST }),
          row({ id: 'none', plan_status, plan_expires_at: null }),
        ]),
      ).toEqual(['past', 'none']);
    },
  );

  it('leaves ACTIVE, already-STARTER and deleted retailers alone', async () => {
    expect(
      await lapsedIds([
        row({ plan_status: 'ACTIVE', plan_expires_at: PAST }),
        row({ plan: 'STARTER', trial_ends_at: PAST }),
        row({ trial_ends_at: PAST, deleted_at: PAST }),
      ]),
    ).toEqual([]);
  });

  it('re-checks the lapse condition in the update, so a re-subscribe in between is not downgraded', async () => {
    const r = row({ trial_ends_at: PAST });
    useRows([r]);
    mockFindMany.mockImplementationOnce(async () => {
      const found = [{ id: r.id, plan: r.plan }];
      r.plan_status = 'ACTIVE'; // webhook lands between the read and the write
      return found;
    });

    const result = await handlePlanLapse(NOW);

    expect(result.downgraded).toBe(0);
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it('writes one system audit row per downgrade', async () => {
    useRows([row({ id: 'a', plan: 'GROWTH', trial_ends_at: PAST })]);
    await handlePlanLapse(NOW);

    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: {
        actor_type: 'system',
        action: 'update',
        resource_type: 'Retailer',
        resource_id: 'a',
        metadata: { from_plan: 'GROWTH', reason: 'plan_lapsed' },
      },
    });
  });
});
