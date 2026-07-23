import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { adminRoutes } from './admin.js';

// ─── Mock Prisma (vi.hoisted to avoid Vitest hoisting TDZ issue) ─

const {
  mockRetailerFindUnique,
  mockRetailerFindMany,
  mockRetailerCount,
  mockRetailerUpdate,
  mockRetailerUpdateMany,
  mockProductCount,
  mockProductFindMany,
  mockCollectionCount,
  mockCollectionUpdateMany,
  mockCollectionViewCount,
  mockCollectionEnquiryCount,
  mockStaffUpdateMany,
  mockTryOnUsageAggregate,
  mockSubscriptionFindMany,
  mockCustomerFindMany,
  mockTransaction,
  mockIntegrationFindMany,
  mockIntegrationFindUnique,
  mockIntegrationCreate,
  mockIntegrationUpdate,
  mockIntegrationDelete,
  mockAuditLogCreate,
} = vi.hoisted(() => ({
  mockRetailerFindUnique: vi.fn(),
  mockRetailerFindMany: vi.fn(),
  mockRetailerCount: vi.fn(),
  mockRetailerUpdate: vi.fn(),
  mockRetailerUpdateMany: vi.fn(),
  mockProductCount: vi.fn(),
  mockProductFindMany: vi.fn(),
  mockCollectionCount: vi.fn(),
  mockCollectionUpdateMany: vi.fn(),
  mockCollectionViewCount: vi.fn(),
  mockCollectionEnquiryCount: vi.fn(),
  mockStaffUpdateMany: vi.fn(),
  mockTryOnUsageAggregate: vi.fn(),
  mockSubscriptionFindMany: vi.fn(),
  mockCustomerFindMany: vi.fn(),
  mockTransaction: vi.fn((ops: unknown) =>
    Array.isArray(ops) ? Promise.all(ops) : (ops as () => unknown)(),
  ),
  mockIntegrationFindMany: vi.fn(),
  mockIntegrationFindUnique: vi.fn(),
  mockIntegrationCreate: vi.fn(),
  mockIntegrationUpdate: vi.fn(),
  mockIntegrationDelete: vi.fn(),
  mockAuditLogCreate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  encryptSecret: (plaintext: string) => `enc:${plaintext}`,
  maskSecret: (plaintext: string) => `masked:${plaintext.slice(-4)}`,
  invalidateSecret: vi.fn(),
  getSecret: vi.fn(),
  prisma: {
    integrationSetting: {
      findMany: mockIntegrationFindMany,
      findUnique: mockIntegrationFindUnique,
      create: mockIntegrationCreate,
      update: mockIntegrationUpdate,
      delete: mockIntegrationDelete,
    },
    auditLog: { create: mockAuditLogCreate },
    retailer: {
      findUnique: mockRetailerFindUnique,
      findMany: mockRetailerFindMany,
      count: mockRetailerCount,
      update: mockRetailerUpdate,
      updateMany: mockRetailerUpdateMany,
    },
    product: {
      count: mockProductCount,
      findMany: mockProductFindMany,
    },
    collection: { count: mockCollectionCount, updateMany: mockCollectionUpdateMany },
    collectionView: { count: mockCollectionViewCount },
    collectionEnquiry: { count: mockCollectionEnquiryCount },
    staff: { updateMany: mockStaffUpdateMany },
    tryOnUsageLog: { aggregate: mockTryOnUsageAggregate },
    subscription: { findMany: mockSubscriptionFindMany },
    customer: { findMany: mockCustomerFindMany },
    $transaction: mockTransaction,
  },
  Prisma: {},
}));

// ─── Test Helpers ──────────────────────────────────────────────────

const ADMIN_KEY = 'test-admin-key-12345';

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(adminRoutes, { prefix: '/v1/admin' });
  await app.ready();
  return app;
}

function authedHeaders() {
  return { 'x-admin-key': ADMIN_KEY };
}

function jsonHeaders() {
  return { ...authedHeaders(), 'content-type': 'application/json' };
}

const fakeRetailer = {
  id: 'retailer_1',
  shop_name: 'Test Shop',
  owner_name: 'Test Owner',
  phone: '+919999999999',
  city: 'Test City',
  state: 'Test State',
  gstin: '22AAAAA0000A1Z5',
  plan: 'GROWTH',
  plan_status: 'TRIAL',
  trial_ends_at: new Date(Date.now() + 7 * 86400000),
  plan_expires_at: null,
  onboarding_completed: true,
  onboarding_step: 0,
  created_at: new Date('2026-07-01'),
  updated_at: new Date('2026-07-14'),
  max_products: 2000,
  max_customers: 1000,
  try_on_credits: 100,
  max_staff_seats: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_API_KEY = ADMIN_KEY;
});

