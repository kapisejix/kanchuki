// F-036 Phase B: /v1/public/passport/push/* — verified-session only, SSRF-safe
// endpoint, unsubscribe scoped to the signed-in account, consent audit written.
import { createHash } from 'node:crypto';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../../plugins/error-handler.js';
import { passportPushRoutes } from '../passport-push.js';

const m = vi.hoisted(() => ({
  sessionFind: vi.fn(),
  sessionUpdate: vi.fn(),
  upsert: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  consentCreate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    passportSession: { findUnique: m.sessionFind, update: m.sessionUpdate },
    customerPushSubscription: {
      upsert: m.upsert,
      findUnique: m.findUnique,
      updateMany: m.updateMany,
    },
    consentEvent: { create: m.consentCreate },
  },
  Prisma: {},
}));

const COOKIE = 'kanchuki_passport=sess_a';
const SUB = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'BPk', auth: 'au' },
};

function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.register(passportPushRoutes, { prefix: '/v1/public/passport' });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VAPID_PUBLIC_KEY = 'pub-key';
  process.env.VAPID_PRIVATE_KEY = 'priv-key';
  m.sessionFind.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === createHash('sha256').update('sess_a').digest('hex') // H4-7: DB holds the hash
      ? {
          id: 'sess_a',
          customer_account_id: 'acct_a',
          revoked_at: null,
          expires_at: new Date(Date.now() + 86_400_000),
          customer_account: { id: 'acct_a' },
        }
      : null,
  );
  m.sessionUpdate.mockResolvedValue({});
  m.upsert.mockResolvedValue({});
  m.findUnique.mockResolvedValue(null);
  m.updateMany.mockResolvedValue({ count: 1 });
  m.consentCreate.mockResolvedValue({});
});

const post = (url: string, payload: unknown, cookie?: string) =>
  buildApp().inject({
    method: 'POST',
    url: `/v1/public/passport/push/${url}`,
    payload: payload as object,
    headers: cookie ? { cookie } : {},
  });

describe('GET /push/key', () => {
  it('returns the public key, never the private one', async () => {
    const res = await buildApp().inject({ method: 'GET', url: '/v1/public/passport/push/key' });
    expect(res.json()).toEqual({ public_key: 'pub-key' });
  });

  it('returns a null key (200, not 404) when VAPID is not configured', async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    const res = await buildApp().inject({ method: 'GET', url: '/v1/public/passport/push/key' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ public_key: null });
  });
});

describe('POST /push/subscribe', () => {
  it('requires a passport session', async () => {
    const res = await post('subscribe', SUB);
    expect(res.statusCode).toBe(401);
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it('refuses an endpoint that is not a known push service (SSRF)', async () => {
    const res = await post('subscribe', { ...SUB, endpoint: 'https://169.254.169.254/x' }, COOKIE);
    expect(res.statusCode).toBe(400);
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it('upserts by endpoint onto the signed-in account and audits consent', async () => {
    const res = await post('subscribe', SUB, COOKIE);
    expect(res.statusCode).toBe(200);
    const arg = m.upsert.mock.calls[0]?.[0];
    expect(arg.where).toEqual({ endpoint: SUB.endpoint });
    expect(arg.create).toMatchObject({
      customer_account_id: 'acct_a',
      passport_session_id: 'sess_a',
    });
    expect(arg.update).toMatchObject({
      customer_account_id: 'acct_a',
      passport_session_id: 'sess_a',
      disabled_at: null,
    });
    expect(m.consentCreate.mock.calls[0]?.[0].data).toMatchObject({
      customer_account_id: 'acct_a',
      kind: 'PUSH_SUBSCRIBED',
    });
  });
});

describe('POST /push/subscribe — rebinding an endpoint', () => {
  it("refuses to take over another account's endpoint without that browser's keys", async () => {
    m.findUnique.mockResolvedValue({
      customer_account_id: 'acct_b',
      p256dh: 'other',
      auth: 'other',
    });
    const res = await post('subscribe', SUB, COOKIE);
    expect(res.statusCode).toBe(409);
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it('moves the endpoint when the same browser signs into another account (keys match)', async () => {
    m.findUnique.mockResolvedValue({ customer_account_id: 'acct_b', ...SUB.keys });
    const res = await post('subscribe', SUB, COOKIE);
    expect(res.statusCode).toBe(200);
    expect(m.upsert).toHaveBeenCalled();
  });
});

describe('POST /push/unsubscribe', () => {
  it('only disables the endpoint when it belongs to the signed-in account', async () => {
    const res = await post('unsubscribe', { endpoint: SUB.endpoint }, COOKIE);
    expect(res.statusCode).toBe(200);
    expect(m.updateMany.mock.calls[0]?.[0].where).toEqual({
      endpoint: SUB.endpoint,
      customer_account_id: 'acct_a',
      disabled_at: null,
    });
    expect(m.consentCreate.mock.calls[0]?.[0].data.kind).toBe('PUSH_UNSUBSCRIBED');
  });

  it('writes no consent event when nothing was disabled', async () => {
    m.updateMany.mockResolvedValue({ count: 0 });
    await post('unsubscribe', { endpoint: SUB.endpoint }, COOKIE);
    expect(m.consentCreate).not.toHaveBeenCalled();
  });
});
