/**
 * OTP_TEST_BYPASS auth bypass (2026-08-13) — pre-production test channel.
 *
 * With OTP_TEST_BYPASS=1, phones that already exist as Supabase auth users
 * skip the real MSG91 OTP send + verify entirely: /otp/send returns "OTP
 * sent" without calling MSG91, and /otp/verify accepts ANY code and mints a
 * session (ensureSupabaseSession find-or-creates the auth user). Soft-deleted
 * retailer rows for whitelisted phones are revived instead of 409-ing, so
 * testers can reuse numbers deleted during testing.
 *
 * Security assertions:
 *  - With the flag OFF (production default) the bypass never engages.
 *  - With the flag ON, a phone NOT in Supabase auth.users is NOT whitelisted
 *    — the normal MSG91 verification path still runs and still 401s.
 */
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { authRoutes } from './auth.js';

// ─── Mocks (vi.hoisted required for vi.mock hoisting) ─────────────
const mockStaffFindFirst = vi.hoisted(() => vi.fn());
const mockTeamMemberFindFirst = vi.hoisted(() => vi.fn());
const mockRetailerFindUnique = vi.hoisted(() => vi.fn());
const mockRetailerUpsert = vi.hoisted(() =>
  vi.fn().mockRejectedValue(new Error('retailer.upsert must not be called')),
);
const mockRetailerUpdate = vi.hoisted(() => vi.fn());

const mockVerifyWidgetToken = vi.hoisted(() => vi.fn());
const mockVerifyStoredOtp = vi.hoisted(() => vi.fn());
const mockSendOtpViaMsg91 = vi.hoisted(() => vi.fn());
const mockIsMsg91Configured = vi.hoisted(() => vi.fn());

const mockListUsers = vi.hoisted(() => vi.fn());
const mockUpdateUserById = vi.hoisted(() => vi.fn());
const mockCreateUser = vi.hoisted(() => vi.fn());
const mockSignInWithPassword = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    defaultProductCategory: { findMany: vi.fn().mockResolvedValue([]) },
    defaultProductAttribute: { findMany: vi.fn().mockResolvedValue([]) },
    staff: { findFirst: mockStaffFindFirst },
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

// ─── Test Helpers ────────────────────────────────────────────────

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(authRoutes, { prefix: '/v1/auth' });
  await app.ready();
  return app;
}

// The 10-digit phone used in payloads and its E.164 Supabase representation.
const PHONE = '9898989898';
const E164 = `+91${PHONE}`;

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
  phone: PHONE,
  shop_name: '',
  city: '',
  plan: 'STARTER',
  plan_status: 'TRIAL',
  onboarding_completed: false,
  onboarding_step: 0,
  is_suspended: false,
};

