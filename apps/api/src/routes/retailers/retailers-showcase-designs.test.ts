// Route tests for retailer Suits Designs (docs/tasks/suits-designs.md §5).
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';
import { retailersShowcaseDesignRoutes } from './retailers-showcase-designs.js';

const {
  mockShowcaseDesignFindMany,
  mockShowcaseDesignCreate,
  mockShowcaseDesignFindFirst,
  mockShowcaseDesignUpdate,
  mockShowcaseDesignDelete,
  mockCategoryFindUnique,
  mockCategoryFindMany,
  mockAuditLogCreate,
  mockHasFeature,
  mockAssertQuota,
  mockGetUsage,
  mockWatermarkShowcaseDesign,
  mockDeleteObject,
  mockGetUploadPresignedUrl,
  mockPublicUrl,
  mockDownloadBuffer,
  mockUploadBuffer,
  mockWatermark,
  mockSuggestDesignNameAndColor,
  mockRecordAiUsage,
} = vi.hoisted(() => ({
  mockShowcaseDesignFindMany: vi.fn(),
  mockShowcaseDesignCreate: vi.fn(),
  mockShowcaseDesignFindFirst: vi.fn(),
  mockShowcaseDesignUpdate: vi.fn(),
  mockShowcaseDesignDelete: vi.fn(),
  mockCategoryFindUnique: vi.fn(),
  mockCategoryFindMany: vi.fn(),
  mockAuditLogCreate: vi.fn(),
  mockHasFeature: vi.fn(),
  mockAssertQuota: vi.fn(),
  mockGetUsage: vi.fn(),
  mockWatermarkShowcaseDesign: vi.fn(),
  mockDeleteObject: vi.fn(),
  mockGetUploadPresignedUrl: vi.fn(),
  mockPublicUrl: vi.fn(),
  mockDownloadBuffer: vi.fn(),
  mockUploadBuffer: vi.fn(),
  mockWatermark: vi.fn(),
  mockSuggestDesignNameAndColor: vi.fn(),
  mockRecordAiUsage: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    showcaseDesign: {
      findMany: mockShowcaseDesignFindMany,
      create: mockShowcaseDesignCreate,
      findFirst: mockShowcaseDesignFindFirst,
      update: mockShowcaseDesignUpdate,
      delete: mockShowcaseDesignDelete,
    },
    showcaseDesignCategory: {
      findUnique: mockCategoryFindUnique,
      findMany: mockCategoryFindMany,
    },
    auditLog: { create: mockAuditLogCreate },
  },
  Prisma: {},
}));

vi.mock('@kanchuki/ai', () => ({
  deleteObject: mockDeleteObject,
  getUploadPresignedUrl: mockGetUploadPresignedUrl,
  publicUrl: mockPublicUrl,
  downloadBuffer: mockDownloadBuffer,
  uploadBuffer: mockUploadBuffer,
  watermark: mockWatermark,
  suggestDesignNameAndColor: mockSuggestDesignNameAndColor,
}));

vi.mock('../../lib/ai-usage.js', () => ({ recordAiUsage: mockRecordAiUsage }));
vi.mock('../../lib/features.js', () => ({ hasFeature: mockHasFeature }));
vi.mock('../../lib/showcase-quota.js', () => ({
  assertShowcaseQuota: mockAssertQuota,
  getShowcaseUsage: mockGetUsage,
}));
vi.mock('../../lib/showcase-watermark.js', () => ({
  watermarkShowcaseDesign: mockWatermarkShowcaseDesign,
}));

const RETAILER_ID = 'retailer_1';

