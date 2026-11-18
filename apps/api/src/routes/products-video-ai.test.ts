// F-034 T5 — AI promo video route tests. Every gate must refuse BEFORE a quota slot is
// reserved or a job enqueued: each Fal clip costs real USD.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { productsVideoAiRoutes } from './products/products-video-ai.js';

const m = vi.hoisted(() => ({
  retailer: vi.fn(),
  product: vi.fn(),
  photo: vi.fn(),
  video: vi.fn(),
  style: vi.fn(),
  styles: vi.fn(),
  hasFeature: vi.fn(),
  modelForPlan: vi.fn(),
  reserve: vi.fn(),
  refund: vi.fn(),
  quotaStatus: vi.fn(),
  enqueue: vi.fn(),
  status: vi.fn(),
  claim: vi.fn(),
  release: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findUniqueOrThrow: m.retailer },
    product: { findFirst: m.product },
    productPhoto: { findFirst: m.photo },
    productVideo: { findFirst: m.video },
    studioStyle: { findFirst: m.style, findMany: m.styles },
  },
}));
vi.mock('../lib/features.js', () => ({ hasFeature: m.hasFeature }));
vi.mock('../lib/fal-video.js', () => ({ videoModelForPlan: m.modelForPlan }));
vi.mock('../lib/quota.js', () => ({
  reserveJobQuota: m.reserve,
  refundJobQuota: m.refund,
  getQuotaStatus: m.quotaStatus,
}));
vi.mock('../jobs/index.js', () => ({ addPromoVideoJob: m.enqueue }));
vi.mock('../lib/studio-shoot.js', () => ({
  getStudioJobStatus: m.status,
  claimPromoVideoSlot: m.claim,
  releasePromoVideoSlot: m.release,
  MAX_VIDEOS_PER_PRODUCT: 3,
}));

const R = 'retailer_1';

async function buildApp(session: { catalogDelegate?: boolean } = {}) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('catalogDelegate', null);
  app.decorateRequest('supportDelegate', null);
  app.addHook('preHandler', async (request) => {
    request.retailerId = R;
    if (session.catalogDelegate) {
      request.catalogDelegate = { team_member_id: 'tm1', ticket_id: 't1' };
    }
  });
  await app.register(productsVideoAiRoutes, { prefix: '/v1/products' });
  await app.ready();
  return app;
}

const VIDEO_STYLE = {
  id: 'vs1',
  slug: 'VI-01',
  prompt: 'slow push-in, fabric sways',
  kind: 'VIDEO',
  status: 'PUBLISHED',
  plans: ['GROWTH'],
  default_aspect: '9:16',
  duration_sec: 5,
  no_person: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.retailer.mockResolvedValue({ plan: 'GROWTH' });
  m.hasFeature.mockResolvedValue(true);
  m.modelForPlan.mockResolvedValue({ model_key: 'kling_2_6', endpoint: 'e' });
  m.product.mockResolvedValue({
    name: 'Anarkali Suit',
    category: 'Ladies Suit',
    _count: { videos: 0 },
  });
  m.photo.mockResolvedValue({ id: 'photo_1' });
  m.style.mockResolvedValue(VIDEO_STYLE);
  m.reserve.mockResolvedValue(undefined);
  m.refund.mockResolvedValue(undefined);
  m.enqueue.mockResolvedValue(undefined);
  m.claim.mockResolvedValue(true);
  m.release.mockResolvedValue(undefined);
});

type App = Awaited<ReturnType<typeof buildApp>>;
const post = (app: App, payload: object = {}) =>
  app.inject({
    method: 'POST',
    url: '/v1/products/p1/promo-video',
    payload: { photo_id: 'photo_1', style_slug: 'VI-01', ...payload },
  });

function expectNothingSpent() {
  expect(m.reserve).not.toHaveBeenCalled();
  expect(m.enqueue).not.toHaveBeenCalled();
}

