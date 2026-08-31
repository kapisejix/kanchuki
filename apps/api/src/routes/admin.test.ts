import { randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
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
  mockCollectionFindMany,
  mockCollectionUpdateMany,
  mockCollectionViewCount,
  mockCollectionEnquiryCount,
  mockStaffUpdateMany,
  mockSubscriptionFindMany,
  mockCustomerFindMany,
  mockTransaction,
  mockIntegrationFindMany,
  mockIntegrationFindUnique,
  mockIntegrationCreate,
  mockIntegrationUpdate,
  mockIntegrationDelete,
  mockAuditLogCreate,
  mockAuditLogFindMany,
  mockAuditLogCount,
  mockAiProviderFindMany,
  mockAiProviderFindUnique,
  mockAiProviderCreate,
  mockAiProviderUpdate,
  mockAiProviderDelete,
  mockAiUsageGroupBy,
  mockDefaultAttributeFindMany,
  mockDefaultAttributeCreate,
  mockDefaultAttributeUpdate,
  mockDefaultAttributeDelete,
  mockHardDeleteRetailer,
} = vi.hoisted(() => ({
  mockRetailerFindUnique: vi.fn(),
  mockRetailerFindMany: vi.fn(),
  mockRetailerCount: vi.fn(),
  mockRetailerUpdate: vi.fn(),
  mockRetailerUpdateMany: vi.fn(),
  mockProductCount: vi.fn(),
  mockProductFindMany: vi.fn(),
  mockCollectionCount: vi.fn(),
  mockCollectionFindMany: vi.fn(),
  mockCollectionUpdateMany: vi.fn(),
  mockCollectionViewCount: vi.fn(),
  mockCollectionEnquiryCount: vi.fn(),
  mockStaffUpdateMany: vi.fn(),

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
  mockAuditLogFindMany: vi.fn(),
  mockAuditLogCount: vi.fn(),
  mockAiProviderFindMany: vi.fn(),
  mockAiProviderFindUnique: vi.fn(),
  mockAiProviderCreate: vi.fn(),
  mockAiProviderUpdate: vi.fn(),
  mockAiProviderDelete: vi.fn(),
  mockAiUsageGroupBy: vi.fn(),
  mockDefaultAttributeFindMany: vi.fn(),
  mockDefaultAttributeCreate: vi.fn(),
  mockDefaultAttributeUpdate: vi.fn(),
  mockDefaultAttributeDelete: vi.fn(),
  mockHardDeleteRetailer: vi.fn(),
}));

// hardDeleteRetailer uses a separate scoped-role Prisma client
// (getPurgePrisma(), not the mocked `prisma` above) — mock the job function
// itself rather than trying to stub its raw-SQL internals.
vi.mock('../jobs/purge-retailer-now.js', () => ({ hardDeleteRetailer: mockHardDeleteRetailer }));

