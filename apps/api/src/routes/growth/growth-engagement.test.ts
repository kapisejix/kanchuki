// F-037 Phase 4 — retailer-facing engagement view.
//
// One property matters here: the route reads `request.retailerId` (whichever
// store is authenticated) and has NO way to name a different retailer or a
// customer — that absence IS the §4 privacy-boundary enforcement, so the test
// asserts the loader was called with exactly the caller's own id.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLoadView } = vi.hoisted(() => ({ mockLoadView: vi.fn() }));

vi.mock('../../lib/engagement-view.js', () => ({ loadRetailerEngagementView: mockLoadView }));

const { growthEngagementRoutes } = await import('./growth-engagement.js');

async function buildApp(retailerId: string) {
  const app = Fastify();
  app.addHook('onRequest', async (request) => {
    (request as unknown as { retailerId: string }).retailerId = retailerId;
  });
  await app.register(growthEngagementRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadView.mockResolvedValue({
    range_days: 30,
    dwell_trend: [],
    totals: {
      total_dwell_ms: '0',
      view_count: 0,
      search_count: 0,
      favorite_count: 0,
      unfavorite_count: 0,
      enquiry_count: 0,
      zero_result_count: 0,
    },
    top_products: [],
    top_favorited_products: [],
    top_searches: [],
    zero_result_terms: [],
    funnel: {
      view_count: 0,
      favorite_count: 0,
      enquiry_count: 0,
      view_to_favorite_pct: 0,
      view_to_enquiry_pct: 0,
    },
  });
});

describe('GET /engagement', () => {
  it("loads only the authenticated retailer's own view — no id param exists to override it", async () => {
    const app = await buildApp('r_own_store');
    const res = await app.inject({ method: 'GET', url: '/engagement' });
    expect(res.statusCode).toBe(200);
    expect(mockLoadView).toHaveBeenCalledWith('r_own_store', 30);
  });

  it('respects the days query param, clamped 1-90 by the schema', async () => {
    const app = await buildApp('r_own_store');
    await app.inject({ method: 'GET', url: '/engagement?days=7' });
    expect(mockLoadView).toHaveBeenCalledWith('r_own_store', 7);
  });
});
