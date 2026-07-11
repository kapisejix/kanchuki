/**
 * Seed try-on credits for the test retailer.
 *
 * The test retailer is created by Supabase auth with phone +919999999999
 * and OTP 123456. This script gives them 100 try-on credits so the
 * E2E test can proceed past the credit check.
 *
 * Usage: cd scripts && npx tsx seed-credits.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔧 Seeding try-on credits for test retailer...\n')

  // The test phone used in E2E (normalized — no +91 prefix in DB)
  const testPhone = '9999999999'

  // Find the retailer
  const retailer = await prisma.retailer.findUnique({
    where: { phone: testPhone },
    select: { id: true, phone: true, shop_name: true, plan: true, try_on_credits: true },
  })

  if (!retailer) {
    console.log(`❌ Test retailer with phone ${testPhone} not found.`)
    console.log('   Has the E2E test been run at least once to create the account?')
    console.log('   Run the E2E test first: npx tsx scripts/e2e-test.ts')
    process.exit(1)
  }

  console.log(`  Found retailer:`)
  console.log(`    ID:     ${retailer.id}`)
  console.log(`    Shop:   ${retailer.shop_name || '(not set — test account)'}`)
  console.log(`    Plan:   ${retailer.plan}`)
  console.log(`    Credits: ${retailer.try_on_credits}`)
  console.log()

  // Give them 100 try-on credits
  const updated = await prisma.retailer.update({
    where: { id: retailer.id },
    data: { try_on_credits: 100 },
  })

  console.log(`✅ Updated try-on credits: ${retailer.try_on_credits} → ${updated.try_on_credits}`)
  console.log(`   The test retailer now has 100 try-on credits available.`)
  console.log()

  // Also upgrade them to GROWTH plan so they have proper limits
  if (retailer.plan !== 'GROWTH') {
    await prisma.retailer.update({
      where: { id: retailer.id },
      data: {
        plan: 'GROWTH',
        max_products: 2000,
        max_customers: 1000,
        try_on_credits: 100,
      },
    })
    console.log(`✅ Upgraded plan: ${retailer.plan} → GROWTH`)
  }

  console.log()
  console.log('🎉 Ready for E2E try-on test!')
}

main()
  .catch((e) => {
    console.error('\n❌ Failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
