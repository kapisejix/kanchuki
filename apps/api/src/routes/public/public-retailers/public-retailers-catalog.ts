// public-retailers-catalog.ts — storefront product/category listings (split from apps/api/src/routes/public/public-retailers.ts — body byte-identical)
import { type Prisma, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { NEW_ARRIVAL_DAYS } from '../../../lib/product-flags.js';
import { withPublicCache } from '../../../lib/public-cache.js';
import { notFound, validationError } from '../../../plugins/error-handler.js';
import {
  buildFacets,
  buildProductFilterWhere,
  publicProductQuerySchema,
  toPublicProductSummary,
} from '../public-helpers.js';
export const publicRetailersCatalogRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /public/retailers/:slug/categories ──────────────────────
  // Customer-facing category picker — shown after the QR contact gate.
  server.get('/retailers/:slug/categories', async (request) => {
    const { slug } = request.params as { slug: string };
    // Redis-cached with single-flight stampede protection (lib/public-cache.ts).
    return withPublicCache(request.url, async () => {
      const retailer = await prisma.retailer.findFirst({
        where: { public_slug: slug, deleted_at: null },
        select: { id: true, is_suspended: true },
      });
      if (!retailer) throw notFound('Retailer');

      // F-015: Hide categories for suspended retailers
      if (retailer.is_suspended) {
        return { data: [] };
      }

      const categories = await prisma.productCategory.findMany({
        where: { retailer_id: retailer.id },
        include: {
          _count: {
            select: { products: { where: { deleted_at: null, status: 'AVAILABLE' } } },
          },
          products: {
            where: { deleted_at: null, status: 'AVAILABLE' },
            orderBy: [{ created_at: 'desc' }],
            take: 1,
            select: {
              photos: {
                orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
                take: 1,
                select: { url: true },
              },
            },
          },
        },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      });

      // For any category without image_url and where direct category_id products had no photo,
      // also check if there's any product matching the category name (F-024 name fallback)
      const missingImageCategories = categories.filter(
        (c) => !c.image_url && (!c.products.length || !c.products[0]?.photos.length),
      );

      const nameFallbackMap = new Map<string, string>();
      if (missingImageCategories.length > 0) {
        const fallbackProducts = await prisma.product.findMany({
          where: {
            retailer_id: retailer.id,
            deleted_at: null,
            status: 'AVAILABLE',
            category: { in: missingImageCategories.map((c) => c.name) },
          },
          select: {
            category: true,
            photos: {
              orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
              take: 1,
              select: { url: true },
            },
          },
        });
        for (const p of fallbackProducts) {
          if (p.category && p.photos[0]?.url && !nameFallbackMap.has(p.category)) {
            nameFallbackMap.set(p.category, p.photos[0].url);
          }
        }
      }

      // Total live catalog size — drives the "All Products" tile count on the
      // storefront categories page (includes products with no category).
      const totalProducts = await prisma.product.count({
        where: { retailer_id: retailer.id, deleted_at: null, status: 'AVAILABLE' },
      });

      // Products added within the last NEW_ARRIVAL_DAYS (21 days)
      const arrivalCutoff = new Date();
      arrivalCutoff.setDate(arrivalCutoff.getDate() - NEW_ARRIVAL_DAYS);
      const newArrivalsCount = await prisma.product.count({
        where: {
          retailer_id: retailer.id,
          deleted_at: null,
          status: 'AVAILABLE',
          created_at: { gte: arrivalCutoff },
        },
      });

      return {
        data: categories
          .filter((c) => c._count.products > 0)
          .map((c) => {
            const fallbackImg =
              c.products[0]?.photos[0]?.url ?? (nameFallbackMap.get(c.name) || null);
            return {
              id: c.id,
              name: c.name,
              image_url: c.image_url || fallbackImg,
              product_count: c._count.products,
            };
          }),
        total_products: totalProducts,
        new_arrivals_count: newArrivalsCount,
      };
    });
  });
  // ─── GET /public/retailers/:slug/products ──────────────────────
  // Full-catalog listing: every non-deleted product for the store, regardless
  // of category assignment — powers the "All Products" tile on the storefront
  // categories page so products with no category are never hidden. Shaped
  // exactly like the category/collection listings (PublicCollection) so the
  // web app reuses the same CollectionView component.
  server.get('/retailers/:slug/products', async (request) => {
    const { slug } = request.params as { slug: string };
    const parsedQuery = publicProductQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) throw validationError('Invalid query params');
    const query = parsedQuery.data;

    // Redis-cached with single-flight stampede protection (lib/public-cache.ts).
    return withPublicCache(request.url, async () => {
      const retailer = await prisma.retailer.findFirst({
        where: { public_slug: slug, deleted_at: null },
        select: {
          id: true,
          shop_name: true,
          city: true,
          phone: true,
          logo_url: true,
          banner_url: true,
          is_suspended: true,
          public_slug: true,
        },
      });
      if (!retailer) throw notFound('Retailer');

      // F-015: Hide products for suspended retailers
      if (retailer.is_suspended) {
        return {
          data: {
            retailer: {
              shop_name: retailer.shop_name,
              city: retailer.city,
              phone: retailer.phone,
              logo_url: null,
              banner_url: null,
              public_slug: retailer.public_slug,
            },
            title: 'All Products',
            description: 'This store is temporarily unavailable.',
            expires_at: null,
            products: [],
            total: 0,
            page: 1,
            page_size: 0,
            filters: { categories: [], colors: [] },
          },
        };
      }

      const productWhere: Prisma.ProductWhereInput = {
        ...buildProductFilterWhere(query),
        retailer_id: retailer.id,
      };
      const take = query.pageSize ?? (query.page ? 12 : undefined);
      const skip = query.page && take ? (query.page - 1) * take : undefined;

      const [rows, total, facetRows] = await Promise.all([
        prisma.product.findMany({
          where: productWhere,
          orderBy: { created_at: 'desc' },
          skip,
          take,
          include: {
            photos: { orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }], take: 1 },
            section: { select: { name: true } },
            _count: { select: { photos: true } },
          },
        }),
        prisma.product.count({ where: productWhere }),
        prisma.product.findMany({
          where: { deleted_at: null, retailer_id: retailer.id },
          select: { category: true, primary_color: true },
        }),
      ]);

      const publicProducts = await Promise.all(rows.map((p) => toPublicProductSummary(p)));

      return {
        data: {
          retailer: {
            id: retailer.id,
            shop_name: retailer.shop_name,
            city: retailer.city,
            phone: retailer.phone,
            logo_url: retailer.logo_url ?? null,
            banner_url: retailer.banner_url ?? null,
            public_slug: retailer.public_slug,
          },
          title: 'All Products',
          description: null,
          expires_at: null,
          products: publicProducts,
          total,
          page: query.page ?? 1,
          page_size: take ?? total,
          filters: buildFacets(facetRows),
        },
      };
    });
  });
  // ─── GET /public/retailers/:slug/categories/:categoryId ─────────
  // Product list for one category — shaped like /public/collections/:slug
  // so the web app can reuse the same CollectionView component.
  server.get('/retailers/:slug/categories/:categoryId', async (request) => {
    const { slug, categoryId } = request.params as { slug: string; categoryId: string };
    const parsedQuery = publicProductQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) throw validationError('Invalid query params');
    const query = parsedQuery.data;

    // Redis-cached with single-flight stampede protection (lib/public-cache.ts).
    return withPublicCache(request.url, async () => {
      const retailer = await prisma.retailer.findFirst({
        where: { public_slug: slug, deleted_at: null },
        select: {
          id: true,
          shop_name: true,
          city: true,
          phone: true,
          logo_url: true,
          banner_url: true,
          is_suspended: true,
          public_slug: true,
        },
      });
      if (!retailer) throw notFound('Retailer');

      // F-015: Hide products for suspended retailers
      if (retailer.is_suspended) {
        return {
          data: {
            retailer: {
              shop_name: retailer.shop_name,
              city: retailer.city,
              phone: retailer.phone,
              logo_url: null,
              banner_url: null,
              public_slug: retailer.public_slug,
            },
            title: null,
            description: 'This store is temporarily unavailable.',
            expires_at: null,
            products: [],
            total: 0,
            page: 1,
            page_size: 0,
            filters: { categories: [], colors: [] },
          },
        };
      }

      const isNewArrivals = categoryId === 'new-arrivals';
      const arrivalCutoff = new Date();
      arrivalCutoff.setDate(arrivalCutoff.getDate() - NEW_ARRIVAL_DAYS);

      let categoryTitle = 'New Arrivals';
      let productWhere: Prisma.ProductWhereInput;

      if (isNewArrivals) {
        productWhere = {
          ...buildProductFilterWhere(query),
          retailer_id: retailer.id,
          created_at: { gte: arrivalCutoff },
        };
      } else {
        const category = await prisma.productCategory.findFirst({
          where: { id: categoryId, retailer_id: retailer.id },
          select: { name: true },
        });
        if (!category) throw notFound('Category');
        categoryTitle = category.name;

        productWhere = {
          ...buildProductFilterWhere(query),
          retailer_id: retailer.id,
          OR: [
            { category_id: categoryId },
            { category: category.name },
            { search_tags: { has: category.name } },
          ],
        };
      }

      const take = query.pageSize ?? (query.page ? 12 : undefined);
      const skip = query.page && take ? (query.page - 1) * take : undefined;

      const [rows, total, facetRows] = await Promise.all([
        prisma.product.findMany({
          where: productWhere,
          orderBy: { created_at: 'desc' },
          skip,
          take,
          include: {
            photos: { orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }], take: 1 },
            section: { select: { name: true } },
            _count: { select: { photos: true } },
          },
        }),
        prisma.product.count({ where: productWhere }),
        prisma.product.findMany({
          where: productWhere,
          select: { category: true, primary_color: true },
        }),
      ]);

      const publicProducts = await Promise.all(rows.map((p) => toPublicProductSummary(p)));

      return {
        data: {
          retailer: {
            id: retailer.id,
            shop_name: retailer.shop_name,
            city: retailer.city,
            phone: retailer.phone,
            logo_url: retailer.logo_url ?? null,
            banner_url: retailer.banner_url ?? null,
            public_slug: retailer.public_slug,
          },
          title: categoryTitle,
          description: isNewArrivals ? 'Fresh additions from the last 21 days' : null,
          expires_at: null,
          products: publicProducts,
          total,
          page: query.page ?? 1,
          page_size: take ?? total,
          filters: buildFacets(facetRows),
        },
      };
    });
  });
};
