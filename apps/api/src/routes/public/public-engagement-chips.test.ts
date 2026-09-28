// Route tests for the public social-proof chip counts — F-037 §2 row 5.
//
// The load-bearing property is the honesty rule, not the happy path: a product
// the rollup has no count for must come back ABSENT (the card renders no chip),
// never as a zero. A zero would read to the storefront as "nobody viewed this",
// which the top-10-per-day data cannot actually support.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

const { mockRetailerFindFirst, mockDailyFindMany, mockQueryRaw, mockWithPublicCache } = vi.hoisted(
  () => ({
    mockRetailerFindFirst: vi.fn(),
    mockDailyFindMany: vi.fn(),
    mockQueryRaw: vi.fn(),
    mockWithPublicCache: vi.fn(),
  }),
);

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findFirst: mockRetailerFindFirst },
    retailerEngagementDaily: { findMany: mockDailyFindMany },
    // Deliberately present: the endpoint must never read the raw event log
    // (§7.2). A regression that reaches for it would have to call this, and
    // that is asserted against below.
    $queryRawUnsafe: mockQueryRaw,
  },
}));

vi.mock('../../lib/public-cache.js', () => ({
  withPublicCache: mockWithPublicCache,
}));

const { publicEngagementChipsRoutes } = await import('./public-engagement-chips.js');

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(publicEngagementChipsRoutes);
  await app.ready();
  return app;
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

interface Counts {
  viewed_today?: number;
  favorited_week?: number;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWithPublicCache.mockImplementation(async (_url: string, fn: () => Promise<unknown>) => fn());
  mockRetailerFindFirst.mockResolvedValue({ id: 'r1' });
});

describe('GET /engagement-chips?store=', () => {
  it('returns counts only for products present in the top lists, and never touches the raw event log', async () => {
    mockDailyFindMany.mockResolvedValue([
      {
        date: day('2026-09-27'),
        top_products: [
          { value: 'p1', count: 8 },
          { value: 'p2', count: 2 },
        ],
        top_favorited_products: [{ value: 'p1', count: 3 }],
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/engagement-chips?store=meera-sarees' });
    expect(res.statusCode).toBe(200);
    const { products, window: win } = res.json().data as {
      products: Record<string, Counts>;
      window: { today: string | null; week_from: string | null; week_to: string | null };
    };

    // Exactly the products the rollup had — no others invented, none dropped.
    expect(Object.keys(products).sort()).toEqual(['p1', 'p2']);
    expect(products.p1).toEqual({ viewed_today: 8, favorited_week: 3 });
    // p2 was viewed but never favorited: the key is omitted, not zeroed.
    expect(products.p2).toEqual({ viewed_today: 2 });

    // The window the counts actually cover travels with them.
    expect(win).toEqual({ today: '2026-09-27', week_from: '2026-09-27', week_to: '2026-09-27' });
    expect(res.headers['cache-control']).toContain('s-maxage=300');

    // Rollup only — the public hot path never scans customer_interactions.
    expect(mockDailyFindMany).toHaveBeenCalledTimes(1);
    expect(mockQueryRaw).not.toHaveBeenCalled();

    await app.close();
  });

  it('honesty rule: a product absent from the top lists gets no entry, and no entry is ever a zero', async () => {
    mockDailyFindMany.mockResolvedValue([
      {
        date: day('2026-09-27'),
        top_products: [{ value: 'p1', count: 6 }],
        // Favorited-only product: must not gain a `viewed_today: 0` stamp.
        top_favorited_products: [{ value: 'p-fav-only', count: 4 }],
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/engagement-chips?store=meera-sarees' });
    const { products } = res.json().data as { products: Record<string, Counts> };

    // Absent — not present-with-zero.
    expect(products['p-never-seen']).toBeUndefined();
    expect(Object.keys(products).sort()).toEqual(['p-fav-only', 'p1']);

    // `toEqual` (exact shape) is the assertion that catches a seeded zero.
    expect(products['p-fav-only']).toEqual({ favorited_week: 4 });
    expect(products.p1).toEqual({ viewed_today: 6 });

    // And nothing anywhere in the payload carries a fabricated zero.
    for (const counts of Object.values(products)) {
      for (const value of Object.values(counts)) expect(value).toBeGreaterThan(0);
    }

    await app.close();
  });

  it('viewed_today is the newest day alone; favorited_week sums across the whole week', async () => {
    mockDailyFindMany.mockResolvedValue([
      {
        date: day('2026-09-27'),
        top_products: [{ value: 'p1', count: 5 }],
        top_favorited_products: [{ value: 'p1', count: 3 }],
      },
      {
        date: day('2026-09-26'),
        top_products: [{ value: 'p1', count: 9 }],
        top_favorited_products: [{ value: 'p2', count: 5 }],
      },
      {
        date: day('2026-09-25'),
        top_products: [{ value: 'p1', count: 4 }],
        top_favorited_products: [
          { value: 'p1', count: 2 },
          { value: 'p2', count: 1 },
        ],
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/engagement-chips?store=meera-sarees' });
    const { products, window: win } = res.json().data as {
      products: Record<string, Counts>;
      window: { today: string | null; week_from: string | null; week_to: string | null };
    };

    // One day, not the week: 5, never 5+9+4.
    expect(products.p1?.viewed_today).toBe(5);
    // Summed across days, not read off the newest: 3+2 = 5 for p1, 5+1 = 6 for p2.
    expect(products.p1?.favorited_week).toBe(5);
    expect(products.p2?.favorited_week).toBe(6);
    expect(products.p2?.viewed_today).toBeUndefined();

    // Two days, not seven: 09-27 back to 09-25.
    expect(win.today).toBe('2026-09-27');
    expect(win.week_to).toBe('2026-09-27');
    expect(win.week_from).toBe('2026-09-25');

    // Newest-first and bounded to the week — the merge relies on both.
    expect(mockDailyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ retailer_id: 'r1' }),
        orderBy: { date: 'desc' },
        take: 7,
      }),
    );
    const since = (mockDailyFindMany.mock.calls[0]?.[0] as { where: { date: { gte: Date } } }).where
      .date.gte;
    expect(since?.getUTCHours()).toBe(0);
    expect(since?.getUTCMinutes()).toBe(0);

    await app.close();
  });

  it('a store with no rollup yet returns an empty map and null windows — no zeros, no throw', async () => {
    mockDailyFindMany.mockResolvedValue([]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/engagement-chips?store=brand-new' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      products: {},
      window: { today: null, week_from: null, week_to: null },
    });

    await app.close();
  });

  it('unknown or suspended store → 404, with no rollup read', async () => {
    mockRetailerFindFirst.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/engagement-chips?store=ghost' });
    expect(res.statusCode).toBe(404);
    expect(mockDailyFindMany).not.toHaveBeenCalled();
    // The liveness bar matches the storefront's own (/showcase-designs?store=).
    expect(mockRetailerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          public_slug: 'ghost',
          is_suspended: false,
          deleted_at: null,
        }),
      }),
    );

    await app.close();
  });

  it('missing store param → 422', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/engagement-chips' });
    expect(res.statusCode).toBe(422);
    expect(mockRetailerFindFirst).not.toHaveBeenCalled();

    await app.close();
  });
});
