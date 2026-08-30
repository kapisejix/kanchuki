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
  mockStyleFindFirst,
  mockStyleFindMany,
} = vi.hoisted(() => ({
  mockRetailerFindUniqueOrThrow: vi.fn(),
  mockPhotoFindFirst: vi.fn(),
  mockPhotoCreate: vi.fn(),
  mockAddStudioShootJob: vi.fn(),
  mockGetStudioJobStatus: vi.fn(),
  mockIsStudioShootConfigured: vi.fn(),
  mockCheckQuota: vi.fn(),
  mockStyleFindFirst: vi.fn(),
  mockStyleFindMany: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findUniqueOrThrow: mockRetailerFindUniqueOrThrow },
    productPhoto: {
      findFirst: mockPhotoFindFirst,
      create: mockPhotoCreate,
    },
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
}));

const RETAILER_ID = 'retailer_1';

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
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
  it('202 + job_id for a Growth retailer with a valid style slug', async () => {
    mockStyleFindFirst.mockResolvedValueOnce(STYLE_ROW);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/p1/photos/photo_1/studio-shoot',
      payload: { template: 'runway' },
    });

    expect(res.statusCode).toBe(202);
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
    await app.close();
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
      { slug: 'pastel_gradient', label: 'Pastel Gradient Lounge', description: 'd', tab: 'MODEL', audience: [], thumbnail_url: null },
    ]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/products/studio-styles' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data[0].slug).toBe('pastel_gradient');
    expect(body.data[0]).not.toHaveProperty('prompt');
    expect(mockStyleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PUBLISHED', plans: { has: 'STARTER' } } }),
    );
    await app.close();
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
