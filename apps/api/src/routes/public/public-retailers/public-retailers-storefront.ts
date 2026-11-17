// public-retailers-storefront.ts — store profile + promotions + collections (split from apps/api/src/routes/public/public-retailers.ts — body byte-identical)
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { getPlaceRating } from '../../../lib/google-places.js';
import { placeMatchesShop } from '../../../lib/place-match.js';
import { withPublicCache } from '../../../lib/public-cache.js';
import { notFound } from '../../../plugins/error-handler.js';
export const publicRetailersStorefrontRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /public/retailers/:slug ─────────────────────────────────
  // QR profile page: no auth required. Storefront link only included if the
  // retailer has picked one and it's still an active collection.
  server.get('/retailers/:slug', async (request) => {
    const { slug } = request.params as { slug: string };

    // Redis-cached with single-flight stampede protection (lib/public-cache.ts).
    return withPublicCache(request.url, async () => {
      const retailer = await prisma.retailer.findFirst({
        where: { public_slug: slug, deleted_at: null },
        select: {
          id: true,
          shop_name: true,
          city: true,
          state: true,
          address_line1: true,
          address_line2: true,
          categories: true,
          logo_url: true,
          banner_url: true,
          storefront_collection_id: true,
          is_suspended: true,
          google_place_id: true,
        },
      });
      if (!retailer) throw notFound('Retailer');

      // F-015: Suspended retailer profile shows minimal info
      if (retailer.is_suspended) {
        return {
          data: {
            shop_name: retailer.shop_name,
            city: null,
            state: null,
            address_line1: null,
            address_line2: null,
            categories: [],
            logo_url: null,
            banner_url: null,
            storefront_slug: null,
            suspended: true,
          },
        };
      }

      const storefront = retailer.storefront_collection_id
        ? await prisma.collection.findFirst({
            where: { id: retailer.storefront_collection_id, status: 'ACTIVE', deleted_at: null },
            select: { slug: true },
          })
        : null;

      // Google's own rating of the shop, shown only when Places answered (null = hide the badge).
      // A lookup failure must never break the profile, hence the catch; the place id itself
      // stays server-side.
      // The retailer chose this place id themselves and Google proves no ownership, so a place
      // that is not plausibly the shop (name/city) or that another store also claims is NOT
      // shown: otherwise anyone could display a neighbour's better rating as their own.
      const placeId = retailer.google_place_id;
      let rating: Awaited<ReturnType<typeof getPlaceRating>> = null;
      if (placeId) {
        const place = await getPlaceRating(placeId).catch(() => null);
        if (place && placeMatchesShop(place, retailer)) {
          const claims = await prisma.retailer
            .count({
              where: { google_place_id: placeId, deleted_at: null, id: { not: retailer.id } },
            })
            .catch(() => 1); // cannot tell: hide
          if (claims === 0) rating = place;
        }
      }

      return {
        data: {
          shop_name: retailer.shop_name,
          city: retailer.city,
          state: retailer.state,
          address_line1: retailer.address_line1,
          address_line2: retailer.address_line2,
          categories: retailer.categories,
          logo_url: retailer.logo_url ?? null,
          banner_url: retailer.banner_url ?? null,
          storefront_slug: storefront?.slug ?? null,
          google_rating:
            placeId && rating
              ? {
                  rating: rating.rating,
                  count: rating.count,
                  url: `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(placeId)}`,
                }
              : null,
        },
      };
    });
  });
  // ─── GET /public/retailers/:slug/promotions ────────────────────
  // Customer-facing: list active promotions/discount codes for a retailer.
  // Surfaces as a banner on the collection page.
  server.get('/retailers/:slug/promotions', async (request) => {
    const { slug } = request.params as { slug: string };

    return withPublicCache(request.url, async () => {
      const retailer = await prisma.retailer.findFirst({
        where: { public_slug: slug, deleted_at: null, is_suspended: false },
        select: { id: true },
      });
      if (!retailer) throw notFound('Retailer');

      const now = new Date();
      const promotions = await prisma.promotion.findMany({
        where: {
          retailer_id: retailer.id,
          is_active: true,
          OR: [
            { starts_at: null, ends_at: null },
            { starts_at: null, ends_at: { gte: now } },
            { starts_at: { lte: now }, ends_at: null },
            { starts_at: { lte: now }, ends_at: { gte: now } },
          ],
        },
        select: {
          id: true,
          code: true,
          discount_type: true,
          discount_value: true,
          min_order_paise: true,
          ends_at: true,
        },
        orderBy: { created_at: 'desc' },
        take: 5,
      });

      return {
        data: promotions.map((p) => ({
          id: p.id,
          code: p.code,
          discount_type: p.discount_type,
          discount_value: p.discount_value,
          min_order_paise: p.min_order_paise,
          ends_at: p.ends_at?.toISOString() ?? null,
        })),
      };
    });
  });
  // ─── GET /public/retailers/:slug/collections ────────────────────
  // Customer-facing: list active collections for a retailer (seasonal/festival picks,
  // curated sets). Used to surface "Seasonal Picks" on the categories page.
  server.get('/retailers/:slug/collections', async (request) => {
    const { slug } = request.params as { slug: string };

    return withPublicCache(request.url, async () => {
      const retailer = await prisma.retailer.findFirst({
        where: { public_slug: slug, deleted_at: null, is_suspended: false },
        select: { id: true },
      });
      if (!retailer) throw notFound('Retailer');

      const collections = await prisma.collection.findMany({
        where: {
          retailer_id: retailer.id,
          status: 'ACTIVE',
          deleted_at: null,
        },
        select: {
          id: true,
          title: true,
          description: true,
          slug: true,
          view_count: true,
          favorite_count: true,
          products: {
            where: { product: { deleted_at: null } },
            select: {
              product: {
                select: {
                  id: true,
                  name: true,
                  category: true,
                  primary_color: true,
                  price_min: true,
                  price_max: true,
                  photos: {
                    orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }],
                    take: 1,
                    select: { url: true },
                  },
                },
              },
            },
            orderBy: { sort_order: 'asc' },
            take: 6,
          },
          _count: { select: { products: true } },
        },
        orderBy: { updated_at: 'desc' },
        take: 10,
      });

      return {
        data: collections.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          slug: c.slug,
          view_count: c.view_count,
          favorite_count: c.favorite_count,
          product_count: c._count.products,
          preview_products: c.products.map((cp) => ({
            id: cp.product.id,
            name: cp.product.name,
            category: cp.product.category,
            primary_color: cp.product.primary_color,
            price_min: cp.product.price_min,
            price_max: cp.product.price_max,
            photo_url: cp.product.photos[0]?.url ?? null,
          })),
        })),
      };
    });
  });
};
