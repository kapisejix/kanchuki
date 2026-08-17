import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { computeInventoryAlerts } from './growth-helpers.js';

export const growthInventoryRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /growth/inventory-alerts ───────────────────────────────
  // Signal-based alerts (no stock quantities exist in the schema yet):
  //  - DEAD_STOCK: no view/enquiry for 90+ days
  //  - HIGH_VELOCITY: >= 3 paid units in the last 30 days
  //  - TOP_PERFORMER: 1-2 paid units in the last 30 days
  //  - UNLISTED: uploaded 30+ days ago, never interacted with
  server.get('/inventory-alerts', async (request) => {
    const retailerId = request.retailerId;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [products, views, enquiries, orders] = await Promise.all([
      prisma.product.findMany({
        where: { retailer_id: retailerId, deleted_at: null, status: 'AVAILABLE' },
        select: { id: true, name: true, sku: true, created_at: true },
        take: 500,
      }),
      prisma.customerInteraction.findMany({
        where: { retailer_id: retailerId, type: 'view', created_at: { gte: thirtyDaysAgo }, product_id: { not: null } },
        select: { product_id: true, created_at: true },
      }),
      prisma.collectionEnquiry.findMany({
        where: { retailer_id: retailerId, created_at: { gte: thirtyDaysAgo }, product_id: { not: null } },
        select: { product_id: true, created_at: true },
      }),
      prisma.orderItem.findMany({
        where: { order: { retailer_id: retailerId, status: 'PAID', paid_at: { gte: thirtyDaysAgo } } },
        select: { product_id: true, order: { select: { paid_at: true } } },
      }),
    ]);

    const interactions = new Map<string, { views_30d: number; enquiries_30d: number; last_interaction_at: Date | null }>();
    for (const v of views) {
      const row = interactions.get(v.product_id!) ?? { views_30d: 0, enquiries_30d: 0, last_interaction_at: null };
      row.views_30d++;
      if (!row.last_interaction_at || v.created_at > row.last_interaction_at) row.last_interaction_at = v.created_at;
      interactions.set(v.product_id!, row);
    }
    for (const e of enquiries) {
      const row = interactions.get(e.product_id!) ?? { views_30d: 0, enquiries_30d: 0, last_interaction_at: null };
      row.enquiries_30d++;
      if (!row.last_interaction_at || e.created_at > row.last_interaction_at) row.last_interaction_at = e.created_at;
      interactions.set(e.product_id!, row);
    }

    const sales = new Map<string, { sales_30d: number; last_sale_at: Date | null }>();
    for (const o of orders) {
      const row = sales.get(o.product_id) ?? { sales_30d: 0, last_sale_at: null };
      row.sales_30d++;
      const paidAt = o.order.paid_at;
      if (paidAt && (!row.last_sale_at || paidAt > row.last_sale_at)) row.last_sale_at = paidAt;
      sales.set(o.product_id, row);
    }

    const alerts = computeInventoryAlerts(products, interactions, sales, now);
    return {
      data: {
        alerts,
        counts: {
          dead_stock: alerts.filter((a) => a.kind === 'DEAD_STOCK').length,
          high_velocity: alerts.filter((a) => a.kind === 'HIGH_VELOCITY').length,
          top_performer: alerts.filter((a) => a.kind === 'TOP_PERFORMER').length,
          unlisted: alerts.filter((a) => a.kind === 'UNLISTED').length,
        },
      },
    };
  });
};
