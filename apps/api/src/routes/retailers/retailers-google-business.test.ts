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
  reserveTagging: vi.fn(),
  settle: vi.fn(),
  draft: vi.fn(),
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
vi.mock('../../lib/ai-usage.js', () => ({ reserveTaggingQuota: m.reserveTagging }));
vi.mock('@kanchuki/ai', () => ({ generateReviewReplyDraft: m.draft }));
vi.mock('../team.js', () => ({ routeTicket: m.routeTicket }));
vi.mock('../../lib/google-business.js', async (orig) => ({
  ...(await orig<typeof import('../../lib/google-business.js')>()),
  replyToReview: m.reply,
  gbpManagerEmail: m.managerEmail,
}));

import { GbpError } from '../../lib/google-business.js';
import { retailersGoogleBusinessRoutes } from './retailers-google-business.js';

async function buildApp(
  opts: { retailerId?: string; staffRole?: string | null; delegate?: boolean } = {},
) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('staffRole', null);
  app.decorateRequest('staffId', null);
  app.decorateRequest('catalogDelegate', null);
  app.decorateRequest('supportDelegate', null);
  app.addHook('preHandler', async (request) => {
    request.retailerId = opts.retailerId ?? 'ret1';
    request.staffRole = (opts.staffRole ?? null) as never;
    request.staffId = opts.staffRole ? 'staff1' : null;
    // A delegated session has staffRole null, exactly like an owner, but is not one.
    if (opts.delegate) request.catalogDelegate = {} as never;
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
  m.settle.mockResolvedValue(undefined);
  m.reserveTagging.mockResolvedValue({ onProviderUsed: vi.fn(), settle: m.settle });
  m.draft.mockResolvedValue('Thank you so much, we hope to see you again!');
  m.reviewFindFirst.mockResolvedValue({
    id: 'rev1',
    google_review_id: 'g1',
    star_rating: 5,
    comment: 'Lovely suits',
    reviewer_name: 'Priya Sharma',
  });
  m.reply.mockResolvedValue({ comment: 'Thank you!', updatedAt: new Date('2026-10-05T00:00:00Z') });
});

const payload = { consent: true, comment: 'hi' };

describe('owner-only: consent and unlink never reach a manager', () => {
  it.each([
    ['POST', `${base}/request`],
    ['DELETE', `${base}/link`],
  ] as const)('manager gets 403 on %s %s and nothing is touched', async (method, url) => {
    const app = await buildApp({ staffRole: 'manager' });
    const res = await app.inject({ method, url, payload });
    expect(res.statusCode).toBe(403);
    expect(m.linkFind).not.toHaveBeenCalled();
    expect(m.linkUpsert).not.toHaveBeenCalled();
    expect(m.linkUpdateMany).not.toHaveBeenCalled();
  });
});

const REVIEW_ROUTES = [
  ['GET', `${base}/status`],
  ['GET', `${base}/reviews`],
  ['POST', `${base}/reviews/rev1/reply`],
  ['POST', `${base}/reviews/rev1/draft-reply`],
] as const;

describe('reviews + replies: owner and manager only', () => {
  it.each(REVIEW_ROUTES)(
    'a salesperson gets 403 on %s %s and nothing is touched',
    async (method, url) => {
      const app = await buildApp({ staffRole: 'salesperson' });
      const res = await app.inject({ method, url, payload });
      expect(res.statusCode).toBe(403);
      expect(m.linkFind).not.toHaveBeenCalled();
      expect(m.reply).not.toHaveBeenCalled();
      expect(m.draft).not.toHaveBeenCalled();
    },
  );

  it.each(REVIEW_ROUTES)(
    'a delegated session (staffRole null, not an owner) gets 403 on %s %s',
    async (method, url) => {
      const app = await buildApp({ delegate: true });
      const res = await app.inject({ method, url, payload });
      expect(res.statusCode).toBe(403);
      expect(m.linkFind).not.toHaveBeenCalled();
      expect(m.reply).not.toHaveBeenCalled();
      expect(m.draft).not.toHaveBeenCalled();
    },
  );

  it('a manager can read status and reviews', async () => {
    const app = await buildApp({ staffRole: 'manager' });
    expect((await app.inject({ method: 'GET', url: `${base}/status` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `${base}/reviews` })).statusCode).toBe(200);
  });

  it('a manager can reply; the audit row says who', async () => {
    const app = await buildApp({ staffRole: 'manager' });
    const res = await app.inject({
      method: 'POST',
      url: `${base}/reviews/rev1/reply`,
      payload: { comment: 'Thank you!' },
    });
    expect(res.statusCode).toBe(200);
    expect(m.reply).toHaveBeenCalledTimes(1);
    expect(m.auditCreate.mock.calls[0]?.[0].data.metadata).toMatchObject({
      by: 'manager',
      staff_id: 'staff1',
    });
  });

  // Audit minor E: Google's limit is bytes, and Devanagari is 3 bytes per character.
  it('refuses a Hindi reply over 4096 bytes with a 422 before calling Google', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `${base}/reviews/rev1/reply`,
      payload: { comment: 'ध'.repeat(1400) },
    });
    expect(res.statusCode).toBe(422);
    expect(m.reply).not.toHaveBeenCalled();
  });

  it('accepts a Hindi reply just under 4096 bytes', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `${base}/reviews/rev1/reply`,
      payload: { comment: 'ध'.repeat(1365) },
    });
    expect(res.statusCode).toBe(200);
    expect(m.reply).toHaveBeenCalledTimes(1);
  });

  it('an owner reply is audited as the owner', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: `${base}/reviews/rev1/reply`,
      payload: { comment: 'Hi' },
    });
    expect(m.auditCreate.mock.calls[0]?.[0].data.metadata).toMatchObject({
      by: 'owner',
      staff_id: null,
    });
  });
});

