import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';

// ── mocks ────────────────────────────────────────────────────────
const {
  mockRetailerFindUniqueOrThrow,
  mockAccountFindMany,
  mockProductFindMany,
  mockCollectionProductFindMany,
  mockCollectionFindFirst,
  mockPostCreate,
  mockPostFindMany,
  mockPostFindFirst,
  mockPostUpdate,
  mockDecryptSecret,
  mockPublishPhoto,
  mockPublishVideo,
  mockPublishLink,
  mockPublishFacebookCarousel,
  mockPublishInstagramCarousel,
  mockPublishInstagramPhoto,
  mockClaimSocialPostId,
  mockTemplateFindFirst,
  mockTemplateUpdate,
  MetaApiError,
} = vi.hoisted(() => {
  // Mirror of the real meta-graph MetaApiError (curated platform-safe message
  // with a numeric HTTP status + optional code) — exported from the hoisted
  // block so tests can construct curated vs raw errors (findings 3–5, §12).
  class MetaApiError extends Error {
    constructor(
      message: string,
      public readonly status: number = 400,
      public readonly code?: string,
    ) {
      super(message);
      this.name = 'MetaApiError';
    }
  }
  return {
    mockRetailerFindUniqueOrThrow: vi.fn(),
    mockAccountFindMany: vi.fn(),
    mockProductFindMany: vi.fn(),
    mockCollectionProductFindMany: vi.fn(),
    mockCollectionFindFirst: vi.fn(),
    mockPostCreate: vi.fn(),
    mockPostFindMany: vi.fn(),
    mockPostFindFirst: vi.fn(),
    mockPostUpdate: vi.fn(),
    mockDecryptSecret: vi.fn(),
    mockPublishPhoto: vi.fn(),
    mockPublishVideo: vi.fn(),
    mockPublishLink: vi.fn(),
    mockPublishFacebookCarousel: vi.fn(),
    mockPublishInstagramCarousel: vi.fn(),
    mockPublishInstagramPhoto: vi.fn(),
    mockClaimSocialPostId: vi.fn(),
    mockTemplateFindFirst: vi.fn(),
    mockTemplateUpdate: vi.fn(),
    MetaApiError,
  };
});

vi.mock('@kanchuki/db', () => ({
  decryptSecret: mockDecryptSecret,
  prisma: {
    retailer: { findUniqueOrThrow: mockRetailerFindUniqueOrThrow },
    socialAccount: { findMany: mockAccountFindMany },
    product: { findMany: mockProductFindMany },
    collectionProduct: { findMany: mockCollectionProductFindMany },
    collection: { findFirst: mockCollectionFindFirst },
    socialPost: {
      create: mockPostCreate,
      findMany: mockPostFindMany,
      findFirst: mockPostFindFirst,
      update: mockPostUpdate,
    },
    postTemplate: { findFirst: mockTemplateFindFirst, update: mockTemplateUpdate },
  },
}));

vi.mock('../../../lib/meta-graph.js', () => ({
  MetaApiError,
  publishPhotoPost: mockPublishPhoto,
  publishVideoPost: mockPublishVideo,
  publishLinkPost: mockPublishLink,
  publishFacebookCarousel: mockPublishFacebookCarousel,
  publishInstagramCarousel: mockPublishInstagramCarousel,
}));

vi.mock('./retailers-social-helpers.js', () => ({
  publishInstagramPhoto: mockPublishInstagramPhoto,
}));

vi.mock('../../../lib/social-post-idempotency.js', () => ({
  claimSocialPostId: mockClaimSocialPostId,
}));

const { retailersSocialFanoutRoutes } = await import('./retailers-social-fanout.js');

// ── fixtures ─────────────────────────────────────────────────────
const RETAILER_ID = 'retailer_1';
const FB_ACCOUNT = {
  id: 'fb_1',
  retailer_id: RETAILER_ID,
  platform: 'FACEBOOK' as const,
  platform_account_id: 'page_101',
  access_token_encrypted: 'tok-fb',
  is_active: true,
};
const IG_ACCOUNT = {
  id: 'ig_1',
  retailer_id: RETAILER_ID,
  platform: 'INSTAGRAM' as const,
  platform_account_id: 'ig_user_55',
  access_token_encrypted: 'tok-ig',
  is_active: true,
};

function productRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'p_1',
    name: 'Kurti',
    price_min: 150000,
    category: 'Sarees',
    photos: [{ id: 'ph_1', url: 'https://cdn.example/kurti.jpg', is_primary: true }],
    videos: [],
    ...overrides,
  };
}

function captionPayload(overrides: Record<string, unknown> = {}) {
  return {
    client_post_id: 'client-uuid-1',
    post_type: 'SINGLE_PRODUCT',
    targets: ['fb_1'],
    items: [{ product_id: 'p_1', photo_id: 'ph_1' }],
    ...overrides,
  };
}

async function buildApp(owner = true) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('staffRole', null);
  app.decorateRequest('catalogDelegate', null);
  app.addHook('preHandler', async (request) => {
    request.retailerId = owner ? RETAILER_ID : '';
    request.staffRole = owner ? null : 'manager';
    request.catalogDelegate = null;
  });
  await app.register(retailersSocialFanoutRoutes, { prefix: '/v1' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WEB_URL = 'https://kanchuki.app';
  mockDecryptSecret.mockImplementation((s: string) => `dec:${s}`);
  mockClaimSocialPostId.mockResolvedValue({ isNew: true, degradedReason: null });
  mockRetailerFindUniqueOrThrow.mockResolvedValue({
    public_slug: 'priya-house',
    shop_name: 'Priya Cloth House',
    plan: 'GROWTH',
  });
  // No template by default — existing tests exercise the auto-caption path.
  mockTemplateFindFirst.mockResolvedValue(null);
  mockTemplateUpdate.mockResolvedValue({});
  mockAccountFindMany.mockResolvedValue([FB_ACCOUNT]);
  mockProductFindMany.mockResolvedValue([productRow()]);
  mockCollectionProductFindMany.mockResolvedValue([]);
  mockCollectionFindFirst.mockResolvedValue({ slug: 'festive-edit' });
  mockPublishPhoto.mockResolvedValue({ postId: 'fb_post_1' });
  mockPublishVideo.mockResolvedValue({ postId: 'fb_video_1' });
  mockPublishLink.mockResolvedValue({ postId: 'fb_link_1' });
  mockPublishFacebookCarousel.mockResolvedValue({ postId: 'fb_car_1' });
  mockPublishInstagramCarousel.mockResolvedValue({
    postId: 'ig_car_1',
    permalink: 'https://www.instagram.com/p/abc123/',
  });
  // Default IG photo publish returns a REAL permalink (finding 3 — the media
  // id is not an instagram.com shortcode, so the helper fetches the permalink
  // field and returns it; the route must never fabricate /p/<id>).
  mockPublishInstagramPhoto.mockResolvedValue({
    postId: 'ig_post_1',
    permalink: 'https://www.instagram.com/p/Re4lSh0rtc0de/',
  });
  mockPostCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    id: 'sp_1',
    ...args.data,
  }));
  // The prior-attempt check queries every request (idempotency R-13) — default
  // to no prior rows so fresh publishes proceed to the fan-out.
  mockPostFindMany.mockResolvedValue([]);
  mockPostFindFirst.mockResolvedValue(null);
  mockPostUpdate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    id: 'sp_1',
    ...args.data,
  }));
});

// ── auth ─────────────────────────────────────────────────────────
describe('POST /v1/retailers/me/social/posts — auth + shape', () => {
  it('403 for a non-owner (staff) session', async () => {
    const app = await buildApp(false);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload(),
    });
    expect(res.statusCode).toBe(403);
    expect(mockPostCreate).not.toHaveBeenCalled();
  });

  it('422 when a carousel is out of the 2–10 range', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload({ post_type: 'CAROUSEL', items: [{ product_id: 'p_1' }] }),
    });
    expect(res.statusCode).toBe(422);
    expect(mockPostCreate).not.toHaveBeenCalled();
  });

  it('422 for a carousel carrying a video (R-10)', async () => {
    mockProductFindMany.mockResolvedValue([
      productRow({
        videos: [{ id: 'v_1', public_url: 'https://cdn.example/v.mp4', is_main: true }],
      }),
    ]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload({
        post_type: 'CAROUSEL',
        items: [{ product_id: 'p_1', video_id: 'v_1' }, { product_id: 'p_1' }],
      }),
    });
    expect(res.statusCode).toBe(422);
  });
});

