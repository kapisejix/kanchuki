import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { retailerRoutes } from './retailers.js';

const { mockRetailerFindUnique, mockRetailerUpdate, mockCollectionFindFirst } = vi.hoisted(() => ({
  mockRetailerFindUnique: vi.fn(),
  mockRetailerUpdate: vi.fn(),
  mockCollectionFindFirst: vi.fn(),
}));

const { mockGetUploadPresignedUrl, mockPublicUrl } = vi.hoisted(() => ({
  mockGetUploadPresignedUrl: vi.fn(),
  mockPublicUrl: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  vaultDelete: vi.fn(),
  prisma: {
    retailer: { findUnique: mockRetailerFindUnique, update: mockRetailerUpdate },
    collection: { findFirst: mockCollectionFindFirst },
    product: { count: vi.fn(), findMany: vi.fn() },
    customer: { count: vi.fn() },
    storeSection: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  Prisma: {},
}));

vi.mock('@kanchuki/ai', () => ({
  getUploadPresignedUrl: mockGetUploadPresignedUrl,
  publicUrl: mockPublicUrl,
}));

const RETAILER_ID = 'retailer_1';

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
  });
  await app.register(retailerRoutes, { prefix: '/v1/retailers' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PUT /retailers/me', () => {
  it('accepts null logo/banner fields (clearing an image)', async () => {
    mockRetailerUpdate.mockResolvedValue({ shop_name: 'Test Shop', logo_url: null, banner_url: null });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/retailers/me',
      payload: {
        shop_name: 'Test Shop',
        logo_url: null,
        logo_r2_key: null,
        banner_url: null,
        banner_r2_key: null,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(mockRetailerUpdate).toHaveBeenCalledOnce();
    await app.close();
  });
});

describe('POST /retailers/me/qr-slug', () => {
  it('returns the existing slug without generating a new one', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      public_slug: 'test-shop-ab12',
      shop_name: 'Test Shop',
    });

    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/v1/retailers/me/qr-slug' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.public_slug).toBe('test-shop-ab12');
    expect(mockRetailerUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it('generates and persists a slug when none exists', async () => {
    mockRetailerFindUnique
      .mockResolvedValueOnce({ public_slug: null, shop_name: 'Test Shop' }) // initial lookup
      .mockResolvedValueOnce(null); // uniqueness check — slug free
    mockRetailerUpdate.mockResolvedValue({ public_slug: 'test-shop-xy99' });

    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/v1/retailers/me/qr-slug' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.public_slug).toBe('test-shop-xy99');
    expect(mockRetailerUpdate).toHaveBeenCalledOnce();
    await app.close();
  });
});

describe('PATCH /retailers/me/storefront', () => {
  it('rejects a collection that does not belong to this retailer', async () => {
    mockCollectionFindFirst.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/retailers/me/storefront',
      payload: { collection_id: 'someone_elses_collection' },
    });

    expect(res.statusCode).toBe(422);
    expect(mockRetailerUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it('accepts an owned collection', async () => {
    mockCollectionFindFirst.mockResolvedValue({ id: 'col_1', retailer_id: RETAILER_ID });
    mockRetailerUpdate.mockResolvedValue({ storefront_collection_id: 'col_1' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/retailers/me/storefront',
      payload: { collection_id: 'col_1' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.storefront_collection_id).toBe('col_1');
    await app.close();
  });

  it('allows unsetting the storefront with null', async () => {
    mockRetailerUpdate.mockResolvedValue({ storefront_collection_id: null });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/retailers/me/storefront',
      payload: { collection_id: null },
    });

    expect(res.statusCode).toBe(200);
    expect(mockCollectionFindFirst).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /retailers/me/banner-upload-url', () => {
  beforeEach(() => {
    mockGetUploadPresignedUrl.mockReset();
    mockPublicUrl.mockReset();
  });

  it('returns a presigned upload URL for a valid JPEG banner', async () => {
    mockGetUploadPresignedUrl.mockResolvedValue('https://r2.example.com/upload/test.jpg');
    mockPublicUrl.mockReturnValue('https://cdn.example.com/retailers/r1/banner/test.jpg');

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/banner-upload-url',
      payload: {
        filename: 'summer-collection.jpg',
        content_type: 'image/jpeg',
        size_bytes: 2_500_000,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body).toHaveProperty('upload_url', 'https://r2.example.com/upload/test.jpg');
    expect(body).toHaveProperty('r2_key');
    expect(body.r2_key).toContain('banner/');
    expect(body).toHaveProperty('public_url', 'https://cdn.example.com/retailers/r1/banner/test.jpg');
    expect(body).toHaveProperty('expires_in', 300);

    expect(mockGetUploadPresignedUrl).toHaveBeenCalledOnce();
    expect(mockPublicUrl).toHaveBeenCalledOnce();
    await app.close();
  });

  it('accepts PNG and WebP content types', async () => {
    mockGetUploadPresignedUrl.mockResolvedValue('https://r2.example.com/upload/banner.png');
    mockPublicUrl.mockReturnValue('https://cdn.example.com/banner.png');

    const app = await buildApp();
    for (const ct of ['image/png', 'image/webp'] as const) {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/retailers/me/banner-upload-url',
        payload: { filename: 'banner', content_type: ct, size_bytes: 1_000_000 },
      });
      expect(res.statusCode).toBe(200);

      const ext = ct === 'image/png' ? 'png' : 'webp';
      expect(res.json().data.r2_key).toMatch(new RegExp(`\.${ext}$`));
    }
    expect(mockGetUploadPresignedUrl).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it('rejects an unsupported content type', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/banner-upload-url',
      payload: { filename: 'banner.gif', content_type: 'image/gif', size_bytes: 1_000 },
    });

    expect(res.statusCode).toBe(422);
    expect(mockGetUploadPresignedUrl).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an empty filename', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/banner-upload-url',
      payload: { filename: '', content_type: 'image/jpeg', size_bytes: 1_000 },
    });

    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('rejects a zero-byte banner', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/banner-upload-url',
      payload: { filename: 'banner.jpg', content_type: 'image/jpeg', size_bytes: 0 },
    });

    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('rejects a banner larger than 10MB', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/banner-upload-url',
      payload: { filename: 'banner.jpg', content_type: 'image/jpeg', size_bytes: 11_000_001 },
    });

    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('returns a user-friendly error when R2 storage is not configured', async () => {
    mockGetUploadPresignedUrl.mockRejectedValue(new Error('R2 not configured'));

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/banner-upload-url',
      payload: { filename: 'banner.jpg', content_type: 'image/jpeg', size_bytes: 1_000_000 },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('storage is not configured');
    await app.close();
  });

  it('generates a unique R2 key each time (random ID via createId)', async () => {
    mockGetUploadPresignedUrl.mockResolvedValue('https://r2.example.com/upload/banner');
    mockPublicUrl.mockReturnValue('https://cdn.example.com/banner');

    const app = await buildApp();
    const res1 = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/banner-upload-url',
      payload: { filename: 'a.jpg', content_type: 'image/jpeg', size_bytes: 500_000 },
    });
    const res2 = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/banner-upload-url',
      payload: { filename: 'b.jpg', content_type: 'image/jpeg', size_bytes: 500_000 },
    });

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(res1.json().data.r2_key).not.toBe(res2.json().data.r2_key);
    await app.close();
  });
});
