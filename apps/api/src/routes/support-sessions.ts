// Support sessions, retailer side (docs/tasks/pending/support-session-access.md).
// The retailer owner answers an in-app prompt and can revoke at any time.
// Owner only: authPlugin's deny-by-default already blocks staff + delegate
// tokens on this path; isRealOwner() below is the explicit backstop.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { isRealOwner } from '../plugins/auth.js';
import { forbidden, notFound, validationError } from '../plugins/error-handler.js';
import { SUPPORT_PENDING_TTL_MS, transitionGrant } from './team/team-support-sessions.js';

export const supportSessionRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', async (request) => {
    if (!isRealOwner(request))
      throw forbidden('Only the account owner can manage support sessions');
  });

  // ── GET /v1/support-sessions ────────────────────────────────────
  // Pending prompts + live sessions. Drives the approve prompt and the
  // "Active support session" row with Revoke.
  server.get('/', async (request) => {
    const now = new Date();
    const rows = await prisma.supportSessionGrant.findMany({
      where: {
        retailer_id: request.retailerId,
        OR: [
          {
            status: 'PENDING',
            requested_at: { gt: new Date(now.getTime() - SUPPORT_PENDING_TTL_MS) },
          },
          { status: 'APPROVED', expires_at: { gt: now } },
        ],
      },
      orderBy: { requested_at: 'desc' },
      select: {
        id: true,
        scope: true,
        status: true,
        requested_at: true,
        expires_at: true,
        team_member: { select: { name: true } },
      },
    });
    return {
      data: rows.map(({ team_member, ...g }) => ({ ...g, staff_name: team_member.name })),
    };
  });

  async function decide(
    request: { retailerId: string; ip: string; params: unknown },
    to: 'APPROVED' | 'DENIED' | 'REVOKED',
  ) {
    const id = (request.params as { id: string }).id;
    const done = await transitionGrant({
      id,
      retailer_id: request.retailerId,
      from: to === 'REVOKED' ? ['PENDING', 'APPROVED'] : ['PENDING'],
      to,
      revoked_by: 'RETAILER',
      fresh: to !== 'REVOKED',
    });
    if (!done) {
      const exists = await prisma.supportSessionGrant.findFirst({
        where: { id, retailer_id: request.retailerId },
        select: { id: true },
      });
      if (!exists) throw notFound('Support session');
      throw validationError('This request has expired or was already answered');
    }
    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: `${to.toLowerCase()}_support_session`,
        resource_type: 'SupportSessionGrant',
        resource_id: id,
        metadata: { team_member_id: done.team_member_id, ticket_id: done.ticket_id },
        ip_address: request.ip,
      },
    });
    return { data: { status: to, expires_at: done.expires_at } };
  }

  server.post<{ Params: { id: string } }>('/:id/approve', (request) => decide(request, 'APPROVED'));
  server.post<{ Params: { id: string } }>('/:id/deny', (request) => decide(request, 'DENIED'));
  server.post<{ Params: { id: string } }>('/:id/revoke', (request) => decide(request, 'REVOKED'));
};