// ── auto caption via resolvePostTemplate (T-9.5 wiring) ──────────
describe('auto caption resolves through resolvePostTemplate', () => {
  it('single product: name + ₹price + category + store name', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload(),
    });
    expect(res.statusCode).toBe(200);
    const caption = mockPostCreate.mock.calls[0]?.[0].data.caption;
    expect(caption).toBe('New in: Kurti — ₹1,500 in Sarees at Priya Cloth House');
    // The resolved caption is what actually went to the platform.
    expect(mockPublishPhoto).toHaveBeenCalledWith(
      'page_101',
      'dec:tok-fb',
      'https://cdn.example/kurti.jpg',
      'New in: Kurti — ₹1,500 in Sarees at Priya Cloth House',
    );
  });

  it('drops missing price/category/store without dangling separators', async () => {
    mockProductFindMany.mockResolvedValue([
      productRow({ name: 'Plain Kurti', price_min: null, category: null }),
    ]);
    mockRetailerFindUniqueOrThrow.mockResolvedValue({
      public_slug: 'priya-house',
      shop_name: null,
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload(),
    });
    expect(res.statusCode).toBe(200);
    const caption = mockPostCreate.mock.calls[0]?.[0].data.caption;
    expect(caption).toBe('New in: Plain Kurti');
    expect(caption).not.toMatch(/—|₹| in | at /);
  });

  it('carousel: {product_names} joins with +N more cap', async () => {
    mockProductFindMany.mockResolvedValue(
      ['A', 'B', 'C', 'D'].map((n, i) =>
        productRow({
          id: `p_${i}`,
          name: n,
          photos: [{ id: `ph_${i}`, url: `https://cdn.example/${i}.jpg`, is_primary: true }],
        }),
      ),
    );
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload({
        post_type: 'CAROUSEL',
        items: [
          { product_id: 'p_0', photo_id: 'ph_0' },
          { product_id: 'p_1', photo_id: 'ph_1' },
          { product_id: 'p_2', photo_id: 'ph_2' },
          { product_id: 'p_3', photo_id: 'ph_3' },
        ],
      }),
    });
    expect(res.statusCode).toBe(200);
    const caption = mockPostCreate.mock.calls[0]?.[0].data.caption;
    expect(caption).toBe('New in: A, B, C +1 more — ₹1,500 in Sarees at Priya Cloth House');
  });

  it('collection link: template resolves {link} to the canonical URL', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload({
        post_type: 'COLLECTION_LINK',
        collection_id: 'c_1',
        items: [],
      }),
    });
    expect(res.statusCode).toBe(200);
    const caption = mockPostCreate.mock.calls[0]?.[0].data.caption;
    expect(caption).toBe(
      'Shop the new collection on WhatsApp: https://kanchuki.app/priya-house/festive-edit',
    );
    expect(mockPublishLink).toHaveBeenCalledWith(
      'page_101',
      'dec:tok-fb',
      'https://kanchuki.app/priya-house/festive-edit',
      caption,
    );
  });

  it('client-supplied caption passes through untouched (no template resolution)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload({ caption: 'My own caption {product_name} — keep as-is' }),
    });
    expect(res.statusCode).toBe(200);
    const caption = mockPostCreate.mock.calls[0]?.[0].data.caption;
    expect(caption).toBe('My own caption {product_name} — keep as-is');
    expect(mockPublishPhoto).toHaveBeenCalledWith(
      'page_101',
      'dec:tok-fb',
      'https://cdn.example/kurti.jpg',
      'My own caption {product_name} — keep as-is',
    );
  });
});

