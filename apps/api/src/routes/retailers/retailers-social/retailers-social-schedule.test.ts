import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';

// ── mocks ────────────────────────────────────────────────────────
const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    hasFeature: fn(),
    effectiveLimit: fn(),
    getQuotaStatus: fn(),
    accountFindMany: fn(),
    postFindMany: fn(),
    usageFindUnique: fn(),
    accountFindFirst: fn(),
    planFindFirst: fn(),
    planFindFirstOrThrow: fn(),
    planFindMany: fn(),
    planCreate: fn(),
    planUpdateMany: fn(),
    planCount: fn(),
    postFindFirst: fn(),
    postFindFirstOrThrow: fn(),
    postCreate: fn(),
    postUpdateMany: fn(),
    itemFindFirst: fn(),
    itemFindMany: fn(),
    itemUpdate: fn(),
    itemDelete: fn(),
    itemCount: fn(),
    socialPostFindMany: fn(),
    productFindMany: fn(),
    productFindFirst: fn(),
    photoFindFirst: fn(),
    retailerFindUniqueOrThrow: fn(),
  };
});

vi.mock('../../../lib/features.js', () => ({ hasFeature: m.hasFeature }));
vi.mock('../../../lib/quota.js', () => ({
  effectiveLimit: m.effectiveLimit,
  getQuotaStatus: m.getQuotaStatus,
  periodStart: () => new Date('2026-10-01T00:00:00Z'),
}));

vi.mock('@kanchuki/db', () => {
  const prisma: Record<string, unknown> = {
    socialAccount: { findFirst: m.accountFindFirst, findMany: m.accountFindMany },
    usageCounter: { findUnique: m.usageFindUnique },
    postSchedulePlan: {
      findFirst: m.planFindFirst,
      findFirstOrThrow: m.planFindFirstOrThrow,
      findMany: m.planFindMany,
      create: m.planCreate,
      updateMany: m.planUpdateMany,
      count: m.planCount,
    },
    scheduledPost: {
      findMany: m.postFindMany,
      findFirst: m.postFindFirst,
      findFirstOrThrow: m.postFindFirstOrThrow,
      create: m.postCreate,
      updateMany: m.postUpdateMany,
    },
    scheduledPostItem: {
      findFirst: m.itemFindFirst,
      findMany: m.itemFindMany,
      update: m.itemUpdate,
      delete: m.itemDelete,
      count: m.itemCount,
    },
    socialPost: { findMany: m.socialPostFindMany },
    product: { findMany: m.productFindMany, findFirst: m.productFindFirst },
    productPhoto: { findFirst: m.photoFindFirst },
    retailer: { findUniqueOrThrow: m.retailerFindUniqueOrThrow },
  };
  prisma.$transaction = async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma);
  return { prisma };
});

const { retailersSocialScheduleRoutes } = await import('./retailers-social-schedule.js');

// ── fixtures ─────────────────────────────────────────────────────
const RETAILER = 'retailer_1';
const FB = { id: 'fb_1', platform: 'FACEBOOK' as const };

async function buildApp(staffRole: 'manager' | 'salesperson' | null = null) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('staffRole', null);
  app.decorateRequest('catalogDelegate', null);
  app.decorateRequest('supportDelegate', null);
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER;
    (request as any).staffRole = staffRole;
  });
  await app.register(retailersSocialScheduleRoutes, { prefix: '/v1/retailers' });
  return app;
}

const product = (id: string, category = 'Sarees') => ({
  id,
  name: `Name ${id}`,
  category,
  price_min: 150000,
  photos: [{ id: `ph_${id}`, is_primary: true }],
});

