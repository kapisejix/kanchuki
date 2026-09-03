// public-retailers-sitemap.ts — storefront sitemap index (split from apps/api/src/routes/public/public-retailers.ts — body byte-identical)
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { withPublicCache } from '../../../lib/public-cache.js';
export const publicRetailersSitemapRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /public/retailers ─────────────────────────────────────
  // Sitemap / storefront discovery: every live retailer (has a public
  // storefront slug, not suspended/deleted, has ≥1 live product) with their
  // indexable storefront URLs — categories, active collections, and each
  // collection's products — so the web sitemap can enumerate every store
  // with one request. Categories mirror the storefront categories page (only
  // those with live products); collections mirror the storefront (ACTIVE,
  // not deleted), each carrying its product IDs + primary photos so the
  // sitemap can emit the shared-product URLs
  // (/{store}/{collection}/product/{id}) with their Google image-sitemap
  // extensions. The store also carries a store-wide photo list for the All
  // Products page images (see app/sitemap.ts). No onboarding_completed gate:
  // the QR slug can exist before onboarding wraps (POST /me/qr-slug is
  // independent of the onboarding patch), and the storefront itself never
  // gates on it — a live store must not be excluded.
  //
  // Caps: Google allows up to 1,000 images per URL block, but capping well
  // below that keeps the payload small and the sitemap XML well under the
  // 50MB-per-file limit even at the 10,000-URL chunk size. Note this cap
  // ALSO bounds how many product URLs each collection contributes to the
  // sitemap (the newest 200 per collection) — larger collections get their
  // newest products indexed, older ones wait for a crawl of the collection
  // page itself.
  const MAX_PHOTOS_PER_PAGE = 200;
  server.get('/retailers', async (request) => {
    return withPublicCache(request.url, async () => {
      const retailers = await prisma.retailer.findMany({
        where: {
          public_slug: { not: null },
          is_suspended: false,
          deleted_at: null,
          // A storefront with nothing to show isn't worth indexing.
          products: { some: { deleted_at: null } },
        },
        select: {
          public_slug: true,
          shop_name: true,
          city: true,
          updated_at: true,
          product_categories: {
            where: { products: { some: { deleted_at: null, status: 'AVAILABLE' } } },
            select: {
              id: true,
              name: true,
              // Primary photo of each live product in the category — the
              // images that actually render on the category page. Product name
              // becomes the Google image <image:title>.
              products: {
                where: { deleted_at: null },
                select: {
                  name: true,
                  photos: {
                    orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }],
                    take: 1,
                    select: { url: true },
                  },
                },
                orderBy: { created_at: 'desc' },
                take: MAX_PHOTOS_PER_PAGE,
              },
            },
            orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
          },
          // Store-wide product photos — the images on the All Products page.
          products: {
            where: { deleted_at: null },
            select: {
              name: true,
              photos: {
                orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }],
                take: 1,
                select: { url: true },
              },
            },
            orderBy: { created_at: 'desc' },
            take: MAX_PHOTOS_PER_PAGE,
          },
          collections: {
            where: { status: 'ACTIVE', deleted_at: null },
            select: {
              slug: true,
              // Product URLs per collection for the sitemap — each
              // shared-product page (/{store}/{collection}/product/{id}) is
              // emitted with its primary photo as the image extension.
              // Collection.products is the CollectionProduct junction, so
              // the product itself is one hop deeper.
              products: {
                where: { product: { deleted_at: null } },
                select: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      photos: {
                        orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }],
                        take: 1,
                        select: { url: true },
                      },
                    },
                  },
                },
                orderBy: { product: { created_at: 'desc' } },
                take: MAX_PHOTOS_PER_PAGE,
              },
            },
            orderBy: { updated_at: 'desc' },
          },
        },
        orderBy: { updated_at: 'desc' },
        take: 5000,
      });

      return {
        data: retailers
          .filter((r) => r.public_slug !== null)
          .map((r) => ({
            public_slug: r.public_slug,
            shop_name: r.shop_name,
            city: r.city,
            updated_at: r.updated_at.toISOString(),
            categories: r.product_categories.map((c) => ({
              id: c.id,
              name: c.name,
              photos: c.products.flatMap((p) =>
                p.photos[0] ? [{ url: p.photos[0].url, name: p.name }] : [],
              ),
            })),
            collections: r.collections.map((c) => ({
              slug: c.slug,
              products: c.products.flatMap((cp) =>
                cp.product.photos[0]
                  ? [
                      {
                        id: cp.product.id,
                        name: cp.product.name,
                        url: cp.product.photos[0].url,
                      },
                    ]
                  : [],
              ),
            })),
            product_photos: r.products.flatMap((p) =>
              p.photos[0] ? [{ url: p.photos[0].url, name: p.name }] : [],
            ),
          })),
      };
    });
  });
};
