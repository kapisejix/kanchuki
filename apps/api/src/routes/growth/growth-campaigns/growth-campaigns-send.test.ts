import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';

// Staff may send campaigns but must never be handed customer numbers: the
// manual wa.me path embeds the full number, so non-owners are refused there
// BEFORE any row is written. The server-side API path returns no numbers.
const m = vi.hoisted(() => ({
  campaignFind: vi.fn(),
  customerFindMany: vi.fn(),
  retailerFind: vi.fn(),
  sendCreate: vi.fn(),
  campaignUpdate: vi.fn(),
  transaction: vi.fn(),
  hasFeature: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    campaign: { findFirst: m.campaignFind, update: m.campaignUpdate },
    customer: { findMany: m.customerFindMany },
    retailer: { findUnique: m.retailerFind },
    campaignSend: { create: m.sendCreate, update: vi.fn() },
    $transaction: m.transaction,
  },
}));
vi.mock('../../../lib/features.js', () => ({ hasFeature: m.hasFeature }));
vi.mock('./growth-campaigns-helpers.js', () => ({
  requireGrowth: vi.fn(),
  resolveAudienceCustomerIds: vi.fn(async () => ['c1']),
  storefrontLink: vi.fn(async () => 'https://kanchuki.app/shop'),
}));

const { growthCampaignSendRoutes } = await import('./growth-campaigns-send.js');

async function build(staffRole: string | null) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('staffRole', null);
  app.decorateRequest('catalogDelegate', null);
  app.addHook('onRequest', async (req) => {
    (req as unknown as Record<string, unknown>).retailerId = 'r1';
    (req as unknown as Record<string, unknown>).staffRole = staffRole;
  });
  await app.register(growthCampaignSendRoutes, { prefix: '/v1/growth' });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.campaignFind.mockResolvedValue({
    id: 'camp1',
    status: 'DRAFT',
    message_template: 'Hi {name}',
    audience_json: {},
    festival_name: null,
    ab_variants: null,
  });
  m.customerFindMany.mockResolvedValue([{ id: 'c1', name: 'Asha', phone: '9876543210' }]);
  m.transaction.mockResolvedValue([{ id: 's1' }]);
  m.campaignUpdate.mockResolvedValue({});
});

describe('POST /v1/growth/campaigns/:id/send', () => {
  it('refuses a manager on the manual-link path and writes nothing', async () => {
    m.retailerFind.mockResolvedValue({ shop_name: 'S', public_slug: 's' }); // no API creds
    m.hasFeature.mockResolvedValue(false);
    const app = await build('manager');
    const res = await app.inject({ method: 'POST', url: '/v1/growth/campaigns/camp1/send' });
    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain('9876543210');
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.campaignUpdate).not.toHaveBeenCalled();
  });

  it('owner still gets manual links on the manual path', async () => {
    m.retailerFind.mockResolvedValue({ shop_name: 'S', public_slug: 's' });
    m.hasFeature.mockResolvedValue(false);
    const app = await build(null);
    const res = await app.inject({ method: 'POST', url: '/v1/growth/campaigns/camp1/send' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.sent_via).toBe('manual_links');
  });
});
