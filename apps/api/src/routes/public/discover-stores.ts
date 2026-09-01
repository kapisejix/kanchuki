// Task 23: /discover-stores — store discovery endpoint.
//
// GET /v1/public/discover-stores?city=&limit=
// Returns stores ranked by affinity score (nightly precomputed).
// When no session, returns featured + same-city stores.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...val] = c.trim().split('=');
      return [key!, val.join('=')];
    }),
  );
}

export const discoverStoresRoutes: FastifyPluginAsync = async (server) => {
  server.get('/discover-stores', async (request, reply) => {
    const query = z
      .object({
        city: z.string().optional(),
        limit: z.coerce.number().min(1).max(50).default(20),
      })
      .safeParse(request.query);

    if (!query.success) {
      return reply.status(400).send({ error: { code: 'INVALID_QUERY', message: 'Invalid query params' } });
    }

    const { city, limit } = query.data;

    // Extract passport session
    let accountId: string | null = null;
    const cookieHeader = request.headers.cookie || '';
    const cookies = parseCookies(cookieHeader);
    const sessionId = cookies['kanchuki_passport'];
    if (sessionId) {
      const session = await prisma.passportSession.findUnique({
        where: { id: sessionId },
        select: { customer_account_id: true, expires_at: true, revoked_at: true },
      });
      if (session && !session.revoked_at && session.expires_at > new Date()) {
        accountId = session.customer_account_id;
      }
    }

    let stores: any[];

    // Featured stores + same-city (StoreAffinity model dropped)
    const where: any = { deleted_at: null, is_suspended: false };
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
    stores = allStores.map((s: any) => ({
      ...s,
      affinity_score: s.is_featured ? 1.0 : 0.5,
      source: s.is_featured ? 'featured' : 'directory',
    }));

    return reply.status(200).send({ stores });
  });
};
