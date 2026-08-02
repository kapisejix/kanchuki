import { getPurgePrisma } from '@kanchuki/db';

/**
 * Dedicated scoped-role client for hard deletes (SECURITY §19). The shared
 * `prisma` client runs as `kanchuki_app`, which has DELETE revoked — under full
 * role separation the purge would fail with `permission denied` on every batch.
 * `PURGE_DATABASE_URL` points at the `kanchuki_purge` role (SELECT/INSERT/UPDATE
 * inherited from `kanchuki_app`, plus DELETE on exactly the purge tables — no
 * TRUNCATE, no DDL). Falls back to the shared client if the URL is unset (dev).
 */
const db = getPurgePrisma();

/**
 * Purge-soft-deleted cron job (F-017 / F-016).
 *
 * Runs daily (via BullMQ repeatable job) and permanently removes soft-deleted
 * records older than PURGE_AFTER_DAYS from the primary database. These records
 * are already preserved in the Deletion Vault (F-016) — see vaultDelete() calls
 * across product/customer/collection/retailer soft-delete paths.
 *
 * Security model:
 * - Each raw SQL batch prepends SET app.allow_hard_delete = 'true' to bypass
 *   the F-017 guardrail triggers. The flag must be set within each call
 *   because Prisma's connection pool may route different calls to different
 *   connections.
 * - Children (product_variants, product_photos, etc.) are deleted BEFORE their
 *   parents to respect FK constraints — even though the triggers block direct
 *   DELETE, ON DELETE CASCADE still fires when the parent is deleted via raw SQL.
 *   We delete children explicitly first for clarity and auditability.
 * - Results are logged to the audit trail.
 *
 * Tables purged (in dependency order — children before parents):
 *   1. product_variants, product_photos, product_embeddings  → children of products
 *   2. products                                              → main business table
 *   3. collection_products, collection_views, collection_enquiries → children of collections
 *   4. collections                                           → main business table
 *   5. customer_interactions                                 → children of customers
 *   6. customers                                             → main business table
 *   7. staff                                                 → children of retailers
 *   8. retailers                                             → main business table (last, FK target)
 */

const PURGE_AFTER_DAYS = 30;
const BATCH_SIZE = 100;

interface PurgeResult {
  products: number;
  customers: number;
  retailers: number;
  collections: number;
}

/**
 * Delete a batch of records using raw SQL with the session flag set.
 * Uses the same cursor-based pattern as cleanup-training-data.ts:
 * findMany to select the batch, then a single raw DELETE by IDs.
 */
async function purgeTable(table: string, cutoff: Date, extraWhere?: string): Promise<number> {
  let total = 0;
  let cursor: string | undefined;

  while (true) {
    // Select the next batch of IDs to delete (ordered by id ASC for stability)
    const batch = await db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "${table}"
       WHERE deleted_at IS NOT NULL AND deleted_at < $1
       ${cursor ? 'AND id > $2' : ''}
       ${extraWhere ?? ''}
       ORDER BY id ASC
       LIMIT ${BATCH_SIZE}`,
      cutoff,
      ...(cursor ? [cursor] : []),
    );

    if (batch.length === 0) break;

    const ids = batch.map((r) => r.id);
    const lastId = ids[ids.length - 1];

    // Delete the batch with the session flag set (same tx = same connection,
    // so SET carries over to the DELETE)
    await db.$transaction([
      db.$executeRawUnsafe(`SET app.allow_hard_delete = 'true';`),
      db.$executeRawUnsafe(`DELETE FROM "${table}" WHERE id = ANY($1::text[]);`, ids),
    ]);

    total += ids.length;
    cursor = lastId;
  }

  return total;
}

/**
 * Delete child records referencing a parent table via FK.
 * Uses raw SQL with the session flag and subquery to match soft-deleted parents.
 */
async function purgeChildren(
  childTable: string,
  childFkColumn: string,
  parentTable: string,
  cutoff: Date,
): Promise<number> {
  const [, result] = await db.$transaction([
    db.$executeRawUnsafe(`SET app.allow_hard_delete = 'true';`),
    db.$executeRawUnsafe(
      `DELETE FROM "${childTable}"
       WHERE "${childFkColumn}" IN (
         SELECT id FROM "${parentTable}"
         WHERE deleted_at IS NOT NULL AND deleted_at < $1
       );`,
      cutoff,
    ),
  ]);
  return result ?? 0;
}

export async function handlePurgeSoftDeleted(): Promise<PurgeResult> {
  const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);

  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log(
    `[purge-soft-deleted] Starting purge of records soft-deleted before ${cutoff.toISOString()}...`,
  );

  // ── 1. Purge products + children ──────────────────────────────
  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log('[purge-soft-deleted] Purging product children...');
  await purgeChildren('product_variants', 'product_id', 'products', cutoff);
  await purgeChildren('product_photos', 'product_id', 'products', cutoff);
  await purgeChildren('product_embeddings', 'product_id', 'products', cutoff);

  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log('[purge-soft-deleted] Purging products...');
  const totalProducts = await purgeTable('products', cutoff);

  // ── 2. Purge collections + children ─────────────────────────
  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log('[purge-soft-deleted] Purging collection children...');
  await purgeChildren('collection_products', 'collection_id', 'collections', cutoff);
  await purgeChildren('collection_views', 'collection_id', 'collections', cutoff);
  await purgeChildren('collection_enquiries', 'collection_id', 'collections', cutoff);

  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log('[purge-soft-deleted] Purging collections...');
  const totalCollections = await purgeTable('collections', cutoff);

  // ── 3. Purge customers + children ────────────────────────────
  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log('[purge-soft-deleted] Purging customer children...');
  await purgeChildren('customer_interactions', 'customer_id', 'customers', cutoff);
  await purgeChildren('customer_measurements', 'customer_id', 'customers', cutoff);
  await purgeChildren('customer_fashion_dna', 'customer_id', 'customers', cutoff);

  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log('[purge-soft-deleted] Purging customers...');
  const totalCustomers = await purgeTable('customers', cutoff);

  // ── 4. Purge retailers + children ────────────────────────────
  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log('[purge-soft-deleted] Purging retailer children...');
  await purgeChildren('staff', 'retailer_id', 'retailers', cutoff);
  await purgeChildren('store_sections', 'retailer_id', 'retailers', cutoff);
  await purgeChildren('product_categories', 'retailer_id', 'retailers', cutoff);
  await purgeChildren('try_on_usage_logs', 'retailer_id', 'retailers', cutoff);
  await purgeChildren('usage_counters', 'retailer_id', 'retailers', cutoff);

  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log('[purge-soft-deleted] Purging retailers...');
  const totalRetailers = await purgeTable('retailers', cutoff);

  // ── 5. Audit log ──────────────────────────────────────────────
  await db.auditLog.create({
    data: {
      actor_type: 'system',
      action: 'PURGE_SOFT_DELETED',
      resource_type: 'System',
      metadata: {
        cutoff: cutoff.toISOString(),
        products_deleted: totalProducts,
        customers_deleted: totalCustomers,
        retailers_deleted: totalRetailers,
        collections_deleted: totalCollections,
        batch_size: BATCH_SIZE,
        purge_after_days: PURGE_AFTER_DAYS,
      },
    },
  });

  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log(
    `[purge-soft-deleted] Complete: ${totalProducts} products, ${totalCollections} collections, ` +
      `${totalCustomers} customers, ${totalRetailers} retailers purged`,
  );

  return {
    products: totalProducts,
    customers: totalCustomers,
    retailers: totalRetailers,
    collections: totalCollections,
  };
}
