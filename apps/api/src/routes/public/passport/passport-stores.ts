// passport-stores.ts — store visit list (split from apps/api/src/routes/public/passport.ts)
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { getPassportSession } from './passport-helpers.js';
export const passportStoresRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /passport/stores ──────────────────────────────────────
  // List stores the shopper has visited. Number always masked.
  server.get('/stores', async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply
        .status(401)
        .send({ error: { code: 'NO_SESSION', message: 'Not authenticated' } });
    }

    const visits = await prisma.customerStoreVisit.findMany({
      where: { customer_account_id: session.customer_account_id },
      include: {
        retailer: {
          // public_slug is the storefront key (apps/web `/[store]`) — the
          // /my-stores list needs it to build each row's tap-through link.
          select: { id: true, shop_name: true, city: true, logo_url: true, public_slug: true },
        },
      },
      orderBy: { last_visited_at: 'desc' },
    });

    return reply.status(200).send({
      stores: visits.map((v) => ({
        retailer: v.retailer,
        first_visited_at: v.first_visited_at,
        last_visited_at: v.last_visited_at,
        visit_count: v.visit_count,
        is_muted: v.is_muted,
        contact_shared: v.contact_shared,
      })),
    });
  });
};