const planBody = (over: Record<string, unknown> = {}) => ({
  social_account_id: 'fb_1',
  weekdays: [1, 2, 3, 4, 5, 6, 0],
  batch_ranges: Object.fromEntries(
    [0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), { min: 2, max: 3 }]),
  ),
  post_time: '19:30',
  horizon: '1W',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.hasFeature.mockResolvedValue(true);
  m.effectiveLimit.mockResolvedValue({ limit: 1, period: 'LIFETIME' });
  m.accountFindFirst.mockResolvedValue(FB);
  m.planCount.mockResolvedValue(0);
  m.planFindMany.mockResolvedValue([]);
  m.socialPostFindMany.mockResolvedValue([]);
  m.itemFindMany.mockResolvedValue([]);
  m.retailerFindUniqueOrThrow.mockResolvedValue({ shop_name: 'Anita Boutique' });
  m.productFindMany.mockResolvedValue(Array.from({ length: 12 }, (_, i) => product(`p${i}`)));
  m.planCreate.mockResolvedValue({ id: 'plan_1' });
  m.postCreate.mockResolvedValue({ id: 'sp_1' });
  m.planFindFirstOrThrow.mockResolvedValue({ id: 'plan_1', status: 'DRAFT', posts: [] });
});

// ── create ───────────────────────────────────────────────────────
describe('POST /plans', () => {
  it('fails CLOSED when SOCIAL_SCHEDULER is off — nothing is written', async () => {
    m.hasFeature.mockResolvedValue(false);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/social/schedule/plans',
      payload: planBody(),
    });
    expect(res.statusCode).toBe(402);
    expect(m.planCreate).not.toHaveBeenCalled();
    expect(m.hasFeature).toHaveBeenCalledWith(RETAILER, 'SOCIAL_SCHEDULER');
  });

  it('is owner-only: a manager gets 403', async () => {
    const app = await buildApp('manager');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/social/schedule/plans',
      payload: planBody(),
    });
    expect(res.statusCode).toBe(403);
    expect(m.planCreate).not.toHaveBeenCalled();
  });

  it('enforces max active plans per platform', async () => {
    m.planCount.mockResolvedValue(1);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/social/schedule/plans',
      payload: planBody(),
    });
    expect(res.statusCode).toBe(402);
    expect(m.planCount).toHaveBeenCalledWith({
      where: expect.objectContaining({ retailer_id: RETAILER, platform: 'FACEBOOK' }),
    });
    expect(m.planCreate).not.toHaveBeenCalled();
  });

  it('unlimited (-1) skips the plan count', async () => {
    m.effectiveLimit.mockResolvedValue({ limit: -1, period: 'LIFETIME' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/social/schedule/plans',
      payload: planBody(),
    });
    expect(res.statusCode).toBe(200);
    expect(m.planCount).not.toHaveBeenCalled();
  });

  it('builds DRAFT posts with ≤10 slides, retailer-scoped, AI-free default caption', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/social/schedule/plans',
      payload: planBody(),
    });
    expect(res.statusCode).toBe(200);
    expect(m.planCreate.mock.calls[0]?.[0].data).toMatchObject({
      retailer_id: RETAILER,
      social_account_id: 'fb_1',
      platform: 'FACEBOOK',
      status: 'DRAFT',
    });
    expect(m.postCreate).toHaveBeenCalled();
    for (const [arg] of m.postCreate.mock.calls) {
      expect(arg.data.status).toBe('DRAFT');
      expect(arg.data.retailer_id).toBe(RETAILER);
      expect(arg.data.items.create.length).toBeLessThanOrEqual(10);
      expect(arg.data.caption).toContain('Anita Boutique');
    }
    // product query is retailer-scoped, in-stock, alive
    expect(m.productFindMany.mock.calls[0]?.[0].where).toMatchObject({
      retailer_id: RETAILER,
      status: 'AVAILABLE',
      deleted_at: null,
    });
  });

  it('excludes products posted in the last 14 days and products already queued', async () => {
    m.socialPostFindMany.mockResolvedValue([{ product_ids: ['p0', 'p1'] }]);
    m.itemFindMany.mockResolvedValue([{ product_id: 'p2' }]);
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/social/schedule/plans',
      payload: planBody(),
    });
    const used = m.postCreate.mock.calls.flatMap(([a]) =>
      a.data.items.create.map((i: { product_id: string }) => i.product_id),
    );
    expect(used).not.toContain('p0');
    expect(used).not.toContain('p1');
    expect(used).not.toContain('p2');
  });

  it('422 when no eligible product has a photo / is in stock', async () => {
    m.productFindMany.mockResolvedValue([]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/social/schedule/plans',
      payload: planBody(),
    });
    expect(res.statusCode).toBe(422);
    expect(m.planCreate).not.toHaveBeenCalled();
  });

  it('422 when a selected weekday has no batch range', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/social/schedule/plans',
      payload: planBody({ weekdays: [1], batch_ranges: { '2': { min: 1, max: 2 } } }),
    });
    expect(res.statusCode).toBe(422);
  });

  it('422 when the batch range exceeds the IG cap of 10', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/social/schedule/plans',
      payload: planBody({ weekdays: [1], batch_ranges: { '1': { min: 5, max: 12 } } }),
    });
    expect(res.statusCode).toBe(422);
  });

  it("422 when the account is not the caller's (findFirst is retailer-scoped)", async () => {
    m.accountFindFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/social/schedule/plans',
      payload: planBody(),
    });
    expect(res.statusCode).toBe(422);
    expect(m.accountFindFirst.mock.calls[0]?.[0].where).toMatchObject({
      retailer_id: RETAILER,
      is_active: true,
    });
  });
});

