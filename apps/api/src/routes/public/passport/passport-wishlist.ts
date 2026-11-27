// passport-wishlist.ts — wishlist read/add/remove (split from apps/api/src/routes/public/passport.ts — body byte-identical)
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../../plugins/error-handler.js';
import { getPassportSession, productRetailerMap } from './passport-helpers.js';
export const passportWishlistRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /passport/wishlist ────────────────────────────────────
  // List saved/wishlisted products across all stores.
  server.get('/wishlist', async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply
        .status(401)
        .send({ error: { code: 'NO_SESSION', message: 'Not authenticated' } });
    }

    const items = await prisma.customerWishlistItem.findMany({
      // The shortlist enquires per store; one dead product 422s the whole store, so hide them.
      where: {
        customer_account_id: session.customer_account_id,
        product: { deleted_at: null, status: 'AVAILABLE' },
      },
      orderBy: { created_at: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            category: true,
            primary_color: true,
            price_min: true,
            price_max: true,
            photos: { where: { is_primary: true }, select: { url: true }, take: 1 },
            retailer: { select: { id: true, shop_name: true, public_slug: true } },
          },
        },
      },
    });

    return reply.status(200).send({
      items: items.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        product: {
          id: item.product.id,
          name: item.product.name,
          category: item.product.category,
          primary_color: item.product.primary_color,
          price_min: item.product.price_min,
          price_max: item.product.price_max,
          photo_url: item.product.photos[0]?.url ?? null,
          retailer: item.product.retailer,
        },
        created_at: item.created_at.toISOString(),
      })),
    });
  });
  // ─── POST /passport/wishlist ───────────────────────────────────
  // Add a product to the wishlist.
  server.post('/wishlist', async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply
        .status(401)
        .send({ error: { code: 'NO_SESSION', message: 'Not authenticated' } });
    }

    const body = z
      // retailer_id still accepted so older web clients don't 422; the value is
      // ignored — H4-5/RC-095: the owner comes from the product row.
      .object({ product_id: z.string(), retailer_id: z.string().optional() })
      .safeParse(request.body);
    if (!body.success) throw validationError('Invalid body');

    const retailerId = (await productRetailerMap([body.data.product_id])).get(body.data.product_id);
    if (!retailerId) throw notFound('Product');

    await prisma.customerWishlistItem.upsert({
      where: {
        customer_account_id_product_id: {
          customer_account_id: session.customer_account_id,
          product_id: body.data.product_id,
        },
      },
      create: {
        customer_account_id: session.customer_account_id,
        product_id: body.data.product_id,
        retailer_id: retailerId,
      },
      update: {}, // already exists, no-op
    });

    return reply.status(200).send({ ok: true });
  });

  // ─── DELETE /passport/wishlist ─────────────────────────────────
  // Remove one saved product (My Style shortlist). Scoped to the session account, so another
  // shopper's row can never match; idempotent (absent = still 200).
  server.delete('/wishlist', async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply
        .status(401)
        .send({ error: { code: 'NO_SESSION', message: 'Not authenticated' } });
    }
    const body = z.object({ product_id: z.string().min(1).max(64) }).safeParse(request.body);
    if (!body.success) throw validationError('Invalid body');

    await prisma.customerWishlistItem.deleteMany({
      where: { customer_account_id: session.customer_account_id, product_id: body.data.product_id },
    });
    return reply.status(200).send({ ok: true });
  });
};
