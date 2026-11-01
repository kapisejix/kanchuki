// T2.5 F5: passport routes with no proxy path and no web/mobile caller were
// deleted. Pins that they stay gone: a route that exists but nothing calls is
// dead surface that looks like it grants something.
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { passportStoresRoutes } from '../passport-stores.js';
import { passportWishlistRoutes } from '../passport-wishlist.js';

vi.mock('@kanchuki/db', () => ({ prisma: {}, Prisma: {} }));

async function build() {
  const app = Fastify();
  await app.register(passportStoresRoutes, { prefix: '/v1/public/passport' });
  await app.register(passportWishlistRoutes, { prefix: '/v1/public/passport' });
  await app.ready();
  return app;
}

describe('dead passport routes stay deleted (T2.5 F5)', () => {
  it.each([
    ['DELETE', '/v1/public/passport/wishlist/prod-1'],
    ['POST', '/v1/public/passport/stores/ret-1/mute'],
    ['POST', '/v1/public/passport/stores/ret-1/remove'],
  ] as const)('%s %s answers 404', async (method, url) => {
    const app = await build();
    const res = await app.inject({ method, url });
    expect(res.statusCode).toBe(404);
  });

  it('the live routes next to them still exist', async () => {
    const app = await build();
    expect(app.hasRoute({ method: 'GET', url: '/v1/public/passport/stores' })).toBe(true);
    expect(app.hasRoute({ method: 'POST', url: '/v1/public/passport/wishlist' })).toBe(true);
  });
});
