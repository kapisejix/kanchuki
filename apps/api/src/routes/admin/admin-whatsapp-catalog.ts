// Admin WhatsApp Catalog Sync monitor (Phase II, breakdown G1–G5).
//
// Admin panel only — no retailer-facing surface. Guards every route with the
// standard adminAuthPreHandler (admin key + CSRF) like all /v1/admin modules.
//
//   GET  /admin/whatsapp-catalog/overview                — all retailers + global health (G1/G2/G5)
//   GET  /admin/whatsapp-catalog/retailers/:id/logs      — drill-down sync history (G3)
//   GET  /admin/whatsapp-catalog/retailers/:id/items     — drill-down item mapping (G3)
//   POST /admin/whatsapp-catalog/retailers/:id/sync      — force a full sync (G4)
//
// G5 health numbers are derived live from CatalogItem status + CatalogSyncLog
// rows (no snapshots): total/configured/syncing retailers, item counts by
// status, failed logs in the last 7 days, and an error-rate percentage.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { addCatalogSyncJob } from '../../jobs/index.js';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const adminWhatsAppCatalogRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/whatsapp-catalog/overview ───────────────────────
  // Every retailer (non-deleted) with their sync state + per-status item
  // counts, plus a global health block for the page's stat cards (G5).
  server.get('/whatsapp-catalog/overview', async () => {
    const retailers = await prisma.retailer.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        shop_name: true,
        city: true,
        plan: true,
        whatsapp_catalog_id: true,
        whatsapp_api_access_token: true,
        sync_enabled: true,
        sync_categories: true,
        last_synced_at: true,
      },
      orderBy: { created_at: 'asc' },
    });

    // Per-retailer item counts by status — one groupBy covers both the table
    // columns and the global health totals.
    const [itemGroups, failedLogs7d, cronLogs7d] = await Promise.all([
      prisma.catalogItem.groupBy({
        by: ['retailer_id', 'status'],
        _count: true,
      }),
      prisma.catalogSyncLog.count({
        where: { status: 'FAILED', created_at: { gte: new Date(Date.now() - WEEK_MS) } },
      }),
      // Daily-cron visibility: schedule-triggered full_sync logs from the last
      // 7 days (payload_json.triggered_by === 'schedule' — JSON path filter,
      // same pattern as admin-contact.ts/deployments.ts). The cron fans out one
      // full_sync job per eligible retailer, so "a cron failure" is one or more
      // FAILED schedule-triggered logs (incl. timed_out runs from C11).
      prisma.catalogSyncLog.findMany({
        where: {
          operation: 'full_sync',
          created_at: { gte: new Date(Date.now() - WEEK_MS) },
          payload_json: { path: ['triggered_by'], equals: 'schedule' },
        },
        select: { status: true, payload_json: true, created_at: true },
      }),
    ]);

    const cronFailed = cronLogs7d.filter((l) => l.status === 'FAILED').length;
    const cronTimedOut = cronLogs7d.filter(
      (l) => (l.payload_json as { timed_out?: boolean } | null)?.timed_out === true,
    ).length;
    const cronLastRunAt = cronLogs7d.reduce<Date | null>(
      (latest, l) => (latest === null || l.created_at > latest ? l.created_at : latest),
      null,
    );

    const countsByRetailer = new Map<string, Record<string, number>>();
    let itemsSynced = 0;
    let itemsFailed = 0;
    let itemsPending = 0;
    for (const g of itemGroups) {
      const key = g.status;
      const per = countsByRetailer.get(g.retailer_id) ?? {};
      per[key] = (per[key] ?? 0) + g._count;
      countsByRetailer.set(g.retailer_id, per);
      if (key === 'SUCCESS') itemsSynced += g._count;
      else if (key === 'FAILED') itemsFailed += g._count;
      else itemsPending += g._count;
    }

    const rows = retailers.map((r) => {
      const per = countsByRetailer.get(r.id) ?? {};
      return {
        retailer_id: r.id,
        shop_name: r.shop_name,
        city: r.city,
        plan: r.plan,
        configured: !!r.whatsapp_api_access_token,
        whatsapp_catalog_id: r.whatsapp_catalog_id,
        sync_enabled: r.sync_enabled,
        sync_categories: r.sync_categories,
        last_synced_at: r.last_synced_at,
        items_synced: per['SUCCESS'] ?? 0,
        items_failed: per['FAILED'] ?? 0,
        items_pending: per['IN_PROGRESS'] ?? 0,
      };
    });

    const health = {
      retailers_total: retailers.length,
      retailers_configured: retailers.filter((r) => !!r.whatsapp_api_access_token).length,
      retailers_syncing: retailers.filter((r) => r.sync_enabled).length,
      items_synced: itemsSynced,
      items_failed: itemsFailed,
      items_pending: itemsPending,
      failed_logs_7d: failedLogs7d,
      error_rate_pct:
        itemsSynced + itemsFailed === 0
          ? 0
          : Math.round((itemsFailed / (itemsSynced + itemsFailed)) * 1000) / 10,
      // Daily cron health (C10/C11): last schedule-triggered run, and how many
      // retailers' runs failed or timed out in the last 7 days.
      cron_last_run_at: cronLastRunAt,
      cron_failed_7d: cronFailed,
      cron_timed_out_7d: cronTimedOut,
    };

    return { data: { health, retailers: rows } };
  });

  // ─── GET /admin/whatsapp-catalog/retailers/:retailerId/logs ────
  // Drill-down (G3): sync history for one retailer, newest first.
  server.get<{ Params: { retailerId: string } }>(
    '/whatsapp-catalog/retailers/:retailerId/logs',
    async (request) => {
      const retailer = await prisma.retailer.findUnique({
        where: { id: request.params.retailerId },
        select: { id: true },
      });
      if (!retailer) throw notFound('Retailer');

      const logs = await prisma.catalogSyncLog.findMany({
        where: { retailer_id: request.params.retailerId },
        orderBy: { created_at: 'desc' },
        take: 100,
      });
      return {
        data: logs.map((l) => ({
          id: l.id,
          operation: l.operation,
          product_id: l.product_id,
          meta_item_id: l.meta_item_id,
          meta_catalog_id: l.meta_catalog_id,
          status: l.status,
          error_message: l.error_message,
          payload: l.payload_json,
          created_at: l.created_at,
        })),
      };
    },
  );

  // ─── GET /admin/whatsapp-catalog/retailers/:retailerId/items ───
  // Drill-down (G3): the retailer's item mapping with product + error info.
  server.get<{ Params: { retailerId: string } }>(
    '/whatsapp-catalog/retailers/:retailerId/items',
    async (request) => {
      const retailer = await prisma.retailer.findUnique({
        where: { id: request.params.retailerId },
        select: { id: true },
      });
      if (!retailer) throw notFound('Retailer');

      const items = await prisma.catalogItem.findMany({
        where: { retailer_id: request.params.retailerId },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              price_min: true,
              status: true,
              category: true,
              deleted_at: true,
            },
          },
        },
        orderBy: { updated_at: 'desc' },
        take: 200,
      });
      return {
        data: items.map((i) => ({
          product_id: i.product_id,
          product_name: i.product?.name ?? i.product_name_snapshot,
          sku: i.product?.sku,
          price_paise: i.product?.price_min ?? i.product_price_paise,
          status: i.status,
          error_message: i.error_message,
          whatsapp_catalog_item_id: i.whatsapp_catalog_item_id,
          product_status: i.product?.status ?? i.product_status_snapshot,
          hsn_code: i.hsn_code_snapshot,
          last_synced_at: i.last_synced_at,
        })),
      };
    },
  );

  // ─── POST /admin/whatsapp-catalog/retailers/:retailerId/sync ───
  // Manual full-sync trigger (G4) — enqueues the same BullMQ job the retailer
  // can trigger, marked triggered_by: 'admin' so logs distinguish the source.
  server.post<{ Params: { retailerId: string } }>(
    '/whatsapp-catalog/retailers/:retailerId/sync',
    async (request) => {
      const retailer = await prisma.retailer.findUnique({
        where: { id: request.params.retailerId },
        select: { id: true, whatsapp_api_access_token: true },
      });
      if (!retailer) throw notFound('Retailer');
      if (!retailer.whatsapp_api_access_token) {
        throw validationError('This retailer has not connected a WhatsApp Business API account');
      }

      const jobId = await addCatalogSyncJob({
        retailer_id: request.params.retailerId,
        operation: 'full_sync',
        triggered_by: 'admin',
      });

      await prisma.auditLog.create({
        data: {
          actor_type: 'admin',
          action: 'sync',
          resource_type: 'Retailer',
          resource_id: request.params.retailerId,
          metadata: { whatsapp_catalog: { trigger: 'admin', job_id: jobId } },
          ip_address: request.ip,
        },
      });

      request.log.info(
        { retailerId: request.params.retailerId, jobId },
        'Admin triggered WhatsApp catalog sync',
      );
      return { data: { job_id: jobId, status: 'queued' } };
    },
  );
};