// ─── Auth Tests ───────────────────────────────────────────────────

describe('Admin auth', () => {
  it('returns 403 when no admin key is provided', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/admin/stats' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
    await app.close();
  });

  it('returns 403 when wrong admin key is provided', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers: { 'x-admin-key': 'wrong-key' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
    await app.close();
  });

  it('allows access with correct admin key', async () => {
    mockRetailerCount.mockResolvedValue(1);
    mockProductCount.mockResolvedValue(5);
    mockCollectionCount.mockResolvedValue(2);
    mockCollectionViewCount.mockResolvedValue(10);
    mockCollectionEnquiryCount.mockResolvedValue(3);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers: authedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── GET /admin/stats ─────────────────────────────────────────────

describe('GET /admin/stats', () => {
  it('returns platform statistics', async () => {
    mockRetailerCount.mockResolvedValueOnce(10).mockResolvedValueOnce(3).mockResolvedValueOnce(5);
    mockProductCount.mockResolvedValue(150);
    mockCollectionCount.mockResolvedValue(20);
    mockCollectionViewCount.mockResolvedValue(80);
    mockCollectionEnquiryCount.mockResolvedValue(15);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      total_retailers: 10,
      active_subscriptions: 3,
      trial_retailers: 5,
      total_products: 150,
      total_collections: 20,
      views_this_month: 80,
      enquiries_this_month: 15,
    });
    await app.close();
  });

  it('returns zero counts when no data exists', async () => {
    mockRetailerCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mockProductCount.mockResolvedValue(0);
    mockCollectionCount.mockResolvedValue(0);
    mockCollectionViewCount.mockResolvedValue(0);
    mockCollectionEnquiryCount.mockResolvedValue(0);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.total_retailers).toBe(0);
    expect(res.json().data.active_subscriptions).toBe(0);
    expect(res.json().data.trial_retailers).toBe(0);
    expect(res.json().data.total_products).toBe(0);
    await app.close();
  });
});

// ─── GET /admin/retailers ─────────────────────────────────────────

describe('GET /admin/retailers', () => {
  it('returns paginated retailer list', async () => {
    mockRetailerFindMany.mockResolvedValue([
      { ...fakeRetailer, _count: { products: 5, customers: 3, collections: 2 } },
    ]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/retailers',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].shop_name).toBe('Test Shop');
    expect(res.json().data[0].product_count).toBe(5);
    await app.close();
  });

  it('filters by search term', async () => {
    mockRetailerFindMany.mockResolvedValue([]);

    const app = await buildApp();
    await app.inject({
      method: 'GET',
      url: '/v1/admin/retailers?search=Mumbai',
      headers: authedHeaders(),
    });

    expect(mockRetailerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ city: expect.objectContaining({ contains: 'Mumbai' }) }),
          ]),
        }),
      }),
    );
    await app.close();
  });

  it('returns empty list when no retailers exist', async () => {
    mockRetailerFindMany.mockResolvedValue([]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/retailers',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
    expect(res.json().pagination.has_more).toBe(false);
    await app.close();
  });

  it('filters by city, plan, status, and state', async () => {
    mockRetailerFindMany.mockResolvedValue([]);

    const app = await buildApp();
    await app.inject({
      method: 'GET',
      url: '/v1/admin/retailers?city=Mumbai&plan=GROWTH&status=ACTIVE&state=Maharashtra',
      headers: authedHeaders(),
    });

    expect(mockRetailerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          city: expect.objectContaining({ contains: 'Mumbai' }),
          plan: 'GROWTH',
          plan_status: 'ACTIVE',
          state: expect.objectContaining({ equals: 'Maharashtra' }),
        }),
      }),
    );
    await app.close();
  });
});

// ─── DELETE /admin/retailers ───────────────────────────────────────

