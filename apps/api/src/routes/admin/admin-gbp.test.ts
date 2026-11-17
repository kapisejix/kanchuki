/**
 * Part B3/B4: only a Super Admin can connect the shared Google identity; marketing can link a
 * retailer — but only one who asked, only to a location Google says we manage, and never to a
 * location another retailer already holds.
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler, forbidden } from '../../plugins/error-handler.js';

const m = vi.hoisted(() => ({
  linkFind: vi.fn(),
  linkFindMany: vi.fn(),
  linkUpdate: vi.fn(),
  linkGroup: vi.fn(),
  auditCreate: vi.fn(),
  listLocations: vi.fn(),
  exchangeCode: vi.fn(),
  saveSetting: vi.fn(),
  buildAuthUrl: vi.fn(),
  createState: vi.fn(),
  consumeState: vi.fn(),
  sync: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    gbpLink: {
      findUnique: m.linkFind,
      findMany: m.linkFindMany,
      update: m.linkUpdate,
      groupBy: m.linkGroup,
    },
    auditLog: { create: m.auditCreate },
  },
}));
vi.mock('../admin-auth.js', () => ({
  adminAuthPreHandler: async () => undefined,
  requireSuperAdmin: (request: { adminRole?: string }) => {
    if (request.adminRole !== 'SUPER_ADMIN') throw forbidden('Super Admin privileges required');
  },
}));
vi.mock('../../lib/gbp-sync.js', () => ({ syncLink: m.sync }));
vi.mock('../retailers/retailers-social/retailers-social-helpers.js', () => ({
  createOAuthState: m.createState,
  consumeOAuthState: m.consumeState,
}));
vi.mock('../../lib/google-business.js', async (orig) => ({
  ...(await orig<typeof import('../../lib/google-business.js')>()),
  listLocations: m.listLocations,
  exchangeCode: m.exchangeCode,
  saveGbpSetting: m.saveSetting,
  buildAuthUrl: m.buildAuthUrl,
  getGbpSetting: vi.fn(async () => undefined),
  gbpApiApproved: vi.fn(async () => false),
  gbpConnectedEmail: vi.fn(async () => null),
}));

const { adminGbpRoutes } = await import('./admin-gbp.js');

async function buildApp(role = 'SUPER_ADMIN') {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.addHook('onRequest', async (request) => {
    request.adminRole = role;
    request.adminId = 'admin@test';
  });
  await app.register(adminGbpRoutes, { prefix: '/v1/admin' });
  await app.ready();
  return app;
}

const LOC = { account: 'acc1', location: 'loc1', title: 'Asha Boutique', address: 'Delhi' };

beforeEach(() => {
  vi.clearAllMocks();
  m.auditCreate.mockResolvedValue({});
  m.linkUpdate.mockResolvedValue({});
  m.linkFindMany.mockResolvedValue([]);
  m.listLocations.mockResolvedValue([LOC]);
  m.sync.mockResolvedValue({ ok: true, synced: 3 });
  m.createState.mockResolvedValue('state123');
  m.buildAuthUrl.mockResolvedValue('https://accounts.google.com/o/oauth2/v2/auth?x=1');
  m.linkFind.mockResolvedValue({ id: 'link1', retailer_id: 'ret1', status: 'REQUESTED' });
});

describe('credential routes are Super Admin only (the segment itself is standard-tier)', () => {
  it.each([
    ['GET', '/v1/admin/gbp/connect'],
    ['POST', '/v1/admin/gbp/callback'],
    ['POST', '/v1/admin/gbp/approval'],
  ] as const)('MARKETING_MANAGER gets 403 on %s %s', async (method, url) => {
    const res = await (await buildApp('MARKETING_MANAGER')).inject({
      method,
      url,
      payload: { code: 'c', state: 's', approved: true },
    });
    expect(res.statusCode).toBe(403);
    expect(m.saveSetting).not.toHaveBeenCalled();
    expect(m.exchangeCode).not.toHaveBeenCalled();
  });

  it('Super Admin gets the consent URL, bound to their own session', async () => {
    const res = await (await buildApp()).inject({ method: 'GET', url: '/v1/admin/gbp/connect' });
    expect(res.json().data.url).toContain('accounts.google.com');
    expect(m.createState).toHaveBeenCalledWith('gbp-admin:admin@test');
  });

  it('callback refuses a state this admin did not start, and stores nothing', async () => {
    m.consumeState.mockResolvedValue('gbp-admin:someone-else');
    const res = await (await buildApp()).inject({
      method: 'POST',
      url: '/v1/admin/gbp/callback',
      payload: { code: 'c', state: 's' },
    });
    expect(res.statusCode).toBe(422);
    expect(m.exchangeCode).not.toHaveBeenCalled();
    expect(m.saveSetting).not.toHaveBeenCalled();
  });

  it('callback stores the token + email and never returns the token', async () => {
    m.consumeState.mockResolvedValue('gbp-admin:admin@test');
    m.exchangeCode.mockResolvedValue({ refreshToken: 'rt-secret', email: 'k@example.com' });
    const res = await (await buildApp()).inject({
      method: 'POST',
      url: '/v1/admin/gbp/callback',
      payload: { code: 'c', state: 's' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('rt-secret');
    expect(m.saveSetting.mock.calls.map((c) => c[0])).toEqual([
      'GBP_REFRESH_TOKEN',
      'GBP_CONNECTED_EMAIL',
    ]);
  });
});

// Audit minor B: reconnecting with an id_token that has no email must not leave the OLD account's
// address as the "add this Manager" address shown to retailers.
describe('callback without an email in the id_token', () => {
  it('clears the stored connected email instead of keeping the previous account', async () => {
    m.consumeState.mockResolvedValue('gbp-admin:admin@test');
    m.exchangeCode.mockResolvedValue({ refreshToken: 'rt-new', email: null });
    const res = await (await buildApp()).inject({
      method: 'POST',
      url: '/v1/admin/gbp/callback',
      payload: { code: 'c', state: 's' },
    });
    expect(res.statusCode).toBe(200);
    const emailSave = m.saveSetting.mock.calls.find((c) => c[0] === 'GBP_CONNECTED_EMAIL');
    expect(emailSave?.[2]).toBe('');
  });
});

describe('linking a retailer', () => {
  const link = (app: Awaited<ReturnType<typeof buildApp>>, body: Record<string, string> = LOC) =>
    app.inject({ method: 'POST', url: '/v1/admin/gbp/links/link1/link', payload: body });

  it('marketing manager can link a retailer who asked; ids and title come from GOOGLE, not the client', async () => {
    const res = await link(await buildApp('MARKETING_MANAGER'), {
      account: 'acc1',
      location: 'loc1',
      title: 'FORGED TITLE',
    });
    expect(res.statusCode).toBe(200);
    expect(m.linkUpdate.mock.calls[0]?.[0].data).toMatchObject({
      status: 'LINKED',
      gbp_account_id: 'acc1',
      gbp_location_id: 'loc1',
      location_title: 'Asha Boutique',
    });
    expect(m.sync).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'link1', retailer_id: 'ret1', gbp_location_id: 'loc1' }),
    );
    expect(m.auditCreate.mock.calls[0]?.[0].data).toMatchObject({ action: 'link' });
  });

  it('a retailer who never asked (UNLINKED/LINKED) cannot be linked', async () => {
    for (const status of ['UNLINKED', 'LINKED']) {
      m.linkFind.mockResolvedValue({ id: 'link1', retailer_id: 'ret1', status });
      expect((await link(await buildApp())).statusCode).toBe(409);
    }
    expect(m.linkUpdate).not.toHaveBeenCalled();
  });

  it('a location Google does not list for our account is refused', async () => {
    const res = await link(await buildApp(), { account: 'acc9', location: 'loc9' });
    expect(res.statusCode).toBe(422);
    expect(m.linkUpdate).not.toHaveBeenCalled();
  });

  it('a location another retailer already holds → 409 (unique index)', async () => {
    m.linkUpdate.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    const res = await link(await buildApp());
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('ALREADY_LINKED');
    expect(m.sync).not.toHaveBeenCalled();
  });

  it('GET /locations hides locations already linked', async () => {
    m.listLocations.mockResolvedValue([LOC, { ...LOC, location: 'loc2', title: 'Other' }]);
    m.linkFindMany.mockResolvedValue([{ gbp_account_id: 'acc1', gbp_location_id: 'loc1' }]);
    const res = await (await buildApp('MARKETING_MANAGER')).inject({
      method: 'GET',
      url: '/v1/admin/gbp/locations',
    });
    expect(res.json().data.map((l: { location: string }) => l.location)).toEqual(['loc2']);
  });

  it('Google not approved surfaces as a clear 409, never an empty list', async () => {
    const { GbpError } = await import('../../lib/google-business.js');
    m.listLocations.mockRejectedValue(new GbpError('NOT_APPROVED', 'not approved'));
    const res = await (await buildApp()).inject({ method: 'GET', url: '/v1/admin/gbp/locations' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('GBP_NOT_APPROVED');
  });
});

describe('unlink', () => {
  it('clears the ids so the Google location can be linked elsewhere, and audits', async () => {
    const res = await (await buildApp('MARKETING_MANAGER')).inject({
      method: 'POST',
      url: '/v1/admin/gbp/links/link1/unlink',
    });
    expect(res.statusCode).toBe(200);
    expect(m.linkUpdate.mock.calls[0]?.[0].data).toMatchObject({
      status: 'UNLINKED',
      gbp_account_id: null,
      gbp_location_id: null,
    });
    expect(m.auditCreate.mock.calls[0]?.[0].data).toMatchObject({ action: 'unlink' });
  });
});
