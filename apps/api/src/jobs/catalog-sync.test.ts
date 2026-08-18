// Unit tests for the Phase II WhatsApp Catalog Sync engine (C2–C8).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildCatalogItemPayload,
  handleCatalogSync,
  handleDailyCatalogSync,
  mapProductStatus,
  maybeEnqueueFullSync,
  maybeEnqueueProductSync,
  resolveHsnForCatalog,
  syncAllProducts,
  syncSingleProduct,
} from './catalog-sync.js';

const {
  mockRetailerFindMany,
  mockRetailerFindUnique,
  mockRetailerUpdate,
  mockProductFindMany,
  mockProductFindUnique,
  mockProductUpdate,
  mockProductUpdateMany,
  mockCatalogItemFindMany,
  mockCatalogItemFindUnique,
  mockCatalogItemCreate,
  mockCatalogItemUpdate,
  mockCatalogItemDelete,
  mockCatalogSyncLogCreate,
  mockGetSecret,
  mockGetOrCreateCatalog,
  mockCreateCatalogItem,
  mockUpdateCatalogItem,
  mockDeleteCatalogItem,
  mockResolveCatalogCredentials,
  mockAddCatalogSyncJob,
} = vi.hoisted(() => ({
  mockRetailerFindMany: vi.fn(),
  mockRetailerFindUnique: vi.fn(),
  mockRetailerUpdate: vi.fn(),
  mockProductFindMany: vi.fn(),
  mockProductFindUnique: vi.fn(),
  mockProductUpdate: vi.fn(),
  mockProductUpdateMany: vi.fn(),
  mockCatalogItemFindMany: vi.fn(),
  mockCatalogItemFindUnique: vi.fn(),
  mockCatalogItemCreate: vi.fn(),
  mockCatalogItemUpdate: vi.fn(),
  mockCatalogItemDelete: vi.fn(),
  mockCatalogSyncLogCreate: vi.fn(),
  mockGetSecret: vi.fn(),
  mockGetOrCreateCatalog: vi.fn(),
  mockCreateCatalogItem: vi.fn(),
  mockUpdateCatalogItem: vi.fn(),
  mockDeleteCatalogItem: vi.fn(),
  mockResolveCatalogCredentials: vi.fn(),
  mockAddCatalogSyncJob: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  getSecret: mockGetSecret,
  prisma: {
    retailer: {
      findMany: mockRetailerFindMany,
      findUnique: mockRetailerFindUnique,
      update: mockRetailerUpdate,
    },
    product: {
      findMany: mockProductFindMany,
      findUnique: mockProductFindUnique,
      update: mockProductUpdate,
      updateMany: mockProductUpdateMany,
    },
    catalogItem: {
      findMany: mockCatalogItemFindMany,
      findUnique: mockCatalogItemFindUnique,
      create: mockCatalogItemCreate,
      update: mockCatalogItemUpdate,
      delete: mockCatalogItemDelete,
    },
    catalogSyncLog: { create: mockCatalogSyncLogCreate },
  },
  Prisma: {},
}));

vi.mock('../lib/meta-catalog.js', () => ({
  getOrCreateCatalog: mockGetOrCreateCatalog,
  createCatalogItem: mockCreateCatalogItem,
  updateCatalogItem: mockUpdateCatalogItem,
  deleteCatalogItem: mockDeleteCatalogItem,
  resolveCatalogCredentials: mockResolveCatalogCredentials,
}));

vi.mock('./index.js', () => ({
  addCatalogSyncJob: mockAddCatalogSyncJob,
}));

const RETAILER_ID = 'retailer_1';