vi.mock('@kanchuki/db', () => ({
  vaultDelete: vi.fn(),
  getReplicaPrisma: () => ({ $queryRawUnsafe: vi.fn() }),
  getVaultPrisma: () => null,
  // Import-chain requirement only: admin-storage/jobs graph pulls
  // purge-soft-deleted, which calls getPurgePrisma() at module top-level.
  getPurgePrisma: () => ({
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $transaction: (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : Promise.resolve(),
    retailer: { findUnique: vi.fn() },
  }),
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
    auditLog: {
      create: mockAuditLogCreate,
      findMany: mockAuditLogFindMany,
      count: mockAuditLogCount,
    },
    aiProviderConfig: {
      findMany: mockAiProviderFindMany,
      findUnique: mockAiProviderFindUnique,
      create: mockAiProviderCreate,
      update: mockAiProviderUpdate,
      delete: mockAiProviderDelete,
    },
    aiUsageLog: { groupBy: mockAiUsageGroupBy },
    defaultProductAttribute: {
      findMany: mockDefaultAttributeFindMany,
      create: mockDefaultAttributeCreate,
      update: mockDefaultAttributeUpdate,
      delete: mockDefaultAttributeDelete,
    },
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
    collection: {
      findMany: mockCollectionFindMany,
      count: mockCollectionCount,
      updateMany: mockCollectionUpdateMany,
    },
    collectionView: { count: mockCollectionViewCount },
    collectionEnquiry: { count: mockCollectionEnquiryCount },
    staff: { updateMany: mockStaffUpdateMany },

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
  await app.register(cookie, { secret: 'test-cookie-secret' });
  await app.register(adminRoutes, { prefix: '/v1/admin' });
  await app.ready();
  return app;
}

function authedHeaders() {
  return { 'x-admin-key': ADMIN_KEY };
}

/** Generate CSRF headers for mutating admin requests (POST/PUT/PATCH/DELETE).
 *  Sets both the csrf-token cookie and x-csrf-token header to the same random
 *  value so the server's CSRF check (cookie === header) passes.
 */
function csrfHeaders() {
  const token = randomBytes(16).toString('hex');
  return {
    ...authedHeaders(),
    'x-csrf-token': token,
    cookie: `csrf-token=${token}`,
    'content-type': 'application/json',
  };
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
  it('hard-deletes retailers via hardDeleteRetailer after a vault snapshot', async () => {
    mockRetailerFindMany.mockResolvedValue([
      {
        id: 'retailer_1',
        shop_name: 'Shop 1',
        city: 'City 1',
        plan: 'STARTER',
        plan_status: 'TRIAL',
      },
      {
        id: 'retailer_2',
        shop_name: 'Shop 2',
        city: 'City 2',
        plan: 'GROWTH',
        plan_status: 'ACTIVE',
      },
    ]);
    mockCollectionFindMany.mockResolvedValue([]);
    mockHardDeleteRetailer.mockResolvedValue(undefined);

    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/admin/retailers',
      headers: csrfHeaders(),
      body: { ids: ['retailer_1', 'retailer_2'] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.deleted).toBe(2);
    expect(mockHardDeleteRetailer).toHaveBeenCalledWith('retailer_1');
    expect(mockHardDeleteRetailer).toHaveBeenCalledWith('retailer_2');
    expect(mockHardDeleteRetailer).toHaveBeenCalledTimes(2);
    // Vault snapshot must happen before the row is gone for good.
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'HARD_DELETE', resource_type: 'Retailer' }),
      }),
    );
    await app.close();
  });

  it('rejects an empty ids array', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/admin/retailers',
      headers: csrfHeaders(),
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
    mockProductFindMany.mockResolvedValue([]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/retailers/retailer_1',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(200);

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
      headers: csrfHeaders(),
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
      headers: csrfHeaders(),
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
      headers: csrfHeaders(),
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
      headers: csrfHeaders(),
      body: { days: 0 },
    });
    expect(res1.statusCode).toBe(422);

    const res2 = await app.inject({
      method: 'POST',
      url: '/v1/admin/retailers/retailer_1/extend-trial',
      headers: csrfHeaders(),
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
      headers: csrfHeaders(),
      body: {},
    });

    expect(res.statusCode).toBe(422);
    await app.close();
  });
});

// ─── POST /admin/retailers/:id/feature ───────────────────────────
// Store-directory pin: featured stores sort to the top of /stores and the
// homepage teaser (public-stores.ts orderBy). Mirrors suspend/unsuspend.

