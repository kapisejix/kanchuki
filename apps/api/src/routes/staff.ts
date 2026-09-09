import { getPurgePrisma, prisma } from '@kanchuki/db';
import { isValidIndianPhone, normalizeIndianPhone } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  buildStaffInviteUrl,
  generateStaffInviteToken,
  staffInviteExpiry,
} from '../lib/staff-invite.js';
import {
  AppError,
  notFound,
  planLimitExceeded,
  validationError,
} from '../plugins/error-handler.js';

// FR-1.3 (docs/tasks/team-member-access-control.md): 'owner' is a valid DB
// value only for internal/seed use — a retailer caller can never grant it.
// Rejected here (and in the update schema) so the API's error message is the
// same plain-language one the role picker can rely on.
const ASSIGNABLE_ROLES = ['manager', 'salesperson'] as const;
const StaffRoleError = 'Role must be manager or salesperson';

const StaffSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z
    .string()
    .min(10)
    .max(15)
    .refine((v) => isValidIndianPhone(v), 'Enter a valid 10-digit Indian mobile number'),
  role: z.enum(['owner', 'manager', 'salesperson']).default('salesperson'),
});

// PUT accepts name/phone/role/is_active — role limited to manager|salesperson
// (zod rejects 'owner' with a 422 before the route body runs).
const StaffUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z
    .string()
    .min(10)
    .max(15)
    .refine((v) => isValidIndianPhone(v), 'Enter a valid 10-digit Indian mobile number')
    .optional(),
  role: z.enum(ASSIGNABLE_ROLES).optional(),
  is_active: z.boolean().optional(),
});

function assertAssignableRole(
  role?: string | null,
): asserts role is 'manager' | 'salesperson' | undefined {
  if (role === undefined || role === null) return;
  if (role !== 'manager' && role !== 'salesperson') {
    throw validationError(StaffRoleError, 'role');
  }
}