const baseProduct = {
  id: 'p1',
  retailer_id: RETAILER_ID,
  name: 'Red Silk Saree',
  sku: 'SKU-1',
  description: null,
  price_min: 150000,
  price_max: null,
  status: 'AVAILABLE',
  category: 'Saree',
  subtype: 'Silk Saree',
  fabric_estimate: 'Silk',
  styles: [],
  fabrics: ['Silk'],
  category_id: 'c1',
  deleted_at: null,
  product_category: { name: 'Sarees' },
  photos: [{ url: 'https://r2.example/p1.jpg' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSecret.mockResolvedValue('waba_1');
  mockResolveCatalogCredentials.mockResolvedValue({ wabaId: 'waba_1', accessToken: 'tok' });
  mockAddCatalogSyncJob.mockResolvedValue('job_auto');
  mockGetOrCreateCatalog.mockResolvedValue('cat_1');
  mockCreateCatalogItem.mockResolvedValue({ id: 'meta_new' });
  mockUpdateCatalogItem.mockResolvedValue(undefined);
  mockDeleteCatalogItem.mockResolvedValue(undefined);
  mockCatalogSyncLogCreate.mockResolvedValue({});
});

// ─── Pure logic (C4/C5/C6) ───────────────────────────────────────

describe('mapProductStatus', () => {
  it('maps AVAILABLE → in stock', () => {
    expect(mapProductStatus('AVAILABLE')).toBe('in stock');
  });
  it('maps SOLD and NOT_SURE → out of stock', () => {
    expect(mapProductStatus('SOLD')).toBe('out of stock');
    expect(mapProductStatus('NOT_SURE')).toBe('out of stock');
  });
  it('maps RESERVED → available for order', () => {
    expect(mapProductStatus('RESERVED')).toBe('available for order');
  });
});

describe('resolveHsnForCatalog', () => {
  it('maps saree → 5407', () => {
    expect(resolveHsnForCatalog({ name: 'Banarasi Saree' })).toBe('5407');
  });
  it('maps silk → 5007', () => {
    expect(resolveHsnForCatalog({ category: 'Saree', name: 'Pure Silk Saree' })).toBe('5007');
  });
  it('maps kurti/kurta/suit → 6204', () => {
    expect(resolveHsnForCatalog({ name: 'Cotton Kurti Set' })).toBe('6204');
    expect(resolveHsnForCatalog({ subtype: 'Anarkali Suit' })).toBe('6204');
  });
  it('maps dupatta → 6214', () => {
    expect(resolveHsnForCatalog({ name: 'Designer Dupatta' })).toBe('6214');
  });
  it('falls back to 6204 for unknown items', () => {
    expect(resolveHsnForCatalog({ name: 'Fancy Item' })).toBe('6204');
  });
});

describe('buildCatalogItemPayload', () => {
  it('builds a Meta item with paise price, INR, availability and image', () => {
    const payload = buildCatalogItemPayload({
      ...baseProduct,
      photoUrl: 'https://r2.example/p1.jpg',
      categoryName: baseProduct.product_category.name,
    });
    expect(payload.name).toBe('Red Silk Saree');
    expect(payload.price).toBe(150000);
    expect(payload.currency).toBe('INR');
    expect(payload.availability).toBe('in stock');
    expect(payload.image_url).toBe('https://r2.example/p1.jpg');
    expect(payload.retailer_category).toBe('Sarees');
    expect(payload.description).toContain('HSN 5007');
  });

  it('falls back to sku for the name and zero for missing price', () => {
    const payload = buildCatalogItemPayload({
      ...baseProduct,
      name: null,
      price_min: null,
      price_max: null,
    });
    expect(payload.name).toBe('SKU-1');
    expect(payload.price).toBe(0);
  });

  it('omits image when the product has no photo', () => {
    const payload = buildCatalogItemPayload({ ...baseProduct, photoUrl: null });
    expect(payload.image_url).toBeUndefined();
  });
});

// ─── Full sync (C2) ──────────────────────────────────────────────

describe('syncAllProducts', () => {
  it('creates missing items, updates existing, writes SUCCESS log', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      whatsapp_api_access_token: 'tok',
      whatsapp_catalog_id: null,
      sync_categories: [],
      name: 'Shop',
    });
    const existing = { ...baseProduct, id: 'p1', status: 'AVAILABLE' };
    const fresh = { ...baseProduct, id: 'p2', sku: 'SKU-2', name: 'Kurti', status: 'SOLD', price_min: 80000 };
    mockProductFindMany.mockResolvedValue([existing, fresh]);
    mockCatalogItemFindMany.mockResolvedValue([
      { product_id: 'p1', whatsapp_catalog_item_id: 'meta_p1', whatsapp_catalog_id: 'cat_1' },
    ]);
    mockCatalogItemUpdate.mockResolvedValue({});
    mockCatalogItemCreate.mockResolvedValue({});

    await syncAllProducts(RETAILER_ID);

    // catalog created + cached on the retailer
    expect(mockGetOrCreateCatalog).toHaveBeenCalledWith('waba_1', 'tok', undefined, undefined);
    expect(mockRetailerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ whatsapp_catalog_id: 'cat_1' }) }),
    );

    // p1 updated in place (no duplicate create)
    expect(mockUpdateCatalogItem).toHaveBeenCalledWith(
      'cat_1',
      'tok',
      'meta_p1',
      expect.objectContaining({ name: 'Red Silk Saree', availability: 'in stock', price: 150000 }),
      undefined,
    );
    expect(mockCatalogItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { product_id: 'p1' } }),
    );

    // p2 created with external id = product id (idempotency, C8)
    expect(mockCreateCatalogItem).toHaveBeenCalledWith(
      'cat_1',
      'tok',
      expect.objectContaining({ price: 80000, availability: 'out of stock', currency: 'INR' }),
      'p2',
      undefined,
    );
    expect(mockCatalogItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ product_id: 'p2', status: 'SUCCESS' }) }),
    );

    // SUCCESS log with per-op counts
    expect(mockCatalogSyncLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operation: 'full_sync',
          status: 'SUCCESS',
          payload_json: expect.objectContaining({ created: 1, updated: 1, deleted: 0, failed: [] }),
        }),
      }),
    );
  });

  it('writes FAILED log and skips Meta calls when no WhatsApp token', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      whatsapp_api_access_token: null,
      whatsapp_catalog_id: null,
      sync_categories: [],
      name: 'Shop',
    });
    await syncAllProducts(RETAILER_ID);
    expect(mockGetOrCreateCatalog).not.toHaveBeenCalled();
    expect(mockCatalogSyncLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', error_message: expect.stringContaining('not configured') }),
      }),
    );
  });

  it('deletes Meta items for products no longer eligible', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      whatsapp_api_access_token: 'tok',
      whatsapp_catalog_id: 'cat_1',
      sync_categories: ['c1'],
      name: 'Shop',
    });
    // Eligible products: only p1 (in sync_categories). p2's row exists but the
    // product was soft-deleted / category removed → must be removed.
    mockProductFindMany.mockResolvedValue([
      { ...baseProduct, id: 'p1', category_id: 'c1', status: 'AVAILABLE' },
    ]);
    mockCatalogItemFindMany.mockResolvedValue([
      { product_id: 'p1', whatsapp_catalog_item_id: 'meta_p1', whatsapp_catalog_id: 'cat_1' },
      { product_id: 'p2', whatsapp_catalog_item_id: 'meta_p2', whatsapp_catalog_id: 'cat_1' },
    ]);
    mockCatalogItemUpdate.mockResolvedValue({});

    await syncAllProducts(RETAILER_ID);

    expect(mockDeleteCatalogItem).toHaveBeenCalledWith('cat_1', 'tok', 'meta_p2', undefined);
    expect(mockCatalogItemDelete).toHaveBeenCalledWith({ where: { product_id: 'p2' } });
    expect(mockProductUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { whatsapp_catalog_item_id: null } }),
    );
  });
});

