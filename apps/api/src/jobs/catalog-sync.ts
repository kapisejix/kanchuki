// Phase II: WhatsApp Native Catalog Sync — sync engine (roadmap P / F-307).
//
// Consumed by the `catalog-sync` BullMQ queue (see jobs/index.ts). A full sync
// reconciles every eligible product against the retailer's Meta catalog;
// a single-product sync is the incremental path (retailer edit / webhook).
//
// Eligibility (C2/C3):
//   - retailer has a WhatsApp Business API access token (bring-your-own model)
//   - product is not soft-deleted
//   - if retailer.sync_categories is non-empty, product.category_id must be in it
//
// Idempotency (C8): Meta's catalog item external id is the Kanchuki product id
// (passed as `retailer_id` to createCatalogItem) — re-running a sync updates the
// existing item instead of creating a duplicate. Local CatalogItem rows key off
// product_id (@unique).
//
// HSN (C5): Phase I's admin-overridable hsn_codes master table is not built yet
// (GST-ready invoicing is designed, not implemented) — resolveHsnForCatalog is
// the interim keyword map over the common apparel HSN 8-digit heads (6204 women's
// non-knitted outerwear, 5407/5208/5007 woven fabrics, 6214 shawls, 6211 track
// suits, ...). Swap for the Phase I table when that ships.

import { Prisma, getSecret, prisma } from '@kanchuki/db';
// Circular with jobs/index.ts (index imports handleCatalogSync, this module
// imports addCatalogSyncJob) — safe: both are only CALLED at runtime, never
// during module evaluation. Same pattern as tag-product.ts ↔ index.ts.
import { addCatalogSyncJob } from './index.js';
import {
  createCatalogItem,
  deleteCatalogItem,
  getOrCreateCatalog,
  resolveCatalogCredentials,
  updateCatalogItem,
  type CatalogItemCreateInput,
} from '../lib/meta-catalog.js';

/**
 * Per-retailer sync budget (ms). A hung Meta call must never occupy a BullMQ
 * worker slot forever — with queue concurrency 2, two stuck retailers would
 * stall the entire daily pass. When the budget expires the AbortController
 * fires and in-flight Meta fetches are aborted (signal is threaded into the
 * meta-catalog client), the run records a FAILED log, and the job completes
 * WITHOUT retry — a timed-out full sync is usually a systemic condition (Meta
 * outage), and the next day's cron or the next product edit reconciles it.
 * Override via CATALOG_SYNC_TIMEOUT_MS; default 10 minutes.
 */
const CATALOG_SYNC_TIMEOUT_MS = Number(process.env.CATALOG_SYNC_TIMEOUT_MS ?? 600_000);

export interface CatalogSyncJobData {
  retailer_id: string;
  operation: 'full_sync' | 'single_product';
  product_id?: string;
  triggered_by: 'schedule' | 'admin' | 'retailer' | 'webhook';
}

/** Meta catalog availability values (matches meta-catalog.ts). */
export type CatalogAvailability = 'in stock' | 'out of stock' | 'available for order' | 'preorder';

/** Kanchuki ProductStatus → Meta availability (C6). */
export function mapProductStatus(status: string): CatalogAvailability {
  switch (status) {
    case 'AVAILABLE':
      return 'in stock';
    case 'RESERVED':
      // Reserved is still sellable in WhatsApp (buyer can order); treat as
      // available so the item stays visible, not ghosted as sold out.
      return 'available for order';
    case 'SOLD':
    case 'NOT_SURE':
    default:
      return 'out of stock';
  }
}

