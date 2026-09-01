import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { computeInventoryAlerts } from './growth-helpers.js';

export const growthInventoryRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /growth/inventory-alerts ───────────────────────────────
  // Signal-based alerts (no stock quantities exist in the schema yet):
  //  - DEAD_STOCK: no view/enquiry for 90+ days
  //  - UNLISTED: uploaded 30+ days ago, never interacted with
  server.get('/inventory-alerts', async (request) => {
    const retailerId = request.retailerId;
    const now = new Date();

    const [products, enquiries] = await Promise.all([
      prisma.product.findMany({
        where: { retailer_id: retailerId, deleted_at: null, status: 'AVAILABLE' },
        select: { id: true, name: true, sku: true, created_at: true },
        take: 500,
      }),
      prisma.collectionEnquiry.findMany({
        where: { retailer_id: retailerId, product_id: { not: null } },
        select: { product_id: true, created_at: true },
      }),
    ]);

    const interactions = new Map<string, { views_30d: number; enquiries_30d: number; last_interaction_at: Date | null }>();
    for (const e of enquiries) {
      if (!e.product_id) continue;
      const row = interactions.get(e.product_id) ?? { views_30d: 0, enquiries_30d: 0, last_interaction_at: null };
      row.enquiries_30d++;
      if (!row.last_interaction_at || e.created_at > row.last_interaction_at) row.last_interaction_at = e.created_at;
      interactions.set(e.product_id, row);
    }

    const sales = new Map<string, { sales_30d: number; last_sale_at: Date | null }>();
    const alerts = computeInventoryAlerts(products, interactions, sales, now);

    return { data: alerts };
  });
};