// ─── Single product sync (C3) ────────────────────────────────────

describe('syncSingleProduct', () => {
  it('creates the Meta item for a new eligible product', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      whatsapp_api_access_token: 'tok',
      whatsapp_catalog_id: 'cat_1',
      sync_categories: [],
    });
    mockProductFindUnique.mockResolvedValue({
      ...baseProduct,
      id: 'p9',
      sku: null,
      name: 'Designer Dupatta',
      category: 'Dupatta',
      price_min: 25000,
      product_category: null,
      photos: [],
    });
    mockCatalogItemFindUnique.mockResolvedValue(null);
    mockCatalogItemCreate.mockResolvedValue({});

    await syncSingleProduct(RETAILER_ID, 'p9');

    expect(mockCreateCatalogItem).toHaveBeenCalledWith(
      'cat_1',
      'tok',
      expect.objectContaining({ name: 'Designer Dupatta', availability: 'in stock', price: 25000 }),
      'p9',
      undefined,
    );
    expect(mockCatalogItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ product_id: 'p9', whatsapp_catalog_item_id: 'meta_new' }),
      }),
    );
    expect(mockCatalogSyncLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ operation: 'single_product', status: 'SUCCESS' }),
      }),
    );
  });

  it('updates an existing item via its stored Meta id', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      whatsapp_api_access_token: 'tok',
      whatsapp_catalog_id: 'cat_1',
      sync_categories: [],
    });
    mockProductFindUnique.mockResolvedValue({ ...baseProduct, id: 'p1', status: 'SOLD' });
    mockCatalogItemFindUnique.mockResolvedValue({
      product_id: 'p1',
      whatsapp_catalog_item_id: 'meta_p1',
      whatsapp_catalog_id: 'cat_1',
    });
    mockCatalogItemUpdate.mockResolvedValue({});

    await syncSingleProduct(RETAILER_ID, 'p1');

    expect(mockUpdateCatalogItem).toHaveBeenCalledWith(
      'cat_1',
      'tok',
      'meta_p1',
      expect.objectContaining({ availability: 'out of stock' }),
      undefined,
    );
    expect(mockCreateCatalogItem).not.toHaveBeenCalled();
    expect(mockCatalogItemUpdate).toHaveBeenCalled();
  });

  it('removes the Meta item when the product is no longer eligible', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      whatsapp_api_access_token: 'tok',
      whatsapp_catalog_id: 'cat_1',
      sync_categories: [],
    });
    mockProductFindUnique.mockResolvedValue({
      ...baseProduct,
      id: 'p9',
      deleted_at: new Date('2026-08-18T00:00:00Z'),
    });
    mockCatalogItemFindUnique.mockResolvedValue({
      product_id: 'p9',
      whatsapp_catalog_item_id: 'meta_p9',
      whatsapp_catalog_id: 'cat_1',
    });

    await syncSingleProduct(RETAILER_ID, 'p9');

    expect(mockDeleteCatalogItem).toHaveBeenCalledWith('cat_1', 'tok', 'meta_p9', undefined);
    expect(mockCatalogItemDelete).toHaveBeenCalledWith({ where: { product_id: 'p9' } });
    expect(mockProductUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { whatsapp_catalog_item_id: null } }),
    );
    expect(mockCatalogSyncLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUCCESS', payload_json: expect.objectContaining({ action: 'removed_not_eligible' }) }),
      }),
    );
  });
});

