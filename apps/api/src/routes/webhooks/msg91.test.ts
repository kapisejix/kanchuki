/**
 * MSG91 Events & Actions webhook receiver (2026-08-12).
 *
 * POST /v1/public/webhooks/msg91/events — MSG91 posts OTP/SMS lifecycle
 * events here (delivered/failed/verified/expired) as JSON. The endpoint is
 * header-authenticated (x-msg91-webhook-secret vs MSG91_WEBHOOK_SECRET env,
 * timing-safe) and records events to AuditLog best-effort — a logging
 * failure must never make MSG91 retry a received event.
 */
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { msg91WebhookRoutes } from './msg91.js';

// ─── Mocks (vi.hoisted required for vi.mock hoisting) ─────────────
const mockAuditLogCreate = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    auditLog: { create: mockAuditLogCreate },
  },
  Prisma: {},
}));

// ─── Test Helpers ────────────────────────────────────────────────

async function buildApp() {
  const app = Fastify();
  await app.register(msg91WebhookRoutes, { prefix: '/v1' });
  await app.ready();
  return app;
}

const SECRET = 'webhook-secret-value';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MSG91_WEBHOOK_SECRET = SECRET;
  mockAuditLogCreate.mockResolvedValue({ id: 'log-1' });
});

afterEach(() => {
  delete process.env.MSG91_WEBHOOK_SECRET;
});

describe('POST /public/webhooks/msg91/events — auth', () => {
  it('rejects when the secret header is missing', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/webhooks/msg91/events',
      payload: { eventName: 'delivered', requestId: 'req-1' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects a wrong secret', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/webhooks/msg91/events',
      headers: { 'x-msg91-webhook-secret': 'wrong-secret' },
      payload: { eventName: 'delivered' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('fails closed (503) when the env secret is not configured', async () => {
    delete process.env.MSG91_WEBHOOK_SECRET;
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/webhooks/msg91/events',
      headers: { 'x-msg91-webhook-secret': SECRET },
      payload: { eventName: 'delivered' },
    });
    expect(res.statusCode).toBe(503);
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /public/webhooks/msg91/events — handling', () => {
  it('accepts a delivered event and records it with a masked phone', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/webhooks/msg91/events',
      headers: { 'x-msg91-webhook-secret': SECRET },
      payload: {
        requestId: '69REQ',
        eventName: 'delivered',
        status: '1',
        telNum: '919876543210',
        deliveryTime: '2026-03-19T16:58:07+05:30',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor_type: 'msg91',
        action: 'delivered',
        resource_type: 'sms_event',
        resource_id: '69REQ',
        metadata: {
          phone: '****3210',
          status: '1',
          failure_reason: undefined,
          delivered_at: '2026-03-19T16:58:07+05:30',
        },
      }),
    });
    await app.close();
  });

  it('extracts an OTP failure event with its failure reason', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/webhooks/msg91/events',
      headers: { 'x-msg91-webhook-secret': SECRET },
      payload: {
        requestId: 'OTP-REQ-9',
        event: 'OTP_FAILED',
        failureReason: 'NDNC blocked',
        mobile: '919876543210',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'OTP_FAILED',
        resource_id: 'OTP-REQ-9',
        metadata: {
          phone: '****3210',
          status: undefined,
          failure_reason: 'NDNC blocked',
          delivered_at: undefined,
        },
      }),
    });
    await app.close();
  });

  it('answers 200 even when the audit write fails (best-effort, no MSG91 retry)', async () => {
    mockAuditLogCreate.mockRejectedValue(new Error('db down'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/webhooks/msg91/events',
      headers: { 'x-msg91-webhook-secret': SECRET },
      payload: { requestId: 'req-1', eventName: 'delivered' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('answers 200 for an unknown event shape (never 5xx on telemetry)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/webhooks/msg91/events',
      headers: { 'x-msg91-webhook-secret': SECRET },
      payload: { someFutureField: 'x' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });
    await app.close();
  });

  it('rejects a non-object payload', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/webhooks/msg91/events',
      headers: { 'x-msg91-webhook-secret': SECRET, 'content-type': 'application/json' },
      payload: '"just a string"',
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('INVALID_PAYLOAD');
    await app.close();
  });
});

describe('GET /public/msg91/user-exists — permissive existence check', () => {
  it('returns user_found: true and echoes the phone identifier', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/msg91/user-exists?identifier=917586531210',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user_found: true, identifier: '917586531210' });
    await app.close();
  });

  it('echoes email identifiers too', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/msg91/user-exists?identifier=shop%40kanchuki.app',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user_found: true, identifier: 'shop@kanchuki.app' });
    await app.close();
  });

  it('responds 400 when the identifier is missing', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/msg91/user-exists',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARAM');
    await app.close();
  });

  it('never leaks existence — unknown numbers also get user_found: true', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/msg91/user-exists?identifier=919999999999',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user_found: true, identifier: '919999999999' });
    await app.close();
  });
});
