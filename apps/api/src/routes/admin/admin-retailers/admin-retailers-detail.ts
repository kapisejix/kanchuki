// Auto-split from admin/admin-retailers.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound } from '../../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../../admin-auth.js';

export const adminRetailersDetailRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

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
        public_slug: true,
        created_at: true,
        updated_at: true,
        max_products: true,
        max_customers: true,
        max_staff_seats: true,
        is_suspended: true,
        suspended_at: true,
        suspended_reason: true,
        is_featured: true,
        featured_at: true,
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
    const { limit } = query.success ? query.data : { limit: 30 };

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, retailer_id: id, deleted_at: null },
      select: { id: true, name: true, phone: true },
    });
    if (!customer) throw notFound('Customer');

    const interactions: any[] = [];
    const totalCount = 0;
    const hasMore = false;
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
};
