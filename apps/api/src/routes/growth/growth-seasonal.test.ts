import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so the variable exists when vi.mock runs
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    customerInteraction: { findMany: vi.fn().mockResolvedValue([]) },
    campaign: { findMany: vi.fn().mockResolvedValue([]) },
    campaignSend: { groupBy: vi.fn().mockResolvedValue([]) },
    product: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock('@kanchuki/db', () => ({ prisma: mockPrisma }));

const { mockHasFeature } = vi.hoisted(() => ({
  mockHasFeature: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../lib/features.js', () => ({ hasFeature: mockHasFeature }));

// Now import the module under test after mocks are set up
const { growthSeasonalRoutes } = await import('./growth-seasonal.js');

function buildRequest(query: Record<string, string> = {}) {
  return { retailerId: 'test-retailer', query } as any;
}

/**
 * Run the route plugin with a mock server that captures the handler
 * and executes it synchronously (returns a Promise that resolves to the result).
 */
async function runRoute(query: Record<string, string> = {}): Promise<any> {
  let result: any = undefined;
  let error: any = undefined;
  let handlerPromise: Promise<any> | undefined;

  // The plugin calls server.get(path, handler). We capture the handler
  // and call it directly. server.get must NOT be async — otherwise the
  // plugin doesn't await the handler's promise (it calls get() and moves on).
  const server = {
    get: (_path: string, handler: Function) => {
      handlerPromise = handler(buildRequest(query), { send: vi.fn() });
    },
  };

  // growthSeasonalRoutes calls server.get which captures the handler promise.
  await growthSeasonalRoutes(server as any);
  // Now await the handler's promise (if any).
  if (handlerPromise) {
    try {
      result = await handlerPromise;
    } catch (err) {
      error = err;
    }
  }

  if (error) throw error;
  return result;
}

describe('GET /growth/analytics/seasonal', () => {
  beforeEach(() => {
    mockPrisma.customerInteraction.findMany.mockReset().mockResolvedValue([]);
    mockPrisma.campaign.findMany.mockReset().mockResolvedValue([]);
    mockPrisma.campaignSend.groupBy.mockReset().mockResolvedValue([]);
    mockPrisma.product.findMany.mockReset().mockResolvedValue([]);
    mockHasFeature.mockReset().mockResolvedValue(true);
  });

  it('returns seasonal data with default wedding period', async () => {
    mockPrisma.customerInteraction.findMany
      .mockResolvedValueOnce([
        { type: 'view', product: { category: 'Lehenga' } },
        { type: 'view', product: { category: 'Lehenga' } },
        { type: 'enquiry', product: { category: 'Lehenga' } },
      ])
      .mockResolvedValueOnce([
        { type: 'view', product: { category: 'Lehenga' } },
      ]);

    const data = await runRoute();
    expect(data.data.period.label).toContain('Wedding');
    expect(data.data.categories).toBeInstanceOf(Array);
    expect(data.data.categories.length).toBeGreaterThan(0);
    expect(data.data.categories[0].category).toBe('Lehenga');
    expect(data.data.categories[0].current.opens).toBe(2);
    expect(data.data.categories[0].current.enquiries).toBe(1);
  });

  it('returns 402 when growth feature is disabled', async () => {
    mockHasFeature.mockReset().mockResolvedValue(false);

    await expect(runRoute()).rejects.toThrow();
  });

  it('calculates delta percentages correctly', async () => {
    mockPrisma.customerInteraction.findMany
      .mockResolvedValueOnce([
        { type: 'view', product: { category: 'Saree' } },
        { type: 'view', product: { category: 'Saree' } },
        { type: 'view', product: { category: 'Saree' } },
        { type: 'view', product: { category: 'Saree' } },
      ])
      .mockResolvedValueOnce([
        { type: 'view', product: { category: 'Saree' } },
        { type: 'view', product: { category: 'Saree' } },
      ]);

    const data = await runRoute({ period: 'wedding' });
    const saree = data.data.categories.find((c: any) => c.category === 'Saree');
    expect(saree).toBeDefined();
    expect(saree.deltaPct.opens).toBe(100); // 4 vs 2 = +100%
  });

  it('supports daily period', async () => {
    const data = await runRoute({ period: 'daily' });
    expect(data.data.period.label).toContain('Daily');
  });
});
