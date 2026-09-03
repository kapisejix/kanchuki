// Admin-managed addon packs (F-034 task 6.1) — DB-backed replacement for the
// hardcoded ADDON_PRICING const. The admin adds / approves / assigns packs per
// plan from the dashboard. resource_type is validated app-side against the known
// metered resources (the DB column is TEXT so packs can be pre-configured for a
// brand-new resource like AI_VIDEO before its enum value ships).
import type { FastifyPluginAsync } from 'fastify';

import { prisma } from '@kanchuki/db';
import { z } from 'zod';
import { notFound } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

// The metered-resource vocabulary a pack can top up. Mirrors the quota system's
// resources (billing zod enum + plan-limits + AI_VIDEO once migration 090 lands).
const RESOURCE_TYPES = [
  'PRODUCT_UPLOAD',
  'AI_TAGGING_CALL',
  'IMAGE_CROP',
  'BG_REMOVAL',
  'API_REQUEST',
  'STUDIO_SHOOT',
  'AI_VIDEO', // F-034 — buyable once the enum + billing rail ship (migration 090)
] as const;
const PLANS = ['STARTER', 'GROWTH', 'PRO'] as const;

export const adminResourcePacksRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/resource-packs ──────────────────────────────────
  // Every admin-configured pack, newest last within (resource_type, sort_order).
  server.get('/resource-packs', async () => {
    const rows = await prisma.resourcePack.findMany({
      orderBy: [{ resource_type: 'asc' }, { sort_order: 'asc' }, { created_at: 'asc' }],
    });
    return { data: rows };
  });

  // ─── POST /admin/resource-packs ─────────────────────────────────
  // Add a pack. Empty `plans` = buyable by every plan. Values are admin-set —
  // nothing here is seeded or hardcoded.
  server.post('/resource-packs', async (request) => {
    const body = z
      .object({
        resource_type: z.enum(RESOURCE_TYPES),
        label: z.string().min(1).max(120),
        unit_label: z.string().min(1).max(40),
        pack_size: z.number().int().min(1).max(1_000_000),
        price_paise: z.number().int().min(0),
        plans: z.array(z.enum(PLANS)).max(3).default([]),
        is_active: z.boolean().default(true),
        sort_order: z.number().int().min(0).default(0),
      })
      .parse(request.body);

    const row = await prisma.resourcePack.create({ data: body });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'ResourcePack',
        resource_id: row.id,
        metadata: {
          resource_type: body.resource_type,
          label: body.label,
          pack_size: body.pack_size,
          price_paise: body.price_paise,
          plans: body.plans,
          is_active: body.is_active,
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ resource_type: body.resource_type, id: row.id }, 'Resource pack created');
    return { data: row };
  });

  // ─── PATCH /admin/resource-packs/:id ────────────────────────────
  // Edit any field (price, label, size, per-plan assignment, active flag).
  server.patch('/resource-packs/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        resource_type: z.enum(RESOURCE_TYPES).optional(),
        label: z.string().min(1).max(120).optional(),
        unit_label: z.string().min(1).max(40).optional(),
        pack_size: z.number().int().min(1).max(1_000_000).optional(),
        price_paise: z.number().int().min(0).optional(),
        plans: z.array(z.enum(PLANS)).max(3).optional(),
        is_active: z.boolean().optional(),
        sort_order: z.number().int().min(0).optional(),
      })
      .parse(request.body);

    const existing = await prisma.resourcePack.findUnique({ where: { id } });
    if (!existing) throw notFound('Resource pack');

    const row = await prisma.resourcePack.update({
      where: { id },
      data: body,
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'ResourcePack',
        resource_id: id,
        metadata: { before: existing, after: row },
        ip_address: request.ip,
      },
    });

    request.log.info({ id, resource_type: row.resource_type }, 'Resource pack updated');
    return { data: row };
  });

  // ─── DELETE /admin/resource-packs/:id ───────────────────────────
  // Remove a pack entirely. Past purchases stay on quota_addon_purchases (their
  // resource_type/quantity are stored on the purchase row, not this table).
  server.delete('/resource-packs/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const existing = await prisma.resourcePack.findUnique({ where: { id } });
    if (!existing) throw notFound('Resource pack');

    await prisma.resourcePack.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'DELETE',
        resource_type: 'ResourcePack',
        resource_id: id,
        metadata: { resource_type: existing.resource_type, label: existing.label },
        ip_address: request.ip,
      },
    });

    request.log.info({ id, resource_type: existing.resource_type }, 'Resource pack deleted');
    return reply.status(204).send();
  });
};
