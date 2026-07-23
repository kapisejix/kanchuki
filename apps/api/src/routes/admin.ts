import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getUploadPresignedUrl, publicUrl } from '@kanchuki/ai';
import { encryptSecret, getSecret, invalidateSecret, maskSecret, prisma } from '@kanchuki/db';
import { INTEGRATION_KEYS, PLAN_PRICING, R2_PATHS } from '@kanchuki/shared';

type IntegrationKeyEntry = (typeof INTEGRATION_KEYS)[number];
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { forbidden, notFound, validationError } from '../plugins/error-handler.js';

export function validAdminKey(provided: string | undefined): boolean {
  const expected = process.env.ADMIN_API_KEY ?? '';
  if (!expected || !provided) return false;
  // Hash both sides so timingSafeEqual gets equal-length buffers
  const h = (s: string) => createHmac('sha256', 'admin-key').update(s).digest();
  return timingSafeEqual(h(provided), h(expected));
}

export const adminRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', async (request, _reply) => {
    // Skip auth for login endpoint — use request.url (raw URL) for reliability
    if (request.url === '/v1/admin/login') return;

    const key = request.headers['x-admin-key'] as string | undefined;
    if (!validAdminKey(key)) throw forbidden('Invalid admin key');
  });

  // ─── POST /admin/login ───────────────────────────────────────────
  // Authenticate with email + password, returns admin API key for subsequent requests.
  server.post('/login', async (request) => {
    const body = z
      .object({
        email: z.string().email('Invalid email'),
        password: z.string().min(1, 'Password is required').max(128),
      })
      .parse(request.body);

    const expectedEmail = process.env.ADMIN_EMAIL;
    const expectedHash = process.env.ADMIN_PASSWORD_HASH;

    if (!expectedEmail || !expectedHash) {
      request.log.error('ADMIN_EMAIL or ADMIN_PASSWORD_HASH not configured');
      throw forbidden('Invalid credentials');
    }

    // Compare email (case-insensitive)
    if (body.email.toLowerCase() !== expectedEmail.toLowerCase()) {
      throw forbidden('Invalid credentials');
    }

    // Compare password hash using timingSafeEqual
    const providedHash = createHmac('sha256', 'admin-password').update(body.password).digest();
    const expectedHashBuf = Buffer.from(expectedHash, 'hex');

    if (
      providedHash.length !== expectedHashBuf.length ||
      !timingSafeEqual(providedHash, expectedHashBuf)
    ) {
      throw forbidden('Invalid credentials');
    }

    request.log.info('Admin login successful');

    return {
      data: {
        token: process.env.ADMIN_API_KEY,
        email: body.email,
      },
    };
  });

  // ─── GET /admin/stats ───────────────────────────────────────────
  server.get('/stats', async () => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
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
    ]);

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
    };
  });

  // ─── GET /admin/retailers ───────────────────────────────────────
  server.get('/retailers', async (request) => {
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        search: z.string().max(100).optional(),
        city: z.string().max(100).optional(),
        state: z.string().max(100).optional(),
        plan: z.enum(['STARTER', 'GROWTH', 'PRO']).optional(),
        status: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED']).optional(),
      })
      .safeParse(request.query);
    const { cursor, limit, search, city, state, plan, status } = query.success
      ? query.data
      : { cursor: undefined, limit: 50, search: undefined, city: undefined, state: undefined, plan: undefined, status: undefined };

    const retailers = await prisma.retailer.findMany({
      where: {
        deleted_at: null,
        ...(cursor ? { id: { gt: cursor } } : {}),
        ...(city ? { city: { contains: city, mode: 'insensitive' as const } } : {}),
        ...(state ? { state: { equals: state, mode: 'insensitive' as const } } : {}),
        ...(plan ? { plan } : {}),
        ...(status ? { plan_status: status } : {}),
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
        state: true,
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
    });

    const hasMore = retailers.length > limit;
    const page = hasMore ? retailers.slice(0, limit) : retailers;

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
    };
  });

  // ─── DELETE /admin/retailers ─────────────────────────────────────
  // Bulk soft-delete retailers from the admin grid. Archives their
  // collections and deactivates staff, same as the retailer self-delete
  // flow (DELETE /retailers/me) — products/customers/billing kept for GST audit.
  server.delete('/retailers', async (request) => {
    const body = z.object({ ids: z.array(z.string()).min(1).max(100) }).parse(request.body);

    await prisma.$transaction([
      prisma.retailer.updateMany({
        where: { id: { in: body.ids }, deleted_at: null },
        data: { deleted_at: new Date() },
      }),
      prisma.collection.updateMany({
        where: { retailer_id: { in: body.ids }, deleted_at: null },
        data: { deleted_at: new Date(), status: 'ARCHIVED' },
      }),
      prisma.staff.updateMany({
        where: { retailer_id: { in: body.ids }, is_active: true },
        data: { is_active: false },
      }),
    ]);

    request.log.info({ retailer_ids: body.ids }, 'Bulk retailer delete');
    return { data: { deleted: body.ids.length } };
  });

  // ─── GET /admin/customers ───────────────────────────────────────
  // Cross-retailer customer list (User Management) — PII, admin-only.
  server.get('/customers', async (request) => {
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        search: z.string().max(100).optional(),
      })
      .safeParse(request.query);
    const { cursor, limit, search } = query.success
      ? query.data
      : { cursor: undefined, limit: 50, search: undefined };

    const customers = await prisma.customer.findMany({
      where: {
        deleted_at: null,
        ...(cursor ? { id: { gt: cursor } } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        gender: true,
        consent_given: true,
        created_at: true,
        retailer: { select: { id: true, shop_name: true, city: true } },
        _count: { select: { measurements: true } },
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });

    const hasMore = customers.length > limit;
    const page = hasMore ? customers.slice(0, limit) : customers;

    return {
      data: page.map(({ _count, ...c }) => ({ ...c, measurement_count: _count.measurements })),
      pagination: {
        cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        has_more: hasMore,
      },
    };
  });

  // ─── POST /admin/billing/setup-plans ────────────────────────────
  // Auto-creates all 6 Razorpay plans (3 plans × monthly/annual).
  // Run once after setting RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET.
  // Creates plans, prints the IDs as env var settings, does NOT modify DB.
  server.post('/billing/setup-plans', async (request) => {
    const created: Record<string, { id: string; period: string }> = {};
    const razorpayKeyId = (await getSecret('RAZORPAY_KEY_ID')) ?? '';
    const razorpayKeySecret = (await getSecret('RAZORPAY_KEY_SECRET')) ?? '';

    for (const planKey of ['STARTER', 'GROWTH', 'PRO'] as const) {
      for (const period of ['monthly', 'annual'] as const) {
        const amountPaise = PLAN_PRICING[planKey][period];
        const name = `${planKey} ${period === 'monthly' ? 'Monthly' : 'Annual'}`;

        const res = await fetch('https://api.razorpay.com/v1/plans', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}`,
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
        });

        if (!res.ok) {
          const body = await res.text();
          request.log.error(
            { planKey, period, status: res.status, body },
            'Razorpay plan creation failed',
          );
          continue;
        }

        const plan = (await res.json()) as { id: string };
        created[`RAZORPAY_PLAN_${planKey}_${period === 'monthly' ? 'MONTHLY' : 'ANNUAL'}`] = {
          id: plan.id,
          period,
        };
      }
    }

    const count = Object.keys(created).length;
    request.log.info({ created }, `Created ${count}/6 Razorpay plans`);

    let envSnippet = '# Razorpay plan IDs — set these in your environment\n';
    for (const [key, val] of Object.entries(created)) {
      envSnippet += `${key}=${val.id}\n`;
    }
    if (count === 0) {
      envSnippet = 'No plans created. Check the server logs for Razorpay errors.';
    }

    return {
      data: {
        created: count,
        total: 6,
        env_vars: created,
        env_snippet: envSnippet,
      },
    };
  });

  // ─── GET /admin/retailers/:id ──────────────────────────────────
  // Full retailer detail with product/customer counts, try-on usage, subscription.
  server.get('/retailers/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);

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
        address_line1: true,
        address_line2: true,
        pincode: true,
        kyc_status: true,
        kyc_gst_url: true,
        kyc_aadhar_front_url: true,
        kyc_aadhar_back_url: true,
        kyc_submitted_at: true,
        kyc_reviewed_at: true,
        kyc_rejection_reason: true,
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
    });

    if (!retailer) throw notFound('Retailer not found');

    // Get try-on usage this month
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
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
    ]);

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
    });

    const { _count, ...retailerData } = retailer;

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
    };
  });

  // ─── POST /admin/retailers/:id/extend-trial ────────────────────
  // Extend a retailer's trial by N days.
  server.post('/retailers/:id/extend-trial', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ days: z.number().int().min(1).max(90) }).parse(request.body);

    const retailer = await prisma.retailer.findUnique({
      where: { id, deleted_at: null },
      select: { id: true, trial_ends_at: true },
    });
    if (!retailer) throw notFound('Retailer not found');

    const newEnd =
      retailer.trial_ends_at && retailer.trial_ends_at > new Date()
        ? new Date(retailer.trial_ends_at.getTime() + body.days * 86400000)
        : new Date(Date.now() + body.days * 86400000);

    await prisma.retailer.update({
      where: { id },
      data: { trial_ends_at: newEnd, plan_status: 'TRIAL' },
    });

    request.log.info({ retailer_id: id, days: body.days, new_trial_end: newEnd }, 'Trial extended');

    return { data: { trial_ends_at: newEnd.toISOString(), plan_status: 'TRIAL' } };
  });

  // ─── POST /admin/retailers/:id/change-plan ─────────────────────
  // Change a retailer's plan and update limits.
  server.post('/retailers/:id/change-plan', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        plan: z.enum(['STARTER', 'GROWTH', 'PRO']),
        status: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED']),
        extend_trial_days: z.number().int().min(0).max(90).optional(),
      })
      .parse(request.body);

    const retailer = await prisma.retailer.findUnique({
      where: { id, deleted_at: null },
    });
    if (!retailer) throw notFound('Retailer not found');

    const limits: Record<string, { products: number; customers: number; try_on: number }> = {
      STARTER: { products: 500, customers: 999999, try_on: 0 },
      GROWTH: { products: 2000, customers: 999999, try_on: 100 },
      PRO: { products: 999999, customers: 999999, try_on: 500 },
    };

    const planLimits = limits[body.plan];
    if (!planLimits) throw notFound(`Plan ${body.plan} not found`);

    const updateData: Record<string, unknown> = {
      plan: body.plan,
      plan_status: body.status,
      max_products: planLimits.products,
      max_customers: planLimits.customers,
      try_on_credits: planLimits.try_on,
    };

    if (body.extend_trial_days && body.extend_trial_days > 0) {
      updateData.trial_ends_at = new Date(Date.now() + body.extend_trial_days * 86400000);
    }

    await prisma.retailer.update({ where: { id }, data: updateData });

    request.log.info({ retailer_id: id, plan: body.plan, status: body.status }, 'Plan changed');

    return { data: { plan: body.plan, plan_status: body.status, ...updateData } };
  });

  // ─── GET /admin/plan-limits ─────────────────────────────────────
  // F-010: admin-configurable quota per plan/resource. Read-only for now
  // for retailer_limit_overrides — this screen manages plan-wide defaults.
  server.get('/plan-limits', async () => {
    const rows = await prisma.planLimit.findMany({
      orderBy: [{ plan: 'asc' }, { resource_type: 'asc' }],
    });
    return { data: rows };
  });

  // ─── PUT /admin/plan-limits ─────────────────────────────────────
  // Upsert one (plan, resource_type) row. Creates it if this is the first
  // time a resource is being limited (e.g. admin decides to start metering
  // API_REQUEST later) — checkQuota() treats a missing row as unlimited,
  // so this is also how a limit gets turned on for the first time.
  server.put('/plan-limits', async (request) => {
    const body = z
      .object({
        plan: z.enum(['STARTER', 'GROWTH', 'PRO']),
        resource_type: z.enum([
          'PRODUCT_UPLOAD',
          'AI_TAGGING_CALL',
          'TRY_ON',
          'IMAGE_CROP',
          'BG_REMOVAL',
          'API_REQUEST',
        ]),
        limit_per_period: z.number().int().min(-1),
        period: z.enum(['DAY', 'MONTH', 'LIFETIME']),
      })
      .parse(request.body);

    const row = await prisma.planLimit.upsert({
      where: { plan_resource_type: { plan: body.plan, resource_type: body.resource_type } },
      create: body,
      update: { limit_per_period: body.limit_per_period, period: body.period },
    });

    request.log.info({ plan: body.plan, resource_type: body.resource_type }, 'Plan limit updated');

    return { data: row };
  });

  // ─── GET /admin/retailers/:id/overrides ─────────────────────────
  // F-010: List per-retailer limit overrides for a specific retailer.
  server.get('/retailers/:id/overrides', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const retailer = await prisma.retailer.findUnique({ where: { id, deleted_at: null } });
    if (!retailer) throw notFound('Retailer');

    const overrides = await prisma.retailerLimitOverride.findMany({
      where: { retailer_id: id },
      orderBy: { resource_type: 'asc' },
    });
    return { data: overrides };
  });

  // ─── POST /admin/retailers/:id/overrides ────────────────────────
  // F-010: Create or update a per-retailer limit override.
  server.post('/retailers/:id/overrides', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        resource_type: z.enum([
          'PRODUCT_UPLOAD',
          'AI_TAGGING_CALL',
          'TRY_ON',
          'IMAGE_CROP',
          'BG_REMOVAL',
          'API_REQUEST',
        ]),
        limit_per_period: z.number().int().min(-1),
        period: z.enum(['DAY', 'MONTH', 'LIFETIME']),
        reason: z.string().max(200).optional(),
      })
      .parse(request.body);

    const retailer = await prisma.retailer.findUnique({ where: { id, deleted_at: null } });
    if (!retailer) throw notFound('Retailer');

    const override = await prisma.retailerLimitOverride.upsert({
      where: {
        retailer_id_resource_type: { retailer_id: id, resource_type: body.resource_type },
      },
      create: { retailer_id: id, ...body },
      update: { limit_per_period: body.limit_per_period, period: body.period, reason: body.reason },
    });

    request.log.info({ retailer_id: id, resource_type: body.resource_type }, 'Override set');
    return { data: override };
  });

  // ─── DELETE /admin/retailers/:id/overrides/:overrideId ───────────
  // F-010: Remove a per-retailer limit override, falling back to plan default.
  server.delete('/retailers/:id/overrides/:overrideId', async (request, reply) => {
    const { id, overrideId } = z
      .object({ id: z.string(), overrideId: z.string() })
      .parse(request.params);

    const existing = await prisma.retailerLimitOverride.findFirst({
      where: { id: overrideId, retailer_id: id },
    });
    if (!existing) throw notFound('Override');

    await prisma.retailerLimitOverride.delete({ where: { id: overrideId } });

    request.log.info(
      { retailer_id: id, resource_type: existing.resource_type },
      'Override removed',
    );
    return reply.status(204).send();
  });

  // ─── GET /admin/usage ──────────────────────────────────────────
  // Platform-wide usage stats including try-on and revenue.
  server.get('/usage', async () => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

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
    ]);

    const mrr = activeSubscriptions.reduce((sum, sub) => {
      const monthlyAmount = sub.billing_period === 'annual' ? sub.amount_inr / 12 : sub.amount_inr;
      return sum + monthlyAmount;
    }, 0);

    return {
      data: {
        total_retailers: totalRetailers,
        trial_retailers: trialCount,
        active_subscriptions: activeSubscriptions.length,
        mrr_inr: Math.round(mrr),
        try_on_this_month: tryOnUsage._count,
        try_on_cost_usd: tryOnUsage._sum.cost_usd ?? 0,
      },
    };
  });

  // ─── GET /admin/background-images ───────────────────────────────
  // F-011: full library incl. inactive rows (admin needs to see what's
  // hidden from the retailer picker in order to re-activate it).
  server.get('/background-images', async () => {
    const rows = await prisma.backgroundImage.findMany({ orderBy: { created_at: 'desc' } });
    return { data: rows };
  });

  // ─── POST /admin/background-images/upload-url ───────────────────
  // Presigned PUT so the admin panel uploads image bytes straight to R2,
  // same pattern as the retailer spin-video upload (products.ts).
  server.post('/background-images/upload-url', async (request) => {
    const body = z
      .object({
        content_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        filename: z.string().min(1).max(200),
      })
      .parse(request.body);

    const ext = body.content_type.split('/')[1];
    const r2Key = R2_PATHS.backgroundImage(
      `${createHash('sha256').update(body.filename + Date.now()).digest('hex').slice(0, 16)}.${ext}`,
    );
    const uploadUrl = await getUploadPresignedUrl(r2Key, body.content_type, 300);

    return { data: { upload_url: uploadUrl, r2_key: r2Key, public_url: publicUrl(r2Key), expires_in: 300 } };
  });

  // ─── POST /admin/background-images ───────────────────────────────
  // Registers a background already uploaded via the presigned URL above.
  server.post('/background-images', async (request) => {
    const body = z
      .object({
        name: z.string().min(1).max(100),
        image_url: z.string().url(),
        thumbnail_url: z.string().url().optional(),
      })
      .parse(request.body);

    const row = await prisma.backgroundImage.create({ data: body });
    return { data: row };
  });

  // ─── PATCH /admin/background-images/:id ──────────────────────────
  // Toggle visibility in the retailer picker or rename. No hard delete —
  // products may already reference a row (background_image_id FK is
  // ON DELETE SET NULL), so deactivating keeps existing selections intact
  // while hiding it from new picks.
  server.patch('/background-images/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(1).max(100).optional(),
        is_active: z.boolean().optional(),
      })
      .parse(request.body);

    const existing = await prisma.backgroundImage.findUnique({ where: { id } });
    if (!existing) throw notFound('Background image');

    const row = await prisma.backgroundImage.update({ where: { id }, data: body });
    return { data: row };
  });

  // ─── GET /admin/integrations ─────────────────────────────────────
  // F-012: super-admin-only credential vault. Values are never returned —
  // only masked_preview. Every catalog key not yet configured here is
  // listed as "not_set" (falling back to its .env var at call time).
  server.get('/integrations', async () => {
    const rows = await prisma.integrationSetting.findMany({ orderBy: { key_name: 'asc' } });
    const byKey = new Map(rows.map((r) => [r.key_name, r]));

    const catalog = INTEGRATION_KEYS.map(({ key_name, category, label }: IntegrationKeyEntry) => {
      const row = byKey.get(key_name);
      return row
        ? {
            id: row.id,
            key_name: row.key_name,
            category: row.category,
            label: row.label,
            masked_preview: row.masked_preview,
            is_active: row.is_active,
            updated_at: row.updated_at,
            configured: true,
          }
        : { id: null, key_name, category, label, masked_preview: null, is_active: false, updated_at: null, configured: false };
    });

    return { data: catalog };
  });

  // ─── POST /admin/integrations ─────────────────────────────────────
  // Create a credential row. Fails if key_name is already configured —
  // use PATCH to rotate an existing one (never-reveal: there is no way to
  // read the old value back, so this is a deliberate two-endpoint split).
  server.post('/integrations', async (request) => {
    const body = z
      .object({
        key_name: z.enum(
          INTEGRATION_KEYS.map((k: IntegrationKeyEntry) => k.key_name) as [string, ...string[]],
        ),
        value: z.string().min(1).max(2000),
      })
      .parse(request.body);

    const known = INTEGRATION_KEYS.find((k: IntegrationKeyEntry) => k.key_name === body.key_name);
    if (!known) throw validationError('Unknown integration key', 'key_name');

    const existing = await prisma.integrationSetting.findUnique({
      where: { key_name: body.key_name },
    });
    if (existing) throw validationError('Already configured — use PATCH to update', 'key_name');

    const row = await prisma.integrationSetting.create({
      data: {
        key_name: known.key_name,
        category: known.category,
        label: known.label,
        encrypted_value: encryptSecret(body.value),
        masked_preview: maskSecret(body.value),
      },
    });
    invalidateSecret(known.key_name);

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'IntegrationSetting',
        resource_id: known.key_name,
        metadata: { category: known.category, label: known.label },
        ip_address: request.ip,
      },
    });

    request.log.info({ key_name: known.key_name }, 'Integration setting created');
    const { encrypted_value: _encrypted_value, ...safe } = row;
    return { data: safe };
  });

  // ─── PATCH /admin/integrations/:id ─────────────────────────────────
  // Rotate the value and/or toggle is_active. Never returns the value.
  server.patch('/integrations/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        value: z.string().min(1).max(2000).optional(),
        is_active: z.boolean().optional(),
      })
      .parse(request.body);

    const existing = await prisma.integrationSetting.findUnique({ where: { id } });
    if (!existing) throw notFound('Integration setting');

    const row = await prisma.integrationSetting.update({
      where: { id },
      data: {
        ...(body.value !== undefined
          ? { encrypted_value: encryptSecret(body.value), masked_preview: maskSecret(body.value) }
          : {}),
        ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
      },
    });
    invalidateSecret(existing.key_name);

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'IntegrationSetting',
        resource_id: existing.key_name,
        metadata: { rotated_value: body.value !== undefined, is_active: row.is_active },
        ip_address: request.ip,
      },
    });

    request.log.info({ key_name: existing.key_name }, 'Integration setting updated');
    const { encrypted_value: _encrypted_value, ...safe } = row;
    return { data: safe };
  });

  // ─── DELETE /admin/integrations/:id ────────────────────────────────
  // Removes the DB override — the app falls back to the .env var of the
  // same name (getSecret()), it does not disable the integration outright.
  server.delete('/integrations/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const existing = await prisma.integrationSetting.findUnique({ where: { id } });
    if (!existing) throw notFound('Integration setting');

    await prisma.integrationSetting.delete({ where: { id } });
    invalidateSecret(existing.key_name);

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'DELETE',
        resource_type: 'IntegrationSetting',
        resource_id: existing.key_name,
        metadata: { category: existing.category, label: existing.label },
        ip_address: request.ip,
      },
    });

    request.log.info({ key_name: existing.key_name }, 'Integration setting deleted');
    return reply.status(204).send();
  });
};
