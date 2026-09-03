// Admin bug reports — list, review, and resolve retailer-submitted bug reports.
// GET /admin/bug-reports — paginated list with filters
// PATCH /admin/bug-reports/:id — update status / add admin note
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';

const BugReportUpdateSchema = z.object({
  status: z.enum(['NEW', 'REVIEWED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED']).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  admin_note: z.string().max(2000).optional(),
});

export const adminBugReportRoutes: FastifyPluginAsync = async (server) => {
  // ── GET /admin/bug-reports ──────────────────────────────────────
  // List bug reports. Supports filtering by status, severity, and retailer.
  server.get('/bug-reports', async (request) => {
    const query = z
      .object({
        status: z.enum(['NEW', 'REVIEWED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED']).optional(),
        severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
        retailer_id: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional().default(50),
        offset: z.coerce.number().int().min(0).optional().default(0),
      })
      .safeParse(request.query);

    const where: Record<string, unknown> = {};
    if (query.success) {
      if (query.data.status) where.status = query.data.status;
      if (query.data.severity) where.severity = query.data.severity;
      if (query.data.retailer_id) where.retailer_id = query.data.retailer_id;
    }

    const limit = query.success ? query.data.limit : 50;
    const offset = query.success ? query.data.offset : 0;

    const [reports, total] = await Promise.all([
      prisma.bugReport.findMany({
        where,
        select: {
          id: true,
          retailer_id: true,
          description: true,
          severity: true,
          status: true,
          app_version: true,
          os_version: true,
          device_model: true,
          screen_name: true,
          last_screen: true,
          error_message: true,
          screenshot_url: true,
          notes: true,
          admin_note: true,
          resolved_by_id: true,
          created_at: true,
          updated_at: true,
          resolved_at: true,
          retailer: {
            select: { id: true, shop_name: true, city: true, phone: true },
          },
        },
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.bugReport.count({ where }),
    ]);

    return { data: reports, total, limit, offset };
  });

  // ── GET /admin/bug-reports/stats ────────────────────────────────
  // Aggregate counts for the admin dashboard.
  server.get('/bug-reports/stats', async () => {
    const [newCount, reviewedCount, inProgressCount, resolvedCount, dismissedCount, total] =
      await Promise.all([
        prisma.bugReport.count({ where: { status: 'NEW' } }),
        prisma.bugReport.count({ where: { status: 'REVIEWED' } }),
        prisma.bugReport.count({ where: { status: 'IN_PROGRESS' } }),
        prisma.bugReport.count({ where: { status: 'RESOLVED' } }),
        prisma.bugReport.count({ where: { status: 'DISMISSED' } }),
        prisma.bugReport.count(),
      ]);

    return {
      data: {
        new: newCount,
        reviewed: reviewedCount,
        in_progress: inProgressCount,
        resolved: resolvedCount,
        dismissed: dismissedCount,
        total,
      },
    };
  });

  // ── PATCH /admin/bug-reports/:id ────────────────────────────────
  // Update a bug report's status, severity, or admin note.
  server.patch<{ Params: { id: string } }>('/bug-reports/:id', async (request) => {
    const existing = await prisma.bugReport.findUnique({
      where: { id: request.params.id },
      select: { id: true },
    });
    if (!existing) throw notFound('Bug report');

    const body = BugReportUpdateSchema.safeParse(request.body);
    if (!body.success) {
      throw validationError(body.error.issues[0]?.message ?? 'Invalid update');
    }

    const update: Record<string, unknown> = {};
    if (body.data.status !== undefined) {
      update.status = body.data.status;
      if (body.data.status === 'RESOLVED') {
        update.resolved_at = new Date();
      }
    }
    if (body.data.severity !== undefined) update.severity = body.data.severity;
    if (body.data.admin_note !== undefined) update.admin_note = body.data.admin_note;

    const report = await prisma.bugReport.update({
      where: { id: request.params.id },
      data: update,
      select: {
        id: true,
        status: true,
        severity: true,
        admin_note: true,
        updated_at: true,
      },
    });

    return { data: report };
  });
};