describe('POST /admin/retailers/:id/feature', () => {
  it('pins a retailer to the store directory with an audit log', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      id: 'retailer_1',
      shop_name: 'Test Shop',
      is_featured: false,
    });
    mockRetailerUpdate.mockResolvedValue({ is_featured: true, featured_at: new Date() });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/retailers/retailer_1/feature',
      headers: csrfHeaders(),
      body: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.is_featured).toBe(true);
    expect(mockRetailerUpdate).toHaveBeenCalledWith({
      where: { id: 'retailer_1' },
      data: { is_featured: true, featured_at: expect.any(Date) },
    });
    const audit = mockAuditLogCreate.mock.calls[0]?.[0];
    expect(audit.data.action).toBe('FEATURE_STORE');
    expect(audit.data.resource_type).toBe('Retailer');
    expect(audit.data.metadata).toEqual({ shop_name: 'Test Shop' });
    await app.close();
  });

  it('returns 422 when the retailer is already featured', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      id: 'retailer_1',
      shop_name: 'Test Shop',
      is_featured: true,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/retailers/retailer_1/feature',
      headers: csrfHeaders(),
      body: {},
    });

    expect(res.statusCode).toBe(422);
    expect(mockRetailerUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 404 when retailer does not exist', async () => {
    mockRetailerFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/retailers/nonexistent/feature',
      headers: csrfHeaders(),
      body: {},
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    await app.close();
  });
});

// ─── POST /admin/retailers/:id/unfeature ─────────────────────────

describe('POST /admin/retailers/:id/unfeature', () => {
  it('unpins a featured retailer with an audit log', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      id: 'retailer_1',
      shop_name: 'Test Shop',
      is_featured: true,
    });
    mockRetailerUpdate.mockResolvedValue({ is_featured: false, featured_at: null });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/retailers/retailer_1/unfeature',
      headers: csrfHeaders(),
      body: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.is_featured).toBe(false);
    expect(mockRetailerUpdate).toHaveBeenCalledWith({
      where: { id: 'retailer_1' },
      data: { is_featured: false, featured_at: null },
    });
    const audit = mockAuditLogCreate.mock.calls[0]?.[0];
    expect(audit.data.action).toBe('UNFEATURE_STORE');
    expect(audit.data.metadata).toEqual({ shop_name: 'Test Shop' });
    await app.close();
  });

  it('returns 422 when the retailer is not featured', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      id: 'retailer_1',
      shop_name: 'Test Shop',
      is_featured: false,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/retailers/retailer_1/unfeature',
      headers: csrfHeaders(),
      body: {},
    });

    expect(res.statusCode).toBe(422);
    expect(mockRetailerUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 404 when retailer does not exist', async () => {
    mockRetailerFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/retailers/nonexistent/unfeature',
      headers: csrfHeaders(),
      body: {},
    });

    expect(res.statusCode).toBe(404);
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
      headers: csrfHeaders(),
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
      headers: csrfHeaders(),
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
      headers: csrfHeaders(),
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
      headers: csrfHeaders(),
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
      headers: csrfHeaders(),
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
      headers: csrfHeaders(),
      body: { plan: 'GROWTH', status: 'UNKNOWN' },
    });

    expect(res.statusCode).toBe(422);
    await app.close();
  });
});

// ─── GET /admin/usage ─────────────────────────────────────────────

describe('GET /admin/usage', () => {
  it('returns usage stats with MRR calculated from subscriptions', async () => {

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

    await app.close();
  });

  it('returns zero MRR when no active subscriptions exist', async () => {

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
      headers: csrfHeaders(),
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
      headers: csrfHeaders(),
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
      headers: csrfHeaders(),
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
      headers: csrfHeaders(),
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
      headers: csrfHeaders(),
      body: {},
    });

    expect(res.statusCode).toBe(204);
    expect(mockIntegrationDelete).toHaveBeenCalledWith({ where: { id: 'int_1' } });
    await app.close();
  });
});

// ─── AI Provider Registry (F-023) ─────────────────────────────────