// ── fan-out behaviors ────────────────────────────────────────────
describe('per-target fan-out', () => {
  it('posts to every target and records per-account rows', async () => {
    mockAccountFindMany.mockResolvedValue([FB_ACCOUNT, IG_ACCOUNT]);
    mockPublishInstagramPhoto.mockResolvedValue({ postId: 'ig_post_1' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload({ targets: ['fb_1', 'ig_1'] }),
    });
    expect(res.statusCode).toBe(200);
    const { results } = res.json().data;
    expect(results).toHaveLength(2);
    expect(results.map((r: { status: string }) => r.status)).toEqual(['POSTED', 'POSTED']);
    expect(mockPostCreate).toHaveBeenCalledTimes(2);
  });

  it('partial success: one target failing does not roll back the winner', async () => {
    mockAccountFindMany.mockResolvedValue([FB_ACCOUNT, IG_ACCOUNT]);
    mockPublishInstagramPhoto.mockRejectedValueOnce(
      new MetaApiError('Instagram rejected the media container', 400, 'INSTAGRAM_CONTAINER_FAILED'),
    );
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload({ targets: ['fb_1', 'ig_1'] }),
    });
    expect(res.statusCode).toBe(200);
    const { results } = res.json().data;
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ platform: 'FACEBOOK', status: 'POSTED' });
    expect(results[1]).toMatchObject({
      platform: 'INSTAGRAM',
      status: 'FAILED',
      error_message: 'Instagram rejected the media container',
    });
    // Every target still records its own history row.
    expect(mockPostCreate.mock.calls.map((c) => c[0].data.status)).toEqual(['POSTED', 'FAILED']);
  });

  it('IG + link-only target fails while a photo target succeeds', async () => {
    mockAccountFindMany.mockResolvedValue([FB_ACCOUNT, IG_ACCOUNT]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload({
        post_type: 'COLLECTION_LINK',
        collection_id: 'c_1',
        items: [],
        targets: ['fb_1', 'ig_1'],
      }),
    });
    expect(res.statusCode).toBe(200);
    const { results } = res.json().data;
    expect(results[0]).toMatchObject({ platform: 'FACEBOOK', status: 'POSTED' });
    expect(results[1]).toMatchObject({
      platform: 'INSTAGRAM',
      status: 'FAILED',
      error_message: 'Instagram link posts need a photo — add product media instead',
    });
  });

  it('idempotent retry: duplicate client_post_id returns the first attempts rows', async () => {
    mockClaimSocialPostId.mockResolvedValue({ isNew: false, degradedReason: null });
    mockPostFindMany.mockResolvedValue([
      {
        id: 'sp_old_1',
        social_account_id: 'fb_1',
        platform: 'FACEBOOK',
        status: 'POSTED',
        external_post_url: 'https://www.facebook.com/page_101/posts/old',
      },
    ]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.results).toEqual([
      expect.objectContaining({
        social_account_id: 'fb_1',
        status: 'POSTED',
        social_post_id: 'sp_old_1',
        deduplicated: true,
      }),
    ]);
    expect(mockPublishPhoto).not.toHaveBeenCalled();
    expect(mockPostCreate).not.toHaveBeenCalled();
  });
});

// ── idempotency hardening — finding 1 (DB-first dedupe + P2002 reconcile, §12) ─
// Tests the 2026-09-05 fix: a Redis-down double or a concurrent twin must
// never 500 and never double-post to Meta. See docs/tasks/social-create-post-composer.md §12.
function twinRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sp_twin',
    retailer_id: RETAILER_ID,
    social_account_id: 'fb_1',
    client_post_id: 'client-uuid-1',
    platform: 'FACEBOOK',
    status: 'POSTED',
    external_post_id: 'fb_post_twin',
    external_post_url: 'https://www.facebook.com/page_101/posts/fb_post_twin',
    error_message: null,
    ...overrides,
  };
}

function uniqueViolation(): Error & { code: string } {
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
  });
}

