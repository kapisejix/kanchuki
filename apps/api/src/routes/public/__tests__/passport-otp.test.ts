/**
 * Passport OTP endpoints (Task 2) + session (Task 3).
 *
 * POST /v1/public/passport/otp/send — SMS fallback (widget sends client-side)
 * POST /v1/public/passport/otp/verify — widget JWT or SMS code → session cookie
 * GET  /v1/public/passport/me — returns masked account info from session
 * POST /v1/public/passport/logout — revokes session + clears cookie
 */
import { randomBytes, createHash } from 'node:crypto';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';
import { passportRoutes } from '../passport.js';

// ─── Mocks ────────────────────────────────────────────────────────

const mockSendOtpViaMsg91 = vi.hoisted(() => vi.fn());
const mockVerifyStoredOtp = vi.hoisted(() => vi.fn());
const mockVerifyMsg91WidgetToken = vi.hoisted(() => vi.fn());
const mockIsMsg91OtpConfigured = vi.hoisted(() => vi.fn().mockReturnValue(true));

const mockCustomerAccountFindUnique = vi.hoisted(() => vi.fn());
const mockCustomerAccountCreate = vi.hoisted(() => vi.fn());
const mockCustomerAccountUpdate = vi.hoisted(() => vi.fn());
const mockConsentEventCreate = vi.hoisted(() => vi.fn());
const mockPassportSessionCreate = vi.hoisted(() => vi.fn());
const mockPassportSessionFindUnique = vi.hoisted(() => vi.fn());
const mockPassportSessionUpdate = vi.hoisted(() => vi.fn());
const mockPassportSessionUpdateMany = vi.hoisted(() => vi.fn());
const mockPassportSessionDelete = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/msg91-otp.js', () => ({
  sendOtpViaMsg91: mockSendOtpViaMsg91,
  verifyStoredOtp: mockVerifyStoredOtp,
  verifyMsg91WidgetToken: mockVerifyMsg91WidgetToken,
  isMsg91OtpConfigured: mockIsMsg91OtpConfigured,
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    customerAccount: {
      findUnique: mockCustomerAccountFindUnique,
      create: mockCustomerAccountCreate,
      update: mockCustomerAccountUpdate,
    },
    consentEvent: {
      create: mockConsentEventCreate,
    },
    passportSession: {
      create: mockPassportSessionCreate,
      findUnique: mockPassportSessionFindUnique,
      update: mockPassportSessionUpdate,
      updateMany: mockPassportSessionUpdateMany,
      delete: mockPassportSessionDelete,
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

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VITEST = 'true';
});

// ─── Tests ────────────────────────────────────────────────────────

describe('POST /v1/public/passport/otp/send', () => {
  it('sends OTP via MSG91 and returns masked phone', async () => {
    mockSendOtpViaMsg91.mockResolvedValue('XXXXX43210');
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/otp/send',
      payload: { phone: '9876543210' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.masked_phone).toBe('XXXXX43210');
    expect(mockSendOtpViaMsg91).toHaveBeenCalledWith('9876543210', 'login');
  });

  it('rejects invalid phone number', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/otp/send',
      payload: { phone: '123' },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('returns 503 when MSG91 is not configured', async () => {
    mockIsMsg91OtpConfigured.mockReturnValueOnce(false);
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/otp/send',
      payload: { phone: '9876543210' },
    });

    expect(res.statusCode).toBe(503);
  });
});

