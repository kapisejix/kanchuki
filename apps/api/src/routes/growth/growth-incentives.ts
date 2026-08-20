// Phase 1: Smart Incentive Engine
// Retailer-facing routes for incentive rule CRUD, customer visit tracking,
// and loyalty-based discount evaluation.
//
// Folded from services/incentive-engine/ orphan stub into the unified
// apps/api architecture. Gated behind INCENTIVE_ENGINE plan feature.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hasFeature } from '../../lib/features.js';
import { notFound, validationError, featureUnavailable } from '../../plugins/error-handler.js';

// ─── Zod Schemas ──────────────────────────────────────────────────

const IncentiveRuleBaseSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  trigger_type: z.enum(['FIRST_VISIT', 'BIRTHDAY', 'ANNIVERSARY', 'LOYALTY_TIER']),
  discount_type: z.enum(['PERCENT', 'FIXED_AMOUNT']),
  discount_value: z.number().int().min(0),
  conditions: z
    .object({
      min_spent: z.number().int().min(0).optional(),
      min_visits: z.number().int().min(0).optional(),
    })
    .optional(),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
});

const IncentiveRuleSchema = IncentiveRuleBaseSchema.refine(
  (r) => (r.discount_type === 'PERCENT' ? r.discount_value <= 100 : true),
  { message: 'Percentage discounts must be ≤ 100' },
).refine(
  (r) => {
    if (r.starts_at && r.ends_at) return new Date(r.starts_at) < new Date(r.ends_at);
    return true;
  },
  { message: 'starts_at must be before ends_at' },
);

// ─── Route ─────────────────────────────────────────────────────────

