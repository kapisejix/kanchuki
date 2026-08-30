// Task 21: For You feed — personalized product discovery.
//
// GET /v1/public/for-you?cursor=&limit=
// When a passport session is present, returns personalized ranked products.
// When no session, returns trending products (cold-start path).

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { rankProducts } from '../../lib/recommend.js';

function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...val] = c.trim().split('=');
      return [key!, val.join('=')];
    }),
  );
}

export const forYouRoutes: FastifyPluginAsync = async (server) => {
  server.get('/for-you', async (request, reply) => {
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().min(1).max(50).default(20),
      })
      .safeParse(request.query);

    if (!query.success) {
      return reply.status(400).send({ error: { code: 'INVALID_QUERY', message: 'Invalid query params' } });
    }

    const { cursor, limit } = query.data;

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

    const products = await rankProducts({
      accountId,
      surface: 'feed',
      limit,
      cursor,
    });

    return reply.status(200).send({
      items: products,
      next_cursor: products.length === limit ? products[products.length - 1]?.id : null,
    });
  });
};
