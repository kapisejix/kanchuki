import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';

const m = vi.hoisted(() => ({
  itemFindFirst: vi.fn(),
  itemFindMany: vi.fn(),
  itemUpdateMany: vi.fn(),
  postFindFirst: vi.fn(),
  planFindFirst: vi.fn(),
  planUpdateMany: vi.fn(),
  styleItemNow: vi.fn(),
}));

vi.mock('../../../lib/schedule-render.js', () => ({ styleItemNow: m.styleItemNow }));
vi.mock('@kanchuki/ai', () => ({ publicUrl: (k: string) => `https://cdn/${k}` }));
vi.mock('@kanchuki/db', () => {
  const prisma: Record<string, unknown> = {
    scheduledPostItem: {
      findFirst: m.itemFindFirst,
      findMany: m.itemFindMany,
      updateMany: m.itemUpdateMany,
    },
    scheduledPost: { findFirst: m.postFindFirst },
    postSchedulePlan: { findFirst: m.planFindFirst, updateMany: m.planUpdateMany },
  };
  prisma.$transaction = async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma);
  return { prisma };
});

const { retailersSocialScheduleStyleRoutes } = await import('./retailers-social-schedule-style.js');

async function buildApp(staffRole: 'manager' | 'salesperson' | null = null) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('staffRole', null);
  app.decorateRequest('catalogDelegate', null);
  app.decorateRequest('supportDelegate', null);
  app.addHook('preHandler', async (request) => {
    request.retailerId = 'r1';
    (request as any).staffRole = staffRole;
  });
  await app.register(retailersSocialScheduleStyleRoutes, { prefix: '/v1/retailers' });
  return app;
}

const BASE = '/v1/retailers/me/social/schedule';
const post = async (app: Awaited<ReturnType<typeof buildApp>>, url: string, payload: unknown) =>
  app.inject({ method: 'POST', url: `${BASE}${url}`, payload: payload as object });

const slide = {
  id: 'i1',
  retailer_id: 'r1',
  product_id: 'p1',
  position: 0,
  photo_id: 'ph1',
  image_level: 'ORIGINAL',
  template_id: null,
  resolved_image_key: null,
  scheduled_post: { id: 'sp1', status: 'READY', scheduled_at: new Date('2026-10-20T14:00:00Z') },
};

beforeEach(() => {
  vi.clearAllMocks();
  m.itemFindFirst.mockResolvedValue(slide);
  m.styleItemNow.mockResolvedValue('retailers/r1/schedule/sp1-0-new_arrival-x.jpg');
  m.itemUpdateMany.mockResolvedValue({ count: 1 });
  m.planUpdateMany.mockResolvedValue({ count: 1 });
});

