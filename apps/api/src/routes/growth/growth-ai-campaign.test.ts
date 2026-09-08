import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';
import { growthAiCampaignRoutes } from './growth-ai-campaign.js';

const {
  mockProductFindMany,
  mockFestivalFindMany,
  mockCustomerFindMany,
  mockCampaignCreate,
  mockHasFeature,
  mockCheckQuota,
  mockIncrementUsage,
  mockRunVisionAsk,
} = vi.hoisted(() => ({
  mockProductFindMany: vi.fn(),
  mockFestivalFindMany: vi.fn(),
  mockCustomerFindMany: vi.fn(),
  mockCampaignCreate: vi.fn(),
  mockHasFeature: vi.fn(),
  mockCheckQuota: vi.fn(),
  mockIncrementUsage: vi.fn(),
  mockRunVisionAsk: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    product: { findMany: mockProductFindMany },
    festival: { findMany: mockFestivalFindMany },
    customer: { findMany: mockCustomerFindMany },
    campaign: { create: mockCampaignCreate },
  },
  Prisma: {},
}));

vi.mock('@kanchuki/ai', () => ({
  parseCampaignIntent: mockRunVisionAsk,
  generateCampaignMessage: mockRunVisionAsk,
}));

vi.mock('../../lib/features.js', () => ({
  hasFeature: mockHasFeature,
}));

vi.mock('../../lib/quota.js', () => ({
  checkQuota: mockCheckQuota,
  incrementUsage: mockIncrementUsage,
}));

const RETAILER_ID = 'retailer_1';

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
  });
  await app.register(growthAiCampaignRoutes, { prefix: '/v1/growth' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasFeature.mockResolvedValue(true);
  mockCheckQuota.mockResolvedValue(undefined);
  mockIncrementUsage.mockResolvedValue(undefined);
});

