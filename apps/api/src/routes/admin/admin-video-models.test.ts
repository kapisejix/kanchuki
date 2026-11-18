import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

const db = vi.hoisted(() => ({
  modelFindMany: vi.fn(),
  modelFindUnique: vi.fn(),
  modelUpdate: vi.fn(),
  pickFindMany: vi.fn(),
  pickFindUnique: vi.fn(),
  pickUpsert: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    videoModel: {
      findMany: db.modelFindMany,
      findUnique: db.modelFindUnique,
      update: db.modelUpdate,
    },
    planVideoModel: {
      findMany: db.pickFindMany,
      findUnique: db.pickFindUnique,
      upsert: db.pickUpsert,
    },
    auditLog: { create: db.audit },
  },
}));
vi.mock('../admin-auth.js', () => ({ adminAuthPreHandler: async () => undefined }));

const { adminVideoModelsRoutes } = await import('./admin-video-models.js');

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(adminVideoModelsRoutes);
  await app.ready();
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('admin video-models (F-034 T6)', () => {
  it('GET lists models with numeric prices and every plan pick (null when unset)', async () => {
    db.modelFindMany.mockResolvedValueOnce([
      {
        model_key: 'kling',
        label: 'Kling',
        endpoint: 'fal-ai/kling',
        notes: null,
        enabled: false,
        removal_date: null,
        price_usd_per_second: { toString: () => '0.07' },
        price_usd_per_million_tokens: null,
      },
    ]);
    db.pickFindMany.mockResolvedValueOnce([{ plan: 'PRO', model_key: 'kling' }]);
    const res = await (await buildApp()).inject({ method: 'GET', url: '/video-models' });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.models[0].price_usd_per_second).toBe(0.07);
    expect(data.models[0].price_usd_per_million_tokens).toBeNull();
    expect(data.plans).toEqual({ STARTER: null, GROWTH: null, PRO: 'kling' });
  });

  it('PATCH toggles enabled and writes an audit row', async () => {
    db.modelFindUnique.mockResolvedValueOnce({ model_key: 'kling', enabled: false });
    db.modelUpdate.mockResolvedValueOnce({ model_key: 'kling', enabled: true });
    const res = await (await buildApp()).inject({
      method: 'PATCH',
      url: '/video-models/kling',
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(200);
    expect(db.modelUpdate).toHaveBeenCalledWith({
      where: { model_key: 'kling' },
      data: { enabled: true },
    });
    expect(db.audit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resource_type: 'VideoModel',
        resource_id: 'kling',
        metadata: { before: { enabled: false }, after: { enabled: true } },
      }),
    });
  });

  it('PATCH 404 on an unknown model, nothing written', async () => {
    db.modelFindUnique.mockResolvedValueOnce(null);
    const res = await (await buildApp()).inject({
      method: 'PATCH',
      url: '/video-models/nope',
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(404);
    expect(db.modelUpdate).not.toHaveBeenCalled();
    expect(db.audit).not.toHaveBeenCalled();
  });

  it('PATCH rejects a missing enabled flag', async () => {
    const res = await (await buildApp()).inject({
      method: 'PATCH',
      url: '/video-models/kling',
      payload: {},
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(db.modelUpdate).not.toHaveBeenCalled();
  });

  it('PUT upserts the plan pick (disabled model allowed) and audits before/after', async () => {
    db.modelFindUnique.mockResolvedValueOnce({ model_key: 'wan', enabled: false });
    db.pickFindUnique.mockResolvedValueOnce({ plan: 'GROWTH', model_key: 'kling' });
    db.pickUpsert.mockResolvedValueOnce({});
    const res = await (await buildApp()).inject({
      method: 'PUT',
      url: '/video-models/plans/GROWTH',
      payload: { model_key: 'wan' },
    });
    expect(res.statusCode).toBe(200);
    expect(db.pickUpsert).toHaveBeenCalledWith({
      where: { plan: 'GROWTH' },
      create: { plan: 'GROWTH', model_key: 'wan' },
      update: { model_key: 'wan' },
    });
    expect(db.audit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resource_type: 'PlanVideoModel',
        resource_id: 'GROWTH',
        metadata: { before: { model_key: 'kling' }, after: { model_key: 'wan' } },
      }),
    });
  });

  it('PUT 404 on an unknown model and 4xx on an unknown plan', async () => {
    db.modelFindUnique.mockResolvedValueOnce(null);
    const app = await buildApp();
    const r1 = await app.inject({
      method: 'PUT',
      url: '/video-models/plans/PRO',
      payload: { model_key: 'nope' },
    });
    expect(r1.statusCode).toBe(404);
    const r2 = await app.inject({
      method: 'PUT',
      url: '/video-models/plans/FREE',
      payload: { model_key: 'kling' },
    });
    expect(r2.statusCode).toBeGreaterThanOrEqual(400);
    expect(db.pickUpsert).not.toHaveBeenCalled();
  });

  it('never deletes: kanchuki_app has no DELETE grant on these tables (RC-049)', () => {
    const src = readFileSync(new URL('./admin-video-models.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/\.delete(Many)?\(|server\.delete\(/);
  });
});
