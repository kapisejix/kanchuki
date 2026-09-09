/**
 * Public staff-invite routes (staff-invite-tokens.md §5.3/5.4) — the
 * logged-out join surface:
 *
 *   GET  /v1/public/staff-invite/:token — masked join summary. Unknown and
 *        non-pending tokens all read as 404 (don't leak existence). Never
 *        echoes the raw token or the unmasked phone.
 *   POST /v1/public/staff-invite/:token/otp — server sends the OTP to the
 *        invite's bound phone (D3 — the number never crosses the wire).
 *
 * Rate limits are exercised implicitly (config present); the 404-vs-200
 * status derivation and the phone-masking are the load-bearing assertions.
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';
import { publicStaffInviteRoutes } from './staff-invite.js';

const mockStaffInviteFindUnique = vi.hoisted(() => vi.fn());
const mockSendOtpViaMsg91 = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    staffInvite: { findUnique: mockStaffInviteFindUnique },
  },
  Prisma: {},
}));

vi.mock('../../lib/msg91-otp.js', () => ({
  sendOtpViaMsg91: mockSendOtpViaMsg91,
}));

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(publicStaffInviteRoutes, { prefix: '/v1/public' });
  await app.ready();
  return app;
}

const BOUND_PHONE = '9876543210';

function pendingInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv_1',
    staff_id: 'staff_1',
    status: 'pending',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    staff: {
      id: 'staff_1',
      name: 'Ramesh',
      phone: BOUND_PHONE,
      role: 'salesperson',
      is_active: true,
      retailer: { deleted_at: null, shop_name: 'Ramesh Textiles', city: 'Jaipur' },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockStaffInviteFindUnique.mockResolvedValue(null);
  mockSendOtpViaMsg91.mockResolvedValue('****3210');
});

describe('GET /v1/public/staff-invite/:token', () => {
  it('returns the masked join summary for a pending invite (200)', async () => {
    mockStaffInviteFindUnique.mockResolvedValue(pendingInvite());

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/staff-invite/abcdefghijklmnopqrstuvwxyz',
    });

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data).toEqual({
      shop_name: 'Ramesh Textiles',
      member_name: 'Ramesh',
      role: 'salesperson',
      phone_masked: '•••••• 3210',
      status: 'pending',
    });
    // Never the raw phone or the token.
    expect(JSON.stringify(res.json())).not.toContain(BOUND_PHONE);
    expect(JSON.stringify(res.json())).not.toContain('abcdefghijklmnopqrstuvwxyz');
    await app.close();
  });

  it('reads unknown tokens as 404 (indistinguishable from expired/revoked)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/staff-invite/doesnotexist_abcdefghijklmnop',
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('reads an expired pending invite as 404', async () => {
    mockStaffInviteFindUnique.mockResolvedValue(
      pendingInvite({ expires_at: new Date(Date.now() - 1000) }),
    );

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/staff-invite/abcdefghijklmnopqrstuvwxyz',
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('reads a used invite as 200 used — already joined, the join screen shows the login CTA', async () => {
    mockStaffInviteFindUnique.mockResolvedValue(pendingInvite({ status: 'used' }));

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/staff-invite/abcdefghijklmnopqrstuvwxyz',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe('used');
    expect(body.data.shop_name).toBe('Ramesh Textiles');
    // Still masked — the full number never crosses the wire even for used rows.
    expect(body.data.phone_masked).toBe('•••••• 3210');
    await app.close();
  });

  it('derives revoked for a deactivated staff row (404)', async () => {
    mockStaffInviteFindUnique.mockResolvedValue(
      pendingInvite({ staff: { ...pendingInvite().staff, is_active: false } }),
    );

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/staff-invite/abcdefghijklmnopqrstuvwxyz',
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('derives revoked for a soft-deleted retailer (404)', async () => {
    mockStaffInviteFindUnique.mockResolvedValue(
      pendingInvite({
        staff: {
          ...pendingInvite().staff,
          retailer: { deleted_at: new Date(), shop_name: 'X', city: 'Y' },
        },
      }),
    );

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/staff-invite/abcdefghijklmnopqrstuvwxyz',
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /v1/public/staff-invite/:token/otp', () => {
  it('sends the OTP to the bound phone and returns only the masked confirmation', async () => {
    mockStaffInviteFindUnique.mockResolvedValue(pendingInvite());

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/staff-invite/abcdefghijklmnopqrstuvwxyz/otp',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ sent_to: '****3210' });
    // The server sent to the invite's bound phone — the client never supplied
    // or learned the number.
    expect(mockSendOtpViaMsg91).toHaveBeenCalledWith(BOUND_PHONE, 'login');
    expect(JSON.stringify(res.json())).not.toContain(BOUND_PHONE);
    await app.close();
  });

  it('rejects a non-pending invite with 400 (no OTP sent)', async () => {
    mockStaffInviteFindUnique.mockResolvedValue(pendingInvite({ status: 'used' }));

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/staff-invite/abcdefghijklmnopqrstuvwxyz/otp',
    });

    expect(res.statusCode).toBe(400);
    expect(mockSendOtpViaMsg91).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an expired pending invite with 400 (no OTP sent)', async () => {
    mockStaffInviteFindUnique.mockResolvedValue(
      pendingInvite({ expires_at: new Date(Date.now() - 1000) }),
    );

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/staff-invite/abcdefghijklmnopqrstuvwxyz/otp',
    });

    expect(res.statusCode).toBe(400);
    expect(mockSendOtpViaMsg91).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an unknown token with 400 (no OTP sent)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/staff-invite/doesnotexist_abcdefghijklmnop/otp',
    });

    expect(res.statusCode).toBe(400);
    expect(mockSendOtpViaMsg91).not.toHaveBeenCalled();
    await app.close();
  });
});
