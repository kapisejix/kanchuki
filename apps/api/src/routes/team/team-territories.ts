// Auto-split from team.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { requireRole, teamAuthPreHandler } from './team-helpers.js';

const TerritorySchema = z.object({
  name: z.string().min(1).max(100),
  level: z.enum(['STATE', 'CITY', 'ZONE']),
  parent_id: z.string().optional(),
  pincodes: z.array(z.string().max(10)).max(500).optional(),
});

export const teamTerritoriesRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', teamAuthPreHandler);

  // ─── Territories ─────────────────────────────────────────────────
  server.post('/territories', async (request) => {
    requireRole(request, []);
    const body = TerritorySchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid territory');

    const territory = await prisma.territory.create({
      data: {
        name: body.data.name,
        level: body.data.level,
        parent_id: body.data.parent_id,
        pincodes: body.data.pincodes ?? [],
      },
    });
    return { data: territory };
  });

  server.get('/territories', async () => {
    const territories = await prisma.territory.findMany({ orderBy: { name: 'asc' } });
    return { data: territories };
  });

  server.patch<{ Params: { id: string } }>('/territories/:id', async (request) => {
    requireRole(request, []);
    const body = TerritorySchema.partial().safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid territory');

    const territory = await prisma.territory
      .update({ where: { id: request.params.id }, data: body.data })
      .catch(() => null);
    if (!territory) throw notFound('Territory');
    return { data: territory };
  });
};
