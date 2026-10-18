// Route tests for F-045 My Style admin (PR-8 T18): palettes, trends, usage.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

const m = vi.hoisted(() => ({
  palFind: vi.fn(),
  palUnique: vi.fn(),
  palUpdate: vi.fn(),
  famFind: vi.fn(),
  trFind: vi.fn(),
  trUnique: vi.fn(),
  trCreate: vi.fn(),
  trUpdate: vi.fn(),
  dailyFind: vi.fn(),
  limitUnique: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    // No `delete` anywhere on purpose (RC-049): these routes must never need one.
    stylePalette: { findMany: m.palFind, findUnique: m.palUnique, update: m.palUpdate },
    colorFamily: { findMany: m.famFind },
    styleTrend: {
      findMany: m.trFind,
      findUnique: m.trUnique,
      create: m.trCreate,
      update: m.trUpdate,
    },
    styleAnalysisDaily: { findMany: m.dailyFind },
    customerResourceLimit: { findUnique: m.limitUnique },
    auditLog: { create: m.audit },
  },
}));
vi.mock('../admin-auth.js', () => ({ adminAuthPreHandler: async () => undefined }));

const { adminMyStyleRoutes, COST_PER_ANALYSIS_PAISE } = await import('./admin-my-style.js');

async function buildApp(role = 'SUPER_ADMIN') {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.addHook('onRequest', async (request) => {
    request.adminRole = role;
    request.adminId = 'admin@test';
  });
  await app.register(adminMyStyleRoutes);
  await app.ready();
  return app;
}

const palette = (over: Record<string, unknown> = {}) => ({
  id: 'sp_1',
  undertone: 'warm',
  depth: 'medium',
  good_families: ['yellow', 'teal'],
  avoid_families: ['beige'],
  version: 1,
  is_active: true,
  ...over,
});
const trend = (over: Record<string, unknown> = {}) => ({
  id: 'tr_1',
  label: 'Diwali reds',
  kind: 'festival',
  match_keywords: ['red'],
  boost: 0.4,
  starts_at: null,
  ends_at: null,
  is_active: true,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.audit.mockResolvedValue({});
  m.palUnique.mockResolvedValue(palette());
  m.palUpdate.mockImplementation(async ({ data }) => palette({ ...data, version: 2 }));
  m.famFind.mockResolvedValue(
    ['yellow', 'teal', 'beige', 'red', 'green'].map((name) => ({ name })),
  );
  m.trUnique.mockResolvedValue(trend());
  m.trCreate.mockImplementation(async ({ data }) => trend({ id: 'tr_new', ...data }));
  m.trUpdate.mockImplementation(async ({ data }) => trend(data));
});

describe('PATCH /my-style/palettes/:id', () => {
  it('updates a cell, bumps version, and writes an audit row', async () => {
    const app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'PATCH',
      url: '/my-style/palettes/sp_1',
      payload: { good_families: ['Green', 'yellow', 'yellow'] },
    });
    expect(res.statusCode).toBe(200);
    expect(m.palUpdate).toHaveBeenCalledWith({
      where: { id: 'sp_1' },
      data: { good_families: ['green', 'yellow'], version: { increment: 1 } },
    });
    expect(m.audit.mock.calls[0]?.[0].data).toMatchObject({
      resource_type: 'StylePalette',
      metadata: { cell: 'warm/medium', admin: 'admin@test' },
    });
  });

  it('rejects a family that is not an active colour family', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/my-style/palettes/sp_1',
      payload: { good_families: ['mauvish'] },
    });
    expect(res.statusCode).toBe(422);
    expect(m.palUpdate).not.toHaveBeenCalled();
  });

  it('rejects a family that is both good and avoid, including via the stored side', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/my-style/palettes/sp_1',
      payload: { avoid_families: ['yellow'] }, // yellow is already in stored good_families
    });
    expect(res.statusCode).toBe(422);
    expect(m.palUpdate).not.toHaveBeenCalled();
  });

  it('is_active alone skips the colour lookup', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/my-style/palettes/sp_1',
      payload: { is_active: false },
    });
    expect(res.statusCode).toBe(200);
    expect(m.famFind).not.toHaveBeenCalled();
  });

  it('404s an unknown id and 422s an empty or unknown-key body', async () => {
    const app = await buildApp();
    m.palUnique.mockResolvedValueOnce(null);
    const missing = await app.inject({
      method: 'PATCH',
      url: '/my-style/palettes/nope',
      payload: { is_active: true },
    });
    expect(missing.statusCode).toBe(404);
    const empty = await app.inject({
      method: 'PATCH',
      url: '/my-style/palettes/sp_1',
      payload: {},
    });
    expect(empty.statusCode).toBe(422);
    const extra = await app.inject({
      method: 'PATCH',
      url: '/my-style/palettes/sp_1',
      payload: { undertone: 'cool' }, // the cell identity is not editable
    });
    expect(extra.statusCode).toBe(422);
  });
});

