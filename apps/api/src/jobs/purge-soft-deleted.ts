import { deleteObject } from '@kanchuki/ai';
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
 *   1. product_variants, product_photos, product_embeddings → children of products
 *      (r2_key of every photo/variant is fetched first and its R2 object
 *      deleted after the DB purge — best-effort, see purgeR2Objects())
 *   2. products                                              → main business table
 *   3. collection_products, collection_views, collection_enquiries → children of collections
 *   4. collections                                           → main business table
 *   5. customers                                             → main business table
 *   6. staff                                                 → children of retailers
 *   7. referral_codes, referral_conversions, referral_payouts → RESTRICT children
 *      of retailers (migration 109). conversions are swept on BOTH referrer_id
 *      and referred_id — a conversion is a child of two retailers.
 *      payouts before conversions: ON DELETE SET NULL means clearing the parent
 *      is another write on the child, so the reverse order can deadlock two
 *      concurrent deletes.
 *   8. campaigns, campaign_sends, promotions, consent_events,
 *      customer_recently_viewed, customer_wishlist_items,
 *      customer_interactions                              → RC-030: bare
 *      `retailer_id`, no FK. Postgres neither cascades nor errors here, so
 *      before this these rows silently outlived the retailer.
 *   9. retailers                                             → main business table (last, FK target)
 *
 * Bare `retailer_id` tables (RC-030) must be listed here by hand: a declared FK
 * fails loudly when a child is missed (the FK violation rolls the whole
 * transaction back), a denormalised id fails SILENTLY. Add a new one in the
 * same change that adds the column.
 *
 * RLS (RC-030): a table with ROW LEVEL SECURITY enabled and no policy for
 * `kanchuki_app`/`kanchuki_purge` fails in exactly the same silent way — RLS
 * filters rows rather than raising, so every statement here affects 0 rows and
 * nothing errors. 23 of the tables below are in that state and work only because
 * the purge role happens to be a member of each table's owning role. Migration
 * 111 replaces that accident with an explicit policy, and
 * `purge-rls-policy.test.ts` re-derives the required set from the schema so a
 * new RLS table cannot be added to this path without one. See RC-030.
 */

const PURGE_AFTER_DAYS = 15;
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
 * R2 objects are never removed by DB cascade — fetch the r2_key of every
 * child row about to be purged (product_photos/spin_frames/variants) before
 * deleting it, so the Cloudflare object can be cleaned up too. Best-effort:
 * a failed R2 delete shouldn't block the DB purge, so callers fire this
 * after the DB delete already succeeded.
 */
async function fetchR2Keys(
  childTable: string,
  childFkColumn: string,
  parentTable: string,
  cutoff: Date,
): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ r2_key: string | null }[]>(
    `SELECT r2_key FROM "${childTable}"
     WHERE "${childFkColumn}" IN (
       SELECT id FROM "${parentTable}" WHERE deleted_at IS NOT NULL AND deleted_at < $1
     ) AND r2_key IS NOT NULL`,
    cutoff,
  );
  return rows.map((r) => r.r2_key).filter((k): k is string => k != null);
}

