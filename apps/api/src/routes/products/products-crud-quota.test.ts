import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  reserve: vi.fn(),
  refund: vi.fn(),
  retailerFind: vi.fn(),
  productCount: vi.fn(),
  productCreate: vi.fn(),
  productFind: vi.fn(),
  auditCreate: vi.fn(),
  verifyUpload: vi.fn(),
  writeStock: vi.fn(),
  addTaggingJob: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  vaultDelete: vi.fn(),
  prisma: {
    retailer: { findUniqueOrThrow: m.retailerFind },
    product: {
      count: m.productCount,
      create: m.productCreate,
      findUniqueOrThrow: m.productFind,
      update: vi.fn(),
    },
    auditLog: { create: m.auditCreate },
  },
}));
vi.mock('../../jobs/catalog-sync.js', () => ({
  maybeEnqueueFullSync: vi.fn(),
  maybeEnqueueProductSync: vi.fn(),
}));
vi.mock('../../jobs/index.js', () => ({
  addEmbeddingJob: vi.fn(),
  addTaggingJob: m.addTaggingJob,
}));
vi.mock('../../lib/color-families.js', () => ({ resolveColorFamily: vi.fn() }));
vi.mock('../../lib/product-capacity.js', () => ({ assertProductCapacity: m.reserve }));
vi.mock('../../lib/upload-guard.js', () => ({ IMAGE_KINDS: [], verifyUpload: m.verifyUpload }));
vi.mock('../../lib/product-stock.js', async (orig) => ({
  ...(await orig<typeof import('../../lib/product-stock.js')>()),
  writeStock: m.writeStock,
}));

import { errorHandler } from '../../plugins/error-handler.js';
import { productsCrudRoutes } from './products-crud.js';

const RETAILER_ID = 'retailer_1';
const body = { photo_r2_key: 'k', photo_url: 'https://cdn.example/k.jpg' };

async function post(payload: unknown = body) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
  });
  await app.register(productsCrudRoutes, { prefix: '/v1/products' });
  await app.ready();
  const res = await app.inject({ method: 'POST', url: '/v1/products', payload: payload as object });
  await app.close();
  return res;
}

beforeEach(() => {
  vi.resetAllMocks();
  m.reserve.mockResolvedValue(m.refund);
  m.refund.mockResolvedValue(undefined);
  m.retailerFind.mockResolvedValue({ max_products: 100 });
  m.productCount.mockResolvedValue(0);
  m.verifyUpload.mockResolvedValue({ url: 'https://cdn.example/k.jpg', r2Key: 'k' });
  m.productCreate.mockResolvedValue({ id: 'p1', photos: [] });
  m.productFind.mockResolvedValue({ id: 'p1', photos: [], stock: [] });
  m.writeStock.mockResolvedValue(undefined);
  m.addTaggingJob.mockResolvedValue(undefined);
});

// RC-178: POST /products checks the shared LIVE-product cap (assertProductCapacity), not a
// lifetime PRODUCT_UPLOAD counter, so there is no slot to keep or hand back.
describe('POST /products — live product cap', () => {
  it('checks capacity once, then creates the product', async () => {
    const res = await post();
    expect(res.statusCode).toBe(201);
    expect(m.reserve).toHaveBeenCalledExactlyOnceWith(RETAILER_ID);
  });

  it('an invalid body or an upload that does not verify creates nothing', async () => {
    expect((await post({ photo_r2_key: '' })).statusCode).toBe(422);
    m.verifyUpload.mockRejectedValue(new Error('not yours'));
    expect((await post()).statusCode).toBe(500);
    expect(m.productCreate).not.toHaveBeenCalled();
  });

  it('over the cap: the 402 stops the create', async () => {
    const { planLimitExceeded } = await import('../../plugins/error-handler.js');
    m.reserve.mockRejectedValue(planLimitExceeded('products'));
    const res = await post();
    expect(res.statusCode).toBe(402);
    expect(m.productCreate).not.toHaveBeenCalled();
  });

  it('a duplicate SKU is still a 422', async () => {
    m.productCreate.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    expect((await post()).statusCode).toBe(422);
  });
});
