import { prisma } from '@kanchuki/db';
// Admin view of the retailer discovery survey (POST /team/survey, staff-only
// → AuditLog resource_type 'RetailerSurvey'). Same shape as
// admin-contact.ts — the list already returns full metadata, so the grid's
// row-click detail view is rendered client-side from the same payload (no
// second endpoint). actor_id (the submitting TeamMember) is resolved to a
// name here so admins see who filed each survey.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { adminAuthPreHandler } from '../admin-auth.js';

export interface SurveySubmission {
  id: string;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
  submitted_by: string | null;
}

export const adminSurveyRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/survey-submissions ──────────────────────────────
  // Newest-first list, cursor-paginated (same shape as /admin/contact-submissions).
  server.get('/survey-submissions', async (request) => {
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .safeParse(request.query);

    const { cursor, limit } = query.success ? query.data : { cursor: undefined, limit: 50 };

    const where: Record<string, unknown> = { resource_type: 'RetailerSurvey' };
    if (cursor) where.id = { lt: cursor };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { created_at: 'desc' }, take: limit + 1 }),
      prisma.auditLog.count({ where }),
    ]);

    const hasMore = logs.length > limit;
    const page = hasMore ? logs.slice(0, limit) : logs;

    const memberIds = [...new Set(page.map((e) => e.actor_id).filter((id): id is string => !!id))];
    const members = memberIds.length
      ? await prisma.teamMember.findMany({
          where: { id: { in: memberIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(members.map((m) => [m.id, m.name]));

    const data: SurveySubmission[] = page.map((entry) => ({
      id: entry.id,
      metadata: (entry.metadata ?? {}) as Record<string, unknown>,
      ip_address: entry.ip_address,
      created_at: entry.created_at.toISOString(),
      submitted_by: entry.actor_id ? (nameById.get(entry.actor_id) ?? entry.actor_id) : null,
    }));

    return {
      data,
      pagination: {
        cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        has_more: hasMore,
        total,
      },
    };
  });
};
