// Route tests for the AI Stylist filter fix + catalog-derived suggestions.
//
// Root cause pinned here: the old keyword table never matched kids/age/
// gender language and, on zero category matches, silently fell back to the
// store's most-recently-uploaded products regardless of category — so a
// "2 years boy" query could return ladies suits. These tests fail if that
// fallback comes back.
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

const { mockRetailerFindFirst, mockProductFindMany, mockWithPublicCache } = vi.hoisted(() => ({
  mockRetailerFindFirst: vi.fn(),
  mockProductFindMany: vi.fn(),
  mockWithPublicCache: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findFirst: mockRetailerFindFirst },
    product: { findMany: mockProductFindMany },
  },
}));

vi.mock('../../lib/public-cache.js', () => ({
  withPublicCache: mockWithPublicCache,
}));

const { publicStylistRoutes } = await import('./public-stylist.js');

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(publicStylistRoutes, { prefix: '/v1/public' });
  await app.ready();
  return app;
}

const LADIES_SUIT = {
  id: 'p-suit',
  name: 'Pink Silk Suit',
  category: 'Ladies Suit',
  subtype: 'Anarkali',
  primary_color: 'Pink',
  secondary_colors: [],
  fabric_estimate: 'Silk',
  price_min: 1500,
  price_max: 2000,
  occasions: ['Wedding'],
  photos: [{ url: 'https://cdn.test/suit.jpg' }],
};

const KIDS_WEAR = {
  id: 'p-kids',
  name: "Boy's Ethnic Set",
  category: 'Kids Ethnic Wear',
  subtype: 'Kurta Set',
  primary_color: 'Blue',
  secondary_colors: [],
  fabric_estimate: 'Cotton',
  price_min: 800,
  price_max: 1000,
  occasions: ['Special Occasion'],
  photos: [{ url: 'https://cdn.test/kids.jpg' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockWithPublicCache.mockImplementation(async (_url: string, fn: () => Promise<unknown>) => fn());
  mockRetailerFindFirst.mockResolvedValue({ id: 'r1', shop_name: 'Meera Fashions' });
  delete process.env.ANTHROPIC_API_KEY;
  // Never let this suite reach the real Anthropic API, whether or not a real
  // key is present in the environment — these tests assert the deterministic
  // filter, not Claude's output, and a real network call would hang/timeout
  // in a sandboxed test run instead of failing fast.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network disabled in tests')));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /public/stylist — category/age/gender filter', () => {
  it('a kids/age query returns only kids items, never ladies suits, even though suits are more numerous', async () => {
    mockProductFindMany.mockResolvedValue([LADIES_SUIT, LADIES_SUIT, LADIES_SUIT, KIDS_WEAR]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/stylist',
      payload: { slug: 'meera', query: 'clothing for 2 years boy for family function' },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.recommendations).toHaveLength(1);
    expect(data.recommendations[0].product_id).toBe('p-kids');
    await app.close();
  });

  it('a kids query against a store with none returns empty, not an unrelated fallback', async () => {
    mockProductFindMany.mockResolvedValue([LADIES_SUIT, LADIES_SUIT]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/stylist',
      payload: { slug: 'meera', query: 'kids wear for a birthday' },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.recommendations).toEqual([]);
    expect(data.stylist_note).toMatch(/doesn't have matching items/i);
    await app.close();
  });

  it('a query naming no category/age/gender still falls back across the full catalog (unchanged behavior)', async () => {
    mockProductFindMany.mockResolvedValue([LADIES_SUIT, KIDS_WEAR]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/stylist',
      payload: { slug: 'meera', query: 'something nice under a budget' },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.recommendations).toHaveLength(2);
    await app.close();
  });
});

describe('GET /public/stylist/suggestions — catalog-derived starter chips', () => {
  it("builds suggestions only from this store's own categories/occasions/colors", async () => {
    mockProductFindMany.mockResolvedValue([KIDS_WEAR, KIDS_WEAR]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/stylist/suggestions?slug=meera',
    });
    expect(res.statusCode).toBe(200);
    const { suggestions } = res.json().data;
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      expect(s.toLowerCase()).toContain('kids ethnic wear');
    }
    // Never invents a category the store doesn't carry.
    expect(suggestions.join(' ').toLowerCase()).not.toContain('ladies suit');
    await app.close();
  });

  it('an empty catalog returns an empty suggestion list, not generic garment names', async () => {
    mockProductFindMany.mockResolvedValue([]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/stylist/suggestions?slug=meera',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.suggestions).toEqual([]);
    await app.close();
  });
});
