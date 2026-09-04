import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';

const { mockRetailerFind, mockTemplateFindMany } = vi.hoisted(() => ({
  mockRetailerFind: vi.fn(),
  mockTemplateFindMany: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findUniqueOrThrow: mockRetailerFind },
    postTemplate: { findMany: mockTemplateFindMany },
  },
}));

const { postTemplatesRoutes } = await import('./post-templates.js');

const RETAILER_ID = 'retailer_1';

async function buildApp(authenticated = true) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = authenticated ? RETAILER_ID : '';
  });
  await app.register(postTemplatesRoutes, { prefix: '/v1' });
  await app.ready();
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('GET /v1/post-templates', () => {
  it('403 when not authenticated', async () => {
    const app = await buildApp(false);
    const res = await app.inject({ method: 'GET', url: '/v1/post-templates' });
    expect(res.statusCode).toBe(403);
    expect(mockTemplateFindMany).not.toHaveBeenCalled();
  });

  it('filters PUBLISHED + plan-has and orders by sort_order', async () => {
    mockRetailerFind.mockResolvedValueOnce({ plan: 'STARTER' });
    mockTemplateFindMany.mockResolvedValueOnce([{ id: 't1', name: 'Diwali Post' }]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/post-templates' });
    expect(res.statusCode).toBe(200);
    expect(mockTemplateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PUBLISHED', plans: { has: 'STARTER' } },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      }),
    );
    expect(res.json().data).toEqual([{ id: 't1', name: 'Diwali Post' }]);
  });

  it('context=POST returns POST + BOTH templates', async () => {
    mockRetailerFind.mockResolvedValueOnce({ plan: 'GROWTH' });
    mockTemplateFindMany.mockResolvedValueOnce([]);
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/v1/post-templates?context=POST' });
    expect(mockTemplateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ context: 'POST' }, { context: 'BOTH' }],
        }),
      }),
    );
  });

  it('context=CAMPAIGN returns CAMPAIGN + BOTH templates', async () => {
    mockRetailerFind.mockResolvedValueOnce({ plan: 'PRO' });
    mockTemplateFindMany.mockResolvedValueOnce([]);
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/v1/post-templates?context=CAMPAIGN' });
    expect(mockTemplateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ context: 'CAMPAIGN' }, { context: 'BOTH' }],
        }),
      }),
    );
  });

  it('never exposes DRAFT/HIDDEN or internal fields', async () => {
    mockRetailerFind.mockResolvedValueOnce({ plan: 'PRO' });
    mockTemplateFindMany.mockResolvedValueOnce([]);
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/v1/post-templates' });
    const args =
      mockTemplateFindMany.mock.calls[0]?.[0] ?? { where: { status: '' }, select: {} };
    const { where, select } = args;
    expect(where.status).toBe('PUBLISHED');
    expect(select).not.toHaveProperty('status');
    expect(select).not.toHaveProperty('plans');
    expect(select).toHaveProperty('caption_template');
    expect(select).toHaveProperty('hashtags');
  });

  it('rejects a bad context value', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/post-templates?context=REELS' });
    expect(res.statusCode).toBe(422);
  });
});