export const staffRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /staff ──────────────────────────────────────────────────
  // Invite status rides along for the lifecycle UI (staff-invite-tokens.md
  // §6.3): the member row carries auth_user_id (null = never logged in) plus
  // the live invite's derived status + expiry so the app can render
  // "Invite sent · expires …" / "Invite expired · Resend" chips. Used/
  // revoked rows are inert — only pending matters (expired is derived from
  // pending + past expiry).
  server.get('/', async (request) => {
    const staff = await prisma.staff.findMany({
      where: { retailer_id: request.retailerId },
      orderBy: { created_at: 'asc' },
      include: { staff_invites: true },
    });
    const now = Date.now();
    return {
      data: staff.map((row) => {
        const invite = row.staff_invites[0];
        const inviteStatus =
          invite && invite.status === 'pending' && invite.expires_at.getTime() < now
            ? 'expired'
            : (invite?.status ?? null);
        return {
          id: row.id,
          retailer_id: row.retailer_id,
          auth_user_id: row.auth_user_id,
          name: row.name,
          phone: row.phone,
          role: row.role,
          is_active: row.is_active,
          created_at: row.created_at,
          updated_at: row.updated_at,
          invite:
            invite && inviteStatus
              ? { status: inviteStatus, expires_at: invite.expires_at.toISOString() }
              : null,
        };
      }),
    };
  });

  // ─── POST /staff ─────────────────────────────────────────────────
  // Seats: 3 free (Retailer.max_staff_seats), no purchase flow yet —
  // request beyond the limit is blocked with an upgrade error.
  // FR-4.3: adding a phone that already has a (deactivated) staff row for
  // this retailer reactivates that row instead of creating a duplicate —
  // enforced by the @@unique([retailer_id, phone]) constraint + the explicit
  // findFirst below (which is what keeps the seat count honest).
  server.post('/', async (request, reply) => {
    const retailerId = request.retailerId;

    const body = StaffSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    // FR-1.3: reject a retailer attempting to create an owner row.
    assertAssignableRole(body.data.role);

    const retailer = await prisma.retailer.findUniqueOrThrow({
      where: { id: retailerId },
      select: { max_staff_seats: true },
    });
    const activeCount = await prisma.staff.count({
      where: { retailer_id: retailerId, is_active: true },
    });
    if (activeCount >= retailer.max_staff_seats) throw planLimitExceeded('staff seats');

    const normalizedPhone = normalizeIndianPhone(body.data.phone);

    // Re-add path: an inactive row for this (retailer_id, phone) is
    // reactivated (name/role refreshed) rather than duplicated.
    const existing = await prisma.staff.findFirst({
      where: { retailer_id: retailerId, phone: normalizedPhone },
    });
    if (existing?.is_active)
      throw validationError('A staff member with this phone number already exists', 'phone');

    // A Staff row with someone else's phone silently hijacks their future
    // login (auth.ts checks Staff before creating a new Retailer) — block it
    // at the one point it's actually preventable: a phone already tied to a
    // real retailer account can never be added as staff here.
    const retailerWithPhone = await prisma.retailer.findFirst({
      where: { phone: normalizedPhone, deleted_at: null },
      select: { id: true },
    });
    if (retailerWithPhone)
      throw validationError(
        'This phone number is already registered as a retailer account',
        'phone',
      );

    // Tokenized invite (staff-invite-tokens.md): minted in the SAME
    // transaction as the staff write so the response can carry a working
    // link and a crash can't leave a staff row without its invite. A member
    // who already joined once (auth_user_id set) needs no invite — they just
    // log in with their phone. A member added but never logged in gets a
    // fresh invite (replace the row — staff_id is unique, D5).
    const invite = generateStaffInviteToken();
    const expiresAt = staffInviteExpiry();

    const staff = await prisma.$transaction(async (tx) => {
      let row: { id: string; role: string; name: string; auth_user_id: string | null };
      if (existing) {
        // FR-4.3 reactivate — same row comes back, seat freed by the
        // deactivation already counted.
        row = await tx.staff.update({
          where: { id: existing.id },
          data: { is_active: true, name: body.data.name, role: body.data.role },
        });
      } else {
        row = await tx.staff.create({
          data: { retailer_id: retailerId, ...body.data, phone: normalizedPhone },
        });
      }

      if (!row.auth_user_id) {
        await tx.staffInvite.upsert({
          where: { staff_id: row.id },
          create: {
            staff_id: row.id,
            retailer_id: retailerId,
            token_hash: invite.tokenHash,
            role_snapshot: row.role,
            status: 'pending',
            expires_at: expiresAt,
          },
          update: {
            token_hash: invite.tokenHash,
            role_snapshot: row.role,
            status: 'pending',
            expires_at: expiresAt,
            accepted_at: null,
          },
        });
      }

      return row;
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: existing ? 'reactivate' : 'create',
        resource_type: 'Staff',
        resource_id: staff.id,
        metadata: { name: staff.name, role: staff.role },
        ip_address: request.ip,
      },
    });

    // Tokenized invite (staff-invite-tokens.md §5.1): the response carries
    // the shareable link so the retailer can send it to the member. Present
    // only when an invite was actually minted (member never logged in).
    const data: Record<string, unknown> = { ...staff };
    if (!staff.auth_user_id) {
      data.invite = {
        url: buildStaffInviteUrl(invite.raw),
        expires_at: expiresAt.toISOString(),
      };
    }

    return reply.status(201).send({ data });
  });

  // ─── POST /staff/:id/invite/resend ──────────────────────────────
  // staff-invite-tokens.md §5.2 — mint a fresh token for a member who never
  // joined (D5: replace on the same row; staff_id is unique). Owner-only by
  // default (/v1/staff is not on the staffCanAccess allowlist). Already-joined
  // members (auth_user_id set) just log in — no re-invite, 409.
  server.post('/:id/invite/resend', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.staff.findFirst({
      where: { id, retailer_id: request.retailerId },
    });
    if (!existing) throw notFound('Staff');
    if (!existing.is_active)
      throw validationError('Reactivate the team member before inviting', 'id');
    if (existing.auth_user_id)
      throw new AppError(
        'ALREADY_JOINED',
        'This member has already joined — they can log in with their phone.',
        409,
      );

    const invite = generateStaffInviteToken();
    const expiresAt = staffInviteExpiry();

    // staff_id is unique (D5): upsert replaces the old token. accepted_at is
    // cleared in case a previous link was somehow used-then-reset.
    await prisma.staffInvite.upsert({
      where: { staff_id: id },
      create: {
        staff_id: id,
        retailer_id: request.retailerId,
        token_hash: invite.tokenHash,
        role_snapshot: existing.role,
        status: 'pending',
        expires_at: expiresAt,
      },
      update: {
        token_hash: invite.tokenHash,
        role_snapshot: existing.role,
        status: 'pending',
        expires_at: expiresAt,
        accepted_at: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'staff_invite_resend',
        resource_type: 'Staff',
        resource_id: id,
        metadata: { name: existing.name },
        ip_address: request.ip,
      },
    });

    return reply.status(200).send({
      data: {
        invite: {
          url: buildStaffInviteUrl(invite.raw),
          expires_at: expiresAt.toISOString(),
        },
      },
    });
  });

  // ─── PUT /staff/:id ──────────────────────────────────────────────
  // FR-1.2: role is editable; takes effect on the member's next request
  // (the allowlist is checked per-request). FR-4.2: restore (is_active:true)
  // is the same endpoint, seat-checked like a fresh add.
  server.put('/:id', async (request) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.staff.findFirst({
      where: { id, retailer_id: request.retailerId },
    });
    if (!existing) throw notFound('Staff');

    const body = StaffUpdateSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    let data = body.data;
    if (body.data.phone) {
      const normalizedPhone = normalizeIndianPhone(body.data.phone);
      const retailerWithPhone = await prisma.retailer.findFirst({
        where: { phone: normalizedPhone, deleted_at: null },
        select: { id: true },
      });
      if (retailerWithPhone)
        throw validationError(
          'This phone number is already registered as a retailer account',
          'phone',
        );
      data = { ...body.data, phone: normalizedPhone };
    }

    // Restoring an inactive member consumes a seat like a fresh add.
    if (body.data.is_active === true && !existing.is_active) {
      const retailer = await prisma.retailer.findUniqueOrThrow({
        where: { id: request.retailerId },
        select: { max_staff_seats: true },
      });
      const activeCount = await prisma.staff.count({
        where: { retailer_id: request.retailerId, is_active: true },
      });
      if (activeCount >= retailer.max_staff_seats) throw planLimitExceeded('staff seats');
    }

    const updated = await prisma.staff.update({ where: { id }, data });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action:
          body.data.is_active === true && !existing.is_active
            ? 'restore'
            : body.data.is_active === false && existing.is_active
              ? 'delete'
              : 'update',
        resource_type: 'Staff',
        resource_id: id,
        metadata: { name: updated.name, updated_fields: Object.keys(body.data) },
        ip_address: request.ip,
      },
    });

    return { data: updated };
  });

  // ─── DELETE /staff/:id ───────────────────────────────────────────
  // Default: soft-remove (is_active = false) — frees the seat without
  // deleting history/audit trail (FR-4.1). ?purge=true is the explicit DPDP
  // erasure path (FR-4.4): hard-deletes the row AFTER writing an audit entry
  // with the erased name/phone, and is blocked while the member is still
  // active. Hard delete uses the scoped purge role + the F-017
  // app.allow_hard_delete session flag (same pattern as categories/products
  // hard deletes).
  server.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { purge } = request.query as { purge?: string };

    const existing = await prisma.staff.findFirst({
      where: { id, retailer_id: request.retailerId },
    });
    if (!existing) throw notFound('Staff');

    if (purge === 'true') {
      if (existing.is_active)
        throw validationError('Deactivate the team member before deleting permanently', 'purge');

      // Audit the erasure itself first — the auditLog row must survive even
      // though the staff row (and its name/phone) is gone.
      await prisma.auditLog.create({
        data: {
          actor_type: 'retailer',
          actor_id: request.retailerId,
          action: 'purge',
          resource_type: 'Staff',
          resource_id: id,
          metadata: { name: existing.name, phone: existing.phone, role: existing.role },
          ip_address: request.ip,
        },
      });

      const purgeDb = getPurgePrisma();
      await purgeDb.$transaction([
        purgeDb.$executeRawUnsafe(`SET app.allow_hard_delete = 'true';`),
        purgeDb.staff.delete({ where: { id } }),
      ]);

      return reply.status(204).send();
    }

    await prisma.staff.update({ where: { id }, data: { is_active: false } });

    // Tokenized invite: a deactivated member's pending invite is revoked so
    // an open link stops working immediately (§5.6). Used/expired rows are
    // left untouched — they're inert either way.
    await prisma.staffInvite.updateMany({
      where: { staff_id: id, status: 'pending' },
      data: { status: 'revoked' },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'delete',
        resource_type: 'Staff',
        resource_id: id,
        metadata: { name: existing.name, role: existing.role },
        ip_address: request.ip,
      },
    });

    return reply.status(204).send();
  });
};