// ─── Auto-sync hooks (product mutations) ──────────────────────────

describe('maybeEnqueueProductSync', () => {
  it('enqueues a single-product job when sync is enabled and configured', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      sync_enabled: true,
      whatsapp_api_access_token: 'tok',
    });
    await maybeEnqueueProductSync(RETAILER_ID, 'p1');
    expect(mockAddCatalogSyncJob).toHaveBeenCalledWith({
      retailer_id: RETAILER_ID,
      operation: 'single_product',
      product_id: 'p1',
      triggered_by: 'retailer',
    });
  });

  it('does nothing when sync is disabled', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      sync_enabled: false,
      whatsapp_api_access_token: 'tok',
    });
    await maybeEnqueueProductSync(RETAILER_ID, 'p1');
    expect(mockAddCatalogSyncJob).not.toHaveBeenCalled();
  });

  it('does nothing when the retailer has no WhatsApp API token', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      sync_enabled: true,
      whatsapp_api_access_token: null,
    });
    await maybeEnqueueProductSync(RETAILER_ID, 'p1');
    expect(mockAddCatalogSyncJob).not.toHaveBeenCalled();
  });

  it('swallows errors (fail-open — a catalog hiccup never fails the save)', async () => {
    mockRetailerFindUnique.mockRejectedValue(new Error('db down'));
    await expect(maybeEnqueueProductSync(RETAILER_ID, 'p1')).resolves.toBeUndefined();
    expect(mockAddCatalogSyncJob).not.toHaveBeenCalled();
  });
});

describe('maybeEnqueueFullSync', () => {
  it('enqueues a full sync when enabled and configured', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      sync_enabled: true,
      whatsapp_api_access_token: 'tok',
    });
    await maybeEnqueueFullSync(RETAILER_ID);
    expect(mockAddCatalogSyncJob).toHaveBeenCalledWith({
      retailer_id: RETAILER_ID,
      operation: 'full_sync',
      triggered_by: 'retailer',
    });
  });

  it('does nothing when sync is disabled', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      sync_enabled: false,
      whatsapp_api_access_token: 'tok',
    });
    await maybeEnqueueFullSync(RETAILER_ID);
    expect(mockAddCatalogSyncJob).not.toHaveBeenCalled();
  });
});

