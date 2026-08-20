// Admin routes for the Aggregator / Marketplace Sync.
// Admins see ALL retailers' channel connections, sync health, and aggregate stats.
// Retailers use /retailers/me/aggregators/* (retailer-scoped).
//
// SECURITY: guarded by adminAuthPreHandler like every /v1/admin route.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { notFound } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

export const adminAggregatorRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/aggregators ───────────────────────────────────────
  // List ALL channel syncs across all retailers, newest first.
  server.get('/aggregators', async () => {
    const syncs = await prisma.channelSync.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        retailer: {
          select: { id: true, shop_name: true, phone: true },
        },
      },
    });
    return { data: syncs };
  });

  // ─── GET /admin/aggregators/:id ───────────────────────────────────
  // Get a single sync with retailer info.
  server.get('/aggregators/:id', async (request) => {
    const { id } = request.params as { id: string };
    const sync = await prisma.channelSync.findUnique({
      where: { id },
      include: {
        retailer: {
          select: { id: true, shop_name: true, phone: true },
        },
      },
    });
    if (!sync) throw notFound('Channel sync');
    return { data: sync };
  });

  // ─── GET /admin/aggregators/stats ─────────────────────────────────
  // Aggregate stats across ALL retailers.
  server.get('/aggregators/stats', async () => {
    const [totalConnections, activeConnections, syncErrors, retailersWithChannels] =
      await Promise.all([
        prisma.channelSync.count(),
        prisma.channelSync.count({ where: { status: 'CONNECTED' } }),
        prisma.channelSync.count({ where: { status: 'ERROR' } }),
        prisma.channelSync.groupBy({ by: ['retailer_id'] }),
      ]);

    // Breakdown by channel type
    const byChannel = await prisma.channelSync.groupBy({
      by: ['channel'],
      _count: true,
      _sum: { products_synced: true, orders_synced: true },
    });

    return {
      data: {
        total_connections: totalConnections,
        active_connections: activeConnections,
        sync_errors: syncErrors,
        retailers_with_channels: retailersWithChannels.length,
        by_channel: byChannel.map((c) => ({
          channel: c.channel,
          count: c._count,
          total_products: c._sum.products_synced ?? 0,
          total_orders: c._sum.orders_synced ?? 0,
        })),
      },
    };
  });
};
