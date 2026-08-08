// Auto-split from public.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { createHash } from 'node:crypto';
import { type Prisma, prisma } from '@kanchuki/db';
import { normalizeIndianPhone } from '@kanchuki/shared';
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

      return {
        data: categories
          .filter((c) => c._count.products > 0)
          .map((c) => ({
            id: c.id,
            name: c.name,
            image_url: c.image_url,
            product_count: c._count.products,
          })),
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
            },
            title: null,
            description: 'This store is temporarily unavailable.',
            expires_at: null,
            products: [],
            total: 0,
            page: 1,
            page_size: 0,
            filters: { categories: [], occasions: [], colors: [] },
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
          select: { category: true, occasions: true, primary_color: true },
        }),
      ]);

      const publicProducts = await Promise.all(rows.map((p) => toPublicProductSummary(p)));

      return {
        data: {
          retailer: {
            shop_name: retailer.shop_name,
            city: retailer.city,
            phone: retailer.phone,
            logo_url: retailer.logo_url ?? null,
            banner_url: retailer.banner_url ?? null,
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
        phone: z.string().min(10).max(15),
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
      },
      update: {
        name: body.data.name,
        gender: body.data.gender,
        consent_given: true,
        consent_at: new Date(),
      },
      select: { id: true, name: true },
    });

    return reply.status(201).send({ data: customer });
  });
};
