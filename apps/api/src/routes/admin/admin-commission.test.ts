import { randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';
import { adminCommissionRoutes, commissionOf, monthRange, periodKey } from './admin-commission.js';

// ─── Mock Prisma (vi.hoisted to avoid Vitest hoisting TDZ issue) ─

const {
  mockSubscriptionPaymentFindMany,
  mockSubscriptionPaymentAggregate,
  mockExpenseFindMany,
  mockExpenseGroupBy,
  mockExpenseAggregate,
  mockExpenseCreate,
  mockExpenseUpdate,
  mockExpenseFindUnique,
  mockExpenseDelete,
  mockAuditLogCreate,
} = vi.hoisted(() => ({
  mockSubscriptionPaymentFindMany: vi.fn(),
  mockSubscriptionPaymentAggregate: vi.fn(),
  mockExpenseFindMany: vi.fn(),
  mockExpenseGroupBy: vi.fn(),
  mockExpenseAggregate: vi.fn(),
  mockExpenseCreate: vi.fn(),
  mockExpenseUpdate: vi.fn(),
  mockExpenseFindUnique: vi.fn(),
  mockExpenseDelete: vi.fn(),
  mockAuditLogCreate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    subscriptionPayment: {
      findMany: mockSubscriptionPaymentFindMany,
      aggregate: mockSubscriptionPaymentAggregate,
    },
    adminCommissionExpense: {
      findMany: mockExpenseFindMany,
      groupBy: mockExpenseGroupBy,
      aggregate: mockExpenseAggregate,
      create: mockExpenseCreate,
      findUnique: mockExpenseFindUnique,
      update: mockExpenseUpdate,
      delete: mockExpenseDelete,
    },
    auditLog: { create: mockAuditLogCreate },
  },
  getReplicaPrisma: () => ({ $queryRawUnsafe: vi.fn() }),
  getVaultPrisma: () => null,
  getPurgePrisma: () => ({ $executeRawUnsafe: vi.fn() }),
  encryptSecret: (plaintext: string) => `enc:${plaintext}`,
  maskSecret: (plaintext: string) => `masked:${plaintext.slice(-4)}`,
  invalidateSecret: vi.fn(),
  getSecret: vi.fn(),
  vaultDelete: vi.fn(),
  Prisma: {},
}));

// ─── Test Helpers ──────────────────────────────────────────────────

const ADMIN_KEY = 'test-admin-key-12345';

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(cookie, { secret: 'test-cookie-secret' });
  await app.register(adminCommissionRoutes, { prefix: '/v1/admin' });
  await app.ready();
  return app;
}

function authedHeaders() {
  return { 'x-admin-key': ADMIN_KEY };
}

function csrfHeaders() {
  const token = randomBytes(16).toString('hex');
  return {
    ...authedHeaders(),
    'x-csrf-token': token,
    cookie: `csrf-token=${token}`,
    'content-type': 'application/json',
  };
}

// CSRF headers WITHOUT a content-type — Fastify 400s an empty JSON body on
// bodyless requests (DELETE), so no content-type must be sent there.
function csrfHeadersNoBody() {
  const token = randomBytes(16).toString('hex');
  return {
    ...authedHeaders(),
    'x-csrf-token': token,
    cookie: `csrf-token=${token}`,
  };
}

beforeEach(() => {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  vi.clearAllMocks();
});

// ─── Pure helpers ──────────────────────────────────────────────────

describe('commission math', () => {
  it('takes exactly 3% of a monthly payment total (paise)', () => {
    expect(commissionOf(1_000_000)).toBe(30_000); // ₹10,000 → ₹300
    expect(commissionOf(999_999)).toBe(30_000); // rounds to nearest paise
    expect(commissionOf(0)).toBe(0);
  });

  it('buckets dates into YYYY-MM in IST (not UTC)', () => {
    // 2026-08-01 00:00 IST == 2026-07-31 18:30 UTC → still August for the admin.
    expect(periodKey(new Date('2026-07-31T18:30:00.000Z'))).toBe('2026-08');
    expect(periodKey(new Date('2026-07-31T18:29:59.000Z'))).toBe('2026-07');
    expect(periodKey(new Date('2026-08-17T10:00:00.000Z'))).toBe('2026-08');
  });

  it('monthRange covers a full IST month in UTC instants', () => {
    const { start, end } = monthRange('2026-08');
    // 1 Aug 00:00 IST == 31 Jul 18:30 UTC
    expect(start.toISOString()).toBe('2026-07-31T18:30:00.000Z');
    // 1 Sep 00:00 IST == 31 Aug 18:30 UTC
    expect(end.toISOString()).toBe('2026-08-31T18:30:00.000Z');
  });
});

// ─── GET /admin/commission/overview ───────────────────────────────

