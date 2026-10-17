// F-044 R2 T7 (E11) - admin try-on GPU usage report.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

const { mockJobFindMany, mockRetailerFindMany } = vi.hoisted(() => ({
  mockJobFindMany: vi.fn(),
  mockRetailerFindMany: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    tryOnJob: { findMany: mockJobFindMany },
    retailer: { findMany: mockRetailerFindMany },
  },
}));

let adminOk = true;
vi.mock('../admin-auth.js', () => ({
  adminAuthPreHandler: async (
    _req: unknown,
    reply: { code: (n: number) => { send: (b: unknown) => unknown } },
  ) => {
    if (!adminOk) return reply.code(401).send({ error: 'unauthorized' });
    return undefined;
  },
}));

const { adminTryOnUsageRoutes } = await import('./admin-try-on-usage.js');

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(adminTryOnUsageRoutes);
  await app.ready();
  return app;
}

const job = (retailer_id: string, status: string, gpu_ms: number | null, at: string) => ({
  retailer_id,
  status,
  gpu_ms,
  created_at: new Date(at),
});

beforeEach(() => {
  vi.clearAllMocks();
  adminOk = true;
  mockRetailerFindMany.mockResolvedValue([
    { id: 'r1', shop_name: 'Alpha' },
    { id: 'r2', shop_name: 'Beta' },
  ]);
});

describe('GET /try-on-usage', () => {
  it('aggregates two retailers across two days; a FAILED job counts with 0 ms', async () => {
    mockJobFindMany.mockResolvedValue([
      job('r1', 'COMPLETED', 40_000, '2026-10-01T05:00:00Z'),
      job('r1', 'COMPLETED', 20_000, '2026-10-02T05:00:00Z'),
      job('r2', 'COMPLETED', 30_000, '2026-10-02T09:00:00Z'),
      job('r2', 'FAILED', null, '2026-10-02T10:00:00Z'),
    ]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/try-on-usage?days=30' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      totals: { jobs: 4, completed: 3, failed: 1, gpu_ms_sum: 90_000, gpu_ms_avg: 30_000 },
      by_day: [
        { day: '2026-10-01', jobs: 1, gpu_ms_sum: 40_000 },
        { day: '2026-10-02', jobs: 3, gpu_ms_sum: 50_000 },
      ],
      by_retailer: [
        { retailer_id: 'r1', shop_name: 'Alpha', jobs: 2, gpu_ms_sum: 60_000 },
        { retailer_id: 'r2', shop_name: 'Beta', jobs: 2, gpu_ms_sum: 30_000 },
      ],
    });
  });

  it('avg is null when nothing completed', async () => {
    mockJobFindMany.mockResolvedValue([job('r1', 'FAILED', null, '2026-10-01T05:00:00Z')]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/try-on-usage' });
    expect(res.json().data.totals).toEqual({
      jobs: 1,
      completed: 0,
      failed: 1,
      gpu_ms_sum: 0,
      gpu_ms_avg: null,
    });
  });

  it('rejects days=0 with 422', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/try-on-usage?days=0' });
    expect(res.statusCode).toBe(422);
    expect(mockJobFindMany).not.toHaveBeenCalled();
  });

  it('rejects a non-admin with 401', async () => {
    adminOk = false;
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/try-on-usage' });
    expect(res.statusCode).toBe(401);
  });
});
