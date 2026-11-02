// Admin AI-content report queue: list masks the reporter's phone, anonymous reports show a null
// reporter, filters reach the query, PATCH only accepts NEW/REVIEWED and 404s on a bad id.
// Auth is the parent adminRoutes hook, covered by admin-route-guard.test.ts.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';
import { adminAiContentReportRoutes } from '../admin-ai-content-reports.js';

const m = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    aiContentReport: {
      findMany: m.findMany,
      count: m.count,
      findUnique: m.findUnique,
      update: m.update,
    },
  },
  Prisma: {},
}));

function app() {
  const a = Fastify();
  a.setErrorHandler(errorHandler);
  a.register(adminAiContentReportRoutes, { prefix: '/v1/admin' });
  return a;
}

const ROW = {
  id: 'r1',
  feature: 'AI Stylist',
  content_ref: 'demo-store',
  description: 'Showed something offensive',
  status: 'NEW',
  created_at: new Date('2026-11-02T00:00:00Z'),
};

beforeEach(() => {
  vi.resetAllMocks();
  m.count.mockResolvedValue(2);
});

describe('GET /admin/ai-content-reports', () => {
  it('masks the reporter phone and gives anonymous reports a null reporter', async () => {
    m.findMany.mockResolvedValue([
      { ...ROW, customer_account: { name: 'Asha', phone: '+919876543210' } },
      { ...ROW, id: 'r2', customer_account: null },
    ]);
    const res = await app().inject({ method: 'GET', url: '/v1/admin/ai-content-reports' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(2);
    expect(body.data[0].reporter.name).toBe('Asha');
    expect(body.data[1].reporter).toBeNull();
    expect(JSON.stringify(body)).not.toContain('+919876543210');
  });

  it('passes the status and feature filters to the query', async () => {
    m.findMany.mockResolvedValue([]);
    await app().inject({
      method: 'GET',
      url: '/v1/admin/ai-content-reports?status=NEW&feature=AI%20Stylist',
    });
    expect(m.findMany.mock.calls[0]?.[0].where).toEqual({ status: 'NEW', feature: 'AI Stylist' });
  });
});

describe('PATCH /admin/ai-content-reports/:id', () => {
  it('marks a report REVIEWED', async () => {
    m.findUnique.mockResolvedValue({ id: 'r1' });
    m.update.mockResolvedValue({ id: 'r1', status: 'REVIEWED' });
    const res = await app().inject({
      method: 'PATCH',
      url: '/v1/admin/ai-content-reports/r1',
      payload: { status: 'REVIEWED' },
    });
    expect(res.statusCode).toBe(200);
    expect(m.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { status: 'REVIEWED' },
      select: { id: true, status: true },
    });
  });

  it('rejects a status outside NEW/REVIEWED and writes nothing', async () => {
    const res = await app().inject({
      method: 'PATCH',
      url: '/v1/admin/ai-content-reports/r1',
      payload: { status: 'RESOLVED' },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect(m.update).not.toHaveBeenCalled();
  });

  it('404s for an unknown id', async () => {
    m.findUnique.mockResolvedValue(null);
    const res = await app().inject({
      method: 'PATCH',
      url: '/v1/admin/ai-content-reports/nope',
      payload: { status: 'REVIEWED' },
    });
    expect(res.statusCode).toBe(404);
  });
});