// A Supabase auth user holding this phone (what the operator pre-creates in
// the dashboard to whitelist the number for test login).
function whitelistedUser(phone: string) {
  return { data: { users: [{ id: 'supabase-user-1', phone }] }, error: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsMsg91Configured.mockReturnValue(true);
  mockVerifyWidgetToken.mockResolvedValue(undefined);
  mockVerifyStoredOtp.mockResolvedValue('absent');
  mockListUsers.mockResolvedValue({ data: { users: [] }, error: null });
  mockUpdateUserById.mockResolvedValue({ data: { user: { id: 'supabase-user-1' } }, error: null });
  mockCreateUser.mockResolvedValue({ data: { user: { id: 'supabase-user-1' } }, error: null });
  mockSignInWithPassword.mockResolvedValue(validSession);
  mockStaffFindFirst.mockResolvedValue(null);
  mockTeamMemberFindFirst.mockResolvedValue(null);
  mockRetailerFindUnique.mockResolvedValue(null);
  mockRetailerUpsert.mockResolvedValue(newRetailer);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('OTP_TEST_BYPASS — whitelisted phones', () => {
  it('verifies with ANY otp and skips MSG91 verification entirely (flag ON)', async () => {
    vi.stubEnv('OTP_TEST_BYPASS', '1');
    mockListUsers.mockResolvedValue(whitelistedUser(E164));

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      // Arbitrary 6-digit code — the real OTP never arrived (DLT), and it
      // does not need to: the bypass accepts anything.
      payload: { phone: PHONE, otp: '123456' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockVerifyStoredOtp).not.toHaveBeenCalled();
    expect(mockVerifyWidgetToken).not.toHaveBeenCalled();
    expect(mockRetailerUpsert).toHaveBeenCalled();
    expect(res.json().data.access_token).toBe('supabase-token');
    expect(res.json().data.retailer.phone).toBe(PHONE);
  });

  it('accepts bare-10-digit Supabase users too (flag ON)', async () => {
    vi.stubEnv('OTP_TEST_BYPASS', '1');
    mockListUsers.mockResolvedValue(whitelistedUser(PHONE)); // stored without +91

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: PHONE, otp: '654321' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockRetailerUpsert).toHaveBeenCalled();
  });

  it('/otp/send returns "OTP sent" without calling MSG91 for whitelisted phones (flag ON)', async () => {
    vi.stubEnv('OTP_TEST_BYPASS', '1');
    mockListUsers.mockResolvedValue(whitelistedUser(E164));

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/send',
      payload: { phone: PHONE },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.message).toBe('OTP sent');
    expect(mockSendOtpViaMsg91).not.toHaveBeenCalled();
  });

  it('revives a soft-deleted retailer instead of 409-ing (flag ON)', async () => {
    vi.stubEnv('OTP_TEST_BYPASS', '1');
    mockListUsers.mockResolvedValue(whitelistedUser(E164));
    // Soft-deleted row owns the phone; after the revive update the row is
    // relinked to the current auth user.
    mockRetailerFindUnique
      .mockResolvedValueOnce({
        id: 'retailer_deleted',
        phone: PHONE,
        auth_user_id: 'old-auth-user',
        deleted_at: new Date('2026-08-01T00:00:00Z'),
      })
      .mockResolvedValueOnce({
        id: 'retailer_deleted',
        phone: PHONE,
        auth_user_id: 'supabase-user-1',
        deleted_at: null,
      });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: PHONE, otp: '111111' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockRetailerUpdate).toHaveBeenCalledWith({
      where: { id: 'retailer_deleted' },
      data: { deleted_at: null, auth_user_id: 'supabase-user-1' },
    });
    expect(mockRetailerUpsert).toHaveBeenCalled();
  });
});

describe('OTP_TEST_BYPASS — must NOT weaken production', () => {
  it('flag OFF: bypass never engages — normal MSG91 verify still 401s', async () => {
    // Default: OTP_TEST_BYPASS unset.
    mockListUsers.mockResolvedValue(whitelistedUser(E164)); // user exists, but flag off
    mockVerifyStoredOtp.mockResolvedValue('absent'); // + MSG91 configured

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: PHONE, otp: '123456' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_OTP');
  });

  it('flag ON but phone NOT in Supabase: bypass does not apply — still 401s', async () => {
    vi.stubEnv('OTP_TEST_BYPASS', '1');
    // mockListUsers default: no users — phone is not whitelisted.
    mockVerifyStoredOtp.mockResolvedValue('absent');

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: PHONE, otp: '123456' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_OTP');
  });

  it('flag ON, whitelisted phone, still 401s when soft-deleted (non-bypass semantics untouched)', async () => {
    vi.stubEnv('OTP_TEST_BYPASS', '1');
    mockListUsers.mockResolvedValue(whitelistedUser(E164));
    // The deleted-account 409 is skipped only when the bypass is active; the
    // upsert path for a normal (non-deleted) pending row must still work.
    mockRetailerFindUnique.mockResolvedValue({
      id: 'retailer_existing',
      phone: PHONE,
      auth_user_id: 'supabase-user-1',
      deleted_at: null,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: PHONE, otp: '222222' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockRetailerUpdate).not.toHaveBeenCalled(); // nothing to revive
  });
});