describe('idempotency hardening (finding 1, §12)', () => {
  it('(a) duplicate Redis claim with existing rows replays — no Meta call, no new row', async () => {
    mockClaimSocialPostId.mockResolvedValue({ isNew: false, degradedReason: null });
    // A FAILED + a POSTED row both replay as they were recorded.
    mockPostFindMany.mockResolvedValue([
      twinRow({ id: 'sp_posted', status: 'POSTED' }),
      twinRow({ id: 'sp_failed', status: 'FAILED', error_message: 'IG container failed' }),
    ]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload(),
    });
    expect(res.statusCode).toBe(200);
    const { results } = res.json().data;
    expect(results).toHaveLength(2);
    expect(results.map((r: { status: string }) => r.status)).toEqual(['POSTED', 'FAILED']);
    expect(results.every((r: { deduplicated?: boolean }) => r.deduplicated === true)).toBe(true);
    expect(mockPublishPhoto).not.toHaveBeenCalled();
    expect(mockPostCreate).not.toHaveBeenCalled();
  });

  it('(a2) duplicate claim with NO rows yet (concurrent twin mid-flight) returns the empty replay — never falls through to publish', async () => {
    mockClaimSocialPostId.mockResolvedValue({ isNew: false, degradedReason: null });
    mockPostFindMany.mockResolvedValue([]); // twin still publishing
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload(),
    });
    // Safe outcome: empty replay, NO Meta call, NO row — the winner's rows
    // appear when the twin finishes. Falling through here would double-post.
    expect(res.statusCode).toBe(200);
    expect(res.json().data.results).toEqual([]);
    expect(mockPublishPhoto).not.toHaveBeenCalled();
    expect(mockPostCreate).not.toHaveBeenCalled();
  });

  it('(b) new claim but prior rows exist (Redis-down first attempt) replays — no publish', async () => {
    // claim isNew defaults to true (Redis up, marker never set because the
    // first attempt ran while Redis was down) — but the DB already has the row.
    mockPostFindMany.mockResolvedValue([twinRow({ id: 'sp_redis_down' })]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.results).toEqual([
      expect.objectContaining({
        social_account_id: 'fb_1',
        social_post_id: 'sp_redis_down',
        status: 'POSTED',
        deduplicated: true,
      }),
    ]);
    expect(mockPublishPhoto).not.toHaveBeenCalled();
    expect(mockPostCreate).not.toHaveBeenCalled();
  });

  it('(c) P2002 on POSTED create where twin row is FAILED upgrades the twin to POSTED with our ids', async () => {
    const twin = twinRow({
      id: 'sp_twin_failed',
      status: 'FAILED',
      error_message: 'transient graph error',
    });
    mockPostCreate.mockRejectedValueOnce(uniqueViolation());
    mockPostFindFirst.mockResolvedValue(twin);
    mockPostUpdate.mockResolvedValue({
      ...twin,
      status: 'POSTED',
      external_post_id: 'fb_post_new',
      external_post_url: 'https://www.facebook.com/page_101/posts/fb_post_new',
      error_message: null,
    });
    mockPublishPhoto.mockResolvedValue({ postId: 'fb_post_new' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.results[0]).toMatchObject({
      social_account_id: 'fb_1',
      status: 'POSTED',
      external_post_url: 'https://www.facebook.com/page_101/posts/fb_post_new',
      deduplicated: true,
    });
    // The twin FAILED row was upgraded to POSTED with OUR platform ids.
    expect(mockPostUpdate).toHaveBeenCalledWith({
      where: { id: 'sp_twin_failed' },
      data: {
        status: 'POSTED',
        external_post_id: 'fb_post_new',
        external_post_url: 'https://www.facebook.com/page_101/posts/fb_post_new',
        error_message: null,
      },
    });
    // No second create → no 500 from the catch's FAILED-row write.
    expect(mockPostCreate).toHaveBeenCalledTimes(1);
  });

  it('(d) P2002 on POSTED create where twin row is POSTED surfaces the twin deduplicated — exactly one row', async () => {
    const twin = twinRow({ id: 'sp_twin_posted' });
    mockPostCreate.mockRejectedValueOnce(uniqueViolation());
    mockPostFindFirst.mockResolvedValue(twin);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.results[0]).toMatchObject({
      social_account_id: 'fb_1',
      social_post_id: 'sp_twin_posted',
      status: 'POSTED',
      deduplicated: true,
    });
    expect(mockPostUpdate).not.toHaveBeenCalled();
    expect(mockPostCreate).toHaveBeenCalledTimes(1);
  });

  it('(e) P2002 on the FAILED catch-path write (Meta failed + twin row exists) does not 500', async () => {
    const twin = twinRow({
      id: 'sp_twin_failed',
      status: 'FAILED',
      error_message: 'graph exploded',
    });
    mockPublishPhoto.mockRejectedValueOnce(new Error('graph exploded'));
    mockPostCreate.mockRejectedValueOnce(uniqueViolation()); // FAILED-row write collides
    mockPostFindFirst.mockResolvedValue(twin);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload(),
    });
    // All failed → PUBLISH_FAILED 400 with the reconciled row in the envelope;
    // the unhandled 500 the second P2002 used to cause is gone.
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('PUBLISH_FAILED');
    expect(res.json().error.results[0]).toMatchObject({
      social_account_id: 'fb_1',
      social_post_id: 'sp_twin_failed',
      status: 'FAILED',
      error_message: 'graph exploded',
      deduplicated: true,
    });
    expect(mockPostUpdate).not.toHaveBeenCalled();
    expect(mockPostCreate).toHaveBeenCalledTimes(1);
  });
});

