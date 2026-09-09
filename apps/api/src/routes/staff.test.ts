import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { staffRoutes } from './staff.js';

// Regression tests for POST /v1/staff — pins the whole server contract so the
// "Failed to add team member" mobile error can't silently mask a server bug
// (2026-09-08 batch, mobile issue #7). The route itself was verified sound;
// these tests lock in the happy path + every rejection reason the mobile app
// now surfaces verbatim instead of the generic fallback.

const {
  mockRetailerFindUniqueOrThrow,
  mockRetailerFindFirst,
  mockStaffCount,
  mockStaffFindFirst,
  mockStaffCreate,
  mockStaffUpdate,
  mockStaffFindMany,
  mockStaffInviteUpsert,
  mockStaffInviteUpdateMany,
  mockAuditLogCreate,
  mockTransaction,
  mockPurgeExecuteRaw,
  mockPurgeStaffDelete,
  mockPurgeTransaction,
} = vi.hoisted(() => ({
  mockRetailerFindUniqueOrThrow: vi.fn(),
  mockRetailerFindFirst: vi.fn(),
  mockStaffCount: vi.fn(),
  mockStaffFindFirst: vi.fn(),
  mockStaffCreate: vi.fn(),
  mockStaffUpdate: vi.fn(),
  mockStaffFindMany: vi.fn(),
  // staff-invite-tokens.md: POST /v1/staff upserts a staff_invites row in
  // the same transaction as the staff write; soft DELETE revokes pending
  // invites.
  mockStaffInviteUpsert: vi.fn(),
  mockStaffInviteUpdateMany: vi.fn(),
  mockAuditLogCreate: vi.fn(),
  // Interactive $transaction (callback form) used by POST /v1/staff.
  mockTransaction: vi.fn(),
  mockPurgeExecuteRaw: vi.fn(),
  mockPurgeStaffDelete: vi.fn(),
  mockPurgeTransaction: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    $transaction: mockTransaction,
    retailer: {
      findUniqueOrThrow: mockRetailerFindUniqueOrThrow,
      findFirst: mockRetailerFindFirst,
    },
    staff: {
      findMany: mockStaffFindMany,
      count: mockStaffCount,
      findFirst: mockStaffFindFirst,
      create: mockStaffCreate,
      update: mockStaffUpdate,
    },
    staffInvite: {
      upsert: mockStaffInviteUpsert,
      updateMany: mockStaffInviteUpdateMany,
    },
    auditLog: { create: mockAuditLogCreate },
  },
  // FR-4.4: hard deletes must go through the scoped kanchuki_purge role with
  // the F-017 app.allow_hard_delete flag (SECURITY §19 — kanchuki_app has
  // DELETE revoked on staff), never the main client.
  getPurgePrisma: () => ({
    $executeRawUnsafe: mockPurgeExecuteRaw,
    staff: { delete: mockPurgeStaffDelete },
    $transaction: mockPurgeTransaction,
  }),
  Prisma: {},
}));

const RETAILER_ID = 'retailer_1';

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('staffRole', null);
  app.decorateRequest('catalogDelegate', null);
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
  });
  await app.register(staffRoutes, { prefix: '/v1/staff' });
  await app.ready();
  return app;
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) — clears mockResolvedValueOnce queues
  // so a leftover once-value from one test can't leak into the next.
  vi.resetAllMocks();
  // Interactive transaction: invoke the callback with a tx client whose
  // staff/staffInvite operations delegate to the shared mocks. This mirrors
  // the route's `prisma.$transaction(async (tx) => …)` shape.
  mockTransaction.mockImplementation(async (cb: unknown) => {
    const tx = {
      staff: {
        create: mockStaffCreate,
        update: mockStaffUpdate,
      },
      staffInvite: {
        upsert: mockStaffInviteUpsert,
      },
    };
    return (cb as (t: typeof tx) => Promise<unknown>)(tx);
  });
  // Purge transaction plumbing — the route awaits $transaction([...]) and
  // the array members are promise-returning calls; execute them in order so
  // the SET runs before the delete (same shape as categories.test.ts).
  mockPurgeTransaction.mockImplementation(async (ops: Promise<unknown>[]) => {
    for (const op of ops) await op;
    return ops;
  });
  mockPurgeExecuteRaw.mockResolvedValue(undefined);
  mockPurgeStaffDelete.mockResolvedValue({ id: 'staff_1' });
  mockAuditLogCreate.mockResolvedValue({});
  // staff-invite-tokens.md: the create/reactivate path upserts the invite
  // row (token hash + expiry) whenever the member has no auth_user_id yet.
  mockStaffInviteUpsert.mockResolvedValue({ id: 'inv_1', status: 'pending' });
  mockStaffInviteUpdateMany.mockResolvedValue({ count: 1 });
});