// Interim HSN mapping (C5). Ordered — first keyword hit wins. Defaults to 6204
// (women's/girls' non-knitted suits, dresses, skirts, trousers) which covers
// the bulk of a Kanchuki retailer's kurti/suit inventory.
const HSN_RULES: Array<{ pattern: RegExp; hsn: string }> = [
  // Fabric-specific descriptors first — a silk saree is 5007, a cotton one
  // 5208; only bare "saree" (no fabric word) falls through to the synthetic
  // 5407 head (the most common retail saree HSN).
  { pattern: /silk/, hsn: '5007' },
  { pattern: /cotton fabric|fabric.*cotton|^fabric$/, hsn: '5208' },
  { pattern: /saree|saaree|sadi/, hsn: '5407' }, // woven man-made-fibre saree
  { pattern: /dupatta|stole|shawl|scarf/, hsn: '6214' },
  { pattern: /tracksuit|track suit|legging/, hsn: '6211' },
  { pattern: /jeans|trouser|pant/, hsn: '6204' },
  { pattern: /shirt/, hsn: '6205' },
  { pattern: /blouse|top/, hsn: '6206' },
  { pattern: /dress|gown/, hsn: '6204' },
  { pattern: /skirt/, hsn: '6204' },
  { pattern: /kurta|kurti|kameez|suit|lehenga|lehanga|anarkali|salwar|churidar/, hsn: '6204' },
];

/**
 * Resolve an HSN code for a product (C5). Uses Phase I's apparel HSN rates as
 * the source of truth for the mapping; keyword-matches the free-text AI fields
 * + the retailer's category name. Falls back to 6204 (default women's apparel).
 */
export function resolveHsnForCatalog(product: {
  name?: string | null;
  category?: string | null;
  subtype?: string | null;
  description?: string | null;
  categoryName?: string | null;
}): string {
  const haystack = [
    product.name,
    product.category,
    product.subtype,
    product.description,
    product.categoryName,
  ]
    .filter((v): v is string => !!v)
    .join(' ')
    .toLowerCase();

  for (const rule of HSN_RULES) {
    if (rule.pattern.test(haystack)) return rule.hsn;
  }
  return '6204';
}

/** Build the Meta catalog item payload from a product (C4). */
export function buildCatalogItemPayload(product: {
  id: string;
  name?: string | null;
  sku?: string | null;
  description?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  status: string;
  category?: string | null;
  subtype?: string | null;
  fabric_estimate?: string | null;
  styles?: string[];
  fabrics?: string[];
  categoryName?: string | null;
  photoUrl?: string | null;
}): CatalogItemCreateInput {
  const name = (product.name ?? product.sku ?? 'Product').trim().slice(0, 100);
  const hsn = resolveHsnForCatalog(product);

  const descriptionParts = [
    product.subtype,
    product.categoryName ?? product.category,
    product.fabric_estimate ?? product.fabrics?.join(', '),
    product.styles?.length ? product.styles.join(', ') : undefined,
  ].filter((v): v is string => !!v);
  if (hsn) descriptionParts.push(`HSN ${hsn}`);

  return {
    name,
    description: descriptionParts.slice(0, 4).join(' · ').slice(0, 500) || undefined,
    // Price is stored in paise (₹1500 = 150000) — Meta expects the smallest
    // currency unit for INR as well.
    price: product.price_min ?? product.price_max ?? 0,
    currency: 'INR',
    availability: mapProductStatus(product.status),
    condition: 'new',
    ...(product.photoUrl ? { image_url: product.photoUrl } : {}),
    ...((product.categoryName ?? product.category)
      ? { retailer_category: (product.categoryName ?? product.category)!.slice(0, 100) }
      : {}),
  };
}

// ─── Logging ─────────────────────────────────────────────────────

interface SyncLogInput {
  operation: 'full_sync' | 'single_product' | 'webhook';
  product_id?: string | null;
  meta_item_id?: string | null;
  meta_catalog_id?: string | null;
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'IN_PROGRESS';
  error_message?: string | null;
  payload_json?: Record<string, unknown> | null;
}