describe('DELETE /admin/retailers', () => {
  it('bulk soft-deletes retailers and archives their collections/staff', async () => {
    mockRetailerUpdateMany.mockResolvedValue({ count: 2 });
    mockCollectionUpdateMany.mockResolvedValue({ count: 0 });
    mockStaffUpdateMany.mockResolvedValue({ count: 0 });

    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/admin/retailers',
      headers: jsonHeaders(),
      body: { ids: ['retailer_1', 'retailer_2'] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.deleted).toBe(2);
    expect(mockRetailerUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['retailer_1', 'retailer_2'] } }),
        data: expect.objectContaining({ deleted_at: expect.any(Date) }),
      }),
    );
    await app.close();
  });

  it('rejects an empty ids array', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/admin/retailers',
      headers: jsonHeaders(),
      body: { ids: [] },
    });

    expect(res.statusCode).toBe(422);
    await app.close();
  });
});

// ─── GET /admin/customers ──────────────────────────────────────────

describe('GET /admin/customers', () => {
  it('returns cross-retailer customer list with retailer info', async () => {
    mockCustomerFindMany.mockResolvedValue([
      {
        id: 'c1',
        name: 'Test Customer',
        phone: '+919999999999',
        gender: 'FEMALE',
        consent_given: true,
        created_at: new Date('2026-07-10'),
        retailer: { id: 'retailer_1', shop_name: 'Test Shop', city: 'Test City' },
        _count: { measurements: 2 },
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/customers',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].measurement_count).toBe(2);
    expect(res.json().data[0].retailer.shop_name).toBe('Test Shop');
    await app.close();
  });

  it('requires the admin key', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/admin/customers' });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

// ─── GET /admin/retailers/:id ─────────────────────────────────────

describe('GET /admin/retailers/:id', () => {
  it('returns full retailer detail', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      ...fakeRetailer,
      _count: { products: 5, customers: 3, collections: 2, staff: 1 },
    });
    mockTryOnUsageAggregate
      .mockResolvedValueOnce({ _count: 2, _sum: { cost_usd: 0.01 } })
      .mockResolvedValueOnce({ _count: 10, _sum: { cost_usd: 0.05 } });
    mockProductFindMany.mockResolvedValue([
      {
        id: 'prod_1',
        name: 'Pink Kurti',
        category: 'Kurti',
        primary_color: 'Pink',
        price_min: 150000,
        status: 'AVAILABLE',
        created_at: new Date(),
        _count: { photos: 2 },
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/retailers/retailer_1',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.shop_name).toBe('Test Shop');
    expect(data.product_count).toBe(5);
    expect(data.customer_count).toBe(3);
    expect(data.collection_count).toBe(2);
    expect(data.staff_count).toBe(1);
    expect(data.try_on.this_month.count).toBe(2);
    expect(data.try_on.this_month.cost_usd).toBe(0.01);
    expect(data.try_on.total.count).toBe(10);
    expect(data.recent_products).toHaveLength(1);
    expect(data.recent_products[0].name).toBe('Pink Kurti');
    await app.close();
  });

  it('returns 404 when retailer does not exist', async () => {
    mockRetailerFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/retailers/nonexistent',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns zero try-on stats when no usage exists', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      ...fakeRetailer,
      _count: { products: 0, customers: 0, collections: 0, staff: 0 },
    });
    mockTryOnUsageAggregate
      .mockResolvedValueOnce({ _count: 0, _sum: { cost_usd: null } })
      .mockResolvedValueOnce({ _count: 0, _sum: { cost_usd: null } });
    mockProductFindMany.mockResolvedValue([]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/retailers/retailer_1',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.try_on.this_month.count).toBe(0);
    expect(res.json().data.try_on.this_month.cost_usd).toBe(0);
    await app.close();
  });
});

// ─── POST /admin/retailers/:id/extend-trial ───────────────────────

describe('POST /admin/retailers/:id/extend-trial', () => {
  it('extends trial by the specified days', async () => {
    const trialEnd = new Date(Date.now() + 7 * 86400000);
    mockRetailerFindUnique.mockResolvedValue({ id: 'retailer_1', trial_ends_at: trialEnd });
    mockRetailerUpdate.mockResolvedValue({});

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/retailers/retailer_1/extend-trial',
      headers: jsonHeaders(),
      body: { days: 14 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.plan_status).toBe('TRIAL');
    expect(mockRetailerUpdate).toHaveBeenCalledWith({
      where: { id: 'retailer_1' },
      data: expect.objectContaining({ plan_status: 'TRIAL' }),
    });
    await app.close();
  });

  it('sets trial from today when existing trial has expired', async () => {
    const expiredTrial = new Date(Date.now() - 30 * 86400000);
    mockRetailerFindUnique.mockResolvedValue({ id: 'retailer_1', trial_ends_at: expiredTrial });
    mockRetailerUpdate.mockResolvedValue({});

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/retailers/retailer_1/extend-trial',
      headers: jsonHeaders(),
      body: { days: 7 },
    });

    expect(res.statusCode).toBe(200);
    const newEnd = new Date(res.json().data.trial_ends_at);
    const expectedMin = Date.now() + 6.5 * 86400000;
    const expectedMax = Date.now() + 7.5 * 86400000;
    expect(newEnd.getTime()).toBeGreaterThan(expectedMin);
    expect(newEnd.getTime()).toBeLessThan(expectedMax);
    await app.close();
  });

  it('returns 404 when retailer does not exist', async () => {
    mockRetailerFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/retailers/nonexistent/extend-trial',
      headers: jsonHeaders(),
      body: { days: 14 },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('rejects days outside the valid range', async () => {
    const app = await buildApp();

    const res1 = await app.inject({
      method: 'POST',
      url: '/v1/admin/retailers/retailer_1/extend-trial',
      headers: jsonHeaders(),
      body: { days: 0 },
    });
    expect(res1.statusCode).toBe(422);

    const res2 = await app.inject({
      method: 'POST',
      url: '/v1/admin/retailers/retailer_1/extend-trial',
      headers: jsonHeaders(),
      body: { days: 100 },
    });
    expect(res2.statusCode).toBe(422);

    await app.close();
  });

  it('rejects missing days field', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/retailers/retailer_1/extend-trial',
      headers: jsonHeaders(),
      body: {},
    });

    expect(res.statusCode).toBe(422);
    await app.close();
  });
});

// ─── POST /admin/retailers/:id/change-plan ────────────────────────

describe('POST /admin/retailers/:id/change-plan', () => {
  it('changes plan to STARTER with correct limits', async () => {
    mockRetailerFindUnique.mockResolvedValue({ ...fakeRetailer });
    mockRetailerUpdate.mockResolvedValue({});

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/retailers/retailer_1/change-plan',
      headers: jsonHeaders(),
      body: { plan: 'STARTER', status: 'ACTIVE' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.plan).toBe('STARTER');
    expect(res.json().data.plan_status).toBe('ACTIVE');
    expect(mockRetailerUpdate).toHaveBeenCalledWith({
      where: { id: 'retailer_1' },
      data: expect.objectContaining({
        plan: 'STARTER',
        max_products: 500,
        max_customers: 999999,
        try_on_credits: 0,
      }),
    });
    await app.close();
  });

  it('changes plan to PRO with unlimited limits', async () => {
    mockRetailerFindUnique.mockResolvedValue({ ...fakeRetailer });
    mockRetailerUpdate.mockResolvedValue({});

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/retailers/retailer_1/change-plan',
      headers: jsonHeaders(),
      body: { plan: 'PRO', status: 'ACTIVE' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockRetailerUpdate).toHaveBeenCalledWith({
      where: { id: 'retailer_1' },
      data: expect.objectContaining({
        plan: 'PRO',
        max_products: 999999,
        max_customers: 999999,
      }),
    });
    await app.close();
  });

  it('extends trial when extend_trial_days is provided', async () => {
    mockRetailerFindUnique.mockResolvedValue({ ...fakeRetailer });
    mockRetailerUpdate.mockResolvedValue({});

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/retailers/retailer_1/change-plan',
      headers: jsonHeaders(),
      body: { plan: 'GROWTH', status: 'TRIAL', extend_trial_days: 30 },
    });

    expect(res.statusCode).toBe(200);
    expect(mockRetailerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trial_ends_at: expect.any(Date),
        }),
      }),
    );
    await app.close();
  });

  it('returns 404 when retailer does not exist', async () => {
    mockRetailerFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/retailers/nonexistent/change-plan',
      headers: jsonHeaders(),
      body: { plan: 'STARTER', status: 'ACTIVE' },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('rejects invalid plan names', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/retailers/retailer_1/change-plan',
      headers: jsonHeaders(),
      body: { plan: 'ULTIMATE', status: 'ACTIVE' },
    });

    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('rejects invalid status values', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/retailers/retailer_1/change-plan',
      headers: jsonHeaders(),
      body: { plan: 'GROWTH', status: 'UNKNOWN' },
    });

    expect(res.statusCode).toBe(422);
    await app.close();
  });
});

