// Admin Local Discovery nearby search. Asserts the three things that matter:
//  1. the centre comes from the geocoder (pincode vs city routed correctly) and an unknown place is a 404,
//  2. only retailers inside the radius come back, nearest first, rows without coordinates never do,
//  3. the DB query is scoped by deleted_at + a bounding box (never a full table scan of everything).
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

const { mockFindMany, mockGeocode } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockGeocode: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({ prisma: { retailer: { findMany: mockFindMany } } }));
vi.mock('../../lib/geocode-address.js', () => ({ geocodeAddress: mockGeocode }));
vi.mock('../admin-auth.js', () => ({ adminAuthPreHandler: async () => undefined }));

const { adminDiscoveryRoutes } = await import('./admin-discovery.js');

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(adminDiscoveryRoutes);
  await app.ready();
  return app;
}

const row = (id: string, lat: number | null, lng: number | null, extra = {}) => ({
  id,
  shop_name: id,
  phone: '+919000000000',
  city: 'Chandigarh',
  state: 'Chandigarh',
  pincode: '160022',
  address_line1: 'x',
  latitude: lat,
  longitude: lng,
  location_source: 'RETAILER_PIN',
  public_slug: id,
  _count: { products: 3 },
  ...extra,
});

// Centre: Chandigarh 30.7333, 76.7794. Each test uses a distinct query because the route
// caches a found place for a day (so a second test with the same query would skip the geocoder).
beforeEach(() => {
  vi.clearAllMocks();
  mockGeocode.mockResolvedValue({
    lat: 30.7333,
    lng: 76.7794,
    level: 'pincode',
    display: 'Chandigarh',
  });
});

describe('GET /discovery/nearby', () => {
  it('returns stores inside the radius, nearest first, with distance', async () => {
    mockFindMany.mockResolvedValue([
      row('far-ish', 30.78, 76.78), // ~5.2 km
      row('near', 30.734, 76.78), // ~0.1 km
      row('outside', 30.95, 76.78), // ~24 km: inside the box for a bigger radius, outside 10 km
      row('nogeo', null, null),
    ]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/discovery/nearby?query=160022&radius_km=10',
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.retailers.map((r: { id: string }) => r.id)).toEqual(['near', 'far-ish']);
    expect(d.retailers[0].distance_km).toBeLessThan(1);
    expect(d.count).toBe(2);
    expect(d.center).toMatchObject({ lat: 30.7333, level: 'pincode' });
  });

  it('routes a 6-digit query as a pincode and anything else as a city', async () => {
    mockFindMany.mockResolvedValue([]);
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/discovery/nearby?query=160059' });
    expect(mockGeocode.mock.calls[0]?.[0]).toEqual({ pincode: '160059' });
    await app.inject({ method: 'GET', url: '/discovery/nearby?query=Mohali' });
    expect(mockGeocode.mock.calls[1]?.[0]).toEqual({ city: 'Mohali' });
  });

  it('queries only live retailers inside a bounding box', async () => {
    mockFindMany.mockResolvedValue([]);
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/discovery/nearby?query=Kharar&radius_km=25' });
    const where = mockFindMany.mock.calls[0]?.[0].where;
    expect(where.deleted_at).toBeNull();
    expect(where.latitude).toEqual({ gte: expect.any(Number), lte: expect.any(Number) });
    expect(where.longitude).toEqual({ gte: expect.any(Number), lte: expect.any(Number) });
  });

  it('is a 404 when the place cannot be found, and never queries retailers', async () => {
    mockGeocode.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/discovery/nearby?query=Nowhereville' });
    expect(res.statusCode).toBe(404);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('rejects a missing query or an out-of-range radius', async () => {
    const app = await buildApp();
    expect((await app.inject({ method: 'GET', url: '/discovery/nearby' })).statusCode).toBe(422);
    expect(
      (await app.inject({ method: 'GET', url: '/discovery/nearby?query=Mohali&radius_km=9999' }))
        .statusCode,
    ).toBe(422);
  });
});
