// F-045 T7: POST /v1/public/my-style/feed
//
// The DB double really evaluates the liveness clauses of `where` against its rows, so a
// route that drops the suspended / deleted / non-AVAILABLE / no-slug filter returns the
// wrong rows here instead of passing on a mocked call shape (RC-037). Rows are cloned per
// call so the route cannot mutate the store.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';

const { mockSession, mockFindMany, mockPalette } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockFindMany: vi.fn(),
  mockPalette: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: { product: { findMany: mockFindMany }, stylePalette: { findFirst: mockPalette } },
}));
vi.mock('../passport/passport-helpers.js', () => ({ getPassportSession: mockSession }));
// The real helper presigns R2 URLs; the feed only needs its shape.
vi.mock('../public-helpers.js', () => ({
  toPublicProductSummary: async (p: {
    id: string;
    name: string | null;
    price_min: number | null;
  }) => ({
    id: p.id,
    name: p.name,
    price_min: p.price_min,
  }),
}));

const { publicMyStyleRoutes } = await import('../public-my-style.js');

interface Row {
  id: string;
  name: string;
  retailer_id: string;
  status: string;
  deleted_at: Date | null;
  price_min: number | null;
  sizes: string[];
  color_family: string | null;
  created_at: Date;
  retailer: {
    id: string;
    shop_name: string;
    public_slug: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    is_suspended: boolean;
    deleted_at: Date | null;
  };
}

const NOW = Date.now();
const store = (id: string, over: Partial<Row['retailer']> = {}): Row['retailer'] => ({
  id,
  shop_name: `Store ${id}`,
  public_slug: `store-${id}`,
  city: 'Jaipur',
  latitude: 26.9,
  longitude: 75.8,
  is_suspended: false,
  deleted_at: null,
  ...over,
});
const row = (id: string, retailer: Row['retailer'], over: Partial<Row> = {}): Row => ({
  id,
  name: `Product ${id}`,
  retailer_id: retailer.id,
  status: 'AVAILABLE',
  deleted_at: null,
  price_min: 150000,
  sizes: ['M'],
  color_family: null,
  created_at: new Date(NOW - 5 * 86_400_000),
  retailer,
  // fields the route reads off a Prisma row
  ...({
    occasions: [],
    fabrics: [],
    styles: [],
    search_tags: [],
    category: null,
    subtype: null,
    avg_rating: 0,
    rating_count: 0,
  } as object),
  ...over,
});

let DB: Row[] = [];

interface Where {
  deleted_at: null;
  status: string;
  retailer: {
    is_suspended: boolean;
    deleted_at: null;
    public_slug: { not: null };
    city?: { equals: string };
    latitude?: { gte: number; lte: number };
  };
  price_min?: { lte: number };
  OR?: { sizes: { has?: string; isEmpty?: boolean } }[];
}

// Evaluates only the clauses these tests rely on.
function fakeFindMany({ where, take }: { where: Where; take: number }) {
  const r = where.retailer;
  const out = DB.filter(
    (p) =>
      p.deleted_at === where.deleted_at &&
      p.status === where.status &&
      p.retailer.is_suspended === r.is_suspended &&
      p.retailer.deleted_at === r.deleted_at &&
      p.retailer.public_slug !== null &&
      (where.price_min === undefined ||
        (p.price_min !== null && p.price_min <= where.price_min.lte)) &&
      (r.city === undefined || p.retailer.city?.toLowerCase() === r.city.equals.toLowerCase()) &&
      (r.latitude === undefined ||
        (p.retailer.latitude !== null &&
          p.retailer.latitude >= r.latitude.gte &&
          p.retailer.latitude <= r.latitude.lte)) &&
      (where.OR === undefined ||
        where.OR.some((c) => (c.sizes.has ? p.sizes.includes(c.sizes.has) : p.sizes.length === 0))),
  );
  return Promise.resolve(structuredClone(out.slice(0, take)));
}

