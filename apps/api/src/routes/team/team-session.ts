// Auto-split from team.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { forbidden, notFound, validationError } from '../../plugins/error-handler.js';
import { signTeamToken, verifyPassword } from '../../plugins/team-auth.js';
import { teamAuthPreHandler } from './team-helpers.js';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

export const teamSessionRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', teamAuthPreHandler);

  // ─── POST /team/login ────────────────────────────────────────────
  server.post('/login', async (request) => {
    const body = LoginSchema.safeParse(request.body);
    if (!body.success)
      throw validationError(body.error.issues[0]?.message ?? 'Invalid credentials');

    const member = await prisma.teamMember.findUnique({
      where: { email: body.data.email.toLowerCase() },
    });
    if (!member || !member.is_active || !verifyPassword(body.data.password, member.password_hash)) {
      throw forbidden('Invalid credentials');
    }

    const token = await signTeamToken({ sub: member.id, role: member.role });
    return {
      data: {
        token,
        team_member: { id: member.id, name: member.name, email: member.email, role: member.role },
      },
    };
  });

  // ─── GET /team/me ────────────────────────────────────────────────
  server.get('/me', async (request) => {
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');
    if (tm.id === 'admin-key') {
      return { data: { id: 'admin-key', name: 'Admin', role: 'SUPER_ADMIN', territories: [] } };
    }
    const member = await prisma.teamMember.findUnique({
      where: { id: tm.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        max_retailers: true,
        referral_code: true,
      },
    });
    if (!member) throw notFound('Team member');
    const territories = await prisma.territory.findMany({
      where: { id: { in: tm.territoryIds } },
      select: { id: true, name: true, level: true },
    });
    return { data: { ...member, territories } };
  });
};
