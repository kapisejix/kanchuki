// H3-2 follow-up: retailer money routes (free plan, unlimited quota, trial extension)
// are Super Admin only. They live in the standard `retailers` segment on purpose
// (suspend/feature stay standard), so the check is in the handler, like DELETE /retailers.
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@kanchuki/db', () => ({ prisma: {} }));

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
  ['POST', '/v1/admin/retailers/r1/extend-trial'],
  ['POST', '/v1/admin/retailers/r1/change-plan'],
  ['POST', '/v1/admin/retailers/r1/overrides'],
  ['DELETE', '/v1/admin/retailers/r1/overrides/o1'],
] as const;

describe.each(money)('%s %s', (method, url) => {
  it('plain ADMIN is refused', async () => {
    const token = await signAdminSession('a@b.c', 'ADMIN');
    const res = await app.inject({ method, url, headers: { 'x-admin-key': token, ...CSRF } });
    expect(res.statusCode).toBe(403);
    expect(res.body).toContain('Super Admin');
  });

  it('SUPER_ADMIN gets past the role check', async () => {
    const res = await app.inject({
      method,
      url,
      headers: { 'x-admin-key': 'test-admin-key', ...CSRF },
      payload: {},
    });
    expect(res.statusCode).not.toBe(403); // prisma is a stub, so 4xx/5xx from the handler is fine
  });
});