const OWN_ROW = {
  id: 'design_own',
  retailer_id: RETAILER_ID,
  category_id: 'cat_suits',
  category_slug: 'suits',
  name: 'Boat Neck Suit',
  image_url: 'https://cdn.test/showcase-designs/retailer_1/final.jpg',
  r2_key: 'showcase-designs/retailer_1/final.jpg',
  original_r2_key: 'showcase-designs/retailer_1/raw/raw.jpg',
  is_active: true,
  sort_order: 0,
  created_at: new Date('2026-09-07T10:00:00Z'),
  updated_at: new Date('2026-09-07T10:00:00Z'),
};

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
  });
  await app.register(retailersShowcaseDesignRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasFeature.mockResolvedValue(true);
  mockAssertQuota.mockResolvedValue(undefined);
  mockPublicUrl.mockImplementation((key: string) => `https://cdn.test/${key}`);
  mockWatermarkShowcaseDesign.mockResolvedValue({
    logo_source: 'builtin',
    width: 800,
    height: 600,
  });
  mockAuditLogCreate.mockResolvedValue({});
  mockSuggestDesignNameAndColor.mockResolvedValue({ name: null, color: null });
  mockRecordAiUsage.mockReturnValue(() => {});
});

describe('feature gate', () => {
  it('402 when SHOWCASE_DESIGNS is off on the plan', async () => {
    mockHasFeature.mockResolvedValue(false);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/me/showcase-designs' });
    expect(res.statusCode).toBe(402);
    expect(mockShowcaseDesignFindMany).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('GET /me/showcase-designs', () => {
  it('returns own rows + active global rows, category filter applied', async () => {
    mockShowcaseDesignFindMany.mockResolvedValue([
      { ...OWN_ROW, owner: undefined, category: { name: 'Suits' } },
      {
        ...OWN_ROW,
        id: 'design_global',
        retailer_id: null,
        category: { name: 'Suits' },
      },
    ]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/me/showcase-designs?category=suits',
    });
    expect(res.statusCode).toBe(200);
    expect(mockShowcaseDesignFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ retailer_id: RETAILER_ID }, { retailer_id: null, is_active: true }],
          category_slug: 'suits',
        },
      }),
    );
    const data = res.json().data;
    expect(data[0].owner).toBe('self');
    expect(data[1].owner).toBe('global');
    await app.close();
  });
});

describe('GET /me/showcase-designs/categories', () => {
  it('returns active categories with related links', async () => {
    mockCategoryFindMany.mockResolvedValue([
      {
        id: 'cat_saree',
        name: 'Saree',
        slug: 'saree',
        sort_order: 0,
        related_to: [{ id: 'cat_blouse', name: 'Blouse', slug: 'blouse' }],
        related_from: [],
      },
    ]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/me/showcase-designs/categories' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].related).toHaveLength(1);
    expect(mockCategoryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { is_active: true } }),
    );
    await app.close();
  });
});

describe('GET /me/showcase-designs/usage', () => {
  it('returns the used/limit shape', async () => {
    mockGetUsage.mockResolvedValue({ used: 5, limit: 60, remaining: 55, unlimited: false });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/me/showcase-designs/usage' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ used: 5, limit: 60, remaining: 55, unlimited: false });
    await app.close();
  });
});

describe('POST /me/showcase-designs/upload-url', () => {
  it('returns a presigned PUT under the retailer raw path', async () => {
    mockGetUploadPresignedUrl.mockResolvedValue('https://r2/presigned');
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/me/showcase-designs/upload-url',
      headers: { 'content-type': 'application/json' },
      payload: { content_type: 'image/jpeg', filename: 'design.jpg' },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.upload_url).toBe('https://r2/presigned');
    expect(data.r2_key).toMatch(/^showcase-designs\/retailer_1\/raw\/.+\.jpg$/);
    await app.close();
  });
});

