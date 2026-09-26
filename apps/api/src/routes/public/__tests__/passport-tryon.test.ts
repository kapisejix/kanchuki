// F-040 T6 — passport try-on consent surface.
//
// The withdrawal route is the "withdrawal as easy as granting" half of the
// DPDP promise, so the tests care about three things beyond the happy path:
// it is session-scoped (you can only withdraw your own), it reports the
// deletion counts rather than swallowing a partial failure, and it works with
// no grant ever having been given (there may be nothing to withdraw, but the
// route must not 500 on that).
import { TRY_ON_CONSENT } from '@kanchuki/shared';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';
import { passportRoutes } from '../passport.js';

const {
  mockSessionFindUnique,
  mockSessionUpdate,
  mockSessionDelete,
  mockHasLiveTryOnConsent,
  mockWithdrawTryOnConsent,
} = vi.hoisted(() => ({
  mockSessionFindUnique: vi.fn(),
  mockSessionUpdate: vi.fn(),
  mockSessionDelete: vi.fn(),
  mockHasLiveTryOnConsent: vi.fn(),
  mockWithdrawTryOnConsent: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    passportSession: {
      findUnique: mockSessionFindUnique,
      update: mockSessionUpdate,
      delete: mockSessionDelete,
    },
  },
  Prisma: {},
}));

// Mocked at the lib boundary: the event-ordering and R2-deletion behaviour is
// covered in lib/tryon-consent.test.ts.
vi.mock('../../../lib/tryon-consent.js', () => ({
  hasLiveTryOnConsent: mockHasLiveTryOnConsent,
  withdrawTryOnConsent: mockWithdrawTryOnConsent,
}));

const ACCOUNT = 'ca_123';
const SESSION_COOKIE = 'kanchuki_passport=session_abc123';

const mockSession = {
  id: 'session_abc123',
  customer_account_id: ACCOUNT,
  expires_at: new Date(Date.now() + 86_400_000),
  revoked_at: null,
};

function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.register(passportRoutes, { prefix: '/v1/public/passport' });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSessionFindUnique.mockResolvedValue(mockSession);
  mockSessionUpdate.mockResolvedValue({});
  mockSessionDelete.mockResolvedValue({});
  mockHasLiveTryOnConsent.mockResolvedValue(false);
  mockWithdrawTryOnConsent.mockResolvedValue({ images_deleted: 0, images_failed: 0 });
});

describe('GET /v1/public/passport/try-on/consent', () => {
  it('reports a live grant with the notice version it is against', async () => {
    mockHasLiveTryOnConsent.mockResolvedValue(true);
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/passport/try-on/consent',
      headers: { cookie: SESSION_COOKIE },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      consented: true,
      notice_version: TRY_ON_CONSENT.version,
    });
    expect(mockHasLiveTryOnConsent).toHaveBeenCalledWith(ACCOUNT);
  });

  it('reports no grant for a shopper who never consented or has withdrawn', async () => {
    mockHasLiveTryOnConsent.mockResolvedValue(false);
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/passport/try-on/consent',
      headers: { cookie: SESSION_COOKIE },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().consented).toBe(false);
  });

  it('401 without a session', async () => {
    mockSessionFindUnique.mockResolvedValue(null);
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/passport/try-on/consent',
    });

    expect(res.statusCode).toBe(401);
    expect(mockHasLiveTryOnConsent).not.toHaveBeenCalled();
  });
});

describe('POST /v1/public/passport/try-on/withdraw', () => {
  it('withdraws for the session owner and reports the deletion counts', async () => {
    mockWithdrawTryOnConsent.mockResolvedValue({ images_deleted: 3, images_failed: 1 });
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/try-on/withdraw',
      headers: { cookie: SESSION_COOKIE },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    // images_failed is surfaced, not swallowed: a non-zero count is a promise
    // we did not fully keep, and the caller is entitled to the honest number.
    expect(res.json()).toEqual({ ok: true, images_deleted: 3, images_failed: 1 });
    expect(mockWithdrawTryOnConsent).toHaveBeenCalledWith(
      ACCOUNT,
      expect.objectContaining({ userAgent: expect.anything() }),
    );
  });

  it('succeeds when there was nothing stored to delete', async () => {
    // A shopper who consented but whose every job failed has nothing to delete.
    // Withdrawing must still be possible — otherwise consent would be
    // un-withdrawable in precisely the case where it was never exercised.
    mockWithdrawTryOnConsent.mockResolvedValue({ images_deleted: 0, images_failed: 0 });
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/try-on/withdraw',
      headers: { cookie: SESSION_COOKIE },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, images_deleted: 0, images_failed: 0 });
  });

  it('401 without a session, and no withdrawal is attempted', async () => {
    mockSessionFindUnique.mockResolvedValue(null);
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/try-on/withdraw',
      payload: {},
    });

    expect(res.statusCode).toBe(401);
    expect(mockWithdrawTryOnConsent).not.toHaveBeenCalled();
  });
});
