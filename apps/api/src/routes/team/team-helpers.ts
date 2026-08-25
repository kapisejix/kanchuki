// Shared team-route helpers extracted from team.ts (scripts/check-route-size.sh
// split). Route modules import from here.
import { type TeamRole, prisma } from '@kanchuki/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { forbidden } from '../../plugins/error-handler.js';
import { verifyTeamToken } from '../../plugins/team-auth.js';
import { validAdminKey, verifyAdminSession } from '../admin.js';

declare module 'fastify' {
  interface FastifyRequest {
    teamMember?: {
      id: string;
      role: TeamRole;
      territoryIds: string[]; // empty + isSuperAdmin true means "unscoped, sees all"
      isSuperAdmin: boolean;
    };
  }
}

export const MANAGER_ROLES: TeamRole[] = ['MARKETING_MANAGER', 'SUPPORT_MANAGER'];
export const AGENT_ROLES_BY_MANAGER: Record<string, TeamRole> = {
  MARKETING_MANAGER: 'MARKETING_AGENT',
  SUPPORT_MANAGER: 'SUPPORT_AGENT',
};

export function requireRole(request: FastifyRequest, allowed: TeamRole[]): void {
  const tm = request.teamMember;
  if (!tm) throw forbidden('Not authenticated');
  if (tm.isSuperAdmin) return;
  if (!allowed.includes(tm.role)) throw forbidden('Insufficient role for this action');
}

// F-018: short code a retailer can type at self-serve signup. Auto-generated
// for marketing agents so every agent has one without a manual admin step.
export function generateReferralCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/** Territory is auto-derived from a ZONE-level territory whose pincodes list contains this pincode. */
export async function deriveTerritoryFromPincode(
  pincode: string | undefined,
): Promise<string | null> {
  if (!pincode) return null;
  const zone = await prisma.territory.findFirst({
    where: { level: 'ZONE', pincodes: { has: pincode } },
    select: { id: true },
  });
  return zone?.id ?? null;
}

// Shared preHandler — auth applies to every /v1/team route except /login.
// Extracted so each domain module can independently register it (matches the
// admin.ts/admin/*.ts split convention: adminAuthPreHandler re-added per module).
export async function teamAuthPreHandler(request: FastifyRequest, reply: FastifyReply) {
  const publicTeamPaths = [
    '/v1/team/login',
    '/v1/team/otp/send',
    '/v1/team/otp/verify',
    '/v1/team/forgot-password',
    '/v1/team/reset-password',
  ];
  if (publicTeamPaths.some((p) => request.url.startsWith(p))) return;

  // Bootstrap: the existing shared admin key acts as an unscoped Super Admin,
  // since team_members starts empty and needs a way to create the first one.
  const adminKey = request.headers['x-admin-key'] as string | undefined;
  if (adminKey && (validAdminKey(adminKey) || (await verifyAdminSession(adminKey)))) {
    request.teamMember = {
      id: 'admin-key',
      role: 'SUPER_ADMIN',
      territoryIds: [],
      isSuperAdmin: true,
    };
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply
      .status(401)
      .send({ error: { code: 'UNAUTHORIZED', message: 'Missing Bearer token', status: 401 } });
  }

  const claims = await verifyTeamToken(authHeader.slice(7));
  if (!claims) {
    return reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token', status: 401 },
    });
  }

  const member = await prisma.teamMember.findUnique({
    where: { id: claims.sub },
    select: { id: true, role: true, is_active: true },
  });
  if (!member || !member.is_active) {
    return reply.status(403).send({
      error: { code: 'FORBIDDEN', message: 'Account inactive or removed', status: 403 },
    });
  }

  const isSuperAdmin = member.role === 'SUPER_ADMIN';
  let territoryIds: string[] = [];
  if (!isSuperAdmin) {
    const rows = await prisma.teamMemberTerritory.findMany({
      where: { team_member_id: member.id },
      select: { territory_id: true },
    });
    territoryIds = rows.map((r) => r.territory_id);
  }

  request.teamMember = { id: member.id, role: member.role, territoryIds, isSuperAdmin };
}
