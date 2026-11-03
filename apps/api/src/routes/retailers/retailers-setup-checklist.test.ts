/**
 * Part C of docs/tasks/pending/google-business-profile-and-setup-checklist.md:
 * statuses are derived from real data, the routes are owner-only, one open ask per item,
 * and nothing secret or cross-retailer rides on the response.
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';
import { retailersSetupChecklistRoutes } from './retailers-setup-checklist.js';

const m = vi.hoisted(() => ({
  retailerFind: vi.fn(),
  retailerUpdate: vi.fn(),
  socialFindMany: vi.fn(),
  ticketFindMany: vi.fn(),
  ticketCreate: vi.fn(),
  ticketUpdate: vi.fn(),
  hasFeature: vi.fn(),
  routeTicket: vi.fn(),
  gbpAvailable: vi.fn(),
  gbpLinked: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findUnique: m.retailerFind, update: m.retailerUpdate },
    socialAccount: { findMany: m.socialFindMany },
    supportTicket: {
      findMany: m.ticketFindMany,
      create: m.ticketCreate,
      update: m.ticketUpdate,
    },
    territory: { findUnique: vi.fn() },
  },
}));
vi.mock('../../lib/features.js', () => ({ hasFeature: m.hasFeature }));
vi.mock('../team.js', () => ({ routeTicket: m.routeTicket }));
vi.mock('../../lib/gbp-availability.js', () => ({
  gbpAvailable: m.gbpAvailable,
  gbpLinked: m.gbpLinked,
}));

const BASE_ROW = {
  territory_id: null,
  google_place_id: null,
  gstin: null,
  whatsapp_api_phone_number_id: null,
  whatsapp_api_access_token: null,
  setup_dismissed: [] as string[],
};

async function buildApp(opts: { retailerId?: string; staffRole?: string | null } = {}) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('staffRole', null);
  app.decorateRequest('catalogDelegate', null);
  app.decorateRequest('supportDelegate', null);
  app.addHook('preHandler', async (request) => {
    request.retailerId = opts.retailerId ?? 'ret1';
    request.staffRole = (opts.staffRole ?? null) as never;
  });
  await app.register(retailersSetupChecklistRoutes, { prefix: '/v1/retailers' });
  await app.ready();
  return app;
}
type App = Awaited<ReturnType<typeof buildApp>>;

const get = (app: App) => app.inject({ method: 'GET', url: '/v1/retailers/me/setup-checklist' });
type Item = { key: string; status: string; dismissed: boolean; can_ask: boolean };
const itemsOf = (res: { json: () => { data: { items: Item[] } } }) => res.json().data.items;

beforeEach(() => {
  vi.clearAllMocks();
  m.retailerFind.mockResolvedValue({ ...BASE_ROW });
  m.retailerUpdate.mockResolvedValue({});
  m.socialFindMany.mockResolvedValue([]);
  m.ticketFindMany.mockResolvedValue([]);
  m.ticketCreate.mockResolvedValue({ id: 't1', status: 'OPEN' });
  m.hasFeature.mockResolvedValue(false);
  m.routeTicket.mockResolvedValue(null);
  m.gbpAvailable.mockResolvedValue(false);
  m.gbpLinked.mockResolvedValue(false);
});

describe('Google Business Profile item', () => {
  it('appears only when GBP is available for the retailer, and is done only when linked', async () => {
    m.gbpAvailable.mockResolvedValue(true);
    let items = itemsOf(await get(await buildApp()));
    expect(items.find((i) => i.key === 'google_business')?.status).toBe('missing');
    m.gbpLinked.mockResolvedValue(true);
    items = itemsOf(await get(await buildApp()));
    expect(items.find((i) => i.key === 'google_business')?.status).toBe('done');
  });
});

describe('Store location item (opt-in: old builds crash on keys they do not know)', () => {
  const getWith = (app: App) =>
    app.inject({
      method: 'GET',
      url: '/v1/retailers/me/setup-checklist',
      headers: { 'x-checklist-store-location': '1' },
    });
  const loc = (items: Item[]) => items.find((i) => i.key === 'store_location');

  it('is never sent without the opt-in header', async () => {
    expect(loc(itemsOf(await get(await buildApp())))).toBeUndefined();
  });

  it('is missing until the owner has pinned the shop', async () => {
    expect(loc(itemsOf(await getWith(await buildApp())))?.status).toBe('missing');
  });

  it('is done for an own pin and for a legacy pin with no source', async () => {
    for (const source of ['RETAILER_PIN', null]) {
      m.retailerFind.mockResolvedValue({
        ...BASE_ROW,
        latitude: 30.7,
        longitude: 76.8,
        location_source: source,
      });
      expect(loc(itemsOf(await getWith(await buildApp())))?.status).toBe('done');
    }
  });

  it('stays missing for a backfilled guess (GEOCODED_APPROX): the owner still has to pin', async () => {
    m.retailerFind.mockResolvedValue({
      ...BASE_ROW,
      latitude: 30.7,
      longitude: 76.8,
      location_source: 'GEOCODED_APPROX',
    });
    expect(loc(itemsOf(await getWith(await buildApp())))?.status).toBe('missing');
  });
});

describe('GET /me/setup-checklist', () => {
  it('lists only what the plan/platform can offer; Google Business + WhatsApp API are hidden', async () => {
    const res = await get(await buildApp());
    expect(itemsOf(res).map((i) => i.key)).toEqual([
      'google_place',
      'facebook',
      'instagram',
      'gst',
    ]);
    expect(res.json().data.visible_missing).toBe(4);
  });

  it('derives done from real data, never a stored flag', async () => {
    m.hasFeature.mockResolvedValue(true);
    m.retailerFind.mockResolvedValue({
      ...BASE_ROW,
      google_place_id: 'ChIJxxxxxxxxxxxxxxxxxxxx',
      gstin: '07ABCDE1234F1Z5',
      whatsapp_api_phone_number_id: 'pn1',
      whatsapp_api_access_token: 'tok',
    });
    m.socialFindMany.mockResolvedValue([{ platform: 'FACEBOOK' }]);
    const status = Object.fromEntries(
      itemsOf(await get(await buildApp())).map((i) => [i.key, i.status]),
    );
    expect(status).toEqual({
      google_place: 'done',
      facebook: 'done',
      instagram: 'missing',
      gst: 'done',
      whatsapp_api: 'done',
    });
  });

  it('WhatsApp API needs BOTH the phone id and the token', async () => {
    m.hasFeature.mockResolvedValue(true);
    m.retailerFind.mockResolvedValue({ ...BASE_ROW, whatsapp_api_phone_number_id: 'pn1' });
    const wa = itemsOf(await get(await buildApp())).find((i) => i.key === 'whatsapp_api');
    expect(wa?.status).toBe('missing');
  });

  it('an open ask makes the item "requested" (derived from the ticket)', async () => {
    m.ticketFindMany.mockResolvedValue([{ setup_item: 'gst' }]);
    const gst = itemsOf(await get(await buildApp())).find((i) => i.key === 'gst');
    expect(gst).toMatchObject({ status: 'requested', can_ask: false });
  });

  it('visible_missing ignores dismissed and done items', async () => {
    m.retailerFind.mockResolvedValue({
      ...BASE_ROW,
      gstin: '07ABCDE1234F1Z5',
      setup_dismissed: ['instagram'],
    });
    const res = await get(await buildApp());
    expect(res.json().data.visible_missing).toBe(2); // google_place + facebook
    expect(itemsOf(res).find((i) => i.key === 'instagram')?.dismissed).toBe(true);
  });

  it('only reads the caller’s own rows and never leaks tokens or ids', async () => {
    m.hasFeature.mockResolvedValue(true);
    m.retailerFind.mockResolvedValue({
      ...BASE_ROW,
      whatsapp_api_phone_number_id: 'pn-secret',
      whatsapp_api_access_token: 'tok-secret',
    });
    const res = await get(await buildApp({ retailerId: 'retA' }));
    expect(res.body).not.toContain('tok-secret');
    expect(res.body).not.toContain('pn-secret');
    expect(res.body).not.toContain('retA');
    expect(m.retailerFind.mock.calls[0]?.[0].where).toEqual({ id: 'retA' });
    expect(m.socialFindMany.mock.calls[0]?.[0].where.retailer_id).toBe('retA');
    expect(m.ticketFindMany.mock.calls[0]?.[0].where.retailer_id).toBe('retA');
  });
});

describe('owner-only', () => {
  it.each([
    ['GET', '/v1/retailers/me/setup-checklist'],
    ['POST', '/v1/retailers/me/setup-checklist/dismiss'],
    ['POST', '/v1/retailers/me/setup-checklist/restore'],
    ['POST', '/v1/retailers/me/setup-checklist/gst/ask'],
  ] as const)('manager gets 403 on %s %s and nothing is read or written', async (method, url) => {
    const app = await buildApp({ staffRole: 'manager' });
    const res = await app.inject({ method, url, payload: { item_key: 'gst' } });
    expect(res.statusCode).toBe(403);
    expect(m.retailerFind).not.toHaveBeenCalled();
    expect(m.retailerUpdate).not.toHaveBeenCalled();
    expect(m.ticketCreate).not.toHaveBeenCalled();
  });
});

describe('dismiss / restore', () => {
  it('dismiss adds a validated key once; unknown keys are rejected', async () => {
    m.retailerFind.mockResolvedValue({ ...BASE_ROW, setup_dismissed: ['gst'] });
    const app = await buildApp();
    const ok = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/setup-checklist/dismiss',
      payload: { item_key: 'gst' },
    });
    expect(ok.statusCode).toBe(200);
    expect(m.retailerUpdate.mock.calls[0]?.[0].data.setup_dismissed).toEqual(['gst']);
    const bad = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/setup-checklist/dismiss',
      payload: { item_key: 'payment' },
    });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('restore with no key brings every item back', async () => {
    m.retailerFind.mockResolvedValue({ ...BASE_ROW, setup_dismissed: ['gst', 'facebook'] });
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/setup-checklist/restore',
      payload: {},
    });
    expect(m.retailerUpdate.mock.calls[0]?.[0].data.setup_dismissed).toEqual([]);
  });
});

describe('POST /me/setup-checklist/:item_key/ask', () => {
  const ask = (app: App, key: string) =>
    app.inject({ method: 'POST', url: `/v1/retailers/me/setup-checklist/${key}/ask` });

  it('creates ONE routed ticket tagged with the item and the right type', async () => {
    const res = await ask(await buildApp(), 'gst');
    expect(res.statusCode).toBe(201);
    expect(m.ticketCreate.mock.calls[0]?.[0].data).toMatchObject({
      retailer_id: 'ret1',
      ticket_type: 'MAINTENANCE',
      setup_item: 'gst',
      requires_visit: false,
    });
    expect(m.ticketCreate.mock.calls[0]?.[0].data.note).toMatch(/^\[setup:gst\]/);
    expect(m.routeTicket).toHaveBeenCalledTimes(1);
  });

  it('uses GROWTH_SETUP for social items', async () => {
    await ask(await buildApp(), 'facebook');
    expect(m.ticketCreate.mock.calls[0]?.[0].data.ticket_type).toBe('GROWTH_SETUP');
  });

  it('a repeat tap returns the existing request and creates nothing', async () => {
    m.ticketFindMany.mockResolvedValue([{ setup_item: 'gst' }]);
    const res = await ask(await buildApp(), 'gst');
    expect(res.statusCode).toBe(200);
    expect(m.ticketCreate).not.toHaveBeenCalled();
  });

  it('losing a race to the unique index still answers "requested"', async () => {
    m.ticketCreate.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    const res = await ask(await buildApp(), 'gst');
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('requested');
  });

  it('refuses an item that is already done (409) and one that is not offered (404)', async () => {
    m.retailerFind.mockResolvedValue({ ...BASE_ROW, gstin: '07ABCDE1234F1Z5' });
    const app = await buildApp();
    expect((await ask(app, 'gst')).statusCode).toBe(409);
    expect((await ask(app, 'whatsapp_api')).statusCode).toBe(404); // plan lacks the feature
    expect((await ask(app, 'google_business')).statusCode).toBe(404); // not available yet
    expect((await ask(app, 'payment')).statusCode).toBe(404);
    expect(m.ticketCreate).not.toHaveBeenCalled();
  });
});
