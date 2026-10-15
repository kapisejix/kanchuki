// Support sessions, staff side (docs/tasks/pending/support-session-access.md).
// Kanchuki manager asks → retailer approves in-app (routes/support-sessions.ts)
// → manager mints a ≤24h scoped token. No OTP; no extension (a new session
// needs a new request + approval).
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supportSessionsEnabled } from '../../lib/support-sessions-flag.js';
import { forbidden, notFound, validationError } from '../../plugins/error-handler.js';
import { signSupportToken } from '../../plugins/team-auth.js';
import { MANAGER_ROLES, requireRole, teamAuthPreHandler } from './team-helpers.js';

export const SUPPORT_PENDING_TTL_MS = 15 * 60 * 1000; // retailer must answer within 15 min
export const SUPPORT_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // hard cap, never extended

const TICKET_TYPE_BY_SCOPE = {
  DEMO: 'DEMO',
  GROWTH: 'GROWTH_SETUP',
  MAINTENANCE: 'MAINTENANCE',
} as const;

type OpenStatus = 'PENDING' | 'APPROVED';

/**
 * Atomic status transition. updateMany with a status guard so a double-tap or a
 * racing revoke/approve cannot both win. Returns null when nothing matched.
 * Anything but APPROVED also resolves the session's ticket.
 */
export async function transitionGrant(a: {
  id: string;
  retailer_id?: string;
  from: OpenStatus[];
  to: 'APPROVED' | 'DENIED' | 'REVOKED';
  revoked_by?: 'RETAILER' | 'STAFF' | 'ADMIN';
  /** PENDING decisions only: refuse a request older than the pending TTL. */
  fresh?: boolean;
}): Promise<{
  ticket_id: string;
  retailer_id: string;
  team_member_id: string;
  expires_at: Date | null;
} | null> {
  const now = new Date();
  const data =
    a.to === 'APPROVED'
      ? {
          status: a.to,
          decided_at: now,
          expires_at: new Date(now.getTime() + SUPPORT_SESSION_TTL_MS),
        }
      : a.to === 'DENIED'
        ? { status: a.to, decided_at: now }
        : { status: a.to, revoked_at: now, revoked_by: a.revoked_by ?? 'ADMIN' };

  const { count } = await prisma.supportSessionGrant.updateMany({
    where: {
      id: a.id,
      ...(a.retailer_id ? { retailer_id: a.retailer_id } : {}),
      status: { in: a.from },
      ...(a.fresh
        ? { requested_at: { gt: new Date(now.getTime() - SUPPORT_PENDING_TTL_MS) } }
        : {}),
    },
    data,
  });
  if (count === 0) return null;

  const grant = await prisma.supportSessionGrant.findUniqueOrThrow({
    where: { id: a.id },
    select: { ticket_id: true, retailer_id: true, team_member_id: true, expires_at: true },
  });
  if (a.to !== 'APPROVED') {
    await prisma.supportTicket.update({
      where: { id: grant.ticket_id },
      data: { status: 'RESOLVED', resolved_at: now },
    });
  }
  return grant;
}

