// Auto-split from public.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { isNewArrival, isOnSale } from '../../lib/product-flags.js';
import { notFound } from '../../plugins/error-handler.js';
import { displayUrl, toPublicProductSummary } from './public-helpers.js';

export const publicProductsRoutes: FastifyPluginAsync = async (server) => {
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

      const p = await prisma.product.findFirst({
        where: {
          id: productId,
          deleted_at: null,
          retailer: { deleted_at: null, is_suspended: false },
        },
        include: {
          photos: { orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }] },
          spin_frames: { orderBy: { frame_index: 'asc' } },
          variants: true,
          section: { select: { name: true } },
        },
      });
      if (!p) throw notFound('Product');

      reply.header(
        'Cache-Control',
        'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
      );

      const availableVariants = p.variants.filter((v) => v.status === 'AVAILABLE');
      const primaryPhoto = p.photos[0];

      return {
        data: {
          id: p.id,
          name: p.name,
          price_min: p.price_min,
          price_max: p.price_max,
          // F-024 (Option A): virtual query-time flags, same as the grid summary
          is_new_arrival: isNewArrival(p.created_at),
          on_sale: isOnSale({ mrp: p.mrp, price_min: p.price_min }),
          status: p.status,
          category: p.category,
          primary_color: p.primary_color,
          secondary_colors: p.secondary_colors,
          fabric_estimate: p.fabric_estimate,
          description: p.description,
          occasions: p.occasions,
          search_tags: p.search_tags,
          sizes: p.sizes,
          location: [p.section?.name, p.location_notes].filter(Boolean).join(' — ') || null,
          primary_photo_url: primaryPhoto
            ? await displayUrl(primaryPhoto.url, primaryPhoto.r2_key)
            : '',
          has_360: p.spin_frames.length > 0,
          photos: await Promise.all(
            p.photos.map(async (ph) => await displayUrl(ph.url, ph.r2_key)),
          ),
          spin_frames: await Promise.all(
            p.spin_frames.map(async (f) => await displayUrl(f.url, f.r2_key)),
          ),
          variants: await Promise.all(
            availableVariants.map(async (v) => ({
              color: v.color,
              photo_url: await displayUrl(v.photo_url ?? '', v.r2_key),
              status: v.status as string,
            })),
          ),
        },
      };
    },
  );

  // ─── GET /public/products/:productId/related ─────────────────────
  // Related products: same category, same retailer, excluding current product.
  // Returns up to 6 PublicProduct summaries (thin shape with primary photo).
  server.get(
    '/products/:productId/related',
    {
      config: {
        cacheControl: 'public, max-age=600, s-maxage=600, stale-while-revalidate=3600',
      },
    },
    async (request, reply) => {
      const { productId } = request.params as { productId: string };

      const product = await prisma.product.findFirst({
        where: { id: productId, deleted_at: null, retailer: { is_suspended: false } },
        select: { category: true, retailer_id: true },
      });
      if (!product || !product.category) return { data: [] };

      const related = await prisma.product.findMany({
        where: {
          retailer_id: product.retailer_id,
          category: product.category,
          id: { not: productId },
          deleted_at: null,
          status: 'AVAILABLE',
        },
        orderBy: { created_at: 'desc' },
        take: 6,
        include: {
          photos: { orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }], take: 1 },
          section: { select: { name: true } },
          _count: { select: { spin_frames: true } },
        },
      });

      const publicProducts = await Promise.all(related.map((r) => toPublicProductSummary(r)));

      reply.header(
        'Cache-Control',
        'public, max-age=600, s-maxage=600, stale-while-revalidate=3600',
      );

      return { data: publicProducts };
    },
  );
};
