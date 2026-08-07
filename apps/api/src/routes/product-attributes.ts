// Retailer-facing CRUD for the Style/Occasion/Fabric taxonomy — mirrors
// categories.ts (ProductCategory), generalized across the three kinds via a
// `kind` field/query param instead of three near-duplicate route files.
// Values here are what the product-add screen offers as selectable options;
// AI tagging writes its raw per-photo guesses into Product.styles/fabrics
// (occasions pre-existing) without a DB resolve step, matched client-side.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../plugins/error-handler.js';

const KIND_ENUM = z.enum(['STYLE', 'OCCASION', 'FABRIC']);

export const productAttributeRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /product-attributes?kind=STYLE|OCCASION|FABRIC ─────────
  server.get('/', async (request) => {
    const query = z.object({ kind: KIND_ENUM.optional() }).safeParse(request.query);
    if (!query.success) throw validationError('Invalid kind');

    const attributes = await prisma.productAttribute.findMany({
      where: {
        retailer_id: request.retailerId,
        ...(query.data.kind ? { kind: query.data.kind } : {}),
      },
      orderBy: [{ kind: 'asc' }, { sort_order: 'asc' }, { created_at: 'asc' }],
    });

    return { data: attributes };
  });

  // ─── POST /product-attributes ────────────────────────────────────
  // Retailer adds a custom value not in the seeded default list (e.g. a
  // house-specific occasion) — same "custom rows become AI targets for
  // free" precedent as ProductCategory.
  server.post('/', async (request, reply) => {
    const body = z
      .object({ kind: KIND_ENUM, name: z.string().min(1).max(100) })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const existing = await prisma.productAttribute.findUnique({
      where: {
        retailer_id_kind_name: {
          retailer_id: request.retailerId,
          kind: body.data.kind,
          name: body.data.name,
        },
      },
    });
    if (existing) throw validationError('This value already exists', 'name');

    const attribute = await prisma.productAttribute.create({
      data: {
        retailer_id: request.retailerId,
        kind: body.data.kind,
        name: body.data.name,
      },
    });

    return reply.status(201).send({ data: attribute });
  });

  // ─── DELETE /product-attributes/:id ──────────────────────────────
  server.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.productAttribute.findFirst({
      where: { id, retailer_id: request.retailerId },
    });
    if (!existing) throw notFound('Attribute');

    await prisma.productAttribute.delete({ where: { id } });
    return reply.status(204).send();
  });
};