export const teamSupportSessionsRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', teamAuthPreHandler);

  const StartSchema = z.object({
    retailer_id: z.string().min(1),
    scope: z.enum(['DEMO', 'GROWTH', 'MAINTENANCE']),
    note: z.string().max(2000).optional(),
  });

  async function requireEnabled() {
    if (!(await supportSessionsEnabled())) throw forbidden('Support sessions are not enabled');
  }

  // ── POST /team/support-sessions ─────────────────────────────────
  // Managers only. Creates the ticket (assigned to the caller) + a PENDING grant.
  server.post('/support-sessions', async (request) => {
    await requireEnabled();
    requireRole(request, MANAGER_ROLES);
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');

    const body = StartSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid request');

    const retailer = await prisma.retailer.findUnique({
      where: { id: body.data.retailer_id, deleted_at: null },
      select: { id: true, territory_id: true, is_suspended: true },
    });
    if (!retailer) throw notFound('Retailer');
    if (retailer.is_suspended) throw forbidden('This account is suspended');
    if (
      !tm.isSuperAdmin &&
      retailer.territory_id &&
      !tm.territoryIds.includes(retailer.territory_id)
    ) {
      throw forbidden('Retailer is outside your territory');
    }

    // One open prompt per retailer+staff — stops prompt-spamming a retailer.
    const open = await prisma.supportSessionGrant.findFirst({
      where: {
        retailer_id: retailer.id,
        team_member_id: tm.id,
        OR: [
          {
            status: 'PENDING',
            requested_at: { gt: new Date(Date.now() - SUPPORT_PENDING_TTL_MS) },
          },
          { status: 'APPROVED', expires_at: { gt: new Date() } },
        ],
      },
      select: { id: true },
    });
    if (open) throw validationError('A support session for this retailer is already open');

    const grant = await prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.create({
        data: {
          retailer_id: retailer.id,
          ticket_type: TICKET_TYPE_BY_SCOPE[body.data.scope],
          assigned_to_id: tm.id,
          status: 'ASSIGNED',
          note: body.data.note,
        },
        select: { id: true },
      });
      return tx.supportSessionGrant.create({
        data: {
          ticket_id: ticket.id,
          retailer_id: retailer.id,
          team_member_id: tm.id,
          scope: body.data.scope,
        },
        select: { id: true, ticket_id: true, scope: true, status: true },
      });
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'staff',
        actor_id: tm.id,
        action: 'request_support_session',
        resource_type: 'SupportSessionGrant',
        resource_id: grant.id,
        metadata: { retailer_id: retailer.id, scope: grant.scope, ticket_id: grant.ticket_id },
        ip_address: request.ip,
      },
    });

    return {
      data: {
        grant_id: grant.id,
        status: grant.status,
        scope: grant.scope,
        answer_within_seconds: SUPPORT_PENDING_TTL_MS / 1000,
      },
    };
  });

  // ── GET /team/support-sessions/:id ──────────────────────────────
  // Poll for the retailer's answer.
  server.get<{ Params: { id: string } }>('/support-sessions/:id', async (request) => {
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');
    const grant = await prisma.supportSessionGrant.findUnique({
      where: { id: request.params.id },
      select: {
        id: true,
        team_member_id: true,
        scope: true,
        status: true,
        requested_at: true,
        decided_at: true,
        expires_at: true,
        revoked_at: true,
      },
    });
    if (!grant || (!tm.isSuperAdmin && grant.team_member_id !== tm.id)) {
      throw notFound('Support session');
    }
    const { team_member_id: _omit, ...data } = grant;
    return { data };
  });

  // ── POST /team/support-sessions/:id/token ───────────────────────
  // Only the requesting staff member, only once APPROVED and unexpired.
  server.post<{ Params: { id: string } }>('/support-sessions/:id/token', async (request) => {
    await requireEnabled();
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');

    const grant = await prisma.supportSessionGrant.findUnique({
      where: { id: request.params.id },
      select: {
        id: true,
        ticket_id: true,
        retailer_id: true,
        team_member_id: true,
        scope: true,
        status: true,
        expires_at: true,
      },
    });
    if (!grant || grant.team_member_id !== tm.id) throw notFound('Support session');
    if (grant.status !== 'APPROVED' || !grant.expires_at || grant.expires_at <= new Date()) {
      throw forbidden('This support session is not approved or has ended');
    }

    const token = await signSupportToken(
      {
        retailer_id: grant.retailer_id,
        ticket_id: grant.ticket_id,
        team_member_id: grant.team_member_id,
        grant_id: grant.id,
        scope: grant.scope,
      },
      grant.expires_at,
    );

    await prisma.auditLog.create({
      data: {
        actor_type: 'staff',
        actor_id: tm.id,
        action: 'issue_support_session_token',
        resource_type: 'SupportSessionGrant',
        resource_id: grant.id,
        metadata: { retailer_id: grant.retailer_id, scope: grant.scope },
        ip_address: request.ip,
      },
    });

    return {
      data: {
        token,
        scope: grant.scope,
        expires_at: grant.expires_at.toISOString(),
        expires_in_seconds: Math.max(
          0,
          Math.floor((grant.expires_at.getTime() - Date.now()) / 1000),
        ),
      },
    };
  });

  // ── POST /team/support-sessions/:id/end ─────────────────────────
  server.post<{ Params: { id: string } }>('/support-sessions/:id/end', async (request) => {
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');

    const owned = await prisma.supportSessionGrant.findUnique({
      where: { id: request.params.id },
      select: { team_member_id: true },
    });
    if (!owned || (!tm.isSuperAdmin && owned.team_member_id !== tm.id)) {
      throw notFound('Support session');
    }

    const ended = await transitionGrant({
      id: request.params.id,
      from: ['PENDING', 'APPROVED'],
      to: 'REVOKED',
      revoked_by: owned.team_member_id === tm.id ? 'STAFF' : 'ADMIN',
    });
    if (!ended) throw validationError('This support session has already ended');

    await prisma.auditLog.create({
      data: {
        actor_type: 'staff',
        actor_id: tm.id,
        action: 'end_support_session',
        resource_type: 'SupportSessionGrant',
        resource_id: request.params.id,
        metadata: { retailer_id: ended.retailer_id },
        ip_address: request.ip,
      },
    });

    return { data: { status: 'REVOKED' } };
  });
};