describe('GET /templates', () => {
  it('lists the registry (manager may read)', async () => {
    const app = await buildApp('manager');
    const res = await app.inject({ method: 'GET', url: `${BASE}/templates` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.slide.map((t: { id: string }) => t.id)).toEqual([
      'white_price',
      'new_arrival',
      'festival_frame',
      'logo_corner',
    ]);
    expect(res.json().data.cover[0].id).toBe('collage_cover');
  });
});

describe('POST /items/:id/style', () => {
  it('renders now and returns the preview url', async () => {
    const res = await post(await buildApp(), '/items/i1/style', { template: 'new_arrival' });
    expect(res.statusCode).toBe(200);
    expect(m.styleItemNow).toHaveBeenCalledWith(
      'r1',
      'sp1',
      expect.objectContaining({ id: 'i1' }),
      'new_arrival',
      slide.scheduled_post.scheduled_at,
    );
    expect(res.json().data.resolved_image_url).toBe(
      'https://cdn/retailers/r1/schedule/sp1-0-new_arrival-x.jpg',
    );
  });

  it('null resets the slide to the original photo', async () => {
    const res = await post(await buildApp(), '/items/i1/style', { template: null });
    expect(res.statusCode).toBe(200);
    expect(m.itemUpdateMany).toHaveBeenCalledWith({
      where: { id: 'i1', retailer_id: 'r1' },
      data: { image_level: 'ORIGINAL', template_id: null, resolved_image_key: null },
    });
    expect(m.styleItemNow).not.toHaveBeenCalled();
  });

  it('rejects an unknown template and `rotate` on a single slide', async () => {
    const app = await buildApp();
    expect((await post(app, '/items/i1/style', { template: 'neon' })).statusCode).toBe(422);
    expect((await post(app, '/items/i1/style', { template: 'rotate' })).statusCode).toBe(422);
    expect(m.styleItemNow).not.toHaveBeenCalled();
  });

  it('owner-only: a manager is refused', async () => {
    const res = await post(await buildApp('manager'), '/items/i1/style', {
      template: 'new_arrival',
    });
    expect(res.statusCode).toBe(403);
    expect(m.styleItemNow).not.toHaveBeenCalled();
  });

  it('409 once the post is no longer editable', async () => {
    m.itemFindFirst.mockResolvedValue({
      ...slide,
      scheduled_post: { ...slide.scheduled_post, status: 'POSTED' },
    });
    const res = await post(await buildApp(), '/items/i1/style', { template: 'new_arrival' });
    expect(res.statusCode).toBe(409);
  });

  it("404 for another retailer's slide (lookup is retailer-scoped)", async () => {
    m.itemFindFirst.mockResolvedValue(null);
    const res = await post(await buildApp(), '/items/zzz/style', { template: 'new_arrival' });
    expect(res.statusCode).toBe(404);
    expect(m.itemFindFirst.mock.calls[0]?.[0].where).toMatchObject({ retailer_id: 'r1' });
  });

  it('a render failure is a clean 422 with no raw error', async () => {
    m.styleItemNow.mockRejectedValue(new Error('ENOENT /secret/path'));
    const res = await post(await buildApp(), '/items/i1/style', { template: 'new_arrival' });
    expect(res.statusCode).toBe(422);
    expect(res.body).not.toContain('secret');
  });
});

describe('POST /plans/:id/style (bulk, lazy)', () => {
  const plan = { id: 'pl1', status: 'ACTIVE', rotation_pool: ['white_price', 'new_arrival'] };
  beforeEach(() => {
    m.planFindFirst.mockResolvedValue(plan);
    m.itemFindMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });

  it('one template → single updateMany, key cleared, nothing rendered', async () => {
    const res = await post(await buildApp(), '/plans/pl1/style', { template: 'logo_corner' });
    expect(res.json().data.styled).toBe(3);
    expect(m.itemUpdateMany).toHaveBeenCalledTimes(1);
    expect(m.itemUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b', 'c'] }, retailer_id: 'r1' },
      data: { image_level: 'TEMPLATE', template_id: 'logo_corner', resolved_image_key: null },
    });
    expect(m.styleItemNow).not.toHaveBeenCalled();
  });

  it('rotate → round-robin through the plan pool', async () => {
    await post(await buildApp(), '/plans/pl1/style', { template: 'rotate' });
    const assigned = m.itemUpdateMany.mock.calls.map((c) => c[0].data.template_id);
    expect(assigned).toEqual(['white_price', 'new_arrival', 'white_price']);
  });

  it('rotate with an empty pool is a 422', async () => {
    m.planFindFirst.mockResolvedValue({ ...plan, rotation_pool: [] });
    const res = await post(await buildApp(), '/plans/pl1/style', { template: 'rotate' });
    expect(res.statusCode).toBe(422);
  });

  it('only editable posts are touched (query filter)', async () => {
    await post(await buildApp(), '/plans/pl1/style', { template: 'new_arrival' });
    expect(m.itemFindMany.mock.calls[0]?.[0].where).toMatchObject({
      retailer_id: 'r1',
      scheduled_post: { plan_id: 'pl1', status: { in: ['DRAFT', 'READY', 'FAILED', 'MISSED'] } },
    });
  });

  it('409 for an ended plan', async () => {
    m.planFindFirst.mockResolvedValue({ ...plan, status: 'ENDED' });
    const res = await post(await buildApp(), '/plans/pl1/style', { template: 'new_arrival' });
    expect(res.statusCode).toBe(409);
  });
});

describe('POST /posts/:id/style', () => {
  it('styles every slide of the post', async () => {
    m.postFindFirst.mockResolvedValue({
      id: 'sp1',
      status: 'READY',
      plan: { rotation_pool: [] },
      items: [{ id: 'a' }, { id: 'b' }],
    });
    const res = await post(await buildApp(), '/posts/sp1/style', { template: 'white_price' });
    expect(res.json().data.styled).toBe(2);
  });

  it('409 on a PUBLISHING post', async () => {
    m.postFindFirst.mockResolvedValue({
      id: 'sp1',
      status: 'PUBLISHING',
      plan: { rotation_pool: [] },
      items: [{ id: 'a' }],
    });
    const res = await post(await buildApp(), '/posts/sp1/style', { template: 'white_price' });
    expect(res.statusCode).toBe(409);
  });
});

describe('PATCH /plans/:id/design', () => {
  const patch = async (payload: unknown, role: 'manager' | null = null) =>
    (await buildApp(role)).inject({
      method: 'PATCH',
      url: `${BASE}/plans/pl1/design`,
      payload: payload as object,
    });

  it('sets cover style + pool, retailer-scoped, not on ENDED plans', async () => {
    const res = await patch({ cover_style: 'collage_cover', rotation_pool: ['new_arrival'] });
    expect(res.statusCode).toBe(200);
    expect(m.planUpdateMany).toHaveBeenCalledWith({
      where: { id: 'pl1', retailer_id: 'r1', status: { in: ['DRAFT', 'ACTIVE', 'PAUSED'] } },
      data: { cover_style: 'collage_cover', rotation_pool: ['new_arrival'] },
    });
  });

  it('rejects unknown ids, empty bodies and managers', async () => {
    expect((await patch({ cover_style: 'neon' })).statusCode).toBe(422);
    expect((await patch({ rotation_pool: ['collage_cover'] })).statusCode).toBe(422);
    expect((await patch({})).statusCode).toBe(422);
    expect((await patch({ cover_style: null }, 'manager')).statusCode).toBe(403);
  });

  it('404 when no live plan matches', async () => {
    m.planUpdateMany.mockResolvedValue({ count: 0 });
    expect((await patch({ cover_style: null })).statusCode).toBe(404);
  });
});
