/**
 * Retailer aggregate taste analytics.
 *
 * GET /v1/retailers/me/visitor-taste
 *
 * The CustomerFashionDNA source was removed in the feature teardown
 * (migration 082), so the endpoint now only reports the raw visitor count with
 * empty taste dimensions.
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';
import { retailersVisitorTasteRoutes } from '../retailers-visitor-taste.js';

// ─── Mocks ────────────────────────────────────────────────────────

const mockStoreVisitCount = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    customerStoreVisit: {
      count: mockStoreVisitCount,
    },
  },
  Prisma: {},
}));

// ─── Test app ─────────────────────────────────────────────────────

function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = 'ret_1';
  });
  app.register(retailersVisitorTasteRoutes, { prefix: '/v1/retailers' });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStoreVisitCount.mockResolvedValue(50);
});

// ─── Tests ────────────────────────────────────────────────────────

describe('GET /retailers/me/visitor-taste', () => {
  it('returns the visitor count with empty taste dimensions', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/retailers/me/visitor-taste',
    });

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.total_visitors).toBe(50);
    expect(data.passport_visitors).toBe(0);
    expect(data.has_sufficient_data).toBe(false);
    expect(data.k_anonymity_threshold).toBe(5);
    expect(data.top_colors).toEqual({});
    expect(data.top_styles).toEqual({});
    expect(data.budget).toEqual({ avg_min: null, avg_max: null, range_distribution: {} });
  });

  it('passes through a zero visitor count', async () => {
    mockStoreVisitCount.mockResolvedValue(0);

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/retailers/me/visitor-taste',
    });

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.total_visitors).toBe(0);
    expect(data.has_sufficient_data).toBe(false);
  });
});
