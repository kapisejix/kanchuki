import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { getPassportSession } from './passport/passport-helpers.js';
import { toPublicProductSummary } from './public-helpers.js';

const RESULT_LIMIT = 6;
const CANDIDATE_LIMIT = 60;
const SIGNAL_LIMIT = 100;
const SIGNAL_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const VISIT_IDS_LIMIT = 30;

interface RecommendationProduct {
  id: string;
  category: string | null;
  subtype: string | null;
  fabrics: string[];
  primary_color: string | null;
  price_min: number | null;
  created_at: Date;
}

interface WeightedSignal {
  product: RecommendationProduct;
  weight: number;
}

const RequestSchema = z.object({
  slug: z.string().trim().min(1).max(200),
  // Anonymous visit history is advisory input only. IDs are revalidated against
  // the active store before they can contribute signals or exclude candidates.
  visit_product_ids: z.array(z.string().trim().min(1).max(100)).max(VISIT_IDS_LIMIT).optional(),
});

function normalized(value: string | null | undefined): string | null {
  const result = value?.trim().toLowerCase();
  return result || null;
}

function scoreCandidate(candidate: RecommendationProduct, signals: WeightedSignal[]): number {
  let score = 0;
  const category = normalized(candidate.category);
  const subtype = normalized(candidate.subtype);
  const color = normalized(candidate.primary_color);
  const fabrics = new Set(candidate.fabrics.map((fabric) => fabric.toLowerCase()));

  for (const { product, weight } of signals) {
    if (category && category === normalized(product.category)) score += 6 * weight;
    if (subtype && subtype === normalized(product.subtype)) score += 4 * weight;
    if (color && color === normalized(product.primary_color)) score += 2 * weight;
    if (product.fabrics.some((fabric) => fabrics.has(fabric.toLowerCase()))) score += 3 * weight;
    if (candidate.price_min != null && product.price_min != null && product.price_min > 0) {
      const ratio = candidate.price_min / product.price_min;
      if (ratio >= 0.6 && ratio <= 1.6) score += weight;
    }
  }

  return score;
}

function rankCandidates<T extends RecommendationProduct>(
  candidates: T[],
  signals: WeightedSignal[],
): T[] {
  return [...candidates]
    .map((product) => ({ product, score: scoreCandidate(product, signals) }))
    .sort(
      (a, b) =>
        b.score - a.score || b.product.created_at.getTime() - a.product.created_at.getTime(),
    )
    .filter(({ score }) => score > 0)
    .slice(0, RESULT_LIMIT)
    .map(({ product }) => product);
}

async function loadCatalog(retailerId: string, excludedIds: string[] = []) {
  return prisma.product.findMany({
    where: {
      retailer_id: retailerId,
      deleted_at: null,
      status: 'AVAILABLE',
      ...(excludedIds.length ? { id: { notIn: excludedIds } } : {}),
    },
    orderBy: { created_at: 'desc' },
    take: CANDIDATE_LIMIT,
    include: {
      photos: { orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }], take: 1 },
      section: { select: { name: true } },
      _count: { select: { photos: true } },
    },
  });
}

function toSignalProduct(product: {
  id: string;
  category: string | null;
  subtype: string | null;
  fabrics: string[];
  primary_color: string | null;
  price_min: number | null;
  created_at: Date;
}): RecommendationProduct {
  return product;
}