async function feed(body: unknown = {}, cookie = true) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(publicMyStyleRoutes, { prefix: '/v1/public/my-style' });
  await app.ready();
  const res = await app.inject({
    method: 'POST',
    url: '/v1/public/my-style/feed',
    payload: body as object,
  });
  await app.close();
  void cookie;
  return res;
}

const account = (over: Record<string, unknown> = {}) => ({
  customer_account_id: 'acct_a',
  customer_account: {
    city: null,
    budget_max: null,
    usual_size: null,
    skin_undertone: null,
    skin_depth: null,
    pref_occasions: [],
    pref_colors: [],
    pref_fabrics: [],
    ...over,
  },
});

const ids = (res: { json: () => { data: { id: string }[] } }) => res.json().data.map((d) => d.id);

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue(account());
  mockPalette.mockResolvedValue(null);
  mockFindMany.mockImplementation(fakeFindMany);
  const s = store('1');
  DB = [row('p1', s), row('p2', s)];
});

describe('auth + caching', () => {
  it('401 without a passport session, no-store, and no product query', async () => {
    mockSession.mockResolvedValue(null);
    const res = await feed();
    expect(res.statusCode).toBe(401);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('answers 200 with Cache-Control: private, no-store', async () => {
    const res = await feed();
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });
});

describe('candidate eligibility', () => {
  it('excludes suspended, deleted, non-AVAILABLE and no-slug retailers/products', async () => {
    DB = [
      row('live', store('1')),
      row('susp', store('2', { is_suspended: true })),
      row('gone', store('3', { deleted_at: new Date() })),
      row('noslug', store('4', { public_slug: null })),
      row('sold', store('5'), { status: 'SOLD' }),
      row('del', store('6'), { deleted_at: new Date() }),
    ];
    expect(ids(await feed())).toEqual(['live']);
  });
});

describe('response shape', () => {
  it('keeps price in paise, names the store, and says no AI rationale ran', async () => {
    DB = [row('p1', store('1'), { price_min: 199900 })];
    const body = (await feed()).json();
    expect(body.data[0]).toMatchObject({
      id: 'p1',
      price_min: 199900,
      retailer: { shop_name: 'Store 1', slug: 'store-1', city: 'Jaipur' },
      distance_km: null,
    });
    expect(body.data[0]).not.toHaveProperty('rationale');
    expect(body.meta).toMatchObject({ rationale_source: 'none', total: 1, truncated: false });
  });

  it('flags truncation when the candidate cap is hit', async () => {
    const s = store('1');
    DB = Array.from({ length: 300 }, (_, i) => row(`p${i}`, s));
    const res = await feed({ limit: 30 });
    expect(res.json().meta).toMatchObject({ truncated: true, total: 300 });
  });
});

describe('location scope', () => {
  it('lat/lng -> radius: drops stores outside the circle even inside the box', async () => {
    DB = [
      row('near', store('1', { latitude: 26.91, longitude: 75.8 })),
      row('far', store('2', { latitude: 27.4, longitude: 75.8 })),
    ];
    const res = await feed({ lat: 26.9, lng: 75.8, radius_km: 10 });
    expect(ids(res)).toEqual(['near']);
    expect(res.json().meta.location_scope).toBe('radius');
    expect(res.json().data[0].distance_km).toBeGreaterThan(0);
  });

  it('no coordinates but an account city -> city scope (case-insensitive)', async () => {
    mockSession.mockResolvedValue(account({ city: 'jaipur' }));
    DB = [row('jp', store('1', { city: 'Jaipur' })), row('dl', store('2', { city: 'Delhi' }))];
    const res = await feed();
    expect(ids(res)).toEqual(['jp']);
    expect(res.json().meta.location_scope).toBe('city');
  });

  it('neither -> nationwide, and says so', async () => {
    DB = [row('jp', store('1', { city: 'Jaipur' })), row('dl', store('2', { city: 'Delhi' }))];
    const res = await feed();
    expect(ids(res).sort()).toEqual(['dl', 'jp']);
    expect(res.json().meta.location_scope).toBe('nationwide');
  });
});

describe('filters', () => {
  it('budget_max is paise and falls back to the account budget', async () => {
    DB = [
      row('cheap', store('1'), { price_min: 100000 }),
      row('dear', store('1'), { price_min: 400000 }),
    ];
    expect(ids(await feed({ budget_max: 200000 }))).toEqual(['cheap']);
    mockSession.mockResolvedValue(account({ budget_max: 200000 }));
    expect(ids(await feed())).toEqual(['cheap']);
  });

  it('size keeps matching sizes AND unsized garments, drops other sizes', async () => {
    DB = [
      row('m', store('1'), { sizes: ['M', 'L'] }),
      row('xl', store('1'), { sizes: ['XL'] }),
      row('saree', store('1'), { sizes: [] }),
    ];
    expect(ids(await feed({ size: 'm' })).sort()).toEqual(['m', 'saree']);
  });
});

describe('ranking + paging', () => {
  it('a palette "good" colour outranks an "avoid" colour', async () => {
    mockSession.mockResolvedValue(account({ skin_undertone: 'warm', skin_depth: 'medium' }));
    mockPalette.mockResolvedValue({ good_families: ['maroon'], avoid_families: ['yellow'] });
    DB = [
      row('yellow', store('1'), { color_family: 'yellow' }),
      row('maroon', store('2'), { color_family: 'maroon' }),
    ];
    expect(ids(await feed())).toEqual(['maroon', 'yellow']);
    expect(mockPalette).toHaveBeenCalledWith(
      expect.objectContaining({ where: { undertone: 'warm', depth: 'medium', is_active: true } }),
    );
  });

  it('does not look up a palette when the account has no skin profile', async () => {
    await feed();
    expect(mockPalette).not.toHaveBeenCalled();
  });

  it('meta.style_profile is null with no analysis (PR-7: the palette card reads it)', async () => {
    expect((await feed()).json().meta.style_profile).toBeNull();
  });

  it('meta.style_profile returns the saved profile and its palette families', async () => {
    mockSession.mockResolvedValue(
      account({ skin_undertone: 'warm', skin_depth: 'medium', body_frame: 'tall' }),
    );
    mockPalette.mockResolvedValue({ good_families: ['maroon'], avoid_families: ['yellow'] });
    expect((await feed()).json().meta.style_profile).toEqual({
      undertone: 'warm',
      depth: 'medium',
      frame: 'tall',
      palette: { good: ['maroon'], avoid: ['yellow'] },
    });
  });

  it('meta.style_profile has palette null when no active palette row matches', async () => {
    mockSession.mockResolvedValue(account({ skin_undertone: 'cool', skin_depth: 'deep' }));
    expect((await feed()).json().meta.style_profile).toEqual({
      undertone: 'cool',
      depth: 'deep',
      frame: null,
      palette: null,
    });
  });

  it('price sort is ascending paise', async () => {
    DB = [row('b', store('1'), { price_min: 300000 }), row('a', store('2'), { price_min: 100000 })];
    expect(ids(await feed({ sort: 'price' }))).toEqual(['a', 'b']);
  });

  it('pages: page 2 with limit 1 returns the second item; total is the full count', async () => {
    DB = [row('b', store('1'), { price_min: 300000 }), row('a', store('2'), { price_min: 100000 })];
    const res = await feed({ sort: 'price', page: 2, limit: 1 });
    expect(ids(res)).toEqual(['b']);
    expect(res.json().meta).toMatchObject({ total: 2, page: 2, limit: 1 });
  });
});

describe('validation', () => {
  it.each([
    ['bad sort', { sort: 'cheapest' }],
    ['lat without lng', { lat: 12 }],
    ['out-of-range lat', { lat: 91, lng: 0 }],
    ['unknown key', { retailer_id: 'x' }],
    ['limit too big', { limit: 31 }],
    ['negative budget', { budget_max: -1 }],
    ['float budget (paise are integers)', { budget_max: 1999.5 }],
  ])('422 for %s', async (_label, payload) => {
    const res = await feed(payload);
    expect(res.statusCode).toBe(422);
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});
