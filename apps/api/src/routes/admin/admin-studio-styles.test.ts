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

const { mockInspect } = vi.hoisted(() => ({ mockInspect: vi.fn() }));
vi.mock('@kanchuki/ai', () => ({
  getUploadPresignedUrl: vi.fn(async () => 'https://r2.example/put'),
  publicUrl: (k: string) => `https://cdn.example/${k}`,
  deleteObject: vi.fn(async () => undefined),
  inspectObject: mockInspect,
}));
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

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
      payload: { content_type: 'image/jpeg', filename: 'shot.jpg', content_length: 1_000 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.upload_url).toBe('https://r2.example/put');
    expect(body.data.r2_key).toMatch(/^uploads\/pending\/admin\/studio-styles\//);
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

  it('PATCH thumbnail: URL is built from the verified key, a client URL is ignored', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 't1', slug: 's', status: 'DRAFT', plans: [] });
    mockUpdate.mockResolvedValueOnce({ id: 't1' });
    mockInspect.mockResolvedValueOnce({ size: 1000, head: JPEG });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/studio-styles/t1',
      payload: {
        thumbnail_r2_key: 'admin/studio-styles/a.jpg',
        thumbnail_url: 'https://evil.example/x.svg',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          thumbnail_url: 'https://cdn.example/admin/studio-styles/a.jpg',
          thumbnail_r2_key: 'admin/studio-styles/a.jpg',
        }),
      }),
    );
  });

  it('PATCH thumbnail: rejects a key outside admin/studio-styles/ without touching storage', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 't1', slug: 's', status: 'DRAFT', plans: [] });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/studio-styles/t1',
      payload: { thumbnail_r2_key: 'retailers/r1/products/p/a.jpg' },
    });
    expect(res.statusCode).toBe(422);
    expect(mockInspect).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // ─── F-034 T6: VIDEO styles ───
  const base = { label: 'V', description: 'd', prompt: 'slow pan', tab: 'PRODUCT' };
  async function post(payload: Record<string, unknown>) {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({ id: 'v1', slug: payload.slug, kind: payload.kind });
    const app = await buildApp();
    return app.inject({ method: 'POST', url: '/studio-styles', payload });
  }

  it('POST VIDEO needs default_aspect and duration_sec', async () => {
    expect((await post({ ...base, slug: 'v_a', kind: 'VIDEO', duration_sec: 5 })).statusCode).toBe(
      422,
    );
    expect(
      (await post({ ...base, slug: 'v_b', kind: 'VIDEO', default_aspect: '9:16' })).statusCode,
    ).toBe(422);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('POST VIDEO rejects an image engine and an out-of-range duration', async () => {
    const v = { ...base, kind: 'VIDEO', default_aspect: '9:16', duration_sec: 5 };
    expect((await post({ ...v, slug: 'v_c', engine: 'flux_kontext' })).statusCode).toBe(422);
    expect((await post({ ...v, slug: 'v_d', duration_sec: 9 })).statusCode).toBeGreaterThanOrEqual(
      400,
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('POST IMAGE rejects video-only fields', async () => {
    expect((await post({ ...base, slug: 'i_a', default_aspect: '1:1' })).statusCode).toBe(422);
    expect((await post({ ...base, slug: 'i_b', duration_sec: 4 })).statusCode).toBe(422);
    expect((await post({ ...base, slug: 'i_c', no_person: true })).statusCode).toBe(422);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('POST VIDEO creates with its fields', async () => {
    const res = await post({
      ...base,
      slug: 'v_ok',
      kind: 'VIDEO',
      default_aspect: '4:5',
      duration_sec: 5,
      no_person: true,
    });
    expect(res.statusCode).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'VIDEO',
        default_aspect: '4:5',
        duration_sec: 5,
        no_person: true,
        engine: null,
      }),
    });
  });

  it('PATCH rejects changing kind', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 's1', slug: 's', kind: 'IMAGE' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/studio-styles/s1',
      payload: { kind: 'VIDEO' },
    });
    expect(res.statusCode).toBe(422);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('PATCH validates the merged row: clearing a VIDEO aspect is refused', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'v1',
      slug: 'v',
      kind: 'VIDEO',
      engine: null,
      default_aspect: '9:16',
      duration_sec: 5,
      no_person: false,
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/studio-styles/v1',
      payload: { default_aspect: null },
    });
    expect(res.statusCode).toBe(422);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('PATCH updates VIDEO duration', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'v1',
      slug: 'v',
      kind: 'VIDEO',
      engine: null,
      default_aspect: '9:16',
      duration_sec: 5,
      no_person: false,
    });
    mockUpdate.mockResolvedValueOnce({ id: 'v1' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/studio-styles/v1',
      payload: { duration_sec: 8 },
    });
    expect(res.statusCode).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { duration_sec: 8 } });
  });
});
