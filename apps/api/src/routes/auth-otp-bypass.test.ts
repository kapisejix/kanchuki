/**
 * OTP_TEST_BYPASS (restored 2026-08-22, env-list whitelist) — pre-production
 * demo-login channel. Phones listed in OTP_TEST_PHONES skip MSG91 entirely:
 * /otp/send never calls MSG91, /otp/verify accepts ANY code and mints a
 * session, and soft-deleted retailer rows are revived instead of 409-ing.
 */
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { authRoutes } from './auth.js';

const mockStaffFindFirst = vi.hoisted(() => vi.fn());
const mockTeamMemberFindFirst = vi.hoisted(() => vi.fn());
const mockRetailerFindUnique = vi.hoisted(() => vi.fn());
const mockRetailerUpsert = vi.hoisted(() => vi.fn());
const mockRetailerUpdate = vi.hoisted(() => vi.fn());

const mockSendOtpViaMsg91 = vi.hoisted(() => vi.fn());
const mockIsMsg91Configured = vi.hoisted(() => vi.fn());
const mockVerifyStoredOtp = vi.hoisted(() => vi.fn());
const mockVerifyWidgetToken = vi.hoisted(() => vi.fn());

const mockListUsers = vi.hoisted(() => vi.fn());
const mockCreateUser = vi.hoisted(() => vi.fn());
const mockUpdateUserById = vi.hoisted(() => vi.fn());
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
        createUser: mockCreateUser,
        updateUserById: mockUpdateUserById,
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

vi.mock('../plugins/team-auth.js', () => ({ signTeamToken: vi.fn() }));

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(authRoutes, { prefix: '/v1/auth' });
  await app.ready();
  return app;
}

const TEST_PHONE = '9000000001';
const validSession = {
  data: {
    user: { id: 'supabase-user-1' },
    session: { access_token: 'bypass-token', refresh_token: 'bypass-refresh', expires_in: 3600 },
  },
  error: null,
};
const newRetailer = {
  id: 'retailer_new',
  phone: TEST_PHONE,
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
  process.env.OTP_TEST_BYPASS = '1';
  process.env.OTP_TEST_PHONES = `${TEST_PHONE},9000000002`;
  mockIsMsg91Configured.mockReturnValue(true);
  mockListUsers.mockResolvedValue({ data: { users: [] }, error: null });
  mockCreateUser.mockResolvedValue({ data: { user: { id: 'supabase-user-1' } }, error: null });
  mockUpdateUserById.mockResolvedValue({ data: { user: { id: 'supabase-user-1' } }, error: null });
  mockSignInWithPassword.mockResolvedValue(validSession);
  mockStaffFindFirst.mockResolvedValue(null);
  mockTeamMemberFindFirst.mockResolvedValue(null);
  mockRetailerFindUnique.mockResolvedValue(null);
  mockRetailerUpsert.mockResolvedValue(newRetailer);
});

afterEach(() => {
  delete process.env.OTP_TEST_BYPASS;
  delete process.env.OTP_TEST_PHONES;
});

describe('POST /auth/otp/send — test bypass', () => {
  it('returns "OTP sent" for a whitelisted phone without calling MSG91', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/send',
      payload: { phone: TEST_PHONE },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.message).toBe('OTP sent');
    expect(mockSendOtpViaMsg91).not.toHaveBeenCalled();
    await app.close();
  });

  it('falls through to the real MSG91 path for a phone NOT on the whitelist', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/send',
      payload: { phone: '9876543210' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockSendOtpViaMsg91).toHaveBeenCalledWith('9876543210', 'login');
    await app.close();
  });

  it('does not bypass when OTP_TEST_BYPASS is unset even for a whitelisted phone', async () => {
    delete process.env.OTP_TEST_BYPASS;
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/send',
      payload: { phone: TEST_PHONE },
    });

    expect(res.statusCode).toBe(200);
    expect(mockSendOtpViaMsg91).toHaveBeenCalledWith(TEST_PHONE, 'login');
    await app.close();
  });
});

describe('POST /auth/otp/verify — test bypass', () => {
  it('accepts ANY code for a whitelisted phone and mints a session', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: TEST_PHONE, otp: '000000' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.access_token).toBe('bypass-token');
    expect(mockVerifyStoredOtp).not.toHaveBeenCalled();
    expect(mockVerifyWidgetToken).not.toHaveBeenCalled();
    await app.close();
  });

  it('revives a soft-deleted retailer row for a whitelisted phone instead of 409-ing', async () => {
    mockRetailerFindUnique
      .mockResolvedValueOnce({
        id: 'retailer_old',
        deleted_at: new Date('2026-08-01'),
        auth_user_id: 'stale-user',
      })
      .mockResolvedValueOnce({ ...newRetailer, id: 'retailer_old' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: TEST_PHONE, otp: '111111' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockRetailerUpdate).toHaveBeenCalledWith({
      where: { id: 'retailer_old' },
      data: { deleted_at: null, auth_user_id: 'supabase-user-1' },
    });
    await app.close();
  });

  it('rejects a non-whitelisted phone with an invalid code (no bypass)', async () => {
    mockVerifyStoredOtp.mockResolvedValue('invalid');
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '9876543210', otp: '000000' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_OTP');
    await app.close();
  });
});