export const publicRecommendationsRoutes: FastifyPluginAsync = async (server) => {
  // Personalized feed is deliberately POST so the account-specific response
  // cannot be shared by a browser/CDN cache keyed only on a public URL.
  server.post('/recommendations', async (request, reply) => {
    // The response may depend on the passport cookie and must never be stored
    // in a shared browser/CDN cache.
    reply.header('Cache-Control', 'private, no-store');
    const parsed = RequestSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('Invalid recommendation request');

    const retailer = await prisma.retailer.findFirst({
      where: { public_slug: parsed.data.slug, deleted_at: null, is_suspended: false },
      select: { id: true },
    });
    if (!retailer) throw notFound('Store');

    const session = await getPassportSession(request.headers.cookie || '');
    let signals: WeightedSignal[] = [];

    if (session) {
      // Opt-out means no profiling signals, including anonymous visit IDs.
      if (session.customer_account.profiling_enabled) {
        // Signals are an enhancement: a failed signal read (e.g. the
        // customer_interactions table missing in prod) must degrade to the
        // store's catalog below, not blank the whole "Picked for you" row.
        try {
          const events = await prisma.customerInteraction.findMany({
            where: {
              customer_account_id: session.customer_account_id,
              retailer_id: retailer.id,
              type: { in: ['FAVORITE', 'UNFAVORITE', 'ENQUIRY', 'VIEW'] },
              created_at: { gte: new Date(Date.now() - SIGNAL_WINDOW_MS) },
            },
            orderBy: { created_at: 'desc' },
            take: SIGNAL_LIMIT,
            select: { type: true, product_id: true },
          });
          const weights = new Map<string, number>();
          const favoriteStateSeen = new Set<string>();
          for (const event of events) {
            if (!event.product_id) continue;
            if (event.type === 'FAVORITE' || event.type === 'UNFAVORITE') {
              // Events are newest-first; the latest favorite toggle is the
              // current state, so an old favorite cannot override a later unlike.
              if (favoriteStateSeen.has(event.product_id)) continue;
              favoriteStateSeen.add(event.product_id);
              if (event.type === 'UNFAVORITE') continue;
            }
            const weight = event.type === 'ENQUIRY' ? 4 : event.type === 'FAVORITE' ? 3 : 1;
            weights.set(event.product_id, (weights.get(event.product_id) ?? 0) + weight);
          }
          // A recognized shopper also contributes the current browser visit,
          // but only after the IDs are revalidated against this retailer. This
          // complements (never replaces) their persisted signals for this store.
          for (const id of new Set(parsed.data.visit_product_ids ?? [])) {
            if (!weights.has(id)) weights.set(id, 1);
          }
          const products = weights.size
            ? await prisma.product.findMany({
                where: {
                  id: { in: [...weights.keys()] },
                  retailer_id: retailer.id,
                  deleted_at: null,
                  status: 'AVAILABLE',
                },
                select: {
                  id: true,
                  category: true,
                  subtype: true,
                  fabrics: true,
                  primary_color: true,
                  price_min: true,
                  created_at: true,
                },
              })
            : [];
          signals = products.map((product) => ({
            product: toSignalProduct(product),
            weight: weights.get(product.id) ?? 1,
          }));
        } catch (err) {
          request.log.warn({ err }, 'recommendations: session signals unavailable');
          signals = [];
        }
      }
    } else {
      const visitIds = [...new Set(parsed.data.visit_product_ids ?? [])];
      if (visitIds.length) {
        const visitedProducts = await prisma.product.findMany({
          where: {
            id: { in: visitIds },
            retailer_id: retailer.id,
            deleted_at: null,
            status: 'AVAILABLE',
          },
          select: {
            id: true,
            category: true,
            subtype: true,
            fabrics: true,
            primary_color: true,
            price_min: true,
            created_at: true,
          },
        });
        signals = visitedProducts.map((product) => ({ product, weight: 1 }));
      }
    }

    if (!signals.length) {
      const fallbackRows = await loadCatalog(retailer.id);
      return reply.status(200).send({
        data: {
          personalized: false,
          products: await Promise.all(
            fallbackRows.slice(0, RESULT_LIMIT).map(toPublicProductSummary),
          ),
        },
      });
    }

    const seenIds = signals.map(({ product }) => product.id);
    const candidateRows = await loadCatalog(retailer.id, seenIds);
    const ranked = rankCandidates(candidateRows, signals);

    if (ranked.length) {
      return reply.status(200).send({
        data: {
          personalized: true,
          products: await Promise.all(ranked.map((product) => toPublicProductSummary(product))),
        },
      });
    }

    // Empty/insufficient signals (or no unseen matching item): return the
    // active store's normal newest-first available catalog, not synthetic picks.
    const fallbackRows = await loadCatalog(retailer.id);
    return reply.status(200).send({
      data: {
        personalized: false,
        products: await Promise.all(
          fallbackRows.slice(0, RESULT_LIMIT).map(toPublicProductSummary),
        ),
      },
    });
  });
};
