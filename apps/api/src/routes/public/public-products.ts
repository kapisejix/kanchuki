// Auto-split from public.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma, withRetry } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hasFeatureForPlan } from '../../lib/features.js';
import { isNewArrival, isOnSale } from '../../lib/product-flags.js';
import { withPublicCache } from '../../lib/public-cache.js';
import { notFound, validationError } from '../../plugins/error-handler.js';
import {
  customerVisiblePhotos,
  displayUrl,
  groupCategoryFeed,
  rankRelatedProducts,
  toPublicProductSummary,
} from './public-helpers.js';

// How many "more like this" products the strip shows, and how many candidates
// are ranked to choose them from. The pool is what bounds the cost of the
// in-process scoring above — it is not a page size.
const RELATED_LIMIT = 6;
const RELATED_CANDIDATE_POOL = 60;

// Newest-first candidate window the homepage feed groups from — bounds one
// cache-miss regardless of catalog size.
const FEED_CANDIDATES = 400;

const feedQuerySchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), 'lat and lng go together');

const categoryProductsQuerySchema = z.object({
  category: z.string().trim().min(1).max(100),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(20),
});

// ~110 m, same rounding as /public/stores: exact position is never a cache key.
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export const publicProductsRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /public/category-feed ─────────────────────────────────
  // Homepage "shop by category" rows (F-042). Live products from live,
  // non-suspended storefronts, grouped by the retailer's ProductCategory name
  // (admin-seeded defaults, so spellings agree across shops). Optional lat/lng
  // → nearest shop first.
  server.get('/category-feed', async (request) => {
    const parsed = feedQuerySchema.safeParse(request.query);
    if (!parsed.success) throw validationError('Invalid query params');
    const geo =
      parsed.data.lat !== undefined && parsed.data.lng !== undefined
        ? { lat: round3(parsed.data.lat), lng: round3(parsed.data.lng) }
        : null;
    const cacheUrl = geo
      ? `/v1/public/category-feed?lat=${geo.lat}&lng=${geo.lng}`
      : '/v1/public/category-feed';

    return withPublicCache(cacheUrl, () =>
      withRetry(
        async () => {
          // ponytail: newest-400 window then nearest-first inside it — a far-away
          // shop's fresh upload can crowd out a near shop's older one in a very
          // large directory; add a DB-side distance filter if that shows up.
          const rows = await prisma.product.findMany({
            where: {
              deleted_at: null,
              status: 'AVAILABLE',
              category_id: { not: null },
              photos: { some: {} },
              retailer: { public_slug: { not: null }, is_suspended: false, deleted_at: null },
            },
            orderBy: { created_at: 'desc' },
            take: FEED_CANDIDATES,
            include: {
              photos: { orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }], take: 1 },
              section: { select: { name: true } },
              _count: { select: { photos: true } },
              product_category: { select: { name: true } },
              retailer: {
                select: {
                  public_slug: true,
                  shop_name: true,
                  city: true,
                  latitude: true,
                  longitude: true,
                },
              },
            },
          });

          const groups = groupCategoryFeed(rows, geo);
          const categories = await Promise.all(
            groups.map(async (g) => ({
              name: g.category,
              products: await Promise.all(
                g.items.map(async ({ row, distance_km }) => ({
                  ...(await toPublicProductSummary(row)),
                  shop: {
                    public_slug: row.retailer.public_slug as string,
                    shop_name: row.retailer.shop_name,
                    city: row.retailer.city,
                    distance_km,
                  },
                })),
              ),
            })),
          );
          return { data: { categories, nearby: geo !== null } };
        },
        { label: 'category-feed' },
      ),
    );
  });

  // ─── GET /public/category-products ─────────────────────────────
  // Full listing behind a homepage row's "View more": every live product in one
  // category (exact ProductCategory name), newest first, paginated.
  server.get('/category-products', async (request) => {
    const parsed = categoryProductsQuerySchema.safeParse(request.query);
    if (!parsed.success) throw validationError('Invalid query params');
    const { category, page, pageSize } = parsed.data;

    return withPublicCache(request.url, () =>
      withRetry(
        async () => {
          const where = {
            deleted_at: null,
            status: 'AVAILABLE' as const,
            photos: { some: {} },
            product_category: { name: category },
            retailer: { public_slug: { not: null }, is_suspended: false, deleted_at: null },
          };
          const [rows, total] = await Promise.all([
            prisma.product.findMany({
              where,
              orderBy: { created_at: 'desc' },
              skip: (page - 1) * pageSize,
              take: pageSize,
              include: {
                photos: { orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }], take: 1 },
                section: { select: { name: true } },
                _count: { select: { photos: true } },
                retailer: { select: { public_slug: true, shop_name: true, city: true } },
              },
            }),
            prisma.product.count({ where }),
          ]);
          const products = await Promise.all(
            rows.map(async (row) => ({
              ...(await toPublicProductSummary(row)),
              shop: {
                public_slug: row.retailer.public_slug as string,
                shop_name: row.retailer.shop_name,
                city: row.retailer.city,
                distance_km: null,
              },
            })),
          );
          return {
            data: {
              category,
              products,
              total,
              page,
              page_size: pageSize,
              total_pages: Math.max(1, Math.ceil(total / pageSize)),
            },
          };
        },
        { label: 'category-products' },
      ),
    );
  });

  // ─── GET /public/products/:productId ───────────────────────────
  // Full product detail (photos, spin frames, variants) — fetched on demand
  // when the customer opens a product from the grid, not on initial load.
  // Not scoped to a specific collection/category: any non-deleted product
  // under a non-deleted retailer is fetchable, matching the exposure level
  // the categories list already gives (no ACTIVE-collection requirement).
  server.get(
    '/products/:productId',
    {
      config: {
        cacheControl: 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
      },
    },
    async (request, reply) => {
      const { productId } = request.params as { productId: string };

      reply.header(
        'Cache-Control',
        'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
      );

      // Redis-cached with single-flight stampede protection (lib/public-cache.ts).
      return withPublicCache(request.url, () =>
        withRetry(
          async () => {
            const p = await prisma.product.findFirst({
              where: {
                id: productId,
                deleted_at: null,
                retailer: { deleted_at: null, is_suspended: false },
              },
              include: {
                photos: { orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }] },
                variants: true,
                videos: { orderBy: [{ is_main: 'desc' }, { created_at: 'asc' }] },
                section: { select: { name: true } },
                // The store's plan decides whether the shopper sees a Try-On
                // button. It rides on this payload (rather than a separate
                // fetch) because this is the request that already gates the
                // button's screen, and it becomes a public field the moment it
                // is here — so it is derived per request, never cached beyond
                // the response's own 300s s-maxage.
                retailer: { select: { plan: true } },
              },
            });
            if (!p) throw notFound('Product');

            const tryOnEnabled = await hasFeatureForPlan(p.retailer.plan, 'VIRTUAL_TRY_ON_V2');

            const availableVariants = p.variants.filter((v) => v.status === 'AVAILABLE');
            // Raw retailer uploads are normally hidden from the customer catalog
            // (customerVisiblePhotos — only AI Studio / background-cleaned shots).
            // But if the retailer only cleaned one shot, that filter collapses the
            // detail gallery to a single photo and the thumbnail slider disappears.
            // Fall back to every photo when <2 survive the filter.
            const cleanedPhotos = customerVisiblePhotos(p.photos);
            const visiblePhotos = cleanedPhotos.length > 1 ? cleanedPhotos : p.photos;
            const primaryPhoto = visiblePhotos[0];

            return {
              data: {
                id: p.id,
                name: p.name,
                price_min: p.price_min,
                price_max: p.price_max,
                // F-024 (Option A): virtual query-time flags, same as the grid summary
                is_new_arrival: isNewArrival(p.created_at),
                on_sale: isOnSale({ mrp: p.mrp, price_min: p.price_min }),
                // F-040. False for every plan until an admin enables
                // VIRTUAL_TRY_ON_V2 in the Plan Feature Matrix, so the button
                // simply does not exist on the day this ships.
                try_on_enabled: tryOnEnabled,
                status: p.status,
                category: p.category,
                primary_color: p.primary_color,
                secondary_colors: p.secondary_colors,
                fabric_estimate: p.fabric_estimate,
                description: p.description,
                search_tags: p.search_tags,
                sizes: p.sizes,
                // Roadmap N: Indian fit flags (blouse-piece / unstitched markers).
                is_unstitched: p.is_unstitched,
                includes_blouse: p.includes_blouse,
                location: [p.section?.name, p.location_notes].filter(Boolean).join(' — ') || null,
                primary_photo_url: primaryPhoto
                  ? await displayUrl(primaryPhoto.url, primaryPhoto.r2_key)
                  : '',
                has_360: false,
                avg_rating: p.avg_rating,
                rating_count: p.rating_count,
                photos: await Promise.all(
                  visiblePhotos.map(async (ph) => await displayUrl(ph.url, ph.r2_key)),
                ),
                variants: await Promise.all(
                  availableVariants.map(async (v) => ({
                    color: v.color,
                    photo_url: await displayUrl(v.photo_url ?? '', v.r2_key),
                    status: v.status as string,
                  })),
                ),
                // Roadmap Q: short product clips alongside photos.
                videos: p.videos.map((v) => ({
                  id: v.id,
                  url: v.public_url,
                  duration_sec: v.duration_sec,
                  is_main: v.is_main,
                })),
              },
            };
          },
          { label: 'product-detail' },
        ),
      );
    },
  );

  // ─── GET /public/products/:productId/related ─────────────────────
  // Related products: same retailer, excluding the current product, ranked by
  // attribute overlap (category / subtype / fabric / colour / price band) rather
  // than category alone. Returns up to 6 PublicProduct summaries (thin shape
  // with primary photo).
  server.get(
    '/products/:productId/related',
    {
      config: {
        cacheControl: 'public, max-age=600, s-maxage=600, stale-while-revalidate=3600',
      },
    },
    async (request, reply) => {
      const { productId } = request.params as { productId: string };

      reply.header(
        'Cache-Control',
        'public, max-age=600, s-maxage=600, stale-while-revalidate=3600',
      );

      // Redis-cached with single-flight stampede protection (lib/public-cache.ts).
      return withPublicCache(request.url, () =>
        withRetry(
          async () => {
            const product = await prisma.product.findFirst({
              where: { id: productId, deleted_at: null, retailer: { is_suspended: false } },
              select: {
                category: true,
                subtype: true,
                fabrics: true,
                primary_color: true,
                price_min: true,
                created_at: true,
                retailer_id: true,
              },
            });
            // Nothing to match on at all — not even a fabric. (This used to bail
            // on a missing category alone, which hid every related product for a
            // garment the tagger left uncategorised but described by fabric.)
            const hasSignal =
              !!product &&
              !!(product.category || product.subtype || (product.fabrics?.length ?? 0) > 0);
            if (!product || !hasSignal) return { data: [] };

            // Candidates must share at least one real attribute, so the pool is
            // relevant; the ranking below then decides the order. Bounded rather
            // than "every AVAILABLE product in the store" — a 3,000-SKU retailer
            // would otherwise pull the whole catalog on each detail open.
            const related = await prisma.product.findMany({
              where: {
                retailer_id: product.retailer_id,
                id: { not: productId },
                deleted_at: null,
                status: 'AVAILABLE',
                OR: [
                  ...(product.category ? [{ category: product.category }] : []),
                  ...(product.subtype ? [{ subtype: product.subtype }] : []),
                  ...(product.fabrics?.length ? [{ fabrics: { hasSome: product.fabrics } }] : []),
                ],
              },
              orderBy: { created_at: 'desc' },
              take: RELATED_CANDIDATE_POOL,
              include: {
                photos: { orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }], take: 1 },
                section: { select: { name: true } },
                _count: { select: { photos: true } },
              },
            });

            const ranked = rankRelatedProducts(product, related, RELATED_LIMIT);
            const publicProducts = await Promise.all(ranked.map((r) => toPublicProductSummary(r)));

            return { data: publicProducts };
          },
          { label: 'related-products' },
        ),
      );
    },
  );
};
