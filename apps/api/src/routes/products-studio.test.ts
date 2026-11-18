// F-032 Phase A — AI Studio Shoots route tests (2026-08-13).
//
// Covers the POST enqueue (plan gate, template validation, ownership check,
// 202 + job_id) and the GET status poll (processing → ready/failed via
// Redis, plus the persisted-photo fallback when Redis is absent).
// Generation itself (FLUX Kontext) is lib-level — tested in
// src/lib/studio-shoot.test.ts with a mocked fetch.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler, planLimitExceeded } from '../plugins/error-handler.js';
import { productsStudioRoutes } from './products/products-studio.js';

const {
  mockRetailerFindUniqueOrThrow,
  mockPhotoFindFirst,
  mockPhotoCreate,
  mockAddStudioShootJob,
  mockGetStudioJobStatus,
  mockIsStudioShootConfigured,
  mockCheckQuota,
  mockReserveJobQuota,
  mockRefundJobQuota,
  mockStyleFindFirst,
  mockStyleFindMany,
  mockProductFindFirst,
  mockVariantFindFirst,
} = vi.hoisted(() => ({
  mockReserveJobQuota: vi.fn(),
  mockRefundJobQuota: vi.fn(),
  mockVariantFindFirst: vi.fn(),
  mockRetailerFindUniqueOrThrow: vi.fn(),
  mockPhotoFindFirst: vi.fn(),
  mockPhotoCreate: vi.fn(),
  mockAddStudioShootJob: vi.fn(),
  mockGetStudioJobStatus: vi.fn(),
  mockIsStudioShootConfigured: vi.fn(),
  mockCheckQuota: vi.fn(),
  mockStyleFindFirst: vi.fn(),
  mockStyleFindMany: vi.fn(),
  mockProductFindFirst: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findUniqueOrThrow: mockRetailerFindUniqueOrThrow },
    product: { findFirst: mockProductFindFirst },
    productPhoto: {
      findFirst: mockPhotoFindFirst,
      create: mockPhotoCreate,
    },
    productVariant: { findFirst: mockVariantFindFirst },
    studioStyle: {
      findFirst: mockStyleFindFirst,
      findMany: mockStyleFindMany,
    },
  },
}));

vi.mock('../jobs/index.js', () => ({
  addStudioShootJob: mockAddStudioShootJob,
}));

vi.mock('../lib/studio-shoot.js', () => ({
  getStudioJobStatus: mockGetStudioJobStatus,
  isStudioShootConfigured: mockIsStudioShootConfigured,
}));

vi.mock('../lib/quota.js', () => ({
  checkQuota: mockCheckQuota,
  getQuotaStatus: vi.fn(),
  reserveJobQuota: mockReserveJobQuota,
  refundJobQuota: mockRefundJobQuota,
}));

const RETAILER_ID = 'retailer_1';

async function buildApp(session: { catalogDelegate?: boolean; supportDelegate?: boolean } = {}) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('catalogDelegate', null);
  app.decorateRequest('supportDelegate', null);
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
    if (session.catalogDelegate) {
      request.catalogDelegate = { team_member_id: 'tm1', ticket_id: 't1' };
    }
    if (session.supportDelegate) {
      request.supportDelegate = {
        team_member_id: 'tm1',
        ticket_id: 't1',
        grant_id: 'g1',
        scope: 'GROWTH',
      };
    }
  });
  await app.register(productsStudioRoutes, { prefix: '/v1/products' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsStudioShootConfigured.mockReturnValue(true);
  mockRetailerFindUniqueOrThrow.mockResolvedValue({ plan: 'GROWTH' });
  mockPhotoFindFirst.mockResolvedValue({ id: 'photo_1' });
  mockCheckQuota.mockResolvedValue(undefined);
  mockReserveJobQuota.mockResolvedValue(undefined);
  mockRefundJobQuota.mockResolvedValue(undefined);
  mockProductFindFirst.mockResolvedValue({ name: 'Anarkali Suit', category: 'Ladies Suit' });
});

const STYLE_ROW = {
  id: 'st1',
  slug: 'runway',
  prompt: 'On a high-fashion catwalk runway with spotlights.',
  tab: 'MODEL' as const,
  engine: null,
  audience: [] as string[],
  plans: ['STARTER', 'GROWTH', 'PRO'],
};

