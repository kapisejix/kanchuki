// Task 22: Public customer search — cross-retailer semantic search.
//
// POST /v1/public/search — port of routes/search.ts hybrid pattern
// scoped to ALL public ACTIVE products instead of one retailer.
// When a passport session exists, blends text-relevance 50/50 with
// cosine(preference_vector, product) for personalized re-ranking.

import { embedSearchQuery } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { extractBudgetFromQuery, normalizeSearchQuery } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { validationError } from '../../plugins/error-handler.js';

function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...val] = c.trim().split('=');
      return [key!, val.join('=')];
    }),
  );
}

const SearchSchema = z.object({
  query: z.string().min(1).max(500),
  filters: z
    .object({
      category: z.string().optional(),
      price_max: z.number().int().min(0).optional(),
      price_min: z.number().int().min(0).optional(),
    })
    .optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const publicSearchRoutes: FastifyPluginAsync = async (server) => {
  server.post('/search', async (request, reply) => {
    const body = SearchSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const { query: rawQuery, filters, limit } = body.data;

    // Extract budget from natural language
    const budgetFromQuery = extractBudgetFromQuery(rawQuery);
    const priceMax = filters?.price_max ?? budgetFromQuery.max ?? null;
    const priceMin = filters?.price_min ?? budgetFromQuery.min ?? null;
    const normalizedQuery = normalizeSearchQuery(rawQuery);

    // Extract passport session for personalization
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

    // Embed the search query for vector search
    let queryEmbedding: number[] | null = null;
    try {
      const embedding = await embedSearchQuery(normalizedQuery);
      queryEmbedding = embedding;
    } catch {
      // Embedding failed — fall back to text-only search
    }

    // Build the WHERE clause
    const where: any = {
      status: 'AVAILABLE',
      deleted_at: null,
      retailer: { is_suspended: false, deleted_at: null },
    };

    if (filters?.category) where.category = { contains: filters.category, mode: 'insensitive' };
    if (priceMin != null) where.price_min = { gte: priceMin };
    if (priceMax != null) where.price_max = { lte: priceMax };

    let results: any[];

    if (queryEmbedding) {
      // Vector KNN search across all products
      const vectorLiteral = `[${queryEmbedding.join(',')}]`;
      results = await prisma.$queryRawUnsafe(
        `SELECT p.id, p.name, p.category, p.primary_color, p.price_min, p.price_max,
               p.retailer_id, r.shop_name, r.public_slug, r.city as retailer_city,
               (SELECT url FROM product_photos WHERE product_id = p.id AND is_primary = true LIMIT 1) as photo_url,
               pe.embedding::text as embedding_raw
        FROM products p
        JOIN retailers r ON r.id = p.retailer_id AND r.deleted_at IS NULL AND r.is_suspended = FALSE
        LEFT JOIN product_embeddings pe ON pe.product_id = p.id
        WHERE p.status = 'AVAILABLE' AND p.deleted_at IS NULL
        ORDER BY pe.embedding <=> $1::vector
        LIMIT $2`,
        vectorLiteral,
        limit * 2,
      );
    } else {
      // Text-only fallback
      const rows = await prisma.product.findMany({
        where: {
          ...where,
          OR: [
            { name: { contains: normalizedQuery, mode: 'insensitive' } },
            { category: { contains: normalizedQuery, mode: 'insensitive' } },
            { search_tags: { hasSome: normalizedQuery.split(/\s+/) } },
          ],
        },
        include: {
          retailer: { select: { id: true, shop_name: true, public_slug: true, city: true } },
          photos: { where: { is_primary: true }, select: { url: true }, take: 1 },
        },
        take: limit * 2,
      });
      results = rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        primary_color: r.primary_color,
        price_min: r.price_min,
        price_max: r.price_max,
        retailer_id: r.retailer.id,
        shop_name: r.retailer.shop_name,
        public_slug: r.retailer.public_slug,
        retailer_city: r.retailer.city,
        photo_url: r.photos[0]?.url ?? null,
        embedding_raw: null,
      }));
    }

    // If we have a preference vector, blend text relevance with personalization
    if (accountId && results.length > 0) {
      const dna = await prisma.customerFashionDNA.findUnique({
        where: { customer_account_id: accountId },
        select: { interaction_count: true },
      });

      if (dna && dna.interaction_count >= 5) {
        const vecRows = await prisma.$queryRawUnsafe<{ pv: string }[]>(
          `SELECT preference_vector::text as pv FROM customer_fashion_dna WHERE customer_account_id = $1`,
          accountId,
        );
        const vecStr = vecRows[0]?.pv;
        if (vecStr) {
          const prefVec = vecStr.replace(/[\[\]]/g, '').split(',').map(Number).filter((n: number) => !isNaN(n));
          if (prefVec.length > 0) {
            // Boost results by preference similarity
            results = results.map((r) => {
              if (!r.embedding_raw) return r;
              const prodVec = r.embedding_raw.replace(/[\[\]]/g, '').split(',').map(Number).filter((n: number) => !isNaN(n));
              if (prodVec.length !== prefVec.length) return r;
              let dot = 0, na = 0, nb = 0;
              for (let i = 0; i < prefVec.length; i++) {
                dot += prefVec[i]! * prodVec[i]!;
                na += prefVec[i]! * prefVec[i]!;
                nb += prodVec[i]! * prodVec[i]!;
              }
              const cosine = (Math.sqrt(na) * Math.sqrt(nb)) === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
              return { ...r, _personalBoost: cosine * 0.5 }; // 50/50 blend
            });
            results.sort((a, b) => (b._personalBoost ?? 0) - (a._personalBoost ?? 0));
            results = results.map(({ _personalBoost, ...r }) => r);
          }
        }
      }
    }

    return reply.status(200).send({
      items: results.slice(0, limit).map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        primary_color: r.primary_color,
        price_min: r.price_min,
        price_max: r.price_max,
        photo_url: r.photo_url,
        retailer: {
          id: r.retailer_id,
          shop_name: r.shop_name,
          public_slug: r.public_slug,
          city: r.retailer_city,
        },
      })),
      total: results.length,
      query: normalizedQuery,
    });
  });
};
