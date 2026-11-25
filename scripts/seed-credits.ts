/**
 * Seed try-on credits for the test retailer.
 *
 * The test retailer is created by Supabase auth with phone +919999999999
 * and OTP 123456. This script gives them 100 try-on generations a month so
 * the E2E test can proceed past the quota check.
 *
 * Try-on is metered as TRY_ON_GENERATION (F-040). The old
 * `retailers.try_on_credits` column is gone; a per-retailer
 * RetailerLimitOverride wins over the plan limit in lib/quota.ts
 * effectiveLimit(), so that is what this script sets.
 *
 * Writes to whatever DATABASE_URL points at. Dev/staging only.
 *
 * Usage: cd scripts && npx tsx seed-credits.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TRY_ON_LIMIT = 100;

async function main() {
  console.log('🔧 Seeding try-on credits for test retailer...\n');

  // The test phone used in E2E (normalized — no +91 prefix in DB)
  const testPhone = '9999999999';

  const retailer = await prisma.retailer.findUnique({
    where: { phone: testPhone },
    select: { id: true, phone: true, shop_name: true, plan: true },
  });

  if (!retailer) {
    console.log(`❌ Test retailer with phone ${testPhone} not found.`);
    console.log('   Has the E2E test been run at least once to create the account?');
    console.log('   Run the E2E test first: npx tsx scripts/e2e-test.ts');
    process.exit(1);
  }

  const where = {
    retailer_id_resource_type: {
      retailer_id: retailer.id,
      resource_type: 'TRY_ON_GENERATION' as const,
    },
  };
  const before = await prisma.retailerLimitOverride.findUnique({ where });

  console.log('  Found retailer:');
  console.log(`    ID:      ${retailer.id}`);
  console.log(`    Shop:    ${retailer.shop_name || '(not set — test account)'}`);
  console.log(`    Plan:    ${retailer.plan}`);
  console.log(
    `    Try-on:  ${before ? `${before.limit_per_period}/${before.period}` : 'plan default'}`,
  );
  console.log();

  await prisma.retailerLimitOverride.upsert({
    where,
    create: {
      retailer_id: retailer.id,
      resource_type: 'TRY_ON_GENERATION',
      limit_per_period: TRY_ON_LIMIT,
      period: 'MONTH',
      reason: 'E2E test retailer (scripts/seed-credits.ts)',
    },
    update: { limit_per_period: TRY_ON_LIMIT, period: 'MONTH' },
  });

  console.log(`✅ Try-on limit set to ${TRY_ON_LIMIT}/MONTH (override).`);
  console.log();

  // Also upgrade them to GROWTH plan so they have proper limits
  if (retailer.plan !== 'GROWTH') {
    await prisma.retailer.update({
      where: { id: retailer.id },
      data: { plan: 'GROWTH', max_products: 2000, max_customers: 1000 },
    });
    console.log(`✅ Upgraded plan: ${retailer.plan} → GROWTH`);
  }

  console.log();
  console.log('🎉 Ready for E2E try-on test!');
}

main()
  .catch((e) => {
    console.error('\n❌ Failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