describe('handleDailyCatalogSync', () => {
  it('enqueues one scheduled full-sync job per eligible retailer', async () => {
    mockRetailerFindMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
    await handleDailyCatalogSync();
    expect(mockRetailerFindMany).toHaveBeenCalledWith({
      where: {
        sync_enabled: true,
        whatsapp_api_access_token: { not: null },
      },
      select: { id: true },
    });
    expect(mockAddCatalogSyncJob).toHaveBeenCalledTimes(2);
    expect(mockAddCatalogSyncJob).toHaveBeenCalledWith({
      retailer_id: 'r1',
      operation: 'full_sync',
      triggered_by: 'schedule',
    });
    expect(mockAddCatalogSyncJob).toHaveBeenCalledWith({
      retailer_id: 'r2',
      operation: 'full_sync',
      triggered_by: 'schedule',
    });
  });

  it('is a no-op when no retailer has sync enabled', async () => {
    mockRetailerFindMany.mockResolvedValue([]);
    await handleDailyCatalogSync();
    expect(mockAddCatalogSyncJob).not.toHaveBeenCalled();
  });

  it('skips nothing on a single enqueue failure (fail-open per retailer)', async () => {
    mockRetailerFindMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
    mockAddCatalogSyncJob.mockRejectedValueOnce(new Error('redis down'));
    await expect(handleDailyCatalogSync()).resolves.toBeUndefined();
    expect(mockAddCatalogSyncJob).toHaveBeenCalledTimes(2);
  });

  it('degrades to no syncs when the retailer query fails (cron must not crash the worker)', async () => {
    mockRetailerFindMany.mockRejectedValue(new Error('db down'));
    await expect(handleDailyCatalogSync()).resolves.toBeUndefined();
    expect(mockAddCatalogSyncJob).not.toHaveBeenCalled();
  });
});

describe('handleCatalogSync (per-retailer timeout)', () => {
  it('full sync: aborts a stuck Meta call, records FAILED timeout log, and does not throw', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      whatsapp_api_access_token: 'tok',
      whatsapp_catalog_id: 'cat_1',
      sync_categories: [],
    });
    mockProductFindMany.mockResolvedValue([{ ...baseProduct, id: 'p1', status: 'AVAILABLE' }]);
    mockCatalogItemFindMany.mockResolvedValue([
      { product_id: 'p1', whatsapp_catalog_item_id: 'meta_p1', whatsapp_catalog_id: 'cat_1' },
    ]);
    // Simulate a Meta call that hangs forever — like real fetch, it only
    // settles when the AbortSignal fires (the 5th arg).
    mockUpdateCatalogItem.mockImplementation((...args: unknown[]) => {
      const signal = args[4] as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        if (signal?.aborted) reject(new Error('aborted'));
        signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });

    // 20ms budget — the abort fires while the update is still pending.
    await expect(
      handleCatalogSync({ retailer_id: RETAILER_ID, operation: 'full_sync', triggered_by: 'schedule' }, 20),
    ).resolves.toBeUndefined();

    expect(mockCatalogSyncLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operation: 'full_sync',
          status: 'FAILED',
          error_message: expect.stringContaining('timed out'),
          payload_json: expect.objectContaining({ timed_out: true }),
        }),
      }),
    );
  });

  it('single product: aborts a stuck Meta call, records FAILED timeout log, swallows the error', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      whatsapp_api_access_token: 'tok',
      whatsapp_catalog_id: 'cat_1',
      sync_categories: [],
    });
    mockProductFindUnique.mockResolvedValue({ ...baseProduct, id: 'p1', status: 'AVAILABLE' });
    mockCatalogItemFindUnique.mockResolvedValue({
      product_id: 'p1',
      whatsapp_catalog_item_id: 'meta_p1',
      whatsapp_catalog_id: 'cat_1',
    });
    mockUpdateCatalogItem.mockImplementation((...args: unknown[]) => {
      const signal = args[4] as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        if (signal?.aborted) reject(new Error('aborted'));
        signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });

    await expect(
      handleCatalogSync(
        { retailer_id: RETAILER_ID, operation: 'single_product', product_id: 'p1', triggered_by: 'retailer' },
        20,
      ),
    ).resolves.toBeUndefined();

    expect(mockCatalogSyncLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operation: 'single_product',
          status: 'FAILED',
          error_message: expect.stringContaining('timed out'),
          payload_json: expect.objectContaining({ timed_out: true }),
        }),
      }),
    );
  });

  it('still rethrows real (non-timeout) errors so BullMQ retries (C9)', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      whatsapp_api_access_token: 'tok',
      whatsapp_catalog_id: 'cat_1',
      sync_categories: [],
    });
    mockProductFindUnique.mockResolvedValue({ ...baseProduct, id: 'p1', status: 'AVAILABLE' });
    mockCatalogItemFindUnique.mockResolvedValue({
      product_id: 'p1',
      whatsapp_catalog_item_id: 'meta_p1',
      whatsapp_catalog_id: 'cat_1',
    });
    mockUpdateCatalogItem.mockRejectedValue(new Error('rate limited'));

    await expect(
      handleCatalogSync(
        { retailer_id: RETAILER_ID, operation: 'single_product', product_id: 'p1', triggered_by: 'retailer' },
        20,
      ),
    ).rejects.toThrow('rate limited');
  });
});
