import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// F-010 (docs/PRO-REQUIREMENTS.md): seeds only the two resources with real $
// economics behind them (Claude Vision tagging calls, product-catalog size).
// PRODUCT_UPLOAD/AI_TAGGING_CALL are LIFETIME caps — they mirror the existing
// max_products semantics (total catalog size), not a monthly quota.
// TRY_ON stays MONTH, matching the existing "Try-ons/mo" pricing table.
//
// Deliberately NOT seeded: IMAGE_CROP, BG_REMOVAL (local `sharp`/imgly compute,
// $0 marginal cost — folded into PRODUCT_UPLOAD, no separate limit) and
// API_REQUEST (abuse/rate-limiting concern, not a billing quota — belongs in
// a Fastify rate-limit plugin, not this table). checkQuota() fails open when
// no row exists, so leaving them unseeded is the correct "no limit" state.
//
// Idempotent — upsert on the (plan, resource_type) unique key, safe to re-run.
const ROWS: Array<{
  plan: 'STARTER' | 'GROWTH' | 'PRO'
  resource_type: 'PRODUCT_UPLOAD' | 'AI_TAGGING_CALL' | 'TRY_ON'
  limit_per_period: number
  period: 'LIFETIME' | 'MONTH'
}> = [
  // PRODUCT_UPLOAD — matches Retailer.max_products defaults (seed.ts, admin.ts)
  { plan: 'STARTER', resource_type: 'PRODUCT_UPLOAD', limit_per_period: 500, period: 'LIFETIME' },
  { plan: 'GROWTH', resource_type: 'PRODUCT_UPLOAD', limit_per_period: 2000, period: 'LIFETIME' },
  { plan: 'PRO', resource_type: 'PRODUCT_UPLOAD', limit_per_period: -1, period: 'LIFETIME' },

  // AI_TAGGING_CALL — tied 1:1 to PRODUCT_UPLOAD (one tag call per upload),
  // +15% headroom for retag/retry
  { plan: 'STARTER', resource_type: 'AI_TAGGING_CALL', limit_per_period: 575, period: 'LIFETIME' },
  { plan: 'GROWTH', resource_type: 'AI_TAGGING_CALL', limit_per_period: 2300, period: 'LIFETIME' },
  { plan: 'PRO', resource_type: 'AI_TAGGING_CALL', limit_per_period: -1, period: 'LIFETIME' },

  // TRY_ON — matches existing "Try-ons/mo" pricing table (PRO-REQUIREMENTS.md §6)
  { plan: 'STARTER', resource_type: 'TRY_ON', limit_per_period: 0, period: 'MONTH' },
  { plan: 'GROWTH', resource_type: 'TRY_ON', limit_per_period: 100, period: 'MONTH' },
  { plan: 'PRO', resource_type: 'TRY_ON', limit_per_period: 500, period: 'MONTH' },
]

async function main() {
  for (const row of ROWS) {
    await prisma.planLimit.upsert({
      where: { plan_resource_type: { plan: row.plan, resource_type: row.resource_type } },
      create: row,
      update: { limit_per_period: row.limit_per_period, period: row.period },
    })
    console.log(`  ✅ ${row.plan} / ${row.resource_type} → ${row.limit_per_period} per ${row.period}`)
  }
  console.log('\n✅ plan_limits seeded.')
}

main()
  .catch((e) => {
    console.error('\n❌ plan_limits seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
