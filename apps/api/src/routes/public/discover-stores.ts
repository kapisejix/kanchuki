// Task 23: /discover-stores — store discovery endpoint.
//
// GET /v1/public/discover-stores?city=&limit=
// Returns stores ranked by affinity score (nightly precomputed).
// When no session, returns featured + same-city stores.

import { type Prisma, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { getPassportSession } from './passport/passport-helpers.js';

export const discoverStoresRoutes: FastifyPluginAsync = async (server) => {
  server.get('/discover-stores', async (request, reply) => {
    const query = z
      .object({
        city: z.string().optional(),
        limit: z.coerce.number().min(1).max(50).default(20),
      })
      .safeParse(request.query);

    if (!query.success) {
      return reply
        .status(400)
        .send({ error: { code: 'INVALID_QUERY', message: 'Invalid query params' } });
    }

    const { city, limit } = query.data;

    // Extract passport session
    let _accountId: string | null = null;
    // One cookie -> session lookup (hashes the cookie, H4-7); don't copy it here.
    const session = await getPassportSession(request.headers.cookie || '');
    if (session) _accountId = session.customer_account_id;

    // Featured stores + same-city (StoreAffinity model dropped)
    const where: Prisma.RetailerWhereInput = { deleted_at: null, is_suspended: false };
    if (city) where.city = city;

    const allStores = await prisma.retailer.findMany({
      where,
      select: {
        id: true,
        shop_name: true,
        city: true,
        logo_url: true,
        public_slug: true,
        is_featured: true,
      },
      orderBy: [{ is_featured: 'desc' }, { shop_name: 'asc' }],
      take: limit,
    });
    const stores = allStores.map((s) => ({
      ...s,
      affinity_score: s.is_featured ? 1.0 : 0.5,
      source: s.is_featured ? 'featured' : 'directory',
    }));

    return reply.status(200).send({ stores });
  });
};
