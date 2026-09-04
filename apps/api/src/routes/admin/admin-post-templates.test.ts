import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

const {
  mockFindMany,
  mockFindUnique,
  mockFindFirst,
  mockCreate,
  mockUpdate,
  mockDelete,
  mockAudit,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
  mockFindFirst: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockAudit: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    postTemplate: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      findFirst: mockFindFirst,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
    },
    auditLog: { create: mockAudit },
  },
}));

vi.mock('@kanchuki/ai', () => ({
  getUploadPresignedUrl: vi.fn(async () => 'https://r2.example/put'),
  publicUrl: (k: string) => `https://cdn.example/${k}`,
  deleteObject: vi.fn(async () => undefined),
}));

vi.mock('../admin-auth.js', () => ({ adminAuthPreHandler: async () => undefined }));

const { adminPostTemplatesRoutes } = await import('./admin-post-templates.js');

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(adminPostTemplatesRoutes);
  await app.ready();
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('admin post-templates', () => {
  it('POST rejects missing caption_template', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/post-templates',
      payload: { name: 'Diwali Post' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST rejects a bad context / post_type', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/post-templates',
      payload: {
        name: 'X',
        caption_template: 'Shop {product_name}',
        context: 'REELS',
        post_type: 'STORY',
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST creates with defaults', async () => {
    mockCreate.mockResolvedValueOnce({ id: 't1', name: 'New Arrival', status: 'DRAFT' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/post-templates',
      payload: { name: 'New Arrival', caption_template: '✨ New {product_name} — ₹{price}!' },
    });
    expect(res.statusCode).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'New Arrival',
          context: 'POST',
          status: 'DRAFT',
          plans: [],
          hashtags: [],
          sort_order: 0,
        }),
      }),
    );
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'CREATE' }) }),
    );
  });

  it('POST creates with a full payload', async () => {
    mockCreate.mockResolvedValueOnce({ id: 't2' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/post-templates',
      payload: {
        name: 'Festive Carousel',
        description: 'Diwali multi-product post',
        context: 'BOTH',
        post_type: 'CAROUSEL',
        caption_template: '{product_names} — {festival} edit at {store_name}. {link}',
        hashtags: ['#diwali', '#festive'],
        occasion: 'Diwali',
        status: 'PUBLISHED',
        plans: ['STARTER', 'PRO'],
        sort_order: 3,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          context: 'BOTH',
          post_type: 'CAROUSEL',
          occasion: 'Diwali',
          plans: ['STARTER', 'PRO'],
          sort_order: 3,
        }),
      }),
    );
  });

  it('GET lists all templates sorted', async () => {
    mockFindMany.mockResolvedValueOnce([{ id: 't1' }]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/post-templates' });
    expect(res.statusCode).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith({
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
  });

  it('PATCH updates status + plans + context', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 't1',
      status: 'DRAFT',
      plans: [],
      context: 'POST',
    });
    mockUpdate.mockResolvedValueOnce({
      id: 't1',
      status: 'PUBLISHED',
      plans: ['STARTER'],
      context: 'BOTH',
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/post-templates/t1',
      payload: { status: 'PUBLISHED', plans: ['STARTER'], context: 'BOTH' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PUBLISHED', plans: ['STARTER'], context: 'BOTH' }),
      }),
    );
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'UPDATE' }) }),
    );
  });

  it('PATCH clears a nullable field with null', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 't1',
      status: 'DRAFT',
      plans: [],
      context: 'POST',
    });
    mockUpdate.mockResolvedValueOnce({ id: 't1', occasion: null });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/post-templates/t1',
      payload: { occasion: null },
    });
    expect(res.statusCode).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ occasion: null }) }),
    );
  });

  it('PATCH 404 on missing template', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/post-templates/nope',
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('thumbnail-url returns a presigned PUT under admin/post-templates/', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/post-templates/thumbnail-url',
      payload: { content_type: 'image/jpeg', filename: 'thumb.jpg' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.upload_url).toBe('https://r2.example/put');
    expect(body.data.r2_key).toMatch(/^admin\/post-templates\//);
  });

  it('DELETE removes the row', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 't1', name: 'X', context: 'POST' });
    mockDelete.mockResolvedValueOnce({ id: 't1' });
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/post-templates/t1' });
    expect(res.statusCode).toBe(200);
    expect(mockDelete).toHaveBeenCalled();
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'DELETE' }) }),
    );
  });

  it('DELETE 404 on missing template', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/post-templates/nope' });
    expect(res.statusCode).toBe(404);
  });
});