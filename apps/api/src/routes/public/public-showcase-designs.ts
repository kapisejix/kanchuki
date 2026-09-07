// Public Suits Designs routes (docs/tasks/suits-designs.md §2.4/§5).
//
// Three reads, all cacheable (Redis single-flight via withPublicCache +
// s-maxage 300) and all leak-free: only is_active rows, only GLOBAL rows plus
// the queried product's/store's own retailer rows — never another store's.
//   GET /showcase-designs?product_id=<id>   — strip for a product detail page
//   GET /showcase-designs?store=<slug>[&category=<slug>] — "View more" browse
//   GET /showcase-designs/:id               — public permalink data
//
// The product → showcase-category hop is a NAME match (case-insensitive, no
// code map): a product whose category string equals an active showcase
// category gets that category + its related slugs expanded. Admins own the
// category names, so aligning the two taxonomies is a data action, not code.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withPublicCache } from '../../lib/public-cache.js';
import { getShowcaseWatermarkConfig } from '../../lib/showcase-watermark.js';
import { notFound } from '../../plugins/error-handler.js';

const CACHE_HEADERS = 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600';
const BROWSE_PAGE_SIZE = 24;

/** Slugs a showcase category expands to — itself + every related category on
 *  either side of the symmetric self-M2M. */
function expandSlugs(slug: string, related: { slug: string }[]): string[] {
  const out = [slug];
  for (const r of related) {
    if (!out.includes(r.slug)) out.push(r.slug);
  }
  return out;
}

/** Match a product-category string to an active showcase category. */
async function matchShowcaseCategory(
  productCategory: string,
): Promise<{ slug: string; name: string; expandedSlugs: string[] } | null> {
  const category = await prisma.showcaseDesignCategory.findFirst({
    where: { name: { equals: productCategory, mode: 'insensitive' }, is_active: true },
    select: {
      slug: true,
      name: true,
      related_to: { select: { slug: true } },
      related_from: { select: { slug: true } },
    },
  });
  if (!category) return null;
  return {
    slug: category.slug,
    name: category.name,
    expandedSlugs: expandSlugs(category.slug, [...category.related_to, ...category.related_from]),
  };
}

async function resolveStore(storeSlug: string): Promise<{ id: string }> {
  const retailer = await prisma.retailer.findFirst({
    where: { public_slug: storeSlug, deleted_at: null, is_suspended: false },
    select: { id: true },
  });
  if (!retailer) throw notFound('Store');
  return retailer;
}

// Every public row is stripped to what the storefront renders — no r2 keys,
// no original_r2_key, no is_active flag, no retailer ids beyond the owner
// store's public identity.
const designSelect = {
  id: true,
  name: true,
  image_url: true,
  category_slug: true,
  retailer_id: true,
  category: { select: { name: true, slug: true } },
  retailer: { select: { id: true, shop_name: true, public_slug: true } },
} as const;

type BrowseDesign = {
  id: string;
  name: string | null;
  image_url: string;
  category: { slug: string; name: string | null };
  store: { shop_name: string | null; slug: string | null } | null;
};

function mapBrowseDesign(d: {
  id: string;
  name: string | null;
  image_url: string;
  category_slug: string;
  category: { name: string | null } | null;
  retailer_id: string | null;
  retailer: { id: string; shop_name: string | null; public_slug: string | null } | null;
}): BrowseDesign {
  return {
    id: d.id,
    name: d.name,
    image_url: d.image_url,
    category: { slug: d.category_slug, name: d.category?.name ?? null },
    store:
      d.retailer_id === null || !d.retailer
        ? null
        : { shop_name: d.retailer.shop_name, slug: d.retailer.public_slug },
  };
}

