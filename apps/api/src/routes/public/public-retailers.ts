// Auto-split from public.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { createHash } from 'node:crypto';
import { type Prisma, prisma } from '@kanchuki/db';
import { isValidIndianPhone, normalizeIndianPhone } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withPublicCache } from '../../lib/public-cache.js';
import { notFound, validationError } from '../../plugins/error-handler.js';
import {
  buildFacets,
  buildProductFilterWhere,
  publicProductQuerySchema,
  toPublicProductSummary,
} from './public-helpers.js';

export const publicRetailersRoutes: FastifyPluginAsync = async (server) => {
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
        },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      });

      // Total live catalog size — drives the "All Products" tile count on the
      // storefront categories page (includes products with no category).
      const totalProducts = await prisma.product.count({
        where: { retailer_id: retailer.id, deleted_at: null },
      });

      return {
        data: categories
          .filter((c) => c._count.products > 0)
          .map((c) => ({
            id: c.id,
            name: c.name,
            image_url: c.image_url,
            product_count: c._count.products,
          })),
        total_products: totalProducts,
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
            _count: { select: { spin_frames: true } },
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

      const category = await prisma.productCategory.findFirst({
        where: { id: categoryId, retailer_id: retailer.id },
        select: { name: true },
      });
      if (!category) throw notFound('Category');

      const productWhere: Prisma.ProductWhereInput = {
        ...buildProductFilterWhere(query),
        category_id: categoryId,
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
            _count: { select: { spin_frames: true } },
          },
        }),
        prisma.product.count({ where: productWhere }),
        prisma.product.findMany({
          where: { deleted_at: null, category_id: categoryId, retailer_id: retailer.id },
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
          title: category.name,
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
        },
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

  // ─── POST /public/retailers/:slug/leads ──────────────────────────
  // QR profile contact gate: Name, Phone, Gender, mandatory consent.
  // Upserts a Customer row under this retailer, same as retailer-manual-entry.
  server.post('/retailers/:slug/leads', async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const retailer = await prisma.retailer.findFirst({
      where: { public_slug: slug, deleted_at: null },
      select: { id: true, is_suspended: true },
    });
    if (!retailer) throw notFound('Retailer');

    // F-015: Block lead capture for suspended retailers
    if (retailer.is_suspended) {
      throw notFound('Retailer');
    }

    const body = z
      .object({
        name: z.string().min(1).max(200),
        phone: z
          .string()
          .min(10)
          .max(15)
          .refine((v) => isValidIndianPhone(v), 'Enter a valid 10-digit Indian mobile number'),
        gender: z.enum(['MALE', 'FEMALE']),
        consent: z.literal(true, { message: 'Consent is required' }),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const normalizedPhone = normalizeIndianPhone(body.data.phone);
    const phone_hash = createHash('sha256').update(normalizedPhone).digest('hex');

    const customer = await prisma.customer.upsert({
      where: { retailer_id_phone: { retailer_id: retailer.id, phone: normalizedPhone } },
      create: {
        retailer_id: retailer.id,
        name: body.data.name,
        phone: normalizedPhone,
        phone_hash,
        gender: body.data.gender,
        consent_given: true,
        consent_at: new Date(),
        // Roadmap B: mark the lead's origin so retailers can filter CRM by
        // QR-captured leads (Customer.source, migration 055).
        source: 'QR_SCAN',
      },
      update: {
        name: body.data.name,
        gender: body.data.gender,
        consent_given: true,
        consent_at: new Date(),
        source: 'QR_SCAN',
      },
      select: { id: true, name: true },
    });

    return reply.status(201).send({ data: customer });
  });
};