// ─── GET /admin/usage ─────────────────────────────────────────────

describe('GET /admin/usage', () => {
  it('returns usage stats with MRR calculated from subscriptions', async () => {
    mockTryOnUsageAggregate.mockResolvedValue({ _count: 5, _sum: { cost_usd: 0.025 } });
    mockSubscriptionFindMany.mockResolvedValue([
      { amount_inr: 99900, billing_period: 'monthly' },
      { amount_inr: 999900, billing_period: 'annual' },
      { amount_inr: 249900, billing_period: 'monthly' },
    ]);
    mockRetailerCount.mockResolvedValueOnce(3).mockResolvedValueOnce(10);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/usage',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.total_retailers).toBe(10);
    expect(res.json().data.trial_retailers).toBe(3);
    expect(res.json().data.active_subscriptions).toBe(3);
    expect(res.json().data.mrr_inr).toBe(433125);
    expect(res.json().data.try_on_this_month).toBe(5);
    expect(res.json().data.try_on_cost_usd).toBe(0.025);
    await app.close();
  });

  it('returns zero MRR when no active subscriptions exist', async () => {
    mockTryOnUsageAggregate.mockResolvedValue({ _count: 0, _sum: { cost_usd: null } });
    mockSubscriptionFindMany.mockResolvedValue([]);
    mockRetailerCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/usage',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.mrr_inr).toBe(0);
    expect(res.json().data.active_subscriptions).toBe(0);
    expect(res.json().data.try_on_cost_usd).toBe(0);
    await app.close();
  });
});

