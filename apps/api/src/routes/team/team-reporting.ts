// Auto-split from team.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { forbidden } from '../../plugins/error-handler.js';
import { requireRole, teamAuthPreHandler } from './team-helpers.js';

export const teamReportingRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', teamAuthPreHandler);

  // ── GET /team/reporting/agents ──────────────────────────────────
  // Retailers onboarded per agent, with activation status breakdown.
  server.get('/reporting/agents', async (request) => {
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');
    requireRole(request, ['MARKETING_MANAGER', 'SUPPORT_MANAGER']);

    const where = tm.isSuperAdmin
      ? {}
      : { territories: { some: { territory_id: { in: tm.territoryIds } } } };

    const agents = await prisma.teamMember.findMany({
      where: {
        ...where,
        role: { in: ['MARKETING_AGENT', 'SUPPORT_AGENT'] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        max_retailers: true,
        territories: {
          select: { territory: { select: { id: true, name: true, level: true } } },
        },
        _count: { select: { onboarded_retailers: true, supported_retailers: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Fetch activation breakdown per agent
    const withActivation = await Promise.all(
      agents.map(async (agent) => {
        const agentWhere = {
          [agent.role === 'SUPPORT_AGENT' || agent.role === 'SUPPORT_MANAGER'
            ? 'support_owner_id'
            : 'onboarded_by_id']: agent.id,
        };
        const [activated, trial, active] = await Promise.all([
          prisma.retailer.count({
            where: {
              ...(agentWhere as Record<string, string>),
              deleted_at: null,
              onboarding_completed: true,
            },
          }),
          prisma.retailer.count({
            where: {
              ...(agentWhere as Record<string, string>),
              deleted_at: null,
              plan_status: 'TRIAL',
            },
          }),
          prisma.retailer.count({
            where: {
              ...(agentWhere as Record<string, string>),
              deleted_at: null,
              plan_status: 'ACTIVE',
            },
          }),
        ]);

        const retailerCount =
          agent.role === 'SUPPORT_AGENT' || agent.role === 'SUPPORT_MANAGER'
            ? agent._count.supported_retailers
            : agent._count.onboarded_retailers;

        return {
          id: agent.id,
          name: agent.name,
          email: agent.email,
          role: agent.role,
          territories: agent.territories.map((t) => t.territory),
          max_retailers: agent.max_retailers,
          retailer_count: retailerCount,
          over_capacity: agent.max_retailers != null && retailerCount > agent.max_retailers,
          activated,
          trial,
          active_subscription: active,
          activation_rate: retailerCount > 0 ? Math.round((activated / retailerCount) * 100) : 0,
        };
      }),
    );

    return { data: withActivation };
  });

  // ── GET /team/reporting/coverage-gaps ────────────────────────────
  // Territories (ZONE-level only) that have retailers but zero assigned
  // team members — flags gaps for manager attention.
  server.get('/reporting/coverage-gaps', async (request) => {
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');
    requireRole(request, ['MARKETING_MANAGER', 'SUPPORT_MANAGER']);

    // Find ZONE-level territories that have no team member assignments
    const territories = await prisma.territory.findMany({
      where: {
        level: 'ZONE',
        staff: { none: {} }, // zero team members assigned
        retailers: { some: { deleted_at: null } }, // but has retailers
      },
      select: {
        id: true,
        name: true,
        parent_id: true,
        _count: { select: { retailers: { where: { deleted_at: null } } } },
      },
      orderBy: { name: 'asc' },
    });

    // Resolve parent (CITY) names for reporting context
    const parentIds = [...new Set(territories.map((t) => t.parent_id).filter(Boolean))] as string[];
    const parents = parentIds.length
      ? await prisma.territory.findMany({
          where: { id: { in: parentIds } },
          select: { id: true, name: true },
        })
      : [];
    const parentMap = new Map(parents.map((p) => [p.id, p.name]));

    // Scope to manager's own territories if not Super Admin
    const gaps = territories
      .filter((t) => tm.isSuperAdmin || !t.parent_id || tm.territoryIds.includes(t.parent_id))
      .map((t) => ({
        id: t.id,
        name: t.name,
        city: t.parent_id ? (parentMap.get(t.parent_id) ?? 'Unknown') : 'Unknown',
        retailer_count: t._count.retailers,
      }));

    return {
      data: {
        total_gaps: gaps.length,
        gaps,
      },
    };
  });

  // ── GET /team/reporting/retailer-activation ──────────────────────
  // Funnel summary: total onboarded → completed onboarding → trial → active
  server.get('/reporting/retailer-activation', async (request) => {
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');

    const baseWhere = tm.isSuperAdmin
      ? { deleted_at: null }
      : { deleted_at: null, territory_id: { in: tm.territoryIds } };

    const [total, onboarded, trial, active, cancelled] = await Promise.all([
      prisma.retailer.count({ where: baseWhere }),
      prisma.retailer.count({ where: { ...baseWhere, onboarding_completed: true } }),
      prisma.retailer.count({ where: { ...baseWhere, plan_status: 'TRIAL' as const } }),
      prisma.retailer.count({ where: { ...baseWhere, plan_status: 'ACTIVE' as const } }),
      prisma.retailer.count({ where: { ...baseWhere, plan_status: 'CANCELLED' as const } }),
    ]);

    return {
      data: {
        total_retailers: total,
        onboarding_completed: onboarded,
        trial,
        active_subscription: active,
        cancelled,
        onboarding_rate: total > 0 ? Math.round((onboarded / total) * 100) : 0,
        trial_to_active_rate: trial > 0 ? Math.round((active / trial) * 100) : 0,
      },
    };
  });
};