describe('POST /reviews/:id/draft-reply', () => {
  const draft = (app: App, id = 'rev1') =>
    app.inject({ method: 'POST', url: `${base}/reviews/${id}/draft-reply` });

  it('AI draft: returns text for the retailer to edit, posts NOTHING to Google, meters the call', async () => {
    m.retailerFind.mockResolvedValue({ shop_name: 'Asha Boutique' });
    const res = await draft(await buildApp({ staffRole: 'manager' }));
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      draft: 'Thank you so much, we hope to see you again!',
      source: 'ai',
    });
    expect(m.draft.mock.calls[0]?.[0]).toMatchObject({
      storeName: 'Asha Boutique',
      reviewerName: 'Priya Sharma',
      starRating: 5,
      comment: 'Lovely suits',
    });
    expect(m.reserveTagging).toHaveBeenCalledWith('ret1');
    expect(m.settle).toHaveBeenCalledTimes(1);
    expect(m.reply).not.toHaveBeenCalled();
    expect(m.reviewUpdate).not.toHaveBeenCalled();
    expect(m.reserve).not.toHaveBeenCalled(); // a draft does not spend a reply slot
  });

  it('is scoped to the caller: a review outside their own link is a 404 and the model is never called', async () => {
    m.reviewFindFirst.mockResolvedValue(null);
    const res = await draft(await buildApp({ retailerId: 'retA' }), 'someone-elses');
    expect(res.statusCode).toBe(404);
    expect(m.reviewFindFirst.mock.calls[0]?.[0].where).toMatchObject({
      id: 'someone-elses',
      retailer_id: 'retA',
    });
    expect(m.draft).not.toHaveBeenCalled();
    expect(m.reserveTagging).not.toHaveBeenCalled();
  });

  it('feature off / not approved → refused like every other route, no AI spend', async () => {
    m.available.mockResolvedValue(false);
    const res = await draft(await buildApp());
    expect(res.statusCode).toBe(409);
    expect(m.draft).not.toHaveBeenCalled();
  });

  it('AI down → a plain template, honestly labelled; the quota is still settled', async () => {
    m.retailerFind.mockResolvedValue({ shop_name: 'Asha Boutique' });
    m.draft.mockRejectedValue(new Error('provider down'));
    const res = await draft(await buildApp());
    expect(res.statusCode).toBe(200);
    expect(res.json().data.source).toBe('template');
    expect(res.json().data.draft).toContain('Priya');
    expect(m.settle).toHaveBeenCalledTimes(1);
  });

  it('AI quota spent → the same template, no model call', async () => {
    m.reserveTagging.mockRejectedValue(new Error('quota'));
    const res = await draft(await buildApp());
    expect(res.json().data.source).toBe('template');
    expect(m.draft).not.toHaveBeenCalled();
  });

  it('the template apologises for a low rating and thanks for a high one', async () => {
    m.draft.mockRejectedValue(new Error('down'));
    m.reviewFindFirst.mockResolvedValue({
      id: 'rev1',
      google_review_id: 'g1',
      star_rating: 2,
      comment: 'Late',
      reviewer_name: null,
    });
    const low = (await draft(await buildApp())).json().data.draft as string;
    expect(low).toMatch(/sorry/i);
    m.reviewFindFirst.mockResolvedValue({
      id: 'rev1',
      google_review_id: 'g1',
      star_rating: 5,
      comment: null,
      reviewer_name: null,
    });
    const high = (await draft(await buildApp())).json().data.draft as string;
    expect(high).toMatch(/thank/i);
    expect(high).not.toMatch(/sorry/i);
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
    expect(d.sync_failed).toBe(false);
  });
  it('a failing sync is reported (sync_failed), without leaking the raw error code', async () => {
    const d = await status({ ...LINKED, review_count: null, last_error_code: 'UNAVAILABLE' });
    expect(d.sync_failed).toBe(true);
    expect(JSON.stringify(d)).not.toContain('UNAVAILABLE');
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

  it('summary tells a never-synced / failing link apart from a real zero', async () => {
    m.linkFind.mockResolvedValue({
      ...LINKED,
      review_count: null,
      last_error_code: 'NOT_APPROVED',
    });
    const res = await (await buildApp()).inject({ method: 'GET', url: `${base}/reviews` });
    expect(res.json().data.summary).toMatchObject({ review_count: null, sync_failed: true });
    m.linkFind.mockResolvedValue({ ...LINKED, review_count: 0, last_error_code: null });
    const ok = await (await buildApp()).inject({ method: 'GET', url: `${base}/reviews` });
    expect(ok.json().data.summary).toMatchObject({ review_count: 0, sync_failed: false });
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

  it('a review deleted on Google → 404 REVIEW_NOT_FOUND; the retailer keeps their Google tab', async () => {
    m.reply.mockRejectedValue(new GbpError('NOT_FOUND', 'gone'));
    const res = await reply(await buildApp());
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REVIEW_NOT_FOUND');
    expect(m.linkUpdate).not.toHaveBeenCalled();
    expect(m.reviewUpdate).not.toHaveBeenCalled();
    expect(m.refund).toHaveBeenCalledTimes(1);
  });

  it('Google accepted the reply but our own write fails → still 200, slot stays spent, no duplicate retry', async () => {
    m.reviewUpdate.mockRejectedValue(new Error('db down'));
    m.auditCreate.mockRejectedValue(new Error('db down'));
    const res = await reply(await buildApp());
    expect(res.statusCode).toBe(200);
    expect(res.json().data.reply.comment).toBe('Thank you!');
    expect(m.refund).not.toHaveBeenCalled();
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