describe('POST /v1/staff', () => {
  it('creates a staff member on the happy path (201, normalized phone)', async () => {
    mockRetailerFindUniqueOrThrow.mockResolvedValue({ max_staff_seats: 3 });
    mockStaffCount.mockResolvedValue(0);
    mockStaffFindFirst.mockResolvedValueOnce(null); // no existing active member
    mockRetailerFindFirst.mockResolvedValueOnce(null); // phone not on a retailer account
    mockStaffCreate.mockResolvedValue({
      id: 'staff_1',
      retailer_id: RETAILER_ID,
      name: 'Ramesh',
      phone: '9876543210',
      role: 'salesperson',
      is_active: true,
      auth_user_id: null, // never logged in → an invite is minted
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff',
      payload: { name: 'Ramesh', phone: '9876543210', role: 'salesperson' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.id).toBe('staff_1');
    // Tokenized invite (staff-invite-tokens.md §5.1): response carries a
    // working share link + expiry. The raw token appears ONLY in the url.
    expect(res.json().data.invite).toMatchObject({
      url: expect.stringMatching(/^kanchuki:\/\/join\?token=[A-Za-z0-9_-]{20,}$/),
      expires_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    // Phone must be normalized to the bare 10-digit form before persistence.
    expect(mockStaffCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phone: '9876543210', retailer_id: RETAILER_ID }),
      }),
    );
    // The invite upsert runs inside the same transaction as the staff write.
    expect(mockStaffInviteUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { staff_id: 'staff_1' },
        create: expect.objectContaining({
          staff_id: 'staff_1',
          retailer_id: RETAILER_ID,
          role_snapshot: 'salesperson',
          status: 'pending',
        }),
      }),
    );
    await app.close();
  });

  it('rejects an invalid phone number (422)', async () => {
    const app = await buildApp();
    // 10 digits but doesn't start 6–9 → passes zod .min(10) and reaches the
    // isValidIndianPhone refine, which is the rejection the mobile app shows.
    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff',
      payload: { name: 'Ramesh', phone: '1234567890', role: 'salesperson' },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('valid 10-digit Indian mobile');
    expect(mockStaffCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects adding beyond the plan seat limit (402)', async () => {
    mockRetailerFindUniqueOrThrow.mockResolvedValue({ max_staff_seats: 3 });
    mockStaffCount.mockResolvedValue(3); // 3 active members already

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff',
      payload: { name: 'Fourth', phone: '9812345670', role: 'salesperson' },
    });

    expect(res.statusCode).toBe(402);
    expect(res.json().error.code).toBe('PLAN_LIMIT_EXCEEDED');
    expect(res.json().error.message).toContain('staff seats');
    expect(mockStaffCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects a phone already on an active staff member (422)', async () => {
    mockRetailerFindUniqueOrThrow.mockResolvedValue({ max_staff_seats: 3 });
    mockStaffCount.mockResolvedValue(1);
    mockStaffFindFirst.mockResolvedValueOnce({
      id: 'staff_existing',
      phone: '9876543210',
      is_active: true,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff',
      payload: { name: 'Ramesh', phone: '9876543210', role: 'salesperson' },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('already exists');
    expect(mockStaffCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects a phone already registered as a retailer account (422)', async () => {
    mockRetailerFindUniqueOrThrow.mockResolvedValue({ max_staff_seats: 3 });
    mockStaffCount.mockResolvedValue(0);
    mockStaffFindFirst.mockResolvedValueOnce(null); // no staff row with this phone
    mockRetailerFindFirst.mockResolvedValueOnce({ id: 'some_other_retailer' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff',
      payload: { name: 'Ramesh', phone: '9876543210', role: 'salesperson' },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('already registered as a retailer');
    expect(mockStaffCreate).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('GET /v1/staff', () => {
  it('lists staff rows for the retailer', async () => {
    mockStaffFindMany.mockResolvedValue([
      {
        id: 'staff_1',
        name: 'Ramesh',
        phone: '9876543210',
        role: 'salesperson',
        is_active: true,
        staff_invites: [],
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/staff' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(mockStaffFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { retailer_id: RETAILER_ID } }),
    );
    await app.close();
  });
});

// ─── FR-1.3 (team-member-access-control): role assignment ─────────────
// 'owner' is a valid DB value only for internal/seed use — a retailer caller
// can never grant it. Rejected on both POST (assertAssignableRole) and PUT
// (zod StaffUpdateSchema enum) with the same plain-language message the
// mobile role picker relies on.
describe('POST /v1/staff — role guardrail (FR-1.3)', () => {
  it('rejects role=owner before any DB work (422)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff',
      payload: { name: 'Ramesh', phone: '9876543210', role: 'owner' },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toBe('Role must be manager or salesperson');
    // No seat count, no findFirst, no create — rejected before touching the DB.
    expect(mockStaffCount).not.toHaveBeenCalled();
    expect(mockStaffFindFirst).not.toHaveBeenCalled();
    expect(mockStaffCreate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('accepts manager explicitly (201)', async () => {
    mockRetailerFindUniqueOrThrow.mockResolvedValue({ max_staff_seats: 3 });
    mockStaffCount.mockResolvedValue(0);
    mockStaffFindFirst.mockResolvedValueOnce(null);
    mockRetailerFindFirst.mockResolvedValueOnce(null);
    mockStaffCreate.mockResolvedValue({
      id: 'staff_mgr',
      retailer_id: RETAILER_ID,
      name: 'Meera',
      phone: '9876543210',
      role: 'manager',
      is_active: true,
      auth_user_id: null,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff',
      payload: { name: 'Meera', phone: '9876543210', role: 'manager' },
    });

    expect(res.statusCode).toBe(201);
    expect(mockStaffCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'manager' }) }),
    );
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'create' }) }),
    );
    await app.close();
  });
});

describe('PUT /v1/staff/:id — role guardrail (FR-1.2/1.3)', () => {
  it('rejects role=owner on edit (422) without touching the row', async () => {
    mockStaffFindFirst.mockResolvedValueOnce({
      id: 'staff_1',
      retailer_id: RETAILER_ID,
      is_active: true,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/staff/staff_1',
      payload: { role: 'owner' },
    });

    expect(res.statusCode).toBe(422);
    // PUT's StaffUpdateSchema enum (manager|salesperson only) rejects 'owner'
    // with the zod message — the friendly plain-language one is the POST-side
    // assertAssignableRole path (where the schema must still accept 'owner'
    // for DB compat). Both reject before any write.
    expect(res.json().error.message).toContain("Expected 'manager' | 'salesperson'");
    expect(mockStaffUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it('updates the role to manager (200) and audits it', async () => {
    mockStaffFindFirst.mockResolvedValueOnce({
      id: 'staff_1',
      retailer_id: RETAILER_ID,
      is_active: true,
      name: 'Ramesh',
    });
    mockStaffUpdate.mockResolvedValue({
      id: 'staff_1',
      name: 'Ramesh',
      phone: '9876543210',
      role: 'manager',
      is_active: true,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/staff/staff_1',
      payload: { role: 'manager' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockStaffUpdate).toHaveBeenCalledWith({
      where: { id: 'staff_1' },
      data: { role: 'manager' },
    });
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'update' }) }),
    );
    await app.close();
  });

  it('404s when the member is not owned by this retailer', async () => {
    mockStaffFindFirst.mockResolvedValueOnce(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/staff/other_staff',
      payload: { role: 'manager' },
    });

    expect(res.statusCode).toBe(404);
    expect(mockStaffUpdate).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── FR-4 (team-member-access-control): add/restore/purge lifecycle ───
describe('POST /v1/staff — reactivate-on-add (FR-4.3)', () => {
  it('reactivates a deactivated row instead of creating a duplicate (201 + audit reactivate)', async () => {
    mockRetailerFindUniqueOrThrow.mockResolvedValue({ max_staff_seats: 3 });
    mockStaffCount.mockResolvedValue(1); // the inactive row's seat is already free
    mockStaffFindFirst.mockResolvedValueOnce({
      id: 'staff_old',
      retailer_id: RETAILER_ID,
      phone: '9876543210',
      is_active: false,
      name: 'Old Name',
      role: 'salesperson',
    });
    mockRetailerFindFirst.mockResolvedValueOnce(null); // phone not a retailer account
    mockStaffUpdate.mockResolvedValue({
      id: 'staff_old',
      name: 'Ramesh',
      phone: '9876543210',
      role: 'manager',
      is_active: true,
      auth_user_id: null, // never joined → reactivation mints a fresh invite
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff',
      payload: { name: 'Ramesh', phone: '9876543210', role: 'manager' },
    });

    expect(res.statusCode).toBe(201);
    // Reuses the existing row — no second row created.
    expect(mockStaffCreate).not.toHaveBeenCalled();
    expect(mockStaffUpdate).toHaveBeenCalledWith({
      where: { id: 'staff_old' },
      data: { is_active: true, name: 'Ramesh', role: 'manager' },
    });
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'reactivate' }) }),
    );
    await app.close();
  });

  it('still rejects a phone on an ACTIVE row (422 — no duplicate while live)', async () => {
    mockRetailerFindUniqueOrThrow.mockResolvedValue({ max_staff_seats: 3 });
    mockStaffCount.mockResolvedValue(1);
    mockStaffFindFirst.mockResolvedValueOnce({
      id: 'staff_live',
      phone: '9876543210',
      is_active: true,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff',
      payload: { name: 'Ramesh', phone: '9876543210', role: 'salesperson' },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('already exists');
    expect(mockStaffCreate).not.toHaveBeenCalled();
    expect(mockStaffUpdate).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('PUT /v1/staff/:id — restore (FR-4.2)', () => {
  it('restores an inactive member and audits restore (200)', async () => {
    mockStaffFindFirst.mockResolvedValueOnce({
      id: 'staff_old',
      retailer_id: RETAILER_ID,
      is_active: false,
      name: 'Old Name',
    });
    // Restore consumes a seat like a fresh add.
    mockRetailerFindUniqueOrThrow.mockResolvedValue({ max_staff_seats: 3 });
    mockStaffCount.mockResolvedValue(2); // 2 active → room for the 3rd
    mockStaffUpdate.mockResolvedValue({
      id: 'staff_old',
      name: 'Old Name',
      phone: '9876543210',
      role: 'salesperson',
      is_active: true,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/staff/staff_old',
      payload: { is_active: true },
    });

    expect(res.statusCode).toBe(200);
    expect(mockStaffUpdate).toHaveBeenCalledWith({
      where: { id: 'staff_old' },
      data: { is_active: true },
    });
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'restore' }) }),
    );
    await app.close();
  });

  it('blocks restore at the seat limit (402)', async () => {
    mockStaffFindFirst.mockResolvedValueOnce({
      id: 'staff_old',
      retailer_id: RETAILER_ID,
      is_active: false,
    });
    mockRetailerFindUniqueOrThrow.mockResolvedValue({ max_staff_seats: 3 });
    mockStaffCount.mockResolvedValue(3); // all seats used by active members

    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/staff/staff_old',
      payload: { is_active: true },
    });

    expect(res.statusCode).toBe(402);
    expect(res.json().error.code).toBe('PLAN_LIMIT_EXCEEDED');
    expect(mockStaffUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it('does NOT seat-check a plain edit of an already-active member', async () => {
    mockStaffFindFirst.mockResolvedValueOnce({
      id: 'staff_1',
      retailer_id: RETAILER_ID,
      is_active: true,
      name: 'Ramesh',
    });
    mockStaffUpdate.mockResolvedValue({
      id: 'staff_1',
      name: 'Ramesh',
      phone: '9876543210',
      role: 'salesperson',
      is_active: true,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/staff/staff_1',
      payload: { name: 'Ramesh Kumar' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockRetailerFindUniqueOrThrow).not.toHaveBeenCalled();
    expect(mockStaffCount).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('DELETE /v1/staff/:id — soft-remove & purge (FR-4.1/4.4)', () => {
  it('soft-removes by default (204, is_active=false, audit delete)', async () => {
    mockStaffFindFirst.mockResolvedValueOnce({
      id: 'staff_1',
      retailer_id: RETAILER_ID,
      name: 'Ramesh',
      role: 'salesperson',
      is_active: true,
    });
    mockStaffUpdate.mockResolvedValue({
      id: 'staff_1',
      is_active: false,
    });

    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/v1/staff/staff_1' });

    expect(res.statusCode).toBe(204);
    expect(mockStaffUpdate).toHaveBeenCalledWith({
      where: { id: 'staff_1' },
      data: { is_active: false },
    });
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'delete' }) }),
    );
    // No purge client involved on the soft path.
    expect(mockPurgeTransaction).not.toHaveBeenCalled();
    await app.close();
  });

  it('blocks purge=true while the member is still active (422)', async () => {
    mockStaffFindFirst.mockResolvedValueOnce({
      id: 'staff_1',
      retailer_id: RETAILER_ID,
      name: 'Ramesh',
      is_active: true,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/staff/staff_1?purge=true',
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('Deactivate the team member');
    expect(mockPurgeStaffDelete).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('purges via the scoped purge client with the F-017 flag, audit written FIRST (204)', async () => {
    mockStaffFindFirst.mockResolvedValueOnce({
      id: 'staff_old',
      retailer_id: RETAILER_ID,
      name: 'Old Name',
      phone: '9876543210',
      role: 'salesperson',
      is_active: false,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/staff/staff_old?purge=true',
    });

    expect(res.statusCode).toBe(204);
    // Audit row written with the pre-erasure name/phone (it must survive the
    // hard delete) and BEFORE the purge transaction runs.
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'purge',
          resource_id: 'staff_old',
          metadata: expect.objectContaining({
            name: 'Old Name',
            phone: '9876543210',
            role: 'salesperson',
          }),
        }),
      }),
    );
    const auditCallIndex = mockAuditLogCreate.mock.invocationCallOrder[0] ?? 0;
    const purgeCallIndex = mockPurgeTransaction.mock.invocationCallOrder[0] ?? 0;
    expect(auditCallIndex).toBeLessThan(purgeCallIndex);
    // Hard delete via the scoped role, never the main (DELETE-revoked) client.
    expect(mockPurgeExecuteRaw).toHaveBeenCalledWith("SET app.allow_hard_delete = 'true';");
    expect(mockPurgeStaffDelete).toHaveBeenCalledWith({ where: { id: 'staff_old' } });
    expect(mockPurgeTransaction).toHaveBeenCalledTimes(1);
    // The main client only did the ownership findFirst — no delete/update.
    expect(mockStaffUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it('404s when the row is not owned by this retailer', async () => {
    mockStaffFindFirst.mockResolvedValueOnce(null);

    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/v1/staff/other_staff' });

    expect(res.statusCode).toBe(404);
    expect(mockStaffUpdate).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── POST /v1/staff/:id/invite/resend (staff-invite-tokens.md §5.2) ──
// Mint a fresh token on the existing staff_invites row (staff_id unique, D5)
// for a member who never logged in. Owner-only by default (/v1/staff is not
// on the staffCanAccess allowlist). Already-joined members → 409.
describe('POST /v1/staff/:id/invite/resend', () => {
  const baseStaff = {
    id: 'staff_1',
    retailer_id: RETAILER_ID,
    name: 'Ramesh',
    phone: '9876543210',
    role: 'salesperson',
    is_active: true,
    auth_user_id: null,
  };

  it('replaces the token on the existing invite row (200, fresh url + expiry)', async () => {
    mockStaffFindFirst.mockResolvedValueOnce(baseStaff);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff/staff_1/invite/resend',
    });

    expect(res.statusCode).toBe(200);
    // Fresh shareable link — the raw token appears ONLY in the url.
    expect(res.json().data.invite).toMatchObject({
      url: expect.stringMatching(/^kanchuki:\/\/join\?token=[A-Za-z0-9_-]{20,}$/),
      expires_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    // D5: upsert keys on staff_id — replaces token_hash/status/expiry in one
    // write; accepted_at cleared in case a previous link was used-then-reset.
    expect(mockStaffInviteUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { staff_id: 'staff_1' },
        create: expect.objectContaining({
          staff_id: 'staff_1',
          retailer_id: RETAILER_ID,
          role_snapshot: 'salesperson',
          status: 'pending',
        }),
        update: expect.objectContaining({
          role_snapshot: 'salesperson',
          status: 'pending',
          accepted_at: null,
        }),
      }),
    );
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'staff_invite_resend',
          resource_type: 'Staff',
          resource_id: 'staff_1',
        }),
      }),
    );
    await app.close();
  });

  it('409 ALREADY_JOINED when the member already linked an auth_user_id', async () => {
    mockStaffFindFirst.mockResolvedValueOnce({ ...baseStaff, auth_user_id: 'auth_1' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff/staff_1/invite/resend',
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('ALREADY_JOINED');
    // No token was minted — upsert and audit never ran.
    expect(mockStaffInviteUpsert).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('422 when the member is deactivated', async () => {
    mockStaffFindFirst.mockResolvedValueOnce({ ...baseStaff, is_active: false });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff/staff_1/invite/resend',
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('Reactivate');
    expect(mockStaffInviteUpsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('404s when the row is not owned by this retailer', async () => {
    mockStaffFindFirst.mockResolvedValueOnce(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff/staff_1/invite/resend',
    });

    expect(res.statusCode).toBe(404);
    expect(mockStaffInviteUpsert).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── GET /v1/staff — invite status rides along (staff-invite-tokens.md
// §6.3): the lifecycle UI needs to render "Invite sent · expires …" /
// "Invite expired · Resend" chips per member. Derived: pending + past expiry
// reads as 'expired'; used/revoked stay as stored; joined members (auth_user_id
// set) get invite: null.
describe('GET /v1/staff — invite status', () => {
  const expiresFuture = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const expiresPast = new Date(Date.now() - 24 * 60 * 60 * 1000);

  it('derives expired for a pending invite past expiry', async () => {
    mockStaffFindMany.mockResolvedValue([
      {
        id: 'staff_1',
        retailer_id: RETAILER_ID,
        auth_user_id: null,
        name: 'Ramesh',
        phone: '9876543210',
        role: 'salesperson',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        staff_invites: [{ status: 'pending', expires_at: expiresPast }],
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/staff' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].invite).toEqual({
      status: 'expired',
      expires_at: expiresPast.toISOString(),
    });
    await app.close();
  });

  it('reports pending with the future expiry for a live invite', async () => {
    mockStaffFindMany.mockResolvedValue([
      {
        id: 'staff_1',
        retailer_id: RETAILER_ID,
        auth_user_id: null,
        name: 'Ramesh',
        phone: '9876543210',
        role: 'salesperson',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        staff_invites: [{ status: 'pending', expires_at: expiresFuture }],
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/staff' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].invite).toEqual({
      status: 'pending',
      expires_at: expiresFuture.toISOString(),
    });
    expect(res.json().data[0].auth_user_id).toBeNull();
    await app.close();
  });

  it('nulls the invite for an already-joined member', async () => {
    mockStaffFindMany.mockResolvedValue([
      {
        id: 'staff_1',
        retailer_id: RETAILER_ID,
        auth_user_id: 'auth_1',
        name: 'Ramesh',
        phone: '9876543210',
        role: 'salesperson',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        staff_invites: [],
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/staff' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].invite).toBeNull();
    await app.close();
  });
});
