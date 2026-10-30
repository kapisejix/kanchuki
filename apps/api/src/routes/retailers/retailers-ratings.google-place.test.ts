/**
 * Part A of docs/tasks/pending/google-business-profile-and-setup-checklist.md:
 * place-id capture is validated, optionally verified with Google, audited, and the
 * search route never returns canned results.
 */
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAILY_SEARCH_LIMIT, __resetPlacesCounters } from '../../lib/google-places.js';
import { errorHandler } from '../../plugins/error-handler.js';
import { retailersRatingsRoutes } from './retailers-ratings.js';

const m = vi.hoisted(() => ({
  retailerFind: vi.fn(),
  retailerUpdate: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findUnique: m.retailerFind, update: m.retailerUpdate },
    auditLog: { create: m.auditCreate },
  },
}));

const ID = 'ChIJN1t_tDeuEmsRUsoyG83frY4';

async function buildApp(retailerId = 'ret1') {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('onRequest', async (request) => {
    request.retailerId = retailerId;
  });
  // Same prefix as src/index.ts — a different one here once hid a 404 (RC-100).
  await app.register(retailersRatingsRoutes, { prefix: '/v1/retailers' });
  await app.ready();
  return app;
}
type App = Awaited<ReturnType<typeof buildApp>>;

const patch = (app: App, google_place_id: string | null) =>
  app.inject({
    method: 'PATCH',
    url: '/v1/retailers/reviews/google-place',
    payload: { google_place_id },
  });

beforeEach(() => {
  vi.clearAllMocks();
  __resetPlacesCounters();
  process.env.GOOGLE_PLACES_API_KEY = '';
  m.retailerUpdate.mockResolvedValue({});
  m.auditCreate.mockResolvedValue({});
});
afterEach(() => vi.unstubAllGlobals());

describe('PATCH /reviews/google-place', () => {
  it('stores a raw id and audits it', async () => {
    const app = await buildApp();
    const res = await patch(app, `  ${ID} `);
    expect(res.statusCode).toBe(200);
    expect(m.retailerUpdate).toHaveBeenCalledWith({
      where: { id: 'ret1' },
      data: { google_place_id: ID },
    });
    expect(m.auditCreate.mock.calls[0]?.[0].data.metadata).toEqual({ google_place_id: 'set' });
  });

  it('extracts the id from a pasted maps url', async () => {
    const app = await buildApp();
    await patch(app, `https://www.google.com/maps/search/?api=1&query_place_id=${ID}`);
    expect(m.retailerUpdate.mock.calls[0]?.[0].data.google_place_id).toBe(ID);
  });

  it.each([
    ['a short share link', 'https://maps.app.goo.gl/abc123'],
    ['plain words', 'my shop in delhi'],
    ['300 chars of junk', 'x'.repeat(300)],
  ])('rejects %s with 422 and writes nothing', async (_n, value) => {
    const app = await buildApp();
    const res = await patch(app, value);
    expect(res.statusCode).toBe(422);
    expect(m.retailerUpdate).not.toHaveBeenCalled();
  });

  it('empty string and null clear the id', async () => {
    const app = await buildApp();
    await patch(app, '');
    await patch(app, null);
    expect(m.retailerUpdate.mock.calls.map((c) => c[0].data.google_place_id)).toEqual([null, null]);
    expect(m.auditCreate.mock.calls[0]?.[0].data.metadata).toEqual({ google_place_id: 'cleared' });
  });

  it('with a Places key, refuses an id Google does not know', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const app = await buildApp();
    const res = await patch(app, ID);
    expect(res.statusCode).toBe(422);
    expect(m.retailerUpdate).not.toHaveBeenCalled();
  });

  it('with a Places key, a Google failure is a 502, not a silent save', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const app = await buildApp();
    const res = await patch(app, ID);
    expect(res.statusCode).toBe(502);
    expect(m.retailerUpdate).not.toHaveBeenCalled();
  });
});

describe('GET /google-place/search', () => {
  const search = (app: App, q = 'Asha Boutique') =>
    app.inject({
      method: 'GET',
      url: `/v1/retailers/me/google-place/search?q=${encodeURIComponent(q)}`,
    });

  it('501 NOT_CONFIGURED without a key — no canned results', async () => {
    const app = await buildApp();
    const res = await search(app);
    expect(res.statusCode).toBe(501);
  });

  it("returns id/name/address only and biases to THIS retailer's location", async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'k';
    m.retailerFind.mockResolvedValue({ latitude: 28.6, longitude: 77.2 });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        places: [
          { id: ID, displayName: { text: 'Asha Boutique' }, formattedAddress: 'Delhi', rating: 4 },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const app = await buildApp('ret1');
    const res = await search(app);
    expect(res.json().data).toEqual([{ place_id: ID, name: 'Asha Boutique', address: 'Delhi' }]);
    expect(m.retailerFind.mock.calls[0]?.[0].where).toEqual({ id: 'ret1' });
    const sent = JSON.parse(fetchMock.mock.calls[0]?.[1].body);
    expect(sent.locationBias.circle.center).toEqual({ latitude: 28.6, longitude: 77.2 });
  });

  it('Google error → 502', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'k';
    m.retailerFind.mockResolvedValue({ latitude: null, longitude: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const app = await buildApp();
    expect((await search(app)).statusCode).toBe(502);
  });

  it('429 after the daily budget', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'k';
    m.retailerFind.mockResolvedValue({ latitude: null, longitude: null });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ places: [] }) }),
    );
    const app = await buildApp();
    for (let i = 0; i < DAILY_SEARCH_LIMIT; i++) expect((await search(app)).statusCode).toBe(200);
    expect((await search(app)).statusCode).toBe(429);
  });
});
