/**
 * MSG91 OTP verify paths (2026-08-12) — real OTP configuration.
 *
 * POST /v1/auth/otp/verify now has three verification channels:
 *   1. msg91_token — the mobile widget verified the code client-side; the API
 *      re-confirms the access token with MSG91 server-side, then MINTS a
 *      Supabase session (admin find-or-create + rotated random password +
 *      phone/password sign-in), since Supabase never saw this OTP.
 *   2. otp + Redis entry — /otp/send issued the code via MSG91; verified
 *      against the stored entry.
 *   3. otp without an entry ('absent') — legacy Supabase-issued OTP (old
 *      installs, scripts) — unchanged behavior.
 *
 * Critical security assertions:
 *  - A widget token minted for a DIFFERENT phone must never authorize login.
 *  - The admin-issued random password is never returned to the client.
 *  - The retailer/staff/teamMember downstream routing is identical to the
 *    legacy path.
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, errorHandler } from '../plugins/error-handler.js';
import { authRoutes } from './auth.js';

// ─── Mocks (vi.hoisted required for vi.mock hoisting) ─────────────
const mockStaffFindFirst = vi.hoisted(() => vi.fn());
const mockStaffUpdate = vi.hoisted(() => vi.fn());
const mockTeamMemberFindFirst = vi.hoisted(() => vi.fn());
const mockRetailerFindUnique = vi.hoisted(() => vi.fn());
const mockRetailerUpsert = vi.hoisted(() =>
  vi.fn().mockRejectedValue(new Error('retailer.upsert must not be called')),
);
const mockRetailerUpdate = vi.hoisted(() => vi.fn());
const mockSignTeamToken = vi.hoisted(() => vi.fn());

// msg91-otp lib — fully mocked; its real behavior is covered by
// lib/msg91-otp.test.ts. verifyStoredOtp's 'absent' fallback is what drives
// the legacy Supabase path below.
const mockVerifyWidgetToken = vi.hoisted(() => vi.fn());
const mockVerifyStoredOtp = vi.hoisted(() => vi.fn());
const mockSendOtpViaMsg91 = vi.hoisted(() => vi.fn());
const mockIsMsg91Configured = vi.hoisted(() => vi.fn());

// Supabase session-issuance surface (admin + signInWithPassword).
const mockVerifyOtp = vi.hoisted(() => vi.fn());
const mockListUsers = vi.hoisted(() => vi.fn());
const mockUpdateUserById = vi.hoisted(() => vi.fn());
const mockCreateUser = vi.hoisted(() => vi.fn());
const mockSignInWithPassword = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    defaultProductCategory: { findMany: vi.fn().mockResolvedValue([]) },
    defaultProductAttribute: { findMany: vi.fn().mockResolvedValue([]) },
    staff: { findFirst: mockStaffFindFirst, update: mockStaffUpdate },
    teamMember: { findFirst: mockTeamMemberFindFirst },
    retailer: {
      findUnique: mockRetailerFindUnique,
      upsert: mockRetailerUpsert,
      update: mockRetailerUpdate,
    },
  },
  Prisma: {},
}));

vi.mock('../index.js', () => ({
  supabase: {
    auth: {
      verifyOtp: mockVerifyOtp,
      admin: {
        listUsers: mockListUsers,
        updateUserById: mockUpdateUserById,
        createUser: mockCreateUser,
      },
      signInWithPassword: mockSignInWithPassword,
    },
  },
}));

vi.mock('../lib/msg91-otp.js', () => ({
  isMsg91OtpConfigured: mockIsMsg91Configured,
  sendOtpViaMsg91: mockSendOtpViaMsg91,
  verifyMsg91WidgetToken: mockVerifyWidgetToken,
  verifyStoredOtp: mockVerifyStoredOtp,
}));

vi.mock('../plugins/team-auth.js', () => ({
  signTeamToken: mockSignTeamToken,
}));

// ─── Test Helpers ────────────────────────────────────────────────

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(authRoutes, { prefix: '/v1/auth' });
  await app.ready();
  return app;
}

const E164 = '+919876543210';

const validSession = {
  data: {
    user: { id: 'supabase-user-1' },
    session: {
      access_token: 'supabase-token',
      refresh_token: 'supabase-refresh',
      expires_in: 3600,
    },
  },
  error: null,
};

const newRetailer = {
  id: 'retailer_new',
  phone: '9876543210',
  shop_name: '',
  city: '',
  plan: 'STARTER',
  plan_status: 'TRIAL',
  onboarding_completed: false,
  onboarding_step: 0,
  is_suspended: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockIsMsg91Configured.mockReturnValue(true);
  mockVerifyWidgetToken.mockResolvedValue(undefined);
  mockVerifyStoredOtp.mockResolvedValue('absent'); // default: legacy fallback
  mockVerifyOtp.mockResolvedValue(validSession);
  mockListUsers.mockResolvedValue({ data: { users: [] }, error: null });
  mockCreateUser.mockResolvedValue({ data: { user: { id: 'supabase-user-1' } }, error: null });
  mockUpdateUserById.mockResolvedValue({ data: { user: { id: 'supabase-user-1' } }, error: null });
  mockSignInWithPassword.mockResolvedValue(validSession);
  mockStaffFindFirst.mockResolvedValue(null);
  mockTeamMemberFindFirst.mockResolvedValue(null);
  mockRetailerFindUnique.mockResolvedValue(null);
  mockRetailerUpsert.mockResolvedValue(newRetailer);
});

describe('POST /auth/otp/verify — MSG91 widget token path', () => {
  it('mints a session via admin createUser + signInWithPassword for a brand-new phone', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '9876543210', msg91_token: 'jwt.token.here' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.access_token).toBe('supabase-token');
    expect(body.data.is_staff).toBe(false);
    expect(body.data.is_new).toBe(true);
    expect(body.data.retailer).toMatchObject({ id: 'retailer_new' });

    // The widget token was confirmed server-side, and the session was minted
    // via the admin path — NOT via supabase.auth.verifyOtp (Supabase never
    // saw this OTP).
    expect(mockVerifyWidgetToken).toHaveBeenCalledWith('jwt.token.here', '9876543210');
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(mockCreateUser).toHaveBeenCalledWith({
      phone: E164,
      password: expect.any(String),
      phone_confirm: true,
    });
    const createArgs = mockCreateUser.mock.calls[0]?.[0] as { password: string };
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      phone: E164,
      password: createArgs.password,
    });
    // SECURITY: the random password never leaves the server.
    expect(JSON.stringify(body)).not.toContain(createArgs.password);
    await app.close();
  });

  it('rotates the password of an existing Supabase user instead of creating a duplicate', async () => {
    mockListUsers.mockResolvedValue({
      data: { users: [{ id: 'existing-user', phone: E164 }] },
      error: null,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '9876543210', msg91_token: 'jwt.token.here' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockUpdateUserById).toHaveBeenCalledWith('existing-user', {
      password: expect.any(String),
    });
    const updateArgs = mockUpdateUserById.mock.calls[0]?.[1] as { password: string };
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      phone: E164,
      password: updateArgs.password,
    });
    await app.close();
  });

  it('routes a staff phone through the existing staff login (no retailer upsert)', async () => {
    mockStaffFindFirst.mockResolvedValue({
      id: 'staff_1',
      name: 'Counter Staff',
      role: 'salesperson',
      retailer_id: 'retailer_a',
      auth_user_id: null,
      retailer: { id: 'retailer_a', shop_name: 'Sharma Sarees', city: 'Jaipur' },
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '9876543210', msg91_token: 'jwt.token.here' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.staff).toMatchObject({ id: 'staff_1', role: 'salesperson' });
    expect(mockRetailerUpsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects a widget token minted for a different phone BEFORE any DB lookup', async () => {
    mockVerifyWidgetToken.mockRejectedValue(
      new AppError('INVALID_OTP', 'Phone number does not match the verified number.', 401),
    );

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '9876543210', msg91_token: 'jwt.for.other.phone' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_OTP');
    expect(mockStaffFindFirst).not.toHaveBeenCalled();
    expect(mockTeamMemberFindFirst).not.toHaveBeenCalled();
    expect(mockRetailerFindUnique).not.toHaveBeenCalled();
    expect(mockCreateUser).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 500 (not a leaky error) when session issuance fails', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: new Error('bad credentials'),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '9876543210', msg91_token: 'jwt.token.here' },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().error.message).not.toContain('bad credentials');
    await app.close();
  });

  it('recovers from the concurrent first-login createUser race', async () => {
    // First loop: lookup misses, createUser collides (the other request won).
    mockCreateUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error('User already registered'),
    });
    // Retry loop: lookup now finds the winner's user → password rotation path.
    mockListUsers
      .mockResolvedValueOnce({ data: { users: [] }, error: null })
      .mockResolvedValueOnce({
        data: { users: [{ id: 'winner-user', phone: E164 }] },
        error: null,
      });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '9876543210', msg91_token: 'jwt.token.here' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockUpdateUserById).toHaveBeenCalledWith('winner-user', {
      password: expect.any(String),
    });
    await app.close();
  });
});

describe('POST /auth/otp/verify — server-issued MSG91 OTP (Redis) path', () => {
  it('issues a session when the stored OTP verifies', async () => {
    mockVerifyStoredOtp.mockResolvedValue('verified');

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '9876543210', otp: '123456' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockVerifyStoredOtp).toHaveBeenCalledWith('9876543210', '123456');
    // Supabase did not verify this code — the admin-minted session is used.
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(mockCreateUser).toHaveBeenCalled();
    await app.close();
  });

  it('rejects a wrong stored OTP', async () => {
    mockVerifyStoredOtp.mockResolvedValue('invalid');

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '9876543210', otp: '000000' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_OTP');
    expect(mockVerifyOtp).not.toHaveBeenCalled(); // no double-check against Supabase
    expect(mockStaffFindFirst).not.toHaveBeenCalled();
    await app.close();
  });

  it('falls back to the legacy Supabase path when MSG91 is unconfigured and no Redis entry exists (absent)', async () => {
    // Legacy fallback is gated on !isMsg91OtpConfigured() — production
    // (configured) treats 'absent' as a plain 401, never a second oracle.
    mockIsMsg91Configured.mockReturnValue(false);
    // verifyStoredOtp defaults to 'absent' in beforeEach.
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '9876543210', otp: '123456' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.access_token).toBe('supabase-token');
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      phone: E164,
      token: '123456',
      type: 'sms',
    });
    expect(mockCreateUser).not.toHaveBeenCalled(); // Supabase issued the session
    await app.close();
  });

  it('rejects with OTP_EXPIRED when MSG91 is configured but Redis entry is absent', async () => {
    // When MSG91 is configured, 'absent' means the Redis entry expired or was
    // never stored. Falling to Supabase verifyOtp would check against a
    // DIFFERENT random OTP and always fail. Throw a clear error instead.
    mockIsMsg91Configured.mockReturnValue(true);
    // verifyStoredOtp defaults to 'absent' in beforeEach.
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '9876543210', otp: '123456' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('OTP_EXPIRED');
    expect(mockVerifyOtp).not.toHaveBeenCalled(); // must NOT fall to Supabase
    expect(mockStaffFindFirst).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /auth/otp/verify — validation', () => {
  it('rejects a request with neither otp nor msg91_token', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '9876543210' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('rejects a malformed msg91_token', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '9876543210', msg91_token: 'short' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