describe('POST /me/showcase-designs', () => {
  it('watermarks the raw upload, then persists the final image', async () => {
    mockCategoryFindUnique.mockResolvedValue({ id: 'cat_suits', slug: 'suits' });
    mockShowcaseDesignCreate.mockResolvedValue({
      ...OWN_ROW,
      category: { name: 'Suits' },
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/me/showcase-designs',
      headers: { 'content-type': 'application/json' },
      payload: {
        category_id: 'cat_suits',
        name: 'Boat Neck Suit',
        raw_r2_key: 'showcase-designs/retailer_1/raw/raw.jpg',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(mockAssertQuota).toHaveBeenCalledWith(RETAILER_ID);
    expect(mockCategoryFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cat_suits' } }),
    );
    // Watermark step ran with the retailer as owner, then a final key was stored.
    expect(mockWatermarkShowcaseDesign).toHaveBeenCalledWith(
      expect.objectContaining({
        rawR2Key: 'showcase-designs/retailer_1/raw/raw.jpg',
        ownerRetailerId: RETAILER_ID,
      }),
    );
    expect(mockShowcaseDesignCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          retailer_id: RETAILER_ID,
          category_slug: 'suits',
          image_url: expect.stringMatching(
            /^https:\/\/cdn\.test\/showcase-designs\/retailer_1\/.+\.jpg$/,
          ),
          original_r2_key: 'showcase-designs/retailer_1/raw/raw.jpg',
        }),
      }),
    );
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'create' }) }),
    );
    await app.close();
  });

  it('auto-suggests an AI name when the retailer saves without one', async () => {
    mockCategoryFindUnique.mockResolvedValue({ id: 'cat_suits', slug: 'suits' });
    mockShowcaseDesignCreate.mockResolvedValue({ ...OWN_ROW, category: { name: 'Suits' } });
    mockSuggestDesignNameAndColor.mockResolvedValue({
      name: 'Pink Blouse - Deep Neck',
      color: 'Pink',
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/me/showcase-designs',
      headers: { 'content-type': 'application/json' },
      payload: {
        category_id: 'cat_suits',
        // no name — let AI fill it
        raw_r2_key: 'showcase-designs/retailer_1/raw/raw.jpg',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(mockSuggestDesignNameAndColor).toHaveBeenCalledTimes(1);
    expect(mockSuggestDesignNameAndColor).toHaveBeenCalledWith(
      'https://cdn.test/showcase-designs/retailer_1/raw/raw.jpg',
      expect.any(Object),
    );
    expect(mockShowcaseDesignCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Pink Blouse - Deep Neck' }),
      }),
    );
    await app.close();
  });

  it('skips AI suggestion when a name is provided', async () => {
    mockCategoryFindUnique.mockResolvedValue({ id: 'cat_suits', slug: 'suits' });
    mockShowcaseDesignCreate.mockResolvedValue({ ...OWN_ROW, category: { name: 'Suits' } });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/me/showcase-designs',
      headers: { 'content-type': 'application/json' },
      payload: {
        category_id: 'cat_suits',
        name: 'Hand-Typed Suit',
        raw_r2_key: 'showcase-designs/retailer_1/raw/raw.jpg',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(mockSuggestDesignNameAndColor).not.toHaveBeenCalled();
    await app.close();
  });

  describe('POST /me/showcase-designs/suggest', () => {
    it('returns the AI-suggested name + color and attributes usage', async () => {
      mockSuggestDesignNameAndColor.mockResolvedValue({
        name: 'Pink Blouse - Deep Neck',
        color: 'Pink',
      });
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/me/showcase-designs/suggest',
        headers: { 'content-type': 'application/json' },
        payload: { raw_r2_key: 'showcase-designs/retailer_1/raw/raw.jpg' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({
        name: 'Pink Blouse - Deep Neck',
        color: 'Pink',
      });
      expect(mockSuggestDesignNameAndColor).toHaveBeenCalledTimes(1);
      await app.close();
    });

    it('fail-opens to nulls when AI is unavailable', async () => {
      mockSuggestDesignNameAndColor.mockResolvedValue({ name: null, color: null });
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/me/showcase-designs/suggest',
        headers: { 'content-type': 'application/json' },
        payload: { raw_r2_key: 'showcase-designs/retailer_1/raw/raw.jpg' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ name: null, color: null });
      await app.close();
    });

    it('rejects a raw_r2_key outside the caller’s own prefix', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/me/showcase-designs/suggest',
        headers: { 'content-type': 'application/json' },
        payload: { raw_r2_key: 'showcase-designs/retailer_2/raw/victim.jpg' },
      });
      expect(res.statusCode).toBe(422);
      expect(mockSuggestDesignNameAndColor).not.toHaveBeenCalled();
      await app.close();
    });
  });

  it('rejects an unknown category before watermarking', async () => {
    mockCategoryFindUnique.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/me/showcase-designs',
      headers: { 'content-type': 'application/json' },
      payload: {
        category_id: 'nope',
        raw_r2_key: 'showcase-designs/retailer_1/raw/raw.jpg',
      },
    });
    expect(res.statusCode).toBe(422);
    expect(mockWatermarkShowcaseDesign).not.toHaveBeenCalled();
    expect(mockShowcaseDesignCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects a raw_r2_key outside the caller’s own upload prefix (no cross-tenant republish)', async () => {
    mockCategoryFindUnique.mockResolvedValue({ id: 'cat_suits', slug: 'suits' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/me/showcase-designs',
      headers: { 'content-type': 'application/json' },
      payload: {
        category_id: 'cat_suits',
        // another retailer's raw upload
        raw_r2_key: 'showcase-designs/retailer_2/raw/victim.jpg',
      },
    });
    expect(res.statusCode).toBe(422);
    expect(mockWatermarkShowcaseDesign).not.toHaveBeenCalled();
    expect(mockShowcaseDesignCreate).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('PUT /me/showcase-designs/:id', () => {
  it('403/404 for a row the retailer does not own (global or other)', async () => {
    mockShowcaseDesignFindFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/me/showcase-designs/design_global',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Renamed' },
    });
    expect(res.statusCode).toBe(404);
    expect(mockShowcaseDesignUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it('renames / recategorises an owned row and re-syncs the slug', async () => {
    mockShowcaseDesignFindFirst.mockResolvedValue(OWN_ROW);
    mockCategoryFindUnique.mockResolvedValue({ id: 'cat_blouse', slug: 'blouse' });
    mockShowcaseDesignUpdate.mockResolvedValue({ ...OWN_ROW, category_slug: 'blouse' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/me/showcase-designs/design_own',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Renamed', category_id: 'cat_blouse' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockShowcaseDesignUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Renamed', category_slug: 'blouse' }),
      }),
    );
    // No photo replace → watermark must NOT run.
    expect(mockWatermarkShowcaseDesign).not.toHaveBeenCalled();
    await app.close();
  });

  it('photo replace re-watermarks and cleans up the old final + old raw', async () => {
    mockShowcaseDesignFindFirst.mockResolvedValue(OWN_ROW);
    mockShowcaseDesignUpdate.mockResolvedValue(OWN_ROW);
    mockDeleteObject.mockResolvedValue(undefined);
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/me/showcase-designs/design_own',
      headers: { 'content-type': 'application/json' },
      payload: { raw_r2_key: 'showcase-designs/retailer_1/raw/new.jpg' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockWatermarkShowcaseDesign).toHaveBeenCalledTimes(1);
    // old final + old raw deleted (new raw is the caller's upload)
    const deleted = mockDeleteObject.mock.calls.map((c) => c[0]);
    expect(deleted).toContain(OWN_ROW.r2_key);
    expect(deleted).toContain(OWN_ROW.original_r2_key);
    await app.close();
  });
});

describe('DELETE /me/showcase-designs/:id', () => {
  it('hard-deletes an owned row and cleans up R2 objects', async () => {
    mockShowcaseDesignFindFirst.mockResolvedValue(OWN_ROW);
    mockShowcaseDesignDelete.mockResolvedValue({ id: OWN_ROW.id });
    mockDeleteObject.mockResolvedValue(undefined);
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/me/showcase-designs/design_own' });
    expect(res.statusCode).toBe(204);
    expect(mockShowcaseDesignDelete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: OWN_ROW.id } }),
    );
    expect(mockDeleteObject.mock.calls.map((c) => c[0])).toEqual([
      OWN_ROW.r2_key,
      OWN_ROW.original_r2_key,
    ]);
    await app.close();
  });

  it('cannot delete a global / other-retailer design', async () => {
    mockShowcaseDesignFindFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/me/showcase-designs/design_global' });
    expect(res.statusCode).toBe(404);
    expect(mockShowcaseDesignDelete).not.toHaveBeenCalled();
    await app.close();
  });
});