describe('POST /products/:id/promo-video', () => {
  it('enqueues with a reserved AI_VIDEO slot keyed by the job id', async () => {
    const res = await post(await buildApp());
    expect(res.statusCode).toBe(202);
    const jobId = res.json().data.job_id;
    expect(m.reserve).toHaveBeenCalledWith(R, 'AI_VIDEO', jobId);
    expect(m.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        job_id: jobId,
        retailer_id: R,
        product_id: 'p1',
        photo_id: 'photo_1',
        style_slug: 'VI-01',
        aspect: '9:16',
        seconds: 5,
      }),
    );
  });

  it('refuses a delegate with 403 before anything else', async () => {
    const res = await post(await buildApp({ catalogDelegate: true }));
    expect(res.statusCode).toBe(403);
    expect(m.hasFeature).not.toHaveBeenCalled();
    expectNothingSpent();
  });

  it('refuses when the plan feature is off', async () => {
    m.hasFeature.mockResolvedValue(false);
    const res = await post(await buildApp());
    expect(res.statusCode).toBe(402);
    expect(m.hasFeature).toHaveBeenCalledWith(R, 'AI_PROMO_VIDEO');
    expectNothingSpent();
  });

  it('refuses when the plan has no enabled video model', async () => {
    m.modelForPlan.mockResolvedValue(null);
    const res = await post(await buildApp());
    expect(res.statusCode).toBe(403);
    expectNothingSpent();
  });

  it('404s a product that is not this retailer’s (or is deleted)', async () => {
    m.product.mockResolvedValue(null);
    const res = await post(await buildApp());
    expect(res.statusCode).toBe(404);
    expect(m.product).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'p1', retailer_id: R, deleted_at: null }),
      }),
    );
    expectNothingSpent();
  });

  it('404s a photo that is not on this retailer’s product', async () => {
    m.photo.mockResolvedValue(null);
    const res = await post(await buildApp());
    expect(res.statusCode).toBe(404);
    expect(m.photo).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'photo_1', product_id: 'p1', retailer_id: R }),
      }),
    );
    expectNothingSpent();
  });

  it('only accepts a PUBLISHED VIDEO style', async () => {
    m.style.mockResolvedValue(null);
    const res = await post(await buildApp());
    expect(res.statusCode).toBe(422);
    expect(m.style).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ slug: 'VI-01', status: 'PUBLISHED', kind: 'VIDEO' }),
      }),
    );
    expectNothingSpent();
  });

  it('refuses a style outside the retailer’s plan', async () => {
    m.style.mockResolvedValue({ ...VIDEO_STYLE, plans: ['PRO'] });
    const res = await post(await buildApp());
    expect(res.statusCode).toBe(403);
    expectNothingSpent();
  });

  it('D11 interim: a kids product only gets no_person styles', async () => {
    m.product.mockResolvedValue({
      name: 'Girls Frock',
      category: 'Kids Ethnic Wear',
      _count: { videos: 0 },
    });
    const res = await post(await buildApp());
    expect(res.statusCode).toBe(422);
    expectNothingSpent();

    m.style.mockResolvedValue({ ...VIDEO_STYLE, no_person: true });
    expect((await post(await buildApp())).statusCode).toBe(202);
  });

  it('refuses a 4th video on the product (D4 cap 3)', async () => {
    m.product.mockResolvedValue({ name: 'Suit', category: 'Ladies Suit', _count: { videos: 3 } });
    const res = await post(await buildApp());
    expect(res.statusCode).toBe(422);
    expectNothingSpent();
  });

  it('refunds the slot when the enqueue throws', async () => {
    m.enqueue.mockRejectedValue(new Error('redis down'));
    const res = await post(await buildApp());
    expect(res.statusCode).toBe(500);
    const jobId = m.reserve.mock.calls[0]?.[2];
    expect(m.refund).toHaveBeenCalledWith(jobId, 'AI_VIDEO');
    expect(m.release).toHaveBeenCalledWith('p1', jobId);
  });

  it('L5: refuses with 409 while another AI clip is being made for the product', async () => {
    m.claim.mockResolvedValue(false);
    const res = await post(await buildApp());
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('VIDEO_IN_PROGRESS');
    expectNothingSpent();
  });

  it('L5: frees the product slot when the quota reserve refuses', async () => {
    m.reserve.mockRejectedValue(new Error('quota'));
    const res = await post(await buildApp());
    expect(res.statusCode).toBe(500);
    const jobId = m.claim.mock.calls[0]?.[1];
    expect(m.release).toHaveBeenCalledWith('p1', jobId);
    expect(m.enqueue).not.toHaveBeenCalled();
  });

  it('L5: keeps the slot claimed on success (the job frees it)', async () => {
    const res = await post(await buildApp());
    expect(m.claim).toHaveBeenCalledWith('p1', res.json().data.job_id);
    expect(m.release).not.toHaveBeenCalled();
  });

  it('uses the requested aspect over the style default', async () => {
    await post(await buildApp(), { aspect: '4:5' });
    expect(m.enqueue).toHaveBeenCalledWith(expect.objectContaining({ aspect: '4:5' }));
  });
});

describe('GET /products/:id/promo-video/:jobId', () => {
  const get = async () =>
    (await buildApp()).inject({ method: 'GET', url: '/v1/products/p1/promo-video/job_1' });

  it('returns the Redis status when present', async () => {
    m.product.mockResolvedValue({ id: 'p1' });
    m.status.mockResolvedValue({ status: 'processing', progress: 40 });
    expect((await get()).json().data).toEqual({ status: 'processing', progress: 40 });
    // Status read is keyed by the caller's retailer: another retailer's job id finds nothing.
    expect(m.status).toHaveBeenCalledWith(R, 'job_1');
  });

  it('falls back to the video row whose id is the job id (RC-063)', async () => {
    m.product.mockResolvedValue({ id: 'p1' });
    m.status.mockResolvedValue(null);
    m.video.mockResolvedValue({ id: 'job_1', public_url: 'https://cdn/v.mp4' });
    expect((await get()).json().data).toEqual({
      status: 'ready',
      video_id: 'job_1',
      url: 'https://cdn/v.mp4',
    });
    expect(m.video).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'job_1', product_id: 'p1', retailer_id: R } }),
    );
  });

  it('404s another retailer’s product', async () => {
    m.product.mockResolvedValue(null);
    expect((await get()).statusCode).toBe(404);
    expect(m.status).not.toHaveBeenCalled();
  });
});

describe('GET /products/promo-video/styles', () => {
  it('lists PUBLISHED VIDEO styles for the plan, no_person only for a kids product', async () => {
    m.product.mockResolvedValue({ name: 'Girls Frock', category: 'Kids Ethnic Wear' });
    m.styles.mockResolvedValue([
      { slug: 'VI-01', label: 'a', no_person: false },
      { slug: 'VI-02', label: 'b', no_person: true },
    ]);
    m.quotaStatus.mockResolvedValue({ used: 0, limit: 5 });
    const res = await (await buildApp()).inject({
      method: 'GET',
      url: '/v1/products/promo-video/styles?product_id=p1',
    });
    expect(res.statusCode).toBe(200);
    expect(m.styles).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PUBLISHED', kind: 'VIDEO', plans: { has: 'GROWTH' } },
      }),
    );
    const body = res.json();
    expect(body.data.map((s: { slug: string }) => s.slug)).toEqual(['VI-02']);
    expect(body.meta.quota).toEqual({ used: 0, limit: 5 });
    expect(body.meta.available).toBe(true);
  });
});
