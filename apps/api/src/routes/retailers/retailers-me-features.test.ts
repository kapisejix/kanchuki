// F-039 Phase 2 / T4 — GET /v1/retailers/me must carry the retailer's enabled
// plan features.
//
// Why the client needs this at all: the mobile app hides plan-gated entry points
// (the in-store try-on screen is the first one) unless the feature is present, so
// it has to be able to read the list from the one profile fetch it already makes.
// The assertion that matters is that the value is the SAME source the API gates
// on (`getEnabledFeatures`), not a second derivation that could disagree with it
// — a client showing a button the route then 404s is exactly the failure this
// closes. The route re-checks server-side regardless; this is presentation.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';
import { retailersProfileRoutes } from './retailers-profile.js';

const { mockRetailerFindUnique, mockProductCount, mockCustomerCount, mockGetEnabledFeatures } =
  vi.hoisted(() => ({
    mockRetailerFindUnique: vi.fn(),
    mockProductCount: vi.fn(),
    mockCustomerCount: vi.fn(),
    mockGetEnabledFeatures: vi.fn(),
  }));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findUnique: mockRetailerFindUnique, findUniqueOrThrow: vi.fn() },
    product: { count: mockProductCount },
    customer: { count: mockCustomerCount },
  },
  Prisma: {},
}));

vi.mock('../../lib/features.js', () => ({
  getEnabledFeatures: mockGetEnabledFeatures,
}));

const RETAILER_ID = 'retailer-1';

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
  });
  await app.register(retailersProfileRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRetailerFindUnique.mockResolvedValue({
    id: RETAILER_ID,
    shop_name: 'Meera Sarees',
    // The secret token must not ride along — the route strips it and exposes
    // only the boolean. Returning null here keeps that assertion honest.
    whatsapp_api_access_token: null,
  });
  mockProductCount.mockResolvedValue(0);
  mockCustomerCount.mockResolvedValue(0);
});

describe('GET /v1/retailers/me — plan features', () => {
  it('returns the enabled-feature list from the same helper the routes gate on', async () => {
    mockGetEnabledFeatures.mockResolvedValue(['BULK_ONBOARDING_IMPORT', 'VIRTUAL_TRY_ON_V2']);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/me' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.features).toEqual(['BULK_ONBOARDING_IMPORT', 'VIRTUAL_TRY_ON_V2']);
    expect(mockGetEnabledFeatures).toHaveBeenCalledWith(RETAILER_ID);
    await app.close();
  });

  it('returns an empty list (not an error) when the plan has nothing enabled', async () => {
    // The default state for every feature the day it ships, and for a retailer
    // whose plan has no rows at all — a 500 here would break the whole profile
    // screen over a feature flag.
    mockGetEnabledFeatures.mockResolvedValue([]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/me' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.features).toEqual([]);
    await app.close();
  });
});
