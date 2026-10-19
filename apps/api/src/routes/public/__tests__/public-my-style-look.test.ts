// F-045 PR-10b: GET /v1/public/my-style/complete-look
//
// The DB double evaluates the anchor's liveness clauses and the slot's category match against
// real rows (RC-037): a route that skips the anchor filter, or forgets to exclude the anchor
// itself, fails here instead of passing on a mocked call shape.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';

const { mockSession, mockFindMany, mockFindFirst, mockPalette } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockFindMany: vi.fn(),
  mockFindFirst: vi.fn(),
  mockPalette: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    product: { findMany: mockFindMany, findFirst: mockFindFirst },
    stylePalette: { findFirst: mockPalette },
    styleTrend: { findMany: vi.fn() },
    festival: { findMany: vi.fn() },
  },
}));
vi.mock('../passport/passport-helpers.js', () => ({ getPassportSession: mockSession }));
vi.mock('../public-helpers.js', () => ({
  toPublicProductSummary: async (p: { id: string; name: string | null }) => ({
    id: p.id,
    name: p.name,
  }),
}));

const { publicMyStyleRoutes } = await import('../public-my-style.js');

interface Row {
  id: string;
  name: string;
  retailer_id: string;
  status: string;
  deleted_at: Date | null;
  category: string | null;
  subtype: string | null;
  color_family: string | null;
  price_min: number;
  created_at: Date;
  retailer: {
    id: string;
    shop_name: string;
    public_slug: string | null;
    city: string;
    latitude: number;
    longitude: number;
    is_suspended: boolean;
    deleted_at: Date | null;
  };
}

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
const row = (id: string, category: string, over: Partial<Row> = {}, s = store('1')): Row => ({
  id,
  name: `Product ${id}`,
  retailer_id: s.id,
  status: 'AVAILABLE',
  deleted_at: null,
  category,
  subtype: null,
  color_family: null,
  price_min: 150000,
  created_at: new Date(Date.now() - 5 * 86_400_000),
  retailer: s,
  ...({
    occasions: [],
    fabrics: [],
    styles: [],
    search_tags: [],
    avg_rating: 0,
    rating_count: 0,
  } as object),
  ...over,
});

let DB: Row[] = [];

interface Contains {
  category?: { contains: string };
  subtype?: { contains: string };
}
interface FindWhere {
  id?: string | { not: string };
  deleted_at: null;
  status: string;
  retailer: { is_suspended: boolean; deleted_at: null; public_slug: { not: null } };
  AND?: { id: { not: string }; OR: Contains[] }[];
}

const live = (p: Row, w: FindWhere) =>
  p.deleted_at === w.deleted_at &&
  p.status === w.status &&
  p.retailer.is_suspended === w.retailer.is_suspended &&
  p.retailer.deleted_at === w.retailer.deleted_at &&
  p.retailer.public_slug !== null;

const hasText = (v: string | null, c?: { contains: string }) =>
  c !== undefined && (v ?? '').toLowerCase().includes(c.contains.toLowerCase());

function fakeFindMany({ where }: { where: FindWhere }) {
  const extra = where.AND?.[0];
  const out = DB.filter(
    (p) =>
      live(p, where) &&
      (extra === undefined ||
        (p.id !== extra.id.not &&
          extra.OR.some((c) => hasText(p.category, c.category) || hasText(p.subtype, c.subtype)))),
  );
  return Promise.resolve(structuredClone(out));
}
const fakeFindFirst = ({ where }: { where: FindWhere & { id: string } }) =>
  Promise.resolve(structuredClone(DB.find((p) => p.id === where.id && live(p, where)) ?? null));

async function look(qs = 'anchor=a1') {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(publicMyStyleRoutes, { prefix: '/v1/public/my-style' });
  await app.ready();
  const res = await app.inject({ method: 'GET', url: `/v1/public/my-style/complete-look?${qs}` });
  await app.close();
  return res;
}