describe('GET /admin/commission/overview', () => {
  it('rolls up per-month totals across the last N months', async () => {
    mockSubscriptionPaymentFindMany.mockResolvedValue([
      { amount_inr: 1_000_000, paid_at: new Date('2026-08-05T06:00:00.000Z') }, // Aug
      { amount_inr: 500_000, paid_at: new Date('2026-08-10T06:00:00.000Z') }, // Aug
      { amount_inr: 250_000, paid_at: new Date('2026-07-02T06:00:00.000Z') }, // Jul
      { amount_inr: 999_999, paid_at: new Date('2026-07-31T18:30:00.000Z') }, // 1 Aug IST
    ]);
    mockExpenseGroupBy.mockResolvedValue([
      { period: '2026-08', _sum: { amount_inr: 12_000 }, _count: 2 },
    ]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/commission/overview?months=2',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const rows = res.json().data as Array<Record<string, number>>;
    expect(rows).toHaveLength(2);
    // Newest month first: Aug total ₹15,000 (1,000,000 + 500,000 + 999,999 → 2,499,999)
    expect(rows[0]).toMatchObject({
      period: '2026-08',
      total_payment_inr: 2_499_999,
      commission_inr: 75_000,
      spent_inr: 12_000,
      remaining_inr: 63_000,
      expense_count: 2,
    });
    // Jul: ₹2,500 total → ₹75 commission, nothing spent
    expect(rows[1]).toMatchObject({
      period: '2026-07',
      total_payment_inr: 250_000,
      commission_inr: 7_500,
      spent_inr: 0,
      remaining_inr: 7_500,
      expense_count: 0,
    });
  });

  it('can report a negative remaining when the pool is overspent', async () => {
    mockSubscriptionPaymentFindMany.mockResolvedValue([
      { amount_inr: 100_000, paid_at: new Date('2026-08-05T06:00:00.000Z') },
    ]);
    mockExpenseGroupBy.mockResolvedValue([
      { period: '2026-08', _sum: { amount_inr: 30_000 }, _count: 1 }, // > ₹3,000 pool
    ]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/commission/overview?months=1',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].remaining_inr).toBe(-27_000);
  });

  it('rejects unauthenticated requests', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/commission/overview',
    });
    expect(res.statusCode).toBe(403);
  });
});

// ─── GET /admin/commission/expenses ───────────────────────────────

describe('GET /admin/commission/expenses', () => {
  it('returns the month summary and ordered expense grid', async () => {
    mockSubscriptionPaymentAggregate.mockResolvedValue({ _sum: { amount_inr: 2_000_000 } });
    mockExpenseAggregate.mockResolvedValue({ _sum: { amount_inr: 15_000 }, _count: 2 });
    mockExpenseFindMany.mockResolvedValue([
      {
        id: 'exp_1',
        period: '2026-08',
        amount_inr: 10_000,
        category: 'Marketing',
        expense_date: new Date('2026-08-10T06:00:00.000Z'),
        notes: 'Instagram ads',
        created_at: new Date('2026-08-10T06:00:00.000Z'),
        updated_at: new Date('2026-08-10T06:00:00.000Z'),
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/commission/expenses?month=2026-08',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const { month, summary, expenses } = res.json().data;
    expect(month).toBe('2026-08');
    expect(summary).toMatchObject({
      total_payment_inr: 2_000_000,
      commission_inr: 60_000,
      spent_inr: 15_000,
      remaining_inr: 45_000,
      expense_count: 2,
    });
    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({ id: 'exp_1', category: 'Marketing', amount_inr: 10_000 });
  });

  it('defaults to the current IST month when month is omitted', async () => {
    mockSubscriptionPaymentAggregate.mockResolvedValue({ _sum: { amount_inr: 0 } });
    mockExpenseAggregate.mockResolvedValue({ _sum: { amount_inr: 0 }, _count: 0 });
    mockExpenseFindMany.mockResolvedValue([]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/commission/expenses',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it('rejects a malformed month', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/commission/expenses?month=2026-13',
      headers: authedHeaders(),
    });
    expect(res.statusCode).toBe(422);
  });
});

// ─── POST /admin/commission/expenses ──────────────────────────────

describe('POST /admin/commission/expenses', () => {
  it('records an expense and writes an audit entry', async () => {
    mockExpenseCreate.mockResolvedValue({
      id: 'exp_new',
      period: '2026-08',
      amount_inr: 5_000,
      category: 'Travel',
      expense_date: new Date('2026-08-12T06:00:00.000Z'),
      notes: 'Client visit — Delhi',
      created_at: new Date(),
      updated_at: new Date(),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/commission/expenses',
      headers: csrfHeaders(),
      payload: {
        period: '2026-08',
        amount_inr: 5_000,
        category: 'Travel',
        expense_date: '2026-08-12T06:00:00.000Z',
        notes: 'Client visit — Delhi',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ id: 'exp_new', amount_inr: 5_000 });
    expect(mockExpenseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ period: '2026-08', category: 'Travel', notes: 'Client visit — Delhi' }),
    });
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'AdminCommissionExpense',
      }),
    });
  });

  it('rejects an invalid period', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/commission/expenses',
      headers: csrfHeaders(),
      payload: {
        period: 'August 2026',
        amount_inr: 5_000,
        category: 'Travel',
        expense_date: '2026-08-12T06:00:00.000Z',
      },
    });
    expect(res.statusCode).toBe(422);
    expect(mockExpenseCreate).not.toHaveBeenCalled();
  });

  it('rejects a non-positive amount', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/commission/expenses',
      headers: csrfHeaders(),
      payload: {
        period: '2026-08',
        amount_inr: 0,
        category: 'Travel',
        expense_date: '2026-08-12T06:00:00.000Z',
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it('rejects a missing where/category', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/commission/expenses',
      headers: csrfHeaders(),
      payload: {
        period: '2026-08',
        amount_inr: 5_000,
        category: '',
        expense_date: '2026-08-12T06:00:00.000Z',
      },
    });
    expect(res.statusCode).toBe(422);
  });
});

