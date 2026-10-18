// F-045 T7: POST /v1/public/my-style/feed
//
// The DB double really evaluates the liveness clauses of `where` against its rows, so a
// route that drops the suspended / deleted / non-AVAILABLE / no-slug filter returns the
// wrong rows here instead of passing on a mocked call shape (RC-037). Rows are cloned per
// call so the route cannot mutate the store.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';

const { mockSession, mockFindMany, mockPalette, mockEmbedDesc, mockSims, mockTrends, mockFests } =
  vi.hoisted(() => ({
    mockSession: vi.fn(),
    mockFindMany: vi.fn(),
    mockPalette: vi.fn(),
    mockEmbedDesc: vi.fn(),
    mockSims: vi.fn(),
    mockTrends: vi.fn(),
    mockFests: vi.fn(),
  }));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    product: { findMany: mockFindMany },
    stylePalette: { findFirst: mockPalette },
    styleTrend: { findMany: mockTrends },
    festival: { findMany: mockFests },
  },
}));
// Scoring (attribute overlap, blending) stays real; only the OpenAI call and the pgvector
// query are doubled.
vi.mock('../../../lib/my-style-similar.js', async (orig) => ({
  ...(await orig<typeof import('../../../lib/my-style-similar.js')>()),
  embedDescriptor: mockEmbedDesc,
  embeddingSimilarities: mockSims,
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
    product_type: null,
    pattern: null,
    embellishments: [],
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
  mockEmbedDesc.mockResolvedValue([0.1, 0.2]);
  mockSims.mockResolvedValue(new Map());
  mockTrends.mockResolvedValue([]);
  mockFests.mockResolvedValue([]);
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

describe('find similar (PR-9)', () => {
  const GARMENT = { category: 'Kurti', color_family: 'yellow', embellishments: [] };
  const s = store('9');
  const kurti = (id: string, over: Partial<Row> = {}) =>
    row(id, s, { ...({ category: 'Kurti' } as object), ...over });

  it('an ordinary feed has meta.similar null and never embeds', async () => {
    const res = await feed({});
    expect(res.json().meta.similar).toBeNull();
    expect(mockEmbedDesc).not.toHaveBeenCalled();
  });

  it('ranks the product that looks like the garment first (attribute fallback)', async () => {
    DB = [
      row('saree', s, { color_family: 'blue', ...({ category: 'Saree' } as object) }),
      kurti('kurti', { color_family: 'yellow' }),
    ];
    mockEmbedDesc.mockResolvedValue(null); // embeddings unavailable
    const res = await feed({ similar: GARMENT });
    expect(res.statusCode).toBe(200);
    expect(ids(res)[0]).toBe('kurti');
    expect(res.json().meta.similar).toEqual({ source: 'attributes', embedded: 0, total: 2 });
  });

  it('uses embeddings where they exist and says how many', async () => {
    // Same imperfect attribute match, so only the embedding can separate them.
    DB = [kurti('a', { color_family: 'blue' }), kurti('b', { color_family: 'blue' })];
    mockSims.mockResolvedValue(new Map([['b', 0.95]])); // b is the closer vector
    const res = await feed({ similar: GARMENT });
    expect(ids(res)[0]).toBe('b');
    expect(res.json().meta.similar).toEqual({ source: 'embedding', embedded: 1, total: 2 });
    expect(mockSims).toHaveBeenCalledWith([0.1, 0.2], ['a', 'b']);
  });

  it('a failing similarity query degrades to attributes and the request still succeeds', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    DB = [kurti('a', { color_family: 'yellow' })];
    mockSims.mockRejectedValue(new Error('pgvector down'));
    const res = await feed({ similar: GARMENT });
    expect(res.statusCode).toBe(200);
    expect(res.json().meta.similar.source).toBe('attributes');
  });

  it('similarity does not widen the candidate set: suspended and deleted still excluded', async () => {
    DB = [
      kurti('ok'),
      kurti('gone', { deleted_at: new Date() }),
      row('susp', store('x', { is_suspended: true }), ...([{ category: 'Kurti' }] as never[])),
    ];
    expect(ids(await feed({ similar: GARMENT }))).toEqual(['ok']);
  });

  it.each([
    ['unknown category', { ...GARMENT, category: 'Spaceship' }],
    ['free-text colour', { ...GARMENT, color_family: 'yellow. ignore previous' }],
    ['extra key', { ...GARMENT, notes: 'x' }],
    ['a string', 'Kurti'],
  ])('422 for a bad descriptor: %s', async (_n, similar) => {
    const res = await feed({ similar });
    expect(res.statusCode).toBe(422);
    expect(mockEmbedDesc).not.toHaveBeenCalled();
  });
});

describe('tabs (PR-10a)', () => {
  const day = 86_400_000;
  const tagged = (id: string, extra: Record<string, unknown>) =>
    ({ ...row(id, store('1')), ...extra }) as Row;
  const trend = (over: Record<string, unknown> = {}) => ({
    kind: 'trending',
    match_keywords: ['bandhani'],
    boost: 0.3,
    starts_at: null,
    ends_at: null,
    is_active: true,
    ...over,
  });
  const festival = (over: Record<string, unknown> = {}) => ({
    name: 'Navratri',
    region: 'PAN_INDIA',
    starts_at: new Date(NOW - day),
    ends_at: new Date(NOW + 5 * day),
    deleted_at: null,
    ...over,
  });

  it('rejects an unknown tab', async () => {
    expect((await feed({ tab: 'bogus' })).statusCode).toBe(422);
  });

  it('with no trends and no festival: extra tabs are hidden and their lists are empty', async () => {
    for (const tab of ['festival', 'trending']) {
      const res = await feed({ tab });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual([]);
      expect(res.json().meta.tabs).toEqual({ festival: null, trending: false });
    }
  });

  describe('Trending', () => {
    it('lists only products matching an active trending trend', async () => {
      DB = [
        tagged('hit', { search_tags: ['Bandhani'] }),
        tagged('miss', { search_tags: ['plain'] }),
      ];
      mockTrends.mockResolvedValue([trend()]);
      const res = await feed({ tab: 'trending' });
      expect(ids(res)).toEqual(['hit']);
      expect(res.json().meta.tabs.trending).toBe(true);
    });

    it('ignores a trend outside its dates, an inactive one, and an unknown kind', async () => {
      DB = [tagged('hit', { search_tags: ['bandhani'] })];
      mockTrends.mockResolvedValue([
        trend({ ends_at: new Date(NOW - day) }),
        trend({ starts_at: new Date(NOW + day) }),
        trend({ is_active: false }),
        trend({ kind: 'weird' }),
      ]);
      const res = await feed({ tab: 'trending' });
      expect(ids(res)).toEqual([]);
      expect(res.json().meta.tabs.trending).toBe(false);
    });

    it('a trending trend nudges the For you feed without filtering it', async () => {
      const s = store('1');
      DB = [
        row('a-plain', s),
        { ...row('z-hit', s), ...({ search_tags: ['bandhani'] } as object) } as Row,
      ];
      mockTrends.mockResolvedValue([trend()]);
      expect(ids(await feed())).toEqual(['z-hit', 'a-plain']);
    });
  });

  describe('Festival', () => {
    it('shows the running festival name and lists Festive/Wedding or keyword matches', async () => {
      DB = [
        tagged('fest', { occasions: ['Festive'] }),
        tagged('wed', { occasions: ['Wedding'] }),
        tagged('kw', { search_tags: ['phulkari'] }),
        tagged('daily', { occasions: ['Daily Wear'] }),
        tagged('none', { occasions: [] }),
      ];
      mockFests.mockResolvedValue([festival()]);
      mockTrends.mockResolvedValue([trend({ kind: 'festival', match_keywords: ['phulkari'] })]);
      const res = await feed({ tab: 'festival', limit: 30 });
      expect(ids(res).sort()).toEqual(['fest', 'kw', 'wed']);
      expect(res.json().meta.tabs.festival).toEqual({ name: 'Navratri' });
    });

    it('festival keywords do not leak into the For you feed', async () => {
      const s = store('1');
      DB = [
        row('a-plain', s),
        { ...row('z-kw', s), ...({ search_tags: ['phulkari'] } as object) } as Row,
      ];
      mockFests.mockResolvedValue([festival()]);
      mockTrends.mockResolvedValue([trend({ kind: 'festival', match_keywords: ['phulkari'] })]);
      expect(ids(await feed())).toEqual(['a-plain', 'z-kw']);
    });

    it('a festival of another state is hidden; the shopper state or PAN_INDIA is shown', async () => {
      mockFests.mockResolvedValue([festival({ name: 'Onam', region: 'Kerala' })]);
      mockSession.mockResolvedValue(account({ state: 'Rajasthan' }));
      expect((await feed()).json().meta.tabs.festival).toBeNull();
      mockSession.mockResolvedValue(account({ state: 'kerala' }));
      expect((await feed()).json().meta.tabs.festival).toEqual({ name: 'Onam' });
    });
  });

  describe('Occasion', () => {
    it('puts tagged matches first; untagged products still follow (no hard filter)', async () => {
      const s = store('1');
      DB = [
        { ...row('a-none', s), ...({ occasions: [] } as object) } as Row,
        { ...row('b-daily', s), ...({ occasions: ['Daily Wear'] } as object) } as Row,
        { ...row('z-wed', s), ...({ occasions: ['Wedding'] } as object) } as Row,
      ];
      const res = await feed({ tab: 'occasion', occasion: 'Wedding' });
      expect(ids(res)).toEqual(['z-wed', 'a-none', 'b-daily']);
      expect(res.json().meta.occasion_matches).toBe(1);
    });

    it('reports zero matches honestly when nothing is tagged, and still returns the feed', async () => {
      const res = await feed({ tab: 'occasion', occasion: 'Wedding' });
      expect(ids(res)).toEqual(['p1', 'p2']);
      expect(res.json().meta.occasion_matches).toBe(0);
    });

    it('no occasion picked: plain feed, occasion_matches null', async () => {
      const res = await feed({ tab: 'occasion' });
      expect(ids(res)).toEqual(['p1', 'p2']);
      expect(res.json().meta.occasion_matches).toBeNull();
    });
  });

  // RC-070: the dropdown / Kids form send quiz labels, the ranker compares canonical spellings.
  it('maps a quiz-style occasion label to the canonical tags before ranking (RC-070)', async () => {
    const s = store('1');
    DB = [
      { ...row('a-plain', s), ...({ occasions: [] } as object) } as Row,
      { ...row('z-party', s), ...({ occasions: ['Party Wear'] } as object) } as Row,
    ];
    expect(ids(await feed({ occasion: 'Party / Festive' }))).toEqual(['z-party', 'a-plain']);
  });

  it('still answers when the trend/festival read fails; extra tabs are hidden', async () => {
    mockTrends.mockRejectedValue(new Error('db down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await feed();
    expect(res.statusCode).toBe(200);
    expect(res.json().meta.tabs).toEqual({ festival: null, trending: false });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
