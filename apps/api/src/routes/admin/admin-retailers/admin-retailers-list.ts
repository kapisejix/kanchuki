// Auto-split from admin/admin-retailers.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma, vaultDelete } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hardDeleteRetailer } from '../../../jobs/purge-retailer-now.js';
import { adminAuthPreHandler } from '../../admin-auth.js';

export const adminRetailersListRoutes: FastifyPluginAsync = async (server) => {
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
        featured: z.coerce.boolean().optional(),
      })
      .safeParse(request.query);
    const { cursor, limit, search, city, state, plan, status, suspended, featured } =
      query.success
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
            featured: undefined,
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
        ...(featured !== undefined ? { is_featured: featured } : {}),
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
        is_featured: true,
        _count: {
          select: {
            products: { where: { deleted_at: null } },
            customers: { where: { deleted_at: null } },
            collections: { where: { deleted_at: null } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
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
  // Admin delete is a HARD delete — distinct from the retailer's own
  // self-delete (DELETE /retailers/me), which stays soft (GST audit).
  // The whole row (and its unique phone/auth_user_id) must actually be gone
  // so the retailer can sign up again from scratch with the same phone
  // number — a soft-delete here left that phone permanently stuck (the
  // login upsert kept finding the dead row and handing back a token the
  // auth middleware then rejected). F-016 vault snapshot still happens
  // first, so the full payload survives in the separate insert-only vault
  // DB even though the primary row is gone for good.
  server.delete('/retailers', async (request) => {
    const body = z.object({ ids: z.array(z.string()).min(1).max(100) }).parse(request.body);

    const retailersBefore = await prisma.retailer.findMany({
      where: { id: { in: body.ids }, deleted_at: null },
    });
    const collectionsBefore = await prisma.collection.findMany({
      where: { retailer_id: { in: body.ids }, deleted_at: null },
    });

    // F-016: vault snapshot BEFORE the hard delete — awaited (not
    // fire-and-forget) since there's no soft-deleted row left as a fallback
    // if this silently lost the race. vaultDelete() never throws.
    await Promise.all([
      ...retailersBefore.map((r) =>
        vaultDelete({
          source_table: 'retailers',
          source_id: r.id,
          retailer_id: r.id,
          payload: r as unknown as Record<string, unknown>,
          delete_reason: 'admin_hard_delete',
          deleted_by: 'admin',
        }),
      ),
      ...collectionsBefore.map((c) =>
        vaultDelete({
          source_table: 'collections',
          source_id: c.id,
          retailer_id: c.retailer_id,
          payload: c as unknown as Record<string, unknown>,
          delete_reason: 'admin_hard_delete',
          deleted_by: 'admin',
        }),
      ),
    ]);

    for (const id of retailersBefore.map((r) => r.id)) {
      await hardDeleteRetailer(id);
    }

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'HARD_DELETE',
        resource_type: 'Retailer',
        metadata: {
          count: retailersBefore.length,
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

    request.log.info({ retailer_ids: body.ids }, 'Admin hard-deleted retailers');
    return { data: { deleted: retailersBefore.length } };
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
};
