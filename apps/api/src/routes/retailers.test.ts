import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const {
  mockTeamMemberFindUnique,
  mockSupportTicketFindUnique,
  mockSupportTicketCreate,
  mockSupportTicketUpdate,
  mockGetSecret,
} = vi.hoisted(() => ({
  mockTeamMemberFindUnique: vi.fn(),
  mockSupportTicketFindUnique: vi.fn(),
  mockSupportTicketCreate: vi.fn(),
  mockSupportTicketUpdate: vi.fn(),
  mockGetSecret: vi.fn(),
}));

// F-031 social publishing mocks (referenced by the @kanchuki/db + meta-graph
// mock factories below, so they must be declared here — before those calls).
const {
  mockSocialAccountFindFirst,
  mockSocialAccountUpdate,
  mockSocialAccountFindMany,
  mockSocialPostCreate,
  mockSocialPostFindMany,
  mockEncryptSecret,
  mockDecryptSecret,
  mockResolveMetaCredentials,
  mockPublishPhotoPost,
  mockPublishLinkPost,
} = vi.hoisted(() => ({
  mockSocialAccountFindFirst: vi.fn(),
  mockSocialAccountUpdate: vi.fn(),
  mockSocialAccountFindMany: vi.fn(),
  mockSocialPostCreate: vi.fn(),
  mockSocialPostFindMany: vi.fn(),
  mockEncryptSecret: vi.fn((v: string) => `enc:${v}`),
  mockDecryptSecret: vi.fn((v: string) => v.replace(/^enc:/, '')),
  mockResolveMetaCredentials: vi.fn(),
  mockPublishPhotoPost: vi.fn(),
  mockPublishLinkPost: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  vaultDelete: vi.fn(),
  getSecret: mockGetSecret,
  // Import-chain requirement only: retailers route graph pulls purge modules
  // that call getPurgePrisma() at module top-level. Never exercised by this suite.
  getPurgePrisma: () => ({
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $transaction: (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : Promise.resolve(),
    retailer: { findUnique: vi.fn() },
  }),
  prisma: {
    retailer: { findUnique: mockRetailerFindUnique, update: mockRetailerUpdate },
    collection: { findFirst: mockCollectionFindFirst },
    product: { count: vi.fn(), findMany: vi.fn() },
    customer: { count: vi.fn() },
    storeSection: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    teamMember: { findUnique: mockTeamMemberFindUnique },
    supportTicket: {
      findUnique: mockSupportTicketFindUnique,
      create: mockSupportTicketCreate,
      update: mockSupportTicketUpdate,
    },
    socialAccount: {
      findFirst: mockSocialAccountFindFirst,
      update: mockSocialAccountUpdate,
      findMany: mockSocialAccountFindMany,
    },
    socialPost: { create: mockSocialPostCreate, findMany: mockSocialPostFindMany },
    auditLog: { create: vi.fn() },
  },
  encryptSecret: mockEncryptSecret,
  decryptSecret: mockDecryptSecret,
  Prisma: {},
}));vi.mock('@kanchuki/ai', () => ({
  getUploadPresignedUrl: mockGetUploadPresignedUrl,
  publicUrl: mockPublicUrl,
}));

// F-031 social publishing — Meta Graph API + Redis are mocked; the suite only
// exercises publish/list/history/disconnect (the connect flow's Redis state is
// covered by the meta-graph lib tests).
vi.mock('../lib/meta-graph.js', async () => {
  const { AppError } = await import('../plugins/error-handler.js');
  // Extends the REAL AppError so the error handler's instanceof check works
  // (a plain Error subclass would fall through to a 500 in this suite).
  class MockMetaApiError extends AppError {
    constructor(message: string, status = 400, code = 'META_ERROR') {
      super(code, message, status);
      this.name = 'MetaApiError';
    }
  }
  return {
    MetaApiError: MockMetaApiError,
    resolveMetaCredentials: mockResolveMetaCredentials,
    buildOAuthUrl: vi.fn(),
    exchangeCodeForToken: vi.fn(),
    listPages: vi.fn(),
    publishPhotoPost: mockPublishPhotoPost,
    publishLinkPost: mockPublishLinkPost,
  };
});

const RETAILER_ID = 'retailer_1';

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('staffRole', null);
  app.decorateRequest('catalogDelegate', null);
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
    mockRetailerFindUnique.mockResolvedValue({
      onboarded_by_id: null,
      shop_name: 'Test Shop',
      public_slug: null,
    });
    mockRetailerUpdate.mockResolvedValue({
      shop_name: 'Test Shop',
      logo_url: null,
      banner_url: null,
    });

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

  it('regenerates the QR slug when the shop name changes and a slug exists', async () => {
    mockRetailerFindUnique
      .mockResolvedValueOnce({
        onboarded_by_id: null,
        shop_name: 'Old Shop Name',
        public_slug: 'old-shop-name-ab12',
      }) // current-row fetch
      .mockResolvedValueOnce(null); // uniqueness check — new slug is free
    mockRetailerUpdate.mockResolvedValue({
      shop_name: 'New Shop Name',
      public_slug: 'new-shop-name-xy99',
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/retailers/me',
      payload: { shop_name: 'New Shop Name' },
    });

    expect(res.statusCode).toBe(200);
    const callArg = mockRetailerUpdate.mock.calls[0]?.[0];
    expect(callArg.data.public_slug).toMatch(/^new-shop-name-/);
    await app.close();
  });

  it('does not regenerate the slug when the shop name is unchanged', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      onboarded_by_id: null,
      shop_name: 'Same Shop',
      public_slug: 'same-shop-ab12',
    });
    mockRetailerUpdate.mockResolvedValue({ shop_name: 'Same Shop' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/retailers/me',
      payload: { shop_name: 'Same Shop' },
    });

    expect(res.statusCode).toBe(200);
    const callArg = mockRetailerUpdate.mock.calls[0]?.[0];
    expect(callArg.data).not.toHaveProperty('public_slug');
    await app.close();
  });

  it('does not regenerate the slug on rename when no QR slug exists yet', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      onboarded_by_id: null,
      shop_name: 'Old Shop',
      public_slug: null,
    });
    mockRetailerUpdate.mockResolvedValue({ shop_name: 'New Shop' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/retailers/me',
      payload: { shop_name: 'New Shop' },
    });

    expect(res.statusCode).toBe(200);
    const callArg = mockRetailerUpdate.mock.calls[0]?.[0];
    expect(callArg.data).not.toHaveProperty('public_slug');
    await app.close();
  });

  it('F-018: resolves a valid referral_code to onboarded_by_id when unattributed', async () => {
    mockRetailerFindUnique.mockResolvedValue({ onboarded_by_id: null });
    mockTeamMemberFindUnique.mockResolvedValue({ id: 'agent_1', is_active: true });
    mockRetailerUpdate.mockResolvedValue({ shop_name: 'Test Shop' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/retailers/me',
      payload: { shop_name: 'Test Shop', referral_code: 'ABC123' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockRetailerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ onboarded_by_id: 'agent_1' }) }),
    );
    await app.close();
  });

  it('F-018: silently ignores an invalid referral_code (no error, no attribution)', async () => {
    mockRetailerFindUnique.mockResolvedValue({ onboarded_by_id: null });
    mockTeamMemberFindUnique.mockResolvedValue(null);
    mockRetailerUpdate.mockResolvedValue({ shop_name: 'Test Shop' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/retailers/me',
      payload: { shop_name: 'Test Shop', referral_code: 'NOTREAL' },
    });

    expect(res.statusCode).toBe(200);
    const callArg = mockRetailerUpdate.mock.calls[0]?.[0];
    expect(callArg.data).not.toHaveProperty('onboarded_by_id');
    await app.close();
  });

  it('F-018: never overwrites an already-attributed retailer', async () => {
    mockRetailerFindUnique.mockResolvedValue({ onboarded_by_id: 'agent_existing' });
    mockRetailerUpdate.mockResolvedValue({ shop_name: 'Test Shop' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/retailers/me',
      payload: { shop_name: 'Test Shop', referral_code: 'ABC123' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockTeamMemberFindUnique).not.toHaveBeenCalled();
    const callArg = mockRetailerUpdate.mock.calls[0]?.[0];
    expect(callArg.data).not.toHaveProperty('onboarded_by_id');
    await app.close();
  });
});