describe('POST /products/:id/photos/:photoId/studio-shoot', () => {
  // H2-3: a delegated session (catalog upload / support) must not spend the retailer's quota.
  it.each([
    ['catalog delegate', { catalogDelegate: true }],
    ['support delegate', { supportDelegate: true }],
  ])('H2-3: refuses a %s before any quota or enqueue', async (_name, session) => {
    const app = await buildApp(session);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/p1/photos/photo_1/studio-shoot',
      payload: { template: 'runway' },
    });
    expect(res.statusCode).toBe(403);
    expect(mockCheckQuota).not.toHaveBeenCalled();
    expect(mockReserveJobQuota).not.toHaveBeenCalled();
    expect(mockAddStudioShootJob).not.toHaveBeenCalled();
  });

  it('202 + job_id for a Growth retailer with a valid style slug', async () => {
    mockStyleFindFirst.mockResolvedValueOnce(STYLE_ROW);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/p1/photos/photo_1/studio-shoot',
      payload: { template: 'runway' },
    });

    expect(res.statusCode).toBe(202);
    // F-034: a VIDEO style slug must never run as an image studio shoot.
    expect(mockStyleFindFirst).toHaveBeenCalledWith({
      where: { slug: 'runway', status: 'PUBLISHED', kind: 'IMAGE' },
    });
    const data = res.json().data;
    expect(data.status).toBe('processing');
    expect(typeof data.job_id).toBe('string');
    expect(data.job_id.length).toBeGreaterThan(0);
    expect(mockAddStudioShootJob).toHaveBeenCalledWith(
      expect.objectContaining({
        retailer_id: RETAILER_ID,
        product_id: 'p1',
        photo_id: 'photo_1',
        slug: 'runway',
        prompt: STYLE_ROW.prompt,
        tab: 'MODEL',
        style_id: 'st1',
      }),
    );
    // RC-102: the slot is reserved once, keyed by the same job_id the job carries, and kept.
    expect(mockReserveJobQuota).toHaveBeenCalledExactlyOnceWith(
      RETAILER_ID,
      'STUDIO_SHOOT',
      data.job_id,
    );
    expect(mockAddStudioShootJob).toHaveBeenCalledWith(
      expect.objectContaining({ job_id: data.job_id }),
    );
    expect(mockRefundJobQuota).not.toHaveBeenCalled();
    await app.close();
  });

  it('gives the slot back when the enqueue itself fails', async () => {
    mockStyleFindFirst.mockResolvedValueOnce(STYLE_ROW);
    mockAddStudioShootJob.mockRejectedValueOnce(new Error('redis down'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/p1/photos/photo_1/studio-shoot',
      payload: { template: 'runway' },
    });
    expect(res.statusCode).toBe(500);
    const jobId = mockReserveJobQuota.mock.calls[0]?.[2];
    expect(mockRefundJobQuota).toHaveBeenCalledExactlyOnceWith(jobId, 'STUDIO_SHOOT');
    await app.close();
  });

  it('a failing refund does not mask the enqueue error', async () => {
    mockStyleFindFirst.mockResolvedValueOnce(STYLE_ROW);
    mockAddStudioShootJob.mockRejectedValueOnce(new Error('redis down'));
    mockRefundJobQuota.mockRejectedValueOnce(new Error('db down'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/p1/photos/photo_1/studio-shoot',
      payload: { template: 'runway' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().error.message).not.toContain('db down');
    await app.close();
  });

  it('402 from the atomic reserve (lost the race the fail-fast read passed): nothing enqueued, nothing refunded', async () => {
    mockStyleFindFirst.mockResolvedValueOnce(STYLE_ROW);
    mockReserveJobQuota.mockRejectedValueOnce(planLimitExceeded('studio shoot'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/p1/photos/photo_1/studio-shoot',
      payload: { template: 'runway' },
    });
    expect(res.statusCode).toBe(402);
    expect(mockAddStudioShootJob).not.toHaveBeenCalled();
    expect(mockRefundJobQuota).not.toHaveBeenCalled();
    await app.close();
  });

  it('reserves nothing when validation rejects the request', async () => {
    mockStyleFindFirst.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/p1/photos/photo_1/studio-shoot',
      payload: { template: 'nope' },
    });
    expect(res.statusCode).toBe(422);
    expect(mockReserveJobQuota).not.toHaveBeenCalled();
    await app.close();
  });

  const shoot = async (template: string) => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/p1/photos/photo_1/studio-shoot',
      payload: { template },
    });
    await app.close();
    return res;
  };

  it('422 for a model style on a kids product (never reaches the queue)', async () => {
    mockProductFindFirst.mockResolvedValue({ name: 'Kids Frock', category: 'Kids Ethnic Wear' });
    mockStyleFindFirst.mockResolvedValueOnce(STYLE_ROW);
    const res = await shoot('runway');
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toMatch(/kids/i);
    expect(mockAddStudioShootJob).not.toHaveBeenCalled();
  });

  it('422 for a torso-form style on a bottoms-only product', async () => {
    mockProductFindFirst.mockResolvedValue({ name: 'Cotton Palazzo', category: 'Bottoms' });
    mockStyleFindFirst.mockResolvedValueOnce({ ...STYLE_ROW, slug: 'ps-03', tab: 'PRODUCT' });
    expect((await shoot('ps-03')).statusCode).toBe(422);
    expect(mockAddStudioShootJob).not.toHaveBeenCalled();
  });

  it('202 for a surface product style on unstitched fabric', async () => {
    mockProductFindFirst.mockResolvedValue({ name: 'Suit Piece', is_unstitched: true });
    mockStyleFindFirst.mockResolvedValueOnce({ ...STYLE_ROW, slug: 'ps-07', tab: 'PRODUCT' });
    expect((await shoot('ps-07')).statusCode).toBe(202);
  });

  it('404 when the product is not this retailer’s', async () => {
    mockProductFindFirst.mockResolvedValue(null);
    mockStyleFindFirst.mockResolvedValueOnce(STYLE_ROW);
    expect((await shoot('runway')).statusCode).toBe(404);
  });

  it('enqueues for STARTER plan (all plans allowed; quota is the only limiter)', async () => {
    mockRetailerFindUniqueOrThrow.mockResolvedValue({ plan: 'STARTER' });
    mockStyleFindFirst.mockResolvedValueOnce(STYLE_ROW);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/p1/photos/photo_1/studio-shoot',
      payload: { template: 'runway' },
    });

    expect(res.statusCode).toBe(202);
    expect(mockAddStudioShootJob).toHaveBeenCalled();
    await app.close();
  });

  it('403 FEATURE_UNAVAILABLE when the style is not in the retailer plan', async () => {
    mockRetailerFindUniqueOrThrow.mockResolvedValue({ plan: 'STARTER' });
    mockStyleFindFirst.mockResolvedValueOnce({ ...STYLE_ROW, plans: ['PRO'] });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/p1/photos/photo_1/studio-shoot',
      payload: { template: 'runway' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FEATURE_UNAVAILABLE');
    expect(mockAddStudioShootJob).not.toHaveBeenCalled();
    await app.close();
  });

  it('402 PLAN_LIMIT_EXCEEDED when the STUDIO_SHOOT quota is used up', async () => {
    mockCheckQuota.mockRejectedValue(planLimitExceeded('studio shoot'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/p1/photos/photo_1/studio-shoot',
      payload: { template: 'runway' },
    });

    expect(res.statusCode).toBe(402);
    expect(res.json().error.code).toBe('PLAN_LIMIT_EXCEEDED');
    expect(mockAddStudioShootJob).not.toHaveBeenCalled();
    await app.close();
  });

  it('422 for an unknown / unpublished style slug', async () => {
    mockStyleFindFirst.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/p1/photos/photo_1/studio-shoot',
      payload: { template: 'rainbow_laser' },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(mockAddStudioShootJob).not.toHaveBeenCalled();
    await app.close();
  });

  it('422 when template is missing', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/p1/photos/photo_1/studio-shoot',
      payload: {},
    });

    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('404 when the photo does not belong to this retailer', async () => {
    mockStyleFindFirst.mockResolvedValueOnce(STYLE_ROW);
    mockPhotoFindFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/p1/photos/photo_1/studio-shoot',
      payload: { template: 'runway' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    expect(mockAddStudioShootJob).not.toHaveBeenCalled();
    await app.close();
  });

  it('503 when BFL is not configured', async () => {
    mockIsStudioShootConfigured.mockReturnValue(false);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/p1/photos/photo_1/studio-shoot',
      payload: { template: 'runway' },
    });

    expect(res.statusCode).toBe(503);
    expect(mockAddStudioShootJob).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('GET /studio-styles', () => {
  it('returns only PUBLISHED styles the plan allows, without prompt', async () => {
    mockRetailerFindUniqueOrThrow.mockResolvedValueOnce({ plan: 'STARTER' });
    mockStyleFindMany.mockResolvedValueOnce([
      {
        slug: 'pastel_gradient',
        label: 'Pastel Gradient Lounge',
        description: 'd',
        tab: 'MODEL',
        audience: [],
        thumbnail_url: null,
      },
    ]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/products/studio-styles' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data[0].slug).toBe('pastel_gradient');
    expect(body.data[0]).not.toHaveProperty('prompt');
    expect(mockStyleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PUBLISHED', kind: 'IMAGE', plans: { has: 'STARTER' } },
      }),
    );
    await app.close();
  });
});

