/**
 * Task 28: Retailer aggregate taste analytics.
 *
 * GET /v1/retailers/me/visitor-taste
 * Returns aggregated customer preference data with k-anonymity protection.
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';
import { prisma } from '@kanchuki/db';
import { retailersVisitorTasteRoutes } from '../retailers-visitor-taste.js';

// ─── Mocks ────────────────────────────────────────────────────────

const mockFashionDNAFindMany = vi.hoisted(() => vi.fn());
const mockStoreVisitCount = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    customerFashionDNA: {
      findMany: mockFashionDNAFindMany,
    },
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
  it('returns aggregated taste data with k-anonymity applied', async () => {
    // 10 customers with fashion DNA
    mockFashionDNAFindMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        color_affinities: { pink: 3, blue: 2, red: 1 },
        style_affinities: { casual: 5, ethnic: 2 },
        fabric_affinities: { cotton: 4, silk: 1 },
        occasion_affinities: { daily: 3, festival: 2 },
        budget_range: { min: 100000 + i * 10000, max: 200000 + i * 10000 },
        customer_account_id: `ca_${i}`,
      })),
    );

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/retailers/me/visitor-taste',
    });

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.passport_visitors).toBe(10);
    expect(data.total_visitors).toBe(50);
    expect(data.has_sufficient_data).toBe(true);
    expect(data.k_anonymity_threshold).toBe(5);
    // Colors should be aggregated and sorted
    expect(data.top_colors).toBeDefined();
  });

  it('returns empty data when no fashion DNA exists', async () => {
    mockFashionDNAFindMany.mockResolvedValue([]);

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/retailers/me/visitor-taste',
    });

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.passport_visitors).toBe(0);
    expect(data.has_sufficient_data).toBe(false);
    expect(data.top_colors).toEqual({});
  });

  it('suppresses dimensions with fewer than 5 contributors (k-anonymity)', async () => {
    // 6 customers, but only 3 like "red"
    mockFashionDNAFindMany.mockResolvedValue([
      { color_affinities: { pink: 5, red: 1 }, style_affinities: {}, fabric_affinities: {}, occasion_affinities: {}, budget_range: {}, customer_account_id: 'ca_1' },
      { color_affinities: { pink: 3, red: 1 }, style_affinities: {}, fabric_affinities: {}, occasion_affinities: {}, budget_range: {}, customer_account_id: 'ca_2' },
      { color_affinities: { pink: 2, red: 1 }, style_affinities: {}, fabric_affinities: {}, occasion_affinities: {}, budget_range: {}, customer_account_id: 'ca_3' },
      { color_affinities: { pink: 4 }, style_affinities: {}, fabric_affinities: {}, occasion_affinities: {}, budget_range: {}, customer_account_id: 'ca_4' },
      { color_affinities: { pink: 1 }, style_affinities: {}, fabric_affinities: {}, occasion_affinities: {}, budget_range: {}, customer_account_id: 'ca_5' },
      { color_affinities: { pink: 2 }, style_affinities: {}, fabric_affinities: {}, occasion_affinities: {}, budget_range: {}, customer_account_id: 'ca_6' },
    ]);

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/retailers/me/visitor-taste',
    });

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    // "red" has only 3 mentions total (< 5 threshold), should be suppressed
    expect(data.top_colors).not.toHaveProperty('red');
    // "pink" has 17 mentions total (>= 5), should be present
    expect(data.top_colors).toHaveProperty('pink');
  });

  it('returns budget stats when available', async () => {
    mockFashionDNAFindMany.mockResolvedValue(
      Array.from({ length: 6 }, () => ({
        color_affinities: {},
        style_affinities: {},
        fabric_affinities: {},
        occasion_affinities: {},
        budget_range: { min: 100000, max: 300000 },
        customer_account_id: 'ca_1',
      })),
    );

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/retailers/me/visitor-taste',
    });

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.budget).toBeDefined();
    expect(data.budget.avg_min).toBe(100000);
    expect(data.budget.avg_max).toBe(300000);
  });
});
