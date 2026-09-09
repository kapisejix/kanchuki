/**
 * Tokenized staff invite on POST /v1/auth/otp/verify (staff-invite-tokens.md
 * §5.5) — regression coverage for the invite_token branch:
 *
 *   - valid pending invite + matching bound phone → staff payload, invite
 *     marked used, staff.auth_user_id linked, NEVER retailer.upsert.
 *   - expired / revoked / used / unknown token → 400 INVITE_INVALID, no
 *     account created.
 *   - a supplied phone that differs from the invite's bound phone → 400
 *     INVITE_PHONE_MISMATCH.
 *   - invite_token absent → exactly today's behavior (staff-by-phone →
 *     team-member → new retailer), regression-pinned.
 *
 * Uses the OTP_TEST_BYPASS path (any code accepted, session minted via
 * ensureSupabaseSession) so the tests stay deterministic without Redis/MSG91.
 */
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { authRoutes } from './auth.js';

const mockStaffInviteFindUnique = vi.hoisted(() => vi.fn());
const mockStaffUpdate = vi.hoisted(() => vi.fn());
const mockStaffInviteUpdate = vi.hoisted(() => vi.fn());
const mockStaffFindFirst = vi.hoisted(() => vi.fn());
const mockTeamMemberFindFirst = vi.hoisted(() => vi.fn());
const mockRetailerFindUnique = vi.hoisted(() => vi.fn());
const mockRetailerUpsert = vi.hoisted(() => vi.fn());
const mockRetailerUpdate = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() => vi.fn());

const mockListUsers = vi.hoisted(() => vi.fn());
const mockCreateUser = vi.hoisted(() => vi.fn());
const mockUpdateUserById = vi.hoisted(() => vi.fn());
const mockSignInWithPassword = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    $transaction: mockTransaction,
    defaultProductCategory: { findMany: vi.fn().mockResolvedValue([]) },
    defaultProductAttribute: { findMany: vi.fn().mockResolvedValue([]) },
    staff: { findFirst: mockStaffFindFirst, update: mockStaffUpdate },
    staffInvite: { findUnique: mockStaffInviteFindUnique, update: mockStaffInviteUpdate },
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
  isMsg91OtpConfigured: vi.fn().mockReturnValue(true),
  sendOtpViaMsg91: vi.fn(),
  verifyMsg91WidgetToken: vi.fn(),
  verifyStoredOtp: vi.fn(),
}));

vi.mock('../plugins/team-auth.js', () => ({ signTeamToken: vi.fn() }));

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(authRoutes, { prefix: '/v1/auth' });
  await app.ready();
  return app;
}

const BOUND_PHONE = '9000000001'; // invite's phone (also a test-bypass phone)
const FOREIGN_PHONE = '9000000002';
const VALID_TOKEN = 'invite_token_abcdefghijklmnopqrstuvwxyz';

const validSession = {
  data: {
    user: { id: 'supabase-user-1' },
    session: { access_token: 'tok', refresh_token: 'refresh', expires_in: 3600 },
  },
  error: null,
};

function pendingInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv_1',
    staff_id: 'staff_1',
    staff: {
      id: 'staff_1',
      name: 'Ramesh',
      role: 'salesperson',
      phone: BOUND_PHONE,
      is_active: true,
      retailer_id: 'retailer_1',
      retailer: {
        id: 'retailer_1',
        deleted_at: null,
        shop_name: 'Ramesh Textiles',
        city: 'Jaipur',
      },
    },
    status: 'pending',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OTP_TEST_BYPASS = '1';
  process.env.OTP_TEST_PHONES = `${BOUND_PHONE},${FOREIGN_PHONE}`;
  mockListUsers.mockResolvedValue({ data: { users: [] }, error: null });
  mockCreateUser.mockResolvedValue({ data: { user: { id: 'supabase-user-1' } }, error: null });
  mockUpdateUserById.mockResolvedValue({ data: { user: { id: 'supabase-user-1' } }, error: null });
  mockSignInWithPassword.mockResolvedValue(validSession);
  mockStaffInviteFindUnique.mockResolvedValue(null);
  mockStaffFindFirst.mockResolvedValue(null);
  mockTeamMemberFindFirst.mockResolvedValue(null);
  mockRetailerFindUnique.mockResolvedValue(null);
  mockTransaction.mockImplementation(async (ops: unknown[]) => {
    for (const op of ops) await op;
    return ops;
  });
  mockStaffUpdate.mockResolvedValue({});
  mockStaffInviteUpdate.mockResolvedValue({});
});

afterEach(() => {
  delete process.env.OTP_TEST_BYPASS;
});

