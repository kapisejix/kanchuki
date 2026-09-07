// Route tests for admin Suits Designs (docs/tasks/suits-designs.md §5).
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

const {
  mockFindMany,
  mockFindUnique,
  mockCount,
  mockGroupBy,
  mockCreate,
  mockUpdate,
  mockDelete,
  mockCategoryFindUnique,
  mockRetailerFindUnique,
  mockRetailerFindMany,
  mockAudit,
  mockWatermarkShowcaseDesign,
  mockDeleteObject,
  mockGetUploadPresignedUrl,
  mockPublicUrl,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
  mockCount: vi.fn(),
  mockGroupBy: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockCategoryFindUnique: vi.fn(),
  mockRetailerFindUnique: vi.fn(),
  mockRetailerFindMany: vi.fn(),
  mockAudit: vi.fn(),
  mockWatermarkShowcaseDesign: vi.fn(),
  mockDeleteObject: vi.fn(),
  mockGetUploadPresignedUrl: vi.fn(),
  mockPublicUrl: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    showcaseDesign: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      count: mockCount,
      groupBy: mockGroupBy,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
    },
    showcaseDesignCategory: { findUnique: mockCategoryFindUnique },
    retailer: { findUnique: mockRetailerFindUnique, findMany: mockRetailerFindMany },
    auditLog: { create: mockAudit },
  },
}));

vi.mock('@kanchuki/ai', () => ({
  getUploadPresignedUrl: mockGetUploadPresignedUrl,
  publicUrl: mockPublicUrl,
  deleteObject: mockDeleteObject,
}));

vi.mock('../../lib/showcase-watermark.js', () => ({
  watermarkShowcaseDesign: mockWatermarkShowcaseDesign,
}));

vi.mock('../admin-auth.js', () => ({ adminAuthPreHandler: async () => undefined }));

const { adminShowcaseDesignRoutes } = await import('./admin-showcase-designs.js');

const GLOBAL_ROW = {
  id: 'design_1',
  retailer_id: null,
  category_id: 'cat_suits',
  category_slug: 'suits',
  name: 'Boat Neck Suit',
  image_url: 'https://cdn.test/showcase-designs/global/1.jpg',
  r2_key: 'showcase-designs/global/1.jpg',
  original_r2_key: 'showcase-designs/global/raw/raw.jpg',
  is_active: true,
  sort_order: 0,
  created_at: new Date('2026-09-07T10:00:00Z'),
  updated_at: new Date('2026-09-07T10:00:00Z'),
};

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(adminShowcaseDesignRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPublicUrl.mockImplementation((key: string) => `https://cdn.test/${key}`);
  mockWatermarkShowcaseDesign.mockResolvedValue({ logo_source: 'builtin', width: 800, height: 600 });
  mockDeleteObject.mockResolvedValue(undefined);
  mockGetUploadPresignedUrl.mockResolvedValue('https://r2/put');
  mockAudit.mockResolvedValue({});
});

describe('GET /showcase-designs', () => {
  it('scope=global filters to retailer_id null and maps the owner', async () => {
    mockFindMany.mockResolvedValue([
      { ...GLOBAL_ROW, category: { name: 'Suits' }, retailer: null },
    ]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/showcase-designs?scope=global' });
    expect(res.statusCode).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ retailer_id: null }) }),
    );
    expect(res.json().data[0].owner).toEqual({ type: 'global' });
    await app.close();
  });

  it('scope=retailer&retailer_id=<id> returns rows for that store with shop_name', async () => {
    mockFindMany.mockResolvedValue([
      {
        ...GLOBAL_ROW,
        id: 'r1',
        retailer_id: 'ret_1',
        category: { name: 'Suits' },
        retailer: { id: 'ret_1', shop_name: 'Radha Store' },
      },
    ]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/showcase-designs?scope=retailer&retailer_id=ret_1',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].owner).toEqual({
      type: 'retailer',
      id: 'ret_1',
      shop_name: 'Radha Store',
    });
    await app.close();
  });
});