describe('POST /v1/public/passport/otp/verify', () => {
  const mockAccount = {
    id: 'acct_123',
    phone: '9876543210',
    phone_hash: createHash('sha256').update('9876543210').digest('hex'),
    name: null,
    is_verified: true,
  };

  it('verifies widget token and creates new account + session', async () => {
    mockVerifyMsg91WidgetToken.mockResolvedValue(undefined);
    mockCustomerAccountFindUnique.mockResolvedValue(null);
    mockCustomerAccountCreate.mockResolvedValue(mockAccount);

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/otp/verify',
      payload: { phone: '9876543210', widget_token: 'jwt.header.signature' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.is_new).toBe(true);
    expect(body.account_id).toBe('acct_123');
    expect(body.phone_masked).toMatch(/XXXXX\d{4}/);

    // Session created
    expect(mockPassportSessionCreate).toHaveBeenCalledOnce();
    // ConsentEvent written — Prisma create receives { data: { ... } }
    expect(mockConsentEventCreate).toHaveBeenCalled();
    const consentArg = mockConsentEventCreate.mock.calls[0]?.[0] as
      { data?: { kind?: string; notice_version?: string } } | undefined;
    expect(consentArg?.data?.kind).toBe('PASSPORT_CREATED');
    expect(consentArg?.data?.notice_version).toBe('1.0');
    // Set-Cookie header present
    const setCookie = res.headers['set-cookie'] as string;
    expect(setCookie).toContain('kanchuki_passport=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
  });

  it('returns is_new=false for existing account', async () => {
    mockVerifyMsg91WidgetToken.mockResolvedValue(undefined);
    mockCustomerAccountFindUnique.mockResolvedValue(mockAccount);
    mockCustomerAccountUpdate.mockResolvedValue(mockAccount);

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/otp/verify',
      payload: { phone: '9876543210', widget_token: 'jwt.header.signature' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().is_new).toBe(false);
    // No ConsentEvent for returning user
    expect(mockConsentEventCreate).not.toHaveBeenCalled();
  });

  it('verifies SMS OTP code', async () => {
    mockVerifyStoredOtp.mockResolvedValue('verified');
    mockCustomerAccountFindUnique.mockResolvedValue(null);
    mockCustomerAccountCreate.mockResolvedValue(mockAccount);

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/otp/verify',
      payload: { phone: '9876543210', otp: '123456' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('rejects wrong OTP', async () => {
    mockVerifyStoredOtp.mockResolvedValue('invalid');

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/otp/verify',
      payload: { phone: '9876543210', otp: '123456' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejects expired OTP (absent)', async () => {
    mockVerifyStoredOtp.mockResolvedValue('absent');

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/otp/verify',
      payload: { phone: '9876543210', otp: '123456' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 429 for locked OTP', async () => {
    mockVerifyStoredOtp.mockResolvedValue('locked');

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/otp/verify',
      payload: { phone: '9876543210', otp: '123456' },
    });

    expect(res.statusCode).toBe(429);
  });

  it('rejects when both widget_token and otp provided', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/otp/verify',
      payload: { phone: '9876543210', widget_token: 'token', otp: '123456' },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('rejects when neither widget_token nor otp provided', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/otp/verify',
      payload: { phone: '9876543210' },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('rejects widget token for wrong phone', async () => {
    mockVerifyMsg91WidgetToken.mockRejectedValue(
      new Error('Phone number does not match the verified number.'),
    );

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/otp/verify',
      payload: { phone: '9876543210', widget_token: 'jwt.header.signature' },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe('GET /v1/public/passport/me', () => {
  it('returns 401 when no cookie', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/v1/public/passport/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns account info for valid session', async () => {
    const sessionId = randomBytes(32).toString('hex');
    const futureDate = new Date(Date.now() + 86400 * 1000);

    mockPassportSessionFindUnique.mockResolvedValue({
      id: sessionId,
      expires_at: futureDate,
      revoked_at: null,
      customer_account: {
        id: 'acct_123',
        name: 'Ananya',
        phone: '9876543210',
        usual_size: 'M',
        city: 'Delhi',
      },
    });
    mockPassportSessionUpdate.mockResolvedValue({});

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/passport/me',
      headers: { cookie: `kanchuki_passport=${sessionId}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.account.id).toBe('acct_123');
    expect(body.account.name).toBe('Ananya');
    expect(body.account.phone_masked).toMatch(/XXXXX\d{4}/);
    expect(body.account.usual_size).toBe('M');
  });

  it('returns 401 for expired session', async () => {
    const sessionId = randomBytes(32).toString('hex');
    const pastDate = new Date(Date.now() - 1000);

    mockPassportSessionFindUnique.mockResolvedValue({
      id: sessionId,
      expires_at: pastDate,
      revoked_at: null,
      customer_account: { id: 'acct_123', name: null, phone: '9876543210', usual_size: null, city: null },
    });
    mockPassportSessionDelete.mockResolvedValue({});

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/passport/me',
      headers: { cookie: `kanchuki_passport=${sessionId}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for revoked session', async () => {
    const sessionId = randomBytes(32).toString('hex');
    mockPassportSessionFindUnique.mockResolvedValue({
      id: sessionId,
      expires_at: new Date(Date.now() + 86400 * 1000),
      revoked_at: new Date(),
      customer_account: { id: 'acct_123', name: null, phone: '9876543210', usual_size: null, city: null },
    });

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/passport/me',
      headers: { cookie: `kanchuki_passport=${sessionId}` },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('POST /v1/public/passport/logout', () => {
  it('revokes session and clears cookie', async () => {
    const sessionId = randomBytes(32).toString('hex');
    mockPassportSessionUpdateMany.mockResolvedValue({ count: 1 });

    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/logout',
      headers: { cookie: `kanchuki_passport=${sessionId}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(mockPassportSessionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: sessionId, revoked_at: null },
        data: { revoked_at: expect.any(Date) },
      }),
    );
    const setCookie = res.headers['set-cookie'] as string;
    expect(setCookie).toContain('Max-Age=0');
  });

  it('succeeds even without a session cookie', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/passport/logout',
    });

    expect(res.statusCode).toBe(200);
    expect(mockPassportSessionUpdateMany).not.toHaveBeenCalled();
  });
});