const fakeAiProvider = {
  id: 'prov_1',
  provider_type: 'OPENAI_COMPAT',
  label: 'DeepSeek V3',
  model_name: 'deepseek-chat',
  lite_model_name: null,
  base_url: 'https://api.deepseek.com',
  api_key_name: 'DEEPSEEK_API_KEY',
  priority: 1,
  is_active: true,
  credits_per_call: 3,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('Admin AI providers', () => {
  it('rejects unauthenticated requests', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/admin/ai-providers' });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('lists providers with key_configured flag per row', async () => {
    mockAiProviderFindMany.mockResolvedValue([fakeAiProvider]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/ai-providers',
      headers: authedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data).toHaveLength(1);
    expect(data[0].provider_type).toBe('OPENAI_COMPAT');
    expect(data[0].base_url).toBe('https://api.deepseek.com');
    expect(data[0]).toHaveProperty('key_configured');
    await app.close();
  });

  it('creates a provider row with priority + weighted credits', async () => {
    mockAiProviderCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'prov_2', ...data, created_at: new Date(), updated_at: new Date() }),
    );

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/ai-providers',
      headers: csrfHeaders(),
      payload: {
        provider_type: 'OPENAI_COMPAT',
        label: 'OpenRouter Claude',
        model_name: 'anthropic/claude-3.5-sonnet',
        base_url: 'https://openrouter.ai/api/v1',
        api_key_name: 'OPENROUTER_API_KEY',
        priority: 4,
        credits_per_call: 10,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(mockAiProviderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider_type: 'OPENAI_COMPAT',
          base_url: 'https://openrouter.ai/api/v1',
          priority: 4,
          credits_per_call: 10,
        }),
      }),
    );
    expect(mockAuditLogCreate).toHaveBeenCalled();
    await app.close();
  });

  it('rejects an invalid provider_type', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/ai-providers',
      headers: csrfHeaders(),
      payload: {
        provider_type: 'BOGUS',
        label: 'Bad',
        model_name: 'x',
        api_key_name: 'X_API_KEY',
      },
    });
    expect(res.statusCode).toBe(422);
    expect(mockAiProviderCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('updates a provider, auditing changed fields', async () => {
    mockAiProviderFindUnique.mockResolvedValue(fakeAiProvider);
    mockAiProviderUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...fakeAiProvider, ...data }),
    );

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/admin/ai-providers/prov_1',
      headers: csrfHeaders(),
      payload: { credits_per_call: 7, is_active: false },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.credits_per_call).toBe(7);
    expect(res.json().data.is_active).toBe(false);
    expect(mockAiProviderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ credits_per_call: 7 }) }),
    );
    expect(mockAuditLogCreate).toHaveBeenCalled();
    await app.close();
  });

  it('returns 404 when updating a missing provider', async () => {
    mockAiProviderFindUnique.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/admin/ai-providers/missing',
      headers: csrfHeaders(),
      payload: { credits_per_call: 5 },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('deletes a provider, returning 204', async () => {
    mockAiProviderFindUnique.mockResolvedValue(fakeAiProvider);
    mockAiProviderDelete.mockResolvedValue(fakeAiProvider);

    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/admin/ai-providers/prov_1',
      headers: csrfHeaders(),
      body: {},
    });
    expect(res.statusCode).toBe(204);
    expect(mockAiProviderDelete).toHaveBeenCalledWith({ where: { id: 'prov_1' } });
    expect(mockAuditLogCreate).toHaveBeenCalled();
    await app.close();
  });

  it('reorders providers via a transaction, rewriting priorities 1..N', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/ai-providers/reorder',
      headers: csrfHeaders(),
      payload: { ordered_ids: ['prov_2', 'prov_1'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.reordered).toBe(2);
    expect(mockTransaction).toHaveBeenCalled();
    await app.close();
  });

  it('aggregates ai-usage grouped by retailer × provider', async () => {
    mockAiUsageGroupBy.mockResolvedValue([
      {
        retailer_id: 'retailer_1',
        provider_type: 'OPENAI_COMPAT',
        model_name: 'deepseek-chat',
        resource_type: 'AI_TAGGING_CALL',
        _count: { id: 4 },
        _sum: { credits_used: 12 },
      },
    ]);
    mockRetailerFindMany.mockResolvedValue([
      { id: 'retailer_1', shop_name: 'Test Shop', city: 'Test City', plan: 'GROWTH' },
    ]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/ai-usage',
      headers: authedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const row = res.json().data[0];
    expect(row.retailer_name).toBe('Test Shop');
    expect(row.calls).toBe(4);
    expect(row.credits_used).toBe(12);
    await app.close();
  });
});