// ─── PATCH /admin/commission/expenses/:id ─────────────────────────

describe('PATCH /admin/commission/expenses/:id', () => {
  const prevExpense = {
    id: 'exp_1',
    period: '2026-08',
    amount_inr: 10_000,
    category: 'Marketing',
    expense_date: new Date('2026-08-10T06:00:00.000Z'),
    notes: 'Instagram ads',
    created_at: new Date('2026-08-10T06:00:00.000Z'),
    updated_at: new Date('2026-08-10T06:00:00.000Z'),
  };

  it('updates a subset of fields and writes an audit entry', async () => {
    mockExpenseFindUnique.mockResolvedValue(prevExpense);
    mockExpenseUpdate.mockResolvedValue({
      ...prevExpense,
      amount_inr: 15_000,
      notes: 'Instagram + Meta ads',
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/admin/commission/expenses/exp_1',
      headers: csrfHeaders(),
      payload: { amount_inr: 15_000, notes: 'Instagram + Meta ads' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ id: 'exp_1', amount_inr: 15_000 });
    expect(mockExpenseUpdate).toHaveBeenCalledWith({
      where: { id: 'exp_1' },
      data: expect.objectContaining({ amount_inr: 15_000, notes: 'Instagram + Meta ads' }),
    });
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'AdminCommissionExpense',
        metadata: expect.objectContaining({
          before: expect.objectContaining({ amount_inr: 10_000 }),
          after: expect.objectContaining({ amount_inr: 15_000 }),
        }),
      }),
    });
  });

  it('clears notes when null is sent', async () => {
    mockExpenseFindUnique.mockResolvedValue(prevExpense);
    mockExpenseUpdate.mockResolvedValue({ ...prevExpense, notes: null });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/admin/commission/expenses/exp_1',
      headers: csrfHeaders(),
      payload: { notes: null },
    });

    expect(res.statusCode).toBe(200);
    expect(mockExpenseUpdate).toHaveBeenCalledWith({
      where: { id: 'exp_1' },
      data: expect.objectContaining({ notes: null }),
    });
  });

  it('rejects an empty update', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/admin/commission/expenses/exp_1',
      headers: csrfHeaders(),
      payload: {},
    });
    expect(res.statusCode).toBe(422);
    expect(mockExpenseUpdate).not.toHaveBeenCalled();
  });

  it('rejects a non-positive amount', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/admin/commission/expenses/exp_1',
      headers: csrfHeaders(),
      payload: { amount_inr: 0 },
    });
    expect(res.statusCode).toBe(422);
    expect(mockExpenseUpdate).not.toHaveBeenCalled();
  });

  it('404s for an unknown expense', async () => {
    mockExpenseFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/admin/commission/expenses/nope',
      headers: csrfHeaders(),
      payload: { amount_inr: 5_000 },
    });
    expect(res.statusCode).toBe(404);
    expect(mockExpenseUpdate).not.toHaveBeenCalled();
  });
});

// ─── DELETE /admin/commission/expenses/:id ────────────────────────

describe('DELETE /admin/commission/expenses/:id', () => {
  it('deletes an expense, audits it, and returns 204', async () => {
    mockExpenseDelete.mockResolvedValue({
      id: 'exp_1',
      period: '2026-08',
      amount_inr: 10_000,
      category: 'Marketing',
      expense_date: new Date('2026-08-10T06:00:00.000Z'),
      notes: null,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/admin/commission/expenses/exp_1',
      headers: csrfHeadersNoBody(),
    });

    expect(res.statusCode).toBe(204);
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'DELETE', resource_id: 'exp_1' }),
    });
  });

  it('404s for an unknown expense', async () => {
    mockExpenseDelete.mockRejectedValue(new Error('not found'));

    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/admin/commission/expenses/nope',
      headers: csrfHeadersNoBody(),
    });

    expect(res.statusCode).toBe(404);
  });
});
