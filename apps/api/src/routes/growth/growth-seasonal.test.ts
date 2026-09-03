import { beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted so the variable exists when vi.mock runs
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
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

  const server = {
    get: (_path: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      handlerPromise = handler(buildRequest(query), { send: vi.fn() });
    },
  };

  await growthSeasonalRoutes(server as any, {});
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
    mockPrisma.campaign.findMany.mockReset().mockResolvedValue([]);
    mockPrisma.campaignSend.groupBy.mockReset().mockResolvedValue([]);
    mockPrisma.product.findMany.mockReset().mockResolvedValue([]);
    mockHasFeature.mockReset().mockResolvedValue(true);
  });

  it('returns seasonal data with default wedding period', async () => {
    mockPrisma.product.findMany.mockResolvedValue([
      { category: 'Lehenga', status: 'AVAILABLE', price_min: 5000, created_at: new Date() },
      { category: 'Lehenga', status: 'AVAILABLE', price_min: 6000, created_at: new Date() },
    ]);

    const data = await runRoute();
    expect(data.data.period.label).toContain('Wedding');
    expect(data.data.categories).toBeInstanceOf(Array);
  });

  it('returns 402 when growth feature is disabled', async () => {
    mockHasFeature.mockReset().mockResolvedValue(false);

    await expect(runRoute()).rejects.toThrow();
  });

  it('supports daily period', async () => {
    const data = await runRoute({ period: 'daily' });
    expect(data.data.period.label).toContain('Daily');
  });
});
