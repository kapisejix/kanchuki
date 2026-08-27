import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { productRoutes } from './products.js';

const {
  mockProductFindFirst,
  mockProductFindMany,
  mockProductUpdate,
  mockProductDelete,
  mockPhotoFindFirst,
  mockPhotoUpdate,
  mockPhotoUpdateMany,
  mockPhotoFindUnique,
  mockBackgroundImageFindFirst,
  mockTransaction,
  mockHasFeature,
  mockFetchImageBuffer,
  mockUploadBuffer,
  mockRotateImage,
  mockGetDownloadPresignedUrl,
  mockCleanupProductPhoto,
  mockPhotoDelete,
  mockVariantFindFirst,
  mockVariantUpdate,
  mockDeleteObject,
  MockPrismaClientKnownRequestError,
} = vi.hoisted(() => {
  class MockPrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    mockProductFindFirst: vi.fn(),
    mockProductFindMany: vi.fn(),
    mockProductUpdate: vi.fn(),
    mockProductDelete: vi.fn(),
    mockPhotoFindFirst: vi.fn(),
    mockPhotoUpdate: vi.fn(),
    mockPhotoUpdateMany: vi.fn(),
    mockPhotoFindUnique: vi.fn(),
    mockBackgroundImageFindFirst: vi.fn(),
    mockTransaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    mockHasFeature: vi.fn(),
    mockFetchImageBuffer: vi.fn(),
    mockUploadBuffer: vi.fn(),
    mockRotateImage: vi.fn(),
    mockGetDownloadPresignedUrl: vi.fn(),
    mockCleanupProductPhoto: vi.fn().mockResolvedValue(Buffer.from('cleaned')),
    mockPhotoDelete: vi.fn().mockResolvedValue(undefined),
    mockVariantFindFirst: vi.fn().mockResolvedValue(null),
    mockVariantUpdate: vi.fn().mockResolvedValue(undefined),
    mockDeleteObject: vi.fn().mockResolvedValue(undefined),
    MockPrismaClientKnownRequestError,
  };
});

