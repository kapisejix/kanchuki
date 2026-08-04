// Auto-split from retailers.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';

const StoreSectionSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['rack', 'shelf', 'section', 'floor', 'box']),
  parent_id: z.string().optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
});

export const retailersSectionsRoutes: FastifyPluginAsync = async (server) => {
  // ─── Store Sections ─────────────────────────────────────────────

  server.get('/me/sections', async (request) => {
    const sections = await prisma.storeSection.findMany({
      where: { retailer_id: request.retailerId },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    });
    return { data: sections };
  });

  server.post('/me/sections', async (request, reply) => {
    const body = StoreSectionSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const section = await prisma.storeSection.create({
      data: { retailer_id: request.retailerId, ...body.data },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'create',
        resource_type: 'StoreSection',
        resource_id: section.id,
        metadata: { name: section.name, type: section.type },
        ip_address: request.ip,
      },
    });

    return reply.status(201).send({ data: section });
  });

  server.put('/me/sections/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = StoreSectionSchema.partial().safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const existing = await prisma.storeSection.findFirst({
      where: { id, retailer_id: request.retailerId },
    });
    if (!existing) throw notFound('Section');

    const updated = await prisma.storeSection.update({
      where: { id },
      data: body.data,
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'update',
        resource_type: 'StoreSection',
        resource_id: id,
        metadata: { name: updated.name, updated_fields: Object.keys(body.data) },
        ip_address: request.ip,
      },
    });

    return { data: updated };
  });

  server.delete('/me/sections/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.storeSection.findFirst({
      where: { id, retailer_id: request.retailerId },
    });
    if (!existing) throw notFound('Section');

    const inUse = await prisma.product.count({
      where: { section_id: id, retailer_id: request.retailerId, deleted_at: null },
    });
    if (inUse > 0) {
      throw validationError('Section has products assigned. Reassign them first.');
    }

    await prisma.storeSection.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'delete',
        resource_type: 'StoreSection',
        resource_id: id,
        metadata: { name: existing.name },
        ip_address: request.ip,
      },
    });

    return reply.status(204).send();
  });
};