describe('GET /showcase-designs/owners', () => {
  it('returns distinct retailers with shop_name and design count, ordered by count desc', async () => {
    mockGroupBy.mockResolvedValue([
      { retailer_id: 'ret_1', _count: { _all: 3 } },
      { retailer_id: 'ret_2', _count: { _all: 1 } },
    ]);
    mockRetailerFindMany.mockResolvedValue([
      { id: 'ret_1', shop_name: 'Radha Store' },
      { id: 'ret_2', shop_name: null },
    ]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/showcase-designs/owners' });
    expect(res.statusCode).toBe(200);
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['retailer_id'],
        where: { retailer_id: { not: null } },
      }),
    );
    expect(mockRetailerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['ret_1', 'ret_2'] } } }),
    );
    expect(res.json().data).toEqual([
      { id: 'ret_1', shop_name: 'Radha Store', design_count: 3 },
      { id: 'ret_2', shop_name: null, design_count: 1 },
    ]);
    await app.close();
  });

  it('returns an empty list when no retailer owns a design', async () => {
    mockGroupBy.mockResolvedValue([]);
    mockRetailerFindMany.mockResolvedValue([]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/showcase-designs/owners' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
    expect(mockRetailerFindMany).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('GET /showcase-designs/stats', () => {
  it('returns total / active / global-vs-retailer / by_category', async () => {
    mockCount
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(7);
    mockGroupBy.mockResolvedValue([
      { category_slug: 'suits', _count: { id: 6 } },
      { category_slug: 'saree', _count: { id: 4 } },
    ]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/showcase-designs/stats' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      total: 10,
      active: 8,
      inactive: 2,
      global: 3,
      retailer: 7,
      by_category: [
        { category_slug: 'suits', count: 6 },
        { category_slug: 'saree', count: 4 },
      ],
    });
    await app.close();
  });
});

describe('POST /showcase-designs', () => {
  it('create defaults to global and runs the watermark with owner null', async () => {
    mockCategoryFindUnique.mockResolvedValue({ id: 'cat_suits', slug: 'suits' });
    mockCreate.mockResolvedValue({ ...GLOBAL_ROW, category: { name: 'Suits' } });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/showcase-designs',
      payload: {
        category_id: 'cat_suits',
        name: 'Boat Neck Suit',
        raw_r2_key: 'showcase-designs/global/raw/raw.jpg',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(mockWatermarkShowcaseDesign).toHaveBeenCalledWith(
      expect.objectContaining({
        rawR2Key: 'showcase-designs/global/raw/raw.jpg',
        ownerRetailerId: null,
      }),
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          retailer_id: null,
          category_slug: 'suits',
          r2_key: expect.stringMatching(/^showcase-designs\/global\/.+\.jpg$/),
        }),
      }),
    );
    await app.close();
  });

  it('create under a retailer validates the retailer and watermarks as that owner', async () => {
    mockCategoryFindUnique.mockResolvedValue({ id: 'cat_suits', slug: 'suits' });
    mockRetailerFindUnique.mockResolvedValue({ id: 'ret_1' });
    mockCreate.mockResolvedValue({ ...GLOBAL_ROW, retailer_id: 'ret_1' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/showcase-designs',
      payload: {
        category_id: 'cat_suits',
        retailer_id: 'ret_1',
        raw_r2_key: 'showcase-designs/ret_1/raw/x.jpg',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(mockWatermarkShowcaseDesign).toHaveBeenCalledWith(
      expect.objectContaining({ ownerRetailerId: 'ret_1' }),
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ retailer_id: 'ret_1' }) }),
    );
    await app.close();
  });

  it('unknown category → 422 before watermarking', async () => {
    mockCategoryFindUnique.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/showcase-designs',
      payload: { category_id: 'nope', raw_r2_key: 'showcase-designs/global/raw/x.jpg' },
    });
    expect(res.statusCode).toBe(422);
    expect(mockWatermarkShowcaseDesign).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('PATCH /showcase-designs/:id', () => {
  it('toggles inactive and re-syncs slug on recategorise', async () => {
    mockFindUnique.mockResolvedValue(GLOBAL_ROW);
    mockCategoryFindUnique.mockResolvedValue({ id: 'cat_blouse', slug: 'blouse' });
    mockUpdate.mockResolvedValue({ ...GLOBAL_ROW, is_active: false });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/showcase-designs/design_1',
      payload: { is_active: false, category_id: 'cat_blouse' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ is_active: false, category_slug: 'blouse' }),
      }),
    );
    await app.close();
  });

  it('photo replace re-watermarks and deletes the old objects', async () => {
    mockFindUnique.mockResolvedValue(GLOBAL_ROW);
    mockUpdate.mockResolvedValue(GLOBAL_ROW);
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/showcase-designs/design_1',
      payload: { raw_r2_key: 'showcase-designs/global/raw/new.jpg' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockWatermarkShowcaseDesign).toHaveBeenCalledTimes(1);
    const deleted = mockDeleteObject.mock.calls.map((c) => c[0]);
    expect(deleted).toContain(GLOBAL_ROW.r2_key);
    expect(deleted).toContain(GLOBAL_ROW.original_r2_key);
    await app.close();
  });
});

describe('DELETE /showcase-designs/:id', () => {
  it('hard-deletes the row and removes both R2 objects', async () => {
    mockFindUnique.mockResolvedValue(GLOBAL_ROW);
    mockDelete.mockResolvedValue({ id: GLOBAL_ROW.id });
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/showcase-designs/design_1' });
    expect(res.statusCode).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: GLOBAL_ROW.id } }),
    );
    expect(mockDeleteObject.mock.calls.map((c) => c[0])).toEqual([
      GLOBAL_ROW.r2_key,
      GLOBAL_ROW.original_r2_key,
    ]);
    await app.close();
  });
});