vi.mock('@kanchuki/db', () => ({
  vaultDelete: vi.fn(),
  prisma: {
    product: {
      findFirst: mockProductFindFirst,
      findMany: mockProductFindMany,
      update: mockProductUpdate,
      delete: mockProductDelete,
      count: vi.fn(),
    },
    productPhoto: {
      findFirst: mockPhotoFindFirst,
      update: mockPhotoUpdate,
      updateMany: mockPhotoUpdateMany,
      findUnique: mockPhotoFindUnique,
      delete: mockPhotoDelete,
    },
    productVariant: {
      findFirst: mockVariantFindFirst,
      update: mockVariantUpdate,
      create: vi.fn(),
    },
    backgroundImage: { findFirst: mockBackgroundImageFindFirst },
    $transaction: mockTransaction,
    retailer: { findUniqueOrThrow: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  // F-026: purge route uses the scoped purge-role client (bypasses the F-017
  // guardrail trigger + the DELETE-less kanchuki_app role) instead of `prisma`.
  getPurgePrisma: () => ({
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    product: { delete: mockProductDelete },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  }),
  Prisma: { PrismaClientKnownRequestError: MockPrismaClientKnownRequestError },
}));

vi.mock('@kanchuki/ai', () => ({
  cleanupProductPhoto: mockCleanupProductPhoto,
  fetchImageBuffer: mockFetchImageBuffer,
  getDownloadPresignedUrl: mockGetDownloadPresignedUrl,
  getUploadPresignedUrl: vi.fn(),
  publicUrl: vi.fn(),
  uploadBuffer: mockUploadBuffer,
  rotateImage: mockRotateImage,
  deleteObject: mockDeleteObject,
  MATCH_SIMILARITY_THRESHOLD: 0.9,
  MIN_CONFIDENCE_FOR_MATCHING: 0.5,
  detectColor: vi.fn(),
}));

vi.mock('@kanchuki/shared', () => ({
  R2_PATHS: {},
  SIZE_OPTIONS: [],
}));

vi.mock('../jobs/index.js', () => ({
  addEmbeddingJob: vi.fn(),
  addSpinFrameJob: vi.fn(),
  addTaggingJob: vi.fn(),
}));

import { addTaggingJob } from '../jobs/index.js';

vi.mock('../lib/quota.js', () => ({
  checkQuota: vi.fn(),
  incrementUsage: vi.fn(),
}));

vi.mock('../lib/features.js', () => ({
  hasFeature: mockHasFeature,
}));

const RETAILER_ID = 'retailer_1';

async function buildApp(staffRole: string | null) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('staffRole', null);
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
    request.staffRole = staffRole;
  });
  await app.register(productRoutes, { prefix: '/v1/products' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /products/deleted', () => {
  it('owner can list soft-deleted products', async () => {
    mockProductFindMany.mockResolvedValue([{ id: 'p1', deleted_at: new Date() }]);
    const app = await buildApp(null);
    const res = await app.inject({ method: 'GET', url: '/v1/products/deleted' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    await app.close();
  });

  it('staff cannot view the trash tab', async () => {
    const app = await buildApp('salesperson');
    const res = await app.inject({ method: 'GET', url: '/v1/products/deleted' });
    expect(res.statusCode).toBe(403);
    expect(mockProductFindMany).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /products/:id/retag', () => {
  it('re-queues the tagging job for the primary photo and clears the previous outcome', async () => {
    (addTaggingJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    mockProductFindFirst.mockResolvedValue({
      id: 'p1',
      photos: [
        { id: 'ph1', url: 'https://cdn.example.com/p1.jpg', r2_key: 'k1', is_primary: true },
      ],
    });
    mockProductUpdate.mockResolvedValue({ id: 'p1', ai_tagged: false, ai_tag_error: null });
    const app = await buildApp(null);
    const res = await app.inject({ method: 'POST', url: '/v1/products/p1/retag' });
    expect(res.statusCode).toBe(202);
    expect(res.json().data).toEqual({ retag_queued: true });
    expect(mockProductUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { ai_tagged: false, ai_tag_error: null },
    });
    expect(addTaggingJob).toHaveBeenCalledWith({
      product_id: 'p1',
      retailer_id: RETAILER_ID,
      photo_url: 'https://cdn.example.com/p1.jpg',
      r2_key: 'k1',
      auto_cleanup: false,
    });
    await app.close();
  });

  it('404s when the product does not exist', async () => {
    mockProductFindFirst.mockResolvedValue(null);
    const app = await buildApp(null);
    const res = await app.inject({ method: 'POST', url: '/v1/products/missing/retag' });
    expect(res.statusCode).toBe(404);
    expect(addTaggingJob).not.toHaveBeenCalled();
    await app.close();
  });

  it('422s when the product has no primary photo to tag', async () => {
    mockProductFindFirst.mockResolvedValue({ id: 'p1', photos: [] });
    const app = await buildApp(null);
    const res = await app.inject({ method: 'POST', url: '/v1/products/p1/retag' });
    expect(res.statusCode).toBe(422);
    expect(addTaggingJob).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('PATCH /products/:id/restore', () => {
  it('owner can restore a soft-deleted product', async () => {
    mockProductFindFirst.mockResolvedValue({ id: 'p1', deleted_at: new Date() });
    mockProductUpdate.mockResolvedValue({ id: 'p1', deleted_at: null });
    const app = await buildApp(null);
    const res = await app.inject({ method: 'PATCH', url: '/v1/products/p1/restore' });
    expect(res.statusCode).toBe(200);
    expect(mockProductUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { deleted_at: null },
    });
    await app.close();
  });

  it('staff cannot restore', async () => {
    const app = await buildApp('salesperson');
    const res = await app.inject({ method: 'PATCH', url: '/v1/products/p1/restore' });
    expect(res.statusCode).toBe(403);
    expect(mockProductFindFirst).not.toHaveBeenCalled();
    await app.close();
  });

  it('404s when the product is not in the trash', async () => {
    mockProductFindFirst.mockResolvedValue(null);
    const app = await buildApp(null);
    const res = await app.inject({ method: 'PATCH', url: '/v1/products/missing/restore' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('DELETE /products/:id/purge', () => {
  it('owner can permanently purge a soft-deleted product', async () => {
    mockProductFindFirst.mockResolvedValue({ id: 'p1', deleted_at: new Date() });
    mockProductDelete.mockResolvedValue({ id: 'p1' });
    const app = await buildApp(null);
    const res = await app.inject({ method: 'DELETE', url: '/v1/products/p1/purge' });
    expect(res.statusCode).toBe(204);
    expect(mockProductDelete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    await app.close();
  });

  it('staff cannot purge', async () => {
    const app = await buildApp('manager');
    const res = await app.inject({ method: 'DELETE', url: '/v1/products/p1/purge' });
    expect(res.statusCode).toBe(403);
    expect(mockProductFindFirst).not.toHaveBeenCalled();
    await app.close();
  });

  it('surfaces a clear error when the product is referenced by an order/collection (FK constraint)', async () => {
    mockProductFindFirst.mockResolvedValue({ id: 'p1', deleted_at: new Date() });
    mockProductDelete.mockRejectedValue(
      new MockPrismaClientKnownRequestError('FK violation', 'P2003'),
    );
    const app = await buildApp(null);
    const res = await app.inject({ method: 'DELETE', url: '/v1/products/p1/purge' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('past order or collection');
    await app.close();
  });
});

describe('GET /products — F-025 SKU lookup', () => {
  const skuProduct = {
    id: 'p1',
    sku: 'LS0001',
    photos: [],
    section: null,
    created_at: new Date(),
    mrp: null,
    price_min: null,
    price_max: null,
    name: null,
    category: null,
    primary_color: null,
    occasions: [],
    location_notes: null,
    status: 'AVAILABLE',
    _count: { spin_frames: 0 },
  };

  it('filters by exact SKU, normalizing lowercase scan input to uppercase', async () => {
    mockProductFindMany.mockResolvedValue([skuProduct]);
    const app = await buildApp(null);
    const res = await app.inject({ method: 'GET', url: '/v1/products?sku=ls0001' });
    expect(res.statusCode).toBe(200);
    expect(mockProductFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          retailer_id: RETAILER_ID,
          deleted_at: null,
          sku: 'LS0001',
        }),
      }),
    );
    await app.close();
  });

  it('is usable by shop staff — the SKU param carries NO owner-only gate (scan-to-sell at the counter)', async () => {
    mockProductFindMany.mockResolvedValue([skuProduct]);
    const app = await buildApp('salesperson');
    const res = await app.inject({ method: 'GET', url: '/v1/products?sku=LS0001' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    await app.close();
  });

  it('returns an empty list for an unknown SKU', async () => {
    mockProductFindMany.mockResolvedValue([]);
    const app = await buildApp(null);
    const res = await app.inject({ method: 'GET', url: '/v1/products?sku=NOPE99' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
    await app.close();
  });
});

describe('POST /products/:id/photos/:photoId/rotate', () => {
  it('rotates the primary photo 90°, swaps stored width/height', async () => {
    mockPhotoFindFirst.mockResolvedValue({
      id: 'photo_1',
      product_id: 'prod_1',
      retailer_id: RETAILER_ID,
      url: 'https://cdn.example.com/p.jpg',
      r2_key: 'products/prod_1/p.jpg',
      width: 800,
      height: 600,
      metadata: null,
    });
    mockFetchImageBuffer.mockResolvedValue(Buffer.from('raw'));
    mockRotateImage.mockResolvedValue({ buffer: Buffer.from('rotated'), width: 600, height: 800 });
    mockUploadBuffer.mockResolvedValue(undefined);
    mockPhotoUpdate.mockResolvedValue({});

    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/prod_1/photos/photo_1/rotate',
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toMatchObject({ id: 'photo_1', target: 'primary', width: 600, height: 800 });
    // The stored URL must change (a version query param) even though the
    // r2_key doesn't — otherwise CDN/client image caches keep showing the
    // pre-rotate bytes at the unchanged URL forever.
    expect(body.data.url).toMatch(/^https:\/\/cdn\.example\.com\/p\.jpg\?v=\d+$/);
    expect(mockRotateImage).toHaveBeenCalledWith(Buffer.from('raw'), 90);
    expect(mockUploadBuffer).toHaveBeenCalledWith(
      'products/prod_1/p.jpg',
      Buffer.from('rotated'),
      'image/jpeg',
    );
    expect(mockPhotoUpdate).toHaveBeenCalledWith({
      where: { id: 'photo_1' },
      data: { url: body.data.url, width: 600, height: 800 },
    });
  });

  it('rotates the preserved original, leaving primary width/height untouched', async () => {
    mockPhotoFindFirst.mockResolvedValue({
      id: 'photo_1',
      product_id: 'prod_1',
      retailer_id: RETAILER_ID,
      url: 'https://cdn.example.com/p.jpg',
      r2_key: 'products/prod_1/p.jpg',
      width: 800,
      height: 600,
      metadata: { original_r2_key: 'products/prod_1/p-original.jpg' },
    });
    mockGetDownloadPresignedUrl.mockResolvedValue('https://signed.example.com/original.jpg');
    mockFetchImageBuffer.mockResolvedValue(Buffer.from('raw-original'));
    mockRotateImage.mockResolvedValue({
      buffer: Buffer.from('rotated-original'),
      width: 600,
      height: 800,
    });
    mockUploadBuffer.mockResolvedValue(undefined);

    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/prod_1/photos/photo_1/rotate',
      payload: { target: 'original' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toMatchObject({
      id: 'photo_1',
      target: 'original',
      url: 'https://signed.example.com/original.jpg',
    });
    expect(mockUploadBuffer).toHaveBeenCalledWith(
      'products/prod_1/p-original.jpg',
      Buffer.from('rotated-original'),
      'image/jpeg',
    );
    expect(mockPhotoUpdate).not.toHaveBeenCalled();
  });

  it('422s when target=original has no preserved original', async () => {
    mockPhotoFindFirst.mockResolvedValue({
      id: 'photo_1',
      product_id: 'prod_1',
      retailer_id: RETAILER_ID,
      url: 'https://cdn.example.com/p.jpg',
      r2_key: 'products/prod_1/p.jpg',
      width: 800,
      height: 600,
      metadata: null,
    });

    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/prod_1/photos/photo_1/rotate',
      payload: { target: 'original' },
    });

    expect(res.statusCode).toBe(422);
  });

  it('404s for a photo not owned by the requesting retailer', async () => {
    mockPhotoFindFirst.mockResolvedValue(null);

    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/prod_1/photos/photo_1/rotate',
      payload: {},
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /products/:id/photos/:photoId — is_primary promotion (F-029)', () => {
  const photo = {
    id: 'photo_1',
    product_id: 'prod_1',
    retailer_id: RETAILER_ID,
    url: 'https://cdn.example.com/p.jpg',
    r2_key: 'products/prod_1/p.jpg',
    width: 800,
    height: 600,
    is_primary: false,
    metadata: null,
  };

  it('promotes the viewed photo to main — demotes every other photo atomically', async () => {
    mockPhotoFindFirst.mockResolvedValue(photo);
    mockPhotoUpdateMany.mockResolvedValue({ count: 2 });
    mockPhotoUpdate.mockResolvedValue({ ...photo, is_primary: true });
    mockPhotoFindUnique.mockResolvedValue({ ...photo, is_primary: true });

    const app = await buildApp(null);
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/products/prod_1/photos/photo_1',
      payload: { is_primary: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ id: 'photo_1', is_primary: true });
    // Demote-all first, then promote this one — inside one transaction so
    // exactly one primary is guaranteed even on a concurrent edit.
    expect(mockPhotoUpdateMany).toHaveBeenCalledWith({
      where: { product_id: 'prod_1', retailer_id: RETAILER_ID },
      data: { is_primary: false },
    });
    expect(mockPhotoUpdate).toHaveBeenCalledWith({
      where: { id: 'photo_1' },
      data: { is_primary: true },
    });
    expect(mockPhotoFindUnique).toHaveBeenCalledWith({ where: { id: 'photo_1' } });
    // Both ops must run inside one $transaction — a partial failure would
    // otherwise leave zero or two primaries.
    expect(mockTransaction).toHaveBeenCalledWith([expect.anything(), expect.anything()]);
  });

  it('still allows piece_type-only PATCH (no promotion, no demotion)', async () => {
    mockPhotoFindFirst.mockResolvedValue(photo);
    mockPhotoUpdate.mockResolvedValue({ ...photo, piece_type: 'upper' });

    const app = await buildApp(null);
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/products/prod_1/photos/photo_1',
      payload: { piece_type: 'upper' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockPhotoUpdateMany).not.toHaveBeenCalled();
    expect(mockPhotoUpdate).toHaveBeenCalledWith({
      where: { id: 'photo_1' },
      data: { piece_type: 'upper' },
    });
  });

  it('404s for a photo not owned by the requesting retailer', async () => {
    mockPhotoFindFirst.mockResolvedValue(null);

    const app = await buildApp(null);
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/products/prod_1/photos/photo_1',
      payload: { is_primary: true },
    });

    expect(res.statusCode).toBe(404);
    expect(mockPhotoUpdateMany).not.toHaveBeenCalled();
  });
});

describe('POST /products/:id/photos/:photoId/cleanup — per-photo background (F-029)', () => {
  const photoWithProduct = {
    id: 'photo_1',
    product_id: 'prod_1',
    retailer_id: RETAILER_ID,
    url: 'https://cdn.example.com/p.jpg',
    r2_key: 'products/prod_1/p.jpg',
    width: 800,
    height: 600,
    is_primary: true,
    metadata: null,
    product: { background_image: null },
  };

  beforeEach(() => {
    mockFetchImageBuffer.mockResolvedValue(Buffer.from('raw'));
    mockUploadBuffer.mockResolvedValue(undefined);
    mockCleanupProductPhoto.mockResolvedValue(Buffer.from('cleaned'));
    mockHasFeature.mockResolvedValue(true);
  });

  it('composites the viewed photo onto the requested active backdrop', async () => {
    mockPhotoFindFirst.mockResolvedValue(photoWithProduct);
    mockBackgroundImageFindFirst.mockResolvedValue({
      id: 'bg_1',
      image_url: 'https://cdn.example.com/bg.jpg',
      is_active: true,
    });

    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/prod_1/photos/photo_1/cleanup',
      payload: { background_image_id: 'bg_1' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.id).toBe('photo_1');
    // The stored URL must be re-versioned after the in-place overwrite —
    // same reasoning as the rotate route above.
    expect(body.data.url).toMatch(/^https:\/\/cdn\.example\.com\/p\.jpg\?v=\d+$/);
    expect(mockPhotoUpdate).toHaveBeenCalledWith({
      where: { id: 'photo_1' },
      data: { url: body.data.url },
    });
    // Explicit per-photo backdrop wins over the product-level background.
    expect(mockBackgroundImageFindFirst).toHaveBeenCalledWith({
      where: { id: 'bg_1', is_active: true },
    });
  });

  it('applies an admin backdrop even when the plan lacks CUSTOM_BACKGROUND_LIBRARY (gate removed 2026-08-09)', async () => {
    // The CUSTOM_BACKGROUND_LIBRARY plan gate was removed per user decision —
    // every retailer can composite onto an admin-curated backdrop now. The
    // feature flag is explicitly OFF here to lock in that the lookup +
    // composite path runs regardless of the plan feature.
    mockPhotoFindFirst.mockResolvedValue(photoWithProduct);
    mockHasFeature.mockResolvedValue(false);
    mockBackgroundImageFindFirst.mockResolvedValue({
      id: 'bg_1',
      image_url: 'https://cdn.example.com/bg.jpg',
      is_active: true,
    });

    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/prod_1/photos/photo_1/cleanup',
      payload: { background_image_id: 'bg_1' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockBackgroundImageFindFirst).toHaveBeenCalledWith({
      where: { id: 'bg_1', is_active: true },
    });
    expect(mockUploadBuffer).toHaveBeenCalled();
  });

  it('422s when the requested backdrop is inactive or missing', async () => {
    mockPhotoFindFirst.mockResolvedValue(photoWithProduct);
    mockBackgroundImageFindFirst.mockResolvedValue(null);

    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/prod_1/photos/photo_1/cleanup',
      payload: { background_image_id: 'bg_gone' },
    });

    expect(res.statusCode).toBe(422);
    expect(mockUploadBuffer).not.toHaveBeenCalled();
  });

  it('falls back to the product-level background when no per-photo backdrop given', async () => {
    mockPhotoFindFirst.mockResolvedValue({
      ...photoWithProduct,
      product: {
        background_image: {
          id: 'bg_prod',
          image_url: 'https://cdn.example.com/prod-bg.jpg',
          is_active: true,
        },
      },
    });

    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/prod_1/photos/photo_1/cleanup',
      payload: { background_image_id: null },
    });

    expect(res.statusCode).toBe(200);
    // No per-photo lookup — the product-level backdrop is used as-is.
    expect(mockBackgroundImageFindFirst).not.toHaveBeenCalled();
  });

  it('404s for a photo not owned by the requesting retailer', async () => {
    mockPhotoFindFirst.mockResolvedValue(null);

    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/prod_1/photos/photo_1/cleanup',
      payload: { background_image_id: 'bg_1' },
    });

    expect(res.statusCode).toBe(404);
  });

  // ── F-030: per-call shadow override ──────────────────────────────
  it('passes an explicit add_shadow override through to the compositor', async () => {
    mockPhotoFindFirst.mockResolvedValue({
      ...photoWithProduct,
      product: { background_image: null, add_shadow: false },
    });

    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/prod_1/photos/photo_1/cleanup',
      payload: { add_shadow: true },
    });

    expect(res.statusCode).toBe(200);
    expect(mockCleanupProductPhoto).toHaveBeenCalledWith(Buffer.from('raw'), undefined, true);
    await app.close();
  });

  it('falls back to the product-level add_shadow when the body omits the override', async () => {
    mockPhotoFindFirst.mockResolvedValue({
      ...photoWithProduct,
      product: { background_image: null, add_shadow: true },
    });

    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/prod_1/photos/photo_1/cleanup',
      payload: { background_image_id: null },
    });

    expect(res.statusCode).toBe(200);
    expect(mockCleanupProductPhoto).toHaveBeenCalledWith(Buffer.from('raw'), undefined, true);
    await app.close();
  });

  it('defaults to no shadow when neither body nor product sets it', async () => {
    mockPhotoFindFirst.mockResolvedValue({
      ...photoWithProduct,
      product: { background_image: null, add_shadow: false },
    });

    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/prod_1/photos/photo_1/cleanup',
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(mockCleanupProductPhoto).toHaveBeenCalledWith(Buffer.from('raw'), undefined, false);
    await app.close();
  });

  describe('DELETE /v1/products/:id/photos/:photoId', () => {
    it('deletes a standard product photo and cleans up R2', async () => {
      mockProductFindFirst.mockResolvedValue({
        id: 'prod_1',
        retailer_id: 'ret_1',
        photos: [
          { id: 'photo_1', is_primary: false, r2_key: 'prod/photo_1.jpg' },
          { id: 'photo_2', is_primary: true, r2_key: 'prod/photo_2.jpg' },
        ],
      });
      mockPhotoDelete.mockResolvedValue({ id: 'photo_1' });

      const app = await buildApp(null);
      const res = await app.inject({
        method: 'DELETE',
        url: '/v1/products/prod_1/photos/photo_1',
      });

      expect(res.statusCode).toBe(200);
      expect(mockPhotoDelete).toHaveBeenCalledWith({ where: { id: 'photo_1' } });
      expect(mockDeleteObject).toHaveBeenCalledWith('prod/photo_1.jpg');
      await app.close();
    });

    it('promotes the next photo when the primary photo is deleted', async () => {
      mockProductFindFirst.mockResolvedValue({
        id: 'prod_1',
        retailer_id: 'ret_1',
        photos: [
          { id: 'photo_1', is_primary: true, r2_key: 'prod/photo_1.jpg' },
          { id: 'photo_2', is_primary: false, r2_key: 'prod/photo_2.jpg' },
        ],
      });
      mockPhotoDelete.mockResolvedValue({ id: 'photo_1' });
      mockPhotoUpdate.mockResolvedValue({ id: 'photo_2', is_primary: true });

      const app = await buildApp(null);
      const res = await app.inject({
        method: 'DELETE',
        url: '/v1/products/prod_1/photos/photo_1',
      });

      expect(res.statusCode).toBe(200);
      expect(mockPhotoDelete).toHaveBeenCalledWith({ where: { id: 'photo_1' } });
      expect(mockPhotoUpdate).toHaveBeenCalledWith({
        where: { id: 'photo_2' },
        data: { is_primary: true },
      });
      await app.close();
    });

    it('clears photo_url on a variant photo (variant-*)', async () => {
      mockProductFindFirst.mockResolvedValue({
        id: 'prod_1',
        retailer_id: 'ret_1',
        photos: [],
      });
      mockVariantFindFirst.mockResolvedValue({
        id: 'var_1',
        product_id: 'prod_1',
        retailer_id: 'ret_1',
        r2_key: 'variants/var_1.jpg',
      });
      mockVariantUpdate.mockResolvedValue({ id: 'var_1', photo_url: null, r2_key: null });

      const app = await buildApp(null);
      const res = await app.inject({
        method: 'DELETE',
        url: '/v1/products/prod_1/photos/variant-var_1',
      });

      expect(res.statusCode).toBe(200);
      expect(mockVariantUpdate).toHaveBeenCalledWith({
        where: { id: 'var_1' },
        data: { photo_url: null, r2_key: null },
      });
      expect(mockDeleteObject).toHaveBeenCalledWith('variants/var_1.jpg');
      await app.close();
    });

    it('clears original photo preview (*-original)', async () => {
      mockProductFindFirst.mockResolvedValue({
        id: 'prod_1',
        retailer_id: 'ret_1',
        photos: [],
      });
      mockPhotoFindFirst.mockResolvedValue({
        id: 'photo_1',
        product_id: 'prod_1',
        retailer_id: 'ret_1',
        metadata: { original_r2_key: 'orig/photo_1.jpg', original_url: 'https://orig' },
      });
      mockPhotoUpdate.mockResolvedValue({ id: 'photo_1' });

      const app = await buildApp(null);
      const res = await app.inject({
        method: 'DELETE',
        url: '/v1/products/prod_1/photos/photo_1-original',
      });

      expect(res.statusCode).toBe(200);
      expect(mockPhotoUpdate).toHaveBeenCalledWith({
        where: { id: 'photo_1' },
        data: { metadata: {} },
      });
      expect(mockDeleteObject).toHaveBeenCalledWith('orig/photo_1.jpg');
      await app.close();
    });
  });
});
