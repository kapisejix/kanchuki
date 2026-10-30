// Behavioural tests for adminAuthPreHandler (H3-1, H3-3).
//
// admin-route-guard.test.ts only proves "no key -> 403" and admin-access.test.ts only
// proves the segment LIST is complete. Neither sends a real team token, so neither can
// see a role/path decision going wrong. This mounts the real guard on stub routes with a
// faked teamMember table and checks what each token may reach.
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('@kanchuki/db', () => ({ prisma: { teamMember: { findUnique } } }));

import { errorHandler } from '../plugins/error-handler.js';
import { signTeamToken } from '../plugins/team-auth.js';
import { adminAuthPreHandler } from './admin-auth.js';

const CSRF = { cookie: 'csrf-token=abc', 'x-csrf-token': 'abc' };
let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  process.env.TEAM_JWT_SECRET = 'test-team-secret';
  process.env.ADMIN_API_KEY = 'test-admin-key';
  app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(cookie, { secret: 'test-cookie-secret' });
  await app.register(
    async (s: FastifyInstance) => {
      s.addHook('preHandler', adminAuthPreHandler);
      s.put('/plan-pricing', async () => ({ reached: 'plan-pricing' }));
      s.post('/query', async () => ({ reached: 'query' }));
      s.get('/audit-log', async () => ({ reached: 'audit-log' }));
      s.get('/retailers', async () => ({ reached: 'retailers' }));
      s.get('/support-tickets', async () => ({ reached: 'support-tickets' }));
      s.get('/festivals', async () => ({ reached: 'festivals' }));
    },
    { prefix: '/v1/admin' },
  );
  await app.ready();
});

afterAll(() => app.close());

beforeEach(() => findUnique.mockReset());

const teamToken = (role: string) => signTeamToken({ sub: 'tm_1', role });
const call = (method: 'GET' | 'PUT' | 'POST', url: string, token: string) =>
  app.inject({ method, url, headers: { 'x-admin-key': token, ...CSRF } });

describe('H3-1: Super-Admin gate classifies the matched route, not the raw URL', () => {
  beforeEach(() => findUnique.mockResolvedValue({ role: 'MARKETING_MANAGER', is_active: true }));

  it('literal path is refused (control)', async () => {
    const res = await call('PUT', '/v1/admin/plan-pricing', await teamToken('MARKETING_MANAGER'));
    expect(res.statusCode).toBe(403);
  });

  it.each([
    ['PUT', '/v1/admin/%70lan-pricing'],
    ['POST', '/v1/admin/%71uery'],
    ['GET', '/v1/admin/%61udit-log'],
  ] as const)('percent-encoded %s %s is refused', async (method, url) => {
    const res = await call(method, url, await teamToken('MARKETING_MANAGER'));
    expect(res.statusCode).toBe(403);
  });

  it('a standard route still works for a manager', async () => {
    const res = await call('GET', '/v1/admin/retailers', await teamToken('MARKETING_MANAGER'));
    expect(res.statusCode).toBe(200);
  });

  it('SUPER_ADMIN still reaches an encoded super-admin path', async () => {
    findUnique.mockResolvedValue({ role: 'SUPER_ADMIN', is_active: true });
    const res = await call('PUT', '/v1/admin/%70lan-pricing', await teamToken('SUPER_ADMIN'));
    expect(res.statusCode).toBe(200);
  });
});

describe('H3-3: team token role is re-read from the DB', () => {
  it('a deactivated member is refused even with a valid token', async () => {
    findUnique.mockResolvedValue({ role: 'SUPER_ADMIN', is_active: false });
    const res = await call('GET', '/v1/admin/retailers', await teamToken('SUPER_ADMIN'));
    expect(res.statusCode).toBe(403);
  });

  it('a deleted member is refused', async () => {
    findUnique.mockResolvedValue(null);
    const res = await call('GET', '/v1/admin/retailers', await teamToken('SUPER_ADMIN'));
    expect(res.statusCode).toBe(403);
  });

  it('a demoted member gets the DB role, not the JWT snapshot', async () => {
    findUnique.mockResolvedValue({ role: 'SUPPORT_AGENT', is_active: true });
    const res = await call('GET', '/v1/admin/retailers', await teamToken('SUPER_ADMIN'));
    expect(res.statusCode).toBe(403);
  });

  it('a demoted super admin loses super-admin-only routes but keeps standard ones', async () => {
    findUnique.mockResolvedValue({ role: 'MARKETING_MANAGER', is_active: true });
    const token = await teamToken('SUPER_ADMIN');
    expect((await call('GET', '/v1/admin/audit-log', token)).statusCode).toBe(403);
    expect((await call('GET', '/v1/admin/retailers', token)).statusCode).toBe(200);
  });

  it('env admin key and admin-session JWT never touch the DB', async () => {
    const key = await call('GET', '/v1/admin/audit-log', 'test-admin-key');
    expect(key.statusCode).toBe(200);
    const session = await new SignJWT({ email: 'a@b.c', role: 'SUPER_ADMIN' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('admin')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('admin-session:test-admin-key'));
    expect((await call('GET', '/v1/admin/audit-log', session)).statusCode).toBe(200);
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe('H3-2: panel access is an allow-list of roles', () => {
  const as = (role: string) => {
    findUnique.mockResolvedValue({ role, is_active: true });
    return teamToken(role);
  };

  it.each(['MARKETING_AGENT', 'SUPPORT_AGENT', 'SOMETHING_NEW'])('%s is refused', async (role) => {
    expect((await call('GET', '/v1/admin/retailers', await as(role))).statusCode).toBe(403);
  });

  it('MARKETING_MANAGER keeps standard-admin reach', async () => {
    const token = await as('MARKETING_MANAGER');
    expect((await call('GET', '/v1/admin/festivals', token)).statusCode).toBe(200);
  });

  it('SUPPORT_MANAGER reaches support pages only', async () => {
    const token = await as('SUPPORT_MANAGER');
    expect((await call('GET', '/v1/admin/support-tickets', token)).statusCode).toBe(200);
    expect((await call('GET', '/v1/admin/retailers', token)).statusCode).toBe(200);
    expect((await call('GET', '/v1/admin/festivals', token)).statusCode).toBe(403);
    expect((await call('GET', '/v1/admin/audit-log', token)).statusCode).toBe(403);
  });

  it('a token with a non-team role claim (e.g. Supabase "authenticated") is refused', async () => {
    findUnique.mockResolvedValue({ role: 'authenticated', is_active: true });
    expect(
      (await call('GET', '/v1/admin/retailers', await teamToken('authenticated'))).statusCode,
    ).toBe(403);
  });
});
