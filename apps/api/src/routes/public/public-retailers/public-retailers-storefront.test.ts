/**
 * GET /public/retailers/:slug carries the shop's Google rating only when it can be shown
 * honestly (place id set, key configured, Google answered). Otherwise the field is null, the
 * page renders as before, and a Google failure never breaks the store profile.
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';

const m = vi.hoisted(() => ({
  retailerFind: vi.fn(),
  retailerFindMany: vi.fn(),
  collectionFind: vi.fn(),
  rating: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findFirst: m.retailerFind, findMany: m.retailerFindMany },
    collection: { findFirst: m.collectionFind },
  },
}));
vi.mock('../../../lib/public-cache.js', () => ({
  withPublicCache: async (_url: string, compute: () => Promise<unknown>) => compute(),
}));
vi.mock('../../../lib/google-places.js', () => ({ getPlaceRating: m.rating }));

import { publicRetailersStorefrontRoutes } from './public-retailers-storefront.js';

async function get() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(publicRetailersStorefrontRoutes, { prefix: '/v1/public' });
  await app.ready();
  return app.inject({ method: 'GET', url: '/v1/public/retailers/asha' });
}

const PLACE = {
  rating: 4.6,
  count: 123,
  name: 'Asha Boutique',
  address: 'Model Town, Ludhiana, Punjab, India',
};

const RETAILER = {
  id: 'ret1',
  shop_name: 'Asha Boutique',
  city: 'Ludhiana',
  state: 'Punjab',
  address_line1: null,
  address_line2: null,
  categories: [],
  logo_url: null,
  banner_url: null,
  storefront_collection_id: null,
  is_suspended: false,
  google_place_id: 'ChIJabc123',
};

beforeEach(() => {
  vi.clearAllMocks();
  m.retailerFind.mockResolvedValue(RETAILER);
  m.collectionFind.mockResolvedValue(null);
  m.retailerFindMany.mockResolvedValue([]);
  m.rating.mockResolvedValue(PLACE);
});

describe('google_rating on the public store profile', () => {
  it('place id + rating → rating, count and a link built from the place id', async () => {
    const res = await get();
    expect(res.statusCode).toBe(200);
    const g = res.json().data.google_rating;
    expect(g).toMatchObject({ rating: 4.6, count: 123 });
    expect(g.url).toContain('query_place_id=ChIJabc123');
    expect(g.url.startsWith('https://www.google.com/maps/search/')).toBe(true);
    expect(m.rating).toHaveBeenCalledWith('ChIJabc123');
  });

  it('no place id → null and Places is never called', async () => {
    m.retailerFind.mockResolvedValue({ ...RETAILER, google_place_id: null });
    const res = await get();
    expect(res.json().data.google_rating).toBeNull();
    expect(m.rating).not.toHaveBeenCalled();
  });

  it('Places has nothing to show → null, the rest of the profile is intact', async () => {
    m.rating.mockResolvedValue(null);
    const res = await get();
    expect(res.json().data).toMatchObject({ shop_name: 'Asha Boutique', google_rating: null });
  });

  it('even if the rating lookup throws, the profile still loads', async () => {
    m.rating.mockRejectedValue(new Error('redis down'));
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.json().data.google_rating).toBeNull();
  });

  it('a suspended store shows minimal info and Places is not called', async () => {
    m.retailerFind.mockResolvedValue({ ...RETAILER, is_suspended: true });
    const res = await get();
    expect(res.json().data.suspended).toBe(true);
    expect(res.json().data.google_rating).toBeUndefined();
    expect(m.rating).not.toHaveBeenCalled();
  });

  // The retailer picks their own place id and Google proves no ownership, so a better-rated
  // neighbour's place must not be shown as theirs (security review of 9084b63e).
  it("someone else's place (name does not match the shop) → hidden", async () => {
    m.rating.mockResolvedValue({ ...PLACE, name: 'Meera Sarees', address: 'Ludhiana, Punjab' });
    const res = await get();
    expect(res.json().data.google_rating).toBeNull();
  });

  it('the place is in another city than the shop → hidden', async () => {
    m.rating.mockResolvedValue({ ...PLACE, address: 'Jaipur, Rajasthan' });
    expect((await get()).json().data.google_rating).toBeNull();
  });

  it('another store that ALSO plausibly is this place claims it → ambiguous, hidden for both', async () => {
    m.retailerFindMany.mockResolvedValue([{ shop_name: 'Asha Boutique', city: 'Ludhiana' }]);
    expect((await get()).json().data.google_rating).toBeNull();
    const where = m.retailerFindMany.mock.calls[0]?.[0].where;
    expect(where).toMatchObject({ google_place_id: 'ChIJabc123', deleted_at: null });
    expect(where.id).toEqual({ not: 'ret1' });
  });

  it('a rival who merely pasted the same place id (name does not match) cannot hide the real shop', async () => {
    m.retailerFindMany.mockResolvedValue([{ shop_name: 'Rival Sarees', city: 'Ludhiana' }]);
    expect((await get()).json().data.google_rating).toMatchObject({ rating: 4.6, count: 123 });
  });

  it('if the duplicate-claim check itself fails → hidden, never shown', async () => {
    m.retailerFindMany.mockRejectedValue(new Error('db'));
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.json().data.google_rating).toBeNull();
  });

  it('never exposes the place id itself', async () => {
    const res = await get();
    expect(Object.keys(res.json().data)).not.toContain('google_place_id');
  });
});
