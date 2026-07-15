import { createHmac, timingSafeEqual } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@kanchuki/db'
import { PLAN_PRICING } from '@kanchuki/shared'
import { forbidden, notFound } from '../plugins/error-handler.js'

export function validAdminKey(provided: string | undefined): boolean {
  const expected = process.env['ADMIN_API_KEY'] ?? ''
  if (!expected || !provided) return false
  // Hash both sides so timingSafeEqual gets equal-length buffers
  const h = (s: string) => createHmac('sha256', 'admin-key').update(s).digest()
  return timingSafeEqual(h(provided), h(expected))
}

export const adminRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', async (request, reply) => {
    // Skip auth for login endpoint — use request.url (raw URL) for reliability
    if (request.url === '/v1/admin/login') return

    const key = request.headers['x-admin-key'] as string | undefined
    if (!validAdminKey(key)) throw forbidden('Invalid admin key')
  })

  // ─── POST /admin/login ───────────────────────────────────────────
  // Authenticate with email + password, returns admin API key for subsequent requests.
  server.post('/login', async (request) => {
    const body = z
      .object({
        email: z.string().email('Invalid email'),
        password: z.string().min(1, 'Password is required').max(128),
      })
      .parse(request.body)

    const expectedEmail = process.env['ADMIN_EMAIL']
    const expectedHash = process.env['ADMIN_PASSWORD_HASH']

    if (!expectedEmail || !expectedHash) {
      request.log.error('ADMIN_EMAIL or ADMIN_PASSWORD_HASH not configured')
      throw forbidden('Invalid credentials')
    }

    // Compare email (case-insensitive)
    if (body.email.toLowerCase() !== expectedEmail.toLowerCase()) {
      throw forbidden('Invalid credentials')
    }

    // Compare password hash using timingSafeEqual
    const providedHash = createHmac('sha256', 'admin-password')
      .update(body.password)
      .digest()
    const expectedHashBuf = Buffer.from(expectedHash, 'hex')

    if (
      providedHash.length !== expectedHashBuf.length ||
      !timingSafeEqual(providedHash, expectedHashBuf)
    ) {
      throw forbidden('Invalid credentials')
    }

    request.log.info('Admin login successful')

    return {
      data: {
        token: process.env['ADMIN_API_KEY'],
        email: body.email,
      },
    }
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

  // ─── GET /admin/retailers/:id ──────────────────────────────────
  // Full retailer detail with product/customer counts, try-on usage, subscription.
  server.get('/retailers/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)

    const retailer = await prisma.retailer.findUnique({
      where: { id, deleted_at: null },
      select: {
        id: true,
        shop_name: true,
        owner_name: true,
        phone: true,
        city: true,
        state: true,
        gstin: true,
        plan: true,
        plan_status: true,
        trial_ends_at: true,
        plan_expires_at: true,
        onboarding_completed: true,
        onboarding_step: true,
        created_at: true,
        updated_at: true,
        max_products: true,
        max_customers: true,
        try_on_credits: true,
        max_staff_seats: true,
        _count: {
          select: {
            products: { where: { deleted_at: null } },
            customers: { where: { deleted_at: null } },
            collections: { where: { deleted_at: null } },
            staff: { where: { is_active: true } },
          },
        },
      },
    })

    if (!retailer) throw notFound('Retailer not found')

    // Get try-on usage this month
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const [tryOnUsageThisMonth, tryOnUsageTotal] = await Promise.all([
      prisma.tryOnUsageLog.aggregate({
        where: { retailer_id: id, created_at: { gte: monthStart } },
        _sum: { cost_usd: true },
        _count: true,
      }),
      prisma.tryOnUsageLog.aggregate({
        where: { retailer_id: id },
        _sum: { cost_usd: true },
        _count: true,
      }),
    ])

    // Get recent products
    const recentProducts = await prisma.product.findMany({
      where: { retailer_id: id, deleted_at: null },
      orderBy: { created_at: 'desc' },
      take: 10,
      select: {
        id: true,
        name: true,
        category: true,
        primary_color: true,
        price_min: true,
        status: true,
        created_at: true,
        _count: { select: { photos: true } },
      },
    })

    const { _count, ...retailerData } = retailer

    return {
      data: {
        ...retailerData,
        product_count: _count.products,
        customer_count: _count.customers,
        collection_count: _count.collections,
        staff_count: _count.staff,
        try_on: {
          this_month: {
            count: tryOnUsageThisMonth._count,
            cost_usd: tryOnUsageThisMonth._sum.cost_usd ?? 0,
          },
          total: {
            count: tryOnUsageTotal._count,
            cost_usd: tryOnUsageTotal._sum.cost_usd ?? 0,
          },
        },
        recent_products: recentProducts,
      },
    }
  })

  // ─── POST /admin/retailers/:id/extend-trial ────────────────────
  // Extend a retailer's trial by N days.
  server.post('/retailers/:id/extend-trial', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    const body = z.object({ days: z.number().int().min(1).max(90) }).parse(request.body)

    const retailer = await prisma.retailer.findUnique({
      where: { id, deleted_at: null },
      select: { id: true, trial_ends_at: true },
    })
    if (!retailer) throw notFound('Retailer not found')

    const newEnd = retailer.trial_ends_at && retailer.trial_ends_at > new Date()
      ? new Date(retailer.trial_ends_at.getTime() + body.days * 86400000)
      : new Date(Date.now() + body.days * 86400000)

    await prisma.retailer.update({
      where: { id },
      data: { trial_ends_at: newEnd, plan_status: 'TRIAL' },
    })

    request.log.info({ retailer_id: id, days: body.days, new_trial_end: newEnd }, 'Trial extended')

    return { data: { trial_ends_at: newEnd.toISOString(), plan_status: 'TRIAL' } }
  })

  // ─── POST /admin/retailers/:id/change-plan ─────────────────────
  // Change a retailer's plan and update limits.
  server.post('/retailers/:id/change-plan', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    const body = z
      .object({
        plan: z.enum(['STARTER', 'GROWTH', 'PRO']),
        status: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED']),
        extend_trial_days: z.number().int().min(0).max(90).optional(),
      })
      .parse(request.body)

    const retailer = await prisma.retailer.findUnique({
      where: { id, deleted_at: null },
    })
    if (!retailer) throw notFound('Retailer not found')

    const limits: Record<string, { products: number; customers: number; try_on: number }> = {
      STARTER: { products: 500, customers: 200, try_on: 0 },
      GROWTH: { products: 2000, customers: 1000, try_on: 100 },
      PRO: { products: 999999, customers: 999999, try_on: 500 },
    }

    const planLimits = limits[body.plan]
    if (!planLimits) throw notFound(`Plan ${body.plan} not found`)

    const updateData: Record<string, unknown> = {
      plan: body.plan,
      plan_status: body.status,
      max_products: planLimits.products,
      max_customers: planLimits.customers,
      try_on_credits: planLimits.try_on,
    }

    if (body.extend_trial_days && body.extend_trial_days > 0) {
      updateData.trial_ends_at = new Date(Date.now() + body.extend_trial_days * 86400000)
    }

    await prisma.retailer.update({ where: { id }, data: updateData })

    request.log.info({ retailer_id: id, plan: body.plan, status: body.status }, 'Plan changed')

    return { data: { plan: body.plan, plan_status: body.status, ...updateData } }
  })

  // ─── GET /admin/usage ──────────────────────────────────────────
  // Platform-wide usage stats including try-on and revenue.
  server.get('/usage', async () => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

    const [tryOnUsage, activeSubscriptions, trialCount, totalRetailers] = await Promise.all([
      prisma.tryOnUsageLog.aggregate({
        where: { created_at: { gte: monthStart } },
        _sum: { cost_usd: true },
        _count: true,
      }),
      prisma.subscription.findMany({
        where: { status: 'ACTIVE' },
        select: { amount_inr: true, billing_period: true },
      }),
      prisma.retailer.count({ where: { plan_status: 'TRIAL', deleted_at: null } }),
      prisma.retailer.count({ where: { deleted_at: null } }),
    ])

    const mrr = activeSubscriptions.reduce((sum, sub) => {
      const monthlyAmount = sub.billing_period === 'annual' ? sub.amount_inr / 12 : sub.amount_inr
      return sum + monthlyAmount
    }, 0)

    return {
      data: {
        total_retailers: totalRetailers,
        trial_retailers: trialCount,
        active_subscriptions: activeSubscriptions.length,
        mrr_inr: Math.round(mrr),
        try_on_this_month: tryOnUsage._count,
        try_on_cost_usd: tryOnUsage._sum.cost_usd ?? 0,
      },
    }
  })
}
