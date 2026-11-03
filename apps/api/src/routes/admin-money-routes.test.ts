// H3-2 follow-up: retailer money routes (free plan, unlimited quota, trial extension)
// are Super Admin only. They live in the standard `retailers` segment on purpose
// (suspend/feature stay standard), so the check is in the handler, like DELETE /retailers.
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@kanchuki/db', () => ({ prisma: {} }));

import { prisma } from '@kanchuki/db';
import { errorHandler } from '../plugins/error-handler.js';
import { signAdminSession } from './admin-auth.js';
import { adminRetailersDetailRoutes } from './admin/admin-retailers/admin-retailers-detail.js';
import { adminRetailersManagementRoutes } from './admin/admin-retailers/admin-retailers-management.js';

const CSRF = { cookie: 'csrf-token=abc', 'x-csrf-token': 'abc' };
let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  process.env.ADMIN_API_KEY = 'test-admin-key';
  app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(cookie, { secret: 'test-cookie-secret' });
  await app.register(adminRetailersDetailRoutes, { prefix: '/v1/admin' });
  await app.register(adminRetailersManagementRoutes, { prefix: '/v1/admin' });
  await app.ready();
});

afterAll(() => app.close());

const money = [
  ['POST', '/v1/admin/retailers/r1/overrides'],
  ['DELETE', '/v1/admin/retailers/r1/overrides/o1'],
] as const;

// Owner decision 2026-11-02: ADMIN and SUPER_ADMIN may both change any plan/status.
describe('change-plan role rules', () => {
  const retailer = {
    current: { plan: 'GROWTH', plan_status: 'ACTIVE' } as Record<string, unknown>,
  };
  const update = vi.fn();
  const adminPost = async (role: 'ADMIN' | 'SUPER_ADMIN', payload: Record<string, unknown>) => {
    const key = role === 'ADMIN' ? await signAdminSession('a@b.c', 'ADMIN') : 'test-admin-key';
    return app.inject({
      method: 'POST',
      url: '/v1/admin/retailers/r1/change-plan',
      headers: { 'x-admin-key': key, ...CSRF },
      payload,
    });
  };

  beforeAll(() => {
    Object.assign(prisma, {
      retailer: { findUnique: async () => retailer.current, update },
      auditLog: { create: vi.fn() },
    });
  });

  it('ADMIN: downgrade paid retailer ok', async () => {
    retailer.current = { plan: 'GROWTH', plan_status: 'ACTIVE' };
    expect((await adminPost('ADMIN', { plan: 'STARTER', status: 'ACTIVE' })).statusCode).toBe(200);
  });
  it('ADMIN: sideways on paid retailer ok', async () => {
    retailer.current = { plan: 'GROWTH', plan_status: 'ACTIVE' };
    expect((await adminPost('ADMIN', { plan: 'GROWTH', status: 'ACTIVE' })).statusCode).toBe(200);
  });
  it('ADMIN: any plan on TRIAL retailer ok', async () => {
    retailer.current = { plan: 'STARTER', plan_status: 'TRIAL' };
    expect((await adminPost('ADMIN', { plan: 'PRO', status: 'TRIAL' })).statusCode).toBe(200);
  });
  it('ADMIN: upgrade paid retailer ok (owner: both roles)', async () => {
    retailer.current = { plan: 'GROWTH', plan_status: 'ACTIVE' };
    expect((await adminPost('ADMIN', { plan: 'PRO', status: 'ACTIVE' })).statusCode).toBe(200);
  });
  it('ADMIN: forcing ACTIVE on a TRIAL retailer ok (owner: both roles)', async () => {
    retailer.current = { plan: 'STARTER', plan_status: 'TRIAL' };
    expect((await adminPost('ADMIN', { plan: 'STARTER', status: 'ACTIVE' })).statusCode).toBe(200);
  });
  it('ADMIN: extend_trial_days shortcut ok (owner: both roles)', async () => {
    retailer.current = { plan: 'STARTER', plan_status: 'TRIAL' };
    const res = await adminPost('ADMIN', {
      plan: 'STARTER',
      status: 'TRIAL',
      extend_trial_days: 7,
    });
    expect(res.statusCode).toBe(200);
  });
  it('ADMIN: extend-trial ok (owner: both roles)', async () => {
    retailer.current = { plan: 'STARTER', plan_status: 'TRIAL', id: 'r1', trial_ends_at: null };
    const key = await signAdminSession('a@b.c', 'ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/retailers/r1/extend-trial',
      headers: { 'x-admin-key': key, ...CSRF },
      payload: { days: 7 },
    });
    expect(res.statusCode).toBe(200);
  });
  it.each(['SUPPORT_MANAGER', 'MARKETING_MANAGER'])(
    '%s: change-plan and extend-trial refused',
    async (role) => {
      retailer.current = { plan: 'STARTER', plan_status: 'TRIAL', id: 'r1', trial_ends_at: null };
      const key = await signAdminSession('m@b.c', role);
      for (const [url, payload] of [
        ['/v1/admin/retailers/r1/change-plan', { plan: 'PRO', status: 'ACTIVE' }],
        ['/v1/admin/retailers/r1/extend-trial', { days: 7 }],
      ] as const) {
        const res = await app.inject({
          method: 'POST',
          url,
          headers: { 'x-admin-key': key, ...CSRF },
          payload,
        });
        expect(res.statusCode, `${role} ${url}`).toBe(403);
      }
    },
  );
  it('SUPER_ADMIN: upgrade + force ACTIVE ok', async () => {
    retailer.current = { plan: 'STARTER', plan_status: 'TRIAL' };
    expect((await adminPost('SUPER_ADMIN', { plan: 'PRO', status: 'ACTIVE' })).statusCode).toBe(
      200,
    );
  });
});

// Limit overrides: owner decision 2026-11-03 — ADMIN and SUPER_ADMIN may both manage them.
describe.each(money)('%s %s', (method, url) => {
  it.each(['ADMIN', 'SUPER_ADMIN'])('%s gets past the role check', async (role) => {
    const key = role === 'ADMIN' ? await signAdminSession('a@b.c', 'ADMIN') : 'test-admin-key';
    const res = await app.inject({
      method,
      url,
      headers: { 'x-admin-key': key, ...CSRF },
      payload: {},
    });
    expect(res.statusCode).not.toBe(403); // prisma is a stub, so 4xx/5xx from the handler is fine
  });

  it.each(['SUPPORT_MANAGER', 'MARKETING_MANAGER'])('%s is refused', async (role) => {
    const key = await signAdminSession('m@b.c', role);
    const res = await app.inject({
      method,
      url,
      headers: { 'x-admin-key': key, ...CSRF },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });
});
