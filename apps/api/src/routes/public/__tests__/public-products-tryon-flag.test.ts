// F-040 / T4 — GET /v1/public/products/:id carries `try_on_enabled`,
// derived from the STORE's plan (not the shopper's — a shopper has no plan).
//
// This is the flag the customer PWA's "Try it on" button reads. The one thing a
// route test can prove that a unit test of `hasFeatureForPlan` cannot: the value
// is computed for the retailer who owns the product, and it fails closed when
// that retailer's plan has no VIRTUAL_TRY_ON_V2 row (the state on ship day).
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';
import { publicProductsRoutes } from '../public-products.js';

const { mockProductFindFirst, mockHasFeatureForPlan } = vi.hoisted(() => ({
  mockProductFindFirst: vi.fn(),
  mockHasFeatureForPlan: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: { product: { findFirst: mockProductFindFirst } },
  Prisma: {},
  // The route wraps its work in withRetry — pass the callback straight through.
  withRetry: async (fn: () => Promise<unknown>) => fn(),
}));

vi.mock('../../../lib/features.js', () => ({
  hasFeatureForPlan: mockHasFeatureForPlan,
}));

// The public cache would otherwise reach Redis in a hermetic test.
vi.mock('../../../lib/public-cache.js', () => ({
  withPublicCache: async (_key: string, fn: () => Promise<unknown>) => fn(),
}));

function productRow(plan: string) {
  return {
    id: 'prod-1',
    name: 'Maroon Silk Saree',
    price_min: 250000,
    price_max: 300000,
    mrp: null,
    created_at: new Date(),
    status: 'AVAILABLE',
    category: 'Saree',
    primary_color: 'Maroon',
    secondary_colors: [],
    fabric_estimate: null,
    description: null,
    search_tags: [],
    sizes: [],
    is_unstitched: false,
    includes_blouse: false,
    location_notes: null,
    avg_rating: 0,
    rating_count: 0,
    photos: [{ url: 'https://cdn.test/p.jpg', r2_key: null }],
    variants: [],
    videos: [],
    section: null,
    retailer: { plan },
  };
}

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(publicProductsRoutes, { prefix: '/v1/public' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /v1/public/products/:id — try_on_enabled', () => {
  it('is true when the store plan has VIRTUAL_TRY_ON_V2, checked against the store plan', async () => {
    mockProductFindFirst.mockResolvedValue(productRow('PRO'));
    mockHasFeatureForPlan.mockResolvedValue(true);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/public/products/prod-1' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.try_on_enabled).toBe(true);
    // The flag is the RETAILER's plan, not a client-supplied value.
    expect(mockHasFeatureForPlan).toHaveBeenCalledWith('PRO', 'VIRTUAL_TRY_ON_V2');
    await app.close();
  });

  it('is false — fail-closed — when the plan has no VIRTUAL_TRY_ON_V2 row (the ship-day state)', async () => {
    mockProductFindFirst.mockResolvedValue(productRow('STARTER'));
    mockHasFeatureForPlan.mockResolvedValue(false);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/public/products/prod-1' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.try_on_enabled).toBe(false);
    await app.close();
  });
});
