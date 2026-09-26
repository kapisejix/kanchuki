// Auto-split from admin.ts (scripts/split-admin-routes.mjs) — route bodies verbatim.
import type { FastifyPluginAsync } from 'fastify';

import {
  type QuotaResourceType,
  encryptSecret,
  getReplicaPrisma,
  getSecret,
  getVaultPrisma,
  invalidateSecret,
  maskSecret,
  prisma,
  vaultDelete,
} from '@kanchuki/db';
import { INTEGRATION_KEYS, PLAN_LIMIT_RESOURCE_TYPES, R2_PATHS } from '@kanchuki/shared';
import { z } from 'zod';
import { forbidden, notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';
import { planPriceMissing } from '../billing/billing-helpers.js';

/**
 * Every resource that has a CUSTOMER-side writer.
 *
 * The `customer_resource_limits` table is general (one row per resource, no
 * plan), but only resources some code path actually checks belong on the admin
 * screen: a number with no writer reads as "we cap this" and caps nothing. One
 * consumer today — `checkCustomerQuota(customerAccountId, 'TRY_ON_GENERATION')`
 * in `routes/products/products-tryon.ts` (F-039 Phase 2).
 *
 * The list lives here and not in `@kanchuki/shared` because there is exactly one
 * consumer (this route pair); sharing a constant with nowhere else to import it
 * is how the two plan-limits copies started. The screen does NOT keep its own
 * copy — it renders whatever `GET /plan-limits/customer` returns.
 */
export const CUSTOMER_LIMIT_RESOURCE_TYPES = [
  'TRY_ON_GENERATION',
] as const satisfies readonly QuotaResourceType[];

export const adminPlansRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── POST /admin/billing/setup-plans ────────────────────────────
  // Auto-creates 3 monthly Razorpay plans at gross (base + 18% GST).
  // Run once after setting RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET.
  // Creates plans, prints the IDs as env var settings, does NOT modify DB.
  server.post('/billing/setup-plans', async (request) => {
    const created: Record<string, { id: string }> = {};
    const razorpayKeyId = (await getSecret('RAZORPAY_KEY_ID')) ?? '';
    const razorpayKeySecret = (await getSecret('RAZORPAY_KEY_SECRET')) ?? '';

    for (const planKey of ['STARTER', 'GROWTH', 'PRO'] as const) {
      const pricingRow = await prisma.planPricing.findUnique({ where: { plan: planKey } });
      // Base price in paise (ex-GST). Never guess: this creates a real Razorpay plan.
      if (!pricingRow) throw planPriceMissing(planKey);
      const basePaise = pricingRow.monthly_paise;
      // Razorpay charges a fixed amount — must include 18% GST (gross)
      const grossPaise = Math.round(basePaise * 1.18);

      const res = await fetch('https://api.razorpay.com/v1/plans', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          period: 'monthly',
          interval: 1,
          item: {
            name: `Kanchuki ${planKey} Monthly`,
            description: `Kanchuki ${planKey} plan — monthly billing`,
            amount: grossPaise,
            currency: 'INR',
          },
          notes: {
            plan: planKey,
            billing_period: 'monthly',
          },
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        request.log.error({ planKey, status: res.status, body }, 'Razorpay plan creation failed');
        continue;
      }

      const plan = (await res.json()) as { id: string };
      created[`RAZORPAY_PLAN_${planKey}_MONTHLY`] = { id: plan.id };
    }

    const count = Object.keys(created).length;
    request.log.info({ created }, `Created ${count}/3 Razorpay monthly plans`);

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
        total: 3,
        env_vars: created,
        env_snippet: envSnippet,
      },
    };
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
        // The shared list, not a local copy — it was a second hand-kept copy
        // that let a seeded resource (TRY_ON_GENERATION) be unsettable here.
        resource_type: z.enum(PLAN_LIMIT_RESOURCE_TYPES),
        limit_per_period: z.number().int().min(-1),
        period: z.enum(['DAY', 'MONTH', 'LIFETIME']),
      })
      .parse(request.body);

    // Capture before-state for audit log
    const prevPlanLimit = await prisma.planLimit.findUnique({
      where: { plan_resource_type: { plan: body.plan, resource_type: body.resource_type } },
    });

    const row = await prisma.planLimit.upsert({
      where: { plan_resource_type: { plan: body.plan, resource_type: body.resource_type } },
      create: body,
      update: { limit_per_period: body.limit_per_period, period: body.period },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: prevPlanLimit ? 'UPDATE' : 'CREATE',
        resource_type: 'PlanLimit',
        resource_id: `${body.plan}_${body.resource_type}`,
        metadata: {
          before: prevPlanLimit
            ? { limit_per_period: prevPlanLimit.limit_per_period, period: prevPlanLimit.period }
            : null,
          after: { limit_per_period: body.limit_per_period, period: body.period },
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ plan: body.plan, resource_type: body.resource_type }, 'Plan limit updated');

    return { data: row };
  });

  // ─── Customer-side limits (F-039 Phase 2) ───────────────────────
  //
  // Nested under `/plan-limits` deliberately. A shopper has no plan, so this is
  // not a row of the matrix above — but it IS the same kind of number (a quota
  // that gates a metered, money-spending call), so it belongs on the same admin
  // screen, under the same access rule. The path keeps the first path segment
  // `plan-limits`, which is what `isSuperAdminOnlyAdminPath()` classifies as
  // Super-Admin-only (money) — a new top-level segment would be an unclassified
  // route for a plain ADMIN key until somebody remembered to add it to the list
  // in `packages/shared/src/constants/admin-access.ts` (the RC-034 fail-open).
  //
  // GET returns one entry per customer-side resource WHETHER OR NOT A ROW EXISTS.
  // The screen renders exactly this list, so it cannot drift from the server the
  // way two hand-kept arrays do; an unseeded resource comes back as `configured:
  // false` with a null limit (the server fails open on a missing row) rather than
  // silently vanishing from the page the way migration 119's seeded
  // TRY_ON_GENERATION row did.
  server.get('/plan-limits/customer', async () => {
    const rows = await prisma.customerResourceLimit.findMany({
      where: { resource_type: { in: [...CUSTOMER_LIMIT_RESOURCE_TYPES] } },
    });
    const byType = new Map(rows.map((row) => [row.resource_type, row]));

    return {
      data: CUSTOMER_LIMIT_RESOURCE_TYPES.map((resourceType) => {
        const row = byType.get(resourceType);
        return {
          resource_type: resourceType,
          limit_per_period: row?.limit_per_period ?? null,
          period: row?.period ?? 'MONTH',
          updated_at: row?.updated_at ?? null,
          configured: Boolean(row),
        };
      }),
    };
  });

  // ─── PUT /admin/plan-limits/customer ────────────────────────────
  // Upsert one customer-side limit. Same contract as the plan row above: a
  // missing row means unlimited, so this is also how the cap gets turned on.
  //
  // `resource_type` is validated against the customer allowlist rather than the
  // full plan list — a plan-only resource would create a row that nothing reads,
  // and an audit trail that says a cap exists when none does.
  server.put('/plan-limits/customer', async (request) => {
    const body = z
      .object({
        resource_type: z.enum(CUSTOMER_LIMIT_RESOURCE_TYPES),
        limit_per_period: z.number().int().min(-1),
        period: z.enum(['DAY', 'MONTH', 'LIFETIME']),
        updated_by_id: z.string().optional(),
      })
      .parse(request.body);

    const prev = await prisma.customerResourceLimit.findUnique({
      where: { resource_type: body.resource_type },
    });

    const row = await prisma.customerResourceLimit.upsert({
      where: { resource_type: body.resource_type },
      create: {
        resource_type: body.resource_type,
        limit_per_period: body.limit_per_period,
        period: body.period,
        updated_by_id: body.updated_by_id,
      },
      update: {
        limit_per_period: body.limit_per_period,
        period: body.period,
        updated_by_id: body.updated_by_id,
      },
    });

    // Money-adjacent and shopper-visible, so before/after is recorded — an admin
    // lowering the cap is the kind of change somebody will later ask about.
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: prev ? 'UPDATE' : 'CREATE',
        resource_type: 'CustomerResourceLimit',
        resource_id: body.resource_type,
        metadata: {
          before: prev ? { limit_per_period: prev.limit_per_period, period: prev.period } : null,
          after: { limit_per_period: body.limit_per_period, period: body.period },
        },
        ip_address: request.ip,
      },
    });

    request.log.info(
      { resource_type: body.resource_type, limit_per_period: body.limit_per_period },
      'Customer limit updated',
    );

    return { data: row };
  });

  // ─── GET /admin/plan-pricing ─────────────────────────────────────
  // Admin-editable ₹/plan pricing — the only source of plan prices.
  // Monthly only — base price is ex-GST, retailer pays base + 18%.
  server.get('/plan-pricing', async () => {
    const rows = await prisma.planPricing.findMany({ orderBy: { plan: 'asc' } });
    return { data: rows };
  });

  // ─── PUT /admin/plan-pricing ─────────────────────────────────────
  // Monthly only — base price is ex-GST, Razorpay charges gross (base * 1.18).
  server.put('/plan-pricing', async (request) => {
    const body = z
      .object({
        plan: z.enum(['STARTER', 'GROWTH', 'PRO']),
        monthly_paise: z.number().int().min(0),
      })
      .parse(request.body);

    const prev = await prisma.planPricing.findUnique({ where: { plan: body.plan } });

    const row = await prisma.planPricing.upsert({
      where: { plan: body.plan },
      create: body,
      update: { monthly_paise: body.monthly_paise },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: prev ? 'UPDATE' : 'CREATE',
        resource_type: 'PlanPricing',
        resource_id: body.plan,
        metadata: {
          before: prev ? { monthly_paise: prev.monthly_paise } : null,
          after: { monthly_paise: body.monthly_paise },
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ plan: body.plan }, 'Plan pricing updated');

    return { data: row };
  });

  // ─── GET /admin/plan-features ────────────────────────────────────
  // F-013: List all plan feature toggles across all plans.
  // Returns all rows, including F-010-style "missing means OFF" convention.
  server.get('/plan-features', async () => {
    const rows = await prisma.planFeature.findMany({
      orderBy: [{ plan: 'asc' }, { feature_key: 'asc' }],
    });
    return { data: rows };
  });

  // ─── PUT /admin/plan-features ────────────────────────────────────
  // F-013: Upsert one (plan, feature_key) toggle. Creates it if missing.
  // Fails CLOSED — a missing row means OFF, so this is how admin turns a
  // feature on for the first time.
  server.put('/plan-features', async (request) => {
    const body = z
      .object({
        plan: z.enum(['STARTER', 'GROWTH', 'PRO']),
        feature_key: z.enum([
          'BULK_ONBOARDING_IMPORT',
          'CUSTOM_BACKGROUND_LIBRARY',
          'SPIN_360',
          'VIRTUAL_TRY_ON',
          // F-039 Phase 2. This allowlist is what an admin may toggle, so a new
          // feature that should be admin-enableable must be added BOTH here and
          // in the web grid (admin/plan-features) — two hand-kept lists that
          // drift silently otherwise (WHATSAPP_CATALOG_SYNC / SHOWCASE_DESIGNS /
          // GROWTH_ENGINE are already enum values missing from both). It is NOT
          // derived from the Prisma enum on purpose: the enum also carries
          // @deprecated values that must stay non-toggleable.
          'VIRTUAL_TRY_ON_V2',
          'WHATSAPP_BUSINESS_API',
          'CHECKOUT_CART',
          'DATA_EXPORT_CSV',
          'CUSTOM_BRANDING',
          'GHOST_MANNEQUIN_AI',
          'RAZORPAY_ROUTE',
          'API_ACCESS',
          'PRIORITY_AI_QUEUE',
          'MULTI_STORE',
        ]),
        enabled: z.boolean(),
        updated_by_id: z.string().optional(),
      })
      .parse(request.body);

    // Capture before-state for audit log
    const prev = await prisma.planFeature.findUnique({
      where: { plan_feature_key: { plan: body.plan, feature_key: body.feature_key } },
    });

    const row = await prisma.planFeature.upsert({
      where: { plan_feature_key: { plan: body.plan, feature_key: body.feature_key } },
      create: {
        plan: body.plan,
        feature_key: body.feature_key,
        enabled: body.enabled,
        updated_by_id: body.updated_by_id,
      },
      update: {
        enabled: body.enabled,
        updated_by_id: body.updated_by_id,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: prev ? 'UPDATE' : 'CREATE',
        resource_type: 'PlanFeature',
        resource_id: `${body.plan}_${body.feature_key}`,
        metadata: {
          before: prev ? { enabled: prev.enabled } : null,
          after: { enabled: body.enabled, feature_key: body.feature_key },
        },
        ip_address: request.ip,
      },
    });

    request.log.info(
      { plan: body.plan, feature_key: body.feature_key, enabled: body.enabled },
      'Plan feature updated',
    );

    return { data: row };
  });

  // ─── GET /admin/plan-features/summary ────────────────────────────
  // F-013: Returns a summary of all features enabled per plan, grouped
  // by feature key with plan-enabled status. Useful for the frontend grid.
  server.get('/plan-features/summary', async () => {
    const rows = await prisma.planFeature.findMany({
      orderBy: [{ feature_key: 'asc' }, { plan: 'asc' }],
    });

    const byFeature = new Map<string, Record<string, boolean>>();
    for (const row of rows) {
      let plans = byFeature.get(row.feature_key);
      if (!plans) {
        plans = {};
        byFeature.set(row.feature_key, plans);
      }
      plans[row.plan] = row.enabled;
    }

    const summary = Array.from(byFeature.entries()).map(([feature_key, plans]) => ({
      feature_key,
      STARTER: plans.STARTER ?? false,
      GROWTH: plans.GROWTH ?? false,
      PRO: plans.PRO ?? false,
    }));

    return { data: summary };
  });

  // ─── GET /admin/catalog-upload-tiers ─────────────────────────────
  // F-019: admin-editable item-count-to-price tiers for the paid catalog
  // upload service. Same live-edit pattern as plan-features — no deploy
  // needed to change a price break.
  server.get('/catalog-upload-tiers', async () => {
    const tiers = await prisma.catalogUploadPriceTier.findMany({ orderBy: { min_items: 'asc' } });
    return { data: tiers };
  });

  // ─── POST /admin/catalog-upload-tiers ────────────────────────────
  server.post('/catalog-upload-tiers', async (request) => {
    const body = z
      .object({
        min_items: z.number().int().min(0),
        max_items: z.number().int().min(0).nullable().optional(),
        price_inr: z.number().int().min(0),
        updated_by_id: z.string().optional(),
      })
      .parse(request.body);

    const tier = await prisma.catalogUploadPriceTier.create({
      data: {
        min_items: body.min_items,
        max_items: body.max_items ?? null,
        price_inr: body.price_inr,
        updated_by_id: body.updated_by_id,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'CatalogUploadPriceTier',
        resource_id: tier.id,
        metadata: {
          min_items: tier.min_items,
          max_items: tier.max_items,
          price_inr: tier.price_inr,
        },
        ip_address: request.ip,
      },
    });

    return { data: tier };
  });

  // ─── PATCH /admin/catalog-upload-tiers/:id ───────────────────────
  server.patch<{ Params: { id: string } }>('/catalog-upload-tiers/:id', async (request) => {
    const body = z
      .object({
        min_items: z.number().int().min(0).optional(),
        max_items: z.number().int().min(0).nullable().optional(),
        price_inr: z.number().int().min(0).optional(),
        updated_by_id: z.string().optional(),
      })
      .parse(request.body);

    const tier = await prisma.catalogUploadPriceTier
      .update({ where: { id: request.params.id }, data: body })
      .catch(() => null);
    if (!tier) throw notFound('Catalog upload price tier');

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'CatalogUploadPriceTier',
        resource_id: tier.id,
        metadata: {
          min_items: tier.min_items,
          max_items: tier.max_items,
          price_inr: tier.price_inr,
        },
        ip_address: request.ip,
      },
    });

    return { data: tier };
  });

  // ─── DELETE /admin/catalog-upload-tiers/:id ──────────────────────
  server.delete<{ Params: { id: string } }>('/catalog-upload-tiers/:id', async (request, reply) => {
    const tier = await prisma.catalogUploadPriceTier
      .delete({ where: { id: request.params.id } })
      .catch(() => null);

    if (tier) {
      await prisma.auditLog.create({
        data: {
          actor_type: 'admin',
          action: 'DELETE',
          resource_type: 'CatalogUploadPriceTier',
          resource_id: tier.id,
          metadata: {
            min_items: tier.min_items,
            max_items: tier.max_items,
            price_inr: tier.price_inr,
          },
          ip_address: request.ip,
        },
      });
    }

    return reply.status(204).send();
  });

  // ─── GET /admin/addon-purchases ────────────────────────────────
  // F-010 Phase 3: monitoring for self-serve addon purchases.
  // Returns completed purchases with retailer info, total revenue,
  // top buyers, and breakdown by resource type.
  server.get('/addon-purchases', async () => {
    const [completedPurchases, revenueAgg, topBuyers, resourceBreakdown] = await Promise.all([
      // All completed purchases with retailer info, last 90 days
      prisma.quotaAddonPurchase.findMany({
        where: {
          status: 'COMPLETED',
          created_at: { gte: new Date(Date.now() - 90 * 86400000) },
        },
        orderBy: { created_at: 'desc' },
        take: 200,
        include: {
          retailer: {
            select: { id: true, shop_name: true, city: true, phone: true, plan: true },
          },
        },
      }),
      // Total revenue from all completed addon purchases
      prisma.quotaAddonPurchase.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount_inr: true },
        _count: true,
      }),
      // Top buyers (group by retailer)
      prisma.quotaAddonPurchase.groupBy({
        by: ['retailer_id'],
        where: { status: 'COMPLETED' },
        _sum: { amount_inr: true, quantity: true },
        _count: true,
        orderBy: { _sum: { amount_inr: 'desc' } },
        take: 20,
      }),
      // Breakdown by resource type
      prisma.quotaAddonPurchase.groupBy({
        by: ['resource_type'],
        where: { status: 'COMPLETED' },
        _sum: { amount_inr: true, quantity: true },
        _count: true,
        orderBy: { _sum: { amount_inr: 'desc' } },
      }),
    ]);

    // Enrich top buyers with retailer info
    const buyerRetailerIds = topBuyers.map((b) => b.retailer_id);
    const buyerRetailers = await prisma.retailer.findMany({
      where: { id: { in: buyerRetailerIds } },
      select: { id: true, shop_name: true, city: true, phone: true, plan: true },
    });
    const retailerMap = new Map(buyerRetailers.map((r) => [r.id, r]));

    const enrichedTopBuyers = topBuyers.map((b) => ({
      retailer_id: b.retailer_id,
      retailer: retailerMap.get(b.retailer_id) ?? null,
      total_spent_inr: b._sum.amount_inr ?? 0,
      total_quantity: b._sum.quantity ?? 0,
      purchase_count: b._count,
    }));

    return {
      data: {
        recent_purchases: completedPurchases.map((p) => ({
          id: p.id,
          retailer_id: p.retailer_id,
          retailer: p.retailer,
          resource_type: p.resource_type,
          quantity: p.quantity,
          amount_inr: p.amount_inr,
          completed_at: p.completed_at,
          created_at: p.created_at,
        })),
        summary: {
          total_revenue_inr: revenueAgg._sum.amount_inr ?? 0,
          total_purchases: revenueAgg._count,
        },
        top_buyers: enrichedTopBuyers,
        resource_breakdown: resourceBreakdown.map((r) => ({
          resource_type: r.resource_type,
          total_revenue_inr: r._sum.amount_inr ?? 0,
          total_quantity: r._sum.quantity ?? 0,
          purchase_count: r._count,
        })),
      },
    };
  });

  // ─── GET /admin/usage ──────────────────────────────────────────
  // Platform-wide usage stats including try-on and revenue.
  server.get('/usage', async () => {
    const _monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [activeSubscriptions, trialCount, totalRetailers] = await Promise.all([
      prisma.subscription.findMany({
        where: { status: 'ACTIVE' },
        select: { amount_inr: true },
      }),
      prisma.retailer.count({ where: { plan_status: 'TRIAL', deleted_at: null } }),
      prisma.retailer.count({ where: { deleted_at: null } }),
    ]);

    const mrr = activeSubscriptions.reduce((sum: number, sub) => sum + sub.amount_inr, 0);

    return {
      data: {
        total_retailers: totalRetailers,
        trial_retailers: trialCount,
        active_subscriptions: activeSubscriptions.length,
        mrr_inr: Math.round(mrr),
      },
    };
  });

  // ─── GET /admin/ai-usage ─────────────────────────────────────────
  // Per-retailer × per-provider AI usage aggregation (weighted credits).
  server.get('/ai-usage', async (request) => {
    const query = z
      .object({
        retailer_id: z.string().optional(),
        date_from: z.string().optional(),
        date_to: z.string().optional(),
      })
      .safeParse(request.query);
    const { retailer_id, date_from, date_to } = query.success ? query.data : {};

    const where: Record<string, unknown> = {};
    if (retailer_id) where.retailer_id = retailer_id;
    if (date_from || date_to) {
      const created_at: Record<string, Date> = {};
      if (date_from) created_at.gte = new Date(date_from);
      if (date_to) created_at.lte = new Date(date_to);
      where.created_at = created_at;
    }

    const groups = await prisma.aiUsageLog.groupBy({
      by: ['retailer_id', 'provider_type', 'model_name', 'resource_type'],
      where,
      _sum: { credits_used: true },
      _count: { id: true },
      orderBy: { _sum: { credits_used: 'desc' } },
    });

    // Join retailer names for display
    const retailerIds = [...new Set(groups.map((g) => g.retailer_id))];
    const retailers = retailerIds.length
      ? await prisma.retailer.findMany({
          where: { id: { in: retailerIds } },
          select: { id: true, shop_name: true, city: true, plan: true },
        })
      : [];
    const retailerMap = new Map(retailers.map((r) => [r.id, r]));

    return {
      data: groups.map((g) => ({
        retailer_id: g.retailer_id,
        retailer_name: retailerMap.get(g.retailer_id)?.shop_name ?? null,
        city: retailerMap.get(g.retailer_id)?.city ?? null,
        plan: retailerMap.get(g.retailer_id)?.plan ?? null,
        provider_type: g.provider_type,
        model_name: g.model_name,
        resource_type: g.resource_type,
        calls: g._count.id,
        credits_used: g._sum.credits_used ?? 0,
      })),
    };
  });
};