// ─── Default Attributes (F-027) ───────────────────────────────────

const fakeDefaultAttribute = {
  id: 'attr_1',
  kind: 'STYLE',
  segment: 'LADIES',
  name: 'Anarkali Suits',
  sort_order: 2,
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('Admin default attributes', () => {
  it('rejects unauthenticated requests', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/admin/default-attributes' });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('lists the full template without a kind filter', async () => {
    mockDefaultAttributeFindMany.mockResolvedValue([fakeDefaultAttribute]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/default-attributes',
      headers: authedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(mockDefaultAttributeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: undefined,
        orderBy: [{ kind: 'asc' }, { sort_order: 'asc' }],
      }),
    );
    expect(res.json().data).toHaveLength(1);
    await app.close();
  });

  it('filters by kind', async () => {
    mockDefaultAttributeFindMany.mockResolvedValue([fakeDefaultAttribute]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/default-attributes?kind=FABRIC',
      headers: authedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(mockDefaultAttributeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { kind: 'FABRIC' } }),
    );
    await app.close();
  });

  it('rejects an invalid kind param with 422', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/default-attributes?kind=NOPE',
      headers: authedHeaders(),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(mockDefaultAttributeFindMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('creates a template value, storing the trimmed name and auditing it', async () => {
    mockDefaultAttributeCreate.mockResolvedValue({
      ...fakeDefaultAttribute,
      name: 'Sharara Suits',
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/default-attributes',
      headers: csrfHeaders(),
      payload: { kind: 'STYLE', name: '  Sharara Suits  ' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe('Sharara Suits');
    expect(mockDefaultAttributeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'STYLE',
          name: 'Sharara Suits', // trimmed
          sort_order: 0,
          is_active: true,
        }),
      }),
    );
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CREATE',
          resource_type: 'DefaultProductAttribute',
        }),
      }),
    );
    await app.close();
  });

  it('rejects a duplicate name for the same kind with 422', async () => {
    // create() rejecting (P2002) is caught → null → validationError
    mockDefaultAttributeCreate.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/default-attributes',
      headers: csrfHeaders(),
      payload: { kind: 'STYLE', name: 'Anarkali Suits' },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(res.json().error.field).toBe('name');
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an invalid kind with 422', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/default-attributes',
      headers: csrfHeaders(),
      payload: { kind: 'COLOR', name: 'Red' },
    });
    expect(res.statusCode).toBe(422);
    expect(mockDefaultAttributeCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an empty name with 422', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/default-attributes',
      headers: csrfHeaders(),
      payload: { kind: 'FABRIC', name: '' },
    });
    expect(res.statusCode).toBe(422);
    expect(mockDefaultAttributeCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('updates a template value, auditing the change', async () => {
    mockDefaultAttributeUpdate.mockResolvedValue({
      ...fakeDefaultAttribute,
      sort_order: 5,
      is_active: false,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/admin/default-attributes/attr_1',
      headers: csrfHeaders(),
      payload: { sort_order: 5, is_active: false },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.sort_order).toBe(5);
    expect(res.json().data.is_active).toBe(false);
    expect(mockDefaultAttributeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'attr_1' },
        data: expect.objectContaining({ sort_order: 5, is_active: false }),
      }),
    );
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'UPDATE',
          resource_type: 'DefaultProductAttribute',
        }),
      }),
    );
    await app.close();
  });

  it('returns 404 when updating a missing attribute', async () => {
    mockDefaultAttributeUpdate.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/admin/default-attributes/missing',
      headers: csrfHeaders(),
      payload: { sort_order: 1 },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('deletes a template value, returning 204 and auditing', async () => {
    mockDefaultAttributeDelete.mockResolvedValue(fakeDefaultAttribute);

    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/admin/default-attributes/attr_1',
      headers: csrfHeaders(),
      body: {},
    });
    expect(res.statusCode).toBe(204);
    expect(mockDefaultAttributeDelete).toHaveBeenCalledWith({ where: { id: 'attr_1' } });
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'DELETE',
          resource_type: 'DefaultProductAttribute',
        }),
      }),
    );
    await app.close();
  });

  it('still returns 204 for a missing attribute (silent, mirrors default-categories)', async () => {
    mockDefaultAttributeDelete.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/admin/default-attributes/missing',
      headers: csrfHeaders(),
      body: {},
    });
    expect(res.statusCode).toBe(204);
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── GET /admin/contact-submissions ───────────────────────────────

