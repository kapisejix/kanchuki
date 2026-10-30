import { randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';
import { adminDataRoutes } from './admin-data.js';

const { mockExec, mockQuery, mockAuditLogCreate } = vi.hoisted(() => ({
  mockExec: vi.fn(),
  mockQuery: vi.fn(),
  mockAuditLogCreate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: { auditLog: { create: mockAuditLogCreate } },
  getReplicaPrisma: () => ({
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ $executeRawUnsafe: mockExec, $queryRawUnsafe: mockQuery }),
  }),
  getVaultPrisma: () => null,
  getPurgePrisma: () => ({ $executeRawUnsafe: vi.fn() }),
  getSecret: vi.fn(),
  encryptSecret: vi.fn(),
  invalidateSecret: vi.fn(),
  maskSecret: vi.fn(),
  vaultDelete: vi.fn(),
}));

const ADMIN_KEY = 'test-admin-key-12345';

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(cookie, { secret: 'test-cookie-secret' });
  await app.register(adminDataRoutes, { prefix: '/v1/admin' });
  await app.ready();
  return app;
}

function post(query: string) {
  const token = randomBytes(16).toString('hex');
  return {
    method: 'POST' as const,
    url: '/v1/admin/query',
    headers: {
      'x-admin-key': ADMIN_KEY,
      'x-csrf-token': token,
      cookie: `csrf-token=${token}`,
      'content-type': 'application/json',
    },
    payload: { query },
  };
}

beforeEach(() => {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  vi.clearAllMocks();
  mockQuery.mockResolvedValue([{ n: 1 }]);
});

describe('POST /v1/admin/query', () => {
  it('sets READ ONLY then a 30s statement_timeout before running the query', async () => {
    const app = await buildApp();
    const res = await app.inject(post('SELECT 1 AS n'));
    expect(res.statusCode).toBe(200);
    expect(mockExec.mock.calls.map((c) => c[0])).toEqual([
      'SET TRANSACTION READ ONLY',
      "SET LOCAL statement_timeout = '30s'",
    ]);
    expect(mockQuery).toHaveBeenCalledWith('SELECT 1 AS n');
    expect(mockExec.mock.invocationCallOrder[1]).toBeLessThan(
      mockQuery.mock.invocationCallOrder[0] as number,
    );
  });

  it('rejects a non-SELECT statement before touching the database', async () => {
    const app = await buildApp();
    const res = await app.inject(post('DELETE FROM products'));
    expect(res.statusCode).toBe(422);
    expect(mockExec).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
