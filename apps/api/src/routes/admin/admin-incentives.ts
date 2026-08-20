// Admin routes for the Smart Incentive Engine.
// Admins see ALL retailers' incentive rules and aggregate stats.
// Retailers use /growth/incentives/* (retailer-scoped).
//
// SECURITY: guarded by adminAuthPreHandler like every /v1/admin route.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

const IncentiveRuleUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  trigger_type: z.enum(['FIRST_VISIT', 'BIRTHDAY', 'ANNIVERSARY', 'LOYALTY_TIER']).optional(),
  discount_type: z.enum(['PERCENT', 'FIXED_AMOUNT']).optional(),
  discount_value: z.number().int().min(0).optional(),
  conditions: z
    .object({
      min_spent: z.number().int().min(0).optional(),
      min_visits: z.number().int().min(0).optional(),
    })
    .optional(),
  active: z.boolean().optional(),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
});

export const adminIncentiveRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/incentives/rules ────────────────────────────────
  // List ALL incentive rules across all retailers, newest first.
  server.get('/incentives/rules', async () => {
    const rules = await prisma.incentiveRule.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        retailer: {
          select: { id: true, shop_name: true, phone: true },
        },
      },
    });
    return { data: rules };
  });

  // ─── GET /admin/incentives/rules/:id ────────────────────────────
  // Get a single rule with retailer info.
  server.get('/incentives/rules/:id', async (request) => {
    const { id } = request.params as { id: string };
    const rule = await prisma.incentiveRule.findUnique({
      where: { id },
      include: {
        retailer: {
          select: { id: true, shop_name: true, phone: true },
        },
      },
    });
    if (!rule) throw notFound('Incentive rule');
    return { data: rule };
  });

  // ─── PUT /admin/incentives/rules/:id ────────────────────────────
  // Admin can update any rule (toggle active, fix values, etc.)
  server.put('/incentives/rules/:id', async (request) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.incentiveRule.findUnique({ where: { id } });
    if (!existing) throw notFound('Incentive rule');

    const body = IncentiveRuleUpdateSchema.safeParse(request.body);
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
        active: body.data.active,
        starts_at: body.data.starts_at ? new Date(body.data.starts_at) : undefined,
        ends_at: body.data.ends_at ? new Date(body.data.ends_at) : undefined,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'IncentiveRule',
        resource_id: id,
        metadata: { changes: Object.keys(body.data) },
      },
    });

    return { data: updated };
  });

  // ─── DELETE /admin/incentives/rules/:id ─────────────────────────
  // Hard delete (admin action).
  server.delete('/incentives/rules/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.incentiveRule.findUnique({ where: { id } });
    if (!existing) throw notFound('Incentive rule');

    await prisma.incentiveRule.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'DELETE',
        resource_type: 'IncentiveRule',
        resource_id: id,
        metadata: { name: existing.name, retailer_id: existing.retailer_id },
      },
    });

    return reply.status(204).send();
  });

  // ─── GET /admin/incentives/stats ────────────────────────────────
  // Aggregate stats across ALL retailers.
  server.get('/incentives/stats', async () => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalRules, activeRules, totalVisits, visitsLast30d, retailersWithRules] = await Promise.all([
      prisma.incentiveRule.count(),
      prisma.incentiveRule.count({ where: { active: true } }),
      prisma.customerVisit.count(),
      prisma.customerVisit.count({ where: { visit_at: { gte: thirtyDaysAgo } } }),
      prisma.incentiveRule.groupBy({ by: ['retailer_id'], _count: true }),
    ]);

    return {
      data: {
        total_rules: totalRules,
        active_rules: activeRules,
        total_visits: totalVisits,
        visits_last_30d: visitsLast30d,
        retailers_with_rules: retailersWithRules.length,
      },
    };
  });
};
