import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@kanchuki/db', () => ({ prisma: {} }));

import { authPlugin } from './auth.js';

// RC-108: Razorpay redirects the buyer's browser to GET /v1/billing/addon-callback
// with no Bearer token. The route tests never mounted the auth plugin, so the
// global preHandler 401'd every real callback and a paid add-on was never credited.
async function build() {
  const app = Fastify();
  await app.register(authPlugin);
  app.get('/v1/billing/addon-callback', async () => ({ ok: true }));
  app.get('/v1/billing/addon-callback/extra', async () => ({ ok: true }));
  app.get('/v1/billing/plans', async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe('auth plugin: Razorpay add-on redirect (RC-108)', () => {
  it('lets a Bearer-less GET reach the add-on callback handler', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/v1/billing/addon-callback?x=1' });
    expect(res.statusCode).toBe(200);
  });

  it('still 401s every other billing route without a Bearer token', async () => {
    const app = await build();
    for (const url of ['/v1/billing/plans', '/v1/billing/addon-callback/extra']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(401);
    }
  });
});
