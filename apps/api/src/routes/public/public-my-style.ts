// F-045 My Style — POST /public/my-style/feed (docs/tasks/pending/my-style.md §3.4, §4.2, T7).
//
// A signed-in shopper's cross-store feed: SQL narrows to live, in-stock, public-storefront
// candidates, then lib/my-style-rank.ts orders them. No AI call here — the response says so
// (`rationale_source: 'none'`) instead of carrying canned reasons (RC-059). Prices are paise
// end to end (RC-055). Account-specific, so never cacheable (POST + no-store).
import { prisma } from '@kanchuki/db';
import {
  FESTIVAL_LOOKAHEAD_DAYS,
  type GarmentDescriptor,
  MY_STYLE_DEFAULT_RADIUS_KM,
  MY_STYLE_TABS,
  buildEnquiryMessage,
  buildWhatsAppEnquiryLink,
  occasionTargets,
  parseGarmentDescriptor,
} from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getBoundingBox, haversineDistance } from '../../lib/geo.js';
import { type RankCandidate, rankProducts } from '../../lib/my-style-rank.js';
import {
  attributeScore,
  combineSimilarity,
  embedDescriptor,
  embeddingSimilarities,
} from '../../lib/my-style-similar.js';
import {
  type FestivalRow,
  type TrendRow,
  activeTrends,
  matchesTab,
  pickFestival,
  promoteMatches,
} from '../../lib/my-style-tabs.js';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { getPassportSession } from './passport/passport-helpers.js';
import { enquiryPhone, toPublicProductSummary } from './public-helpers.js';

// Ranking runs in memory over the newest N matches. Past this a very large catalogue is
// ranked best-effort; the response flags it (`truncated`) rather than hiding it.
const CANDIDATE_CAP = 300;

const BodySchema = z
  .object({
    sort: z.enum(['best', 'nearest', 'price']).default('best'),
    tab: z.enum(MY_STYLE_TABS).default('foryou'),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    radius_km: z.number().positive().max(500).default(MY_STYLE_DEFAULT_RADIUS_KM),
    occasion: z.string().trim().min(1).max(60).optional(), // a boost, not a filter: see below
    budget_max: z.number().int().positive().optional(), // paise
    size: z.string().trim().min(1).max(10).optional(),
    page: z.number().int().min(1).max(50).default(1),
    limit: z.number().int().min(1).max(30).default(12),
    // Find similar (PR-9): the garment descriptor the analyze poll returned. The client
    // holds it and sends it back; it is checked against the enums, never stored.
    similar: z
      .custom<GarmentDescriptor>((v) => parseGarmentDescriptor(v) !== null, 'Invalid garment')
      .optional(),
  })
  .strict()
  .refine((b) => (b.lat === undefined) === (b.lng === undefined), 'lat and lng go together');

const EnquireSchema = z
  .object({
    retailer_slug: z.string().trim().min(1).max(100),
    product_ids: z.array(z.string().min(1).max(64)).min(1).max(20),
  })
  .strict();

