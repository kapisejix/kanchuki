// Retailer size chart on create/update (spec step 3): stored as sent after validation, null clears it,
// an invalid chart is a 422 that writes nothing, and an update that does not mention it leaves it alone.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  productFindFirst: vi.fn(),
  productUpdate: vi.fn(),
  productCreate: vi.fn(),
  productCount: vi.fn(),
  productFindUniqueOrThrow: vi.fn(),
  retailerFind: vi.fn(),
  auditCreate: vi.fn(),
  verifyUpload: vi.fn(),
  reserve: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  vaultDelete: vi.fn(),
  Prisma: { DbNull: 'DbNull' },
  prisma: {
    retailer: { findUniqueOrThrow: m.retailerFind },
    product: {
      findFirst: m.productFindFirst,
      update: m.productUpdate,
      count: m.productCount,
      create: m.productCreate,
      findUniqueOrThrow: m.productFindUniqueOrThrow,
    },
    auditLog: { create: m.auditCreate },
  },
}));
vi.mock('../../jobs/catalog-sync.js', () => ({
  maybeEnqueueFullSync: vi.fn(),
  maybeEnqueueProductSync: () => Promise.resolve(),
}));
// Plain functions, not vi.fn: resetAllMocks in beforeEach would wipe a stubbed return value and
// the route calls `.catch` on the returned promise.
vi.mock('../../jobs/index.js', () => ({
  addEmbeddingJob: () => Promise.resolve(),
  addTaggingJob: () => Promise.resolve(),
}));
vi.mock('../../lib/color-families.js', () => ({ resolveColorFamily: vi.fn() }));
vi.mock('../../lib/quota.js', () => ({ reserveQuota: m.reserve }));
vi.mock('../../lib/upload-guard.js', () => ({ IMAGE_KINDS: [], verifyUpload: m.verifyUpload }));
vi.mock('../../lib/product-stock.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/product-stock.js')>()),
  defaultStock: vi.fn(() => []),
  totalQuantity: vi.fn(() => 0),
  writeStock: vi.fn().mockResolvedValue(undefined),
  zeroStock: vi.fn(),
}));

import { errorHandler } from '../../plugins/error-handler.js';
import { productsCrudRoutes } from './products-crud.js';

const RETAILER_ID = 'retailer_A';

async function call(method: 'POST' | 'PUT', payload: object) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
  });
  await app.register(productsCrudRoutes, { prefix: '/v1/products' });
  await app.ready();
  const res = await app.inject({
    method,
    url: method === 'POST' ? '/v1/products' : '/v1/products/p1',
    payload,
  });
  await app.close();
  return res;
}

const post = (extra: object) =>
  call('POST', { photo_r2_key: 'k', photo_url: 'https://cdn.example/k.jpg', ...extra });
const createdData = () => m.productCreate.mock.calls[0]?.[0].data;
const updatedData = () => m.productUpdate.mock.calls[0]?.[0].data;

beforeEach(() => {
  vi.resetAllMocks();
  m.productFindFirst.mockResolvedValue({ id: 'p1', retailer_id: RETAILER_ID, audience: null });
  m.productUpdate.mockResolvedValue({ id: 'p1', photos: [], stock: [] });
  m.productCreate.mockResolvedValue({ id: 'p1', photos: [] });
  m.productFindUniqueOrThrow.mockResolvedValue({ id: 'p1', photos: [], stock: [] });
  m.productCount.mockResolvedValue(0);
  m.retailerFind.mockResolvedValue({ max_products: 100 });
  m.auditCreate.mockResolvedValue(undefined);
  m.verifyUpload.mockResolvedValue({ url: 'https://cdn.example/k.jpg', r2Key: 'k' });
  m.reserve.mockResolvedValue(async () => undefined);
});

const chart = { M: { bust: [85, 89], waist: [67, 71] }, L: { bust: [90, 94], hip: [96, 100] } };

describe('size_chart on create', () => {
  it('stores a valid chart', async () => {
    const res = await post({ sizes: ['M', 'L'], size_chart: chart });
    expect(res.statusCode).toBe(201);
    expect(createdData().size_chart).toEqual(chart);
  });

  it('writes nothing for it when not sent', async () => {
    await post({});
    expect(createdData()).not.toHaveProperty('size_chart');
  });

  it.each([
    ['an unknown size', { NOPE: { bust: [80, 84] } }],
    ['min above max', { M: { bust: [90, 85] } }],
    ['an unknown dimension', { M: { shoulder: [38, 40] } }],
    ['an empty chart', {}],
  ])('rejects %s with 422 and writes nothing', async (_n, bad) => {
    const res = await post({ size_chart: bad });
    expect(res.statusCode).toBe(422);
    expect(m.productCreate).not.toHaveBeenCalled();
  });
});

describe('size_chart on update', () => {
  it('stores a valid chart', async () => {
    await call('PUT', { size_chart: chart });
    expect(updatedData().size_chart).toEqual(chart);
  });

  it('null clears the chart (a database NULL, not the JSON null)', async () => {
    await call('PUT', { size_chart: null });
    // Prisma needs its DbNull sentinel for a JSON column; a plain null would be rejected.
    expect(updatedData().size_chart).toBe('DbNull');
  });

  it('an update that does not mention it leaves it alone', async () => {
    await call('PUT', { notes: 'x' });
    expect(updatedData()).not.toHaveProperty('size_chart');
  });

  it('rejects a bad chart with 422 and writes nothing', async () => {
    const res = await call('PUT', { size_chart: { M: { bust: [10, 20] } } });
    expect(res.statusCode).toBe(422);
    expect(m.productUpdate).not.toHaveBeenCalled();
  });
});
