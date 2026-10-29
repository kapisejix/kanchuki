/**
 * Part B5/B8 of docs/tasks/pending/google-business-profile-and-setup-checklist.md:
 * nothing fake-succeeds, the routes are owner-only, tenants are isolated, and a reply is
 * only recorded after Google confirms it.
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

const m = vi.hoisted(() => ({
  linkFind: vi.fn(),
  linkUpsert: vi.fn(),
  linkUpdate: vi.fn(),
  linkUpdateMany: vi.fn(),
  reviewFindMany: vi.fn(),
  reviewFindFirst: vi.fn(),
  reviewUpdate: vi.fn(),
  auditCreate: vi.fn(),
  retailerFind: vi.fn(),
  ticketCreate: vi.fn(),
  hasFeature: vi.fn(),
  available: vi.fn(),
  reply: vi.fn(),
  managerEmail: vi.fn(),
  sync: vi.fn(),
  reserve: vi.fn(),
  refund: vi.fn(),
  routeTicket: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    gbpLink: {
      findUnique: m.linkFind,
      upsert: m.linkUpsert,
      update: m.linkUpdate,
      updateMany: m.linkUpdateMany,
    },
    gbpReview: { findMany: m.reviewFindMany, findFirst: m.reviewFindFirst, update: m.reviewUpdate },
    auditLog: { create: m.auditCreate },
    retailer: { findUnique: m.retailerFind },
    territory: { findUnique: vi.fn() },
    supportTicket: { create: m.ticketCreate, update: vi.fn() },
  },
}));
vi.mock('../../lib/features.js', () => ({ hasFeature: m.hasFeature }));
vi.mock('../../lib/gbp-availability.js', () => ({ gbpAvailable: m.available }));
vi.mock('../../lib/gbp-sync.js', () => ({ syncIfStale: m.sync }));
vi.mock('../../lib/quota.js', () => ({ reserveQuota: m.reserve }));
vi.mock('../team.js', () => ({ routeTicket: m.routeTicket }));
vi.mock('../../lib/google-business.js', async (orig) => ({
  ...(await orig<typeof import('../../lib/google-business.js')>()),
  replyToReview: m.reply,
  gbpManagerEmail: m.managerEmail,
}));

import { GbpError } from '../../lib/google-business.js';
import { retailersGoogleBusinessRoutes } from './retailers-google-business.js';

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
  await app.register(retailersGoogleBusinessRoutes, { prefix: '/v1/retailers' });
  await app.ready();
  return app;
}
type App = Awaited<ReturnType<typeof buildApp>>;

const base = '/v1/retailers/me/google-business';
const LINKED = {
  id: 'link1',
  retailer_id: 'ret1',
  status: 'LINKED',
  gbp_account_id: 'acc1',
  gbp_location_id: 'loc1',
  linked_at: new Date('2026-10-01T00:00:00Z'),
  last_synced_at: new Date(),
  avg_rating: 4.5,
  review_count: 10,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.hasFeature.mockResolvedValue(true);
  m.available.mockResolvedValue(true);
  m.managerEmail.mockResolvedValue('kanchuki.reviews@example.com');
  m.sync.mockResolvedValue(false);
  m.refund.mockResolvedValue(undefined);
  m.reserve.mockResolvedValue(m.refund);
  m.linkFind.mockResolvedValue(LINKED);
  m.linkUpsert.mockResolvedValue({});
  m.linkUpdate.mockResolvedValue({});
  m.linkUpdateMany.mockResolvedValue({ count: 1 });
  m.reviewFindMany.mockResolvedValue([]);
  m.reviewFindFirst.mockResolvedValue({ id: 'rev1', google_review_id: 'g1' });
  m.reviewUpdate.mockResolvedValue({});
  m.auditCreate.mockResolvedValue({});
  m.retailerFind.mockResolvedValue({ territory_id: null });
  m.ticketCreate.mockResolvedValue({ id: 't1', status: 'OPEN' });
  m.routeTicket.mockResolvedValue(null);
  m.reply.mockResolvedValue({ comment: 'Thank you!', updatedAt: new Date('2026-10-05T00:00:00Z') });
});

describe('owner-only', () => {
  it.each([
    ['GET', `${base}/status`],
    ['POST', `${base}/request`],
    ['GET', `${base}/reviews`],
    ['POST', `${base}/reviews/rev1/reply`],
    ['DELETE', `${base}/link`],
  ] as const)('manager gets 403 on %s %s and nothing is touched', async (method, url) => {
    const app = await buildApp({ staffRole: 'manager' });
    const res = await app.inject({ method, url, payload: { consent: true, comment: 'hi' } });
    expect(res.statusCode).toBe(403);
    expect(m.linkFind).not.toHaveBeenCalled();
    expect(m.reply).not.toHaveBeenCalled();
    expect(m.linkUpsert).not.toHaveBeenCalled();
  });
});

describe('flag OFF / not approved — nothing fake-succeeds', () => {
  it('status says UNAVAILABLE and leaks nothing', async () => {
    m.available.mockResolvedValue(false);
    const res = await (await buildApp()).inject({ method: 'GET', url: `${base}/status` });
    expect(res.json().data).toEqual({ state: 'UNAVAILABLE' });
    expect(m.linkFind).not.toHaveBeenCalled();
  });

  it('plan without the feature → 402 on request, reviews and reply', async () => {
    m.hasFeature.mockResolvedValue(false);
    const app = await buildApp();
    for (const [method, url] of [
      ['POST', `${base}/request`],
      ['GET', `${base}/reviews`],
      ['POST', `${base}/reviews/rev1/reply`],
    ] as const) {
      const res = await app.inject({ method, url, payload: { consent: true, comment: 'hi' } });
      expect(res.statusCode, `${method} ${url}`).toBe(402);
    }
    expect(m.linkUpsert).not.toHaveBeenCalled();
    expect(m.ticketCreate).not.toHaveBeenCalled();
    expect(m.reply).not.toHaveBeenCalled();
  });

  it('feature on but Google not connected/approved → 409 NOT_AVAILABLE, no row, no ticket, no reply', async () => {
    m.available.mockResolvedValue(false);
    const app = await buildApp();
    const req = await app.inject({
      method: 'POST',
      url: `${base}/request`,
      payload: { consent: true },
    });
    const rep = await app.inject({
      method: 'POST',
      url: `${base}/reviews/rev1/reply`,
      payload: { comment: 'hi' },
    });
    expect(req.statusCode).toBe(409);
    expect(req.json().error.code).toBe('NOT_AVAILABLE');
    expect(rep.statusCode).toBe(409);
    expect(m.linkUpsert).not.toHaveBeenCalled();
    expect(m.ticketCreate).not.toHaveBeenCalled();
    expect(m.reply).not.toHaveBeenCalled();
    expect(m.reserve).not.toHaveBeenCalled();
  });
});

describe('POST /request', () => {
  it('needs explicit consent', async () => {
    const res = await (await buildApp()).inject({
      method: 'POST',
      url: `${base}/request`,
      payload: {},
    });
    expect(res.statusCode).toBe(422);
    expect(m.linkUpsert).not.toHaveBeenCalled();
  });

  it('records consent, clears any old ids, asks the team once, returns steps + manager email', async () => {
    m.linkFind.mockResolvedValue(null);
    const res = await (await buildApp()).inject({
      method: 'POST',
      url: `${base}/request`,
      payload: { consent: true },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      state: 'REQUESTED',
      manager_email: 'kanchuki.reviews@example.com',
    });
    expect(m.linkUpsert.mock.calls[0]?.[0].update).toMatchObject({
      status: 'REQUESTED',
      gbp_account_id: null,
      gbp_location_id: null,
    });
    expect(m.ticketCreate.mock.calls[0]?.[0].data).toMatchObject({
      retailer_id: 'ret1',
      setup_item: 'google_business',
      ticket_type: 'GROWTH_SETUP',
    });
  });

  it('an open request already exists (unique index) is still a 201, not an error', async () => {
    m.linkFind.mockResolvedValue(null);
    m.ticketCreate.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    const res = await (await buildApp()).inject({
      method: 'POST',
      url: `${base}/request`,
      payload: { consent: true },
    });
    expect(res.statusCode).toBe(201);
  });

  it('an already LINKED retailer is left alone', async () => {
    const res = await (await buildApp()).inject({
      method: 'POST',
      url: `${base}/request`,
      payload: { consent: true },
    });
    expect(res.json().data.state).toBe('LINKED');
    expect(m.linkUpsert).not.toHaveBeenCalled();
  });
});

describe('GET /status', () => {
  const status = async (link: unknown) => {
    m.linkFind.mockResolvedValue(link);
    return (await (await buildApp()).inject({ method: 'GET', url: `${base}/status` })).json().data;
  };
  it('NOT_REQUESTED / REQUESTED / NEEDS_ACCESS show the Google steps', async () => {
    expect((await status(null)).state).toBe('NOT_REQUESTED');
    expect((await status({ status: 'UNLINKED' })).state).toBe('NOT_REQUESTED');
    const r = await status({ status: 'REQUESTED' });
    expect(r.state).toBe('REQUESTED');
    expect(r.manager_email).toBe('kanchuki.reviews@example.com');
    expect(r.steps.length).toBeGreaterThan(2);
    expect((await status({ status: 'NEEDS_ACCESS' })).state).toBe('NEEDS_ACCESS');
  });
  it('LINKED shows the summary and no manager email', async () => {
    const d = await status({ ...LINKED, location_title: 'Asha Boutique' });
    expect(d).toMatchObject({ state: 'LINKED', location_title: 'Asha Boutique', avg_rating: 4.5 });
    expect(d.manager_email).toBeUndefined();
  });
});

describe('GET /reviews — tenant isolation', () => {
  it('409 NOT_LINKED unless the caller own link is LINKED', async () => {
    m.linkFind.mockResolvedValue({ ...LINKED, status: 'REQUESTED' });
    const res = await (await buildApp()).inject({ method: 'GET', url: `${base}/reviews` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('NOT_LINKED');
  });

  it('reads only the caller rows of the caller link, hides rows from a previous location, maps a safe DTO', async () => {
    m.reviewFindMany.mockResolvedValue([
      {
        id: 'rev1',
        retailer_id: 'ret1',
        link_id: 'link1',
        google_review_id: 'g-secret',
        reviewer_name: 'Asha',
        star_rating: 5,
        comment: 'Lovely',
        google_created_at: new Date('2026-10-02T00:00:00Z'),
        reply_comment: null,
        reply_updated_at: null,
      },
    ]);
    const app = await buildApp({ retailerId: 'ret1' });
    const res = await app.inject({ method: 'GET', url: `${base}/reviews` });
    expect(m.linkFind.mock.calls[0]?.[0].where).toEqual({ retailer_id: 'ret1' });
    const where = m.reviewFindMany.mock.calls[0]?.[0].where;
    expect(where).toMatchObject({ retailer_id: 'ret1', link_id: 'link1' });
    expect(where.synced_at.gte).toEqual(LINKED.linked_at);
    expect(res.body).not.toContain('g-secret'); // Google's own id never leaves the server
    expect(res.json().data.reviews[0]).toMatchObject({ id: 'rev1', star_rating: 5, reply: null });
    expect(m.sync).toHaveBeenCalledWith({
      id: 'link1',
      retailer_id: 'ret1',
      gbp_account_id: 'acc1',
      gbp_location_id: 'loc1',
    });
  });
});

describe('POST /reviews/:id/reply', () => {
  const reply = (app: App, id = 'rev1', comment: unknown = 'Thank you!') =>
    app.inject({ method: 'POST', url: `${base}/reviews/${id}/reply`, payload: { comment } });

  it('only records the reply Google confirmed, counts quota once, audits', async () => {
    const res = await reply(await buildApp());
    expect(res.statusCode).toBe(200);
    expect(m.reply).toHaveBeenCalledWith('acc1', 'loc1', 'g1', 'Thank you!');
    expect(m.reviewUpdate.mock.calls[0]?.[0].data).toMatchObject({ reply_comment: 'Thank you!' });
    expect(m.reserve).toHaveBeenCalledTimes(1);
    expect(m.refund).not.toHaveBeenCalled();
    expect(m.auditCreate.mock.calls[0]?.[0].data).toMatchObject({
      action: 'reply',
      resource_type: 'GbpReview',
    });
  });

  it("a review that is not in the caller's own link is a 404 and Google is never called", async () => {
    m.reviewFindFirst.mockResolvedValue(null);
    const res = await reply(await buildApp({ retailerId: 'retA' }), 'someone-elses');
    expect(res.statusCode).toBe(404);
    expect(m.reviewFindFirst.mock.calls[0]?.[0].where).toMatchObject({
      id: 'someone-elses',
      retailer_id: 'retA',
    });
    expect(m.reply).not.toHaveBeenCalled();
  });

  it('over quota → refused BEFORE Google is called', async () => {
    m.reserve.mockRejectedValue(new Error('limit'));
    const res = await reply(await buildApp());
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(m.reply).not.toHaveBeenCalled();
    expect(m.reviewUpdate).not.toHaveBeenCalled();
  });

  it('Google refuses (we lost Manager access) → 409, state flips, NOTHING recorded or counted', async () => {
    m.reply.mockRejectedValue(new GbpError('NEEDS_ACCESS', 'no access'));
    const res = await reply(await buildApp());
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('GOOGLE_ACCESS');
    expect(m.linkUpdate.mock.calls[0]?.[0].data).toMatchObject({ status: 'NEEDS_ACCESS' });
    expect(m.reviewUpdate).not.toHaveBeenCalled();
    expect(m.refund).toHaveBeenCalledTimes(1);
  });

  it('Google down → 502 and nothing recorded', async () => {
    m.reply.mockRejectedValue(new GbpError('UNAVAILABLE', 'down'));
    const res = await reply(await buildApp());
    expect(res.statusCode).toBe(502);
    expect(m.reviewUpdate).not.toHaveBeenCalled();
    expect(m.refund).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty or oversize reply', async () => {
    const app = await buildApp();
    expect((await reply(app, 'rev1', '   ')).statusCode).toBe(422);
    expect((await reply(app, 'rev1', 'x'.repeat(4097))).statusCode).toBe(422);
    expect(m.reply).not.toHaveBeenCalled();
  });
});

describe('DELETE /link', () => {
  it('ends only the caller link and frees the Google location', async () => {
    const res = await (await buildApp({ retailerId: 'retA' })).inject({
      method: 'DELETE',
      url: `${base}/link`,
    });
    expect(res.statusCode).toBe(204);
    const arg = m.linkUpdateMany.mock.calls[0]?.[0];
    expect(arg.where).toMatchObject({ retailer_id: 'retA' });
    expect(arg.data).toMatchObject({
      status: 'UNLINKED',
      gbp_account_id: null,
      gbp_location_id: null,
    });
  });
});
