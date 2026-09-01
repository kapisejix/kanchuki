/**
 * TeamMember phone-OTP login (2026-08-04, auth bridge Option A).
 *
 * The mobile app's only sign-in is phone OTP, but the staff screens under
 * app/staff/* call /team/* routes which require a team JWT. auth.ts now
 * checks TeamMember (Kanchuki's own field/sales/support agents) after Staff
 * and before the retailer upsert, minting a team JWT so agents can reach
 * the catalog-upload (F-019/F-020) screens from their own phone.
 *
 * Critical security assertions:
 *  - A TeamMember phone must NEVER create a Retailer row (the upsert is the
 *    fall-through for unknown phones) — the team check must run first.
 *  - Staff (retailer's own shop employee) takes precedence over TeamMember
 *    when a phone exists in both models.
 *  - Inactive TeamMember → no team access (falls through to retailer flow).
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { authRoutes } from './auth.js';

// ─── Mocks (vi.hoisted required for vi.mock hoisting) ─────────────
const mockStaffFindFirst = vi.hoisted(() => vi.fn());
const mockStaffUpdate = vi.hoisted(() => vi.fn());
const mockTeamMemberFindFirst = vi.hoisted(() => vi.fn());
const mockRetailerFindUnique = vi.hoisted(() => vi.fn());
// Deliberately throws: any TeamMember/Staff login path must never reach the
// retailer upsert. Only unknown (self-serve) phones should hit it.
const mockRetailerUpsert = vi.hoisted(() =>
  vi.fn().mockRejectedValue(new Error('retailer.upsert must not be called')),
);
const mockRetailerUpdate = vi.hoisted(() => vi.fn());
const mockVerifyOtp = vi.hoisted(() => vi.fn());
const mockSignTeamToken = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    // F-024/F-027 seed helpers run on self-serve retailer signup and degrade
    // best-effort when the template tables aren't mocked — stub them so the
    // tests don't log a spurious "Failed to seed ..." error per run.
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
    auth: { verifyOtp: mockVerifyOtp },
  },
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

beforeEach(() => {
  vi.clearAllMocks();
  mockRetailerUpsert.mockRejectedValue(new Error('retailer.upsert must not be called'));
});

describe('POST /auth/otp/verify — TeamMember (Kanchuki agent) login', () => {
  it('returns a team JWT + team_member payload for an active TeamMember phone', async () => {
    mockVerifyOtp.mockResolvedValue(validSession);
    mockStaffFindFirst.mockResolvedValue(null); // not a retailer's shop employee
    mockTeamMemberFindFirst.mockResolvedValue({
      id: 'tm_1',
      name: 'Asha Field',
      email: 'asha@kanchuki.app',
      role: 'MARKETING_AGENT',
    });
    mockSignTeamToken.mockResolvedValue('team-jwt-123');

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '9876543210', otp: '123456' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.access_token).toBe('team-jwt-123');
    expect(body.data.is_staff).toBe(true);
    expect(body.data.team_member).toEqual({
      id: 'tm_1',
      name: 'Asha Field',
      email: 'asha@kanchuki.app',
      role: 'MARKETING_AGENT',
    });
    // SECURITY: no refresh_token for a team JWT (no Supabase session behind it)
    expect(body.data.refresh_token).toBeUndefined();
    expect(body.data.retailer).toBeUndefined();
    // The critical guard: an agent's phone must never CREATE or MUTATE a
    // Retailer row. (auth.ts does a read-only `retailer.findUnique` first for
    // every phone — retailer owners take precedence — which is harmless; the
    // invariant is that no upsert/update runs.)
    expect(mockRetailerUpsert).not.toHaveBeenCalled();
    expect(mockRetailerUpdate).not.toHaveBeenCalled();
    // The token is signed with the team secret, not a Supabase token.
    expect(mockSignTeamToken).toHaveBeenCalledWith({
      sub: 'tm_1',
      role: 'MARKETING_AGENT',
    });
    await app.close();
  });

  it('gives Staff (retailer shop employee) precedence when a phone is in both models', async () => {
    mockVerifyOtp.mockResolvedValue(validSession);
    mockStaffFindFirst.mockResolvedValue({
      id: 'staff_1',
      name: 'Counter Staff',
      role: 'salesperson',
      retailer_id: 'retailer_a',
      auth_user_id: null,
      retailer: { id: 'retailer_a', shop_name: 'Sharma Sarees', city: 'Jaipur' },
    });
    mockTeamMemberFindFirst.mockResolvedValue({
      id: 'tm_1',
      name: 'Asha Field',
      email: 'asha@kanchuki.app',
      role: 'MARKETING_AGENT',
    });
    mockSignTeamToken.mockResolvedValue('team-jwt-123');

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '9876543210', otp: '123456' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Staff wins: Supabase session token + staff payload, NOT the team JWT.
    expect(body.data.access_token).toBe('supabase-token');
    expect(body.data.staff).toMatchObject({ id: 'staff_1', role: 'salesperson' });
    expect(body.data.team_member).toBeUndefined();
    expect(mockRetailerUpsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('denies team access to an inactive TeamMember (falls through to retailer flow)', async () => {
    mockVerifyOtp.mockResolvedValue(validSession);
    mockStaffFindFirst.mockResolvedValue(null);
    mockTeamMemberFindFirst.mockResolvedValue(null); // is_active:true filter → no match
    // Unknown phone → normal self-serve retailer registration
    mockRetailerFindUnique.mockResolvedValue(null);
    mockRetailerUpsert.mockResolvedValue({
      id: 'retailer_new',
      phone: '9876543210',
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
      payload: { phone: '9876543210', otp: '123456' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.is_staff).toBe(false);
    expect(body.data.team_member).toBeUndefined();
    expect(body.data.retailer).toMatchObject({ id: 'retailer_new' });
    expect(mockSignTeamToken).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an invalid OTP before any account lookup', async () => {
    mockVerifyOtp.mockResolvedValue({ data: null, error: new Error('Invalid OTP') });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '9876543210', otp: '000000' },
    });

    expect(res.statusCode).toBe(401);
    expect(mockStaffFindFirst).not.toHaveBeenCalled();
    expect(mockTeamMemberFindFirst).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /auth/otp/verify — soft-deleted / recreated-auth-user retailer edge cases', () => {
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
    mockStaffFindFirst.mockResolvedValue(null);
    mockTeamMemberFindFirst.mockResolvedValue(null);
    mockRetailerUpsert.mockResolvedValue(newRetailer);
  });

  it('returns a clean 409 ACCOUNT_DELETED when the phone belongs to a soft-deleted account (no P2002 500)', async () => {
    mockVerifyOtp.mockResolvedValue(validSession);
    // The 5 test-account phones are still soft-deleted rows (delete-test-retailers
    // SQL not yet run) — the unique phone constraint must NOT surface as a 500.
    mockRetailerFindUnique.mockResolvedValue({
      id: 'retailer_deleted',
      auth_user_id: 'some-old-auth-user',
      deleted_at: new Date('2026-08-05T07:46:57Z'),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '9999999999', otp: '123456' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('ACCOUNT_DELETED');
    expect(mockRetailerUpdate).not.toHaveBeenCalled();
    expect(mockRetailerUpsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('relinks the surviving row to the recreated Supabase auth user instead of colliding on unique phone', async () => {
    mockVerifyOtp.mockResolvedValue(validSession);
    // Supabase auth user was recreated after an auth.users cleanup — same
    // phone, new user.id. Must relink, not attempt a duplicate upsert.
    mockRetailerFindUnique.mockResolvedValue({
      id: 'retailer_survived',
      auth_user_id: 'old-auth-user',
      deleted_at: null,
    });
    mockRetailerUpdate.mockResolvedValue({
      id: 'retailer_survived',
      auth_user_id: 'supabase-user-1',
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '9876543210', otp: '123456' },
    });

    expect(mockRetailerUpdate).toHaveBeenCalledWith({
      where: { id: 'retailer_survived' },
      data: { auth_user_id: 'supabase-user-1' },
    });
    expect(mockRetailerUpsert).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('keeps linking the pending: placeholder row on first real login', async () => {
    mockVerifyOtp.mockResolvedValue(validSession);
    mockRetailerFindUnique.mockResolvedValue({
      id: 'retailer_pending',
      auth_user_id: 'pending:team-created',
      deleted_at: null,
    });
    mockRetailerUpdate.mockResolvedValue({
      id: 'retailer_pending',
      auth_user_id: 'supabase-user-1',
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '9876543210', otp: '123456' },
    });

    expect(mockRetailerUpdate).toHaveBeenCalledWith({
      where: { id: 'retailer_pending' },
      data: { auth_user_id: 'supabase-user-1' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('recovers from a concurrent double-submit P2002 on phone instead of 500ing', async () => {
    // Live-observed: auto-verify-on-6th-digit races the still-tappable
    // Verify button, firing two POST /otp/verify for the same brand-new
    // phone. No `pending` row exists yet (first findUnique call, the
    // pre-upsert lookup), so both requests reach the upsert; the loser's
    // insert violates the separate unique `phone` constraint (Prisma's
    // upsert only guards the auth_user_id conflict target) and throws raw
    // P2002 instead of upserting.
    mockVerifyOtp.mockResolvedValue(validSession);
    mockRetailerFindUnique
      .mockResolvedValueOnce(null) // pre-upsert `pending` lookup — no row yet
      .mockResolvedValueOnce(newRetailer); // post-P2002 refetch — winner's row
    mockRetailerUpsert.mockRejectedValue({ code: 'P2002' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '9876543210', otp: '123456' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.retailer).toMatchObject({ id: 'retailer_new' });
    expect(mockRetailerFindUnique).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it('rethrows a non-P2002 upsert failure as a 500 (not silently swallowed)', async () => {
    mockVerifyOtp.mockResolvedValue(validSession);
    mockRetailerFindUnique.mockResolvedValueOnce(null);
    mockRetailerUpsert.mockRejectedValue(new Error('connection reset'));

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '9876543210', otp: '123456' },
    });

    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