// ── confirm ──────────────────────────────────────────────────────
describe('POST /plans/:id/confirm', () => {
  const url = '/v1/retailers/me/social/schedule/plans/plan_1/confirm';
  beforeEach(() => {
    m.planFindFirst.mockResolvedValue({
      id: 'plan_1',
      status: 'DRAFT',
      platform: 'FACEBOOK',
      social_account_id: 'fb_1',
    });
    m.postUpdateMany.mockResolvedValue({ count: 3 });
    m.planUpdateMany.mockResolvedValue({ count: 1 });
    m.itemCount.mockResolvedValue(9);
  });

  it('activates the plan and readies its posts', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.posts).toBe(3);
    expect(m.planUpdateMany.mock.calls[0]?.[0].data.status).toBe('ACTIVE');
  });

  it('re-checks the feature flag at confirm (downgrade between draft and confirm)', async () => {
    m.hasFeature.mockResolvedValue(false);
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url });
    expect(res.statusCode).toBe(402);
    expect(m.planUpdateMany).not.toHaveBeenCalled();
  });

  it('409 when already confirmed', async () => {
    m.planFindFirst.mockResolvedValue({
      id: 'plan_1',
      status: 'ACTIVE',
      platform: 'FACEBOOK',
      social_account_id: 'fb_1',
    });
    const app = await buildApp();
    expect((await app.inject({ method: 'POST', url })).statusCode).toBe(409);
  });

  it('manager cannot confirm', async () => {
    const app = await buildApp('manager');
    expect((await app.inject({ method: 'POST', url })).statusCode).toBe(403);
  });

  it('404 for another retailer’s plan (lookup carries retailer_id)', async () => {
    m.planFindFirst.mockResolvedValue(null);
    const app = await buildApp();
    expect((await app.inject({ method: 'POST', url })).statusCode).toBe(404);
    expect(m.planFindFirst.mock.calls[0]?.[0].where).toMatchObject({
      id: 'plan_1',
      retailer_id: RETAILER,
    });
  });
});

