// Admin CRUD for the Festival Background Library (Phase 4).
//
// Manages curated seasonal background images that retailers can apply
// to product photos via the existing POST /products/:id/photos/:photoId/festival-background endpoint.
//
// SECURITY: guarded by adminAuthPreHandler (admin key + CSRF).
// DELETE is hard delete (backgrounds are admin-curated, not retailer data).

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

const BackgroundPayloadSchema = z.object({
  retailer_id: z.string().min(1, 'Retailer ID is required'),
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(500).optional(),
  image_url: z.string().url('Must be a valid URL'),
  image_r2_key: z.string().optional(),
  thumbnail_url: z.string().url().optional(),
  occasion: z.string().trim().min(1, 'Occasion is required').max(80),
  season: z.string().trim().max(40).optional(),
  region: z.string().trim().max(40).optional(),
  is_active: z.boolean().optional(),
  valid_from: z.coerce.date().optional(),
  valid_to: z.coerce.date().optional(),
  priority: z.number().int().min(0).max(100).optional(),
});

const BackgroundUpdateSchema = BackgroundPayloadSchema.partial().omit({ retailer_id: true });

export const adminFestivalBackgroundsRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/festival-backgrounds ────────────────────────────────
  // All backgrounds across all retailers, newest first.
  server.get('/festival-backgrounds', async (request) => {
    const q = z
      .object({
        occasion: z.string().optional(),
        retailer_id: z.string().optional(),
        is_active: z.coerce.boolean().optional(),
      })
      .safeParse(request.query);

    const where: Record<string, unknown> = {};
    if (q.success) {
      if (q.data.occasion) where.occasion = q.data.occasion;
      if (q.data.retailer_id) where.retailer_id = q.data.retailer_id;
      if (q.data.is_active !== undefined) where.is_active = q.data.is_active;
    }

    const backgrounds = await prisma.festivalBackground.findMany({
      where,
      include: { retailer: { select: { id: true, shop_name: true, city: true } } },
      orderBy: [{ priority: 'desc' }, { created_at: 'desc' }],
    });

    return { data: backgrounds };
  });

  // ─── GET /admin/festival-backgrounds/stats ──────────────────────────
  server.get('/festival-backgrounds/stats', async () => {
    const [total, active, byOccasion, topUsed] = await Promise.all([
      prisma.festivalBackground.count(),
      prisma.festivalBackground.count({ where: { is_active: true } }),
      prisma.festivalBackground.groupBy({
        by: ['occasion'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.festivalBackground.findMany({
        orderBy: { usage_count: 'desc' },
        take: 5,
        select: { id: true, name: true, occasion: true, usage_count: true, image_url: true },
      }),
    ]);

    return {
      data: {
        total,
        active,
        inactive: total - active,
        by_occasion: byOccasion.map((r) => ({ occasion: r.occasion, count: r._count.id })),
        top_used: topUsed,
      },
    };
  });

  // ─── GET /admin/festival-backgrounds/:id ───────────────────────────
  server.get('/festival-backgrounds/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const bg = await prisma.festivalBackground.findUnique({
      where: { id },
      include: { retailer: { select: { id: true, shop_name: true, city: true } } },
    });
    if (!bg) throw notFound('Festival background');
    return reply.send({ data: bg });
  });

  // ─── POST /admin/festival-backgrounds ───────────────────────────────
  server.post('/festival-backgrounds', async (request, reply) => {
    const body = BackgroundPayloadSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    if (body.data.valid_to && body.data.valid_from && body.data.valid_to <= body.data.valid_from) {
      throw validationError('valid_to must be after valid_from');
    }

    // Verify retailer exists
    const retailer = await prisma.retailer.findUnique({
      where: { id: body.data.retailer_id },
      select: { id: true },
    });
    if (!retailer) throw notFound('Retailer');

    const bg = await prisma.festivalBackground.create({
      data: {
        ...body.data,
        is_active: body.data.is_active ?? true,
        priority: body.data.priority ?? 0,
      },
      include: { retailer: { select: { id: true, shop_name: true, city: true } } },
    });

    return reply.status(201).send({ data: bg });
  });

  // ─── PUT /admin/festival-backgrounds/:id ───────────────────────────
  server.put('/festival-backgrounds/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = BackgroundUpdateSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const existing = await prisma.festivalBackground.findUnique({ where: { id } });
    if (!existing) throw notFound('Festival background');

    if (body.data.valid_to && body.data.valid_from) {
      if (body.data.valid_to <= body.data.valid_from) {
        throw validationError('valid_to must be after valid_from');
      }
    }

    const bg = await prisma.festivalBackground.update({
      where: { id },
      data: body.data,
      include: { retailer: { select: { id: true, shop_name: true, city: true } } },
    });

    return { data: bg };
  });

  // ─── DELETE /admin/festival-backgrounds/:id ────────────────────────
  server.delete('/festival-backgrounds/:id', async (request) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.festivalBackground.findUnique({ where: { id } });
    if (!existing) throw notFound('Festival background');

    await prisma.festivalBackground.delete({ where: { id } });
    return { success: true };
  });

  // ─── PUT /admin/festival-backgrounds/:id/toggle ────────────────────
  server.put('/festival-backgrounds/:id/toggle', async (request) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.festivalBackground.findUnique({ where: { id } });
    if (!existing) throw notFound('Festival background');

    const bg = await prisma.festivalBackground.update({
      where: { id },
      data: { is_active: !existing.is_active },
      include: { retailer: { select: { id: true, shop_name: true, city: true } } },
    });

    return { data: bg };
  });
};