describe('trends', () => {
  it('creates a trend with a valid window', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/my-style/trends',
      payload: {
        label: 'Navratri',
        kind: 'Festival',
        match_keywords: ['Red', 'red', 'chaniya'],
        boost: 0.5,
        starts_at: '2026-10-10T00:00:00Z',
        ends_at: '2026-10-20T00:00:00Z',
      },
    });
    expect(res.statusCode).toBe(201);
    const data = m.trCreate.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({
      kind: 'festival',
      match_keywords: ['red', 'chaniya'],
      boost: 0.5,
    });
    expect(data.starts_at).toEqual(new Date('2026-10-10T00:00:00Z'));
  });

  it.each([
    ['boost above 1', { label: 'x1', kind: 'festival', boost: 1.5 }],
    ['negative boost', { label: 'x1', kind: 'festival', boost: -0.1 }],
    [
      'ends before starts',
      {
        label: 'x1',
        kind: 'festival',
        starts_at: '2026-10-20T00:00:00Z',
        ends_at: '2026-10-10T00:00:00Z',
      },
    ],
    ['no label', { kind: 'festival' }],
  ])('rejects %s', async (_n, payload) => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/my-style/trends', payload });
    expect(res.statusCode).toBe(422);
    expect(m.trCreate).not.toHaveBeenCalled();
  });

  it('patch checks the new end against the STORED start', async () => {
    const app = await buildApp();
    m.trUnique.mockResolvedValue(trend({ starts_at: new Date('2026-10-10T00:00:00Z') }));
    const res = await app.inject({
      method: 'PATCH',
      url: '/my-style/trends/tr_1',
      payload: { ends_at: '2026-10-01T00:00:00Z' },
    });
    expect(res.statusCode).toBe(422);
    expect(m.trUpdate).not.toHaveBeenCalled();
  });

  it('patch can retire a trend and clear a date with null', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/my-style/trends/tr_1',
      payload: { is_active: false, ends_at: null },
    });
    expect(res.statusCode).toBe(200);
    expect(m.trUpdate.mock.calls[0]?.[0].data).toEqual({ is_active: false, ends_at: null });
  });
});

describe('GET /my-style/usage', () => {
  it('is Super Admin only', async () => {
    const app = await buildApp('ADMIN');
    const res = await app.inject({ method: 'GET', url: '/my-style/usage' });
    expect(res.statusCode).toBe(403);
    expect(m.dailyFind).not.toHaveBeenCalled();
  });

  it('returns every day in the window with zeros filled, plus totals and estimated cost', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-18T10:00:00Z'));
    try {
      m.dailyFind.mockResolvedValue([
        { day: new Date('2026-10-16'), count: 4 },
        { day: new Date('2026-10-18'), count: 2 },
      ]);
      m.limitUnique.mockResolvedValue({ limit_per_period: 3, period: 'MONTH' });
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/my-style/usage?days=4' });
      const { data } = res.json();
      expect(data.by_day.map((d: { day: string }) => d.day)).toEqual([
        '2026-10-15',
        '2026-10-16',
        '2026-10-17',
        '2026-10-18',
      ]);
      expect(data.by_day.map((d: { count: number }) => d.count)).toEqual([0, 4, 0, 2]);
      expect(data.totals).toEqual({ analyses: 6, cost_paise: 6 * COST_PER_ANALYSIS_PAISE });
      expect(data.limit).toEqual({ limit_per_period: 3, period: 'MONTH' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports limit null when no quota row exists, and rejects a bad window', async () => {
    m.dailyFind.mockResolvedValue([]);
    m.limitUnique.mockResolvedValue(null);
    const app = await buildApp();
    const ok = await app.inject({ method: 'GET', url: '/my-style/usage' });
    expect(ok.json().data.limit).toBeNull();
    expect(ok.json().data.by_day).toHaveLength(30);
    const bad = await app.inject({ method: 'GET', url: '/my-style/usage?days=9999' });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
  });
});