describe('POST /v1/auth/otp/verify — invite_token branch', () => {
  it('joins as staff: links auth_user_id, marks invite used, returns staff payload (never retailer.upsert)', async () => {
    mockStaffInviteFindUnique.mockResolvedValue(pendingInvite());

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: BOUND_PHONE, otp: '123456', invite_token: VALID_TOKEN },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.is_staff).toBe(true);
    expect(data.staff).toMatchObject({
      id: 'staff_1',
      name: 'Ramesh',
      role: 'salesperson',
      retailer_id: 'retailer_1',
      retailer_shop_name: 'Ramesh Textiles',
      retailer_city: 'Jaipur',
    });
    // Invite consumed: staff.auth_user_id linked + invite marked used.
    expect(mockStaffUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'staff_1' },
        data: expect.objectContaining({ auth_user_id: 'supabase-user-1' }),
      }),
    );
    expect(mockStaffInviteUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv_1' },
        data: expect.objectContaining({ status: 'used' }),
      }),
    );
    // The whole point: no brand-new retailer row is ever created.
    expect(mockRetailerUpsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('does not require a client-supplied phone — the bound phone is derived server-side (D3)', async () => {
    mockStaffInviteFindUnique.mockResolvedValue(pendingInvite());

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { otp: '123456', invite_token: VALID_TOKEN },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.staff.id).toBe('staff_1');
    expect(mockRetailerUpsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects a phone that differs from the invite bound phone (400 INVITE_PHONE_MISMATCH)', async () => {
    mockStaffInviteFindUnique.mockResolvedValue(pendingInvite());

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: FOREIGN_PHONE, otp: '123456', invite_token: VALID_TOKEN },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVITE_PHONE_MISMATCH');
    // No session-linked staff, no invite consumption, no retailer row.
    expect(mockStaffUpdate).not.toHaveBeenCalled();
    expect(mockStaffInviteUpdate).not.toHaveBeenCalled();
    expect(mockRetailerUpsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an unknown token as 400 INVITE_INVALID (no account created)', async () => {
    // findUnique returns null (unknown hash — same as expired/revoked 404s).
    mockStaffInviteFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: {
        phone: BOUND_PHONE,
        otp: '123456',
        invite_token: 'unknown_token_abcdefghijklmnop',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVITE_INVALID');
    expect(mockRetailerUpsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an expired pending invite as 400 INVITE_INVALID', async () => {
    mockStaffInviteFindUnique.mockResolvedValue(
      pendingInvite({ expires_at: new Date(Date.now() - 1000) }),
    );

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: BOUND_PHONE, otp: '123456', invite_token: VALID_TOKEN },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVITE_INVALID');
    expect(mockRetailerUpsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects a used invite as 400 INVITE_INVALID (single-use, D2)', async () => {
    mockStaffInviteFindUnique.mockResolvedValue(pendingInvite({ status: 'used' }));

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: BOUND_PHONE, otp: '123456', invite_token: VALID_TOKEN },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVITE_INVALID');
    expect(mockRetailerUpsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an invite for a deactivated staff row (400 INVITE_INVALID)', async () => {
    mockStaffInviteFindUnique.mockResolvedValue(
      pendingInvite({ staff: { ...pendingInvite().staff, is_active: false } }),
    );

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: BOUND_PHONE, otp: '123456', invite_token: VALID_TOKEN },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVITE_INVALID');
    expect(mockRetailerUpsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an invite for a soft-deleted retailer (400 INVITE_INVALID)', async () => {
    mockStaffInviteFindUnique.mockResolvedValue(
      pendingInvite({
        staff: {
          ...pendingInvite().staff,
          retailer: { id: 'retailer_1', deleted_at: new Date(), shop_name: 'X', city: 'Y' },
        },
      }),
    );

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: BOUND_PHONE, otp: '123456', invite_token: VALID_TOKEN },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVITE_INVALID');
    expect(mockRetailerUpsert).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /v1/auth/otp/verify — invite_token ABSENT (no regression)', () => {
  it('still routes an unknown phone to a new retailer (upsert path unchanged)', async () => {
    mockStaffFindFirst.mockResolvedValue(null);
    mockTeamMemberFindFirst.mockResolvedValue(null);
    mockRetailerFindUnique.mockResolvedValue(null);
    mockRetailerUpsert.mockResolvedValue({
      id: 'retailer_new',
      phone: BOUND_PHONE,
      shop_name: '',
      city: '',
      plan: 'STARTER',
      plan_status: 'TRIAL',
      onboarding_completed: false,
      onboarding_step: 0,
      is_suspended: false,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: BOUND_PHONE, otp: '123456' },
    });

    expect(res.statusCode).toBe(200);
    // No token → normal flow: a new retailer row is created (today's behavior).
    expect(mockRetailerUpsert).toHaveBeenCalled();
    expect(mockStaffInviteFindUnique).not.toHaveBeenCalled();
    await app.close();
  });

  it('still returns the staff payload for a phone on an active staff row', async () => {
    mockStaffFindFirst.mockResolvedValue({
      id: 'staff_1',
      name: 'Ramesh',
      role: 'salesperson',
      retailer_id: 'retailer_1',
      auth_user_id: 'supabase-user-1',
      retailer: { id: 'retailer_1', shop_name: 'Ramesh Textiles', city: 'Jaipur' },
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: BOUND_PHONE, otp: '123456' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.is_staff).toBe(true);
    expect(res.json().data.staff.retailer_shop_name).toBe('Ramesh Textiles');
    expect(mockStaffInviteFindUnique).not.toHaveBeenCalled();
    await app.close();
  });
});
