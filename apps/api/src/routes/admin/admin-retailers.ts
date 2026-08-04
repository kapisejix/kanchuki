// Auto-split from admin.ts (scripts/split-admin-routes.mjs) — route bodies verbatim.
import type { FastifyPluginAsync } from 'fastify';

import {
  encryptSecret,
  getReplicaPrisma,
  getSecret,
  getVaultPrisma,
  invalidateSecret,
  maskSecret,
  prisma,
  vaultDelete,
} from '@kanchuki/db';
import { z } from 'zod';
import { forbidden, notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

export const adminRetailersRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

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
        suspended: z.coerce.boolean().optional(),
      })
      .safeParse(request.query);
    const { cursor, limit, search, city, state, plan, status, suspended } = query.success
      ? query.data
      : {
          cursor: undefined,
          limit: 50,
          search: undefined,
          city: undefined,
          state: undefined,
          plan: undefined,
          status: undefined,
          suspended: undefined,
        };

    const retailers = await prisma.retailer.findMany({
      where: {
        deleted_at: null,
        ...(cursor ? { id: { gt: cursor } } : {}),
        ...(city ? { city: { contains: city, mode: 'insensitive' as const } } : {}),
        ...(state ? { state: { equals: state, mode: 'insensitive' as const } } : {}),
        ...(plan ? { plan } : {}),
        ...(status ? { plan_status: status } : {}),
        ...(suspended !== undefined ? { is_suspended: suspended } : {}),
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
        is_suspended: true,
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

    // Capture full before-state for vault snapshots + audit log
    const retailersBefore = await prisma.retailer.findMany({
      where: { id: { in: body.ids }, deleted_at: null },
    });
    const collectionsBefore = await prisma.collection.findMany({
      where: { retailer_id: { in: body.ids }, deleted_at: null },
    });

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

    // F-016: Vault snapshot each deleted retailer (fire-and-forget)
    Promise.allSettled(
      retailersBefore.map((r) =>
        vaultDelete({
          source_table: 'retailers',
          source_id: r.id,
          retailer_id: r.id,
          payload: r as unknown as Record<string, unknown>,
          delete_reason: 'admin_bulk_delete',
          deleted_by: 'admin',
        }),
      ),
    );
    // F-016: Vault snapshot each archived collection (fire-and-forget)
    Promise.allSettled(
      collectionsBefore.map((c) =>
        vaultDelete({
          source_table: 'collections',
          source_id: c.id,
          retailer_id: c.retailer_id,
          payload: c as unknown as Record<string, unknown>,
          delete_reason: 'admin_bulk_delete',
          deleted_by: 'admin',
        }),
      ),
    );

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'BULK_DELETE',
        resource_type: 'Retailer',
        metadata: {
          count: body.ids.length,
          before: retailersBefore.map((r) => ({
            id: r.id,
            shop_name: r.shop_name,
            city: r.city,
            plan: r.plan,
            plan_status: r.plan_status,
          })),
        },
        ip_address: request.ip,
      },
    });

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
        is_blocked: true,
        blocked_at: true,
        blocked_reason: true,
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
        is_suspended: true,
        suspended_at: true,
        suspended_reason: true,
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

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'EXTEND_TRIAL',
        resource_type: 'Retailer',
        resource_id: id,
        metadata: {
          days_added: body.days,
          before: { trial_ends_at: retailer.trial_ends_at?.toISOString() ?? null },
          after: { trial_ends_at: newEnd.toISOString(), plan_status: 'TRIAL' },
        },
        ip_address: request.ip,
      },
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

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CHANGE_PLAN',
        resource_type: 'Retailer',
        resource_id: id,
        metadata: {
          before: {
            plan: retailer.plan,
            plan_status: retailer.plan_status,
            trial_ends_at: retailer.trial_ends_at?.toISOString() ?? null,
          },
          after: updateData as Record<string, string | number | boolean | null>,
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ retailer_id: id, plan: body.plan, status: body.status }, 'Plan changed');

    return { data: { plan: body.plan, plan_status: body.status, ...updateData } };
  });

  // ─── GET /admin/retailers/:id/activity ──────────────────────────
  // F-014: AuditLog entries for a specific retailer, most recent first.
  // Includes both retailer actions and admin actions on this retailer.
  server.get('/retailers/:id/activity', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      })
      .safeParse(request.query);
    const { cursor, limit } = query.success ? query.data : { cursor: undefined, limit: 30 };

    const [logs, totalCount] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          OR: [{ resource_type: 'Retailer', resource_id: id }, { resource_id: id }],
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        orderBy: { created_at: 'desc' },
        take: limit + 1,
      }),
      prisma.auditLog.count({
        where: {
          OR: [{ resource_type: 'Retailer', resource_id: id }, { resource_id: id }],
        },
      }),
    ]);

    const hasMore = logs.length > limit;
    const page = hasMore ? logs.slice(0, limit) : logs;

    return {
      data: page,
      pagination: {
        cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        has_more: hasMore,
        total: totalCount,
      },
    };
  });

  // ─── GET /admin/retailers/:id/customers/:customerId/activity ─────
  // F-014: CustomerInteraction timeline for a specific customer.
  // Reuses existing F-008 data — no new schema needed.
  server.get('/retailers/:id/customers/:customerId/activity', async (request) => {
    const { id, customerId } = z
      .object({ id: z.string(), customerId: z.string() })
      .parse(request.params);
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      })
      .safeParse(request.query);
    const { cursor, limit } = query.success ? query.data : { cursor: undefined, limit: 30 };

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, retailer_id: id, deleted_at: null },
      select: { id: true, name: true, phone: true },
    });
    if (!customer) throw notFound('Customer');

    const [interactions, totalCount] = await Promise.all([
      prisma.customerInteraction.findMany({
        where: {
          customer_id: customerId,
          retailer_id: id,
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        orderBy: { created_at: 'desc' },
        take: limit + 1,
        include: {
          product: { select: { id: true, name: true, category: true, price_min: true } },
        },
      }),
      prisma.customerInteraction.count({
        where: { customer_id: customerId, retailer_id: id },
      }),
    ]);

    const hasMore = interactions.length > limit;
    const page = hasMore ? interactions.slice(0, limit) : interactions;

    return {
      data: {
        customer,
        interactions: page,
      },
      pagination: {
        cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        has_more: hasMore,
        total: totalCount,
      },
    };
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

    // Capture before-state for audit log
    const prevOverride = await prisma.retailerLimitOverride.findUnique({
      where: { retailer_id_resource_type: { retailer_id: id, resource_type: body.resource_type } },
    });

    const override = await prisma.retailerLimitOverride.upsert({
      where: {
        retailer_id_resource_type: { retailer_id: id, resource_type: body.resource_type },
      },
      create: { retailer_id: id, ...body },
      update: { limit_per_period: body.limit_per_period, period: body.period, reason: body.reason },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: prevOverride ? 'UPDATE' : 'CREATE',
        resource_type: 'RetailerLimitOverride',
        resource_id: override.id,
        metadata: {
          retailer_id: id,
          before: prevOverride
            ? {
                limit_per_period: prevOverride.limit_per_period,
                period: prevOverride.period,
                reason: prevOverride.reason,
              }
            : null,
          after: {
            resource_type: body.resource_type,
            limit_per_period: body.limit_per_period,
            period: body.period,
            reason: body.reason ?? null,
          },
        },
        ip_address: request.ip,
      },
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

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'DELETE',
        resource_type: 'RetailerLimitOverride',
        resource_id: overrideId,
        metadata: {
          retailer_id: id,
          before: {
            resource_type: existing.resource_type,
            limit_per_period: existing.limit_per_period,
            period: existing.period,
            reason: existing.reason,
          },
        },
        ip_address: request.ip,
      },
    });

    request.log.info(
      { retailer_id: id, resource_type: existing.resource_type },
      'Override removed',
    );
    return reply.status(204).send();
  });

  // ─── POST /admin/retailers/:id/suspend ──────────────────────────
  // Suspend a retailer account. Reason required.
  server.post('/retailers/:id/suspend', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ reason: z.string().min(1).max(500) }).parse(request.body);

    const retailer = await prisma.retailer.findUnique({ where: { id, deleted_at: null } });
    if (!retailer) throw notFound('Retailer');
    if (retailer.is_suspended) throw validationError('Retailer is already suspended');

    await prisma.retailer.update({
      where: { id },
      data: { is_suspended: true, suspended_at: new Date(), suspended_reason: body.reason },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'SUSPEND',
        resource_type: 'Retailer',
        resource_id: id,
        metadata: { reason: body.reason, shop_name: retailer.shop_name },
        ip_address: request.ip,
      },
    });

    request.log.info({ retailer_id: id, reason: body.reason }, 'Retailer suspended');
    return {
      data: {
        is_suspended: true,
        suspended_at: new Date().toISOString(),
        suspended_reason: body.reason,
      },
    };
  });

  // ─── POST /admin/retailers/:id/unsuspend ────────────────────────
  server.post('/retailers/:id/unsuspend', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const retailer = await prisma.retailer.findUnique({ where: { id, deleted_at: null } });
    if (!retailer) throw notFound('Retailer');
    if (!retailer.is_suspended) throw validationError('Retailer is not suspended');

    await prisma.retailer.update({
      where: { id },
      data: {
        is_suspended: false,
        suspended_at: null,
        suspended_reason: null,
        suspended_by_id: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UNSUSPEND',
        resource_type: 'Retailer',
        resource_id: id,
        metadata: { shop_name: retailer.shop_name, was_reason: retailer.suspended_reason },
        ip_address: request.ip,
      },
    });

    request.log.info({ retailer_id: id }, 'Retailer unsuspended');
    return { data: { is_suspended: false } };
  });

  // ─── POST /admin/customers/:customerId/block ────────────────────
  server.post('/customers/:customerId/block', async (request) => {
    const { customerId } = z.object({ customerId: z.string() }).parse(request.params);
    const body = z.object({ reason: z.string().min(1).max(500) }).parse(request.body);

    const customer = await prisma.customer.findUnique({
      where: { id: customerId, deleted_at: null },
    });
    if (!customer) throw notFound('Customer');
    if (customer.is_blocked) throw validationError('Customer is already blocked');

    await prisma.customer.update({
      where: { id: customerId },
      data: { is_blocked: true, blocked_at: new Date(), blocked_reason: body.reason },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'BLOCK_CUSTOMER',
        resource_type: 'Customer',
        resource_id: customerId,
        metadata: {
          reason: body.reason,
          customer_name: customer.name,
          retailer_id: customer.retailer_id,
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ customer_id: customerId, reason: body.reason }, 'Customer blocked');
    return {
      data: { is_blocked: true, blocked_at: new Date().toISOString(), blocked_reason: body.reason },
    };
  });

  // ─── POST /admin/customers/:customerId/unblock ──────────────────
  server.post('/customers/:customerId/unblock', async (request) => {
    const { customerId } = z.object({ customerId: z.string() }).parse(request.params);

    const customer = await prisma.customer.findUnique({
      where: { id: customerId, deleted_at: null },
    });
    if (!customer) throw notFound('Customer');
    if (!customer.is_blocked) throw validationError('Customer is not blocked');

    await prisma.customer.update({
      where: { id: customerId },
      data: { is_blocked: false, blocked_at: null, blocked_reason: null },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UNBLOCK_CUSTOMER',
        resource_type: 'Customer',
        resource_id: customerId,
        metadata: { customer_name: customer.name },
        ip_address: request.ip,
      },
    });

    request.log.info({ customer_id: customerId }, 'Customer unblocked');
    return { data: { is_blocked: false } };
  });

};
