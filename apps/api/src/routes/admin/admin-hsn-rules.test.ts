import { randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';
import { adminHsnRulesRoutes } from './admin-hsn-rules.js';

const { mockFindUnique, mockCreate, mockUpdate, mockAuditLogCreate } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'r1', ...data })),
  mockUpdate: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    ...EXISTING,
    ...data,
  })),
  mockAuditLogCreate: vi.fn(),
}));

const EXISTING = { id: 'r1', keywords: ['silk'], hsn: '5007', sort_order: 10, is_active: false };

vi.mock('@kanchuki/db', () => ({
  prisma: {
    hsnRule: {
      findMany: vi.fn(async () => []),
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
    },
    auditLog: { create: mockAuditLogCreate },
  },
  getReplicaPrisma: () => ({ $queryRawUnsafe: vi.fn() }),
  getVaultPrisma: () => null,
  getPurgePrisma: () => ({ $executeRawUnsafe: vi.fn() }),
  getSecret: vi.fn(),
  Prisma: {},
}));

const ADMIN_KEY = 'test-admin-key-12345';

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(cookie, { secret: 'test-cookie-secret' });
  await app.register(adminHsnRulesRoutes, { prefix: '/v1/admin' });
  await app.ready();
  return app;
}

function headers() {
  const token = randomBytes(16).toString('hex');
  return {
    'x-admin-key': ADMIN_KEY,
    'x-csrf-token': token,
    cookie: `csrf-token=${token}`,
    'content-type': 'application/json',
  };
}

beforeEach(() => {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  vi.clearAllMocks();
  mockFindUnique.mockResolvedValue(EXISTING);
});

describe('admin HSN rules (§6.11)', () => {
  it('POST normalises keywords (trim, lowercase, de-dupe)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/hsn-rules',
      headers: headers(),
      payload: { keywords: [' Kaftan ', 'KAFTAN', 'tunic'], hsn: '621142' },
    });
    expect(res.statusCode).toBe(201);
    expect(mockCreate.mock.calls[0]?.[0].data.keywords).toEqual(['kaftan', 'tunic']);
  });

  it('rejects an HSN that is not 4, 6 or 8 digits', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/hsn-rules',
      headers: headers(),
      payload: { keywords: ['kaftan'], hsn: '62114' },
    });
    expect(res.statusCode).toBe(422);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('PATCH of one field never resets the others (no .partial() defaults)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/admin/hsn-rules/r1',
      headers: headers(),
      payload: { hsn: '500710' },
    });
    expect(res.statusCode).toBe(200);
    // A disabled rule must stay disabled: no is_active/sort_order defaults leak in.
    expect(mockUpdate.mock.calls[0]?.[0].data).toEqual({ hsn: '500710' });
  });

  it('refuses a request without the admin key', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/admin/hsn-rules' });
    expect(res.statusCode).toBe(403);
  });
});
