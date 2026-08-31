/**
 * Task 26: Download my data + passport delete.
 *
 * GET /v1/public/passport/export — returns all data as JSON (1/day rate limit)
 * POST /v1/public/passport/delete — soft-deletes account, revokes sessions
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';
import { prisma } from '@kanchuki/db';
import { passportRoutes } from '../passport.js';

// ─── Mocks ────────────────────────────────────────────────────────

const mockPassportSessionFindUnique = vi.hoisted(() => vi.fn());
const mockPassportSessionUpdate = vi.hoisted(() => vi.fn());
const mockPassportSessionUpdateMany = vi.hoisted(() => vi.fn());
const mockConsentEventFindFirst = vi.hoisted(() => vi.fn());
const mockConsentEventCreate = vi.hoisted(() => vi.fn());
const mockAccountFindUnique = vi.hoisted(() => vi.fn());
const mockAccountUpdate = vi.hoisted(() => vi.fn());
const mockStoreVisitFindMany = vi.hoisted(() => vi.fn());
const mockInteractionFindMany = vi.hoisted(() => vi.fn());
const mockWishlistFindMany = vi.hoisted(() => vi.fn());
const mockRecentlyViewedFindMany = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    passportSession: {
      findUnique: mockPassportSessionFindUnique,
      update: mockPassportSessionUpdate,
      updateMany: mockPassportSessionUpdateMany,
    },
    consentEvent: {
      findFirst: mockConsentEventFindFirst,
      create: mockConsentEventCreate,
    },
    customerAccount: {
      findUnique: mockAccountFindUnique,
      update: mockAccountUpdate,
    },
    customerStoreVisit: {
      findMany: mockStoreVisitFindMany,
    },
    customerInteraction: {
      findMany: mockInteractionFindMany,
    },
    customerWishlistItem: {
      findMany: mockWishlistFindMany,
    },
    customerRecentlyViewed: {
      findMany: mockRecentlyViewedFindMany,
    },
  },
  Prisma: {},
}));

// ─── Test app ─────────────────────────────────────────────────────

function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.register(passportRoutes, { prefix: '/v1/public/passport' });
  return app;
}

const mockSession = {
  id: 'session_abc123',
  customer_account_id: 'ca_123',
  expires_at: new Date(Date.now() + 86400000),
  revoked_at: null,
  customer_account: { id: 'ca_123' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPassportSessionFindUnique.mockResolvedValue(mockSession);
  mockPassportSessionUpdate.mockResolvedValue({});
  mockPassportSessionUpdateMany.mockResolvedValue({});
  mockConsentEventFindFirst.mockResolvedValue(null);
  mockConsentEventCreate.mockResolvedValue({});
  mockAccountFindUnique.mockResolvedValue({
    phone: '9876543210',
    name: 'Priya',
    gender: 'FEMALE',
    city: 'Mumbai',
    state: 'Maharashtra',
    usual_size: 'M',
    pref_colors: ['pink'],
    pref_styles: ['casual'],
    pref_fabrics: ['cotton'],
    budget_min: 50000,
    budget_max: 200000,
    profiling_enabled: true,
    created_at: new Date('2026-01-01'),
  });
  mockAccountUpdate.mockResolvedValue({});
  mockStoreVisitFindMany.mockResolvedValue([]);
  mockInteractionFindMany.mockResolvedValue([]);
  mockWishlistFindMany.mockResolvedValue([]);
  mockRecentlyViewedFindMany.mockResolvedValue([]);
});

// ─── GET /passport/export ─────────────────────────────────────────

describe('GET /v1/public/passport/export', () => {
  it('returns all data when authenticated', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/passport/export',
      headers: {
        cookie: 'kanchuki_passport=session_abc123',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.account).toBeDefined();
    expect(body.account.name).toBe('Priya');
    expect(body.store_visits).toBeDefined();
    expect(body.interactions).toBeDefined();
    expect(body.wishlist).toBeDefined();
    expect(body.recently_viewed).toBeDefined();
    expect(mockConsentEventCreate).toHaveBeenCalledWith({
      data: {
        customer_account_id: 'ca_123',
        kind: 'DATA_EXPORTED',
        notice_version: '1.0',
      },
    });
  });

  it('rate-limits to 1 export per day', async () => {
    mockConsentEventFindFirst.mockResolvedValue({ id: 'recent_export' });

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/passport/export',
      headers: {
        cookie: 'kanchuki_passport=session_abc123',
      },
    });

    expect(res.statusCode).toBe(429);
    const body = res.json();
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  it('returns 401 when not authenticated', async () => {
    mockPassportSessionFindUnique.mockResolvedValue(null);

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/passport/export',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ─── POST /passport/delete ────────────────────────────────────────

describe('POST /v1/public/passport/delete', () => {
  it('soft-deletes account and revokes sessions', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/delete',
      headers: {
        cookie: 'kanchuki_passport=session_abc123',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);

    // Should record PASSPORT_DELETED event
    expect(mockConsentEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customer_account_id: 'ca_123',
        kind: 'PASSPORT_DELETED',
      }),
    });

    // Should anonymize PII
    expect(mockAccountUpdate).toHaveBeenCalledWith({
      where: { id: 'ca_123' },
      data: expect.objectContaining({
        deleted_at: expect.any(Date),
        name: null,
        gender: null,
        city: null,
      }),
    });

    // Should revoke all sessions
    expect(mockPassportSessionUpdateMany).toHaveBeenCalledWith({
      where: { customer_account_id: 'ca_123', revoked_at: null },
      data: { revoked_at: expect.any(Date) },
    });
  });

  it('returns 401 when not authenticated', async () => {
    mockPassportSessionFindUnique.mockResolvedValue(null);

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/delete',
    });

    expect(res.statusCode).toBe(401);
  });
});
