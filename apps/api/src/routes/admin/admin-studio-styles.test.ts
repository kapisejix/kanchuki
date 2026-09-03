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
    studioStyle: {
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

const { adminStudioStylesRoutes } = await import('./admin-studio-styles.js');

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(adminStudioStylesRoutes);
  await app.ready();
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('admin studio-styles', () => {
  it('POST rejects a bad slug', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/studio-styles',
      payload: { slug: 'Bad Slug!', label: 'X', description: 'd', prompt: 'p', tab: 'MODEL' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST 409 on duplicate slug', async () => {
    mockFindFirst.mockResolvedValueOnce({ id: 's1', slug: 'pastel_gradient' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/studio-styles',
      payload: { slug: 'pastel_gradient', label: 'X', description: 'd', prompt: 'p', tab: 'MODEL' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('POST creates with defaults', async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({ id: 's2', slug: 'new_scene', status: 'DRAFT', plans: [] });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/studio-styles',
      payload: { slug: 'new_scene', label: 'New', description: 'd', prompt: 'p', tab: 'PRODUCT' },
    });
    expect(res.statusCode).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: 'new_scene', status: 'DRAFT' }),
      }),
    );
  });

  it('PATCH rejects changing slug', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 's1', slug: 'pastel_gradient' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/studio-styles/s1',
      payload: { slug: 'renamed' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('PATCH updates status + plans', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 's1',
      slug: 'pastel_gradient',
      status: 'DRAFT',
      plans: [],
    });
    mockUpdate.mockResolvedValueOnce({ id: 's1', status: 'PUBLISHED', plans: ['STARTER', 'PRO'] });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/studio-styles/s1',
      payload: { status: 'PUBLISHED', plans: ['STARTER', 'PRO'] },
    });
    expect(res.statusCode).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PUBLISHED', plans: ['STARTER', 'PRO'] }),
      }),
    );
  });

  it('thumbnail-url returns a presigned PUT', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/studio-styles/thumbnail-url',
      payload: { content_type: 'image/jpeg', filename: 'shot.jpg' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.upload_url).toBe('https://r2.example/put');
    expect(body.data.r2_key).toMatch(/^admin\/studio-styles\//);
  });

  it('DELETE removes the row + best-effort thumb cleanup', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 's1',
      slug: 'x',
      thumbnail_r2_key: 'admin/studio-styles/a.jpg',
    });
    mockDelete.mockResolvedValueOnce({ id: 's1' });
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/studio-styles/s1' });
    expect(res.statusCode).toBe(200);
    expect(mockDelete).toHaveBeenCalled();
  });
});
