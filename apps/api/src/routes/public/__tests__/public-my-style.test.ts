// F-045 T7: POST /v1/public/my-style/feed
//
// The DB double really evaluates the liveness clauses of `where` against its rows, so a
// route that drops the suspended / deleted / non-AVAILABLE / no-slug filter returns the
// wrong rows here instead of passing on a mocked call shape (RC-037). Rows are cloned per
// call so the route cannot mutate the store.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';
import { type Cond, matchesAnd } from './where-eval.js';

const {
  mockSession,
  mockFindMany,
  mockPalette,
  mockEmbedDesc,
  mockSims,
  mockTrends,
  mockFests,
  mockAccountUpdate,
} = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockFindMany: vi.fn(),
  mockPalette: vi.fn(),
  mockEmbedDesc: vi.fn(),
  mockSims: vi.fn(),
  mockTrends: vi.fn(),
  mockFests: vi.fn(),
  mockAccountUpdate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    product: { findMany: mockFindMany },
    customerAccount: { updateMany: mockAccountUpdate },
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
    audience: null,
    kids_age_group: null,
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

// Evaluates only the clauses these tests rely on (the audience clause via the shared helper).
function fakeFindMany({ where, take }: { where: Where & { AND?: Cond[] }; take: number }) {
  const r = where.retailer;
  const out = DB.filter(
    (p) =>
      matchesAnd(p, where.AND) &&
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

describe("kids' wear (adult feed vs For my child)", () => {
  const s = store('1');
  const mixed = () => [
    row('suit', s, { category: 'Ladies Suit', subtype: 'Anarkali' } as Partial<Row>),
    row('nulls', s), // category and subtype both NULL: still an adult candidate
    row('kids', s, { category: 'Kids Ethnic Wear', subtype: 'Kurta Set' } as Partial<Row>),
    row('newborn', s, { category: 'New Born', subtype: null } as Partial<Row>),
    row('girls', s, { category: 'Ladies', subtype: 'Girls Frock' } as Partial<Row>),
  ];

  it('the default adult feed leaves kids wear out and keeps untagged products', async () => {
    DB = mixed();
    expect(ids(await feed()).sort()).toEqual(['nulls', 'suit']);
  });

  it('kids: true returns only kids wear', async () => {
    DB = mixed();
    expect(ids(await feed({ kids: true })).sort()).toEqual(['girls', 'kids', 'newborn']);
  });

  it('rejects a non-boolean kids flag', async () => {
    expect((await feed({ kids: 'yes' })).statusCode).toBe(422);
  });
});

describe('stored audience (set by the retailer) beats the category keywords', () => {
  const s = store('1');
  const aud = (id: string, audience: string | null, category: string | null, age?: string) =>
    row(id, s, { audience, category, kids_age_group: age ?? null } as unknown as Partial<Row>);
  const mixed = () => [
    aud('womanKidsText', 'WOMEN', 'Kids Ethnic Wear'), // adult piece the retailer typed oddly
    aud('boyLadiesText', 'BOYS', 'Ladies'), // kids piece tagged "Ladies": the old leak
    aud('girl', 'GIRLS', 'Frock'),
    aud('uni', 'KIDS_UNISEX', null),
    aud('nullSaree', null, 'Saree'),
    aud('nullKids', null, 'Kids'),
  ];

  it('adult feed: stored adults + unclassified adults only, kids tagged Ladies stay out', async () => {
    DB = mixed();
    expect(ids(await feed()).sort()).toEqual(['nullSaree', 'womanKidsText']);
  });

  it('kids feed: stored kids + unclassified kids-keyword rows', async () => {
    DB = mixed();
    expect(ids(await feed({ kids: true })).sort()).toEqual([
      'boyLadiesText',
      'girl',
      'nullKids',
      'uni',
    ]);
  });

  it('Girl hides BOYS, keeps GIRLS and unisex', async () => {
    DB = mixed();
    expect(ids(await feed({ kids: true, kids_who: 'Girl' })).sort()).toEqual([
      'girl',
      'nullKids',
      'uni',
    ]);
  });

  it('Boy hides GIRLS, keeps BOYS and unisex', async () => {
    DB = mixed();
    expect(ids(await feed({ kids: true, kids_who: 'Boy' })).sort()).toEqual([
      'boyLadiesText',
      'nullKids',
      'uni',
    ]);
  });

  it('kids_who without kids is ignored (adult feed unchanged)', async () => {
    DB = mixed();
    expect(ids(await feed({ kids_who: 'Girl' })).sort()).toEqual(['nullSaree', 'womanKidsText']);
  });

  it('age is a boost: the exact band comes first and nobody is dropped', async () => {
    DB = [
      aud('far', 'GIRLS', null, 'AGE_13_16'),
      aud('exact', 'GIRLS', null, 'AGE_3_5'),
      aud('unknown', 'GIRLS', null),
    ];
    const res = await feed({ kids: true, kids_age: 'AGE_3_5' });
    expect(ids(res)[0]).toBe('exact');
    expect(ids(res)).toHaveLength(3);
  });

  it.each([{ kids_who: 'Other' }, { kids_age: '3-5' }, { kids_who: 1 }])(
    'rejects an invalid kids pick %j with 422',
    async (body) => {
      expect((await feed({ kids: true, ...body })).statusCode).toBe(422);
    },
  );
});

describe('meta.taste (what the quick quiz saved)', () => {
  it('is null before the quiz', async () => {
    expect((await feed()).json().meta.taste).toBeNull();
  });

  it('returns the saved colours, occasions, fabrics and budget', async () => {
    mockSession.mockResolvedValue(
      account({
        pref_colors: ['red'],
        pref_occasions: ['party wear'],
        pref_fabrics: ['cotton'],
        budget_max: 150000,
      }),
    );
    expect((await feed()).json().meta.taste).toEqual({
      colors: ['red'],
      occasions: ['party wear'],
      fabrics: ['cotton'],
      budget_max: 150000,
    });
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
    expect(body.meta).toMatchObject({ rationale_source: 'rules', total: 1, truncated: false });
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
      saved_at: null,
      source: 'photo',
      palette: { good: ['maroon'], avoid: ['yellow'] },
    });
  });

  it('meta.style_profile carries the save time so the card can say how old it is', async () => {
    mockSession.mockResolvedValue(
      account({
        skin_undertone: 'warm',
        skin_depth: 'medium',
        style_profile_at: new Date('2026-11-12T10:00:00Z'),
      }),
    );
    expect((await feed()).json().meta.style_profile.saved_at).toBe('2026-11-12T10:00:00.000Z');
  });

  describe('suggested size (spec step 4)', () => {
    const chart = {
      S: { bust: [80, 84] },
      M: { bust: [85, 89] },
      L: { bust: [90, 94] },
    };
    const withChart = (id: string, over: Record<string, unknown> = {}) =>
      row(id, store('1'), {
        sizes: ['S', 'M', 'L'],
        ...({ size_chart: chart, ...over } as object),
      });
    const sizeOf = async (id = 'a') =>
      (await feed()).json().data.find((d: { id: string }) => d.id === id)?.suggested_size;

    it('labels a card from the shopper own measurements and the product chart', async () => {
      DB = [withChart('a')];
      mockSession.mockResolvedValue(account({ bust_cm: 87 }));
      expect(await sizeOf()).toEqual({ size: 'M' });
    });

    it('says "between" when the dimensions disagree', async () => {
      DB = [
        withChart('a', {
          size_chart: {
            S: { bust: [80, 84], hip: [86, 90] },
            M: { bust: [85, 89], hip: [91, 95] },
            L: { bust: [90, 94], hip: [96, 100] },
          },
        }),
      ];
      mockSession.mockResolvedValue(account({ bust_cm: 87, hip_cm: 98 }));
      expect(await sizeOf()).toEqual({ size: 'L', between: ['M', 'L'] });
    });

    it('is null without measurements', async () => {
      DB = [withChart('a')];
      expect(await sizeOf()).toBeNull();
    });

    it('is null for a product with no chart, and for an invalid stored chart', async () => {
      DB = [
        withChart('a', { size_chart: null }),
        withChart('b', { size_chart: { M: { bust: [1, 2] } } }),
      ];
      mockSession.mockResolvedValue(account({ bust_cm: 87 }));
      expect(await sizeOf('a')).toBeNull();
      expect(await sizeOf('b')).toBeNull();
    });

    it('never reorders or removes anything: the same ids with and without measurements', async () => {
      DB = [withChart('a'), withChart('b', { size_chart: null })];
      const without = ids(await feed());
      mockSession.mockResolvedValue(account({ bust_cm: 87 }));
      expect(ids(await feed())).toEqual(without);
    });
  });

  it('meta.style_profile has palette null when no active palette row matches', async () => {
    mockSession.mockResolvedValue(account({ skin_undertone: 'cool', skin_depth: 'deep' }));
    expect((await feed()).json().meta.style_profile).toEqual({
      undertone: 'cool',
      depth: 'deep',
      frame: null,
      saved_at: null,
      source: 'photo',
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
    // Strict category gate: the saree is not shown at all, not merely ranked lower.
    expect(ids(res)).toEqual(['kurti']);
    expect(res.json().meta.similar).toEqual({
      source: 'attributes',
      embedded: 0,
      total: 2,
      matched: 1,
    });
  });

  it('category gate is strict even when the colour matches exactly', async () => {
    DB = [row('saree', s, { color_family: 'yellow', ...({ category: 'Saree' } as object) })];
    mockEmbedDesc.mockResolvedValue(null);
    const res = await feed({ similar: GARMENT });
    expect(ids(res)).toEqual([]);
    expect(res.json().meta.total).toBe(0);
    expect(res.json().meta.similar.matched).toBe(0);
  });

  it('a product with no category never matches', async () => {
    DB = [row('nocat', s, { color_family: 'yellow' })];
    mockEmbedDesc.mockResolvedValue(null);
    expect(ids(await feed({ similar: GARMENT }))).toEqual([]);
  });

  it('same category but a different colour is below the minimum and hidden', async () => {
    DB = [kurti('blue', { color_family: 'blue' }), kurti('yellow', { color_family: 'yellow' })];
    mockEmbedDesc.mockResolvedValue(null);
    expect(ids(await feed({ similar: GARMENT }))).toEqual(['yellow']);
  });

  it('closest to the photo comes first on the default sort', async () => {
    const withWork = { color_family: 'yellow', ...({ embellishments: ['Zari Work'] } as object) };
    DB = [kurti('plain', { color_family: 'yellow' }), kurti('zari', withWork)];
    mockEmbedDesc.mockResolvedValue(null);
    const res = await feed({
      similar: { ...GARMENT, embellishments: ['Zari Work'] },
    });
    expect(ids(res)).toEqual(['zari', 'plain']);
  });

  it('uses embeddings where they exist and says how many', async () => {
    // Same imperfect attribute match, so only the embedding can separate them.
    DB = [kurti('a', { color_family: 'blue' }), kurti('b', { color_family: 'blue' })];
    mockSims.mockResolvedValue(new Map([['b', 0.95]])); // b is the closer vector
    const res = await feed({ similar: GARMENT });
    // Only b clears the minimum: a has no vector and a blue-vs-yellow attribute score alone.
    expect(ids(res)).toEqual(['b']);
    expect(res.json().meta.similar).toEqual({
      source: 'embedding',
      embedded: 1,
      total: 2,
      matched: 1,
    });
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
      kurti('ok', { color_family: 'yellow' }),
      kurti('gone', { color_family: 'yellow', deleted_at: new Date() }),
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

// Phase 1 (customer-profile-research §9, R3): the profile has its own read, so the palette card
// no longer depends on the feed succeeding.
async function profile() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(publicMyStyleRoutes, { prefix: '/v1/public/my-style' });
  await app.ready();
  const res = await app.inject({ method: 'GET', url: '/v1/public/my-style/profile' });
  await app.close();
  return res;
}

describe('GET /my-style/profile', () => {
  it('401 with the feed 401 shape, no-store, and no DB read', async () => {
    mockSession.mockResolvedValue(null);
    const res = await profile();
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Passport session required' },
    });
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(mockPalette).not.toHaveBeenCalled();
  });

  it('returns profile + palette + measurements + taste, private no-store, no product query', async () => {
    const at = new Date('2026-11-26T09:34:00Z');
    mockSession.mockResolvedValue(
      account({
        skin_undertone: 'warm',
        skin_depth: 'medium',
        body_frame: 'average',
        style_profile_at: at,
        height_cm: 160,
        measurements_at: at,
        pref_occasions: ['festive'],
      }),
    );
    mockPalette.mockResolvedValue({ good_families: ['yellow'], avoid_families: ['grey'] });
    const res = await profile();
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.json().data).toEqual({
      style_profile: {
        undertone: 'warm',
        depth: 'medium',
        frame: 'average',
        saved_at: at.toISOString(),
        // Saved before migration 171 (NULL) reads as the photo read.
        source: 'photo',
        palette: { good: ['yellow'], avoid: ['grey'] },
      },
      measurements: {
        height_cm: 160,
        bust_cm: null,
        waist_cm: null,
        hip_cm: null,
        saved_at: at.toISOString(),
      },
      taste: { colors: [], occasions: ['festive'], fabrics: [], budget_max: null },
    });
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('answers nulls for a shopper with nothing saved, without a palette lookup', async () => {
    const res = await profile();
    expect(res.json().data).toEqual({ style_profile: null, measurements: null, taste: null });
    expect(mockPalette).not.toHaveBeenCalled();
  });
});

// "Shop my colours": the feed keeps only the palette's good families. A boost would change
// little (the palette already weighs 0.40 of fit), so the button would look like it did nothing.
describe('palette_only (Shop my colours)', () => {
  const warm = () => {
    mockSession.mockResolvedValue(account({ skin_undertone: 'warm', skin_depth: 'medium' }));
    mockPalette.mockResolvedValue({ good_families: ['maroon'], avoid_families: ['yellow'] });
    DB = [
      row('maroon', store('1'), { color_family: 'maroon' }),
      row('yellow', store('1'), { color_family: 'yellow' }),
      row('untagged', store('1')),
    ];
  };

  it('keeps only products in a good family and says the filter applied', async () => {
    warm();
    const res = await feed({ palette_only: true });
    expect(ids(res)).toEqual(['maroon']);
    expect(res.json().meta.palette_only).toBe(true);
  });

  it('off by default: every candidate stays', async () => {
    warm();
    const res = await feed();
    expect(ids(res).sort()).toEqual(['maroon', 'untagged', 'yellow']);
    expect(res.json().meta.palette_only).toBe(false);
  });

  it('with no saved palette it filters nothing and reports palette_only false', async () => {
    const res = await feed({ palette_only: true });
    expect(ids(res).sort()).toEqual(['p1', 'p2']);
    expect(res.json().meta.palette_only).toBe(false);
  });
});

// D4 drape test (customer-profile-research §7.2 step 6): the shopper's answer wins.
describe('POST /my-style/profile/confirm', () => {
  async function confirm(payload: unknown) {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    await app.register(publicMyStyleRoutes, { prefix: '/v1/public/my-style' });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/my-style/profile/confirm',
      payload: payload as object,
    });
    await app.close();
    return res;
  }
  const saved = { skin_undertone: 'cool', skin_depth: 'medium', body_frame: 'average' };

  beforeEach(() => {
    mockSession.mockResolvedValue(account(saved));
    mockAccountUpdate.mockResolvedValue({ count: 1 });
    mockPalette.mockResolvedValue({ good_families: ['gold'], avoid_families: ['silver'] });
  });

  it('401 without a session, nothing written', async () => {
    mockSession.mockResolvedValue(null);
    expect((await confirm({ picks: ['warm', 'warm', 'warm'] })).statusCode).toBe(401);
    expect(mockAccountUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['two picks', { picks: ['warm', 'warm'] }],
    ['an unknown pick', { picks: ['warm', 'warm', 'fair'] }],
    ['an extra field', { picks: ['warm', 'warm', 'warm'], depth: 'deep' }],
  ])('422 on %s', async (_n, body) => {
    expect((await confirm(body)).statusCode).toBe(422);
    expect(mockAccountUpdate).not.toHaveBeenCalled();
  });

  it('3 of 3 on one side sets that undertone, source confirmed, and answers the new palette', async () => {
    const res = await confirm({ picks: ['warm', 'warm', 'warm'] });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    const arg = mockAccountUpdate.mock.calls[0]?.[0];
    // Only a row that still holds a profile: a "Clear my data" racing this must win.
    expect(arg.where).toEqual({ id: 'acct_a', skin_depth: { not: null } });
    expect(arg.data).toMatchObject({ skin_undertone: 'warm', profile_source: 'confirmed' });
    expect(arg.data.style_profile_at).toBeInstanceOf(Date);
    expect(mockPalette.mock.calls.at(-1)?.[0].where).toMatchObject({
      undertone: 'warm',
      depth: 'medium',
    });
    expect(res.json().data.style_profile).toMatchObject({
      undertone: 'warm',
      depth: 'medium',
      source: 'confirmed',
      palette: { good: ['gold'], avoid: ['silver'] },
    });
  });

  it('a 2-1 split reads as neither side, so neutral', async () => {
    await confirm({ picks: ['warm', 'cool', 'warm'] });
    expect(mockAccountUpdate.mock.calls[0]?.[0].data.skin_undertone).toBe('neutral');
  });

  it('409 NO_PROFILE when nothing is saved, or it was cleared meanwhile', async () => {
    mockSession.mockResolvedValue(account());
    let res = await confirm({ picks: ['cool', 'cool', 'cool'] });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('NO_PROFILE');
    expect(mockAccountUpdate).not.toHaveBeenCalled();

    mockSession.mockResolvedValue(account(saved));
    mockAccountUpdate.mockResolvedValue({ count: 0 });
    res = await confirm({ picks: ['cool', 'cool', 'cool'] });
    expect(res.statusCode).toBe(409);
  });
});

describe('Phase 3: gender default (D6)', () => {
  beforeEach(() => {
    const s = store('1');
    DB = [
      row('w1', s, { audience: 'WOMEN' } as Partial<Row>),
      row('m1', s, { audience: 'MEN' } as Partial<Row>),
      row('n1', s),
    ];
  });
  it('a FEMALE account sees women + unclassified wear, and meta says it filtered', async () => {
    mockSession.mockResolvedValue(account({ gender: 'FEMALE' }));
    const res = await feed();
    expect(ids(res).sort()).toEqual(['n1', 'w1']);
    expect(res.json().meta.gender_filter).toBe('FEMALE');
  });
  it('all_wear shows everything and meta says no filter', async () => {
    mockSession.mockResolvedValue(account({ gender: 'FEMALE' }));
    const res = await feed({ all_wear: true });
    expect(ids(res).sort()).toEqual(['m1', 'n1', 'w1']);
    expect(res.json().meta.gender_filter).toBeNull();
  });
  it('no saved gender shows both', async () => {
    const res = await feed();
    expect(ids(res).sort()).toEqual(['m1', 'n1', 'w1']);
    expect(res.json().meta.gender_filter).toBeNull();
  });
  it('a gender with only unclassified products still answers (NULL audience stays)', async () => {
    DB = [row('n1', store('1')), row('n2', store('1'))];
    mockSession.mockResolvedValue(account({ gender: 'MALE' }));
    expect(ids(await feed()).sort()).toEqual(['n1', 'n2']);
  });
});

describe('Phase 3: reason chips', () => {
  const reasonsOf = async (body: object, over: Record<string, unknown> = {}) => {
    mockSession.mockResolvedValue(account(over));
    const res = await feed(body);
    return {
      res,
      byId: new Map(
        res.json().data.map((d: { id: string; reasons: unknown }) => [d.id, d.reasons]),
      ),
    };
  };
  it('rationale_source is rules', async () => {
    const { res } = await reasonsOf({});
    expect(res.json().meta.rationale_source).toBe('rules');
  });
  it('ranker reasons first, capped at two', async () => {
    DB = [
      row('p1', store('1'), {
        color_family: 'red',
        ...({ occasions: ['festive'], fabrics: ['silk'] } as object),
      }),
    ];
    const { byId } = await reasonsOf(
      { size: 'M', lat: 26.9, lng: 75.8 },
      { pref_occasions: ['festive'], pref_colors: ['red'], pref_fabrics: ['silk'] },
    );
    expect(byId.get('p1')).toEqual([{ code: 'occasion', detail: 'festive' }, { code: 'color' }]);
  });
  it('size then near fill in when the ranker has nothing', async () => {
    DB = [row('p1', store('1')), row('u1', store('1'), { sizes: [] })];
    const { byId } = await reasonsOf({ size: 'M', lat: 26.9, lng: 75.8 });
    expect(byId.get('p1')).toEqual([
      { code: 'size', detail: 'M' },
      { code: 'near', detail: '0' },
    ]);
    expect(byId.get('u1')).toEqual([{ code: 'near', detail: '0' }]);
  });
  it('no size chip from the usual size alone, no near chip without a position', async () => {
    const { byId } = await reasonsOf({}, { usual_size: 'M' });
    expect(byId.get('p1')).toEqual([]);
  });
  it('pref_styles feed the style reason', async () => {
    DB = [row('p1', store('1'), { ...({ subtype: 'Anarkali Suit' } as object) })];
    const { byId } = await reasonsOf({}, { pref_styles: ['Anarkali'] });
    expect(byId.get('p1')).toEqual([{ code: 'style', detail: 'Anarkali' }]);
  });
});