async function writeSyncLog(retailerId: string, log: SyncLogInput): Promise<void> {
  try {
    await prisma.catalogSyncLog.create({
      data: {
        retailer_id: retailerId,
        operation: log.operation,
        product_id: log.product_id ?? null,
        meta_item_id: log.meta_item_id ?? null,
        meta_catalog_id: log.meta_catalog_id ?? null,
        status: log.status,
        error_message: log.error_message ?? null,
        payload_json: (log.payload_json ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    // ponytail: the audit trail must never take the job down — a sync failure
    // is already recorded by BullMQ; a log-write failure on top would mask it.
    console.error(`Failed to write catalog sync log for retailer ${retailerId}:`, err);
  }
}

// ─── Full sync (C2) ──────────────────────────────────────────────

const CHUNK_SIZE = 5; // per-item Meta calls, bounded concurrency per chunk (C7)

async function chunk<T>(items: T[], size: number): Promise<Array<T[]>> {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Reconcile every eligible product against the retailer's Meta catalog:
 * create missing items, update changed ones, delete items for products that
 * are no longer eligible (soft-deleted or category removed from sync set).
 * Writes a single CatalogSyncLog row for the run (SUCCESS/FAILED/PARTIAL).
 */
export async function syncAllProducts(
  retailerId: string,
  triggeredBy: CatalogSyncJobData['triggered_by'] = 'retailer',
  signal?: AbortSignal,
): Promise<void> {
  const retailer = await prisma.retailer.findUnique({
    where: { id: retailerId },
    select: {
      whatsapp_api_access_token: true,
      whatsapp_catalog_id: true,
      sync_categories: true,
    },
  });
  if (!retailer) throw new Error(`Retailer ${retailerId} not found`);

  if (!retailer.whatsapp_api_access_token) {
    await writeSyncLog(retailerId, {
      operation: 'full_sync',
      status: 'FAILED',
      error_message: 'WhatsApp Business API not configured — connect your Meta account first',
    });
    return;
  }

  const creds = await resolveCatalogCredentials(retailer.whatsapp_api_access_token);
  if (!creds) {
    await writeSyncLog(retailerId, {
      operation: 'full_sync',
      status: 'FAILED',
      error_message:
        'Meta is not configured on the server (META_WHATSAPP_BUSINESS_ACCOUNT_ID missing)',
    });
    return;
  }

  // Create the catalog once per retailer; cache the id back on the row.
  const catalogId = await getOrCreateCatalog(creds.wabaId, creds.accessToken, undefined, signal);
  if (catalogId !== retailer.whatsapp_catalog_id) {
    await prisma.retailer.update({
      where: { id: retailerId },
      data: { whatsapp_catalog_id: catalogId },
    });
  }

  const eligibleProducts = await prisma.product.findMany({
    where: {
      retailer_id: retailerId,
      deleted_at: null,
      ...(retailer.sync_categories.length > 0
        ? { category_id: { in: retailer.sync_categories } }
        : {}),
    },
    include: {
      product_category: { select: { name: true } },
      photos: { where: { is_primary: true }, take: 1, select: { url: true } },
    },
    orderBy: { created_at: 'asc' },
  });

  const existingItems = await prisma.catalogItem.findMany({
    where: { retailer_id: retailerId },
    select: {
      product_id: true,
      whatsapp_catalog_item_id: true,
      whatsapp_catalog_id: true,
    },
  });
  const existingByProduct = new Map(existingItems.map((r) => [r.product_id, r]));

  const eligibleIds = new Set(eligibleProducts.map((p) => p.id));
  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];
  const failed: Array<{ product_id: string; name: string; error: string }> = [];

  const upsertProduct = async (product: (typeof eligibleProducts)[number]) => {
    try {
      const existing = existingByProduct.get(product.id);
      const payload = buildCatalogItemPayload({
        id: product.id,
        name: product.name,
        sku: product.sku,
        description: product.description,
        price_min: product.price_min,
        price_max: product.price_max,
        status: product.status,
        category: product.category,
        subtype: product.subtype,
        fabric_estimate: product.fabric_estimate,
        styles: product.styles,
        fabrics: product.fabrics,
        categoryName: product.product_category?.name ?? null,
        photoUrl: product.photos[0]?.url ?? null,
      });

      if (existing) {
        await updateCatalogItem(
          catalogId,
          creds.accessToken,
          existing.whatsapp_catalog_item_id,
          {
            name: payload.name,
            description: payload.description,
            price: payload.price,
            availability: payload.availability,
            image_url: payload.image_url,
            retailer_category: payload.retailer_category,
          },
          signal,
        );
        await prisma.catalogItem.update({
          where: { product_id: product.id },
          data: {
            whatsapp_catalog_id: catalogId,
            status: 'SUCCESS',
            error_message: null,
            last_synced_at: new Date(),
            product_name_snapshot: payload.name,
            product_price_paise: payload.price,
            product_status_snapshot: product.status,
            hsn_code_snapshot: resolveHsnForCatalog(product),
          },
        });
        updated.push(product.id);
      } else {
        const { id: metaItemId } = await createCatalogItem(
          catalogId,
          creds.accessToken,
          payload,
          product.id, // external id for idempotency (C8)
          signal,
        );
        await prisma.catalogItem.create({
          data: {
            retailer_id: retailerId,
            product_id: product.id,
            whatsapp_catalog_item_id: metaItemId,
            whatsapp_catalog_id: catalogId,
            status: 'SUCCESS',
            last_synced_at: new Date(),
            product_name_snapshot: payload.name,
            product_price_paise: payload.price,
            product_status_snapshot: product.status,
            hsn_code_snapshot: resolveHsnForCatalog(product),
          },
        });
        await prisma.product.update({
          where: { id: product.id },
          data: { whatsapp_catalog_item_id: metaItemId },
        });
        created.push(product.id);
      }
    } catch (err) {
      // On timeout the AbortError is expected, not a real product failure —
      // the run-level FAILED log carries the timeout message instead.
      if (!signal?.aborted) {
        failed.push({
          product_id: product.id,
          name: product.name ?? product.sku ?? product.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Surface per-item failure on the mapping row so the retailer sees it
      // in the items list (D6) without waiting for the next full sync.
      const existing = existingByProduct.get(product.id);
      if (existing) {
        await prisma.catalogItem.update({
          where: { product_id: product.id },
          data: {
            status: 'FAILED',
            error_message: (err instanceof Error ? err.message : String(err)).slice(0, 500),
          },
        });
      }
    }
  };

  for (const group of await chunk(eligibleProducts, CHUNK_SIZE)) {
    if (signal?.aborted) break; // timeout fired — stop starting new work
    await Promise.all(group.map(upsertProduct));
  }

  // Removals: rows whose product is gone or no longer eligible → delete on Meta.
  for (const row of existingItems) {
    if (signal?.aborted) break;
    if (eligibleIds.has(row.product_id)) continue;
    try {
      await deleteCatalogItem(catalogId, creds.accessToken, row.whatsapp_catalog_item_id, signal);
      await prisma.catalogItem.delete({ where: { product_id: row.product_id } });
      await prisma.product.updateMany({
        where: { id: row.product_id, retailer_id: retailerId },
        data: { whatsapp_catalog_item_id: null },
      });
      deleted.push(row.product_id);
    } catch (err) {
      if (signal?.aborted) break;
      failed.push({
        product_id: row.product_id,
        name: row.product_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const status = signal?.aborted
    ? 'FAILED' // timeout — the per-item AbortErrors were swallowed; record it plainly
    : failed.length === 0
      ? 'SUCCESS'
      : created.length + updated.length + deleted.length === 0
        ? 'FAILED'
        : 'PARTIAL';

  await writeSyncLog(retailerId, {
    operation: 'full_sync',
    meta_catalog_id: catalogId,
    status,
    error_message: signal?.aborted
      ? `Sync timed out after ${Math.round(CATALOG_SYNC_TIMEOUT_MS / 1000)}s (per-retailer budget)`
      : failed.length > 0
        ? `${failed.length} product(s) failed to sync`
        : null,
    payload_json: {
      triggered_by: triggeredBy,
      total: eligibleProducts.length,
      created: created.length,
      updated: updated.length,
      deleted: deleted.length,
      failed: failed,
      timed_out: signal?.aborted ?? false,
    },
  });

  await prisma.retailer.update({
    where: { id: retailerId },
    data: { last_synced_at: new Date() },
  });
}

// ─── Single product sync (C3) ────────────────────────────────────

/**
 * Incremental sync of one product (retailer edit / webhook). When the product
 * is missing, soft-deleted, or no longer eligible (category removed), removes
 * its Meta item and the local mapping row. Writes one CatalogSyncLog row.
 */
export async function syncSingleProduct(
  retailerId: string,
  productId: string,
  triggeredBy: CatalogSyncJobData['triggered_by'] = 'retailer',
  signal?: AbortSignal,
): Promise<void> {
  const retailer = await prisma.retailer.findUnique({
    where: { id: retailerId },
    select: {
      whatsapp_api_access_token: true,
      whatsapp_catalog_id: true,
      sync_categories: true,
    },
  });
  if (!retailer) throw new Error(`Retailer ${retailerId} not found`);

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      product_category: { select: { name: true } },
      photos: { where: { is_primary: true }, take: 1, select: { url: true } },
    },
  });
  if (!product || product.retailer_id !== retailerId) {
    await writeSyncLog(retailerId, {
      operation: 'single_product',
      product_id: productId,
      status: 'FAILED',
      error_message: 'Product not found',
    });
    return;
  }

  const eligible =
    product.deleted_at === null &&
    (retailer.sync_categories.length === 0 ||
      (product.category_id != null && retailer.sync_categories.includes(product.category_id)));

  if (!eligible) {
    // Remove from Meta if it was previously synced.
    const existing = await prisma.catalogItem.findUnique({ where: { product_id: productId } });
    if (existing && retailer.whatsapp_api_access_token) {
      try {
        const creds = await resolveCatalogCredentials(retailer.whatsapp_api_access_token);
        if (creds) {
          // First arg is the CATALOG id (deleteCatalogItem posts to
          // /{catalogId-or-itemId}/... — the catalog row caches it).
          await deleteCatalogItem(
            existing.whatsapp_catalog_id,
            creds.accessToken,
            existing.whatsapp_catalog_item_id,
            signal,
          );
        }
        await prisma.catalogItem.delete({ where: { product_id: productId } });
        await prisma.product.update({
          where: { id: productId },
          data: { whatsapp_catalog_item_id: null },
        });
        await writeSyncLog(retailerId, {
          operation: 'single_product',
          product_id: productId,
          meta_item_id: existing.whatsapp_catalog_item_id,
          meta_catalog_id: existing.whatsapp_catalog_id,
          status: 'SUCCESS',
          payload_json: { triggered_by: triggeredBy, action: 'removed_not_eligible' },
        });
      } catch (err) {
        await writeSyncLog(retailerId, {
          operation: 'single_product',
          product_id: productId,
          meta_item_id: existing.whatsapp_catalog_item_id,
          status: 'FAILED',
          error_message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return;
  }

  if (!retailer.whatsapp_api_access_token) {
    await writeSyncLog(retailerId, {
      operation: 'single_product',
      product_id: productId,
      status: 'FAILED',
      error_message: 'WhatsApp Business API not configured',
    });
    return;
  }

  const creds = await resolveCatalogCredentials(retailer.whatsapp_api_access_token);
  if (!creds) {
    await writeSyncLog(retailerId, {
      operation: 'single_product',
      product_id: productId,
      status: 'FAILED',
      error_message: 'Meta is not configured on the server',
    });
    return;
  }

  const catalogId =
    retailer.whatsapp_catalog_id ??
    (await getOrCreateCatalog(creds.wabaId, creds.accessToken, undefined, signal));
  if (!retailer.whatsapp_catalog_id) {
    await prisma.retailer.update({
      where: { id: retailerId },
      data: { whatsapp_catalog_id: catalogId },
    });
  }

  const payload = buildCatalogItemPayload({
    id: product.id,
    name: product.name,
    sku: product.sku,
    description: product.description,
    price_min: product.price_min,
    price_max: product.price_max,
    status: product.status,
    category: product.category,
    subtype: product.subtype,
    fabric_estimate: product.fabric_estimate,
    styles: product.styles,
    fabrics: product.fabrics,
    categoryName: product.product_category?.name ?? null,
    photoUrl: product.photos[0]?.url ?? null,
  });

  const existing = await prisma.catalogItem.findUnique({ where: { product_id: productId } });
  try {
    let metaItemId: string;
    if (existing) {
      await updateCatalogItem(
        catalogId,
        creds.accessToken,
        existing.whatsapp_catalog_item_id,
        {
          name: payload.name,
          description: payload.description,
          price: payload.price,
          availability: payload.availability,
          image_url: payload.image_url,
          retailer_category: payload.retailer_category,
        },
        signal,
      );
      metaItemId = existing.whatsapp_catalog_item_id;
      await prisma.catalogItem.update({
        where: { product_id: productId },
        data: {
          whatsapp_catalog_id: catalogId,
          status: 'SUCCESS',
          error_message: null,
          last_synced_at: new Date(),
          product_name_snapshot: payload.name,
          product_price_paise: payload.price,
          product_status_snapshot: product.status,
          hsn_code_snapshot: resolveHsnForCatalog(product),
        },
      });
    } else {
      const created = await createCatalogItem(
        catalogId,
        creds.accessToken,
        payload,
        product.id,
        signal,
      );
      metaItemId = created.id;
      await prisma.catalogItem.create({
        data: {
          retailer_id: retailerId,
          product_id: productId,
          whatsapp_catalog_item_id: metaItemId,
          whatsapp_catalog_id: catalogId,
          status: 'SUCCESS',
          last_synced_at: new Date(),
          product_name_snapshot: payload.name,
          product_price_paise: payload.price,
          product_status_snapshot: product.status,
          hsn_code_snapshot: resolveHsnForCatalog(product),
        },
      });
      await prisma.product.update({
        where: { id: productId },
        data: { whatsapp_catalog_item_id: metaItemId },
      });
    }

    await writeSyncLog(retailerId, {
      operation: 'single_product',
      product_id: productId,
      meta_item_id: metaItemId,
      meta_catalog_id: catalogId,
      status: 'SUCCESS',
      payload_json: { triggered_by: triggeredBy, action: existing ? 'updated' : 'created' },
    });
  } catch (err) {
    // Timeout: record FAILED and swallow — a timed-out run must not retry
    // (a stuck Meta is usually systemic; the daily cron or next edit
    // reconciles). Real errors still rethrow for BullMQ retries (C9).
    const timedOut = signal?.aborted;
    const message = timedOut
      ? `Sync timed out after ${Math.round(CATALOG_SYNC_TIMEOUT_MS / 1000)}s (per-retailer budget)`
      : err instanceof Error
        ? err.message
        : String(err);
    await writeSyncLog(retailerId, {
      operation: 'single_product',
      product_id: productId,
      meta_item_id: existing?.whatsapp_catalog_item_id ?? null,
      meta_catalog_id: catalogId,
      status: 'FAILED',
      error_message: message,
      payload_json: { timed_out: timedOut },
    });
    if (timedOut) return;
    throw err;
  }
}

// ─── Auto-sync hooks (product mutations) ─────────────────────────
// Keeps the Meta catalog fresh without waiting for a manual full sync: any
// product create/edit/status-change/delete enqueues an incremental job.
// Both helpers are fail-open — a catalog hiccup must never fail the product
// save that triggered them.

/**
 * Enqueue an incremental single-product sync when the retailer has catalog
 * sync enabled AND a WhatsApp Business API token (otherwise no-op).
 */
export async function maybeEnqueueProductSync(
  retailerId: string,
  productId: string,
): Promise<void> {
  try {
    const retailer = await prisma.retailer.findUnique({
      where: { id: retailerId },
      select: { sync_enabled: true, whatsapp_api_access_token: true },
    });
    if (!retailer?.sync_enabled || !retailer.whatsapp_api_access_token) return;
    await addCatalogSyncJob({
      retailer_id: retailerId,
      operation: 'single_product',
      product_id: productId,
      triggered_by: 'retailer',
    });
  } catch (err) {
    console.warn(`Skipped catalog sync for product ${productId} (retailer ${retailerId}):`, err);
  }
}

/**
 * Enqueue a full sync when the retailer has catalog sync enabled — used by
 * bulk operations (e.g. bulk-delete) where a per-product job flood is worse
 * than one reconciliation pass.
 */
export async function maybeEnqueueFullSync(retailerId: string): Promise<void> {
  try {
    const retailer = await prisma.retailer.findUnique({
      where: { id: retailerId },
      select: { sync_enabled: true, whatsapp_api_access_token: true },
    });
    if (!retailer?.sync_enabled || !retailer.whatsapp_api_access_token) return;
    await addCatalogSyncJob({
      retailer_id: retailerId,
      operation: 'full_sync',
      triggered_by: 'retailer',
    });
  } catch (err) {
    console.warn(`Skipped catalog full sync for retailer ${retailerId}:`, err);
  }
}

// ─── Queue entry ─────────────────────────────────────────────────

export async function handleCatalogSync(
  data: CatalogSyncJobData,
  timeoutMs: number = CATALOG_SYNC_TIMEOUT_MS,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    if (data.operation === 'single_product' && data.product_id) {
      await syncSingleProduct(
        data.retailer_id,
        data.product_id,
        data.triggered_by,
        controller.signal,
      );
    } else {
      await syncAllProducts(data.retailer_id, data.triggered_by, controller.signal);
    }
  } catch (err) {
    // On abort the engines have already recorded a FAILED log and returned
    // (they swallow the AbortError internally) — but if an abort propagated
    // here anyway, swallow it too: a timed-out run must not trigger BullMQ
    // retries that would triple its stall. Real errors still rethrow (C9).
    if (controller.signal.aborted) return;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Daily cron fan-out: enqueue one full-sync job per retailer that has catalog
 * sync enabled AND a WhatsApp Business API token. Runs via the maintenance
 * worker's 'catalog-daily-full-sync' case (5:00 AM UTC, after the 4:30 AM
 * image-compression pass so freshly compressed images are what reaches Meta).
 * Fail-open per retailer — one bad enqueue must never kill the whole pass,
 * and a DB error degrades to "no syncs today" (auto-sync on edits still
 * covers new activity; this cron is the reconciliation safety net).
 */
export async function handleDailyCatalogSync(): Promise<void> {
  let eligible: { id: string }[] = [];
  try {
    eligible = await prisma.retailer.findMany({
      where: {
        sync_enabled: true,
        whatsapp_api_access_token: { not: null },
      },
      select: { id: true },
    });
  } catch (err) {
    console.warn('[catalog-sync] daily cron: retailer query failed, skipping pass:', err);
    return;
  }

  for (const retailer of eligible) {
    try {
      await addCatalogSyncJob({
        retailer_id: retailer.id,
        operation: 'full_sync',
        triggered_by: 'schedule',
      });
    } catch (err) {
      console.warn(`[catalog-sync] daily cron: failed to enqueue retailer ${retailer.id}:`, err);
    }
  }
}
