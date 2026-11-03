import cookie from '@fastify/cookie';
import { ADMIN_READ_ONLY_ADMIN_SEGMENTS, ADMIN_TIER_ADMIN_SEGMENTS } from '@kanchuki/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@kanchuki/db', () => ({ prisma: {} }));

import { errorHandler } from '../plugins/error-handler.js';
import { adminAuthPreHandler, signAdminSession } from './admin-auth.js';

// Owner decision 2026-11-03: Backup & Restore and the Deletion Vault are view-only for ADMIN.
// Dummy handlers at the real route paths: this tests the admin gate, not the backup code.
const CSRF = { cookie: 'csrf-token=abc', 'x-csrf-token': 'abc' };
let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  process.env.ADMIN_API_KEY = 'test-admin-key';
  app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(cookie, { secret: 'test-cookie-secret' });
  await app.register(
    async (s: FastifyInstance) => {
      s.addHook('preHandler', adminAuthPreHandler);
      s.get('/backups', async () => ({ ok: true }));
      s.post('/backup/create', async () => ({ ok: true }));
      s.post('/backups/restore', async () => ({ ok: true }));
      s.get('/deletion-vault', async () => ({ ok: true }));
      s.delete('/deletion-vault/:id', async () => ({ ok: true }));
      s.post('/retailers/:id/suspend', async () => ({ ok: true })); // untouched standard route
    },
    { prefix: '/v1/admin' },
  );
  await app.ready();
});

afterAll(() => app.close());

const call = async (role: string, method: 'GET' | 'POST' | 'DELETE', url: string) => {
  const key = role === 'SUPER_ADMIN' ? 'test-admin-key' : await signAdminSession('a@b.c', role);
  return app.inject({ method, url, headers: { 'x-admin-key': key, ...CSRF } });
};

describe('Backup & Restore / Deletion Vault are view-only for ADMIN', () => {
  it('ADMIN can read both', async () => {
    expect((await call('ADMIN', 'GET', '/v1/admin/backups')).statusCode).toBe(200);
    expect((await call('ADMIN', 'GET', '/v1/admin/deletion-vault')).statusCode).toBe(200);
  });

  it('ADMIN cannot create or restore a backup, or delete from the vault', async () => {
    for (const [method, url] of [
      ['POST', '/v1/admin/backup/create'],
      ['POST', '/v1/admin/backups/restore'],
      ['DELETE', '/v1/admin/deletion-vault/x'],
    ] as const) {
      const res = await call('ADMIN', method, url);
      expect(res.statusCode, `${method} ${url}`).toBe(403);
      expect(res.body).toContain('Super Admin');
    }
  });

  it('SUPER_ADMIN can still write all of them', async () => {
    for (const [method, url] of [
      ['POST', '/v1/admin/backup/create'],
      ['POST', '/v1/admin/backups/restore'],
      ['DELETE', '/v1/admin/deletion-vault/x'],
    ] as const) {
      expect((await call('SUPER_ADMIN', method, url)).statusCode, `${method} ${url}`).toBe(200);
    }
  });

  it('other admin writes are not affected', async () => {
    expect((await call('ADMIN', 'POST', '/v1/admin/retailers/r1/suspend')).statusCode).toBe(200);
  });

  it('every read-only segment is an Admin-tier segment (it cannot widen access)', () => {
    const tier = ADMIN_TIER_ADMIN_SEGMENTS as readonly string[];
    expect(ADMIN_READ_ONLY_ADMIN_SEGMENTS.filter((s) => !tier.includes(s))).toEqual([]);
  });
});
