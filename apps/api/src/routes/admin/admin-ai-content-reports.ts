// Admin queue for shopper "Report this AI content" reports (Google Play AI-Generated Content
// policy). Written by POST /v1/public/passport/ai-report. Registered inside adminRoutes, so it
// inherits that plugin's auth hook (the route-guard test enumerates it).
// GET   /admin/ai-content-reports        — paginated list, filter by status / feature
// GET   /admin/ai-content-reports/stats  — counts for the page header
// PATCH /admin/ai-content-reports/:id    — mark NEW / REVIEWED
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { maskPhone } from '../public/passport/passport-helpers.js';

const STATUSES = ['NEW', 'REVIEWED'] as const;

export const adminAiContentReportRoutes: FastifyPluginAsync = async (server) => {
  server.get('/ai-content-reports', async (request) => {
    const query = z
      .object({
        status: z.enum(STATUSES).optional(),
        feature: z.string().max(100).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional().default(50),
        offset: z.coerce.number().int().min(0).optional().default(0),
      })
      .safeParse(request.query);
    const q = query.success ? query.data : { limit: 50, offset: 0 };

    const where: { status?: string; feature?: string } = {};
    if ('status' in q && q.status) where.status = q.status;
    if ('feature' in q && q.feature) where.feature = q.feature;

    const [rows, total] = await Promise.all([
      prisma.aiContentReport.findMany({
        where,
        select: {
          id: true,
          feature: true,
          content_ref: true,
          description: true,
          status: true,
          created_at: true,
          customer_account: { select: { name: true, phone: true } },
        },
        orderBy: { created_at: 'desc' },
        take: q.limit,
        skip: q.offset,
      }),
      prisma.aiContentReport.count({ where }),
    ]);

    // Phone is masked: moderation needs "is this a signed-in shopper", not their number.
    const data = rows.map(({ customer_account, ...r }) => ({
      ...r,
      reporter: customer_account
        ? { name: customer_account.name, phone: maskPhone(customer_account.phone) }
        : null,
    }));
    return { data, total, limit: q.limit, offset: q.offset };
  });

  server.get('/ai-content-reports/stats', async () => {
    const [newCount, reviewedCount, total] = await Promise.all([
      prisma.aiContentReport.count({ where: { status: 'NEW' } }),
      prisma.aiContentReport.count({ where: { status: 'REVIEWED' } }),
      prisma.aiContentReport.count(),
    ]);
    return { data: { new: newCount, reviewed: reviewedCount, total } };
  });

  server.patch<{ Params: { id: string } }>('/ai-content-reports/:id', async (request) => {
    const body = z.object({ status: z.enum(STATUSES) }).safeParse(request.body);
    if (!body.success) throw validationError('status must be NEW or REVIEWED');

    const existing = await prisma.aiContentReport.findUnique({
      where: { id: request.params.id },
      select: { id: true },
    });
    if (!existing) throw notFound('AI content report');

    const report = await prisma.aiContentReport.update({
      where: { id: request.params.id },
      data: { status: body.data.status },
      select: { id: true, status: true },
    });
    return { data: report };
  });
};
