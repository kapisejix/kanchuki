// Phase II: WhatsApp Native Catalog Sync — retailer-facing routes (D1–D7).
//
// Endpoints (all under the retailer auth prefix, gated behind the
// WHATSAPP_CATALOG_SYNC plan feature):
//   GET    /me/whatsapp-catalog            — status + counts (D1)
//   PATCH  /me/whatsapp-catalog            — enable/disable + category pick (D2)
//   POST   /me/whatsapp-catalog/sync       — trigger full sync (D3)
//   POST   /me/whatsapp-catalog/sync/:productId — trigger single-product sync (D4)
//   GET    /me/whatsapp-catalog/logs       — sync history (D5)
//   GET    /me/whatsapp-catalog/items      — synced item list + Meta ids (D6)
//
// The heavy lifting is the `catalog-sync` BullMQ job (jobs/catalog-sync.ts);
// these routes only read config and enqueue jobs.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addCatalogSyncJob } from '../../jobs/index.js';
import { hasFeature } from '../../lib/features.js';
import { featureUnavailable, notFound, validationError } from '../../plugins/error-handler.js';

export const retailersWhatsappCatalogRoutes: FastifyPluginAsync = async (server) => {
  const gate = async (retailerId: string): Promise<void> => {
    if (!(await hasFeature(retailerId, 'WHATSAPP_CATALOG_SYNC'))) {
      throw featureUnavailable('WhatsApp Catalog Sync');
    }
  };

  // ─── D1: GET /me/whatsapp-catalog — status ─────────────────────
  // Returns { data: null } when the plan feature is off (same convention as
  // /me/whatsapp-api) so the mobile settings screen can hide the section.
  server.get('/me/whatsapp-catalog', async (request) => {
    if (!(await hasFeature(request.retailerId, 'WHATSAPP_CATALOG_SYNC'))) {
      return { data: null };
    }

    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: {
        whatsapp_api_access_token: true,
        whatsapp_api_phone_number_id: true,
        whatsapp_catalog_id: true,
        sync_enabled: true,
        sync_categories: true,
        last_synced_at: true,
      },
    });
    if (!retailer) throw notFound('Retailer');

    const [synced, failed, pending] = await Promise.all([
      prisma.catalogItem.count({ where: { retailer_id: request.retailerId, status: 'SUCCESS' } }),
      prisma.catalogItem.count({ where: { retailer_id: request.retailerId, status: 'FAILED' } }),
      prisma.catalogItem.count({
        where: { retailer_id: request.retailerId, status: 'IN_PROGRESS' },
      }),
    ]);

    return {
      data: {
        configured: !!retailer.whatsapp_api_access_token,
        whatsapp_api_phone_number_id: retailer.whatsapp_api_phone_number_id,
        whatsapp_catalog_id: retailer.whatsapp_catalog_id,
        sync_enabled: retailer.sync_enabled,
        sync_categories: retailer.sync_categories,
        last_synced_at: retailer.last_synced_at,
        items_synced: synced,
        items_failed: failed,
        items_pending: pending,
      },
    };
  });

  // ─── D2: PATCH /me/whatsapp-catalog — enable/disable + categories ─
  server.patch('/me/whatsapp-catalog', async (request) => {
    await gate(request.retailerId);

    const body = z
      .object({
        sync_enabled: z.boolean().optional(),
        sync_categories: z.array(z.string().min(1)).max(50).optional(),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError('Invalid catalog sync settings');

    const current = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: { sync_enabled: true, sync_categories: true },
    });
    if (!current) throw notFound('Retailer');

    // Validate category ids belong to this retailer (never trust the client).
    let syncCategories = current.sync_categories;
    if (body.data.sync_categories) {
      const valid = await prisma.productCategory.findMany({
        where: { retailer_id: request.retailerId, id: { in: body.data.sync_categories } },
        select: { id: true },
      });
      const validIds = new Set(valid.map((c) => c.id));
      const unknown = body.data.sync_categories.filter((id) => !validIds.has(id));
      if (unknown.length > 0) {
        throw validationError('One or more categories do not belong to this store');
      }
      syncCategories = body.data.sync_categories;
    }

    const updated = await prisma.retailer.update({
      where: { id: request.retailerId },
      data: {
        ...(body.data.sync_enabled !== undefined ? { sync_enabled: body.data.sync_enabled } : {}),
        sync_categories: syncCategories,
      },
      select: {
        sync_enabled: true,
        sync_categories: true,
        whatsapp_catalog_id: true,
        last_synced_at: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'update',
        resource_type: 'Retailer',
        resource_id: request.retailerId,
        metadata: {
          whatsapp_catalog: {
            sync_enabled: updated.sync_enabled,
            sync_categories: updated.sync_categories,
          },
        },
        ip_address: request.ip,
      },
    });

    return { data: updated };
  });

  // ─── D3: POST /me/whatsapp-catalog/sync — manual full sync ─────
  // Works whether or not sync_enabled is on — an explicit "Sync Now" is an
  // opt-in for one run; sync_enabled only governs automatic (webhook/schedule)
  // syncs. Returns the BullMQ job id.
  server.post('/me/whatsapp-catalog/sync', async (request) => {
    await gate(request.retailerId);

    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: { whatsapp_api_access_token: true },
    });
    if (!retailer) throw notFound('Retailer');
    if (!retailer.whatsapp_api_access_token) {
      throw validationError(
        'Connect your WhatsApp Business API account first (Settings → WhatsApp)',
      );
    }

    const jobId = await addCatalogSyncJob({
      retailer_id: request.retailerId,
      operation: 'full_sync',
      triggered_by: 'retailer',
    });
    return { data: { job_id: jobId, operation: 'full_sync', status: 'queued' } };
  });

  // ─── D4: POST /me/whatsapp-catalog/sync/:productId — single ────
  server.post<{ Params: { productId: string } }>(
    '/me/whatsapp-catalog/sync/:productId',
    async (request) => {
      await gate(request.retailerId);

      const product = await prisma.product.findFirst({
        where: { id: request.params.productId, retailer_id: request.retailerId },
        select: { id: true, deleted_at: true },
      });
      if (!product || product.deleted_at) throw notFound('Product');

      const jobId = await addCatalogSyncJob({
        retailer_id: request.retailerId,
        operation: 'single_product',
        product_id: request.params.productId,
        triggered_by: 'retailer',
      });
      return {
        data: {
          job_id: jobId,
          operation: 'single_product',
          product_id: request.params.productId,
          status: 'queued',
        },
      };
    },
  );

  // ─── D5: GET /me/whatsapp-catalog/logs — sync history ──────────
  server.get('/me/whatsapp-catalog/logs', async (request) => {
    await gate(request.retailerId);

    const logs = await prisma.catalogSyncLog.findMany({
      where: { retailer_id: request.retailerId },
      orderBy: { created_at: 'desc' },
      take: 50,
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
  });

  // ─── D6: GET /me/whatsapp-catalog/items — synced item list ─────
  server.get('/me/whatsapp-catalog/items', async (request) => {
    await gate(request.retailerId);

    const items = await prisma.catalogItem.findMany({
      where: { retailer_id: request.retailerId },
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
  });
};
