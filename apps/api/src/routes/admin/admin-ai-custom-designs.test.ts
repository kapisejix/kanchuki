import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

const m = vi.hoisted(() => ({ findMany: vi.fn(), groupBy: vi.fn() }));
vi.mock('@kanchuki/db', () => ({
  prisma: { aiCustomDesign: { findMany: m.findMany, groupBy: m.groupBy } },
}));
vi.mock('../admin-auth.js', () => ({ adminAuthPreHandler: async () => undefined }));

const { adminAiCustomDesignRoutes } = await import('./admin-ai-custom-designs.js');

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(adminAiCustomDesignRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.findMany.mockResolvedValue([{ id: 'd1', prompt: 'warm diyas', status: 'READY' }]);
  m.groupBy.mockResolvedValue([
    { status: 'READY', _count: { _all: 7 } },
    { status: 'FAILED', _count: { _all: 2 } },
  ]);
});

describe('GET /ai-custom-designs', () => {
  it('lists rows with 30-day status counts', async () => {
    const res = await (await buildApp()).inject({ method: 'GET', url: '/ai-custom-designs' });
    expect(res.statusCode).toBe(200);
    expect(res.json().stats).toEqual({ days: 30, ready: 7, failed: 2, pending: 0, total: 9 });
    expect(res.json().data).toHaveLength(1);
    expect(m.findMany.mock.calls[0]?.[0].take).toBe(100);
  });

  it('filters by status', async () => {
    await (await buildApp()).inject({
      method: 'GET',
      url: '/ai-custom-designs?status=FAILED&limit=5',
    });
    expect(m.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { status: 'FAILED' }, take: 5 });
  });

  it('rejects an unknown status', async () => {
    const res = await (await buildApp()).inject({
      method: 'GET',
      url: '/ai-custom-designs?status=X',
    });
    expect(res.statusCode).toBe(422);
  });

  it('selects no phone or other retailer PII', async () => {
    await (await buildApp()).inject({ method: 'GET', url: '/ai-custom-designs' });
    const sel = JSON.stringify(m.findMany.mock.calls[0]?.[0].select);
    expect(sel).not.toMatch(/phone|email|whatsapp|gstin/i);
  });

  it('has no write route', async () => {
    const app = await buildApp();
    for (const method of ['POST', 'PUT', 'DELETE'] as const) {
      expect((await app.inject({ method, url: '/ai-custom-designs' })).statusCode).toBe(404);
    }
  });
});
