// Admin CRUD for Unstitched Design Gallery (§9 of customer-profile-req.md).
// Admin uploads reference design images, tagged to design categories (neckline,
// blouse back, sleeve, salwar, silhouette) with named options.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';

const DESIGN_CATEGORIES = ['NECKLINE', 'BLOUSE_BACK', 'SLEEVE', 'SALWAR', 'SILHOUETTE'] as const;

const CreateSchema = z.object({
  category: z.enum(DESIGN_CATEGORIES),
  option: z.string().min(1).max(100),
  name: z.string().min(1).max(150),
  image_url: z.string().url(),
  r2_key: z.string().min(1),
  description: z.string().max(500).optional(),
  sort_order: z.number().int().optional(),
});

const UpdateSchema = z.object({
  category: z.enum(DESIGN_CATEGORIES).optional(),
  option: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(150).optional(),
  image_url: z.string().url().optional(),
  r2_key: z.string().min(1).optional(),
  description: z.string().max(500).optional().nullable(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

export const adminDesignReferenceRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /admin/design-references ───────────────────────────────
  // List all design references, filterable by category.
  server.get('/design-references', async (request) => {
    const { category } = request.query as { category?: string };

    const where: Record<string, unknown> = {};
    if (category && DESIGN_CATEGORIES.includes(category as typeof DESIGN_CATEGORIES[number])) {
      where.category = category;
    }

    const designs = await prisma.designReference.findMany({
      where,
      orderBy: [{ sort_order: 'asc' }, { created_at: 'desc' }],
    });

    return { data: designs };
  });

  // ─── GET /admin/design-references/stats ─────────────────────────
  server.get('/design-references/stats', async () => {
    const [total, active, byCategory] = await Promise.all([
      prisma.designReference.count(),
      prisma.designReference.count({ where: { is_active: true } }),
      prisma.designReference.groupBy({
        by: ['category'],
        _count: { id: true },
      }),
    ]);

    return {
      data: {
        total,
        active,
        inactive: total - active,
        by_category: byCategory.map((c) => ({ category: c.category, count: c._count.id })),
      },
    };
  });

  // ─── GET /admin/design-references/:id ───────────────────────────
  server.get('/design-references/:id', async (request) => {
    const { id } = request.params as { id: string };
    const design = await prisma.designReference.findUnique({ where: { id } });
    if (!design) throw notFound('Design reference');
    return { data: design };
  });

  // ─── POST /admin/design-references ──────────────────────────────
  server.post('/design-references', async (request, reply) => {
    const body = CreateSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const design = await prisma.designReference.create({ data: body.data });
    return reply.status(201).send({ data: design });
  });

  // ─── PUT /admin/design-references/:id ───────────────────────────
  server.put('/design-references/:id', async (request) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.designReference.findUnique({ where: { id } });
    if (!existing) throw notFound('Design reference');

    const body = UpdateSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const updated = await prisma.designReference.update({ where: { id }, data: body.data });
    return { data: updated };
  });

  // ─── DELETE /admin/design-references/:id ────────────────────────
  server.delete('/design-references/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.designReference.findUnique({ where: { id } });
    if (!existing) throw notFound('Design reference');

    await prisma.designReference.delete({ where: { id } });
    return reply.status(204).send();
  });
};
