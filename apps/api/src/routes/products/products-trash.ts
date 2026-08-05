// Auto-split from products.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { Prisma, getPurgePrisma, prisma, vaultDelete } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { isRealOwner } from '../../plugins/auth.js';
import { forbidden, notFound, validationError } from '../../plugins/error-handler.js';

export const productsTrashRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /products/deleted — owner-only trash tab ────────────────
  // Any staff member can soft-delete (DELETE /:id above); only the retailer
  // owner can see the removed list and restore or permanently purge from it.
  server.get('/deleted', async (request) => {
    if (!isRealOwner(request)) throw forbidden('Only the shop owner can view deleted products');

    const products = await prisma.product.findMany({
      where: { retailer_id: request.retailerId, deleted_at: { not: null } },
      include: { photos: { where: { is_primary: true }, take: 1 } },
      orderBy: { deleted_at: 'desc' },
      take: 200,
    });
    return { data: products };
  });

  // ─── PATCH /products/:id/restore — owner-only ─────────────────────
  server.patch('/:id/restore', async (request) => {
    if (!isRealOwner(request)) throw forbidden('Only the shop owner can restore products');
    const { id } = request.params as { id: string };

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: { not: null } },
    });
    if (!existing) throw notFound('Product');

    const restored = await prisma.product.update({
      where: { id },
      data: { deleted_at: null },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'restore',
        resource_type: 'Product',
        resource_id: id,
        ip_address: request.ip,
      },
    });

    return { data: restored };
  });

  // ─── DELETE /products/:id/purge — owner-only, permanent ───────────
  server.delete('/:id/purge', async (request, reply) => {
    if (!isRealOwner(request))
      throw forbidden('Only the shop owner can permanently delete products');
    const { id } = request.params as { id: string };

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: { not: null } },
    });
    if (!existing) throw notFound('Product');

    // F-016: Vault snapshot before permanent deletion
    vaultDelete({
      source_table: 'products',
      source_id: id,
      retailer_id: request.retailerId,
      payload: existing as unknown as Record<string, unknown>,
      delete_reason: 'purge',
      deleted_by: request.retailerId,
    });

    // F-017 guardrail: `products` has a BEFORE DELETE trigger that blocks hard
    // deletes unless the session sets app.allow_hard_delete — and the shared
    // `prisma` client's role (kanchuki_app) has DELETE revoked entirely under
    // SECURITY §19 role separation. getPurgePrisma() is the scoped role built
    // for exactly this (same pattern as apps/api/src/jobs/purge-soft-deleted.ts).
    const purgeDb = getPurgePrisma();
    try {
      await purgeDb.$transaction([
        purgeDb.$executeRawUnsafe(`SET app.allow_hard_delete = 'true';`),
        purgeDb.product.delete({ where: { id } }),
      ]);
    } catch (err) {
      // Products referenced by a past order or a shared collection can't be
      // hard-deleted (FK constraint) — it's already off the catalog via
      // deleted_at, which is as final as order/collection history allows.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw validationError(
          'This product is part of a past order or collection and can only be removed from the catalog, not permanently deleted',
        );
      }
      throw err;
    }

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'delete',
        resource_type: 'Product',
        resource_id: id,
        metadata: { permanent: true, previous_status: existing.status },
        ip_address: request.ip,
      },
    });

    return reply.status(204).send();
  });
};
