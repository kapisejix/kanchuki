import { prisma } from '@kanchuki/db';
/**
 * Task 25: Personalization toggle endpoints.
 *
 * GET /v1/public/passport/preferences — returns current preferences
 * PUT /v1/public/passport/preferences — updates preferences + profiling toggle
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';
import { passportRoutes } from '../passport.js';

// ─── Mocks ────────────────────────────────────────────────────────

const mockPassportSessionFindUnique = vi.hoisted(() => vi.fn());
const mockPassportSessionUpdate = vi.hoisted(() => vi.fn());
const mockCustomerAccountUpdate = vi.hoisted(() => vi.fn());
const mockConsentEventCreate = vi.hoisted(() => vi.fn());
const mockFashionDNAUpdateMany = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    passportSession: {
      findUnique: mockPassportSessionFindUnique,
      update: mockPassportSessionUpdate,
    },
    customerAccount: {
      update: mockCustomerAccountUpdate,
    },
    consentEvent: {
      create: mockConsentEventCreate,
    },
    customerFashionDNA: {
      updateMany: mockFashionDNAUpdateMany,
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
  customer_account: {
    id: 'ca_123',
    phone: '9876543210',
    profiling_enabled: true,
    pref_colors: ['pink', 'blue'],
    pref_styles: ['casual'],
    pref_fabrics: ['cotton'],
    budget_min: 50000,
    budget_max: 200000,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPassportSessionFindUnique.mockResolvedValue(mockSession);
  mockPassportSessionUpdate.mockResolvedValue({});
  mockCustomerAccountUpdate.mockResolvedValue({});
  mockConsentEventCreate.mockResolvedValue({});
  mockFashionDNAUpdateMany.mockResolvedValue({ count: 1 });
});

// ─── GET /passport/preferences ────────────────────────────────────

describe('GET /v1/public/passport/preferences', () => {
  it('returns current preferences when authenticated', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/passport/preferences',
      headers: {
        cookie: 'kanchuki_passport=session_abc123',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.profiling_enabled).toBe(true);
    expect(body.pref_colors).toEqual(['pink', 'blue']);
    expect(body.pref_styles).toEqual(['casual']);
    expect(body.pref_fabrics).toEqual(['cotton']);
    expect(body.budget_min).toBe(50000);
    expect(body.budget_max).toBe(200000);
  });

  it('returns 401 when not authenticated', async () => {
    mockPassportSessionFindUnique.mockResolvedValue(null);

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/passport/preferences',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ─── PUT /passport/preferences ────────────────────────────────────

describe('PUT /v1/public/passport/preferences', () => {
  it('updates preferences successfully', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/public/passport/preferences',
      headers: {
        cookie: 'kanchuki_passport=session_abc123',
        'content-type': 'application/json',
      },
      payload: {
        pref_colors: ['red', 'green'],
        budget_max: 300000,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(mockCustomerAccountUpdate).toHaveBeenCalledWith({
      where: { id: 'ca_123' },
      data: {
        pref_colors: ['red', 'green'],
        budget_max: 300000,
      },
    });
  });

  it('records PROFILING_DISABLED event when turning off profiling', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/public/passport/preferences',
      headers: {
        cookie: 'kanchuki_passport=session_abc123',
        'content-type': 'application/json',
      },
      payload: {
        profiling_enabled: false,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(mockConsentEventCreate).toHaveBeenCalledWith({
      data: {
        customer_account_id: 'ca_123',
        kind: 'PROFILING_DISABLED',
        notice_version: '1.0',
      },
    });
  });

  it('records PROFILING_ENABLED event when re-enabling profiling', async () => {
    // Start with profiling disabled
    mockPassportSessionFindUnique.mockResolvedValue({
      ...mockSession,
      customer_account: {
        ...mockSession.customer_account,
        profiling_enabled: false,
      },
    });

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/public/passport/preferences',
      headers: {
        cookie: 'kanchuki_passport=session_abc123',
        'content-type': 'application/json',
      },
      payload: {
        profiling_enabled: true,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(mockConsentEventCreate).toHaveBeenCalledWith({
      data: {
        customer_account_id: 'ca_123',
        kind: 'PROFILING_ENABLED',
        notice_version: '1.0',
      },
    });
  });

  it('does not record event when profiling state unchanged', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/public/passport/preferences',
      headers: {
        cookie: 'kanchuki_passport=session_abc123',
        'content-type': 'application/json',
      },
      payload: {
        profiling_enabled: true, // same as current
      },
    });

    expect(res.statusCode).toBe(200);
    expect(mockConsentEventCreate).not.toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    mockPassportSessionFindUnique.mockResolvedValue(null);

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/public/passport/preferences',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        profiling_enabled: false,
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejects invalid body', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/public/passport/preferences',
      headers: {
        cookie: 'kanchuki_passport=session_abc123',
        'content-type': 'application/json',
      },
      payload: {
        profiling_enabled: 'not-a-boolean',
      },
    });

    expect(res.statusCode).toBe(400);
  });
});
