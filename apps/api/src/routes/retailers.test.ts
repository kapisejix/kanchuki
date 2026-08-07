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
});
