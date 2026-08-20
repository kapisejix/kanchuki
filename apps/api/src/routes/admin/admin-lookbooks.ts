// Admin management for Lookbook Generator (Phase 6).
//
// Lookbooks are retailer-created curated product collections with styled layouts.
// Admin can view all lookbooks, monitor stats, manage status, and feature lookbooks.
//
// SECURITY: guarded by adminAuthPreHandler (admin key + CSRF).

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

const LookbookUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  format: z.enum(['CAROUSEL', 'GRID', 'EDITORIAL', 'PDF']).optional(),
  status: z.enum(['DRAFT', 'GENERATING', 'READY', 'FAILED']).optional(),
  cover_url: z.string().url().optional(),
  output_url: z.string().url().optional(),
  thumbnail_url: z.string().url().optional(),
  share_url: z.string().url().optional(),
  product_ids: z.array(z.string()).optional(),
});

export const adminLookbookRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/lookbooks ────────────────────────────────────────
  // All lookbooks across all retailers, newest first.
  server.get('/lookbooks', async (request) => {
    const q = z
      .object({
        retailer_id: z.string().optional(),
        status: z.enum(['DRAFT', 'GENERATING', 'READY', 'FAILED']).optional(),
        format: z.enum(['CAROUSEL', 'GRID', 'EDITORIAL', 'PDF']).optional(),
      })
      .safeParse(request.query);

    const where: Record<string, unknown> = {};
    if (q.success) {
      if (q.data.retailer_id) where.retailer_id = q.data.retailer_id;
      if (q.data.status) where.status = q.data.status;
      if (q.data.format) where.format = q.data.format;
    }

    const lookbooks = await prisma.lookbook.findMany({
      where,
      include: {
        retailer: { select: { id: true, shop_name: true, city: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return { data: lookbooks };
  });

  // ─── GET /admin/lookbooks/stats ──────────────────────────────────
  server.get('/lookbooks/stats', async () => {
    const [total, byStatus, byFormat, topViewed, recent] = await Promise.all([
      prisma.lookbook.count(),
      prisma.lookbook.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      prisma.lookbook.groupBy({
        by: ['format'],
        _count: { id: true },
      }),
      prisma.lookbook.findMany({
        orderBy: { view_count: 'desc' },
        take: 5,
        select: { id: true, name: true, view_count: true, share_count: true, status: true, cover_url: true },
      }),
      prisma.lookbook.findMany({
        orderBy: { created_at: 'desc' },
        take: 5,
        select: { id: true, name: true, status: true, created_at: true, retailer: { select: { shop_name: true } } },
      }),
    ]);

    return {
      data: {
        total,
        by_status: byStatus.map((r) => ({ status: r.status, count: r._count.id })),
        by_format: byFormat.map((r) => ({ format: r.format, count: r._count.id })),
        top_viewed: topViewed,
        recent,
      },
    };
  });

  // ─── GET /admin/lookbooks/:id ───────────────────────────────────
  server.get('/lookbooks/:id', async (request) => {
    const { id } = request.params as { id: string };
    const lookbook = await prisma.lookbook.findUnique({
      where: { id },
      include: {
        retailer: { select: { id: true, shop_name: true, city: true, phone: true } },
      },
    });
    if (!lookbook) throw notFound('Lookbook');
    return { data: lookbook };
  });

  // ─── PUT /admin/lookbooks/:id ───────────────────────────────────
  server.put('/lookbooks/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = LookbookUpdateSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const existing = await prisma.lookbook.findUnique({ where: { id } });
    if (!existing) throw notFound('Lookbook');

    const lookbook = await prisma.lookbook.update({
      where: { id },
      data: body.data,
      include: { retailer: { select: { id: true, shop_name: true, city: true } } },
    });

    return { data: lookbook };
  });

  // ─── DELETE /admin/lookbooks/:id ────────────────────────────────
  server.delete('/lookbooks/:id', async (request) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.lookbook.findUnique({ where: { id } });
    if (!existing) throw notFound('Lookbook');

    await prisma.lookbook.delete({ where: { id } });
    return { success: true };
  });

  // ─── PUT /admin/lookbooks/:id/status ────────────────────────────
  // Force-set status (admin override for stuck/failed lookbooks).
  server.put('/lookbooks/:id/status', async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({ status: z.enum(['DRAFT', 'GENERATING', 'READY', 'FAILED']) }).safeParse(request.body);
    if (!body.success) throw validationError('status is required');

    const existing = await prisma.lookbook.findUnique({ where: { id } });
    if (!existing) throw notFound('Lookbook');

    const lookbook = await prisma.lookbook.update({
      where: { id },
      data: { status: body.data.status },
      include: { retailer: { select: { id: true, shop_name: true, city: true } } },
    });

    return { data: lookbook };
  });
};
