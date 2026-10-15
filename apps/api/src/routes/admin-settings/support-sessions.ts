// Admin side of Kanchuki-staff support sessions
// (docs/tasks/pending/support-session-access.md §7–8): the sessions list, a
// per-session kill, and the global SUPPORT_SESSIONS switch (default OFF).
// `support-sessions` is a Super-Admin-only segment (packages/shared admin-access).
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  SUPPORT_SESSIONS_SETTING_KEY,
  clearSupportSessionsFlagCache,
  supportSessionsEnabled,
} from '../../lib/support-sessions-flag.js';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin.js';
import { transitionGrant } from '../team/team-support-sessions.js';
import { saveSetting } from './settings-store.js';

const EnabledSchema = z.object({ enabled: z.boolean() });

export const adminSupportSessionsRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  server.get('/support-sessions', async () => {
    const rows = await prisma.supportSessionGrant.findMany({
      orderBy: { requested_at: 'desc' },
      take: 100,
      select: {
        id: true,
        scope: true,
        status: true,
        requested_at: true,
        decided_at: true,
        expires_at: true,
        revoked_at: true,
        revoked_by: true,
        retailer: { select: { id: true, shop_name: true } },
        team_member: { select: { id: true, name: true } },
      },
    });
    return { data: { enabled: await supportSessionsEnabled(), sessions: rows } };
  });

  server.put('/support-sessions/enabled', async (request) => {
    const body = EnabledSchema.safeParse(request.body);
    if (!body.success) throw validationError('enabled must be true or false');
    await saveSetting(SUPPORT_SESSIONS_SETTING_KEY, { enabled: body.data.enabled });
    clearSupportSessionsFlagCache();
    request.log.info({ enabled: body.data.enabled }, 'Support sessions switch updated');
    return { data: { enabled: body.data.enabled } };
  });

  server.post<{ Params: { id: string } }>('/support-sessions/:id/revoke', async (request) => {
    const ended = await transitionGrant({
      id: request.params.id,
      from: ['PENDING', 'APPROVED'],
      to: 'REVOKED',
      revoked_by: 'ADMIN',
    });
    if (!ended) {
      const exists = await prisma.supportSessionGrant.findUnique({
        where: { id: request.params.id },
        select: { id: true },
      });
      if (!exists) throw notFound('Support session');
      throw validationError('This support session has already ended');
    }
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'revoke_support_session',
        resource_type: 'SupportSessionGrant',
        resource_id: request.params.id,
        metadata: { retailer_id: ended.retailer_id, team_member_id: ended.team_member_id },
        ip_address: request.ip,
      },
    });
    return { data: { status: 'REVOKED' } };
  });
};