// ── post edit (manager allowed) ──────────────────────────────────
describe('PATCH /posts/:id', () => {
  const url = '/v1/retailers/me/social/schedule/posts/sp_1';
  const row = (status: string, over: Record<string, unknown> = {}) => ({
    id: 'sp_1',
    status,
    scheduled_at: new Date(Date.now() + 3_600_000),
    ...over,
  });
  beforeEach(() => {
    m.postUpdateMany.mockResolvedValue({ count: 1 });
    m.postFindFirstOrThrow.mockResolvedValue({ id: 'sp_1' });
  });

  it('a manager can edit a caption', async () => {
    m.postFindFirst.mockResolvedValue(row('READY'));
    const app = await buildApp('manager');
    const res = await app.inject({ method: 'PATCH', url, payload: { caption: 'Fresh arrivals!' } });
    expect(res.statusCode).toBe(200);
    expect(m.postUpdateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'sp_1', retailer_id: RETAILER, status: 'READY' },
      data: { caption: 'Fresh arrivals!' },
    });
  });

  it('CAS: loses to a tick that claimed the row in between → 409', async () => {
    m.postFindFirst.mockResolvedValue(row('READY'));
    m.postUpdateMany.mockResolvedValue({ count: 0 });
    const app = await buildApp();
    const res = await app.inject({ method: 'PATCH', url, payload: { action: 'skip' } });
    expect(res.statusCode).toBe(409);
  });

  it.each(['PUBLISHING', 'POSTED', 'SKIPPED'])('cannot change a %s post', async (status) => {
    m.postFindFirst.mockResolvedValue(row(status));
    const app = await buildApp();
    const res = await app.inject({ method: 'PATCH', url, payload: { caption: 'x' } });
    expect(res.statusCode).toBe(409);
    expect(m.postUpdateMany).not.toHaveBeenCalled();
  });

  it('retry only from FAILED/MISSED; resets attempts and re-queues a past slot', async () => {
    m.postFindFirst.mockResolvedValue(row('READY'));
    const app = await buildApp();
    expect(
      (await app.inject({ method: 'PATCH', url, payload: { action: 'retry' } })).statusCode,
    ).toBe(409);

    m.postFindFirst.mockResolvedValue(
      row('MISSED', { scheduled_at: new Date(Date.now() - 3 * 3_600_000) }),
    );
    const ok = await app.inject({ method: 'PATCH', url, payload: { action: 'retry' } });
    expect(ok.statusCode).toBe(200);
    const data = m.postUpdateMany.mock.calls.at(-1)?.[0].data;
    expect(data).toMatchObject({ status: 'READY', attempts: 0, error: null });
    expect(data.scheduled_at.getTime()).toBeGreaterThan(Date.now() - 5_000);
  });

  it('stays retailer-scoped for any caller (foreign post → 404)', async () => {
    m.postFindFirst.mockResolvedValue(null);
    const app = await buildApp('salesperson');
    const res = await app.inject({ method: 'PATCH', url, payload: { caption: 'x' } });
    expect(res.statusCode).toBe(404);
    expect(m.postFindFirst.mock.calls[0]?.[0].where).toMatchObject({ retailer_id: RETAILER });
  });
});

// ── pause / resume ───────────────────────────────────────────────
describe('PATCH /plan-state/:id', () => {
  const url = '/v1/retailers/me/social/schedule/plan-state/plan_1';
  beforeEach(() => {
    m.planUpdateMany.mockResolvedValue({ count: 1 });
    m.planFindFirstOrThrow.mockResolvedValue({ id: 'plan_1' });
  });

  it('manager can pause a running plan', async () => {
    m.planFindFirst.mockResolvedValue({ id: 'plan_1', status: 'ACTIVE', platform: 'FACEBOOK' });
    const app = await buildApp('manager');
    const res = await app.inject({ method: 'PATCH', url, payload: { status: 'PAUSED' } });
    expect(res.statusCode).toBe(200);
    expect(m.planUpdateMany.mock.calls[0]?.[0].data.status).toBe('PAUSED');
  });

  it('resume re-checks the feature flag (fails closed)', async () => {
    m.planFindFirst.mockResolvedValue({ id: 'plan_1', status: 'PAUSED', platform: 'FACEBOOK' });
    m.hasFeature.mockResolvedValue(false);
    const app = await buildApp();
    const res = await app.inject({ method: 'PATCH', url, payload: { status: 'ACTIVE' } });
    expect(res.statusCode).toBe(402);
    expect(m.planUpdateMany).not.toHaveBeenCalled();
  });

  it('cannot resume a DRAFT plan', async () => {
    m.planFindFirst.mockResolvedValue({ id: 'plan_1', status: 'DRAFT', platform: 'FACEBOOK' });
    const app = await buildApp();
    expect(
      (await app.inject({ method: 'PATCH', url, payload: { status: 'ACTIVE' } })).statusCode,
    ).toBe(409);
  });
});

