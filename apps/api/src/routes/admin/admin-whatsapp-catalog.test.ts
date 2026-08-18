// Route tests for the admin WhatsApp Catalog monitor (G1–G5).
import { randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';
import { adminWhatsAppCatalogRoutes } from './admin-whatsapp-catalog.js';

const {
  mockRetailerFindMany,
  mockRetailerFindUnique,
  mockCatalogItemGroupBy,
  mockCatalogItemFindMany,
  mockCatalogSyncLogCount,
  mockCatalogSyncLogFindMany,
  mockAuditLogCreate,
  mockAddCatalogSyncJob,
} = vi.hoisted(() => ({
  mockRetailerFindMany: vi.fn(),
  mockRetailerFindUnique: vi.fn(),
  mockCatalogItemGroupBy: vi.fn(),
  mockCatalogItemFindMany: vi.fn(),
  mockCatalogSyncLogCount: vi.fn(),
  mockCatalogSyncLogFindMany: vi.fn(),
  mockAuditLogCreate: vi.fn(),
  mockAddCatalogSyncJob: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findMany: mockRetailerFindMany, findUnique: mockRetailerFindUnique },
    catalogItem: { groupBy: mockCatalogItemGroupBy, findMany: mockCatalogItemFindMany },
    catalogSyncLog: { count: mockCatalogSyncLogCount, findMany: mockCatalogSyncLogFindMany },
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

vi.mock('../../jobs/index.js', () => ({
  addCatalogSyncJob: mockAddCatalogSyncJob,
}));

const ADMIN_KEY = 'test-admin-key-12345';

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(cookie, { secret: 'test-cookie-secret' });
  await app.register(adminWhatsAppCatalogRoutes, { prefix: '/v1/admin' });
  await app.ready();
  return app;
}

function authedHeaders() {
  return { 'x-admin-key': ADMIN_KEY };
}

// CSRF headers WITHOUT a content-type — Fastify 400s an empty JSON body on
// bodyless requests (same as the commission DELETE tests), and this sync
// trigger has no body.
function csrfHeaders() {
  const token = randomBytes(16).toString('hex');
  return {
    ...authedHeaders(),
    'x-csrf-token': token,
    cookie: `csrf-token=${token}`,
  };
}

const retailerRows = [
  {
    id: 'r1',
    shop_name: 'Priya Cloth House',
    city: 'Jaipur',
    plan: 'GROWTH',
    whatsapp_catalog_id: 'cat_1',
    whatsapp_api_access_token: 'tok',
    sync_enabled: true,
    sync_categories: ['c1'],
    last_synced_at: new Date('2026-08-18T10:00:00Z'),
  },
  {
    id: 'r2',
    shop_name: 'Sharma Textiles',
    city: 'Delhi',
    plan: 'STARTER',
    whatsapp_catalog_id: null,
    whatsapp_api_access_token: null,
    sync_enabled: false,
    sync_categories: [],
    last_synced_at: null,
  },
];

beforeEach(() => {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  vi.clearAllMocks();
  mockAddCatalogSyncJob.mockResolvedValue('job_admin');
  mockAuditLogCreate.mockResolvedValue({});
  // Default: no schedule-triggered (cron) full-sync logs in the last 7 days.
  mockCatalogSyncLogFindMany.mockResolvedValue([]);
});

describe('GET /admin/whatsapp-catalog/overview', () => {
  it('rejects unauthenticated requests', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/whatsapp-catalog/overview',
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns health totals and per-retailer item counts', async () => {
    mockRetailerFindMany.mockResolvedValue(retailerRows);
    mockCatalogItemGroupBy.mockResolvedValue([
      { retailer_id: 'r1', status: 'SUCCESS', _count: 12 },
      { retailer_id: 'r1', status: 'FAILED', _count: 2 },
      { retailer_id: 'r1', status: 'IN_PROGRESS', _count: 1 },
    ]);
    mockCatalogSyncLogCount.mockResolvedValue(3);
    // One cron full-sync run 3 days ago: one SUCCESS, one timed-out FAILED.
    mockCatalogSyncLogFindMany.mockResolvedValue([
      {
        status: 'SUCCESS',
        payload_json: { triggered_by: 'schedule' },
        created_at: new Date('2026-08-15T05:00:00Z'),
      },
      {
        status: 'FAILED',
        payload_json: { triggered_by: 'schedule', timed_out: true },
        created_at: new Date('2026-08-15T05:00:00Z'),
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/whatsapp-catalog/overview',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const { health, retailers } = res.json().data;
    expect(health).toMatchObject({
      retailers_total: 2,
      retailers_configured: 1,
      retailers_syncing: 1,
      items_synced: 12,
      items_failed: 2,
      items_pending: 1,
      failed_logs_7d: 3,
      // Cron health (C10/C11): filtered to schedule-triggered full_sync logs.
      cron_last_run_at: '2026-08-15T05:00:00.000Z',
      cron_failed_7d: 1,
      cron_timed_out_7d: 1,
    });
    // 2 failed / 14 total → 14.3%
    expect(health.error_rate_pct).toBe(14.3);

    expect(retailers[0]).toMatchObject({
      retailer_id: 'r1',
      shop_name: 'Priya Cloth House',
      configured: true,
      whatsapp_catalog_id: 'cat_1',
      sync_enabled: true,
      items_synced: 12,
      items_failed: 2,
      items_pending: 1,
    });
    expect(retailers[1]).toMatchObject({ configured: false, items_synced: 0, items_failed: 0 });
    await app.close();
  });

  it('reports 0% error rate when there are no items', async () => {
    mockRetailerFindMany.mockResolvedValue([]);
    mockCatalogItemGroupBy.mockResolvedValue([]);
    mockCatalogSyncLogCount.mockResolvedValue(0);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/whatsapp-catalog/overview',
      headers: authedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const health = res.json().data.health;
    expect(health.error_rate_pct).toBe(0);
    expect(health.cron_last_run_at).toBeNull();
    expect(health.cron_failed_7d).toBe(0);
    await app.close();
  });

  it('filters cron logs to schedule-triggered full_sync only (JSON path filter)', async () => {
    mockRetailerFindMany.mockResolvedValue([]);
    mockCatalogItemGroupBy.mockResolvedValue([]);
    mockCatalogSyncLogCount.mockResolvedValue(0);
    mockCatalogSyncLogFindMany.mockResolvedValue([]);

    const app = await buildApp();
    await app.inject({
      method: 'GET',
      url: '/v1/admin/whatsapp-catalog/overview',
      headers: authedHeaders(),
    });

    // The cron-query must only look at schedule-triggered full_sync rows
    // within the last 7 days — retailer-triggered runs must not count.
    expect(mockCatalogSyncLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          operation: 'full_sync',
          created_at: { gte: expect.any(Date) },
          payload_json: { path: ['triggered_by'], equals: 'schedule' },
        },
      }),
    );
    await app.close();
  });
});

describe('GET /admin/whatsapp-catalog/retailers/:id/logs', () => {
  it('returns the retailer sync history newest first', async () => {
    mockRetailerFindUnique.mockResolvedValue({ id: 'r1' });
    mockCatalogSyncLogFindMany.mockResolvedValue([
      {
        id: 'log1',
        operation: 'full_sync',
        product_id: null,
        meta_item_id: null,
        meta_catalog_id: 'cat_1',
        status: 'SUCCESS',
        error_message: null,
        payload_json: { total: 5 },
        created_at: new Date('2026-08-18T10:00:00Z'),
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/whatsapp-catalog/retailers/r1/logs',
      headers: authedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(mockCatalogSyncLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { retailer_id: 'r1' }, orderBy: { created_at: 'desc' } }),
    );
    await app.close();
  });

  it('404s for an unknown retailer', async () => {
    mockRetailerFindUnique.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/whatsapp-catalog/retailers/nope/logs',
      headers: authedHeaders(),
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /admin/whatsapp-catalog/retailers/:id/items', () => {
  it('returns mapped items with product info', async () => {
    mockRetailerFindUnique.mockResolvedValue({ id: 'r1' });
    mockCatalogItemFindMany.mockResolvedValue([
      {
        product_id: 'p1',
        product_name_snapshot: 'Red Silk Saree',
        product_price_paise: 150000,
        status: 'SUCCESS',
        error_message: null,
        whatsapp_catalog_item_id: 'meta_1',
        hsn_code_snapshot: '5407',
        last_synced_at: new Date('2026-08-18T10:00:00Z'),
        product: { id: 'p1', name: 'Red Silk Saree', sku: 'SKU-1', price_min: 150000, status: 'AVAILABLE', category: 'Saree', deleted_at: null },
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/whatsapp-catalog/retailers/r1/items',
      headers: authedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0]).toMatchObject({
      product_id: 'p1',
      product_name: 'Red Silk Saree',
      whatsapp_catalog_item_id: 'meta_1',
      hsn_code: '5407',
    });
    await app.close();
  });
});

describe('POST /admin/whatsapp-catalog/retailers/:id/sync', () => {
  it('enqueues a full sync marked triggered_by admin and audits', async () => {
    mockRetailerFindUnique.mockResolvedValue({ id: 'r1', whatsapp_api_access_token: 'tok' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/whatsapp-catalog/retailers/r1/sync',
      headers: csrfHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ job_id: 'job_admin', status: 'queued' });
    expect(mockAddCatalogSyncJob).toHaveBeenCalledWith({
      retailer_id: 'r1',
      operation: 'full_sync',
      triggered_by: 'admin',
    });
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'sync', resource_id: 'r1' }) }),
    );
    await app.close();
  });

  it('404s for an unknown retailer', async () => {
    mockRetailerFindUnique.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/whatsapp-catalog/retailers/nope/sync',
      headers: csrfHeaders(),
    });
    expect(res.statusCode).toBe(404);
    expect(mockAddCatalogSyncJob).not.toHaveBeenCalled();
    await app.close();
  });

  it('422s when the retailer has no WhatsApp API token', async () => {
    mockRetailerFindUnique.mockResolvedValue({ id: 'r2', whatsapp_api_access_token: null });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/whatsapp-catalog/retailers/r2/sync',
      headers: csrfHeaders(),
    });
    expect(res.statusCode).toBe(422);
    expect(mockAddCatalogSyncJob).not.toHaveBeenCalled();
    await app.close();
  });
});
