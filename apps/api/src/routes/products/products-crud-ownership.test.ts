// H2-4: PUT /products/:id must check section_id / category_id ownership the way POST does,
// otherwise retailer A can link a product to B's section and read B's rack name back from the
// `include: { section: { select: { name } } }` response.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  productFindFirst: vi.fn(),
  productUpdate: vi.fn(),
  sectionFind: vi.fn(),
  categoryFind: vi.fn(),
  auditCreate: vi.fn(),
  syncProduct: vi.fn(),
  embed: vi.fn(),
  retailerFind: vi.fn(),
  productCount: vi.fn(),
  productCreate: vi.fn(),
  verifyUpload: vi.fn(),
  reserve: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  vaultDelete: vi.fn(),
  prisma: {
    retailer: { findUniqueOrThrow: m.retailerFind },
    product: {
      findFirst: m.productFindFirst,
      update: m.productUpdate,
      count: m.productCount,
      create: m.productCreate,
    },
    storeSection: { findFirst: m.sectionFind },
    productCategory: { findFirst: m.categoryFind },
    auditLog: { create: m.auditCreate },
  },
}));
vi.mock('../../jobs/catalog-sync.js', () => ({
  maybeEnqueueFullSync: vi.fn(),
  maybeEnqueueProductSync: m.syncProduct,
}));
vi.mock('../../jobs/index.js', () => ({
  addEmbeddingJob: m.embed,
  addTaggingJob: vi.fn(),
}));
vi.mock('../../lib/color-families.js', () => ({ resolveColorFamily: vi.fn() }));
vi.mock('../../lib/quota.js', () => ({ reserveQuota: m.reserve }));
vi.mock('../../lib/product-capacity.js', () => ({ assertProductCapacity: vi.fn() }));
vi.mock('../../lib/upload-guard.js', () => ({ IMAGE_KINDS: [], verifyUpload: m.verifyUpload }));

import { errorHandler } from '../../plugins/error-handler.js';
import { productsCrudRoutes } from './products-crud.js';

const RETAILER_ID = 'retailer_A';

async function put(payload: object) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
  });
  await app.register(productsCrudRoutes, { prefix: '/v1/products' });
  await app.ready();
  const res = await app.inject({ method: 'PUT', url: '/v1/products/p1', payload });
  await app.close();
  return res;
}

beforeEach(() => {
  vi.resetAllMocks();
  m.productFindFirst.mockResolvedValue({ id: 'p1', retailer_id: RETAILER_ID });
  m.productUpdate.mockResolvedValue({ id: 'p1', photos: [], stock: [] });
  m.auditCreate.mockResolvedValue(undefined);
  m.syncProduct.mockResolvedValue(undefined);
  m.embed.mockResolvedValue(undefined);
  m.retailerFind.mockResolvedValue({ max_products: 100 });
  m.productCount.mockResolvedValue(0);
  m.verifyUpload.mockResolvedValue({ url: 'https://cdn.example/k.jpg', r2Key: 'k' });
  // Only retailer A's own rows are visible to a retailer_id-scoped lookup.
  m.sectionFind.mockImplementation(async ({ where }) =>
    where.id === 'sec_A' && where.retailer_id === RETAILER_ID ? { id: 'sec_A' } : null,
  );
  m.categoryFind.mockImplementation(async ({ where }) =>
    where.id === 'cat_A' && where.retailer_id === RETAILER_ID ? { id: 'cat_A' } : null,
  );
});

describe('PUT /products/:id — section/category ownership (H2-4)', () => {
  it("rejects another retailer's section_id and writes nothing", async () => {
    const res = await put({ section_id: 'sec_B' });
    expect(res.statusCode).toBe(403);
    expect(m.productUpdate).not.toHaveBeenCalled();
  });

  it("rejects another retailer's category_id and writes nothing", async () => {
    const res = await put({ category_id: 'cat_B' });
    expect(res.statusCode).toBe(403);
    expect(m.productUpdate).not.toHaveBeenCalled();
  });

  it.each([{ section_id: 'sec_B' }, { category_id: 'cat_B' }])(
    'POST still rejects a foreign id %j before reserving quota or creating',
    async (refs) => {
      const app = Fastify();
      app.setErrorHandler(errorHandler);
      app.decorateRequest('retailerId', '');
      app.addHook('preHandler', async (request) => {
        request.retailerId = RETAILER_ID;
      });
      await app.register(productsCrudRoutes, { prefix: '/v1/products' });
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/v1/products',
        payload: { photo_r2_key: 'k', photo_url: 'https://cdn.example/k.jpg', ...refs },
      });
      await app.close();
      expect(res.statusCode).toBe(403);
      expect(m.reserve).not.toHaveBeenCalled();
      expect(m.productCreate).not.toHaveBeenCalled();
    },
  );

  it('accepts own section_id and category_id', async () => {
    const res = await put({ section_id: 'sec_A', category_id: 'cat_A' });
    expect(res.statusCode).toBe(200);
    expect(m.productUpdate).toHaveBeenCalledTimes(1);
  });

  it('category_id null clears the category without a lookup', async () => {
    const res = await put({ category_id: null });
    expect(res.statusCode).toBe(200);
    expect(m.categoryFind).not.toHaveBeenCalled();
  });

  it('a body without either id does no lookup', async () => {
    const res = await put({ notes: 'x' });
    expect(res.statusCode).toBe(200);
    expect(m.sectionFind).not.toHaveBeenCalled();
    expect(m.categoryFind).not.toHaveBeenCalled();
  });
});