// ─── Integration Settings (F-012) ───────────────────────────────────

describe('Admin integrations', () => {
  it('rejects unauthenticated requests', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/admin/integrations' });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('lists the full catalog, marking unconfigured keys as not configured', async () => {
    mockIntegrationFindMany.mockResolvedValue([]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/integrations',
      headers: authedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((row: { configured: boolean }) => row.configured === false)).toBe(true);
    await app.close();
  });

  it('creates a credential, storing only the encrypted+masked form, never the raw value', async () => {
    mockIntegrationFindUnique.mockResolvedValue(null);
    mockIntegrationCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'int_1', ...data, created_at: new Date(), updated_at: new Date() }),
    );

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/integrations',
      headers: jsonHeaders(),
      payload: { key_name: 'RAZORPAY_KEY_SECRET', value: 'rzp_live_supersecretvalue' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.encrypted_value).toBeUndefined();
    expect(body.masked_preview).toBe('masked:alue');
    expect(mockIntegrationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key_name: 'RAZORPAY_KEY_SECRET',
          encrypted_value: 'enc:rzp_live_supersecretvalue',
        }),
      }),
    );
    expect(mockAuditLogCreate).toHaveBeenCalled();
    await app.close();
  });

  it('rejects an unknown key_name', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/integrations',
      headers: jsonHeaders(),
      payload: { key_name: 'NOT_A_REAL_KEY', value: 'whatever' },
    });
    expect(res.statusCode).toBe(422);
    expect(mockIntegrationCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects creating a key that is already configured', async () => {
    mockIntegrationFindUnique.mockResolvedValue({ id: 'int_1', key_name: 'ANTHROPIC_API_KEY' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/integrations',
      headers: jsonHeaders(),
      payload: { key_name: 'ANTHROPIC_API_KEY', value: 'sk-ant-new' },
    });
    expect(res.statusCode).toBe(422);
    expect(mockIntegrationCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rotates a value on PATCH without ever returning it', async () => {
    mockIntegrationFindUnique.mockResolvedValue({ id: 'int_1', key_name: 'OPENAI_API_KEY' });
    mockIntegrationUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'int_1', key_name: 'OPENAI_API_KEY', ...data }),
    );

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/admin/integrations/int_1',
      headers: jsonHeaders(),
      payload: { value: 'sk-new-rotated-key' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.encrypted_value).toBeUndefined();
    expect(mockIntegrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ encrypted_value: 'enc:sk-new-rotated-key' }),
      }),
    );
    await app.close();
  });

  it('deletes a credential row, falling back to .env for that key', async () => {
    mockIntegrationFindUnique.mockResolvedValue({ id: 'int_1', key_name: 'META_APP_SECRET' });
    mockIntegrationDelete.mockResolvedValue({ id: 'int_1' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/admin/integrations/int_1',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(204);
    expect(mockIntegrationDelete).toHaveBeenCalledWith({ where: { id: 'int_1' } });
    await app.close();
  });
});