export const publicShowcaseDesignsRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /showcase-designs?product_id=<id> — product-detail strip ──
  server.get(
    '/showcase-designs',
    { config: { cacheControl: CACHE_HEADERS } },
    async (request, reply) => {
      const qs = z
        .object({
          product_id: z.string().min(1).optional(),
          store: z.string().min(1).optional(),
          category: z.string().min(1).optional(),
        })
        .safeParse(request.query);
      if (!qs.success) throw notFound('Showcase designs');
      const { product_id, store, category } = qs.data;
      if (product_id && (store || category)) throw notFound('Showcase designs');

      reply.header('Cache-Control', CACHE_HEADERS);
      return withPublicCache(request.url, async () => {
        // ── ?product_id=<id> — the product-detail strip ──────────────
        if (product_id) {
          const product = await prisma.product.findFirst({
            where: { id: product_id, deleted_at: null },
            select: { category: true, retailer_id: true },
          });
          if (!product) throw notFound('Product');

          const matched = product.category ? await matchShowcaseCategory(product.category) : null;
          let designs: BrowseDesign[] = [];
          let categoryInfo: { slug: string; name: string; related: string[] } | null = null;
          if (matched) {
            categoryInfo = {
              slug: matched.slug,
              name: matched.name,
              related: matched.expandedSlugs,
            };
            const limit = (await getShowcaseWatermarkConfig()).strip_count;
            const rows = await prisma.showcaseDesign.findMany({
              where: {
                is_active: true,
                category_slug: { in: matched.expandedSlugs },
                OR: [{ retailer_id: null }, { retailer_id: product.retailer_id }],
              },
              select: designSelect,
              orderBy: [{ sort_order: 'asc' }, { created_at: 'desc' }],
              take: limit,
            });
            designs = rows.map((d) => mapBrowseDesign(d));
          }
          return { data: { designs, category: categoryInfo } };
        }

        // ── ?store=<slug>[&category=<slug>] — the browse feed ────────
        const retailer = await resolveStore(store ?? '');
        const where: Record<string, unknown> = {
          is_active: true,
          OR: [{ retailer_id: null }, { retailer_id: retailer.id }],
        };
        let related: string[] = [];
        if (category) {
          const cat = await prisma.showcaseDesignCategory.findFirst({
            where: { slug: category, is_active: true },
            select: {
              slug: true,
              related_to: { select: { slug: true } },
              related_from: { select: { slug: true } },
            },
          });
          if (!cat) throw notFound('Design category');
          related = expandSlugs(cat.slug, [...cat.related_to, ...cat.related_from]);
          where.category_slug = { in: related };
        }

        const rows = await prisma.showcaseDesign.findMany({
          where,
          select: designSelect,
          orderBy: [{ sort_order: 'asc' }, { created_at: 'desc' }],
          take: BROWSE_PAGE_SIZE,
        });
        return {
          data: {
            designs: rows.map((d) => mapBrowseDesign(d)),
            related,
            next_cursor: null,
          },
        };
      });
    },
  );

  // ─── GET /showcase-designs/:id — public permalink data ────────────
  server.get(
    '/showcase-designs/:id',
    { config: { cacheControl: CACHE_HEADERS } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      reply.header('Cache-Control', CACHE_HEADERS);
      return withPublicCache(request.url, async () => {
        const design = await prisma.showcaseDesign.findFirst({
          where: { id, is_active: true },
          select: {
            id: true,
            name: true,
            image_url: true,
            category_slug: true,
            retailer_id: true,
            created_at: true,
            category: { select: { name: true } },
            retailer: { select: { id: true, shop_name: true, public_slug: true } },
          },
        });
        if (!design) throw notFound('Design');
        return {
          data: {
            id: design.id,
            name: design.name,
            image_url: design.image_url,
            category: { slug: design.category_slug, name: design.category?.name ?? null },
            // Global designs have no owning store — the permalink page falls
            // back to the platform (Kanchuki) identity for the store row.
            store:
              design.retailer_id === null
                ? null
                : {
                    shop_name: design.retailer?.shop_name ?? null,
                    slug: design.retailer?.public_slug ?? null,
                  },
            created_at: design.created_at,
          },
        };
      });
    },
  );
};
