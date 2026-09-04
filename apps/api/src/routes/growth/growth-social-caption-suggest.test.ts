import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';
import { growthSocialCaptionSuggestRoutes } from './growth-social-caption-suggest.js';

const {
  mockProductFindMany,
  mockRetailerFindUniqueOrThrow,
  mockHasFeature,
  mockCheckQuota,
  mockGenerateCaption,
  mockRecordAiUsage,
  mockAiUsageLogCreate,
} = vi.hoisted(() => ({
  mockProductFindMany: vi.fn(),
  mockRetailerFindUniqueOrThrow: vi.fn(),
  mockHasFeature: vi.fn(),
  mockCheckQuota: vi.fn(),
  mockGenerateCaption: vi.fn(),
  mockRecordAiUsage: vi.fn(() => vi.fn()),
  mockAiUsageLogCreate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    product: { findMany: mockProductFindMany },
    retailer: { findUniqueOrThrow: mockRetailerFindUniqueOrThrow },
    aiUsageLog: { create: mockAiUsageLogCreate },
  },
  Prisma: {},
}));

vi.mock('@kanchuki/ai', () => ({
  generateSocialPostCaption: mockGenerateCaption,
}));

vi.mock('../../lib/features.js', () => ({
  hasFeature: mockHasFeature,
}));

vi.mock('../../lib/quota.js', () => ({
  checkQuota: mockCheckQuota,
  incrementUsage: vi.fn(),
}));

vi.mock('../../lib/ai-usage.js', () => ({
  recordAiUsage: mockRecordAiUsage,
}));

const RETAILER_ID = 'retailer_1';

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
  });
  await app.register(growthSocialCaptionSuggestRoutes, { prefix: '/v1/growth' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasFeature.mockResolvedValue(true);
  mockCheckQuota.mockResolvedValue(undefined);
  mockAiUsageLogCreate.mockResolvedValue({});
  mockRetailerFindUniqueOrThrow.mockResolvedValue({ shop_name: 'Sharma Silks' });
});

describe('POST /v1/growth/social-caption-suggest', () => {
  it('returns an AI caption + hashtags with real product/store context', async () => {
    mockProductFindMany.mockResolvedValue([
      { id: 'p1', name: 'Banarasi Silk Saree', category: 'Saree', price_min: 199900, price_max: 199900 },
    ]);
    mockGenerateCaption.mockResolvedValue({
      caption: 'New Banarasi silk sarees just landed ✨',
      hashtags: ['banarasisilk', 'sarees'],
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/growth/social-caption-suggest',
      payload: { product_ids: ['p1'], post_type: 'SINGLE_PRODUCT' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.caption).toBe('New Banarasi silk sarees just landed ✨');
    expect(body.data.hashtags).toEqual(['banarasisilk', 'sarees']);
    expect(body.data.source).toBe('ai');

    // Product query scoped to the retailer.
    expect(mockProductFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ retailer_id: RETAILER_ID, id: { in: ['p1'] } }),
      }),
    );
    // Quota checked + usage hook wired.
    expect(mockCheckQuota).toHaveBeenCalledWith(RETAILER_ID, 'AI_TAGGING_CALL');
    expect(mockGenerateCaption).toHaveBeenCalledWith(
      expect.objectContaining({
        productNames: ['Banarasi Silk Saree'],
        priceRange: '₹1,999',
        storeName: 'Sharma Silks',
        category: 'Saree',
        postType: 'SINGLE_PRODUCT',
        onProviderUsed: expect.any(Function),
      }),
    );
    expect(mockRecordAiUsage).toHaveBeenCalledWith(RETAILER_ID);
  });

  it('fails open to the templated caption when the AI call throws (never blocks publishing)', async () => {
    mockProductFindMany.mockResolvedValue([
      { id: 'p1', name: 'Kurti', category: 'Kurti', price_min: 79900, price_max: 79900 },
    ]);
    mockGenerateCaption.mockRejectedValue(new Error('provider down'));

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/growth/social-caption-suggest',
      payload: { product_ids: ['p1'] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.source).toBe('template');
    expect(body.data.hashtags).toEqual([]);
    // Template fallback contains the resolved values, never raw tokens.
    expect(body.data.caption).toContain('Kurti');
    expect(body.data.caption).not.toMatch(/\{[a-z_]+\}/);
    // The quota check passed but the AI call failed — no provider ever served,
    // so no usage-attribution row is written.
    expect(mockCheckQuota).toHaveBeenCalledWith(RETAILER_ID, 'AI_TAGGING_CALL');
    expect(mockAiUsageLogCreate).not.toHaveBeenCalled();
  });

  it('fails open when quota is exhausted (suggest is additive, must not hard-fail)', async () => {
    mockProductFindMany.mockResolvedValue([]);
    mockCheckQuota.mockRejectedValue(new Error('AI_TAGGING_CALL quota exceeded'));

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/growth/social-caption-suggest',
      payload: { product_ids: [] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.source).toBe('template');
  });

  it('ignores product ids that do not belong to the retailer', async () => {
    mockProductFindMany.mockResolvedValue([]); // attacker-supplied other-store id filtered out
    mockGenerateCaption.mockResolvedValue({ caption: 'Fallback', hashtags: [] });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/growth/social-caption-suggest',
      payload: { product_ids: ['someone_elses_product'] },
    });

    expect(res.statusCode).toBe(200);
    expect(mockProductFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ retailer_id: RETAILER_ID }),
      }),
    );
  });

  it('rejects without the GROWTH_ENGINE feature', async () => {
    mockHasFeature.mockResolvedValue(false);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/growth/social-caption-suggest',
      payload: { product_ids: [] },
    });
    expect(res.statusCode).toBe(402);
    expect(res.json().error.code).toBe('FEATURE_UNAVAILABLE');
  });

  it('validates the payload', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/growth/social-caption-suggest',
      payload: { product_ids: 'not-an-array' },
    });
    expect(res.statusCode).toBe(422);
  });
});