// ── slides ───────────────────────────────────────────────────────
describe('slide edit / remove (owner-only)', () => {
  const url = '/v1/retailers/me/social/schedule/items/it_1';
  const item = (postStatus = 'DRAFT') => ({
    id: 'it_1',
    product_id: 'p1',
    scheduled_post: { id: 'sp_1', status: postStatus },
  });

  it('manager is refused', async () => {
    const app = await buildApp('manager');
    expect((await app.inject({ method: 'DELETE', url })).statusCode).toBe(403);
  });

  it('swap: rejects a product already in the post', async () => {
    m.itemFindFirst.mockResolvedValueOnce(item()).mockResolvedValueOnce({ id: 'other' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url,
      payload: { action: 'swap', product_id: 'p9' },
    });
    expect(res.statusCode).toBe(422);
    expect(m.itemUpdate).not.toHaveBeenCalled();
  });

  it('swap: product must be in stock, alive, retailer-owned, with a photo', async () => {
    m.itemFindFirst.mockResolvedValueOnce(item()).mockResolvedValueOnce(null);
    m.productFindFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url,
      payload: { action: 'swap', product_id: 'p9' },
    });
    expect(res.statusCode).toBe(422);
    expect(m.productFindFirst.mock.calls[0]?.[0].where).toMatchObject({
      retailer_id: RETAILER,
      status: 'AVAILABLE',
      deleted_at: null,
    });
  });

  it('other photo: must belong to the slide’s product and retailer', async () => {
    m.itemFindFirst.mockResolvedValue(item());
    m.photoFindFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url,
      payload: { action: 'photo', photo_id: 'foreign' },
    });
    expect(res.statusCode).toBe(422);
    expect(m.photoFindFirst.mock.calls[0]?.[0].where).toMatchObject({
      product_id: 'p1',
      retailer_id: RETAILER,
    });
  });

  it('cannot edit a slide of a post that is PUBLISHING', async () => {
    m.itemFindFirst.mockResolvedValue(item('PUBLISHING'));
    const app = await buildApp();
    expect((await app.inject({ method: 'DELETE', url })).statusCode).toBe(409);
    expect(m.itemDelete).not.toHaveBeenCalled();
  });

  it('removing the last slide skips the post', async () => {
    m.itemFindFirst.mockResolvedValue(item());
    m.itemFindMany.mockResolvedValue([]);
    m.postUpdateMany.mockResolvedValue({ count: 1 });
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url });
    expect(res.statusCode).toBe(200);
    expect(m.postUpdateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'sp_1', retailer_id: RETAILER },
      data: { status: 'SKIPPED' },
    });
  });

  it('removing a middle slide closes the position gap (two-phase)', async () => {
    m.itemFindFirst.mockResolvedValue(item());
    m.itemFindMany.mockResolvedValue([{ id: 'a' }, { id: 'c' }]);
    const app = await buildApp();
    await app.inject({ method: 'DELETE', url });
    const positions = m.itemUpdate.mock.calls.map(([a]) => [a.where.id, a.data.position]);
    expect(positions).toEqual([
      ['a', 10],
      ['c', 11],
      ['a', 0],
      ['c', 1],
    ]);
  });
});

// ── end plan ─────────────────────────────────────────────────────
describe('POST /plans/:id/end', () => {
  it('skips editable posts only (never PUBLISHING) and ends the plan', async () => {
    m.planFindFirst.mockResolvedValue({ id: 'plan_1', status: 'ACTIVE' });
    m.postUpdateMany.mockResolvedValue({ count: 4 });
    m.planUpdateMany.mockResolvedValue({ count: 1 });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/social/schedule/plans/plan_1/end',
    });
    expect(res.statusCode).toBe(200);
    const w = m.postUpdateMany.mock.calls[0]?.[0].where;
    expect(w.status.in).toEqual(['DRAFT', 'READY', 'FAILED', 'MISSED']);
    expect(w.status.in).not.toContain('PUBLISHING');
  });
});