describe('POST /v1/growth/ai-campaign', () => {
  it('returns a campaign draft for a valid prompt', async () => {
    mockRunVisionAsk
      .mockResolvedValueOnce({
        campaign_type: 'FESTIVAL',
        name: 'Diwali silk blast',
        festival_id: null,
        audience: { colors: ['Red'], styles: ['Wedding'], fabrics: ['Silk'] },
        product_criteria: { category: 'Saree', fabrics: ['Silk'], limit: 5 },
        message_tone: 'festive',
        schedule_hint: '2 days before Diwali',
      })
      .mockResolvedValueOnce({
        message_template: 'Happy Diwali {{name}}! ✨ New silk sarees at {{shop}}. Browse: {{link}}',
        rationale: 'Targets wedding shoppers',
        audience_estimate_note: 'VIP customers who like silk',
      });

    mockProductFindMany.mockResolvedValue([
      {
        id: 'p1',
        name: 'Red Banarasi Silk',
        category: 'Saree',
        primary_color: 'Red',
        price_min: 250000,
      },
      {
        id: 'p2',
        name: 'Maroon Silk Saree',
        category: 'Saree',
        primary_color: 'Maroon',
        price_min: 300000,
      },
    ]);

    mockCustomerFindMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]);
    // FESTIVAL intent with null festival_id — the route must resolve it by
    // matching the festival name in the prompt against the calendar.
    mockFestivalFindMany.mockResolvedValue([
      { id: 7, name: 'Diwali' },
      { id: 3, name: 'Navratri' },
    ]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/growth/ai-campaign',
      headers: { 'content-type': 'application/json' },
      payload: { prompt: 'Send silk sarees to premium customers for Diwali' },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.name).toBe('Diwali silk blast');
    expect(data.type).toBe('FESTIVAL');
    expect(data.product_ids).toEqual(['p1', 'p2']);
    expect(data.audience_count).toBe(3);
    expect(data.message_template).toContain('{{name}}');
    expect(data.rationale).toBe('Targets wedding shoppers');
    // Festival resolved by name-in-prompt match, not the old first-3-words
    // exact match that never matched anything.
    expect(data.festival_id).toBe(7);
    await app.close();
  });

  it('rejects requests without GROWTH_ENGINE feature', async () => {
    mockHasFeature.mockResolvedValue(false);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/growth/ai-campaign',
      headers: { 'content-type': 'application/json' },
      payload: { prompt: 'Send cotton kurtis' },
    });
    expect(res.statusCode).toBe(402);
    await app.close();
  });

  it('rejects empty or short prompts', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/growth/ai-campaign',
      headers: { 'content-type': 'application/json' },
      payload: { prompt: '' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('resolves festival_id by matching the festival name anywhere in the prompt', async () => {
    // The old implementation matched prompt.split(' ').slice(0, 3) exactly
    // against the festival name — "Create a Diwali collection" would look for
    // a festival literally named "Create a Diwali" and always miss. The fixed
    // route matches any festival whose name appears in the prompt.
    mockRunVisionAsk
      .mockResolvedValueOnce({
        campaign_type: 'FESTIVAL',
        name: 'Diwali blast',
        festival_id: null,
        audience: {},
        product_criteria: {},
        message_tone: 'festive',
        schedule_hint: null,
      })
      .mockResolvedValueOnce({
        message_template: 'Diwali special at {{shop}} {{link}}',
        rationale: 'Festive blast',
        audience_estimate_note: '',
      });
    mockProductFindMany.mockResolvedValue([]);
    mockCustomerFindMany.mockResolvedValue([]);
    mockFestivalFindMany.mockResolvedValue([
      { id: 11, name: 'Navratri' },
      { id: 12, name: 'Diwali' },
    ]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/growth/ai-campaign',
      headers: { 'content-type': 'application/json' },
      payload: { prompt: 'Create a Diwali collection for our best customers' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.festival_id).toBe(12);
    await app.close();
  });

  it('leaves festival_id null when no calendar festival name appears in the prompt', async () => {
    mockRunVisionAsk
      .mockResolvedValueOnce({
        campaign_type: 'FESTIVAL',
        name: 'Festive saree offer',
        festival_id: null,
        audience: {},
        product_criteria: {},
        message_tone: 'festive',
        schedule_hint: null,
      })
      .mockResolvedValueOnce({
        message_template: 'Festive saree offer at {{shop}} {{link}}',
        rationale: 'Festive push',
        audience_estimate_note: '',
      });
    mockProductFindMany.mockResolvedValue([]);
    mockCustomerFindMany.mockResolvedValue([]);
    mockFestivalFindMany.mockResolvedValue([{ id: 12, name: 'Diwali' }]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/growth/ai-campaign',
      headers: { 'content-type': 'application/json' },
      payload: { prompt: 'Send a festive saree offer to everyone' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.festival_id).toBeNull();
    await app.close();
  });

  it('does not query the festival table for non-FESTIVAL intents', async () => {
    mockRunVisionAsk
      .mockResolvedValueOnce({
        campaign_type: 'PROMOTION',
        name: 'Kurti sale',
        festival_id: null,
        audience: {},
        product_criteria: {},
        message_tone: 'casual',
        schedule_hint: null,
      })
      .mockResolvedValueOnce({
        message_template: 'Kurti sale at {{shop}} {{link}}',
        rationale: 'Promotion',
        audience_estimate_note: '',
      });
    mockProductFindMany.mockResolvedValue([]);
    mockCustomerFindMany.mockResolvedValue([]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/growth/ai-campaign',
      headers: { 'content-type': 'application/json' },
      payload: { prompt: 'Run a kurti sale for everyone' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockFestivalFindMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('falls back to raw text when message generation returns non-JSON', async () => {
    mockRunVisionAsk
      .mockResolvedValueOnce({
        campaign_type: 'PROMOTION',
        name: 'Kurti sale',
        festival_id: null,
        audience: {},
        product_criteria: {},
        message_tone: 'casual',
        schedule_hint: null,
      })
      .mockResolvedValueOnce({
        message_template: 'Hi {{name}}, kurtis on sale at {{shop}}! {{link}}',
        rationale: 'AI-generated message',
        audience_estimate_note: '',
      });

    mockProductFindMany.mockResolvedValue([]);
    mockCustomerFindMany.mockResolvedValue([]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/growth/ai-campaign',
      headers: { 'content-type': 'application/json' },
      payload: { prompt: 'Run a kurti promotion for everyone' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.message_template).toContain('{{name}}');
    await app.close();
  });
});