describe('GET /studio-styles?product_id=', () => {
  const ROWS = [
    {
      slug: 'ps-03',
      label: 'Luxury',
      description: 'd',
      tab: 'PRODUCT',
      audience: [],
      thumbnail_url: null,
    },
    {
      slug: 'ps-07',
      label: 'Flat Lay',
      description: 'd',
      tab: 'PRODUCT',
      audience: [],
      thumbnail_url: null,
    },
    {
      slug: 'mi-02',
      label: 'Courtyard',
      description: 'd',
      tab: 'MODEL',
      audience: [],
      thumbnail_url: null,
    },
  ];
  const get = async (qs = '?product_id=p1') => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/v1/products/studio-styles${qs}` });
    await app.close();
    return res;
  };

  it('stitched adult garment keeps every style and model_available', async () => {
    mockStyleFindMany.mockResolvedValueOnce(ROWS);
    const body = (await get()).json();
    expect(body.data.map((r: { slug: string }) => r.slug)).toEqual(['ps-03', 'ps-07', 'mi-02']);
    expect(body.meta).toEqual({ model_available: true, model_unavailable_reason: null });
  });

  it('unstitched fabric drops model + torso-form styles and says why', async () => {
    mockProductFindFirst.mockResolvedValue({ name: 'Suit Piece', is_unstitched: true });
    mockStyleFindMany.mockResolvedValueOnce(ROWS);
    const body = (await get()).json();
    expect(body.data.map((r: { slug: string }) => r.slug)).toEqual(['ps-07']);
    expect(body.meta.model_available).toBe(false);
    expect(body.meta.model_unavailable_reason).toMatch(/unstitched/i);
  });

  it('without product_id the list is unfiltered (older app builds)', async () => {
    mockProductFindFirst.mockResolvedValue({ name: 'Cotton Palazzo' });
    mockStyleFindMany.mockResolvedValueOnce(ROWS);
    const body = (await get('')).json();
    expect(body.data).toHaveLength(3);
    expect(mockProductFindFirst).not.toHaveBeenCalled();
  });

  it('404 for a product that is not this retailer’s', async () => {
    mockProductFindFirst.mockResolvedValue(null);
    mockStyleFindMany.mockResolvedValueOnce(ROWS);
    expect((await get()).statusCode).toBe(404);
  });
});

describe('GET /products/:id/photos/:photoId/studio-shoot/status', () => {
  it('returns ready + photo url when the job finished', async () => {
    mockGetStudioJobStatus.mockResolvedValue({
      status: 'ready',
      photo_id: 'photo_new',
      url: 'https://r2.example/studio.jpg',
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/products/p1/photos/photo_1/studio-shoot/status?job_id=job_1',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      status: 'ready',
      photo_id: 'photo_new',
      url: 'https://r2.example/studio.jpg',
    });
    await app.close();
  });

  it('polls a color-variant photo (variant-<id>) via the variant row, not ProductPhoto', async () => {
    mockVariantFindFirst.mockResolvedValue({ id: 'v1' });
    mockPhotoFindFirst.mockResolvedValue(null); // no ProductPhoto has id "variant-v1"
    mockGetStudioJobStatus.mockResolvedValue({ status: 'processing' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/products/p1/photos/variant-v1/studio-shoot/status?job_id=job_1',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('processing');
    expect(mockVariantFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'v1', product_id: 'p1', retailer_id: RETAILER_ID },
      }),
    );
    await app.close();
  });

  it('returns failed + error message', async () => {
    mockGetStudioJobStatus.mockResolvedValue({
      status: 'failed',
      error: 'The studio shoot timed out. Please try again.',
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/products/p1/photos/photo_1/studio-shoot/status?job_id=job_1',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('failed');
    await app.close();
  });

  it('falls back to the persisted studio photo when Redis status is absent', async () => {
    mockGetStudioJobStatus.mockResolvedValue(null);
    mockPhotoFindFirst
      .mockResolvedValueOnce({ id: 'photo_1' }) // ownership check
      .mockResolvedValueOnce({
        id: 'photo_new',
        url: 'https://r2.example/studio.jpg',
      }); // persisted-photo fallback
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/products/p1/photos/photo_1/studio-shoot/status?job_id=job_1',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      status: 'ready',
      photo_id: 'photo_new',
      url: 'https://r2.example/studio.jpg',
    });
    await app.close();
  });

  it('processing when nothing exists yet', async () => {
    mockGetStudioJobStatus.mockResolvedValue(null);
    mockPhotoFindFirst.mockResolvedValueOnce({ id: 'photo_1' }).mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/products/p1/photos/photo_1/studio-shoot/status?job_id=job_1',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('processing');
    await app.close();
  });

  it('422 when job_id is missing', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/products/p1/photos/photo_1/studio-shoot/status',
    });

    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('404 when the photo does not belong to this retailer', async () => {
    mockPhotoFindFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/products/p1/photos/photo_1/studio-shoot/status?job_id=job_1',
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
