/**
 * Apple App Review bypass (launch-readiness §7A.3) — a FIXED phone +
 * FIXED code, gated on BOTH `REVIEW_PHONE` and `REVIEW_OTP`.
 *
 * Distinct from `OTP_TEST_BYPASS` (auth-otp-bypass.test.ts), which accepts ANY
 * code. This one accepts exactly the configured code, is off unless both env
 * vars are set, and must never write the phone or the code to a log.
 */
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { authRoutes } from './auth.js';

const mockStaffFindFirst = vi.hoisted(() => vi.fn());
const mockStaffUpdate = vi.hoisted(() => vi.fn());
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

const REVIEW_PHONE = '9000000099';
const REVIEW_OTP = '135790';
const validSession = {
  data: {
    user: { id: 'supabase-user-1' },
    session: { access_token: 'review-token', refresh_token: 'review-refresh', expires_in: 3600 },
  },
  error: null,
};
const newRetailer = {
  id: 'retailer_new',
  phone: REVIEW_PHONE,
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
  process.env.REVIEW_PHONE = REVIEW_PHONE;
  process.env.REVIEW_OTP = REVIEW_OTP;
  delete process.env.OTP_TEST_BYPASS;
  delete process.env.OTP_TEST_PHONES;
  mockIsMsg91Configured.mockReturnValue(true);
  mockListUsers.mockResolvedValue({ data: { users: [] }, error: null });
  mockCreateUser.mockResolvedValue({ data: { user: { id: 'supabase-user-1' } }, error: null });
  mockUpdateUserById.mockResolvedValue({ data: { user: { id: 'supabase-user-1' } }, error: null });
  mockSignInWithPassword.mockResolvedValue(validSession);
  mockStaffFindFirst.mockResolvedValue(null);
  mockTeamMemberFindFirst.mockResolvedValue(null);
  mockRetailerFindUnique.mockResolvedValue(null);
  mockRetailerUpsert.mockResolvedValue(newRetailer);
  mockVerifyStoredOtp.mockResolvedValue('invalid');
});

afterEach(() => {
  delete process.env.REVIEW_PHONE;
  delete process.env.REVIEW_OTP;
  delete process.env.OTP_TEST_BYPASS;
  delete process.env.OTP_TEST_PHONES;
});

describe('POST /auth/otp/send — review bypass', () => {
  it('returns bypass:true for the review phone without calling MSG91', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/send',
      payload: { phone: REVIEW_PHONE },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.bypass).toBe(true);
    expect(mockSendOtpViaMsg91).not.toHaveBeenCalled();
    await app.close();
  });

  it('is OFF when REVIEW_OTP is unset — the review phone goes to the real MSG91 path', async () => {
    delete process.env.REVIEW_OTP;
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/send',
      payload: { phone: REVIEW_PHONE },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.bypass).toBeUndefined();
    expect(mockSendOtpViaMsg91).toHaveBeenCalledWith(REVIEW_PHONE, 'login');
    await app.close();
  });

  it('is OFF when REVIEW_PHONE is unset', async () => {
    delete process.env.REVIEW_PHONE;
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/send',
      payload: { phone: REVIEW_PHONE },
    });

    expect(mockSendOtpViaMsg91).toHaveBeenCalled();
    await app.close();
  });

  it('does not engage for a non-review phone', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/send',
      payload: { phone: '9876543210' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.bypass).toBeUndefined();
    expect(mockSendOtpViaMsg91).toHaveBeenCalledWith('9876543210', 'login');
    await app.close();
  });
});

describe('POST /auth/otp/verify — review bypass', () => {
  it('accepts the FIXED code and mints a session', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: REVIEW_PHONE, otp: REVIEW_OTP },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.access_token).toBe('review-token');
    expect(mockVerifyStoredOtp).not.toHaveBeenCalled();
    expect(mockVerifyWidgetToken).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects a WRONG code — never "any 6 digits"', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: REVIEW_PHONE, otp: '000000' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_OTP');
    expect(mockRetailerUpsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects the wrong code even when OTP_TEST_BYPASS also lists this phone', async () => {
    // Review is checked FIRST, so a review phone that is also a test phone
    // still has to produce REVIEW_OTP — the fixed code is not weakened by
    // the any-code bypass being on.
    process.env.OTP_TEST_BYPASS = '1';
    process.env.OTP_TEST_PHONES = REVIEW_PHONE;
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: REVIEW_PHONE, otp: '999999' },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('is OFF when REVIEW_OTP is unset — the review code does not log anyone in', async () => {
    delete process.env.REVIEW_OTP;
    mockVerifyStoredOtp.mockResolvedValue('invalid');
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: REVIEW_PHONE, otp: REVIEW_OTP },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('a malformed REVIEW_OTP disables the bypass entirely', async () => {
    // Guards against a "nice-sounding" relaxation: REVIEW_OTP must be exactly
    // 6 digits or the bypass is inert, even for the right phone and code.
    process.env.REVIEW_OTP = '1357900';
    mockVerifyStoredOtp.mockResolvedValue('invalid');
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: REVIEW_PHONE, otp: '135790' },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('never writes the review phone or the code to a log', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/v1/auth/otp/verify',
        payload: { phone: REVIEW_PHONE, otp: REVIEW_OTP },
      });
      expect(res.statusCode).toBe(200);

      const written = [...logSpy.mock.calls, ...errorSpy.mock.calls]
        .flat()
        .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
        .join('\n');
      expect(written).not.toContain(REVIEW_PHONE);
      expect(written).not.toContain(REVIEW_OTP);
      await app.close();
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
