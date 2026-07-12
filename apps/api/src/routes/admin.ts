import { createHmac, timingSafeEqual } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@kanchuki/db'
import { PLAN_PRICING } from '@kanchuki/shared'
import { forbidden } from '../plugins/error-handler.js'

function validAdminKey(provided: string | undefined): boolean {
  const expected = process.env['ADMIN_API_KEY'] ?? ''
  if (!expected || !provided) return false
  // Hash both sides so timingSafeEqual gets equal-length buffers
  const h = (s: string) => createHmac('sha256', 'admin-key').update(s).digest()
  return timingSafeEqual(h(provided), h(expected))
}

export const adminRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', async (request) => {
    const key = request.headers['x-admin-key'] as string | undefined
    if (!validAdminKey(key)) throw forbidden('Invalid admin key')
  })

  // ─── GET /admin/stats ───────────────────────────────────────────
  server.get('/stats', async () => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const [
      totalRetailers,
      activeSubscriptions,
      trialRetailers,
      totalProducts,
      totalCollections,
      viewsThisMonth,
      enquiriesThisMonth,
    ] = await Promise.all([
      prisma.retailer.count({ where: { deleted_at: null } }),
      prisma.retailer.count({ where: { deleted_at: null, plan_status: 'ACTIVE' } }),
      prisma.retailer.count({ where: { deleted_at: null, plan_status: 'TRIAL' } }),
      prisma.product.count({ where: { deleted_at: null } }),
      prisma.collection.count({ where: { deleted_at: null } }),
      prisma.collectionView.count({ where: { created_at: { gte: monthStart } } }),
      prisma.collectionEnquiry.count({ where: { created_at: { gte: monthStart } } }),
    ])

    return {
      data: {
        total_retailers: totalRetailers,
        active_subscriptions: activeSubscriptions,
        trial_retailers: trialRetailers,
        total_products: totalProducts,
        total_collections: totalCollections,
        views_this_month: viewsThisMonth,
        enquiries_this_month: enquiriesThisMonth,
      },
    }
  })

  // ─── GET /admin/retailers ───────────────────────────────────────
  server.get('/retailers', async (request) => {
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        search: z.string().max(100).optional(),
      })
      .safeParse(request.query)
    const { cursor, limit, search } = query.success
      ? query.data
      : { cursor: undefined, limit: 50, search: undefined }

    const retailers = await prisma.retailer.findMany({
      where: {
        deleted_at: null,
        ...(cursor ? { id: { gt: cursor } } : {}),
        ...(search
          ? {
              OR: [
                { shop_name: { contains: search, mode: 'insensitive' as const } },
                { city: { contains: search, mode: 'insensitive' as const } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        shop_name: true,
        city: true,
        phone: true,
        plan: true,
        plan_status: true,
        trial_ends_at: true,
        created_at: true,
        onboarding_completed: true,
        _count: {
          select: {
            products: { where: { deleted_at: null } },
            customers: { where: { deleted_at: null } },
            collections: { where: { deleted_at: null } },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    })

    const hasMore = retailers.length > limit
    const page = hasMore ? retailers.slice(0, limit) : retailers

    return {
      data: page.map(({ _count, ...r }) => ({
        ...r,
        product_count: _count.products,
        customer_count: _count.customers,
        collection_count: _count.collections,
      })),
      pagination: {
        cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        has_more: hasMore,
      },
    }
  })

  // ─── POST /admin/billing/setup-plans ────────────────────────────
  // Auto-creates all 6 Razorpay plans (3 plans × monthly/annual).
  // Run once after setting RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET.
  // Creates plans, prints the IDs as env var settings, does NOT modify DB.
  server.post('/billing/setup-plans', async (request) => {
    const created: Record<string, { id: string; period: string }> = {}

    for (const planKey of ['STARTER', 'GROWTH', 'PRO'] as const) {
      for (const period of ['monthly', 'annual'] as const) {
        const amountPaise = PLAN_PRICING[planKey][period]
        const name = `${planKey} ${period === 'monthly' ? 'Monthly' : 'Annual'}`

        const res = await fetch('https://api.razorpay.com/v1/plans', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(
              `${process.env['RAZORPAY_KEY_ID'] ?? ''}:${process.env['RAZORPAY_KEY_SECRET'] ?? ''}`,
            ).toString('base64')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            period: period === 'monthly' ? 'monthly' : 'yearly',
            interval: 1,
            item: {
              name: `Kanchuki ${name}`,
              description: `Kanchuki ${planKey} plan — ${period} billing`,
              amount: amountPaise,
              currency: 'INR',
            },
            notes: {
              plan: planKey,
              billing_period: period,
            },
          }),
        })

        if (!res.ok) {
          const body = await res.text()
          request.log.error({ planKey, period, status: res.status, body }, 'Razorpay plan creation failed')
          continue
        }

        const plan = (await res.json()) as { id: string }
        created[`RAZORPAY_PLAN_${planKey}_${period === 'monthly' ? 'MONTHLY' : 'ANNUAL'}`] = {
          id: plan.id,
          period,
        }
      }
    }

    const count = Object.keys(created).length
    request.log.info({ created }, `Created ${count}/6 Razorpay plans`)

    // Build env var snippet for easy copy-paste into Railway/.
    let envSnippet = '# Razorpay plan IDs — set these in your environment\n'
    for (const [key, val] of Object.entries(created)) {
      envSnippet += `${key}=${val.id}\n`
    }
    if (count === 0) {
      envSnippet = 'No plans created. Check the server logs for Razorpay errors.'
    }

    return {
      data: {
        created: count,
        total: 6,
        env_vars: created,
        env_snippet: envSnippet,
      },
    }
  })
}
