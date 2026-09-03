// Auto-split from public.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { createHash } from 'node:crypto';
import { prisma, withRetry } from '@kanchuki/db';
import { buildEnquiryMessage } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withPublicCache } from '../../lib/public-cache.js';
import { notFound, validationError } from '../../plugins/error-handler.js';
// recordInteraction removed — customerInteractions model dropped
import {
  buildFacets,
  buildProductFilterWhere,
  publicProductQuerySchema,
  toPublicProductSummary,
} from './public-helpers.js';

export const publicCollectionsRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /public/collections/:slug ─────────────────────────────
  // Customer-facing: no auth required. Returns shop info + products.
  server.get(
    '/collections/:slug',
    {
      config: {
        // Browser/CDN cache for 5 min, stale-while-revalidate for 1 hour
        cacheControl: 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
      },
    },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const parsedQuery = publicProductQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) throw validationError('Invalid query params');
      const query = parsedQuery.data;

      reply.header(
        'Cache-Control',
        'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
      );

      // Redis-cached with single-flight stampede protection (see lib/public-cache.ts).
      return withPublicCache(request.url, () =>
        withRetry(
          async () => {
            // HIDDEN collections (Roadmap S — A/B variant links) are accessible
            // via direct slug link but excluded from storefront listings.
            const collection = await prisma.collection.findFirst({
              where: { slug, status: { in: ['ACTIVE', 'HIDDEN'] }, deleted_at: null },
              select: {
                id: true,
                title: true,
                description: true,
                expires_at: true,
                retailer: {
                  select: {
                    id: true,
                    shop_name: true,
                    city: true,
                    phone: true,
                    logo_url: true,
                    banner_url: true,
                    is_suspended: true,
                    public_slug: true,
                    latitude: true,
                    longitude: true,
                  },
                },
              },
            });

            if (!collection) throw notFound('Collection');

            // F-015: If the retailer is suspended, show "temporarily unavailable"
            // instead of 404 to avoid leaking suspension as a customer-visible error.
            if (collection.retailer.is_suspended) {
              return {
                data: {
                  suspended: true,
                  retailer: {
                    shop_name: collection.retailer.shop_name,
                    public_slug: collection.retailer.public_slug,
                  },
                  title: collection.title,
                  description:
                    'This store is temporarily unavailable via this link. Please contact the store directly for assistance.',
                  expires_at: null,
                  products: [],
                  total: 0,
                  page: 1,
                  page_size: 0,
                  filters: { categories: [], colors: [] },
                },
              };
            }

            // Check expiry
            if (collection.expires_at && collection.expires_at < new Date()) {
              // Mark expired in background (don't await)
              void prisma.collection
                .update({
                  where: { id: collection.id },
                  data: { status: 'EXPIRED' },
                })
                .catch(() => undefined);

              throw notFound('Collection');
            }

            const productWhere = buildProductFilterWhere(query);
            // No `page` param (e.g. the wishlist page, which needs every product to
            // match saved ids regardless of which page they'd fall on) => no skip/take.
            const take = query.pageSize ?? (query.page ? 12 : undefined);
            const skip = query.page && take ? (query.page - 1) * take : undefined;

            // Show ALL non-deleted products — SOLD/RESERVED get visual badges on the frontend.
            const [rows, total, facetRows] = await Promise.all([
              prisma.collectionProduct.findMany({
                where: { collection_id: collection.id, product: productWhere },
                orderBy: { sort_order: 'asc' },
                skip,
                take,
                include: {
                  product: {
                    include: {
                      photos: { orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }], take: 1 },
                      section: { select: { name: true } },
                      _count: { select: { photos: true } },
                    },
                  },
                },
              }),
              prisma.collectionProduct.count({
                where: { collection_id: collection.id, product: productWhere },
              }),
              prisma.product.findMany({
                where: {
                  deleted_at: null,
                  collection_items: { some: { collection_id: collection.id } },
                },
                select: { category: true, primary_color: true },
              }),
            ]);

            const publicProducts = await Promise.all(
              rows.map((cp) => toPublicProductSummary(cp.product)),
            );

            return {
              data: {
                retailer: collection.retailer,
                title: collection.title,
                description: collection.description,
                expires_at: collection.expires_at?.toISOString() ?? null,
                products: publicProducts,
                total,
                page: query.page ?? 1,
                page_size: take ?? total,
                filters: buildFacets(facetRows),
              },
            };
          },
          { label: 'collection-listing' },
        ),
      );
    },
  );

  // ─── POST /public/collections/:slug/view ───────────────────────
  server.post('/collections/:slug/view', async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const body = z.object({ viewer_token: z.string().max(128).optional() }).safeParse(request.body);
    if (!body.success) throw validationError('Invalid body');

    const collection = await prisma.collection.findFirst({
      where: { slug, status: { in: ['ACTIVE', 'HIDDEN'] }, deleted_at: null },
      select: { id: true, retailer_id: true },
    });
    if (!collection) return reply.status(204).send();

    const viewerToken = body.data.viewer_token ?? null;
    const ipHash = createHash('sha256')
      .update(request.ip + (request.headers['user-agent'] ?? ''))
      .digest('hex')
      .slice(0, 32);

    // Check if this viewer already logged a view in the last hour (dedup)
    const recentView = viewerToken
      ? await prisma.collectionView.findFirst({
          where: {
            collection_id: collection.id,
            viewer_token: viewerToken,
            created_at: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          },
        })
      : null;

    if (!recentView) {
      await prisma.collectionView.create({
        data: {
          collection_id: collection.id,
          retailer_id: collection.retailer_id,
          viewer_token: viewerToken,
          ip_hash: ipHash,
          user_agent: (request.headers['user-agent'] ?? '').slice(0, 255),
        },
      });

      // Increment cached view count
      await prisma.collection.update({
        where: { id: collection.id },
        data: {
          view_count: { increment: 1 },
          unique_viewer_count: viewerToken ? { increment: 1 } : undefined,
        },
      });
    }

    return reply.status(204).send();
  });

  // ─── POST /public/collections/:slug/enquire ────────────────────
  server.post('/collections/:slug/enquire', async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const body = z
      .object({
        product_id: z.string().optional(),
        product_ids: z.array(z.string()).max(20).optional(),
        customer_name: z.string().max(200).optional(),
        customer_phone: z.string().max(20).optional(),
        message: z.string().max(2000).optional(),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const collection = await prisma.collection.findFirst({
      where: {
        slug,
        status: { in: ['ACTIVE', 'HIDDEN'] },
        deleted_at: null,
        retailer: { is_suspended: false },
      },
      select: {
        id: true,
        retailer_id: true,
        title: true,
        retailer: { select: { shop_name: true, phone: true } },
      },
    });
    if (!collection) throw notFound('Collection');

    const { product_id, product_ids, customer_name, customer_phone, message } = body.data;

    // Record enquiry for analytics
    await prisma.collectionEnquiry.create({
      data: {
        collection_id: collection.id,
        retailer_id: collection.retailer_id,
        product_id: product_id ?? null,
        customer_name: customer_name ?? null,
        customer_phone: customer_phone ?? null,
        message: message ?? null,
      },
    });

    // Interactions recording removed — customerInteractions model dropped

    await prisma.collection.update({
      where: { id: collection.id },
      data: { enquiry_count: { increment: 1 } },
    });

    // Build WhatsApp redirect URL
    const interestedProducts = product_ids ?? (product_id ? [product_id] : []);
    const whatsappMessage =
      message ??
      buildEnquiryMessage({
        shopName: collection.retailer.shop_name,
        collectionTitle: collection.title,
        products: interestedProducts.map((id) => ({ name: id, price_min: null })),
      });

    const phone = collection.retailer.phone.replace(/\D/g, '');
    const fullPhone = phone.startsWith('91') ? phone : `91${phone}`;
    const waUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(whatsappMessage)}`;

    return reply.status(200).send({ data: { whatsapp_url: waUrl } });
  });

  // ─── POST /public/collections/:slug/favorite ───────────────────
  server.post('/collections/:slug/favorite', async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const body = z.object({ product_id: z.string() }).safeParse(request.body);
    if (!body.success) throw validationError('Invalid body');

    const collection = await prisma.collection.findFirst({
      where: { slug, status: { in: ['ACTIVE', 'HIDDEN'] }, deleted_at: null },
      select: { id: true, retailer_id: true },
    });
    if (!collection) return reply.status(204).send();

    // Increment favorite count (no user tracking — stored in localStorage on client)
    await prisma.collection.update({
      where: { id: collection.id },
      data: { favorite_count: { increment: 1 } },
    });

    // Interactions recording removed — customerInteractions model dropped

    return reply.status(204).send();
  });
};
