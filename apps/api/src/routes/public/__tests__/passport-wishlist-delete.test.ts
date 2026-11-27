// Phase 3: DELETE /v1/public/passport/wishlist removes one saved product, only the signed-in
// shopper's own row, and is idempotent (the My Style shortlist uses it).
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';
import { passportRoutes } from '../passport.js';

const mockSessionFind = vi.hoisted(() => vi.fn());
const mockDeleteMany = vi.hoisted(() => vi.fn());
const mockFindMany = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    passportSession: { findUnique: mockSessionFind, update: vi.fn().mockResolvedValue({}) },
    customerWishlistItem: { deleteMany: mockDeleteMany, findMany: mockFindMany },
  },
  Prisma: {},
}));

const session = {
  id: 'session_abc123',
  customer_account_id: 'ca_123',
  expires_at: new Date(Date.now() + 86400000),
  revoked_at: null,
  customer_account: { id: 'ca_123', phone: '9876543210' },
};

async function del(payload?: object, cookie = true) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(passportRoutes, { prefix: '/v1/public/passport' });
  await app.ready();
  return app.inject({
    method: 'DELETE',
    url: '/v1/public/passport/wishlist',
    headers: {
      ...(cookie ? { cookie: 'kanchuki_passport=session_abc123' } : {}),
      'content-type': 'application/json',
    },
    ...(payload ? { payload } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSessionFind.mockResolvedValue(session);
  mockDeleteMany.mockResolvedValue({ count: 1 });
});

describe('DELETE /passport/wishlist', () => {
  it('deletes only the session account row for that product', async () => {
    const res = await del({ product_id: 'p1' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { customer_account_id: 'ca_123', product_id: 'p1' },
    });
  });
  it('is idempotent: 200 when nothing was saved', async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 });
    expect((await del({ product_id: 'p1' })).statusCode).toBe(200);
  });
  it('401 without a session, nothing deleted', async () => {
    mockSessionFind.mockResolvedValue(null);
    expect((await del({ product_id: 'p1' }, false)).statusCode).toBe(401);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });
  it('422 without a product_id (same as POST)', async () => {
    expect((await del({})).statusCode).toBe(422);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });
});

// Review fix: the shortlist is the wishlist now, and an enquiry 422s the whole store on a dead
// product, so GET only returns products that can still be enquired about.
describe('GET /passport/wishlist', () => {
  it('lists only live, available products of the session account', async () => {
    mockFindMany.mockResolvedValue([]);
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    await app.register(passportRoutes, { prefix: '/v1/public/passport' });
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/passport/wishlist',
      headers: { cookie: 'kanchuki_passport=session_abc123' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockFindMany.mock.calls[0]?.[0].where).toEqual({
      customer_account_id: 'ca_123',
      product: { deleted_at: null, status: 'AVAILABLE' },
    });
  });
});
