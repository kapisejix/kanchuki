// T1.7 F2 — a generic DB error on create/update/delete must surface as 500, not be
// reported as "already exists" (create), 404 (update) or a fake 204 (delete).
// Only P2002 (duplicate) and P2025 (row missing) are expected, per-route outcomes.
import { randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';
import { adminMiscRoutes } from './admin-misc.js';

const m = vi.hoisted(() => ({
  catCreate: vi.fn(),
  catUpdate: vi.fn(),
  catDelete: vi.fn(),
  attrCreate: vi.fn(),
  attrUpdate: vi.fn(),
  attrDelete: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    defaultProductCategory: { create: m.catCreate, update: m.catUpdate, delete: m.catDelete },
    defaultProductAttribute: { create: m.attrCreate, update: m.attrUpdate, delete: m.attrDelete },
    auditLog: { create: m.auditCreate },
  },
  getReplicaPrisma: () => ({ $queryRawUnsafe: vi.fn() }),
  getVaultPrisma: () => null,
  getPurgePrisma: () => ({ $executeRawUnsafe: vi.fn() }),
  getSecret: vi.fn(),
  encryptSecret: vi.fn(),
  invalidateSecret: vi.fn(),
  maskSecret: vi.fn(),
  vaultDelete: vi.fn(),
  Prisma: {},
}));

const ADMIN_KEY = 'test-admin-key-12345';
const dbDown = Object.assign(new Error('connection refused'), { code: 'P1001' });
const missing = Object.assign(new Error('not found'), { code: 'P2025' });
const duplicate = Object.assign(new Error('unique'), { code: 'P2002' });

async function call(method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(cookie, { secret: 'test-cookie-secret' });
  await app.register(adminMiscRoutes, { prefix: '/v1/admin' });
  await app.ready();
  const token = randomBytes(16).toString('hex');
  return app.inject({
    method,
    url,
    payload,
    headers: {
      'x-admin-key': ADMIN_KEY,
      'x-csrf-token': token,
      cookie: `csrf-token=${token}`,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
  });
}

beforeEach(() => {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  vi.clearAllMocks();
});

const CASES = [
  {
    name: 'default-categories',
    base: '/v1/admin/default-categories',
    create: m.catCreate,
    update: m.catUpdate,
    del: m.catDelete,
    body: { name: 'Suits' },
  },
  {
    name: 'default-attributes',
    base: '/v1/admin/default-attributes',
    create: m.attrCreate,
    update: m.attrUpdate,
    del: m.attrDelete,
    body: { kind: 'STYLE', name: 'Boho' },
  },
] as const;

for (const c of CASES) {
  describe(`T1.7 F2 ${c.name}`, () => {
    it('POST: duplicate (P2002) -> 422', async () => {
      c.create.mockRejectedValue(duplicate);
      expect((await call('POST', c.base, c.body)).statusCode).toBe(422);
    });
    it('POST: generic DB error -> 500, not "already exists"', async () => {
      c.create.mockRejectedValue(dbDown);
      expect((await call('POST', c.base, c.body)).statusCode).toBe(500);
    });
    it('PATCH: missing row (P2025) -> 404', async () => {
      c.update.mockRejectedValue(missing);
      expect((await call('PATCH', `${c.base}/x`, { sort_order: 1 })).statusCode).toBe(404);
    });
    it('PATCH: generic DB error -> 500, not 404', async () => {
      c.update.mockRejectedValue(dbDown);
      expect((await call('PATCH', `${c.base}/x`, { sort_order: 1 })).statusCode).toBe(500);
    });
    it('DELETE: missing row (P2025) -> 204 (idempotent)', async () => {
      c.del.mockRejectedValue(missing);
      expect((await call('DELETE', `${c.base}/x`)).statusCode).toBe(204);
    });
    it('DELETE: permission/DB error -> 500, not a fake 204', async () => {
      c.del.mockRejectedValue(Object.assign(new Error('permission denied'), { code: '42501' }));
      expect((await call('DELETE', `${c.base}/x`)).statusCode).toBe(500);
    });
  });
}