// ── findings 3–5 (docs/tasks/social-create-post-composer.md §12) ──
// 3.  IG single-photo permalink must be the REAL permalink (the media id is
//     NOT an instagram.com shortcode) — never fabricated /p/<id>.
// 4.  Only MetaApiError messages are curated user-safe text; DB/network
//     errors (hostnames, connection detail) must never leak into
//     error_message or the envelope. A Meta success + DB-write failure is
//     recorded as a transient 500 (row write retried), NEVER as a FAILED row
//     for a live post.
// 5b. An IG video item posts as its product's primary photo — the recorded
//     media snapshot must say photo (no silent substitution).
describe('findings 3–5 (task doc §12)', () => {
  it('(3) IG single-photo stores the REAL permalink — never fabricated /p/<media-id>', async () => {
    mockAccountFindMany.mockResolvedValue([IG_ACCOUNT]);
    mockPublishInstagramPhoto.mockResolvedValue({
      postId: 'ig_post_9',
      permalink: 'https://www.instagram.com/p/Re4lSh0rtc0de/',
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload({ targets: ['ig_1'] }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.results[0]).toMatchObject({
      platform: 'INSTAGRAM',
      status: 'POSTED',
      external_post_url: 'https://www.instagram.com/p/Re4lSh0rtc0de/',
    });
    // The history row carries the real permalink, never /p/ig_post_9/.
    const created = mockPostCreate.mock.calls[0]?.[0]?.data;
    expect(created?.external_post_url).toBe('https://www.instagram.com/p/Re4lSh0rtc0de/');
    expect(JSON.stringify(created)).not.toContain('/p/ig_post_9');
  });

  it('(3) IG single-photo with a permalink miss (fail-open) records a NULL URL — post is live', async () => {
    mockAccountFindMany.mockResolvedValue([IG_ACCOUNT]);
    mockPublishInstagramPhoto.mockResolvedValue({ postId: 'ig_post_9', permalink: '' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload({ targets: ['ig_1'] }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.results[0]).toMatchObject({
      status: 'POSTED',
      external_post_url: null,
    });
    // Never fabricate /p/<id> — a null URL is truthful over a 404 one.
    expect(JSON.stringify(mockPostCreate.mock.calls[0]?.[0]?.data)).not.toContain('/p/ig_post_9');
  });

  it('(4) a non-Meta error (DB/network) never leaks its raw message into the FAILED row or the envelope', async () => {
    // Raw non-Meta errors carry hostnames / connection detail that must be
    // sanitized to the generic line — never persisted or surfaced verbatim.
    mockPublishPhoto.mockRejectedValueOnce(
      new Error('connect ECONNREFUSED 10.0.0.5:5432 - postgres (prisma)'),
    );
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('PUBLISH_FAILED');
    const generic = 'Something went wrong while posting. Please try again.';
    expect(res.json().error.results[0].error_message).toBe(generic);
    // The row and every envelope field stay clean of the hostname.
    expect(JSON.stringify(res.json())).not.toContain('10.0.0.5');
    expect(JSON.stringify(res.json())).not.toContain('ECONNREFUSED');
    const failedDraft = mockPostCreate.mock.calls[0]?.[0]?.data;
    expect(failedDraft?.error_message).toBe(generic);
    expect(failedDraft?.status).toBe('FAILED');
  });

  it('(4) a curated MetaApiError message still surfaces verbatim (platform rejections are user-safe)', async () => {
    mockPublishPhoto.mockRejectedValueOnce(
      new MetaApiError('This photo may not meet our quality guidelines', 400, 'PHOTO_REJECTED'),
    );
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.results[0].error_message).toBe(
      'This photo may not meet our quality guidelines',
    );
    expect(mockPostCreate.mock.calls[0]?.[0]?.data.error_message).toBe(
      'This photo may not meet our quality guidelines',
    );
  });

  it('(4) a Meta success whose POSTED row write keeps failing is a transient 500 — NEVER a FAILED row for a live post', async () => {
    // Meta accepted the post (Phase 1 succeeds); the history-row write then
    // keeps failing with a transient non-unique DB error. createPostedRowWithRetry
    // retries 3x then rethrows → 500 with NO FAILED row ever created.
    const dbBlip = new Error('connection terminated unexpectedly');
    mockPostCreate.mockRejectedValue(dbBlip);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload(),
    });
    expect(res.statusCode).toBe(500);
    // Every create attempt was a POSTED draft (retried) — never a FAILED
    // create, because the post IS live on the platform.
    expect(mockPostCreate.mock.calls.length).toBeGreaterThanOrEqual(3);
    for (const call of mockPostCreate.mock.calls) {
      expect(call[0].data.status).toBe('POSTED');
    }
    // Meta was only ever called once for this target — no double publish.
    expect(mockPublishPhoto).toHaveBeenCalledTimes(1);
  });

  it('(4) a Meta success whose POSTED write fails once then succeeds — retry recovers, still POSTED', async () => {
    const dbBlip = new Error('connection terminated unexpectedly');
    mockPostCreate.mockRejectedValueOnce(dbBlip); // attempt 1 fails
    mockPostCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: 'sp_1',
      ...args.data,
    })); // attempt 2 succeeds
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.results[0]).toMatchObject({ status: 'POSTED' });
    expect(mockPostCreate).toHaveBeenCalledTimes(2);
  });

  it('(5b) IG video item posts the primary photo AND the media snapshot says photo, not video', async () => {
    mockAccountFindMany.mockResolvedValue([IG_ACCOUNT]);
    // Product has a main video + a primary photo. SINGLE_PRODUCT defaults to
    // the video; IG's photo-only helper falls back to the primary photo.
    mockProductFindMany.mockResolvedValue([
      productRow({
        photos: [{ id: 'ph_primary', url: 'https://cdn.example/hero.jpg', is_primary: true }],
        videos: [{ id: 'v_1', public_url: 'https://cdn.example/clip.mp4', is_main: true }],
      }),
    ]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload({
        targets: ['ig_1'],
        items: [{ product_id: 'p_1' }], // no photo/video → main video default
      }),
    });
    expect(res.statusCode).toBe(200);
    expect(mockPublishInstagramPhoto).toHaveBeenCalledWith(
      'ig_user_55',
      'dec:tok-ig',
      'https://cdn.example/hero.jpg',
      expect.any(String),
    );
    // The recorded snapshot matches what actually went out — a photo.
    const media = mockPostCreate.mock.calls[0]?.[0]?.data.media as
      | Array<Record<string, string>>
      | undefined;
    expect(media).toEqual([
      {
        product_id: 'p_1',
        photo_id: 'ph_primary',
        kind: 'photo',
        url: 'https://cdn.example/hero.jpg',
      },
    ]);
  });
});

