import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { publicRoutes } from './public.js';

const { mockRetailerFindFirst, mockCustomerUpsert, mockCollectionFindFirst } = vi.hoisted(() => ({
  mockRetailerFindFirst: vi.fn(),
  mockCustomerUpsert: vi.fn(),
  mockCollectionFindFirst: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findFirst: mockRetailerFindFirst },
    customer: { upsert: mockCustomerUpsert },
    collection: { findFirst: mockCollectionFindFirst, count: vi.fn(), update: vi.fn() },
    product: { count: vi.fn() },
    collectionEnquiry: { count: vi.fn(), create: vi.fn() },
  },
}));

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(publicRoutes, { prefix: '/v1/public' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /public/retailers/:slug', () => {
  it('returns 404 for an unknown slug', async () => {
    mockRetailerFindFirst.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/public/retailers/unknown-slug' });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns profile with storefront_slug null when no storefront collection is set', async () => {
    mockRetailerFindFirst.mockResolvedValue({
      shop_name: 'Test Shop',
      city: 'Test City',
      state: 'TS',
      address_line1: null,
      address_line2: null,
      categories: ['sarees'],
      storefront_collection_id: null,
    });

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/public/retailers/test-shop-ab12' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.shop_name).toBe('Test Shop');
    expect(res.json().data.storefront_slug).toBeNull();
    expect(mockCollectionFindFirst).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /public/retailers/:slug/leads', () => {
  it('returns 404 for an unknown slug', async () => {
    mockRetailerFindFirst.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/retailers/unknown-slug/leads',
      payload: { name: 'Test Customer', phone: '9999999999', gender: 'FEMALE', consent: true },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('rejects when consent is not true', async () => {
    mockRetailerFindFirst.mockResolvedValue({ id: 'retailer_1' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/retailers/test-shop-ab12/leads',
      payload: { name: 'Test Customer', phone: '9999999999', gender: 'FEMALE', consent: false },
    });

    expect(res.statusCode).toBe(422);
    expect(mockCustomerUpsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('upserts a consented customer and returns 201', async () => {
    mockRetailerFindFirst.mockResolvedValue({ id: 'retailer_1' });
    mockCustomerUpsert.mockResolvedValue({ id: 'cust_1', name: 'Test Customer' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/retailers/test-shop-ab12/leads',
      payload: { name: 'Test Customer', phone: '9999999999', gender: 'FEMALE', consent: true },
    });

    expect(res.statusCode).toBe(201);
    expect(mockCustomerUpsert).toHaveBeenCalledOnce();
    const call = mockCustomerUpsert.mock.calls[0]?.[0];
    expect(call.create.consent_given).toBe(true);
    expect(call.create.gender).toBe('FEMALE');
    await app.close();
  });
});
