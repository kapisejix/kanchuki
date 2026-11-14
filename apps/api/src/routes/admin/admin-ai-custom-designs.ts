// Admin view of the paid AI custom-prompt designs (T5 gap: "admin screen for prompts and usage").
// Read-only: no write route, no retailer phone or other PII — shop name, product name, the
// retailer's SANITISED prompt, status and a generic error. Admin + Super Admin only (ADMIN_TIER).
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

const querySchema = z.object({
  status: z.enum(['PENDING', 'READY', 'FAILED']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const STATS_DAYS = 30;

export const adminAiCustomDesignRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  server.get('/ai-custom-designs', async (request) => {
    const q = querySchema.safeParse(request.query);
    if (!q.success) throw validationError('Invalid filter');
    const since = new Date(Date.now() - STATS_DAYS * 24 * 60 * 60 * 1000);

    const [rows, grouped] = await Promise.all([
      prisma.aiCustomDesign.findMany({
        where: q.data.status ? { status: q.data.status } : {},
        orderBy: { created_at: 'desc' },
        take: q.data.limit,
        select: {
          id: true,
          prompt: true,
          status: true,
          error: true,
          image_url: true,
          created_at: true,
          retailer: { select: { id: true, shop_name: true, city: true } },
          product: { select: { name: true } },
        },
      }),
      prisma.aiCustomDesign.groupBy({
        by: ['status'],
        where: { created_at: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    const count = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
    return {
      data: rows,
      stats: {
        days: STATS_DAYS,
        ready: count('READY'),
        failed: count('FAILED'),
        pending: count('PENDING'),
        total: grouped.reduce((n, g) => n + g._count._all, 0),
      },
    };
  });
};
