import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, errorHandler } from '../../../plugins/error-handler.js';

const m = vi.hoisted(() => ({
  hasFeature: vi.fn(),
  configured: vi.fn(),
  checkQuota: vi.fn(),
  reserve: vi.fn(),
  refund: vi.fn(),
  enqueue: vi.fn(),
  productFind: vi.fn(),
  designCreate: vi.fn(),
  designFindMany: vi.fn(),
  designFindFirst: vi.fn(),
}));

vi.mock('../../../lib/features.js', () => ({ hasFeature: m.hasFeature }));
vi.mock('../../../lib/studio-shoot.js', () => ({ isStudioShootConfigured: m.configured }));
vi.mock('../../../lib/quota.js', () => ({
  checkQuota: m.checkQuota,
  reserveJobQuota: m.reserve,
  refundJobQuota: m.refund,
}));
vi.mock('../../../jobs/index.js', () => ({ addAiCustomDesignJob: m.enqueue }));
vi.mock('@kanchuki/db', () => ({
  prisma: {
    product: { findFirst: m.productFind },
    aiCustomDesign: {
      create: m.designCreate,
      findMany: m.designFindMany,
      findFirst: m.designFindFirst,
    },
  },
}));

const { retailersSocialAiDesignsRoutes } = await import('./retailers-social-ai-designs.js');

async function buildApp(staffRole: 'manager' | null = null) {
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
  await app.register(retailersSocialAiDesignsRoutes, { prefix: '/v1/retailers' });
  return app;
}

const post = async (app: Awaited<ReturnType<typeof buildApp>>, payload: unknown) =>
  app.inject({ method: 'POST', url: '/v1/retailers/me/ai-designs', payload: payload as object });
const ok = { product_id: 'p1', prompt: 'warm Diwali diyas with soft bokeh' };

beforeEach(() => {
  vi.clearAllMocks();
  m.hasFeature.mockResolvedValue(true);
  m.configured.mockResolvedValue(true);
  m.checkQuota.mockResolvedValue(undefined);
  m.reserve.mockResolvedValue(undefined);
  m.refund.mockResolvedValue(undefined);
  m.enqueue.mockResolvedValue(undefined);
  m.designCreate.mockResolvedValue({});
  m.productFind.mockResolvedValue({ id: 'p1', photos: [{ id: 'ph1', is_primary: true }] });
});

describe('POST /me/ai-designs', () => {
  it('reserves quota, writes the PENDING row, enqueues, answers 202 — in that order', async () => {
    const res = await post(await buildApp(), ok);
    expect(res.statusCode).toBe(202);
    const id = res.json().data.id as string;
    expect(m.reserve).toHaveBeenCalledWith('r1', 'AI_CUSTOM_TEMPLATE', id);
    expect(m.designCreate).toHaveBeenCalledWith({
      data: { id, retailer_id: 'r1', product_id: 'p1', prompt: ok.prompt },
    });
    expect(m.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        job_id: id,
        retailer_id: 'r1',
        photo_id: 'ph1',
        prompt: ok.prompt,
      }),
    );
    expect(m.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      m.enqueue.mock.invocationCallOrder[0] as number,
    );
  });

  it('plan feature off → 402, nothing reserved or queued', async () => {
    m.hasFeature.mockResolvedValue(false);
    const res = await post(await buildApp(), ok);
    expect(res.statusCode).toBe(402);
    expect(m.reserve).not.toHaveBeenCalled();
    expect(m.enqueue).not.toHaveBeenCalled();
  });

  it('provider not configured → 503', async () => {
    m.configured.mockResolvedValue(false);
    expect((await post(await buildApp(), ok)).statusCode).toBe(503);
    expect(m.reserve).not.toHaveBeenCalled();
  });

  it('a bad prompt (link / brand / too short) is a 422 before any spend', async () => {
    const app = await buildApp();
    for (const prompt of ['see https://evil.example', 'in the style of Gucci', 'hi', 5]) {
      expect((await post(app, { product_id: 'p1', prompt })).statusCode).toBe(422);
    }
    expect(m.reserve).not.toHaveBeenCalled();
  });

  it("another retailer's / deleted product → 404 (lookup is retailer-scoped)", async () => {
    m.productFind.mockResolvedValue(null);
    const res = await post(await buildApp(), ok);
    expect(res.statusCode).toBe(404);
    expect(m.productFind.mock.calls[0]?.[0].where).toMatchObject({
      retailer_id: 'r1',
      deleted_at: null,
    });
    expect(m.reserve).not.toHaveBeenCalled();
  });

  it('product without a photo → 422', async () => {
    m.productFind.mockResolvedValue({ id: 'p1', photos: [] });
    expect((await post(await buildApp(), ok)).statusCode).toBe(422);
    expect(m.reserve).not.toHaveBeenCalled();
  });

  it('over quota (reserve refuses) → error, no row, no job', async () => {
    m.reserve.mockRejectedValue(new AppError('PLAN_LIMIT_EXCEEDED', 'limit', 402));
    const res = await post(await buildApp(), ok);
    expect(res.statusCode).toBe(402);
    expect(m.designCreate).not.toHaveBeenCalled();
    expect(m.enqueue).not.toHaveBeenCalled();
    expect(m.refund).not.toHaveBeenCalled();
  });

  it('enqueue failure hands the slot back and surfaces the error', async () => {
    m.enqueue.mockRejectedValue(new Error('redis down'));
    const res = await post(await buildApp(), ok);
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    expect(m.refund).toHaveBeenCalledTimes(1);
    expect(m.refund.mock.calls[0]?.[1]).toBe('AI_CUSTOM_TEMPLATE');
  });

  it('a manager is refused (owner-only)', async () => {
    const res = await post(await buildApp('manager'), ok);
    expect(res.statusCode).toBe(403);
    expect(m.reserve).not.toHaveBeenCalled();
  });
});

describe('GET /me/ai-designs', () => {
  it('lists only the caller READY designs; poll is retailer-scoped', async () => {
    m.designFindMany.mockResolvedValue([
      { id: 'a', prompt: 'x', image_url: 'u', created_at: 'now' },
    ]);
    const app = await buildApp();
    const list = await app.inject({ method: 'GET', url: '/v1/retailers/me/ai-designs' });
    expect(list.statusCode).toBe(200);
    expect(m.designFindMany.mock.calls[0]?.[0].where).toEqual({
      retailer_id: 'r1',
      status: 'READY',
    });

    m.designFindFirst.mockResolvedValue(null);
    const poll = await app.inject({ method: 'GET', url: '/v1/retailers/me/ai-designs/zzz' });
    expect(poll.statusCode).toBe(404);
    expect(m.designFindFirst.mock.calls[0]?.[0].where).toEqual({ id: 'zzz', retailer_id: 'r1' });
  });
});
