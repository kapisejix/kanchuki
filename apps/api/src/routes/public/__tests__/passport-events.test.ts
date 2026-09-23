import { prisma } from '@kanchuki/db';
/**
 * F-037 Phase 1: POST /v1/public/passport/events — behavioral event beacon.
 * customer_interactions is net-new (dropped by migration 082, rebuilt at
 * identity scope) — see docs/tasks/pending/customer-engagement-analytics.md §0.
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';
import { passportRoutes } from '../passport.js';

const mockPassportSessionFindUnique = vi.hoisted(() => vi.fn());
const mockPassportSessionUpdate = vi.hoisted(() => vi.fn());
const mockCustomerInteractionCreateMany = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    passportSession: {
      findUnique: mockPassportSessionFindUnique,
      update: mockPassportSessionUpdate,
    },
    customerInteraction: {
      createMany: mockCustomerInteractionCreateMany,
    },
  },
  Prisma: {},
}));

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
  customer_account: { id: 'ca_123', profiling_enabled: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPassportSessionFindUnique.mockResolvedValue(mockSession);
  mockPassportSessionUpdate.mockResolvedValue({});
  mockCustomerInteractionCreateMany.mockResolvedValue({ count: 1 });
});

describe('POST /v1/public/passport/events', () => {
  it('writes a mapped interaction row for a known event type', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/events',
      headers: { cookie: 'kanchuki_passport=session_abc123', 'content-type': 'application/json' },
      payload: {
        events: [
          { type: 'view', product_id: 'p_1', retailer_id: 'r_1', metadata: { dwell_ms: 4200 } },
        ],
      },
    });

    expect(res.statusCode).toBe(204);
    expect(mockCustomerInteractionCreateMany).toHaveBeenCalledWith({
      data: [
        {
          customer_account_id: 'ca_123',
          retailer_id: 'r_1',
          type: 'VIEW',
          product_id: 'p_1',
          metadata: { dwell_ms: 4200 },
        },
      ],
    });
  });

  it('drops unknown event types without writing', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/events',
      headers: { cookie: 'kanchuki_passport=session_abc123', 'content-type': 'application/json' },
      payload: { events: [{ type: 'not_interested', retailer_id: 'r_1' }] },
    });

    expect(res.statusCode).toBe(204);
    expect(mockCustomerInteractionCreateMany).not.toHaveBeenCalled();
  });

  it('suppresses the write when profiling_enabled is false', async () => {
    mockPassportSessionFindUnique.mockResolvedValue({
      ...mockSession,
      customer_account: { id: 'ca_123', profiling_enabled: false },
    });
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/events',
      headers: { cookie: 'kanchuki_passport=session_abc123', 'content-type': 'application/json' },
      payload: { events: [{ type: 'view', product_id: 'p_1', retailer_id: 'r_1' }] },
    });

    expect(res.statusCode).toBe(204);
    expect(mockCustomerInteractionCreateMany).not.toHaveBeenCalled();
  });

  it('returns 204 and writes nothing when unauthenticated', async () => {
    mockPassportSessionFindUnique.mockResolvedValue(null);
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/events',
      headers: { 'content-type': 'application/json' },
      payload: { events: [{ type: 'view', retailer_id: 'r_1' }] },
    });

    expect(res.statusCode).toBe(204);
    expect(mockCustomerInteractionCreateMany).not.toHaveBeenCalled();
  });
});
