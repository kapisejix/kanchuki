import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';

const {
  mockRetailerFindFirst,
  mockProductFindMany,
  mockInteractionFindMany,
  mockGetPassportSession,
} = vi.hoisted(() => ({
  mockRetailerFindFirst: vi.fn(),
  mockProductFindMany: vi.fn(),
  mockInteractionFindMany: vi.fn(),
  mockGetPassportSession: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findFirst: mockRetailerFindFirst },
    product: { findMany: mockProductFindMany },
    customerInteraction: { findMany: mockInteractionFindMany },
  },
}));

vi.mock('../passport/passport-helpers.js', () => ({
  getPassportSession: mockGetPassportSession,
}));

const { publicRecommendationsRoutes } = await import('../public-recommendations.js');

function product(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    price_min: 2000,
    price_max: 2200,
    mrp: null,
    created_at: new Date('2026-09-01T00:00:00Z'),
    status: 'AVAILABLE',
    category: 'Saree',
    subtype: 'Banarasi',
    primary_color: 'Maroon',
    location_notes: null,
    section: null,
    photos: [{ url: `https://cdn.test/${id}.jpg`, r2_key: null, metadata: {} }],
    _count: { photos: 1 },
    fabrics: ['Silk'],
    ...overrides,
  };
}

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(publicRecommendationsRoutes, { prefix: '/v1/public' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRetailerFindFirst.mockResolvedValue({ id: 'store-a', shop_name: 'Store A' });
  mockGetPassportSession.mockResolvedValue(null);
  mockInteractionFindMany.mockResolvedValue([]);
  mockProductFindMany.mockResolvedValue([product('candidate-1')]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /v1/public/recommendations', () => {
  it('uses only current-visit product IDs verified against the active store for an anonymous shopper', async () => {
    mockProductFindMany
      .mockResolvedValueOnce([product('seen-a')])
      .mockResolvedValueOnce([product('candidate-1')]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/recommendations',
      payload: { slug: 'store-a', visit_product_ids: ['seen-a', 'from-store-b'] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.personalized).toBe(true);
    expect(res.json().data.products.map((item: { id: string }) => item.id)).toEqual([
      'candidate-1',
    ]);
    expect(mockInteractionFindMany).not.toHaveBeenCalled();
    expect(mockProductFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['seen-a', 'from-store-b'] },
          retailer_id: 'store-a',
          deleted_at: null,
        }),
      }),
    );
    expect(mockProductFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          retailer_id: 'store-a',
          status: 'AVAILABLE',
          id: { notIn: ['seen-a'] },
        }),
      }),
    );
    await app.close();
  });

  it('uses recognized-customer interactions only for that account and active store', async () => {
    mockGetPassportSession.mockResolvedValue({
      customer_account_id: 'account-1',
      customer_account: { profiling_enabled: true },
    });
    mockInteractionFindMany.mockResolvedValue([
      { type: 'FAVORITE', product_id: 'favorite-a' },
      { type: 'VIEW', product_id: 'view-a' },
    ]);
    mockProductFindMany
      .mockResolvedValueOnce([product('favorite-a'), product('view-a'), product('visit-a')])
      .mockResolvedValueOnce([product('candidate-1')]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/recommendations',
      headers: { cookie: 'kanchuki_passport=session-1' },
      payload: { slug: 'store-a', visit_product_ids: ['visit-a', 'untrusted-store-b-id'] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.personalized).toBe(true);
    expect(mockInteractionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customer_account_id: 'account-1',
          retailer_id: 'store-a',
          type: { in: ['FAVORITE', 'UNFAVORITE', 'ENQUIRY', 'VIEW'] },
        }),
      }),
    );
    expect(mockProductFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['favorite-a', 'view-a', 'visit-a', 'untrusted-store-b-id'] },
          retailer_id: 'store-a',
          deleted_at: null,
          status: 'AVAILABLE',
        }),
      }),
    );
    expect(mockProductFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          retailer_id: 'store-a',
          status: 'AVAILABLE',
          id: { notIn: ['favorite-a', 'view-a', 'visit-a'] },
        }),
      }),
    );
    await app.close();
  });

  it('does not read recognized history or anonymous visit IDs when profiling is disabled', async () => {
    mockGetPassportSession.mockResolvedValue({
      customer_account_id: 'account-1',
      customer_account: { profiling_enabled: false },
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/recommendations',
      headers: { cookie: 'kanchuki_passport=session-1' },
      payload: { slug: 'store-a', visit_product_ids: ['seen-a'] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.json().data.personalized).toBe(false);
    expect(mockInteractionFindMany).not.toHaveBeenCalled();
    expect(mockProductFindMany).toHaveBeenCalledTimes(1);
    expect(mockProductFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ retailer_id: 'store-a', status: 'AVAILABLE' }),
      }),
    );
    await app.close();
  });

  it('falls back to the active store catalog when there are no usable signals', async () => {
    mockProductFindMany.mockResolvedValue([product('newest-a'), product('older-a')]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/recommendations',
      payload: { slug: 'store-a', visit_product_ids: [] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.personalized).toBe(false);
    expect(res.json().data.products.map((item: { id: string }) => item.id)).toEqual([
      'newest-a',
      'older-a',
    ]);
    expect(mockProductFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ retailer_id: 'store-a', status: 'AVAILABLE' }),
        orderBy: { created_at: 'desc' },
      }),
    );
    await app.close();
  });

  it('falls back to the active store ordering when signals share no usable attributes', async () => {
    mockGetPassportSession.mockResolvedValue({
      customer_account_id: 'account-1',
      customer_account: { profiling_enabled: true },
    });
    mockInteractionFindMany.mockResolvedValue([{ type: 'VIEW', product_id: 'seen-saree' }]);
    mockProductFindMany
      .mockResolvedValueOnce([product('seen-saree')])
      .mockResolvedValueOnce([
        product('newest-lehenga', {
          category: 'Lehenga',
          subtype: 'Bridal',
          primary_color: 'Green',
          fabrics: ['Velvet'],
          price_min: 50000,
          created_at: new Date('2026-09-20T00:00:00Z'),
        }),
        product('older-lehenga', {
          category: 'Lehenga',
          subtype: 'Bridal',
          primary_color: 'Green',
          fabrics: ['Velvet'],
          price_min: 50000,
          created_at: new Date('2026-09-10T00:00:00Z'),
        }),
      ])
      .mockResolvedValueOnce([
        product('newest-lehenga', {
          category: 'Lehenga',
          subtype: 'Bridal',
          primary_color: 'Green',
          fabrics: ['Velvet'],
          price_min: 50000,
          created_at: new Date('2026-09-20T00:00:00Z'),
        }),
        product('older-lehenga', {
          category: 'Lehenga',
          subtype: 'Bridal',
          primary_color: 'Green',
          fabrics: ['Velvet'],
          price_min: 50000,
          created_at: new Date('2026-09-10T00:00:00Z'),
        }),
      ]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/recommendations',
      headers: { cookie: 'kanchuki_passport=session-1' },
      payload: { slug: 'store-a' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.personalized).toBe(false);
    expect(res.json().data.products.map((item: { id: string }) => item.id)).toEqual([
      'newest-lehenga',
      'older-lehenga',
    ]);
    await app.close();
  });

  it('returns 404 for a missing store without reading any signals or products', async () => {
    mockRetailerFindFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/recommendations',
      payload: { slug: 'unknown-store', visit_product_ids: ['seen-a'] },
    });

    expect(res.statusCode).toBe(404);
    expect(mockRetailerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          public_slug: 'unknown-store',
          deleted_at: null,
          is_suspended: false,
        }),
      }),
    );
    expect(mockInteractionFindMany).not.toHaveBeenCalled();
    expect(mockProductFindMany).not.toHaveBeenCalled();
    await app.close();
  });
});
