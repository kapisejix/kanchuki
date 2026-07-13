/**
 * Cleanup All Data Script
 *
 * Deletes ALL products, customers, and related data directly via Prisma.
 * Keeps the retailer/shop account and their store structure intact.
 *
 * Usage:
 *   npx tsx scripts/cleanup-all-data.ts
 *
 * This works WITHOUT the API server running — goes directly to the database.
 * Deletion order matters (children before parents) to avoid FK violations.
 */

import { prisma } from '../packages/db/src/index.js'

async function cleanup(): Promise<void> {
  console.log('🧹 Cleaning up all data (keeping retailer/shop)...')
  console.log()

  // ── 1. Child tables first (referenced by others) ──────────────
  console.log('── Removing child records ──')

  const customerInteractions = await prisma.customerInteraction.deleteMany({})
  console.log(`   ✅ ${customerInteractions.count} customer interactions`)

  const collectionViews = await prisma.collectionView.deleteMany({})
  console.log(`   ✅ ${collectionViews.count} collection views`)

  const collectionEnquiries = await prisma.collectionEnquiry.deleteMany({})
  console.log(`   ✅ ${collectionEnquiries.count} collection enquiries`)

  const collectionProducts = await prisma.collectionProduct.deleteMany({})
  console.log(`   ✅ ${collectionProducts.count} collection-product links`)

  const tryOnUsageLogs = await prisma.tryOnUsageLog.deleteMany({})
  console.log(`   ✅ ${tryOnUsageLogs.count} try-on usage logs`)

  const trainingConsents = await prisma.trainingPhotoConsent.deleteMany({})
  console.log(`   ✅ ${trainingConsents.count} training consents`)

  const tryOnJobs = await prisma.tryOnJob.deleteMany({})
  console.log(`   ✅ ${tryOnJobs.count} try-on jobs`)

  const customerDNA = await prisma.customerFashionDNA.deleteMany({})
  console.log(`   ✅ ${customerDNA.count} fashion DNA records`)

  const customerMeasurements = await prisma.customerMeasurement.deleteMany({})
  console.log(`   ✅ ${customerMeasurements.count} customer measurements`)

  const customers = await prisma.customer.deleteMany({})
  console.log(`   ✅ ${customers.count} customers`)

  const productPhotos = await prisma.productPhoto.deleteMany({})
  console.log(`   ✅ ${productPhotos.count} product photos`)

  const productVariants = await prisma.productVariant.deleteMany({})
  console.log(`   ✅ ${productVariants.count} product variants`)

  const productEmbeddings = await prisma.productEmbedding.deleteMany({})
  console.log(`   ✅ ${productEmbeddings.count} product embeddings`)

  const collections = await prisma.collection.deleteMany({})
  console.log(`   ✅ ${collections.count} collections`)

  const products = await prisma.product.deleteMany({})
  console.log(`   ✅ ${products.count} products`)

  // ── 3. Other independent tables ─────────────────────────────
  console.log()
  console.log('── Other Data ──')

  const subPayments = await prisma.subscriptionPayment.deleteMany({})
  console.log(`   ✅ ${subPayments.count} subscription payments`)

  const subscriptions = await prisma.subscription.deleteMany({})
  console.log(`   ✅ ${subscriptions.count} subscriptions`)

  const staff = await prisma.staff.deleteMany({})
  console.log(`   ✅ ${staff.count} staff members`)

  const sizeCharts = await prisma.sizeChart.deleteMany({})
  console.log(`   ✅ ${sizeCharts.count} size charts`)

  const auditLogs = await prisma.auditLog.deleteMany({})
  console.log(`   ✅ ${auditLogs.count} audit logs`)

  // ── Summary ─────────────────────────────────────────────────
  console.log()
  console.log('═══════════════════════════════════════════════')
  console.log('   Cleanup complete!')
  console.log('   All products, customers, and related data removed.')
  console.log('   Retailer/Shop account preserved.')
  console.log('   Store sections preserved.')
  console.log('═══════════════════════════════════════════════')
}

cleanup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Cleanup failed:', err)
    process.exit(1)
  })
