/**
 * Task 23: StoreAffinity discovery endpoint.
 *
 * GET /v1/public/discover-stores?city=&limit=
 * - Authenticated (passport session): returns personalized store list ranked by affinity
 * - Unauthenticated (no session): returns featured + same-city stores
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';
import { prisma } from '@kanchuki/db';
import { discoverStoresRoutes } from '../discover-stores.js';

// ─── Mocks ────────────────────────────────────────────────────────

const mockPassportSessionFindUnique = vi.hoisted(() => vi.fn());
const mockStoreAffinityFindMany = vi.hoisted(() => vi.fn());
const mockRetailerFindMany = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    passportSession: {
      findUnique: mockPassportSessionFindUnique,
    },
    storeAffinity: {
      findMany: mockStoreAffinityFindMany,
    },
    retailer: {
      findMany: mockRetailerFindMany,
    },
  },
  Prisma: {},
}));

// ─── Test app ─────────────────────────────────────────────────────

function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.register(discoverStoresRoutes, { prefix: '/v1/public' });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────

describe('GET /v1/public/discover-stores', () => {
  const mockStores = [
    {
      id: 'ret_1',
      shop_name: 'Fashion Hub',
      city: 'Mumbai',
      logo_url: null,
      public_slug: 'fashion-hub',
      is_featured: false,
    },
    {
      id: 'ret_2',
      shop_name: 'Style Studio',
      city: 'Delhi',
      logo_url: 'https://r2.example.com/logo2.jpg',
      public_slug: 'style-studio',
      is_featured: true,
    },
  ];

  it('returns featured + directory stores when no session', async () => {
    mockPassportSessionFindUnique.mockResolvedValue(null);
    mockRetailerFindMany.mockResolvedValue(mockStores);

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/discover-stores',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.stores).toHaveLength(2);
    expect(body.stores[0].source).toBe('directory');
    expect(body.stores[1].source).toBe('featured');
    expect(mockRetailerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deleted_at: null }),
      }),
    );
  });

  it('filters by city when provided', async () => {
    mockPassportSessionFindUnique.mockResolvedValue(null);
    mockRetailerFindMany.mockResolvedValue([mockStores[0]]);

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/discover-stores?city=Mumbai',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.stores).toHaveLength(1);
    expect(mockRetailerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ city: 'Mumbai' }),
      }),
    );
  });

  it('respects limit parameter', async () => {
    mockPassportSessionFindUnique.mockResolvedValue(null);
    mockRetailerFindMany.mockResolvedValue([mockStores[0]]);

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/discover-stores?limit=5',
    });

    expect(res.statusCode).toBe(200);
    expect(mockRetailerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });

  it('rejects limit > 50', async () => {
    mockPassportSessionFindUnique.mockResolvedValue(null);

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/discover-stores?limit=100',
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns empty array when no stores match', async () => {
    mockPassportSessionFindUnique.mockResolvedValue(null);
    mockRetailerFindMany.mockResolvedValue([]);

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/discover-stores?city=NonExistent',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.stores).toHaveLength(0);
  });

  it('falls back to cold-start when session is expired', async () => {
    mockPassportSessionFindUnique.mockResolvedValue({
      customer_account_id: 'ca_123',
      expires_at: new Date(Date.now() - 1000), // expired
      revoked_at: null,
    });
    mockRetailerFindMany.mockResolvedValue(mockStores);

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/discover-stores',
      headers: {
        cookie: 'kanchuki_passport=session_expired',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.stores).toHaveLength(2);
    // Should use cold-start path (retailer.findMany, not storeAffinity.findMany)
    expect(mockRetailerFindMany).toHaveBeenCalled();
    expect(mockStoreAffinityFindMany).not.toHaveBeenCalled();
  });

  it('falls back to cold-start when session is revoked', async () => {
    mockPassportSessionFindUnique.mockResolvedValue({
      customer_account_id: 'ca_123',
      expires_at: new Date(Date.now() + 86400000),
      revoked_at: new Date(), // revoked
    });
    mockRetailerFindMany.mockResolvedValue(mockStores);

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/discover-stores',
      headers: {
        cookie: 'kanchuki_passport=session_revoked',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(mockRetailerFindMany).toHaveBeenCalled();
    expect(mockStoreAffinityFindMany).not.toHaveBeenCalled();
  });
});
