import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { publicRoutes } from './public.js';

const {
  mockRetailerFindFirst,
  mockRetailerFindMany,
  mockCustomerUpsert,
  mockCollectionFindFirst,
  mockAuditLogCreate,
} = vi.hoisted(() => ({
  mockRetailerFindFirst: vi.fn(),
  mockRetailerFindMany: vi.fn(),
  mockCustomerUpsert: vi.fn(),
  mockCollectionFindFirst: vi.fn(),
  mockAuditLogCreate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findFirst: mockRetailerFindFirst, findMany: mockRetailerFindMany },
    customer: { upsert: mockCustomerUpsert },
    collection: { findFirst: mockCollectionFindFirst, count: vi.fn(), update: vi.fn() },
    product: { count: vi.fn() },
    collectionEnquiry: { count: vi.fn(), create: vi.fn() },
    auditLog: { create: mockAuditLogCreate },
  },
  // Import-chain requirement only: public route graph pulls purge modules that
  // call getPurgePrisma() at module top-level. Never exercised by this suite.
  getPurgePrisma: () => ({
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $transaction: (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : Promise.resolve(),
    retailer: { findUnique: vi.fn() },
  }),
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

describe('GET /public/retailers (sitemap discovery)', () => {
  it('returns live retailers with categories and collections', async () => {
    mockRetailerFindMany.mockResolvedValue([
      {
        public_slug: 'test-shop-ab12',
        shop_name: 'Test Shop',
        city: 'Test City',
        updated_at: new Date('2026-08-10T10:00:00Z'),
        product_categories: [
          {
            id: 'cat_1',
            name: 'Kurtis',
            products: [{ name: 'Kurti', photos: [{ url: 'https://img.test/kurti-1.jpg' }] }],
          },
        ],
        products: [{ name: 'Kurti', photos: [{ url: 'https://img.test/kurti-1.jpg' }] }],
        collections: [
          {
            slug: 'summer-collection',
            products: [
              {
                product: {
                  id: 'prod_1',
                  name: 'Kurti',
                  photos: [{ url: 'https://img.test/kurti-1.jpg' }],
                },
              },
            ],
          },
        ],
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/public/retailers' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      public_slug: 'test-shop-ab12',
      shop_name: 'Test Shop',
      city: 'Test City',
      categories: [
        {
          id: 'cat_1',
          name: 'Kurtis',
          photos: [{ url: 'https://img.test/kurti-1.jpg', name: 'Kurti' }],
        },
      ],
      collections: [
        {
          slug: 'summer-collection',
          products: [{ id: 'prod_1', name: 'Kurti', url: 'https://img.test/kurti-1.jpg' }],
        },
      ],
      product_photos: [{ url: 'https://img.test/kurti-1.jpg', name: 'Kurti' }],
    });
    expect(body.data[0].updated_at).toBe('2026-08-10T10:00:00.000Z');

    // Photo sub-queries take only the primary photo per product (capped).
    const categoryProducts =
      mockRetailerFindMany.mock.calls[0]?.[0]?.select?.product_categories?.select?.products;
    expect(categoryProducts.where).toEqual({ deleted_at: null });
    expect(categoryProducts.take).toBeLessThanOrEqual(200);
    expect(categoryProducts.select.photos.orderBy).toEqual([
      { is_primary: 'desc' },
      { sort_order: 'asc' },
    ]);

    // Collection sub-query carries product IDs + primary photos for the
    // shared-product sitemap URLs (/{store}/{collection}/product/{id}).
    const collectionProducts =
      mockRetailerFindMany.mock.calls[0]?.[0]?.select?.collections?.select?.products;
    expect(collectionProducts.where).toEqual({ product: { deleted_at: null } });
    expect(collectionProducts.take).toBeLessThanOrEqual(200);
    expect(collectionProducts.select.product.select.photos.take).toBe(1);

    // Discovery query filters to indexable stores: has a public_slug, not
    // suspended/deleted, has live products. Deliberately NO onboarding gate —
    // the QR slug (POST /me/qr-slug) can exist before onboarding completes.
    const where = mockRetailerFindMany.mock.calls[0]?.[0]?.where;
    expect(where.public_slug).toEqual({ not: null });
    expect(where.onboarding_completed).toBeUndefined();
    expect(where.is_suspended).toBe(false);
    expect(where.deleted_at).toBeNull();
    expect(where.products).toEqual({ some: { deleted_at: null } });
    await app.close();
  });

  it('skips retailers without a public slug and returns an empty list', async () => {
    mockRetailerFindMany.mockResolvedValue([
      {
        public_slug: null,
        shop_name: 'No Storefront',
        city: 'X',
        updated_at: new Date(),
        product_categories: [],
        collections: [],
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/public/retailers' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
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

describe('POST /public/contact', () => {
  it('writes an AuditLog entry and returns 201', async () => {
    mockAuditLogCreate.mockResolvedValue({ id: 'log_1' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/contact',
      payload: {
        name: 'Test Retailer',
        shop_city: 'Jaipur',
        topic: 'Getting started',
        message: 'How do I add my first product?',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(mockAuditLogCreate).toHaveBeenCalledOnce();
    const call = mockAuditLogCreate.mock.calls[0]?.[0];
    expect(call.data.resource_type).toBe('ContactSubmission');
    expect(call.data.action).toBe('CONTACT_FORM_SUBMIT');
    expect(call.data.metadata.name).toBe('Test Retailer');
    await app.close();
  });

  it('rejects an unknown topic with 422', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/contact',
      payload: { name: 'Test', topic: 'Not a real topic', message: 'hi' },
    });

    expect(res.statusCode).toBe(422);
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an empty message with 422', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/contact',
      payload: { name: 'Test', topic: 'Billing', message: '' },
    });

    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('returns 400 (not 500) for a malformed request body', async () => {
    // Truncated JSON — Fastify's body parser fails before the handler runs.
    // The error handler must respect the parser's 4xx status (a broken client
    // request is not a server fault; 500 here made the form look broken on
    // flaky networks).
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/contact',
      headers: { 'content-type': 'application/json' },
      payload: '{"name":"x"',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.status).toBe(400);
    await app.close();
  });
});
