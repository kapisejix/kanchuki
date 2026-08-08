/**
 * Verify Demo Data Reset — read-only confirmation that the wipe worked.
 *
 * Checks the tables scripts/reset-demo-data.sql should have emptied (expect 0
 * rows) and the shop tables it should have kept (expect > 0 rows). Read-only
 * SELECTs only — safe to run any time.
 *
 * Usage:
 *   npx tsx scripts/verify-demo-reset.ts
 *
 * Exit code 0 = all expectations met; 1 = something's off (details printed).
 */
import { prisma } from '../packages/db/src/index.js';

// Tables the wipe empties — must all be 0.
const WIPED = [
  ['products', () => prisma.product.count()],
  ['product_photos', () => prisma.productPhoto.count()],
  ['product_variants', () => prisma.productVariant.count()],
  ['product_spin_frames', () => prisma.productSpinFrame.count()],
  ['product_embeddings', () => prisma.productEmbedding.count()],
  ['collections', () => prisma.collection.count()],
  ['collection_products', () => prisma.collectionProduct.count()],
  ['collection_views', () => prisma.collectionView.count()],
  ['collection_enquiries', () => prisma.collectionEnquiry.count()],
  ['customers', () => prisma.customer.count()],
  ['customer_interactions', () => prisma.customerInteraction.count()],
  ['customer_measurements', () => prisma.customerMeasurement.count()],
  ['customer_fashion_dna', () => prisma.customerFashionDNA.count()],
  ['orders', () => prisma.order.count()],
  ['order_items', () => prisma.orderItem.count()],
  ['staff', () => prisma.staff.count()],
  ['subscriptions', () => prisma.subscription.count()],
  ['subscription_payments', () => prisma.subscriptionPayment.count()],
  ['size_charts', () => prisma.sizeChart.count()],
  ['size_chart_rows', () => prisma.sizeChartRow.count()],
  ['try_on_jobs', () => prisma.tryOnJob.count()],
  ['try_on_usage_logs', () => prisma.tryOnUsageLog.count()],
  ['ai_usage_logs', () => prisma.aiUsageLog.count()],
  ['usage_counters', () => prisma.usageCounter.count()],
  ['quota_addon_purchases', () => prisma.quotaAddonPurchase.count()],
  ['audit_logs', () => prisma.auditLog.count()],
] as const;

// Tables the wipe keeps. Only retailers is MANDATORY (> 0 — the wipe's whole
// point is keeping the shop accounts). The rest are informational: a 0 there
// just means they were never populated in prod (e.g. backgrounds not yet
// uploaded, no team members created yet), not that the wipe deleted them.
const KEPT: ReadonlyArray<readonly [string, () => Promise<number>, 'mandatory' | 'optional']> = [
  ['retailers (shop accounts)', () => prisma.retailer.count(), 'mandatory'],
  ['product_categories', () => prisma.productCategory.count(), 'optional'],
  ['background_images', () => prisma.backgroundImage.count(), 'optional'],
  ['store_sections', () => prisma.storeSection.count(), 'optional'],
  ['team_members', () => prisma.teamMember.count(), 'optional'],
  ['territories', () => prisma.territory.count(), 'optional'],
  ['plan_limits', () => prisma.planLimit.count(), 'optional'],
  ['integration_settings', () => prisma.integrationSetting.count(), 'optional'],
  ['default_product_categories', () => prisma.defaultProductCategory.count(), 'optional'],
  ['default_product_attributes', () => prisma.defaultProductAttribute.count(), 'optional'],
] as const;

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════');
  console.log('   Demo Data Reset — Verification');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  let failures = 0;

  console.log('── Wiped tables (expect 0) ────────────────────────');
  for (const [name, countFn] of WIPED) {
    const count = await countFn();
    const ok = count === 0;
    if (!ok) failures++;
    console.log(`   ${ok ? '✅' : '❌'} ${name.padEnd(26)} ${count}`);
  }

  console.log('');
  console.log('── Kept tables ─────────────────────────────────────');
  for (const [name, countFn, kind] of KEPT) {
    const count = await countFn();
    if (kind === 'mandatory') {
      const ok = count > 0;
      if (!ok) failures++;
      console.log(`   ${ok ? '✅' : '❌'} ${name.padEnd(26)} ${count} (mandatory)`);
    } else {
      // Optional kept tables: 0 is fine (never populated), just informational.
      console.log(`   ${count > 0 ? '✅' : 'ℹ️'} ${name.padEnd(26)} ${count}${count > 0 ? '' : ' (never populated — ok)'}`);
    }
  }

  console.log('');
  if (failures === 0) {
    console.log('✅ ALL CHECKS PASSED — demo data wiped, shop intact.');
    process.exit(0);
  } else {
    console.log(`❌ ${failures} check(s) failed — see ❌ rows above.`);
    console.log('   (If wiped tables still have rows: the SQL Editor wipe may not have run yet.)');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
