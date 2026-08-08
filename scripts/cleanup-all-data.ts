/**
 * Cleanup All Data Script (guardrail-aware)
 *
 * Deletes ALL products, customers, orders, staff, subscriptions and related
 * retail data directly via Prisma. Keeps the retailer/shop account, store
 * sections, categories, backgrounds, and admin config intact.
 *
 * Usage:
 *   npx tsx scripts/cleanup-all-data.ts --yes
 *
 * The --yes flag is REQUIRED — this hard-deletes production data. Run
 * scripts/backup-database.ts (or a Supabase dashboard backup) first.
 *
 * Guardrails handled (F-017, migration 037):
 *   - The DB triggers block hard DELETE/TRUNCATE on products, customers,
 *     collections, staff, orders, order_items, product_variants unless the
 *     session flag app.allow_hard_delete = 'true' is set. All deletes run in
 *     ONE transaction on ONE connection with the flag set up front, exactly
 *     like the purge cron (apps/api/src/jobs/purge-soft-deleted.ts).
 *   - Deletion order is children-before-parents (FK-safe).
 *   - retailers.storefront_collection_id is a loose pointer (no FK) — nulled
 *     first so no shop points at a deleted collection.
 *
 * Role caveat: if SECURITY §19 role separation is fully applied, the primary
 * role (kanchuki_app) has no DELETE privilege and this will fail with
 * permission denied. In that case run scripts/reset-demo-data.sql in the
 * Supabase SQL Editor (superuser) instead — same wipe, same guardrails.
 */

import { prisma } from '../packages/db/src/index.js';

const WIPE_ORDER = [
  'sizeChartRow',
  'sizeChart',
  'orderItem',
  'order',
  'collectionEnquiry',
  'collectionView',
  'collectionProduct',
  'collection',
  'customerInteraction',
  'customerMeasurement',
  'customerFashionDNA',
  'trainingPhotoConsent',
  'customer',
  'productSpinFrame',
  'productPhoto',
  'productVariant',
  'productEmbedding',
  'tryOnUsageLog',
  'tryOnJob',
  'aiUsageLog',
  'product',
  'usageCounter',
  'quotaAddonPurchase',
  'subscriptionPayment',
  'subscription',
  'staff',
  'auditLog',
] as const;

async function cleanup(): Promise<void> {
  if (!process.argv.includes('--yes')) {
    console.error('❌ Refusing to run: pass --yes to confirm you want to hard-delete ALL retail data.');
    console.error('   (Run scripts/backup-database.ts first.)');
    process.exit(1);
  }

  console.log('🧹 Cleaning up all retail data (keeping retailer/shop accounts)...');

  // One transaction, one connection — the F-017 flag set here covers every
  // DELETE below (same pattern as the purge cron).
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET app.allow_hard_delete = 'true';`);

    const reset = await tx.retailer.updateMany({
      where: { storefront_collection_id: { not: null } },
      data: { storefront_collection_id: null },
    });
    console.log(`   ✅ ${reset.count} storefront pointers reset`);

    // Dynamic model access across the WIPE_ORDER list — typed via a narrow
    // Record so the transaction client cast is explicit (no `any`).
    const txModels = tx as unknown as Record<
      (typeof WIPE_ORDER)[number],
      { deleteMany: () => Promise<{ count: number }> }
    >;
    for (const model of WIPE_ORDER) {
      const res = await txModels[model].deleteMany({});
      console.log(`   ✅ ${res.count} ${model}`);
    }
  });

  console.log();
  console.log('═══════════════════════════════════════════════');
  console.log('   Cleanup complete!');
  console.log('   All products, customers, orders, and related data removed.');
  console.log('   Retailer/Shop accounts, categories, and backgrounds preserved.');
  console.log('   R2 product images are NOT touched — run scripts/cleanup-r2-product-images.ts');
  console.log('   separately if you want those removed too.');
  console.log('═══════════════════════════════════════════════');
}

cleanup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Cleanup failed (transaction rolled back — nothing was partially deleted):', err);
    process.exit(1);
  });