// ── admin post template publish (T-9.6) ─────────────────────────
describe('template_id publish (T-9.6)', () => {
  const TEMPLATE = {
    caption_template: 'New drop: {product_name} — \u20b9{price}',
    hashtags: ['#newarrival', '#kurti'],
  };

  it('resolves the template caption + appends hashtags when no client caption', async () => {
    mockTemplateFindFirst.mockResolvedValue(TEMPLATE);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload({ template_id: 'tpl_1' }),
    });
    expect(res.statusCode).toBe(200);
    const caption = mockPostCreate.mock.calls[0]?.[0].data.caption;
    expect(caption).toBe('New drop: Kurti — \u20b91,500\n\n#newarrival #kurti');
    // The resolved caption is what went to the platform.
    expect(mockPublishPhoto).toHaveBeenCalledWith(
      'page_101',
      'dec:tok-fb',
      'https://cdn.example/kurti.jpg',
      'New drop: Kurti — \u20b91,500\n\n#newarrival #kurti',
    );
  });

  it('keeps an edited client caption but re-resolves stray placeholders', async () => {
    mockTemplateFindFirst.mockResolvedValue(TEMPLATE);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload({
        template_id: 'tpl_1',
        caption: 'My own spin at {store_name} {typo_token}',
      }),
    });
    expect(res.statusCode).toBe(200);
    const caption = mockPostCreate.mock.calls[0]?.[0].data.caption;
    expect(caption).toBe('My own spin at Priya Cloth House');
    // Hashtags belong to the template text the client prefilled — never
    // appended server-side to a client-authored caption.
    expect(caption).not.toContain('#');
  });

  it('rejects an unknown or plan-mismatched template before publishing', async () => {
    mockTemplateFindFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload({ template_id: 'tpl_missing' }),
    });
    expect(res.statusCode).toBe(422);
    expect(mockPostCreate).not.toHaveBeenCalled();
    expect(mockPublishPhoto).not.toHaveBeenCalled();
  });

  it('increments usage_count once when at least one target posts', async () => {
    mockTemplateFindFirst.mockResolvedValue(TEMPLATE);
    mockAccountFindMany.mockResolvedValue([FB_ACCOUNT, IG_ACCOUNT]);
    mockPublishInstagramPhoto.mockRejectedValueOnce(
      new MetaApiError('IG container failed', 400, 'INSTAGRAM_CONTAINER_FAILED'),
    );
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload({ template_id: 'tpl_1', targets: ['fb_1', 'ig_1'] }),
    });
    expect(res.statusCode).toBe(200);
    // One bump for the whole fan-out, not per target.
    expect(mockTemplateUpdate).toHaveBeenCalledTimes(1);
    expect(mockTemplateUpdate).toHaveBeenCalledWith({
      where: { id: 'tpl_1' },
      data: { usage_count: { increment: 1 } },
    });
  });

  it('does not increment usage_count when every target fails', async () => {
    mockTemplateFindFirst.mockResolvedValue(TEMPLATE);
    // Real platform rejections are MetaApiError (curated user-safe text) —
    // finding 4 (task doc §12): a raw non-Meta error must NOT surface its
    // message; it is sanitized to a generic line. See the findings 3–5 block.
    mockPublishPhoto.mockRejectedValueOnce(new MetaApiError('graph exploded', 400, 'GRAPH_FAILED'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload({ template_id: 'tpl_1' }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('PUBLISH_FAILED');
    expect(mockTemplateUpdate).not.toHaveBeenCalled();
    // Per-target reasons ride in the error envelope (T-7.2) so the client
    // can show WHY each account failed instead of a generic alert.
    const results = res.json().error.results;
    expect(Array.isArray(results)).toBe(true);
    expect(results[0]).toMatchObject({ status: 'FAILED', platform: 'FACEBOOK' });
    expect(results[0].error_message).toContain('graph exploded');
  });

  it('does not double-count on an idempotent retry', async () => {
    mockTemplateFindFirst.mockResolvedValue(TEMPLATE);
    mockClaimSocialPostId.mockResolvedValue({ isNew: false, degradedReason: null });
    mockPostFindMany.mockResolvedValue([
      {
        id: 'sp_old_1',
        social_account_id: 'fb_1',
        platform: 'FACEBOOK',
        status: 'POSTED',
        external_post_url: 'https://www.facebook.com/page_101/posts/old',
      },
    ]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/social/posts',
      payload: captionPayload({ template_id: 'tpl_1' }),
    });
    expect(res.statusCode).toBe(200);
    expect(mockTemplateUpdate).not.toHaveBeenCalled();
  });
});