export const growthIncentiveRoutes: FastifyPluginAsync = async (server) => {
  const guard = async (retailerId: string) => {
    if (!(await hasFeature(retailerId, 'INCENTIVE_ENGINE')))
      throw featureUnavailable('Smart Incentive Engine');
  };

  // ─── GET /growth/incentives/rules ───────────────────────────────
  // List all incentive rules for this retailer.
  server.get('/incentives/rules', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    return {
      data: await prisma.incentiveRule.findMany({
        where: { retailer_id: retailerId },
        orderBy: { created_at: 'desc' },
      }),
    };
  });

  // ─── GET /growth/incentives/rules/:id ───────────────────────────
  // Get a single incentive rule.
  server.get('/incentives/rules/:id', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };
    const rule = await prisma.incentiveRule.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!rule) throw notFound('Incentive rule');
    return { data: rule };
  });

  // ─── POST /growth/incentives/rules ──────────────────────────────
  // Create a new incentive rule.
  server.post('/incentives/rules', async (request, reply) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const body = IncentiveRuleSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const rule = await prisma.incentiveRule.create({
      data: {
        retailer_id: retailerId,
        name: body.data.name,
        description: body.data.description,
        trigger_type: body.data.trigger_type,
        discount_type: body.data.discount_type,
        discount_value: body.data.discount_value,
        conditions: body.data.conditions ?? undefined,
        starts_at: body.data.starts_at ? new Date(body.data.starts_at) : null,
        ends_at: body.data.ends_at ? new Date(body.data.ends_at) : null,
      },
    });

    return reply.status(201).send({ data: rule });
  });

  // ─── PUT /growth/incentives/rules/:id ───────────────────────────
  // Update an incentive rule.
  server.put('/incentives/rules/:id', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };
    const existing = await prisma.incentiveRule.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!existing) throw notFound('Incentive rule');

    const body = IncentiveRuleBaseSchema.partial().safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const updated = await prisma.incentiveRule.update({
      where: { id },
      data: {
        name: body.data.name,
        description: body.data.description,
        trigger_type: body.data.trigger_type,
        discount_type: body.data.discount_type,
        discount_value: body.data.discount_value,
        conditions: body.data.conditions,
        starts_at: body.data.starts_at ? new Date(body.data.starts_at) : undefined,
        ends_at: body.data.ends_at ? new Date(body.data.ends_at) : undefined,
      },
    });

    return { data: updated };
  });

  // ─── DELETE /growth/incentives/rules/:id ────────────────────────
  // Soft-delete (deactivate) an incentive rule.
  server.delete('/incentives/rules/:id', async (request, reply) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };
    const existing = await prisma.incentiveRule.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!existing) throw notFound('Incentive rule');

    await prisma.incentiveRule.update({
      where: { id },
      data: { active: false },
    });

    return reply.status(204).send();
  });

  // ─── POST /growth/incentives/visits ─────────────────────────────
  // Record a customer visit. Called when a customer scans QR, opens
  // collection link, or walks into the store.
  server.post('/incentives/visits', async (request, reply) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const body = z
      .object({ customer_id: z.string().min(1) })
      .safeParse(request.body);
    if (!body.success) throw validationError('customer_id is required');

    // Verify customer exists and belongs to this retailer
    const customer = await prisma.customer.findFirst({
      where: { id: body.data.customer_id, retailer_id: retailerId },
    });
    if (!customer) throw notFound('Customer');

    const visit = await prisma.customerVisit.create({
      data: {
        retailer_id: retailerId,
        customer_id: body.data.customer_id,
      },
    });

    return reply.status(201).send({ data: visit });
  });

  // ─── GET /growth/incentives/visits ──────────────────────────────
  // List visits for this retailer, optionally filtered by customer.
  server.get('/incentives/visits', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { customer_id } = request.query as { customer_id?: string };

    const where: Record<string, unknown> = { retailer_id: retailerId };
    if (customer_id) where.customer_id = customer_id;

    const visits = await prisma.customerVisit.findMany({
      where,
      orderBy: { visit_at: 'desc' },
      take: 200,
    });

    return { data: visits };
  });

  // ─── POST /growth/incentives/check ──────────────────────────────
  // Evaluate which incentive rules apply to a given customer.
  // Called by the checkout flow or customer-facing app to show
  // applicable discounts.
  server.post('/incentives/check', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const body = z
      .object({ customer_id: z.string().min(1) })
      .safeParse(request.body);
    if (!body.success) throw validationError('customer_id is required');

    // Get active rules within their validity window
    const now = new Date();
    const rules = await prisma.incentiveRule.findMany({
      where: {
        retailer_id: retailerId,
        active: true,
        AND: [
          { OR: [{ starts_at: null }, { starts_at: { lte: now } }] },
          { OR: [{ ends_at: null }, { ends_at: { gte: now } }] },
        ],
      },
    });

    if (rules.length === 0) return { data: { applicable: [] } };

    // Get customer data
    const customer = await prisma.customer.findUnique({
      where: { id: body.data.customer_id },
    });
    if (!customer) throw notFound('Customer');

    // Get visit count for this customer at this retailer
    const visitCount = await prisma.customerVisit.count({
      where: { retailer_id: retailerId, customer_id: body.data.customer_id },
    });

    const totalSpent = customer.total_spent ?? 0;

    // Evaluate each rule
    const applicable = rules
      .filter((rule) => {
        switch (rule.trigger_type) {
          case 'FIRST_VISIT':
            return visitCount === 0;
          case 'BIRTHDAY':
            // Requires customer DOB — not in schema yet, skip for now
            return false;
          case 'ANNIVERSARY':
            // Requires first-visit date — not in schema yet, skip for now
            return false;
          case 'LOYALTY_TIER': {
            const conditions = rule.conditions as Record<string, number> | null;
            if (!conditions) return false;
            const minSpent = conditions.min_spent ?? 0;
            const minVisits = conditions.min_visits ?? 0;
            return totalSpent >= minSpent && visitCount >= minVisits;
          }
          default:
            return false;
        }
      })
      .map((rule) => ({
        rule_id: rule.id,
        name: rule.name,
        description: rule.description,
        trigger_type: rule.trigger_type,
        discount_type: rule.discount_type,
        discount_value: rule.discount_value,
      }));

    return { data: { applicable } };
  });

  // ─── GET /growth/incentives/stats ───────────────────────────────
  // Aggregate stats for the retailer's incentive program.
  server.get('/incentives/stats', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);

    const [totalRules, activeRules, totalVisits, recentVisits] = await Promise.all([
      prisma.incentiveRule.count({ where: { retailer_id: retailerId } }),
      prisma.incentiveRule.count({ where: { retailer_id: retailerId, active: true } }),
      prisma.customerVisit.count({ where: { retailer_id: retailerId } }),
      prisma.customerVisit.count({
        where: {
          retailer_id: retailerId,
          visit_at: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      data: {
        total_rules: totalRules,
        active_rules: activeRules,
        total_visits: totalVisits,
        visits_last_30d: recentVisits,
      },
    };
  });
};
