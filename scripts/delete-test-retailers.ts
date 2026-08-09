/**
 * Delete specific TEST retailer accounts — DB rows + R2 storage + Supabase auth users.
 *
 * The user's own test accounts (multiple test logins on the live app) must be
 * removed completely so testing can restart with a real (live) retailer. This
 * is a SCOPED delete — ONLY the retailers whose phone numbers are listed below,
 * every related row they own (products/photos/variants, customers, collections,
 * orders, staff, subscriptions, try-on, quotas, audit logs), their R2 objects,
 * and their Supabase auth.users rows.
 *
 * Usage:
 *   npx tsx scripts/delete-test-retailers.ts             # dry-run: audit only, no changes
 *   npx tsx scripts/delete-test-retailers.ts --apply     # actually delete
 *
 * Guardrails (same pattern as apps/api/src/jobs/purge-soft-deleted.ts and
 * scripts/cleanup-all-data.ts):
 *   - Runs on getPurgePrisma() (kanchuki_purge role — DELETE-scoped) when
 *     PURGE_DATABASE_URL is set; falls back to the primary client otherwise
 *     (dev). If role separation blocks DELETE, the transaction fails cleanly
 *     and nothing is partially deleted.
 *   - SET app.allow_hard_delete = 'true' bypasses the F-017 guardrail triggers.
 *   - FK-safe children-before-parents order.
 *   - R2 keys are collected BEFORE the DB delete and objects removed after
 *     (best-effort per object).
 *   - Supabase auth users are deleted via the admin API (best-effort).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { deleteObject, listObjects } from '../packages/ai/src/index.js';
import { getPurgePrisma } from '../packages/db/src/index.js';
import { normalizeIndianPhone } from '../packages/shared/src/index.js';

try {
  process.loadEnvFile('.env');
} catch {
  // no .env — rely on process env
}

// The 5 test accounts (as given by the user, with 91 country prefix).
const TEST_PHONES_RAW = [
  '919898989898',
  '919999988888',
  '919999999999',
  '913131313131',
  '911313131313',
];
const TEST_PHONES = TEST_PHONES_RAW.map((p) => normalizeIndianPhone(p));

const db = getPurgePrisma();

// ─── Audit helpers ───────────────────────────────────────────────

async function countRows<T extends Record<string, unknown>>(
  query: () => Promise<Array<T>>,
): Promise<number> {
  try {
    const rows = await query();
    return rows.length;
  } catch {
    return -1; // table/relation missing — report as unknown
  }
}

async function auditRetailer(retailerId: string): Promise<void> {
  const counts: Record<string, number> = {};
  const childrenByRetailer: Array<[string, () => Promise<unknown[]>]> = [
    [
      'products',
      () => db.product.findMany({ where: { retailer_id: retailerId }, select: { id: true } }),
    ],
    [
      'customers',
      () => db.customer.findMany({ where: { retailer_id: retailerId }, select: { id: true } }),
    ],
    [
      'collections',
      () => db.collection.findMany({ where: { retailer_id: retailerId }, select: { id: true } }),
    ],
    [
      'staff',
      () => db.staff.findMany({ where: { retailer_id: retailerId }, select: { id: true } }),
    ],
    [
      'store_sections',
      () => db.storeSection.findMany({ where: { retailer_id: retailerId }, select: { id: true } }),
    ],
    [
      'product_categories',
      () =>
        db.productCategory.findMany({ where: { retailer_id: retailerId }, select: { id: true } }),
    ],
    [
      'product_attributes',
      () =>
        db.productAttribute.findMany({ where: { retailer_id: retailerId }, select: { id: true } }),
    ],
    [
      'subscriptions',
      () => db.subscription.findMany({ where: { retailer_id: retailerId }, select: { id: true } }),
    ],
    [
      'try_on_jobs',
      () => db.tryOnJob.findMany({ where: { retailer_id: retailerId }, select: { id: true } }),
    ],
    [
      'try_on_usage_logs',
      () => db.tryOnUsageLog.findMany({ where: { retailer_id: retailerId }, select: { id: true } }),
    ],
    [
      'size_charts',
      () => db.sizeChart.findMany({ where: { retailer_id: retailerId }, select: { id: true } }),
    ],
    [
      'limit_overrides',
      () =>
        db.retailerLimitOverride.findMany({
          where: { retailer_id: retailerId },
          select: { id: true },
        }),
    ],
    [
      'usage_counters',
      () => db.usageCounter.findMany({ where: { retailer_id: retailerId }, select: { id: true } }),
    ],
    [
      'quota_addon_purchases',
      () =>
        db.quotaAddonPurchase.findMany({
          where: { retailer_id: retailerId },
          select: { id: true },
        }),
    ],
    [
      'ai_usage_logs',
      () => db.aiUsageLog.findMany({ where: { retailer_id: retailerId }, select: { id: true } }),
    ],
    [
      'support_tickets',
      () => db.supportTicket.findMany({ where: { retailer_id: retailerId }, select: { id: true } }),
    ],
    [
      'payment_account',
      () =>
        db.retailerPaymentAccount.findMany({
          where: { retailer_id: retailerId },
          select: { id: true },
        }),
    ],
    [
      'orders',
      () => db.order.findMany({ where: { retailer_id: retailerId }, select: { id: true } }),
    ],
    [
      'audit_logs',
      () => db.auditLog.findMany({ where: { actor_id: retailerId }, select: { id: true } }),
    ],
  ];

  for (const [name, q] of childrenByRetailer) {
    counts[name] = await countRows(q as () => Promise<Array<Record<string, unknown>>>);
  }

  console.log(`   Retailer ${retailerId}:`);
  for (const [name, c] of Object.entries(counts)) {
    console.log(`     ${name.padEnd(24)} ${c < 0 ? '? (read failed)' : c}`);
  }
}

// ─── R2 key collection (before DB delete) ────────────────────────

async function collectR2KeysForRetailer(retailerId: string): Promise<string[]> {
  const keys: string[] = [];

  // Product photos / spin frames / variants (children of products)
  const productIds = (
    await db.product.findMany({ where: { retailer_id: retailerId }, select: { id: true } })
  ).map((p) => p.id);
  if (productIds.length > 0) {
    const photos = await db.productPhoto.findMany({
      where: { product_id: { in: productIds } },
      select: { r2_key: true },
    });
    keys.push(...photos.map((p) => p.r2_key));
    const spins = await db.productSpinFrame.findMany({
      where: { product_id: { in: productIds } },
      select: { r2_key: true },
    });
    keys.push(...spins.map((s) => s.r2_key));
    const variants = await db.productVariant.findMany({
      where: { product_id: { in: productIds } },
      select: { r2_key: true },
    });
    keys.push(...variants.map((v) => v.r2_key).filter((k): k is string => !!k));
  }

  // Customer measurements (front/back photos)
  const customerIds = (
    await db.customer.findMany({ where: { retailer_id: retailerId }, select: { id: true } })
  ).map((c) => c.id);
  if (customerIds.length > 0) {
    const ms = await db.customerMeasurement.findMany({
      where: { customer_id: { in: customerIds } },
      select: { front_photo_r2_key: true, back_photo_r2_key: true },
    });
    keys.push(
      ...ms
        .flatMap((m) => [m.front_photo_r2_key, m.back_photo_r2_key])
        .filter((k): k is string => !!k),
    );
  }

  // Try-on jobs (input + result)
  const tryOns = await db.tryOnJob.findMany({
    where: { retailer_id: retailerId },
    select: { customer_photo_r2_key: true, result_r2_key: true },
  });
  keys.push(
    ...tryOns
      .flatMap((t) => [t.customer_photo_r2_key, t.result_r2_key])
      .filter((k): k is string => !!k),
  );

  // Retailer brand + KYC
  const retailer = await db.retailer.findUnique({
    where: { id: retailerId },
    select: {
      logo_r2_key: true,
      banner_r2_key: true,
      kyc_gst_r2_key: true,
      kyc_aadhar_front_r2_key: true,
      kyc_aadhar_back_r2_key: true,
    },
  });
  if (retailer) {
    keys.push(
      ...[
        retailer.logo_r2_key,
        retailer.banner_r2_key,
        retailer.kyc_gst_r2_key,
        retailer.kyc_aadhar_front_r2_key,
        retailer.kyc_aadhar_back_r2_key,
      ].filter((k): k is string => !!k),
    );
  }

  // Category cover images
  const cats = await db.productCategory.findMany({
    where: { retailer_id: retailerId },
    select: { image_r2_key: true },
  });
  keys.push(...cats.map((c) => c.image_r2_key).filter((k): k is string => !!k));

  return [...new Set(keys.filter((k) => k.length > 0))];
}

/** Catch anything under the retailer's prefix that no table row references. */
async function listPrefixObjects(retailerId: string): Promise<{ key: string; size: number }[]> {
  try {
    const all = await listObjects();
    return all.filter((o) => o.key.startsWith(`retailers/${retailerId}/`));
  } catch (err) {
    console.warn('   ⚠️ R2 listing failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ─── Supabase auth cleanup ───────────────────────────────────────

async function deleteSupabaseUsers(authUserIds: string[]): Promise<number> {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_KEY'];
  if (!url || !key) {
    console.warn('   ⚠️ SUPABASE_URL/SUPABASE_SERVICE_KEY missing — auth users NOT deleted');
    return 0;
  }
  const sb = createClient(url, key);
  let deleted = 0;
  for (const uid of authUserIds) {
    try {
      const { error } = await sb.auth.admin.deleteUser(uid);
      if (error) {
        console.warn(`   ⚠️ Could not delete Supabase auth user ${uid}: ${error.message}`);
      } else {
        deleted++;
      }
    } catch (err) {
      console.warn(
        `   ⚠️ Supabase auth delete failed for ${uid}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return deleted;
}

// ─── Scoped SQL for the Supabase SQL Editor ──────────────────────
// Role separation (SECURITY §19) blocks the app role from DELETE, so the DB
// wipe is handed to the superuser SQL Editor — scoped to ONLY these retailer
// IDs, children-before-parents, guardrail flag set, everything in one txn.
function writeScopedDeleteSql(retailerIds: string[]): string {
  const ids = retailerIds.map((id) => `'${id}'`).join(', ');
  const sql = `-- Generated by scripts/delete-test-retailers.ts (${new Date().toISOString()})
-- Deletes ONLY these retailer accounts + all their data: ${TEST_PHONES_RAW.join(', ')}
-- Run in Supabase SQL Editor (superuser). One transaction — any failure rolls back everything.

BEGIN;

SET app.allow_hard_delete = 'true';

-- Reset storefront pointers before collections disappear
UPDATE retailers SET storefront_collection_id = NULL
WHERE id IN (${ids});

-- ── Children first (FK-safe order) ──
DELETE FROM product_photos        WHERE retailer_id IN (${ids});
DELETE FROM product_spin_frames   WHERE retailer_id IN (${ids});
DELETE FROM product_variants      WHERE retailer_id IN (${ids});
DELETE FROM product_embeddings    WHERE retailer_id IN (${ids});
DELETE FROM collection_products   WHERE collection_id IN (SELECT id FROM collections WHERE retailer_id IN (${ids}));
DELETE FROM collection_views      WHERE retailer_id IN (${ids});
DELETE FROM collection_enquiries  WHERE retailer_id IN (${ids});
DELETE FROM customer_interactions WHERE retailer_id IN (${ids});
DELETE FROM customer_measurements WHERE retailer_id IN (${ids});
DELETE FROM customer_fashion_dna  WHERE retailer_id IN (${ids});
DELETE FROM order_items           WHERE order_id IN (SELECT id FROM orders WHERE retailer_id IN (${ids}));
DELETE FROM subscription_payments WHERE retailer_id IN (${ids});
DELETE FROM size_chart_rows       WHERE size_chart_id IN (SELECT id FROM size_charts WHERE retailer_id IN (${ids}));
DELETE FROM training_photo_consents WHERE try_on_job_id IN (SELECT id FROM try_on_jobs WHERE retailer_id IN (${ids}));
DELETE FROM try_on_usage_logs     WHERE retailer_id IN (${ids});
DELETE FROM try_on_jobs           WHERE retailer_id IN (${ids});

-- ── Parents ──
DELETE FROM products             WHERE retailer_id IN (${ids});
DELETE FROM collections          WHERE retailer_id IN (${ids});
DELETE FROM customers            WHERE retailer_id IN (${ids});
DELETE FROM orders               WHERE retailer_id IN (${ids});
DELETE FROM subscriptions        WHERE retailer_id IN (${ids});
DELETE FROM size_charts          WHERE retailer_id IN (${ids});
DELETE FROM staff                WHERE retailer_id IN (${ids});
DELETE FROM store_sections       WHERE retailer_id IN (${ids});
DELETE FROM product_categories   WHERE retailer_id IN (${ids});
DELETE FROM product_attributes   WHERE retailer_id IN (${ids});
DELETE FROM support_tickets      WHERE retailer_id IN (${ids});
DELETE FROM retailer_payment_accounts WHERE retailer_id IN (${ids});
DELETE FROM retailer_limit_overrides  WHERE retailer_id IN (${ids});
DELETE FROM usage_counters       WHERE retailer_id IN (${ids});
DELETE FROM quota_addon_purchases WHERE retailer_id IN (${ids});
DELETE FROM ai_usage_logs        WHERE retailer_id IN (${ids});
DELETE FROM audit_logs           WHERE actor_id IN (${ids});

-- ── The accounts themselves ──
DELETE FROM retailers WHERE id IN (${ids});

COMMIT;

-- Verify: expect 0 rows for each phone
SELECT phone, count(*) AS remaining FROM retailers
WHERE phone IN ('${TEST_PHONES.join("', '")}')
GROUP BY phone;
`;
  const out = join(process.cwd(), 'scripts', 'delete-test-retailers.generated.sql');
  writeFileSync(out, sql, 'utf8');
  return out;
}

// ─── Main ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  console.log(
    apply
      ? '🗑️  DELETE TEST RETAILERS — APPLY mode (destructive)'
      : '👀 DELETE TEST RETAILERS — dry run (audit only)',
  );
  console.log('   Target phones:', TEST_PHONES_RAW.join(', '));
  console.log('   Normalized:  ', TEST_PHONES.join(', '));
  console.log();

  // Find the retailers — INCLUDING soft-deleted ones (deleted_at IS NOT NULL):
  // 4 of the 5 target phones were already soft-deleted during testing and only
  // await the 15-day purge cron. The user wants them fully removed NOW, so the
  // script hard-deletes soft-deleted + active rows alike (children too).
  const retailers = await db.retailer.findMany({
    where: { phone: { in: TEST_PHONES } },
    select: {
      id: true,
      phone: true,
      shop_name: true,
      auth_user_id: true,
      created_at: true,
      deleted_at: true,
    },
  });

  if (retailers.length === 0) {
    console.log('❌ No retailers found for these phones — nothing to delete.');
    console.log(
      '   (If they were already soft-deleted, purge them via the cron or check deleted_at.)',
    );
    return;
  }

  console.log(`Found ${retailers.length} retailer(s):`);
  for (const r of retailers) {
    console.log(
      `   • ${r.phone} — "${r.shop_name || '(no shop name)'}" ` +
        `(created ${r.created_at.toISOString()}, ${r.deleted_at ? 'SOFT-DELETED ' + r.deleted_at.toISOString() : 'active'})`,
    );
  }
  console.log();

  // ── Audit phase ───────────────────────────────────────────────
  console.log('── Data scope (what would be deleted) ──');
  let totalR2Keys = 0;
  const allAuthUserIds: string[] = [];
  const allR2Keys: string[] = [];
  for (const r of retailers) {
    await auditRetailer(r.id);
    const keys = await collectR2KeysForRetailer(r.id);
    allR2Keys.push(...keys);
    totalR2Keys += keys.length;
    if (r.auth_user_id && !r.auth_user_id.startsWith('pending:'))
      allAuthUserIds.push(r.auth_user_id);
  }
  console.log();
  console.log(`   R2 keys referenced by DB rows: ${totalR2Keys}`);
  if (allAuthUserIds.length > 0) {
    console.log(`   Supabase auth users to delete: ${allAuthUserIds.length}`);
  }

  // R2 prefix sweep — objects under retailers/<id>/ not referenced by a row
  console.log();
  console.log('── R2 prefix sweep (objects under retailers/<id>/) ──');
  let sweepCount = 0;
  let sweepBytes = 0;
  for (const r of retailers) {
    const prefixObjects = await listPrefixObjects(r.id);
    const unreferenced = prefixObjects.filter((o) => !allR2Keys.includes(o.key));
    sweepCount += unreferenced.length;
    sweepBytes += unreferenced.reduce((s, o) => s + o.size, 0);
    console.log(
      `   retailers/${r.id}/ → ${prefixObjects.length} object(s), ${unreferenced.length} not referenced by any DB row`,
    );
  }
  console.log(
    `   Unreferenced-by-row objects to delete: ${sweepCount} (${(sweepBytes / 1024 / 1024).toFixed(2)} MB)`,
  );

  if (!apply) {
    console.log();
    console.log('────────────────────────────────────────────────────────────');
    console.log('   Dry run complete — nothing was changed.');
    console.log('   Re-run with --apply to actually delete (DB + R2 + Supabase auth).');
    console.log('────────────────────────────────────────────────────────────');
    return;
  }

  // ── Apply phase ───────────────────────────────────────────────
  console.log();
  console.log('══ APPLYING ══');
  const retailerIds = retailers.map((r) => r.id);

  const deleteChildrenByRetailer: Array<
    [string, (tx: typeof db, ids: string[]) => Promise<number>]
  > = [
    // Children of products (FK parent = products)
    [
      'product_photos',
      (tx, ids) =>
        tx.productPhoto.deleteMany({ where: { retailer_id: { in: ids } } }).then((r) => r.count),
    ],
    [
      'product_spin_frames',
      (tx, ids) =>
        tx.productSpinFrame
          .deleteMany({ where: { retailer_id: { in: ids } } })
          .then((r) => r.count),
    ],
    [
      'product_variants',
      (tx, ids) =>
        tx.productVariant.deleteMany({ where: { retailer_id: { in: ids } } }).then((r) => r.count),
    ],
    [
      'product_embeddings',
      (tx, ids) =>
        tx.productEmbedding
          .deleteMany({ where: { retailer_id: { in: ids } } })
          .then((r) => r.count),
    ],
    // Children of collections
    [
      'collection_products',
      (tx, ids) =>
        tx.collectionProduct
          .deleteMany({ where: { collection: { retailer_id: { in: ids } } } })
          .then((r) => r.count),
    ],
    [
      'collection_views',
      (tx, ids) =>
        tx.collectionView.deleteMany({ where: { retailer_id: { in: ids } } }).then((r) => r.count),
    ],
    [
      'collection_enquiries',
      (tx, ids) =>
        tx.collectionEnquiry
          .deleteMany({ where: { retailer_id: { in: ids } } })
          .then((r) => r.count),
    ],
    // Children of customers
    [
      'customer_interactions',
      (tx, ids) =>
        tx.customerInteraction
          .deleteMany({ where: { retailer_id: { in: ids } } })
          .then((r) => r.count),
    ],
    [
      'customer_measurements',
      (tx, ids) =>
        tx.customerMeasurement
          .deleteMany({ where: { retailer_id: { in: ids } } })
          .then((r) => r.count),
    ],
    [
      'customer_fashion_dna',
      (tx, ids) =>
        tx.customerFashionDNA
          .deleteMany({ where: { retailer_id: { in: ids } } })
          .then((r) => r.count),
    ],
    // Children of orders
    [
      'order_items',
      (tx, ids) =>
        tx.orderItem
          .deleteMany({ where: { order: { retailer_id: { in: ids } } } })
          .then((r) => r.count),
    ],
    // Children of subscriptions
    [
      'subscription_payments',
      (tx, ids) =>
        tx.subscriptionPayment
          .deleteMany({ where: { retailer_id: { in: ids } } })
          .then((r) => r.count),
    ],
    // Children of size charts
    [
      'size_chart_rows',
      (tx, ids) =>
        tx.sizeChartRow
          .deleteMany({ where: { size_chart: { retailer_id: { in: ids } } } })
          .then((r) => r.count),
    ],
    // Children of try-on jobs
    [
      'training_photo_consents',
      (tx, ids) =>
        tx.trainingPhotoConsent
          .deleteMany({ where: { try_on_job: { retailer_id: { in: ids } } } })
          .then((r) => r.count),
    ],
    [
      'try_on_usage_logs',
      (tx, ids) =>
        tx.tryOnUsageLog.deleteMany({ where: { retailer_id: { in: ids } } }).then((r) => r.count),
    ],
  ];

  // Parent rows (FK targets)
  const deleteParentsByRetailer: Array<
    [string, (tx: typeof db, ids: string[]) => Promise<number>]
  > = [
    [
      'products',
      (tx, ids) =>
        tx.product.deleteMany({ where: { retailer_id: { in: ids } } }).then((r) => r.count),
    ],
    [
      'collections',
      (tx, ids) =>
        tx.collection.deleteMany({ where: { retailer_id: { in: ids } } }).then((r) => r.count),
    ],
    [
      'customers',
      (tx, ids) =>
        tx.customer.deleteMany({ where: { retailer_id: { in: ids } } }).then((r) => r.count),
    ],
    [
      'orders',
      (tx, ids) =>
        tx.order.deleteMany({ where: { retailer_id: { in: ids } } }).then((r) => r.count),
    ],
    [
      'subscriptions',
      (tx, ids) =>
        tx.subscription.deleteMany({ where: { retailer_id: { in: ids } } }).then((r) => r.count),
    ],
    [
      'try_on_jobs',
      (tx, ids) =>
        tx.tryOnJob.deleteMany({ where: { retailer_id: { in: ids } } }).then((r) => r.count),
    ],
    [
      'size_charts',
      (tx, ids) =>
        tx.sizeChart.deleteMany({ where: { retailer_id: { in: ids } } }).then((r) => r.count),
    ],
    [
      'staff',
      (tx, ids) =>
        tx.staff.deleteMany({ where: { retailer_id: { in: ids } } }).then((r) => r.count),
    ],
    [
      'store_sections',
      (tx, ids) =>
        tx.storeSection.deleteMany({ where: { retailer_id: { in: ids } } }).then((r) => r.count),
    ],
    [
      'product_categories',
      (tx, ids) =>
        tx.productCategory.deleteMany({ where: { retailer_id: { in: ids } } }).then((r) => r.count),
    ],
    [
      'product_attributes',
      (tx, ids) =>
        tx.productAttribute
          .deleteMany({ where: { retailer_id: { in: ids } } })
          .then((r) => r.count),
    ],
    [
      'support_tickets',
      (tx, ids) =>
        tx.supportTicket.deleteMany({ where: { retailer_id: { in: ids } } }).then((r) => r.count),
    ],
    [
      'retailer_payment_accounts',
      (tx, ids) =>
        tx.retailerPaymentAccount
          .deleteMany({ where: { retailer_id: { in: ids } } })
          .then((r) => r.count),
    ],
    [
      'retailer_limit_overrides',
      (tx, ids) =>
        tx.retailerLimitOverride
          .deleteMany({ where: { retailer_id: { in: ids } } })
          .then((r) => r.count),
    ],
    [
      'usage_counters',
      (tx, ids) =>
        tx.usageCounter.deleteMany({ where: { retailer_id: { in: ids } } }).then((r) => r.count),
    ],
    [
      'quota_addon_purchases',
      (tx, ids) =>
        tx.quotaAddonPurchase
          .deleteMany({ where: { retailer_id: { in: ids } } })
          .then((r) => r.count),
    ],
    [
      'ai_usage_logs',
      (tx, ids) =>
        tx.aiUsageLog.deleteMany({ where: { retailer_id: { in: ids } } }).then((r) => r.count),
    ],
    [
      'audit_logs',
      (tx, ids) =>
        tx.auditLog.deleteMany({ where: { actor_id: { in: ids } } }).then((r) => r.count),
    ],
  ];

  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.allow_hard_delete = 'true';`);

      // Null loose storefront pointers (retailers.storefront_collection_id has no FK)
      await tx.retailer.updateMany({
        where: { id: { in: retailerIds } },
        data: { storefront_collection_id: null },
      });

      console.log('── Deleting children (FK-safe order) ──');
      for (const [name, del] of deleteChildrenByRetailer) {
        const n = await del(tx, retailerIds);
        console.log(`   ✅ ${name.padEnd(28)} ${n}`);
      }

      console.log('── Deleting parents ──');
      for (const [name, del] of deleteParentsByRetailer) {
        const n = await del(tx, retailerIds);
        console.log(`   ✅ ${name.padEnd(28)} ${n}`);
      }

      console.log('── Deleting retailers ──');
      const res = await tx.retailer.deleteMany({ where: { id: { in: retailerIds } } });
      console.log(`   ✅ retailers                 ${res.count}`);
    });
    console.log('\n   ✅ DB delete succeeded directly (no role separation in effect).');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('permission denied')) {
      // The DB hard-delete cannot run from here: production role separation
      // (SECURITY §19) gives the primary role (kanchuki_app) no DELETE, and this
      // machine has no kanchuki_purge/PURGE_DATABASE_URL credentials. Write the
      // scoped SQL for the Supabase SQL Editor (superuser) instead — same
      // children-before-parents + guardrail-flag pattern.
      const sqlPath = writeScopedDeleteSql(retailerIds);
      console.error(
        '\n   ⚠️  DB DELETE blocked: production role separation (SECURITY §19) revokes DELETE',
      );
      console.error('   from the primary role. This machine has no kanchuki_purge credentials.');
      console.error(`   ▶️  Run the generated SQL in the Supabase SQL Editor:  ${sqlPath}`);
      console.error('   (Everything below — R2 objects + Supabase auth users — still runs now.)');
    } else {
      console.error('❌ DELETE FAILED (transaction rolled back — nothing deleted):', err);
      process.exit(1);
    }
  }

  // ── R2 cleanup (after DB — best-effort) ───────────────────────
  const allKeys = [...new Set([...allR2Keys])];
  console.log(`\n── Deleting ${allKeys.length} R2 keys from DB rows ──`);
  const results = await Promise.allSettled(allKeys.map((k) => deleteObject(k)));
  const failed = results.filter((r) => r.status === 'rejected').length;
  console.log(`   ✅ ${allKeys.length - failed}/${allKeys.length} R2 objects deleted`);

  // Prefix sweep — delete anything left under retailers/<id>/
  console.log('\n── R2 prefix sweep ──');
  let sweepDeleted = 0;
  for (const r of retailers) {
    const objs = await listPrefixObjects(r.id);
    const sweepResults = await Promise.allSettled(objs.map((o) => deleteObject(o.key)));
    const ok = sweepResults.filter((r) => r.status === 'fulfilled').length;
    sweepDeleted += ok;
    console.log(`   retailers/${r.id}/ → ${ok}/${objs.length} deleted`);
  }

  // ── Supabase auth users ───────────────────────────────────────
  console.log('\n── Supabase auth users ──');
  const authDeleted = await deleteSupabaseUsers(allAuthUserIds);
  console.log(`   ✅ ${authDeleted}/${allAuthUserIds.length} auth users deleted`);

  // ── Audit trail ───────────────────────────────────────────────
  try {
    await db.auditLog.create({
      data: {
        actor_type: 'system',
        action: 'DELETE_TEST_RETAILERS',
        resource_type: 'System',
        metadata: {
          phones: TEST_PHONES_RAW,
          retailer_ids: retailerIds,
          r2_objects_deleted: allKeys.length - failed + sweepDeleted,
          auth_users_deleted: authDeleted,
          triggered_by: 'user-request',
        },
      },
    });
  } catch {
    // best-effort
  }

  console.log();
  console.log('═══════════════════════════════════════════════════');
  console.log('   Test retailers deleted. You can now start fresh');
  console.log('   with a live retailer account.');
  console.log('═══════════════════════════════════════════════════');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Script failed:', err);
    process.exit(1);
  });