describe('GET /admin/contact-submissions', () => {
  const submission = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    metadata: {
      name: 'Test Retailer',
      shop_city: 'Jaipur',
      topic: 'Getting started',
      message: 'How do I add products?',
    },
    ip_address: '1.2.3.4',
    created_at: new Date('2026-08-11T10:00:00.000Z'),
    ...overrides,
  });

  it('requires admin auth', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/contact-submissions',
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns parsed contact submissions, newest first', async () => {
    mockAuditLogFindMany.mockResolvedValue([submission('log_1'), submission('log_2')]);
    mockAuditLogCount.mockResolvedValue(2);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/contact-submissions',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([
      {
        id: 'log_1',
        name: 'Test Retailer',
        shop_city: 'Jaipur',
        topic: 'Getting started',
        message: 'How do I add products?',
        ip_address: '1.2.3.4',
        created_at: '2026-08-11T10:00:00.000Z',
      },
      {
        id: 'log_2',
        name: 'Test Retailer',
        shop_city: 'Jaipur',
        topic: 'Getting started',
        message: 'How do I add products?',
        ip_address: '1.2.3.4',
        created_at: '2026-08-11T10:00:00.000Z',
      },
    ]);
    expect(res.json().pagination).toEqual({ cursor: null, has_more: false, total: 2 });
    // Always scoped to ContactSubmission rows, never the whole audit trail.
    expect(mockAuditLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ resource_type: 'ContactSubmission' }),
      }),
    );
    await app.close();
  });

  it('filters by topic through the metadata jsonb path', async () => {
    mockAuditLogFindMany.mockResolvedValue([submission('log_1')]);
    mockAuditLogCount.mockResolvedValue(1);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/contact-submissions?topic=Billing',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(mockAuditLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ metadata: { path: ['topic'], equals: 'Billing' } }),
      }),
    );
    await app.close();
  });

  it('paginates with a cursor when more results exist', async () => {
    const many = Array.from({ length: 51 }, (_, i) => submission(`log_${i}`));
    mockAuditLogFindMany.mockResolvedValue(many);
    mockAuditLogCount.mockResolvedValue(60);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/contact-submissions?limit=50',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(50);
    expect(res.json().pagination.has_more).toBe(true);
    expect(res.json().pagination.cursor).toBe('log_49');
    expect(res.json().pagination.total).toBe(60);
    await app.close();
  });

  it('degrades malformed metadata instead of crashing', async () => {
    mockAuditLogFindMany.mockResolvedValue([
      {
        id: 'log_bad',
        metadata: { name: 42, message: null },
        ip_address: null,
        created_at: new Date('2026-08-11T10:00:00.000Z'),
      },
    ]);
    mockAuditLogCount.mockResolvedValue(1);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/contact-submissions',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0]).toEqual({
      id: 'log_bad',
      name: '',
      shop_city: null,
      topic: '',
      message: '',
      ip_address: null,
      created_at: '2026-08-11T10:00:00.000Z',
    });
    await app.close();
  });
});