async function purgeR2Objects(keys: string[]): Promise<number> {
  const results = await Promise.allSettled(keys.map((key) => deleteObject(key)));
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    console.error(`[purge-soft-deleted] ${failed.length}/${keys.length} R2 deletes failed`, failed);
  }
  return keys.length - failed.length;
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
  // Grab R2 keys before the rows disappear — cascade/explicit delete removes
  // the DB record but never touches the Cloudflare object.
  const [photoKeys, variantKeys] = await Promise.all([
    fetchR2Keys('product_photos', 'product_id', 'products', cutoff),
    fetchR2Keys('product_variants', 'product_id', 'products', cutoff),
  ]);
  const r2Keys = [...photoKeys, ...variantKeys];

  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log('[purge-soft-deleted] Purging product children...');
  await Promise.all([
    purgeChildren('product_variants', 'product_id', 'products', cutoff),
    purgeChildren('product_photos', 'product_id', 'products', cutoff),
    purgeChildren('product_embeddings', 'product_id', 'products', cutoff),
  ]);

  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log('[purge-soft-deleted] Purging products...');
  const totalProducts = await purgeTable('products', cutoff);

  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log(`[purge-soft-deleted] Deleting ${r2Keys.length} R2 objects...`);
  const totalR2Deleted = await purgeR2Objects(r2Keys);

  // ── 2. Purge collections + children ─────────────────────────
  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log('[purge-soft-deleted] Purging collection children...');
  await Promise.all([
    purgeChildren('collection_products', 'collection_id', 'collections', cutoff),
    purgeChildren('collection_views', 'collection_id', 'collections', cutoff),
    purgeChildren('collection_enquiries', 'collection_id', 'collections', cutoff),
  ]);

  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log('[purge-soft-deleted] Purging collections...');
  const totalCollections = await purgeTable('collections', cutoff);

  // ── 3. Purge customers ──────────────────────────────────────
  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log('[purge-soft-deleted] Purging customers...');
  const totalCustomers = await purgeTable('customers', cutoff);

  // ── 4. Purge retailers + children ────────────────────────────
  // Grab R2 keys for retailer-child rows before they disappear (category
  // covers + retailer logo/banner/KYC).
  const [retailerChildR2Keys, retailerAssets] = await Promise.all([
    db.$queryRawUnsafe<{ r2_key: string | null }[]>(
      `SELECT image_r2_key AS r2_key FROM product_categories
       WHERE retailer_id IN (SELECT id FROM retailers WHERE deleted_at IS NOT NULL AND deleted_at < $1)
         AND image_r2_key IS NOT NULL`,
      cutoff,
    ),
    db.retailer.findMany({
      where: { deleted_at: { not: null, lt: cutoff } },
      select: {
        logo_r2_key: true,
        banner_r2_key: true,
        kyc_gst_r2_key: true,
        kyc_aadhar_front_r2_key: true,
        kyc_aadhar_back_r2_key: true,
      },
    }),
  ]);
  const retailerR2Keys = [
    ...retailerChildR2Keys.map((r) => r.r2_key),
    ...retailerAssets.flatMap((r) => [
      r.logo_r2_key,
      r.banner_r2_key,
      r.kyc_gst_r2_key,
      r.kyc_aadhar_front_r2_key,
      r.kyc_aadhar_back_r2_key,
    ]),
  ].filter((k): k is string => !!k);

  // Children with a retailer_id FK are deleted explicitly (the retailer row's
  // FK graph). product_categories/usage_counters cascade on retailer delete, so
  // they're handled by purgeTable below. The RESTRICT / NO-ACTION tables must
  // go first or `DELETE FROM retailers` throws an FK violation and the whole
  // sweep rolls back — this was the same missing-rows bug as hardDeleteRetailer
  // (product_attributes/social_accounts/social_posts shipped with RESTRICT FKs
  // in migrations 046/052 and silently broke the admin hard-delete + this cron).
  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log('[purge-soft-deleted] Purging retailer children...');
  // subscription_payments FK-restricts subscriptions, so it must be gone
  // BEFORE subscriptions (children-before-parents; keep it out of the
  // parallel batch below to avoid a race).
  await purgeChildren('subscription_payments', 'retailer_id', 'retailers', cutoff);
  // Retailer referral program (migration 109) — RESTRICT FKs to retailers, so
  // these MUST go before the retailer row or `DELETE FROM retailers` throws an
  // FK violation and rolls the entire sweep back (the product_attributes /
  // social_accounts omission, migrations 046/052). Kept sequential with
  // subscription_payments and outside the parallel batch below for the same
  // reason it is: referral_payouts and referral_conversions are parent/child
  // (conversions.payout_id → payouts, ON DELETE SET NULL), and deleting them
  // concurrently can deadlock. Setting a conversion's payout_id to NULL is also
  // an UPDATE on the child row, so the child delete waits for it.
  await purgeChildren('referral_payouts', 'referrer_id', 'retailers', cutoff);
  await purgeChildren('referral_conversions', 'referrer_id', 'retailers', cutoff);
  // A conversion is also a child of the *referred* retailer — if the referred
  // shop is purged, the referrer's pending commission on it goes too.
  await purgeChildren('referral_conversions', 'referred_id', 'retailers', cutoff);
  // Payout destination (migration 113) — RESTRICT FK child of retailers, so it
  // must precede the retailer row too. No ordering hazard with the payouts /
  // conversions deletes above: nothing in those tables references it.
  await purgeChildren('referral_payout_accounts', 'retailer_id', 'retailers', cutoff);
  await purgeChildren('referral_codes', 'retailer_id', 'retailers', cutoff);
  await Promise.all([
    purgeChildren('staff', 'retailer_id', 'retailers', cutoff),
    purgeChildren('store_sections', 'retailer_id', 'retailers', cutoff),
    purgeChildren('product_categories', 'retailer_id', 'retailers', cutoff),
    purgeChildren('usage_counters', 'retailer_id', 'retailers', cutoff),
    // RESTRICT/NO-ACTION retailer FKs (children before parents).
    purgeChildren('subscriptions', 'retailer_id', 'retailers', cutoff),
    purgeChildren('support_tickets', 'retailer_id', 'retailers', cutoff),
    purgeChildren('quota_addon_purchases', 'retailer_id', 'retailers', cutoff),
    purgeChildren('product_attributes', 'retailer_id', 'retailers', cutoff),
    purgeChildren('social_posts', 'retailer_id', 'retailers', cutoff),
    purgeChildren('social_accounts', 'retailer_id', 'retailers', cutoff),
    // Bare-`retailer_id` tables with NO FK to retailers at all (RC-030). A
    // declared FK fails loudly when a sweep misses it; a denormalised column
    // fails silently — Postgres neither cascades nor errors, so the rows simply
    // survive and a closed shop's campaign history, discount codes, consent
    // records and behavioural logs are retained with no owner. The closest
    // sibling is product_videos, but it is NOT the precedent to copy: it has a
    // real FK to products (migration 055, ON DELETE CASCADE), so the product
    // sweep above already carries it away. None of these has any FK path that
    // reaches it. Safe in the parallel batch: campaign_sends → campaigns is a
    // loose pointer, not an FK, so no ordering/deadlock relationship exists.
    purgeChildren('campaign_sends', 'retailer_id', 'retailers', cutoff),
    purgeChildren('campaigns', 'retailer_id', 'retailers', cutoff),
    purgeChildren('promotions', 'retailer_id', 'retailers', cutoff),
    // consent_events.retailer_id is NULLABLE (NULL = a passport-level consent
    // not tied to any store), so this only matches store-scoped rows.
    purgeChildren('consent_events', 'retailer_id', 'retailers', cutoff),
    purgeChildren('customer_interactions', 'retailer_id', 'retailers', cutoff),
    purgeChildren('customer_recently_viewed', 'retailer_id', 'retailers', cutoff),
    purgeChildren('customer_wishlist_items', 'retailer_id', 'retailers', cutoff),
    // RLS (RC-030): consent_events / customer_interactions /
    // customer_recently_viewed / customer_wishlist_items have ROW LEVEL SECURITY
    // enabled with no policy for the backend roles, and RLS filters rows instead
    // of raising — so before migration 111 these four swept 0 rows without
    // erroring. They are NOT special: 23 of the 32 tables the purge path deletes
    // from are RLS-protected the same way (products, customers, collections,
    // retailers included) and none of them named kanchuki_purge or kanchuki_app.
    // The whole path worked only because the purge role is a member of the role
    // that happens to own each table, which Postgres's owner check accepts — an
    // accident of which role ran which migration, per table.
    //
    // Migration 111 makes it explicit for every RLS table this path touches, with
    // FOR ALL rather than FOR DELETE: purgeChildren() scopes its DELETE through
    // `SELECT id FROM retailers`, so a DELETE-only policy would leave the
    // subquery empty and keep deleting nothing while looking fixed. See RC-030,
    // and apps/api/src/jobs/purge-rls-policy.test.ts, which re-derives the
    // required set from the schema and fails if the migration's list drifts.
  ]);

  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log('[purge-soft-deleted] Purging retailers...');
  const totalRetailers = await purgeTable('retailers', cutoff);

  // R2 objects for the retailer's own rows (logo/banner/KYC + category covers).
  const totalRetailerR2Deleted = await purgeR2Objects(retailerR2Keys);

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
        r2_objects_deleted: totalR2Deleted + totalRetailerR2Deleted,
        batch_size: BATCH_SIZE,
        purge_after_days: PURGE_AFTER_DAYS,
      },
    },
  });

  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log(
    `[purge-soft-deleted] Complete: ${totalProducts} products, ${totalCollections} collections, ` +
      `${totalCustomers} customers, ${totalRetailers} retailers, ` +
      `${totalR2Deleted + totalRetailerR2Deleted} R2 objects purged`,
  );

  return {
    products: totalProducts,
    customers: totalCustomers,
    retailers: totalRetailers,
    collections: totalCollections,
  };
}
