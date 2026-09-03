// Admin management for AI Social Media Templates (Phase 5).
//
// Templates are retailer-created social media image presets using the
// FLUX studio-shoot pipeline. Admin can view all templates, monitor usage,
// manage status, and view generation stats.
//
// SECURITY: guarded by adminAuthPreHandler (admin key + CSRF).

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

const TemplateUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  template_type: z
    .enum([
      'INSTAGRAM_POST',
      'INSTAGRAM_REEL',
      'INSTAGRAM_STORY',
      'WHATSAPP_STATUS',
      'WHATSAPP_CATALOG',
      'FACEBOOK_POST',
      'FACEBOOK_STORY',
      'PDF_FLYER',
    ])
    .optional(),
  occasion: z.string().trim().max(80).optional(),
  platform: z.string().trim().max(40).optional(),
  overlay_festival: z.string().trim().max(80).optional(),
  background_style: z.string().trim().max(80).optional(),
  image_url: z.string().url().optional(),
  caption: z.string().max(2000).optional(),
  hashtags: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});

export const adminSocialTemplateRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/social-templates ──────────────────────────────────
  server.get('/social-templates', async (request) => {
    const q = z
      .object({
        retailer_id: z.string().optional(),
        template_type: z.string().optional(),
        occasion: z.string().optional(),
        is_active: z.coerce.boolean().optional(),
      })
      .safeParse(request.query);

    const where: Record<string, unknown> = {};
    if (q.success) {
      if (q.data.retailer_id) where.retailer_id = q.data.retailer_id;
      if (q.data.template_type) where.template_type = q.data.template_type;
      if (q.data.occasion) where.occasion = q.data.occasion;
      if (q.data.is_active !== undefined) where.is_active = q.data.is_active;
    }

    const templates = await prisma.socialTemplate.findMany({
      where,
      include: { retailer: { select: { id: true, shop_name: true, city: true } } },
      orderBy: { created_at: 'desc' },
    });

    return { data: templates };
  });

  // ─── GET /admin/social-templates/stats ─────────────────────────────
  server.get('/social-templates/stats', async () => {
    const [total, active, byType, byOccasion, topUsed] = await Promise.all([
      prisma.socialTemplate.count(),
      prisma.socialTemplate.count({ where: { is_active: true } }),
      prisma.socialTemplate.groupBy({
        by: ['template_type'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      prisma.socialTemplate.groupBy({
        by: ['occasion'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.socialTemplate.findMany({
        orderBy: { usage_count: 'desc' },
        take: 5,
        select: { id: true, name: true, template_type: true, usage_count: true, occasion: true },
      }),
    ]);

    return {
      data: {
        total,
        active,
        inactive: total - active,
        by_type: byType.map((r) => ({ type: r.template_type, count: r._count.id })),
        by_occasion: byOccasion.map((r) => ({ occasion: r.occasion, count: r._count.id })),
        top_used: topUsed,
      },
    };
  });

  // ─── GET /admin/social-templates/:id ──────────────────────────────
  server.get('/social-templates/:id', async (request) => {
    const { id } = request.params as { id: string };
    const template = await prisma.socialTemplate.findUnique({
      where: { id },
      include: { retailer: { select: { id: true, shop_name: true, city: true } } },
    });
    if (!template) throw notFound('Social template');
    return { data: template };
  });

  // ─── PUT /admin/social-templates/:id ──────────────────────────────
  server.put('/social-templates/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = TemplateUpdateSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const existing = await prisma.socialTemplate.findUnique({ where: { id } });
    if (!existing) throw notFound('Social template');

    const template = await prisma.socialTemplate.update({
      where: { id },
      data: body.data,
      include: { retailer: { select: { id: true, shop_name: true, city: true } } },
    });

    return { data: template };
  });

  // ─── DELETE /admin/social-templates/:id ───────────────────────────
  server.delete('/social-templates/:id', async (request) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.socialTemplate.findUnique({ where: { id } });
    if (!existing) throw notFound('Social template');

    await prisma.socialTemplate.delete({ where: { id } });
    return { success: true };
  });

  // ─── PUT /admin/social-templates/:id/toggle ───────────────────────
  server.put('/social-templates/:id/toggle', async (request) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.socialTemplate.findUnique({ where: { id } });
    if (!existing) throw notFound('Social template');

    const template = await prisma.socialTemplate.update({
      where: { id },
      data: { is_active: !existing.is_active },
      include: { retailer: { select: { id: true, shop_name: true, city: true } } },
    });

    return { data: template };
  });
};
