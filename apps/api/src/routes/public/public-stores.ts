// Store-directory endpoint for the /stores marketing page
// (docs/content/pages/stores.md). Live, non-suspended storefronts only —
// same liveness bar as the sitemap discovery endpoint: has a public_slug,
// not suspended, not deleted, and ≥1 live product (a store with nothing to
// show isn't worth listing).
//
// Response also carries the distinct city list with store counts so the
// page can render filter chips from the same payload — no second round trip.
import { type Prisma, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withPublicCache } from '../../lib/public-cache.js';
import { validationError } from '../../plugins/error-handler.js';

const storesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
  city: z.string().trim().min(1).max(100).optional(),
  q: z.string().trim().min(1).max(100).optional(),
});

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

    // Redis-cached with single-flight stampede protection (lib/public-cache.ts).
    // request.url includes the query string, so each filter combination gets
    // its own cache entry; TTL jitter absorbs viral-traffic bursts.
    return withPublicCache(request.url, async () => {
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

      const [rows, total, cityGroups] = await Promise.all([
        prisma.retailer.findMany({
          where,
          select: {
            public_slug: true,
            shop_name: true,
            city: true,
            logo_url: true,
            is_featured: true,
            _count: {
              select: { products: { where: { deleted_at: null } } },
            },
          },
          // Admin-pinned stores first (is_featured desc), then most recently
          // pinned first (featured_at desc — a fresh pin jumps to the top of
          // the featured block), then recency. See POST
          // /admin/retailers/:id/feature in admin-retailers-management.ts.
          orderBy: [{ is_featured: 'desc' }, { featured_at: 'desc' }, { updated_at: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.retailer.count({ where }),
        // Distinct city list with live-store counts — the filter chips.
        prisma.retailer.groupBy({
          by: ['city'],
          where: liveWhere,
          _count: { _all: true },
        }),
      ]);

      const cities = cityGroups
        .filter((g) => g.city !== null)
        .map((g) => ({ city: g.city as string, count: g._count._all }))
        .sort((a, b) => b.count - a.count);

      return {
        data: {
          stores: rows.map((r) => ({
            public_slug: r.public_slug as string,
            shop_name: r.shop_name,
            city: r.city,
            logo_url: r.logo_url,
            product_count: r._count.products,
            is_featured: r.is_featured,
          })),
          total,
          page,
          page_size: pageSize,
          total_pages: Math.max(1, Math.ceil(total / pageSize)),
          cities,
        },
      };
    });
  });
};
