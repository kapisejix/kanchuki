// Store-directory endpoint for the /stores marketing page
// (docs/PLAN.md (Stores page copy)). Live, non-suspended storefronts only —
// same liveness bar as the sitemap discovery endpoint: has a public_slug,
// not suspended, not deleted, and ≥1 live product (a store with nothing to
// show isn't worth listing).
//
// Response also carries the distinct city list with store counts so the
// page can render filter chips from the same payload — no second round trip.
//
// Nearby mode: `lat` + `lng` switch the list to "stores near me", nearest
// first, starting at 2 km and widening 2 → 5 → 10 km until something is found.
import { type Prisma, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getBoundingBox, haversineDistance } from '../../lib/geo.js';
import { withPublicCache } from '../../lib/public-cache.js';
import { validationError } from '../../plugins/error-handler.js';

const RADIUS_STEPS_KM = [2, 5, 10];

const storesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(48).default(12),
    city: z.string().trim().min(1).max(100).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), 'lat and lng go together');

// Rounded to 3 decimals (~110 m): the shopper's exact position is neither
// stored nor used as a cache key, and nearby shoppers share cache entries.
const round3 = (n: number) => Math.round(n * 1000) / 1000;

const storeSelect = {
  public_slug: true,
  shop_name: true,
  city: true,
  address_line1: true,
  address_line2: true,
  logo_url: true,
  is_featured: true,
  _count: { select: { products: { where: { deleted_at: null } } } },
} satisfies Prisma.RetailerSelect;

export const publicStoresRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /public/stores ────────────────────────────────────────
  // Paginated directory of live storefronts. `city` is an exact match
  // against the city chips the API itself returns (no fuzzy matching —
  // the chips ARE the canonical city spellings); `q` is a case-insensitive
  // substring search over shop name OR city (the "kurtis in Jaipur" style
  // free-text from the page copy).
  server.get('/stores', async (request) => {
    const parsed = storesQuerySchema.safeParse(request.query);
    if (!parsed.success) throw validationError('Invalid query params');
    const { page, pageSize, city, q } = parsed.data;
    const geo =
      parsed.data.lat !== undefined && parsed.data.lng !== undefined
        ? { lat: round3(parsed.data.lat), lng: round3(parsed.data.lng) }
        : null;

    // Redis-cached with single-flight stampede protection (lib/public-cache.ts).
    // Each filter combination gets its own cache entry; TTL jitter absorbs
    // viral-traffic bursts. Nearby requests key on the ROUNDED coordinates,
    // never the raw ones.
    const cacheUrl = geo
      ? `/v1/public/stores?lat=${geo.lat}&lng=${geo.lng}&page=${page}&pageSize=${pageSize}`
      : request.url;

    return withPublicCache(cacheUrl, async () => {
      const liveWhere: Prisma.RetailerWhereInput = {
        public_slug: { not: null },
        is_suspended: false,
        deleted_at: null,
        products: { some: { deleted_at: null } },
      };

      const where: Prisma.RetailerWhereInput = {
        ...liveWhere,
        ...(city ? { city } : {}),
        ...(q
          ? {
              OR: [
                { shop_name: { contains: q, mode: 'insensitive' } },
                { city: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      };

      // Distinct city list with live-store counts — the filter chips.
      const cityGroupsPromise = prisma.retailer.groupBy({
        by: ['city'],
        where: liveWhere,
        _count: { _all: true },
      });

      type Row = Prisma.RetailerGetPayload<{ select: typeof storeSelect }>;
      let pageRows: { row: Row; distance_km: number | null }[];
      let total: number;
      let radiusKm: number | null = null;

      if (geo) {
        // One query at the widest radius; the 2 → 5 → 10 km widening is a
        // distance filter over that result, not three round trips.
        const maxRadius = RADIUS_STEPS_KM[RADIUS_STEPS_KM.length - 1] as number;
        const box = getBoundingBox(geo.lat, geo.lng, maxRadius);
        const candidates = await prisma.retailer.findMany({
          where: {
            ...liveWhere,
            latitude: { gte: box.minLat, lte: box.maxLat },
            longitude: { gte: box.minLng, lte: box.maxLng },
          },
          select: { ...storeSelect, latitude: true, longitude: true },
        });
        const withDistance = candidates
          .map((r) => ({
            row: r,
            distance_km:
              Math.round(
                haversineDistance(geo.lat, geo.lng, r.latitude as number, r.longitude as number) *
                  10,
              ) / 10,
          }))
          .sort((a, b) => a.distance_km - b.distance_km);

        radiusKm =
          RADIUS_STEPS_KM.find((step) => withDistance.some((s) => s.distance_km <= step)) ??
          maxRadius;
        const within = withDistance.filter((s) => s.distance_km <= (radiusKm as number));
        total = within.length;
        pageRows = within.slice((page - 1) * pageSize, page * pageSize);
      } else {
        const [rows, count] = await Promise.all([
          prisma.retailer.findMany({
            where,
            select: storeSelect,
            // Admin-pinned stores first (is_featured desc), then most recently
            // pinned first (featured_at desc — a fresh pin jumps to the top of
            // the featured block), then recency. See POST
            // /admin/retailers/:id/feature in admin-retailers-management.ts.
            orderBy: [{ is_featured: 'desc' }, { featured_at: 'desc' }, { updated_at: 'desc' }],
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
          prisma.retailer.count({ where }),
        ]);
        pageRows = rows.map((row) => ({ row, distance_km: null }));
        total = count;
      }

      // Store type = the audience segments (LADIES / MEN / KIDS) of the
      // categories that hold at least one live product — no new column.
      const slugs = pageRows.map(({ row }) => row.public_slug as string);
      const [segmentRows, cityGroups] = await Promise.all([
        slugs.length
          ? prisma.productCategory.findMany({
              where: {
                retailer: { public_slug: { in: slugs } },
                products: { some: { deleted_at: null } },
              },
              select: { segment: true, retailer: { select: { public_slug: true } } },
              distinct: ['retailer_id', 'segment'],
            })
          : Promise.resolve([]),
        cityGroupsPromise,
      ]);
      const typesBySlug = new Map<string, string[]>();
      for (const c of segmentRows) {
        const slug = c.retailer.public_slug as string;
        typesBySlug.set(slug, [...(typesBySlug.get(slug) ?? []), c.segment]);
      }

      const cities = cityGroups
        .filter((g) => g.city !== null)
        .map((g) => ({ city: g.city as string, count: g._count._all }))
        .sort((a, b) => b.count - a.count);

      return {
        data: {
          stores: pageRows.map(({ row: r, distance_km }) => ({
            public_slug: r.public_slug as string,
            shop_name: r.shop_name,
            city: r.city,
            address: [r.address_line1, r.address_line2].filter(Boolean).join(', ') || null,
            logo_url: r.logo_url,
            product_count: r._count.products,
            is_featured: r.is_featured,
            store_types: typesBySlug.get(r.public_slug as string) ?? [],
            distance_km,
          })),
          total,
          page,
          page_size: pageSize,
          total_pages: Math.max(1, Math.ceil(total / pageSize)),
          cities,
          nearby: geo !== null,
          radius_km: radiusKm,
        },
      };
    });
  });
};
