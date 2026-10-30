/**
 * H4-5 / RC-095: wishlist and recently-viewed must take retailer_id from the
 * product row, never from the request body.
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';
import { passportRoutes } from '../passport.js';

const mockSessionFindUnique = vi.hoisted(() => vi.fn());
const mockSessionUpdate = vi.hoisted(() => vi.fn());
const mockProductFindMany = vi.hoisted(() => vi.fn());
const mockWishlistUpsert = vi.hoisted(() => vi.fn());
const mockRecentUpsert = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    passportSession: { findUnique: mockSessionFindUnique, update: mockSessionUpdate },
    product: { findMany: mockProductFindMany },
    customerWishlistItem: { upsert: mockWishlistUpsert },
    customerRecentlyViewed: { upsert: mockRecentUpsert },
  },
  Prisma: {},
}));

const session = {
  id: 'session_abc123',
  customer_account_id: 'ca_123',
  expires_at: new Date(Date.now() + 86400000),
  revoked_at: null,
  customer_account: { id: 'ca_123', profiling_enabled: true },
};

async function post(url: string, payload: Record<string, string>) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.register(passportRoutes, { prefix: '/v1/public/passport' });
  await app.ready();
  return app.inject({
    method: 'POST',
    url: `/v1/public/passport${url}`,
    headers: { cookie: 'kanchuki_passport=session_abc123', 'content-type': 'application/json' },
    payload,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSessionFindUnique.mockResolvedValue(session);
  mockSessionUpdate.mockResolvedValue({});
  mockProductFindMany.mockResolvedValue([{ id: 'p_1', retailer_id: 'r_1' }]);
  mockWishlistUpsert.mockResolvedValue({});
  mockRecentUpsert.mockResolvedValue({});
});

describe('wishlist retailer ownership', () => {
  it('stores the product owner, ignoring a foreign body retailer_id', async () => {
    const res = await post('/wishlist', { product_id: 'p_1', retailer_id: 'r_victim' });

    expect(res.statusCode).toBe(200);
    expect(mockWishlistUpsert.mock.calls[0]?.[0].create.retailer_id).toBe('r_1');
  });

  it('404s an unknown product and writes nothing', async () => {
    const res = await post('/wishlist', { product_id: 'p_nope', retailer_id: 'r_1' });

    expect(res.statusCode).toBe(404);
    expect(mockWishlistUpsert).not.toHaveBeenCalled();
  });
});

describe('recently-viewed retailer ownership', () => {
  it('stores the product owner, ignoring a foreign body retailer_id', async () => {
    const res = await post('/recently-viewed', { product_id: 'p_1', retailer_id: 'r_victim' });

    expect(res.statusCode).toBe(204);
    expect(mockRecentUpsert.mock.calls[0]?.[0].create.retailer_id).toBe('r_1');
  });

  it('drops an unknown product silently', async () => {
    const res = await post('/recently-viewed', { product_id: 'p_nope', retailer_id: 'r_1' });

    expect(res.statusCode).toBe(204);
    expect(mockRecentUpsert).not.toHaveBeenCalled();
  });
});
