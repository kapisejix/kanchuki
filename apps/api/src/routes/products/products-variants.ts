// Auto-split from products.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { getPurgePrisma, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { photoUrlToDisplay } from './products-helpers.js';

export const productsVariantsRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /products/:id/variants ─────────────────────────────────
  server.post('/:id/variants', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
      include: { _count: { select: { variants: true } } },
    });
    if (!existing) throw notFound('Product');
    if (existing._count.variants >= 20)
      throw validationError('Maximum 20 color variants per product');

    const body = z
      .object({
        color: z.string().min(1).max(50),
        r2_key: z.string().min(1),
        url: z.string().url(),
        price_override: z.number().int().min(0).max(100_000_000).optional(),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const variant = await prisma.productVariant.create({
      data: {
        product_id: id,
        retailer_id: request.retailerId,
        color: body.data.color,
        photo_url: body.data.url,
        r2_key: body.data.r2_key,
        price_override: body.data.price_override,
        is_ai_preview: false,
      },
    });

    // Ensure this variant photo is also recorded as a ProductPhoto so background cleanup,
    // shadow toggle, and AI Studio work seamlessly for color variants
    const existingPhoto = await prisma.productPhoto.findFirst({
      where: { product_id: id, r2_key: body.data.r2_key },
    });
    if (!existingPhoto) {
      await prisma.productPhoto.create({
        data: {
          product_id: id,
          retailer_id: request.retailerId,
          url: body.data.url,
          r2_key: body.data.r2_key,
          is_primary: false,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'create',
        resource_type: 'ProductVariant',
        resource_id: variant.id,
        metadata: { product_id: id, color: variant.color },
        ip_address: request.ip,
      },
    });

    return reply.status(201).send({ data: variant });
  });

  // ─── GET /products/:id/variants ──────────────────────────────────
  server.get('/:id/variants', async (request) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    });
    if (!existing) throw notFound('Product');

    const variants = await prisma.productVariant.findMany({
      where: { product_id: id, retailer_id: request.retailerId },
      orderBy: { created_at: 'asc' },
    });

    // Generate presigned URLs for variant photos
    const variantsWithUrls = await Promise.all(
      variants.map(async (variant) => {
        if (!variant.photo_url) return variant;
        const displayUrl = await photoUrlToDisplay({
          url: variant.photo_url,
          r2_key: variant.r2_key,
        });
        return { ...variant, photo_url: displayUrl ?? variant.photo_url };
      }),
    );

    return { data: variantsWithUrls };
  });

  // ─── DELETE /products/:id/variants/:variantId ────────────────────
  server.delete('/:id/variants/:variantId', async (request, reply) => {
    const { id, variantId } = request.params as { id: string; variantId: string };

    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, product_id: id, retailer_id: request.retailerId },
    });
    if (!variant) throw notFound('Variant');

    // F-017 guardrail: product_variants has a BEFORE DELETE trigger (SECURITY
    // §19) blocking hard deletes unless app.allow_hard_delete is set on the
    // session — kanchuki_app has DELETE revoked, so use the scoped purge role
    // (same pattern as products-trash.ts's /:id/purge route).
    const purgeDb = getPurgePrisma();
    await purgeDb.$transaction([
      purgeDb.$executeRawUnsafe(`SET app.allow_hard_delete = 'true';`),
      purgeDb.productVariant.delete({ where: { id: variantId } }),
    ]);

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'delete',
        resource_type: 'ProductVariant',
        resource_id: variantId,
        metadata: { product_id: id, color: variant.color },
        ip_address: request.ip,
      },
    });

    return reply.status(204).send();
  });
};