// ── status card (§4a) ────────────────────────────────────────────
describe('GET /status', () => {
  const DAY = 86_400_000;
  const get = async (role: 'manager' | 'salesperson' | null = null) =>
    (await buildApp(role)).inject({
      method: 'GET',
      url: '/v1/retailers/me/social/schedule/status',
    });

  beforeEach(() => {
    m.accountFindMany.mockResolvedValue([
      {
        id: 'fb_1',
        platform: 'FACEBOOK',
        platform_account_name: 'Anita Boutique',
        is_active: true,
        token_expires_at: new Date(Date.now() + 3 * DAY),
      },
    ]);
    m.planFindMany.mockResolvedValue([
      {
        id: 'pl_1',
        social_account_id: 'fb_1',
        status: 'ACTIVE',
        pause_reason: null,
        post_time: '19:30',
      },
    ]);
    m.postFindMany.mockResolvedValueOnce([
      {
        id: 'sp_1',
        plan_id: 'pl_1',
        scheduled_at: new Date(Date.now() + DAY),
        _count: { items: 4 },
      },
    ]);
    m.postFindMany.mockResolvedValueOnce([]);
    m.effectiveLimit.mockResolvedValue({ limit: -1, period: 'MONTH' });
    m.usageFindUnique.mockResolvedValue({ count: 7 });
    m.getQuotaStatus.mockResolvedValue({
      used: 2,
      limit: 30,
      remaining: 28,
      period: 'MONTH',
      unlimited: false,
    });
  });

  it('derives token state, unlimited allowance, next post and studio quota', async () => {
    const res = await get();
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.platforms[0]).toMatchObject({
      platform: 'FACEBOOK',
      token: { state: 'EXPIRING', days_left: 3 },
      plan: { id: 'pl_1', status: 'ACTIVE' },
      next_post: { id: 'sp_1', slides: 4 },
    });
    // seeded -1 must read as unlimited, not as a tier default
    expect(d.allowance).toEqual({ used: 7, limit: null, period: 'MONTH' });
    expect(d.studio_shoots).toMatchObject({ included: true, remaining: 28 });
    expect(d.needs_attention).toBe(true); // token expiring
  });

  it('an inactive account with a paused plan stays visible as EXPIRED', async () => {
    m.accountFindMany.mockResolvedValue([
      {
        id: 'fb_1',
        platform: 'FACEBOOK',
        platform_account_name: 'A',
        is_active: false,
        token_expires_at: new Date(Date.now() + 30 * 86_400_000),
      },
    ]);
    m.planFindMany.mockResolvedValue([
      {
        id: 'pl_1',
        social_account_id: 'fb_1',
        status: 'PAUSED',
        pause_reason: 'Paused',
        post_time: '19:30',
      },
    ]);
    const d = (await get()).json().data;
    expect(d.platforms[0]).toMatchObject({
      token: { state: 'EXPIRED' },
      plan: { status: 'PAUSED' },
    });
    expect(d.needs_attention).toBe(true);
    // the query must ask for accounts that still carry a live plan
    const where = m.accountFindMany.mock.calls.at(-1)?.[0]?.where;
    expect(JSON.stringify(where)).toContain('schedule_plans');
  });

  it('flags a paused plan and surfaces stored failure reasons', async () => {
    m.accountFindMany.mockResolvedValue([
      {
        id: 'fb_1',
        platform: 'FACEBOOK',
        platform_account_name: 'A',
        is_active: true,
        token_expires_at: null,
      },
    ]);
    m.planFindMany.mockResolvedValue([
      {
        id: 'pl_1',
        social_account_id: 'fb_1',
        status: 'PAUSED',
        pause_reason: 'Paused — Facebook token expired',
        post_time: '19:30',
      },
    ]);
    m.postFindMany.mockReset();
    m.postFindMany.mockResolvedValueOnce([]);
    m.postFindMany.mockResolvedValueOnce([
      {
        id: 'sp_9',
        plan_id: 'pl_1',
        status: 'FAILED',
        scheduled_at: new Date(),
        error: 'Facebook connection expired. Reconnect to resume posting.',
        plan: { platform: 'FACEBOOK' },
      },
    ]);
    const d = (await get()).json().data;
    expect(d.platforms[0].plan.pause_reason).toBe('Paused — Facebook token expired');
    expect(d.failures[0]).toMatchObject({ platform: 'FACEBOOK', status: 'FAILED' });
    expect(d.needs_attention).toBe(true);
  });

  it('studio shoots not included when the plan limit is 0', async () => {
    m.getQuotaStatus.mockResolvedValue({
      used: 0,
      limit: 0,
      remaining: 0,
      period: 'MONTH',
      unlimited: false,
    });
    expect((await get()).json().data.studio_shoots.included).toBe(false);
  });

  it('manager can read it', async () => {
    expect((await get('manager')).statusCode).toBe(200);
  });
});
