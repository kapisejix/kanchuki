// Product audience + kids age group on create/update: stored as sent, the age never outlives a
// kids audience, a bad value is a 400, and an update that does not mention them leaves them alone.
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
vi.mock('../../lib/product-capacity.js', () => ({ assertProductCapacity: vi.fn() }));
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

describe('POST /products — audience', () => {
  it('stores a kids audience with its age band', async () => {
    const res = await post({ audience: 'GIRLS', kids_age_group: 'AGE_3_5' });
    expect(res.statusCode).toBe(201);
    expect(createdData()).toMatchObject({ audience: 'GIRLS', kids_age_group: 'AGE_3_5' });
  });

  it('drops the age band when the audience is not a kids value', async () => {
    await post({ audience: 'WOMEN', kids_age_group: 'AGE_3_5' });
    expect(createdData()).toMatchObject({ audience: 'WOMEN', kids_age_group: null });
  });

  it('writes neither column when neither is sent', async () => {
    await post({});
    expect(createdData()).not.toHaveProperty('audience');
    expect(createdData()).not.toHaveProperty('kids_age_group');
  });

  it('rejects an unknown audience with 400 and writes nothing', async () => {
    const res = await post({ audience: 'NOPE' });
    expect(res.statusCode).toBe(422); // validationError() in this API is a 422
    expect(m.productCreate).not.toHaveBeenCalled();
  });

  it('returns the stored fields in the response', async () => {
    m.productFindUniqueOrThrow.mockResolvedValue({
      id: 'p1',
      photos: [],
      stock: [],
      audience: 'BOYS',
      kids_age_group: 'AGE_6_8',
    });
    const res = await post({ audience: 'BOYS', kids_age_group: 'AGE_6_8' });
    expect(res.json().data).toMatchObject({ audience: 'BOYS', kids_age_group: 'AGE_6_8' });
  });
});

describe('PUT /products/:id — audience', () => {
  it('clears a stored age band when the audience is cleared', async () => {
    m.productFindFirst.mockResolvedValue({
      id: 'p1',
      retailer_id: RETAILER_ID,
      audience: 'GIRLS',
      kids_age_group: 'AGE_3_5',
    });
    await call('PUT', { audience: null });
    expect(updatedData()).toMatchObject({ audience: null, kids_age_group: null });
  });

  it('clears a stored age band when the audience changes to an adult one', async () => {
    m.productFindFirst.mockResolvedValue({
      id: 'p1',
      retailer_id: RETAILER_ID,
      audience: 'GIRLS',
      kids_age_group: 'AGE_3_5',
    });
    await call('PUT', { audience: 'MEN' });
    expect(updatedData()).toMatchObject({ audience: 'MEN', kids_age_group: null });
  });

  it('leaves both columns untouched when neither is sent', async () => {
    await call('PUT', { notes: 'hello' });
    expect(updatedData()).not.toHaveProperty('audience');
    expect(updatedData()).not.toHaveProperty('kids_age_group');
  });

  it('judges an age-only update against the stored audience', async () => {
    m.productFindFirst.mockResolvedValue({
      id: 'p1',
      retailer_id: RETAILER_ID,
      audience: 'BOYS',
    });
    await call('PUT', { kids_age_group: 'AGE_6_8' });
    expect(updatedData()).toMatchObject({ kids_age_group: 'AGE_6_8' });
    expect(updatedData()).not.toHaveProperty('audience');

    m.productUpdate.mockClear();
    m.productFindFirst.mockResolvedValue({ id: 'p1', retailer_id: RETAILER_ID, audience: null });
    await call('PUT', { kids_age_group: 'AGE_6_8' });
    expect(updatedData()).toMatchObject({ kids_age_group: null });
  });

  it('rejects an unknown audience with 400 and writes nothing', async () => {
    const res = await call('PUT', { audience: 'NOPE' });
    expect(res.statusCode).toBe(422); // validationError() in this API is a 422
    expect(m.productUpdate).not.toHaveBeenCalled();
  });

  it("does not touch another retailer's product", async () => {
    m.productFindFirst.mockResolvedValue(null);
    const res = await call('PUT', { audience: 'MEN' });
    expect(res.statusCode).toBe(404);
    expect(m.productUpdate).not.toHaveBeenCalled();
  });
});
