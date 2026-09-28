// F-037 Phase 3 — admin engagement analytics routes.
//
// Three things asserted:
//  1. Store-level view merges multiple days' top-N JSON lists correctly —
//     summed by value across days, re-ranked, not just concatenated.
//  2. Funnel percentages are computed from totals and guarded against
//     divide-by-zero (a retailer with 0 views must not throw or return NaN).
//  3. The per-customer drill-down writes an AuditLog row BEFORE returning
//     data — the spec's non-negotiable ("who looked at this data" must
//     always have an answer) — and 404s cleanly with NO audit write when
//     there is nothing to drill into.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

const {
  mockRetailerFindUnique,
  mockDailyFindMany,
  mockSummaryFindUnique,
  mockInteractionFindMany,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockRetailerFindUnique: vi.fn(),
  mockDailyFindMany: vi.fn(),
  mockSummaryFindUnique: vi.fn(),
  mockInteractionFindMany: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findUnique: mockRetailerFindUnique },
    retailerEngagementDaily: { findMany: mockDailyFindMany },
    customerEngagementSummary: { findUnique: mockSummaryFindUnique },
    customerInteraction: { findMany: mockInteractionFindMany },
    auditLog: { create: mockAuditCreate },
  },
}));

vi.mock('../admin-auth.js', () => ({ adminAuthPreHandler: async () => undefined }));

const { adminEngagementRoutes } = await import('./admin-engagement.js');

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(adminEngagementRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuditCreate.mockResolvedValue({});
});

describe('GET /engagement/retailers/:id', () => {
  it('merges top-N lists across days by summing counts, not concatenating', async () => {
    mockRetailerFindUnique.mockResolvedValue({ id: 'r_1', shop_name: 'Test Store' });
    mockDailyFindMany.mockResolvedValue([
      {
        date: new Date('2026-09-27T00:00:00.000Z'),
        total_dwell_ms: 3000n,
        view_count: 5,
        search_count: 1,
        favorite_count: 2,
        unfavorite_count: 0,
        enquiry_count: 1,
        zero_result_count: 0,
        top_products: [{ value: 'p_1', count: 3 }],
        top_favorited_products: [],
        top_searches: [],
        zero_result_terms: [],
      },
      {
        date: new Date('2026-09-28T00:00:00.000Z'),
        total_dwell_ms: 2000n,
        view_count: 4,
        search_count: 0,
        favorite_count: 0,
        unfavorite_count: 0,
        enquiry_count: 0,
        zero_result_count: 0,
        top_products: [
          { value: 'p_1', count: 2 },
          { value: 'p_2', count: 6 },
        ],
        top_favorited_products: [],
        top_searches: [],
        zero_result_terms: [],
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/engagement/retailers/r_1?days=7' });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // p_1 appears both days (3 + 2 = 5) and must outrank p_2 (5) only by
    // count, not by being seen first — this is the "summed, not concatenated"
    // property the test exists for.
    expect(body.data.top_products).toEqual([
      { value: 'p_2', count: 6 },
      { value: 'p_1', count: 5 },
    ]);
    expect(body.data.totals.total_dwell_ms).toBe('5000');
    expect(body.data.totals.view_count).toBe(9);
    expect(body.data.dwell_trend).toHaveLength(2);
  });

  it('computes funnel percentages without dividing by zero', async () => {
    mockRetailerFindUnique.mockResolvedValue({ id: 'r_empty', shop_name: 'Quiet Store' });
    mockDailyFindMany.mockResolvedValue([]); // no interactions in range

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/engagement/retailers/r_empty' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.funnel).toEqual({
      view_count: 0,
      favorite_count: 0,
      enquiry_count: 0,
      view_to_favorite_pct: 0,
      view_to_enquiry_pct: 0,
    });
  });

  it('404s when the retailer does not exist', async () => {
    mockRetailerFindUnique.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/engagement/retailers/nope' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /engagement/customers/:customerId', () => {
  it('writes an AuditLog row BEFORE returning the drill-down data', async () => {
    mockSummaryFindUnique.mockResolvedValue({
      total_dwell_ms: 9000n,
      view_count: 3,
      favorite_count: 1,
      enquiry_count: 0,
      last_active_at: new Date('2026-09-28T00:00:00.000Z'),
    });
    mockInteractionFindMany.mockResolvedValue([
      {
        id: 'i_1',
        type: 'VIEW',
        product_id: 'p_1',
        metadata: { dwell_ms: 3000 },
        created_at: new Date(),
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/engagement/customers/ca_1?retailer_id=r_1',
    });

    expect(res.statusCode).toBe(200);
    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor_type: 'admin',
        action: 'ADMIN_VIEWED_CUSTOMER_ENGAGEMENT',
        resource_type: 'CustomerAccount',
        resource_id: 'ca_1',
        metadata: { retailer_id: 'r_1' },
      }),
    });
    // The audit call must have resolved before the history query ran — the
    // route awaits it inline, so call order on the mocks proves the sequence.
    const auditOrder = mockAuditCreate.mock.invocationCallOrder[0];
    const historyOrder = mockInteractionFindMany.mock.invocationCallOrder[0];
    expect(auditOrder).toBeLessThan(historyOrder as number);
  });

  it('404s with NO audit write when there is nothing to drill into', async () => {
    mockSummaryFindUnique.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/engagement/customers/ca_ghost?retailer_id=r_1',
    });
    expect(res.statusCode).toBe(404);
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });
});