describe('F-019: POST /retailers/me/catalog-upload-request/:id/pay', () => {
  const TICKET_ID = 'ticket_1';
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('creates a Razorpay Payment Link and returns checkout_url', async () => {
    mockSupportTicketFindUnique.mockResolvedValue({
      id: TICKET_ID,
      retailer_id: RETAILER_ID,
      ticket_type: 'CATALOG_UPLOAD',
      razorpay_order_id: null,
      paid_at: null,
      item_count_requested: 100,
      quoted_price_inr: 1499,
      proposed_slots: null,
      confirmed_slot: null,
      created_at: new Date(),
      resolved_at: null,
    });
    mockRetailerFindUnique.mockResolvedValue({ phone: '9876543210', shop_name: 'Test Shop' });
    mockGetSecret.mockResolvedValue('test_secret');
    mockSupportTicketUpdate.mockResolvedValue({ id: TICKET_ID, razorpay_order_id: 'plink_123' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'plink_123', short_url: 'https://rzp.io/i/abc123' }),
    }) as unknown as typeof fetch;

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/retailers/me/catalog-upload-request/${TICKET_ID}/pay`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.checkout_url).toBe('https://rzp.io/i/abc123');
    expect(mockSupportTicketUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { razorpay_order_id: 'plink_123' } }),
    );
    await app.close();
  });

  it('rejects a ticket belonging to a different retailer (IDOR guard)', async () => {
    mockSupportTicketFindUnique.mockResolvedValue({
      id: TICKET_ID,
      retailer_id: 'someone_elses_retailer',
      ticket_type: 'CATALOG_UPLOAD',
      quoted_price_inr: 1499,
      paid_at: null,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/retailers/me/catalog-upload-request/${TICKET_ID}/pay`,
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('rejects paying for an unquoted request', async () => {
    mockSupportTicketFindUnique.mockResolvedValue({
      id: TICKET_ID,
      retailer_id: RETAILER_ID,
      ticket_type: 'CATALOG_UPLOAD',
      quoted_price_inr: null,
      paid_at: null,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/retailers/me/catalog-upload-request/${TICKET_ID}/pay`,
    });

    expect(res.statusCode).toBe(422);
    await app.close();
  });
});

describe('DELETE /retailers/me/qr-slug', () => {
  it('clears the public_slug when one exists (204)', async () => {
    mockRetailerFindUnique.mockResolvedValue({ public_slug: 'test-shop-ab12' });
    mockRetailerUpdate.mockResolvedValue({ public_slug: null });

    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/v1/retailers/me/qr-slug' });

    expect(res.statusCode).toBe(204);
    expect(mockRetailerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { public_slug: null } }),
    );
    await app.close();
  });

  it('is idempotent when no slug exists', async () => {
    mockRetailerFindUnique.mockResolvedValue({ public_slug: null });

    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/v1/retailers/me/qr-slug' });

    expect(res.statusCode).toBe(204);
    expect(mockRetailerUpdate).not.toHaveBeenCalled();
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
    expect(body).toHaveProperty(
      'public_url',
      'https://cdn.example.com/retailers/r1/banner/test.jpg',
    );
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

  // ─── F-031 Social Media Publishing ───────────────────────────────────

  const FACEBOOK_ACCOUNT = {
    id: 'social_1',
    retailer_id: RETAILER_ID,
    platform: 'FACEBOOK',
    platform_account_id: 'page_123',
    platform_account_name: 'My Shop Page',
    access_token_encrypted: 'enc:page-token',
    is_active: true,
    token_expires_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  it('publishes a single product photo to a connected Page (owner)', async () => {

    mockSocialAccountFindFirst.mockResolvedValue(FACEBOOK_ACCOUNT);
    mockPublishPhotoPost.mockResolvedValue({ postId: 'fb_post_1' });
    mockSocialPostCreate.mockResolvedValue({
      id: 'sp_1',
      post_type: 'SINGLE_PRODUCT',
      caption: 'New Kurti — ₹999',
      status: 'POSTED',
      external_post_url: 'https://www.facebook.com/page_123/posts/fb_post_1',
    });

    const prismaMock = (await import('@kanchuki/db')).prisma;
    prismaMock.product.findFirst = vi.fn().mockResolvedValue({
      id: 'prod_1',
      name: 'New Kurti',
      price_min: 99900,
      photos: [{ id: 'ph_1', url: 'https://cdn.example.com/kurti.jpg' }],
      videos: [],
    });
    prismaMock.retailer.findUnique = vi.fn().mockResolvedValue({ public_slug: 'my-shop-ab12' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/social/accounts/social_1/posts',
      payload: { post_type: 'SINGLE_PRODUCT', product_id: 'prod_1' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('POSTED');
    expect(mockPublishPhotoPost).toHaveBeenCalledWith(
      'page_123',
      'page-token',
      'https://cdn.example.com/kurti.jpg',
      expect.stringContaining('New Kurti'),
    );
    await app.close();
  });

  it('publishes a collection link post with the store URL', async () => {
    mockSocialAccountFindFirst.mockResolvedValue(FACEBOOK_ACCOUNT);
    mockPublishLinkPost.mockResolvedValue({ postId: 'fb_post_2' });
    mockSocialPostCreate.mockResolvedValue({
      id: 'sp_2',
      post_type: 'COLLECTION_LINK',
      caption: 'Shop new collection — https://kanchuki.app/my-shop-ab12/festive',
      status: 'POSTED',
      external_post_url: 'https://www.facebook.com/page_123/posts/fb_post_2',
    });

    const prismaMock = (await import('@kanchuki/db')).prisma;
    prismaMock.collection.findFirst = vi.fn().mockResolvedValue({
      id: 'col_1',
      title: 'Festive Collection',
      slug: 'festive-collection',
    });
    prismaMock.retailer.findUnique = vi.fn().mockResolvedValue({ public_slug: 'my-shop-ab12' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/social/accounts/social_1/posts',
      payload: { post_type: 'COLLECTION_LINK', collection_id: 'col_1' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockPublishLinkPost).toHaveBeenCalledWith(
      'page_123',
      'page-token',
      expect.stringContaining('festive-collection'),
      expect.any(String),
    );
    await app.close();
  });

  it('records a FAILED history row when Facebook rejects the post', async () => {
    mockSocialAccountFindFirst.mockResolvedValue(FACEBOOK_ACCOUNT);
    mockPublishPhotoPost.mockRejectedValue(new Error('Facebook rejected the photo post'));
    mockSocialPostCreate.mockResolvedValue({ id: 'sp_3' });

    const prismaMock = (await import('@kanchuki/db')).prisma;
    prismaMock.product.findFirst = vi.fn().mockResolvedValue({
      id: 'prod_1',
      name: 'New Kurti',
      price_min: 99900,
      photos: [{ id: 'ph_1', url: 'https://cdn.example.com/kurti.jpg' }],
      videos: [],
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/social/accounts/social_1/posts',
      payload: { post_type: 'SINGLE_PRODUCT', product_id: 'prod_1' },
    });

    expect(res.statusCode).toBe(400);
    const failedRow = mockSocialPostCreate.mock.calls[0]?.[0]?.data;
    expect(failedRow.status).toBe('FAILED');
    expect(failedRow.error_message).toContain('rejected');
    await app.close();
  });

  it('returns 503 when Meta credentials are not configured', async () => {
    mockResolveMetaCredentials.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/retailers/me/social/connect' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('lists connected accounts (masked, no tokens)', async () => {
    mockSocialAccountFindMany.mockResolvedValue([FACEBOOK_ACCOUNT]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/retailers/me/social/accounts' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data).toHaveLength(1);
    expect(data[0].account_name).toBe('My Shop Page');
    expect(JSON.stringify(data)).not.toContain('page-token');
    await app.close();
  });

  it('returns post history for a connected account', async () => {
    mockSocialAccountFindFirst.mockResolvedValue({ id: 'social_1' });
    mockSocialPostFindMany.mockResolvedValue([
      {
        id: 'sp_1',
        post_type: 'SINGLE_PRODUCT',
        caption: 'New Kurti',
        status: 'POSTED',
        external_post_url: 'https://www.facebook.com/page_123/posts/fb_post_1',
        error_message: null,
        product_ids: ['prod_1'],
        collection_id: null,
        created_at: new Date(),
      },
    ]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/retailers/me/social/accounts/social_1/posts',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].external_post_url).toContain('facebook.com');
    await app.close();
  });

  it('disconnects an account (204, soft delete)', async () => {
    mockSocialAccountFindFirst.mockResolvedValue(FACEBOOK_ACCOUNT);
    mockSocialAccountUpdate.mockResolvedValue(FACEBOOK_ACCOUNT);
    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/retailers/me/social/accounts/social_1',
    });
    expect(res.statusCode).toBe(204);
    expect(mockSocialAccountUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { is_active: false } }),
    );
    await app.close();
  });

  it('404s when publishing to an account that does not exist', async () => {
    mockSocialAccountFindFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/retailers/me/social/accounts/nope/posts',
      payload: { post_type: 'SINGLE_PRODUCT', product_id: 'prod_1' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('PATCH /retailers/me/onboarding — demo_plan', () => {
  it('sets plan to PRO with TRIAL status when demo_plan: true', async () => {
    mockRetailerUpdate.mockResolvedValue({
      onboarding_step: 4,
      onboarding_completed: false,
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/retailers/me/onboarding',
      payload: { step: 4, demo_plan: true },
    });
    expect(res.statusCode).toBe(200);
    expect(mockRetailerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          plan: 'PRO',
          plan_status: 'TRIAL',
          max_products: 999999,
          max_customers: 999999,
          onboarding_step: 4,
        }),
      }),
    );
    await app.close();
  });

  it('does not set plan fields when demo_plan is not sent', async () => {
    mockRetailerUpdate.mockResolvedValue({
      onboarding_step: 3,
      onboarding_completed: false,
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/retailers/me/onboarding',
      payload: { step: 3 },
    });
    expect(res.statusCode).toBe(200);
    const callData = mockRetailerUpdate.mock.calls[0]?.[0]?.data;
    expect(callData).not.toHaveProperty('plan');
    expect(callData).not.toHaveProperty('plan_status');
    await app.close();
  });

  it('rejects demo_plan replay once onboarding is completed (quota bypass guard)', async () => {
    // earlier tests reassign prisma.retailer.findUnique to a fresh fn — restore it
    const db = await import('@kanchuki/db');
    db.prisma.retailer.findUnique = mockRetailerFindUnique;
    mockRetailerFindUnique.mockReset();
    mockRetailerFindUnique.mockResolvedValue({ onboarding_completed: true });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/retailers/me/onboarding',
      payload: { step: 6, demo_plan: true },
    });
    expect(res.statusCode).toBe(422);
    expect(mockRetailerUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects a direct plan pick once onboarding is completed', async () => {
    const db = await import('@kanchuki/db');
    db.prisma.retailer.findUnique = mockRetailerFindUnique;
    mockRetailerFindUnique.mockReset();
    mockRetailerFindUnique.mockResolvedValue({ onboarding_completed: true });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/retailers/me/onboarding',
      payload: { step: 6, plan: 'PRO' },
    });
    expect(res.statusCode).toBe(422);
    expect(mockRetailerUpdate).not.toHaveBeenCalled();
    await app.close();
  });
});
