// Auto-split from admin-settings.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { adminAuthPreHandler } from '../admin.js';

export const adminTicketReportingRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  server.get('/reporting/tickets', async (request) => {
    const query = z
      .object({
        days: z.coerce.number().int().min(1).max(365).default(30),
      })
      .safeParse(request.query);

    const days = query.success ? query.data.days : 30;
    const since = new Date(Date.now() - days * 86400000);

    const [totalTickets, byStatus, byAgent, byDay, visitRequired] = await Promise.all([
      prisma.supportTicket.count({ where: { created_at: { gte: since } } }),
      prisma.supportTicket.groupBy({
        by: ['status'],
        where: { created_at: { gte: since } },
        _count: true,
      }),
      prisma.supportTicket.groupBy({
        by: ['assigned_to_id'],
        where: { created_at: { gte: since }, assigned_to_id: { not: null } },
        _count: true,
      }),
      // Group by day (approximate — use a raw query or handle in-memory)
      prisma.supportTicket.findMany({
        where: { created_at: { gte: since } },
        select: { created_at: true },
        orderBy: { created_at: 'asc' },
      }),
      prisma.supportTicket.count({
        where: { created_at: { gte: since }, requires_visit: true },
      }),
    ]);

    // Count by day
    const byDayMap = new Map<string, number>();
    for (const ticket of byDay) {
      const day = ticket.created_at.toISOString().slice(0, 10);
      byDayMap.set(day, (byDayMap.get(day) ?? 0) + 1);
    }

    // Resolve agent names
    const agentIds = byAgent.map((a) => a.assigned_to_id).filter(Boolean) as string[];
    const agents = agentIds.length
      ? await prisma.teamMember.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, name: true },
        })
      : [];
    const agentMap = new Map(agents.map((a) => [a.id, a.name]));

    return {
      data: {
        total: totalTickets,
        requires_visit: visitRequired,
        by_status: byStatus.map((s) => ({ status: s.status, count: s._count })),
        by_agent: byAgent.map((a) => ({
          agent_id: a.assigned_to_id,
          agent_name: agentMap.get(a.assigned_to_id ?? '') ?? 'Unknown',
          count: a._count,
        })),
        by_day: Array.from(byDayMap.entries()).map(([date, count]) => ({ date, count })),
        resolution_rate:
          totalTickets > 0
            ? Math.round(
                (((byStatus.find((s) => s.status === 'RESOLVED')?._count ?? 0) +
                  (byStatus.find((s) => s.status === 'CLOSED')?._count ?? 0)) /
                  totalTickets) *
                  100,
              )
            : 0,
      },
    };
  });
};
