// Route tests for Phase II WhatsApp Catalog Sync (D1–D7).
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';
import { retailersWhatsappCatalogRoutes } from './retailers-whatsapp-catalog.js';

const {
  mockRetailerFindUnique,
  mockRetailerUpdate,
  mockCatalogItemCount,
  mockCatalogItemFindMany,
  mockCatalogSyncLogFindMany,
  mockProductCategoryFindMany,
  mockProductFindFirst,
  mockAuditLogCreate,
  mockHasFeature,
  mockAddCatalogSyncJob,
} = vi.hoisted(() => ({
  mockRetailerFindUnique: vi.fn(),
  mockRetailerUpdate: vi.fn(),
  mockCatalogItemCount: vi.fn(),
  mockCatalogItemFindMany: vi.fn(),
  mockCatalogSyncLogFindMany: vi.fn(),
  mockProductCategoryFindMany: vi.fn(),
  mockProductFindFirst: vi.fn(),
  mockAuditLogCreate: vi.fn(),
  mockHasFeature: vi.fn(),
  mockAddCatalogSyncJob: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findUnique: mockRetailerFindUnique, update: mockRetailerUpdate },
    catalogItem: { count: mockCatalogItemCount, findMany: mockCatalogItemFindMany },
    catalogSyncLog: { findMany: mockCatalogSyncLogFindMany },
    productCategory: { findMany: mockProductCategoryFindMany },
    product: { findFirst: mockProductFindFirst },
    auditLog: { create: mockAuditLogCreate },
  },
  Prisma: {},
}));

vi.mock('../../jobs/index.js', () => ({
  addCatalogSyncJob: mockAddCatalogSyncJob,
}));

vi.mock('../../lib/features.js', () => ({
  hasFeature: mockHasFeature,
}));

const RETAILER_ID = 'retailer_1';

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
  });
  await app.register(retailersWhatsappCatalogRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasFeature.mockResolvedValue(true);
  mockAddCatalogSyncJob.mockResolvedValue('job_123');
});

describe('GET /me/whatsapp-catalog (D1)', () => {
  it('returns null when the plan feature is off', async () => {
    mockHasFeature.mockResolvedValue(false);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/me/whatsapp-catalog' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toBeNull();
    await app.close();
  });

  it('returns status with synced/failed/pending counts', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      whatsapp_api_access_token: 'tok',
      whatsapp_api_phone_number_id: 'ph_1',
      whatsapp_catalog_id: 'cat_1',
      sync_enabled: true,
      sync_categories: ['c1', 'c2'],
      last_synced_at: new Date('2026-08-18T10:00:00Z'),
    });
    mockCatalogItemCount
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/me/whatsapp-catalog' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.configured).toBe(true);
    expect(data.sync_enabled).toBe(true);
    expect(data.sync_categories).toEqual(['c1', 'c2']);
    expect(data.items_synced).toBe(12);
    expect(data.items_failed).toBe(2);
    expect(data.items_pending).toBe(0);
    await app.close();
  });
});

describe('PATCH /me/whatsapp-catalog (D2)', () => {
  it('updates sync_enabled and validated categories', async () => {
    mockRetailerFindUnique.mockResolvedValue({ sync_enabled: false, sync_categories: [] });
    mockProductCategoryFindMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    mockRetailerUpdate.mockResolvedValue({
      sync_enabled: true,
      sync_categories: ['c1', 'c2'],
      whatsapp_catalog_id: null,
      last_synced_at: null,
    });
    mockAuditLogCreate.mockResolvedValue({});
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/me/whatsapp-catalog',
      headers: { 'content-type': 'application/json' },
      payload: { sync_enabled: true, sync_categories: ['c1', 'c2'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.sync_enabled).toBe(true);
    expect(mockRetailerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sync_enabled: true, sync_categories: ['c1', 'c2'] }),
      }),
    );
    await app.close();
  });

  it('rejects categories that do not belong to the retailer', async () => {
    mockRetailerFindUnique.mockResolvedValue({ sync_enabled: false, sync_categories: [] });
    mockProductCategoryFindMany.mockResolvedValue([{ id: 'c1' }]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/me/whatsapp-catalog',
      headers: { 'content-type': 'application/json' },
      payload: { sync_categories: ['c1', 'not-mine'] },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('gates the route behind the plan feature', async () => {
    mockHasFeature.mockResolvedValue(false);
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/me/whatsapp-catalog',
      headers: { 'content-type': 'application/json' },
      payload: { sync_enabled: true },
    });
    expect(res.statusCode).toBe(402);
    await app.close();
  });
});

describe('POST /me/whatsapp-catalog/sync (D3)', () => {
  it('enqueues a full sync and returns the job id', async () => {
    mockRetailerFindUnique.mockResolvedValue({ whatsapp_api_access_token: 'tok' });
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/me/whatsapp-catalog/sync' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual(
      expect.objectContaining({ job_id: 'job_123', operation: 'full_sync', status: 'queued' }),
    );
    expect(mockAddCatalogSyncJob).toHaveBeenCalledWith({
      retailer_id: RETAILER_ID,
      operation: 'full_sync',
      triggered_by: 'retailer',
    });
    await app.close();
  });

  it('rejects when no WhatsApp Business API token is configured', async () => {
    mockRetailerFindUnique.mockResolvedValue({ whatsapp_api_access_token: null });
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/me/whatsapp-catalog/sync' });
    expect(res.statusCode).toBe(422);
    expect(mockAddCatalogSyncJob).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /me/whatsapp-catalog/sync/:productId (D4)', () => {
  it('enqueues a single-product sync', async () => {
    mockProductFindFirst.mockResolvedValue({ id: 'p1', deleted_at: null });
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/me/whatsapp-catalog/sync/p1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.product_id).toBe('p1');
    expect(mockAddCatalogSyncJob).toHaveBeenCalledWith({
      retailer_id: RETAILER_ID,
      operation: 'single_product',
      product_id: 'p1',
      triggered_by: 'retailer',
    });
    await app.close();
  });

  it('404s for a product outside the retailer', async () => {
    mockProductFindFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/me/whatsapp-catalog/sync/p-other' });
    expect(res.statusCode).toBe(404);
    expect(mockAddCatalogSyncJob).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('GET /me/whatsapp-catalog/logs (D5)', () => {
  it('returns sync history newest first', async () => {
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
    const res = await app.inject({ method: 'GET', url: '/me/whatsapp-catalog/logs' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].status).toBe('SUCCESS');
    expect(mockCatalogSyncLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { retailer_id: RETAILER_ID }, orderBy: { created_at: 'desc' } }),
    );
    await app.close();
  });
});

describe('GET /me/whatsapp-catalog/items (D6)', () => {
  it('returns synced items with Meta ids and product info', async () => {
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
    const res = await app.inject({ method: 'GET', url: '/me/whatsapp-catalog/items' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0]).toEqual(
      expect.objectContaining({
        product_id: 'p1',
        product_name: 'Red Silk Saree',
        sku: 'SKU-1',
        whatsapp_catalog_item_id: 'meta_1',
        hsn_code: '5407',
      }),
    );
    await app.close();
  });
});
