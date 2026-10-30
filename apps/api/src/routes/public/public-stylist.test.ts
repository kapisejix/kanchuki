// Route tests for the AI Stylist filter fix + catalog-derived suggestions.
//
// Root cause pinned here: the old keyword table never matched kids/age/
// gender language and, on zero category matches, silently fell back to the
// store's most-recently-uploaded products regardless of category — so a
// "2 years boy" query could return ladies suits. These tests fail if that
// fallback comes back.
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

const { mockRetailerFindFirst, mockProductFindMany, mockWithPublicCache, mockCapture } = vi.hoisted(
  () => ({
    mockRetailerFindFirst: vi.fn(),
    mockProductFindMany: vi.fn(),
    mockWithPublicCache: vi.fn(),
    mockCapture: vi.fn(),
  }),
);

vi.mock('../../instrument.js', () => ({
  Sentry: { captureException: mockCapture },
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

  it('a query matching nothing in the store returns no products (never the whole catalog)', async () => {
    mockProductFindMany.mockResolvedValue([LADIES_SUIT, KIDS_WEAR]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/stylist',
      payload: { slug: 'meera', query: 'something nice under a budget' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recommendations).toEqual([]);
    await app.close();
  });

  it('a colour query returns only products of that colour', async () => {
    mockProductFindMany.mockResolvedValue([
      { ...LADIES_SUIT, id: 'p_pink', name: 'Anarkali A', primary_color: 'Pink' },
      { ...LADIES_SUIT, id: 'p_blue', name: 'Anarkali B', primary_color: 'Blue' },
    ]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/stylist',
      payload: { slug: 'meera', query: 'pink suit' },
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().data.recommendations.map((r: { product_id: string }) => r.product_id);
    expect(ids).toEqual(['p_pink']);
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

describe('POST /public/stylist — paise → rupees (RC-055)', () => {
  it('sends Claude the catalog price in rupees, not raw paise', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockRejectedValue(new Error('network disabled in tests'));
    vi.stubGlobal('fetch', fetchMock);
    mockProductFindMany.mockResolvedValue([
      { ...LADIES_SUIT, price_min: 210000, price_max: 210000 },
    ]);
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/v1/public/stylist',
      payload: { slug: 'meera', query: 'something for a wedding' },
    });
    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = String(init.body);
    expect(body).toContain('₹2,100/-');
    expect(body).not.toContain('210000');
    await app.close();
  });
});

describe('POST /public/stylist — fallback is reported, not disguised as AI (RC-059)', () => {
  async function ask() {
    mockProductFindMany.mockResolvedValue([LADIES_SUIT, KIDS_WEAR]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/stylist',
      payload: { slug: 'meera', query: 'something for a wedding' },
    });
    await app.close();
    return res.json().data;
  }

  it('no API key → fallback flag, no canned rationale, Sentry event tagged missing_api_key', async () => {
    const data = await ask();
    expect(data.fallback).toBe(true);
    expect(data.recommendations.every((r: { rationale: string }) => r.rationale === '')).toBe(true);
    expect(mockCapture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ fallback_reason: 'missing_api_key' }),
      }),
    );
  });

  it('provider failure → same fallback, Sentry event carries the real error', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const data = await ask();
    expect(data.fallback).toBe(true);
    const [err, ctx] = mockCapture.mock.calls[0] as [Error, { tags: Record<string, string> }];
    expect(err.message).toBe('network disabled in tests');
    expect(ctx.tags.fallback_reason).toBe('provider_error');
  });
});

// RC-079 — /stylist needs no login and spends Claude credit on every call, so it
// must be capped per IP and must not wait on Anthropic forever.
describe('POST /public/stylist — cost caps (RC-079)', () => {
  const payload = { slug: 'meera', query: 'something for a wedding' };

  it('the 11th request inside a minute is rejected with 429', async () => {
    mockProductFindMany.mockResolvedValue([LADIES_SUIT]);
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    // Global limit far above the route limit, so only the route's own cap can trip.
    await app.register(rateLimit, { max: 1000, timeWindow: 60_000 });
    await app.register(publicStylistRoutes, { prefix: '/v1/public' });
    await app.ready();

    const codes: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await app.inject({ method: 'POST', url: '/v1/public/stylist', payload });
      codes.push(res.statusCode);
    }
    await app.close();

    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it('a hanging Anthropic call is aborted after 20 s and answered from the fallback', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockProductFindMany.mockResolvedValue([LADIES_SUIT]);
    const timer = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timer.signal);
    const fetchMock = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('timed out')));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const app = await buildApp();
    const pending = app.inject({ method: 'POST', url: '/v1/public/stylist', payload });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    timer.abort();
    const res = await pending;
    await app.close();

    expect(timeoutSpy).toHaveBeenCalledWith(20_000);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.fallback).toBe(true);
    expect(mockCapture.mock.calls[0]?.[1].tags.fallback_reason).toBe('provider_error');
    timeoutSpy.mockRestore();
  });
});