const account = {
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
  },
};
type Slots = { key: string; items: { id: string }[] }[];
const slots = (res: { json: () => { data: { slots: Slots } } }) => res.json().data.slots;

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue(account);
  mockPalette.mockResolvedValue(null);
  mockFindMany.mockImplementation(fakeFindMany);
  mockFindFirst.mockImplementation(fakeFindFirst);
  DB = [
    row('a1', 'Ladies Suit', { color_family: 'red' }),
    row('d1', 'Dupatta', { color_family: 'green' }),
    row('d2', 'Dupatta', { color_family: 'white' }),
    row('b1', 'Other', { subtype: 'Palazzo' }),
    row('s2', 'Ladies Suit'),
  ];
});

describe('auth + validation', () => {
  it('401 without a session, no-store, and no product query', async () => {
    mockSession.mockResolvedValue(null);
    const res = await look();
    expect(res.statusCode).toBe(401);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(mockFindFirst).not.toHaveBeenCalled();
  });
  it('422 without an anchor, and on lat without lng', async () => {
    expect((await look('')).statusCode).toBe(422);
    expect((await look('anchor=a1&lat=26.9')).statusCode).toBe(422);
  });
});

describe('anchor must be live', () => {
  it.each([
    ['missing', 'anchor=nope'],
    ['sold', 'anchor=sold'],
    ['deleted', 'anchor=gone'],
    ['suspended store', 'anchor=susp'],
    ['store without a slug', 'anchor=noslug'],
  ])('%s -> 404 ANCHOR_UNAVAILABLE', async (_n, qs) => {
    DB.push(
      row('sold', 'Ladies Suit', { status: 'SOLD' }),
      row('gone', 'Ladies Suit', { deleted_at: new Date() }),
      row('susp', 'Ladies Suit', {}, store('2', { is_suspended: true })),
      row('noslug', 'Ladies Suit', {}, store('3', { public_slug: null })),
    );
    const res = await look(qs);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('ANCHOR_UNAVAILABLE');
  });
});

describe('complements', () => {
  it('a suit gets dupattas and bottoms, never itself or another suit', async () => {
    const res = await look();
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    const out = slots(res);
    expect(out.map((s) => s.key)).toEqual(['dupatta', 'bottom']);
    expect(out[0]?.items.map((i) => i.id).sort()).toEqual(['d1', 'd2']);
    expect(out[1]?.items.map((i) => i.id)).toEqual(['b1']);
    expect(res.json().meta.reason).toBeNull();
  });

  it('a slot with nothing nearby is dropped, not filled', async () => {
    DB = DB.filter((p) => p.category !== 'Dupatta');
    expect(slots(await look()).map((s) => s.key)).toEqual(['bottom']);
  });

  it('an anchor with no mapped complement answers none_nearby', async () => {
    DB.push(row('g1', 'Gown'));
    const res = await look('anchor=g1');
    expect(res.statusCode).toBe(200);
    expect(slots(res)).toEqual([]);
    expect(res.json().meta.reason).toBe('none_nearby');
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('a mapped anchor with no candidates at all answers none_nearby', async () => {
    DB = [row('a1', 'Ladies Suit')];
    const res = await look();
    expect(slots(res)).toEqual([]);
    expect(res.json().meta.reason).toBe('none_nearby');
  });

  it('colour fit: a pairing colour outranks a clashing one, all else equal', async () => {
    DB = [
      row('a1', 'Ladies Suit', { color_family: 'red' }),
      row('clash', 'Dupatta', { color_family: 'pink' }),
      row('pair', 'Dupatta', { color_family: 'green' }),
    ];
    const items = slots(await look()).find((s) => s.key === 'dupatta')?.items ?? [];
    expect(items.map((i) => i.id)).toEqual(['pair', 'clash']);
  });

  it('caps each slot at 6 and keeps max 3 per store in the head', async () => {
    const s1 = store('1');
    const s2 = store('2');
    DB = [
      row('a1', 'Ladies Suit'),
      ...Array.from({ length: 8 }, (_, i) => row(`x${i}`, 'Dupatta', {}, s1)),
      ...Array.from({ length: 3 }, (_, i) => row(`y${i}`, 'Dupatta', {}, s2)),
    ];
    const items = slots(await look()).find((s) => s.key === 'dupatta')?.items ?? [];
    expect(items).toHaveLength(6);
    expect(items.filter((i) => i.id.startsWith('x')).length).toBeLessThanOrEqual(3);
  });
});
