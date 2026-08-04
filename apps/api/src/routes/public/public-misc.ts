// Auto-split from public.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { getTheme } from '../admin-settings.js';

export const publicMiscRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /public/theme ─────────────────────────────────────────
  // Admin-configurable brand color (apps/web/src/app/admin/settings/theme).
  // No auth — read by the web app (CSS var injection) and the mobile app
  // (fetched at launch, see apps/mobile/src/lib/theme.tsx) so a color
  // change is live without a new deploy/app-store release.
  server.get(
    '/theme',
    {
      config: {
        cacheControl: 'public, max-age=60, s-maxage=60, stale-while-revalidate=600',
      },
    },
    async () => {
      const data = await getTheme();
      return { data };
    },
  );

  // ─── GET /public/stats ─────────────────────────────────────────
  // Landing page stats — real counts from the platform, no auth needed.
  server.get(
    '/stats',
    {
      config: {
        cacheControl: 'public, max-age=60, s-maxage=60, stale-while-revalidate=600',
      },
    },
    async (_request, reply) => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [productCount, collectionCount, retailerCount, monthEnquiries] = await Promise.all([
        prisma.product.count({ where: { deleted_at: null } }),
        prisma.collection.count({ where: { deleted_at: null } }),
        prisma.retailer.count({ where: { deleted_at: null } }),
        prisma.collectionEnquiry.count({ where: { created_at: { gte: monthStart } } }),
      ]);

      reply.header('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=600');

      return {
        data: {
          total_products: productCount,
          total_collections: collectionCount,
          total_retailers: retailerCount,
          enquiries_this_month: monthEnquiries,
        },
      };
    },
  );
};