export const publicMyStyleRoutes: FastifyPluginAsync = async (server) => {
  server.post(
    '/feed',
    { config: { rateLimit: { max: 30, timeWindow: 60 * 1000 } } },
    async (request, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      const session = await getPassportSession(request.headers.cookie || '');
      if (!session) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'Passport session required' } });
      }
      const parsed = BodySchema.safeParse(request.body ?? {});
      if (!parsed.success) throw validationError('Invalid My Style request');
      const b = parsed.data;
      const account = session.customer_account;

      // Location: device position, else the account's city, else everywhere (and say so).
      const origin = b.lat !== undefined && b.lng !== undefined ? { lat: b.lat, lng: b.lng } : null;
      const city = account.city?.trim() || null;
      const locationScope = origin ? 'radius' : city ? 'city' : 'nationwide';
      const box = origin ? getBoundingBox(origin.lat, origin.lng, b.radius_km) : null;

      const budgetMax = b.budget_max ?? account.budget_max ?? undefined;
      const size = (b.size ?? account.usual_size)?.toUpperCase();

      const palette =
        account.skin_undertone && account.skin_depth
          ? await prisma.stylePalette.findFirst({
              where: {
                undertone: account.skin_undertone,
                depth: account.skin_depth,
                is_active: true,
              },
              orderBy: { version: 'desc' },
              select: { good_families: true, avoid_families: true },
            })
          : null;

      const rows = await prisma.product.findMany({
        where: {
          deleted_at: null,
          status: 'AVAILABLE',
          retailer: {
            is_suspended: false,
            deleted_at: null,
            public_slug: { not: null },
            ...(box
              ? {
                  latitude: { gte: box.minLat, lte: box.maxLat },
                  longitude: { gte: box.minLng, lte: box.maxLng },
                }
              : city
                ? { city: { equals: city, mode: 'insensitive' as const } }
                : {}),
          },
          ...(budgetMax ? { price_min: { lte: budgetMax } } : {}),
          // Unsized garments (sarees, unstitched) have no sizes and must not vanish.
          ...(size ? { OR: [{ sizes: { has: size } }, { sizes: { isEmpty: true } }] } : {}),
        },
        orderBy: { created_at: 'desc' },
        take: CANDIDATE_CAP,
        include: {
          photos: { orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }], take: 1 },
          section: { select: { name: true } },
          _count: { select: { photos: true } },
          retailer: {
            select: {
              id: true,
              shop_name: true,
              public_slug: true,
              city: true,
              latitude: true,
              longitude: true,
            },
          },
        },
      });

      // The bounding box is a square; the radius is a circle.
      const inRange = origin
        ? rows.filter(
            (p) =>
              p.retailer.latitude !== null &&
              p.retailer.longitude !== null &&
              haversineDistance(
                origin.lat,
                origin.lng,
                p.retailer.latitude,
                p.retailer.longitude,
              ) <= b.radius_km,
          )
        : rows;

      // Find similar: a 0..1 score per candidate. Embedding where a product has one, attribute
      // overlap otherwise (and for everything if embeddings are unavailable). `similar` in the
      // response says which, so a degraded result is not passed off as a semantic match.
      const garment = b.similar ? parseGarmentDescriptor(b.similar) : null;
      let similarity: Map<string, number> | null = null;
      let similar: { source: 'embedding' | 'attributes'; embedded: number; total: number } | null =
        null;
      if (garment) {
        let cosines = new Map<string, number>();
        const vec = await embedDescriptor(garment);
        if (vec) {
          try {
            cosines = await embeddingSimilarities(
              vec,
              inRange.map((p) => p.id),
            );
          } catch (err) {
            console.error('[my-style] similarity query failed; using attribute match:', err);
          }
        }
        similarity = new Map(
          inRange.map((p) => [
            p.id,
            combineSimilarity(
              attributeScore(garment, {
                category: p.category,
                product_type: p.product_type,
                color_family: p.color_family,
                pattern: p.pattern,
                embellishments: p.embellishments,
              }),
              cosines.get(p.id) ?? null,
            ),
          ]),
        );
        similar = {
          source: cosines.size > 0 ? 'embedding' : 'attributes',
          embedded: cosines.size,
          total: inRange.length,
        };
      }

      const candidates: RankCandidate[] = inRange.map((p) => ({
        id: p.id,
        retailer_id: p.retailer_id,
        price_min: p.price_min,
        color_family: p.color_family,
        occasions: p.occasions,
        fabrics: p.fabrics,
        keywords: [p.category, p.subtype, ...p.styles, ...p.search_tags]
          .filter((k): k is string => !!k)
          .map((k) => k.toLowerCase()),
        avg_rating: p.avg_rating,
        rating_count: p.rating_count,
        created_at: p.created_at,
        lat: p.retailer.latitude,
        lng: p.retailer.longitude,
        ...(similarity ? { similarity: similarity.get(p.id) ?? 0 } : {}),
      }));

      // Trends and the running festival (PR-10). Tabs are a convenience: if these reads
      // fail the feed still answers, with the extra tabs hidden, and the failure is logged.
      const now = new Date();
      let trendRows: TrendRow[] = [];
      let festival: (FestivalRow & { name: string }) | null = null;
      try {
        const horizon = new Date(now.getTime() + FESTIVAL_LOOKAHEAD_DAYS * 86_400_000);
        const [trendsDb, festivalsDb] = await Promise.all([
          prisma.styleTrend.findMany({
            where: { is_active: true },
            select: {
              kind: true,
              match_keywords: true,
              boost: true,
              starts_at: true,
              ends_at: true,
              is_active: true,
            },
          }),
          prisma.festival.findMany({
            where: { deleted_at: null, ends_at: { gte: now }, starts_at: { lte: horizon } },
            select: { name: true, region: true, starts_at: true, ends_at: true, deleted_at: true },
          }),
        ]);
        trendRows = activeTrends(trendsDb, now);
        festival = pickFestival(festivalsDb, account.state ?? null, now);
      } catch (err) {
        console.error('[my-style] trends/festival read failed; tabs hidden:', err);
      }
      const tabs = {
        festival: festival ? { name: festival.name } : null,
        trending: trendRows.some((t) => t.kind === 'trending' && t.match_keywords.length > 0),
      };

      // Festival keywords only matter on the Festival tab; trending nudges every feed.
      const rankTrends = trendRows.filter((t) => t.kind === 'trending' || b.tab === 'festival');
      // A tab nobody can see (no festival / no trend) answers empty, not with the general feed.
      const tabLive =
        b.tab === 'festival' ? festival !== null : b.tab === 'trending' ? tabs.trending : true;
      const onTab = tabLive ? candidates.filter((c) => matchesTab(c, b.tab, trendRows)) : [];

      // `occasion` boosts rather than filters: occasions are AI-tagged (older/abstained
      // products are empty), so a hard filter would hide every untagged product. The label is
      // mapped to the ranker's spellings first (RC-070).
      const wanted = b.occasion ? occasionTargets(b.occasion) : [];
      let ranked = rankProducts(
        onTab,
        {
          palette: palette ? { good: palette.good_families, avoid: palette.avoid_families } : null,
          occasions: [...account.pref_occasions, ...wanted],
          colorFamilies: account.pref_colors,
          fabrics: account.pref_fabrics,
          origin,
          radiusKm: b.radius_km,
          trends: rankTrends,
        },
        b.sort,
        now,
      );
      // Occasion tab: tagged matches first, everything else after in ranked order. The count
      // lets the page say so honestly when no product carries the tag.
      let occasionMatches: number | null = null;
      if (b.tab === 'occasion' && wanted.length > 0) {
        const occById = new Map(onTab.map((c) => [c.id, c.occasions.map((o) => o.toLowerCase())]));
        const isMatch = (i: { id: string }) =>
          (occById.get(i.id) ?? []).some((o) => wanted.includes(o));
        occasionMatches = ranked.filter(isMatch).length;
        ranked = promoteMatches(ranked, isMatch);
      }

      const byId = new Map(inRange.map((p) => [p.id, p]));
      const pageItems = ranked.slice((b.page - 1) * b.limit, b.page * b.limit);
      const data = await Promise.all(
        pageItems.map(async (item) => {
          const p = byId.get(item.id);
          if (!p) throw new Error(`my-style: ranked id ${item.id} not in candidates`);
          return {
            ...(await toPublicProductSummary(p)),
            color_family: p.color_family,
            distance_km: item.distance_km,
            retailer: {
              shop_name: p.retailer.shop_name,
              slug: p.retailer.public_slug,
              city: p.retailer.city,
            },
          };
        }),
      );

      return {
        data,
        meta: {
          total: ranked.length,
          page: b.page,
          limit: b.limit,
          sort: b.sort,
          tab: b.tab,
          // Which extra tabs have something behind them; the page hides the rest.
          tabs,
          // Occasion tab only: how many products carry the requested tag (else null).
          occasion_matches: occasionMatches,
          location_scope: locationScope,
          rationale_source: 'none' as const,
          truncated: rows.length === CANDIDATE_CAP,
          // Null for an ordinary feed.
          similar,
          // What the palette card shows (PR-7). Null until a photo has been analysed.
          style_profile:
            account.skin_undertone && account.skin_depth
              ? {
                  undertone: account.skin_undertone,
                  depth: account.skin_depth,
                  frame: account.body_frame ?? null,
                  palette: palette
                    ? { good: palette.good_families, avoid: palette.avoid_families }
                    : null,
                }
              : null,
        },
      };
    },
  );

  // POST /my-style/enquire — one shortlist group (one store's picks) -> ONE F-044 inbox row,
  // then the store's WhatsApp link. The cross-store feed has no collection, and
  // collection_enquiries.collection_id is NOT NULL, so the row hangs off the store's oldest live
  // collection. A store with none still gets its link (recorded:false) — never a fake success.
  server.post(
    '/enquire',
    { config: { rateLimit: { max: 20, timeWindow: 60 * 1000 } } },
    async (request, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      const session = await getPassportSession(request.headers.cookie || '');
      if (!session) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'Passport session required' } });
      }
      const parsed = EnquireSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid enquiry');

      const retailer = await prisma.retailer.findFirst({
        where: { public_slug: parsed.data.retailer_slug, is_suspended: false, deleted_at: null },
        select: { id: true, shop_name: true, phone: true, whatsapp_number: true },
      });
      if (!retailer) throw notFound('Store');

      const ids = Array.from(new Set(parsed.data.product_ids));
      // Every id must be a live product of THIS store, checked before any write.
      const products = await prisma.product.findMany({
        where: { id: { in: ids }, retailer_id: retailer.id, deleted_at: null },
        select: { id: true, name: true, price_min: true },
      });
      if (products.length !== ids.length) {
        throw validationError('One or more products are not in this store', 'product_ids');
      }
      const byId = new Map(products.map((p) => [p.id, p]));
      const ordered = ids.flatMap((id) => byId.get(id) ?? []);

      const collection = await prisma.collection.findFirst({
        where: { retailer_id: retailer.id, status: 'ACTIVE', deleted_at: null },
        orderBy: { created_at: 'asc' },
        select: { id: true, title: true },
      });
      if (collection) {
        await prisma.collectionEnquiry.create({
          data: {
            collection_id: collection.id,
            retailer_id: retailer.id,
            product_id: ids[0] ?? null,
            product_ids: ids,
          },
        });
        await prisma.collection.update({
          where: { id: collection.id },
          data: { enquiry_count: { increment: 1 } },
        });
      }

      const whatsapp_url = buildWhatsAppEnquiryLink(
        enquiryPhone(retailer),
        buildEnquiryMessage({
          shopName: retailer.shop_name,
          collectionTitle: collection?.title ?? retailer.shop_name,
          products: ordered.map((p) => ({ name: p.name, price_min: p.price_min })),
        }),
      );
      return { data: { whatsapp_url, recorded: collection !== null } };
    },
  );
};
