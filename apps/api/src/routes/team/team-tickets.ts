// Auto-split from team.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { forbidden, notFound, validationError } from '../../plugins/error-handler.js';
import { signCatalogUploadToken } from '../../plugins/team-auth.js';
import { getCatalogUploadPromo } from '../admin-settings.js';
import { MANAGER_ROLES, teamAuthPreHandler } from './team-helpers.js';

// Exported so F-019's paid catalog-upload flow (retailers.ts) can route a
// ticket the same way any other visit-required support ticket is routed.

/** Find the best support agent to assign a ticket to, or null if none available. */
export async function routeTicket(
  ticketId: string,
  requiresVisit: boolean,
  retailerTerritoryId: string | null,
  regionScopeId: string | null,
  log: { info: (obj: object, msg?: string) => void },
): Promise<string | null> {
  if (!retailerTerritoryId) return null;

  let candidateTerritoryIds: string[] = [];

  if (!requiresVisit && regionScopeId) {
    // ── Backend-manageable pool ───────────────────────────────────
    // Ticket is routable within the CITY-level region scope.
    candidateTerritoryIds = [regionScopeId];
  } else if (requiresVisit) {
    // ── Visit-required: traverse territory hierarchy ─────────────
    // Start at the retailer's ZONE territory, go up to CITY, then STATE.
    const visited = new Set<string>();
    let currentId: string | null = retailerTerritoryId;

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      candidateTerritoryIds.push(currentId);

      // Fetch parent
      const parentTerritory: { parent_id: string | null } | null =
        await prisma.territory.findUnique({
          where: { id: currentId },
          select: { parent_id: true },
        });
      currentId = parentTerritory?.parent_id ?? null;
    }
  } else {
    // Fallback: just use the retailer's direct territory
    candidateTerritoryIds = [retailerTerritoryId];
  }

  // Find SUPPORT_AGENT members assigned to any of the candidate territories
  const assignments = await prisma.teamMemberTerritory.findMany({
    where: {
      territory_id: { in: candidateTerritoryIds },
      team_member: {
        is_active: true,
        role: { in: ['SUPPORT_AGENT', 'SUPPORT_MANAGER', 'SUPER_ADMIN'] },
      },
    },
    include: {
      team_member: {
        select: { id: true, name: true, role: true },
      },
    },
  });

  if (assignments.length === 0) {
    log.info({ ticket_id: ticketId }, 'No support agents available in territory for routing');
    return null;
  }

  // Deduplicate by team_member_id (an agent can be in multiple territories)
  const uniqueMembers = new Map<string, { id: string; name: string; role: string }>();
  for (const a of assignments) {
    if (!uniqueMembers.has(a.team_member.id)) {
      uniqueMembers.set(a.team_member.id, a.team_member);
    }
  }

  // Prefer SUPPORT_AGENT over SUPPORT_MANAGER over SUPER_ADMIN
  const memberList = [...uniqueMembers.values()];
  const preferred = memberList.filter((m) => m.role === 'SUPPORT_AGENT');
  const backup = memberList.filter((m) => m.role !== 'SUPPORT_AGENT');
  const ordered = preferred.length > 0 ? preferred : backup;

  // Least-loaded scheduling: count open+assigned tickets per candidate
  const agentsWithLoad = await Promise.all(
    ordered.map(async (member) => {
      const openCount = await prisma.supportTicket.count({
        where: {
          assigned_to_id: member.id,
          status: { in: ['OPEN', 'ASSIGNED'] },
        },
      });
      return { id: member.id, name: member.name, load: openCount };
    }),
  );

  // Pick the agent with the fewest active tickets
  agentsWithLoad.sort((a, b) => a.load - b.load);
  const bestAgent = agentsWithLoad[0];

  if (!bestAgent) return null;

  log.info(
    {
      ticket_id: ticketId,
      assigned_to_id: bestAgent.id,
      agent_load: bestAgent.load,
      candidate_count: candidateTerritoryIds.length,
      requires_visit: requiresVisit,
    },
    'Ticket auto-routed',
  );

  return bestAgent.id;
}

export const teamTicketsRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', teamAuthPreHandler);

  const TicketCreateSchema = z.object({
    retailer_id: z.string().min(1),
    requires_visit: z.boolean().optional().default(false),
    note: z.string().max(2000).optional(),
  });

  const TicketUpdateSchema = z.object({
    status: z.enum(['OPEN', 'ASSIGNED', 'RESOLVED', 'CLOSED']).optional(),
    assigned_to_id: z.string().nullable().optional(),
    note: z.string().max(2000).optional(),
    // F-019: admin reviewing a CATALOG_UPLOAD ticket sets these after quoting
    quoted_price_inr: z.number().int().min(0).optional(),
    proposed_slots: z.array(z.string().datetime()).max(10).optional(),
  });

  // ── POST /team/tickets ───────────────────────────────────────────
  // Create a support ticket for a retailer. Any team member can create one.
  // Tickets are automatically routed to the best available support agent.
  server.post('/tickets', async (request) => {
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');
    const body = TicketCreateSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid ticket');

    // Verify retailer exists and is scoped to the creating member's territory.
    const retailer = await prisma.retailer.findUnique({
      where: { id: body.data.retailer_id, deleted_at: null },
      select: { id: true, territory_id: true },
    });
    if (!retailer) throw notFound('Retailer');
    if (
      !tm.isSuperAdmin &&
      retailer.territory_id &&
      !tm.territoryIds.includes(retailer.territory_id)
    ) {
      throw forbidden('Retailer is outside your territory');
    }

    // For visit-required tickets, find the region scope (the CITY-level parent
    // territory) for pool-based routing — backend-manageable tickets are
    // open-pool (null region_scope_id).
    let regionScopeId: string | null = null;
    if (!body.data.requires_visit && retailer.territory_id) {
      // Backend-manageable: poolable within the same CITY-level territory
      const zone = await prisma.territory.findUnique({
        where: { id: retailer.territory_id },
        select: { parent_id: true },
      });
      regionScopeId = zone?.parent_id ?? null;
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        retailer_id: body.data.retailer_id,
        requires_visit: body.data.requires_visit,
        region_scope_id: body.data.requires_visit ? null : regionScopeId,
        note: body.data.note,
      },
      select: {
        id: true,
        retailer_id: true,
        requires_visit: true,
        region_scope_id: true,
        status: true,
        note: true,
        created_at: true,
      },
    });

    // ── Auto-route the newly created ticket ────────────────────
    let assignedTo: string | null = null;
    try {
      assignedTo = await routeTicket(
        ticket.id,
        body.data.requires_visit,
        retailer.territory_id,
        regionScopeId,
        request.log,
      );

      if (assignedTo) {
        await prisma.supportTicket.update({
          where: { id: ticket.id },
          data: { assigned_to_id: assignedTo, status: 'ASSIGNED' },
        });
        ticket.status = 'ASSIGNED';
      }
    } catch (err) {
      request.log.error(
        { err, ticket_id: ticket.id },
        'Auto-routing failed, ticket left unassigned',
      );
    }

    request.log.info(
      {
        ticket_id: ticket.id,
        retailer_id: body.data.retailer_id,
        assigned_to: assignedTo ?? 'unassigned',
      },
      'Support ticket created',
    );

    return { data: { ...ticket, assigned_to_id: assignedTo } };
  });

  // ── GET /team/tickets ────────────────────────────────────────────
  // List tickets. Super Admins see all. Support Managers see tickets in their
  // territory. Support Agents see tickets assigned to them or open tickets in
  // their territory (poolable). Other roles see tickets they created.
  server.get('/tickets', async (request) => {
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');

    const query = z
      .object({ ticket_type: z.enum(['GENERAL', 'CATALOG_UPLOAD']).optional() })
      .safeParse(request.query);

    let where: Record<string, unknown> = {};
    if (!tm.isSuperAdmin) {
      if (tm.role === 'SUPPORT_AGENT') {
        // Pool: assigned to me, OR open tickets in my territories (backend-manageable)
        // or any visit-required ticket in my territories
        where = {
          OR: [
            { assigned_to_id: tm.id },
            {
              retailer: { territory_id: { in: tm.territoryIds } },
            },
          ],
        };
      } else if (MANAGER_ROLES.includes(tm.role)) {
        // Managers see tickets for retailers in their territories
        where = { retailer: { territory_id: { in: tm.territoryIds } } };
      } else {
        // Marketing agents see only tickets linked to retailers they onboarded
        where = { retailer: { onboarded_by_id: tm.id } };
      }
    }

    const tickets = await prisma.supportTicket.findMany({
      where: {
        ...where,
        ...(query.success && query.data.ticket_type ? { ticket_type: query.data.ticket_type } : {}),
      },
      select: {
        id: true,
        retailer_id: true,
        requires_visit: true,
        region_scope_id: true,
        assigned_to_id: true,
        status: true,
        note: true,
        created_at: true,
        resolved_at: true,
        ticket_type: true,
        item_count_requested: true,
        quoted_price_inr: true,
        proposed_slots: true,
        confirmed_slot: true,
        paid_at: true,
        assigned_to: { select: { id: true, name: true } },
        retailer: { select: { id: true, shop_name: true, city: true, phone: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    });

    return { data: tickets };
  });

  // ── POST /team/tickets/route-all ─────────────────────────────────
  // Batch re-route all unassigned OPEN tickets. Returns the count routed.
  server.post('/tickets/route-all', async (request) => {
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');
    if (tm.role !== 'SUPER_ADMIN' && tm.role !== 'SUPPORT_MANAGER') {
      throw forbidden('Only managers and admins can re-route all tickets');
    }

    const unassigned = await prisma.supportTicket.findMany({
      where: {
        status: 'OPEN',
        assigned_to_id: null,
        ...(tm.isSuperAdmin ? {} : { retailer: { territory_id: { in: tm.territoryIds } } }),
      },
      select: {
        id: true,
        requires_visit: true,
        region_scope_id: true,
        retailer: { select: { territory_id: true } },
      },
    });

    let routed = 0;
    for (const ticket of unassigned) {
      try {
        const assignedTo = await routeTicket(
          ticket.id,
          ticket.requires_visit,
          ticket.retailer.territory_id,
          ticket.region_scope_id,
          request.log,
        );

        if (assignedTo) {
          await prisma.supportTicket.update({
            where: { id: ticket.id },
            data: { assigned_to_id: assignedTo, status: 'ASSIGNED' },
          });
          routed++;
        }
      } catch (err) {
        request.log.error(
          { err, ticket_id: ticket.id },
          'Routing failed for individual ticket, skipping',
        );
      }
    }

    request.log.info({ total: unassigned.length, routed }, 'Batch re-route completed');

    return { data: { total: unassigned.length, routed } };
  });

  // ── PATCH /team/tickets/:id ──────────────────────────────────────
  // Update ticket status or assignment. Support roles can update; Super Admin
  // can do anything. Only the assigned agent or a manager in the territory can
  // pick up/resolve a ticket.
  server.patch<{ Params: { id: string } }>('/tickets/:id', async (request) => {
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');
    const body = TicketUpdateSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid update');

    const existing = await prisma.supportTicket.findUnique({
      where: { id: request.params.id },
      select: {
        id: true,
        status: true,
        assigned_to_id: true,
        region_scope_id: true,
        ticket_type: true,
        item_count_requested: true,
        retailer: { select: { territory_id: true } },
      },
    });
    if (!existing) throw notFound('Ticket');

    // Check authorization: Super Admin bypasses all checks
    if (!tm.isSuperAdmin) {
      // Must be in the same territory
      if (
        existing.retailer.territory_id &&
        !tm.territoryIds.includes(existing.retailer.territory_id)
      ) {
        throw forbidden('Ticket is outside your territory');
      }
      // Only support roles can update tickets
      if (!['SUPPORT_AGENT', 'SUPPORT_MANAGER'].includes(tm.role)) {
        throw forbidden('Only support team members can update tickets');
      }
    }

    const update: Record<string, unknown> = {};
    if (body.data.status !== undefined) {
      update.status = body.data.status;
      if (body.data.status === 'RESOLVED' || body.data.status === 'CLOSED') {
        update.resolved_at = new Date();
      }
    }
    if (body.data.assigned_to_id !== undefined) {
      // If assigning, verify the assignee exists and is a support role
      if (body.data.assigned_to_id) {
        const assignee = await prisma.teamMember.findUnique({
          where: { id: body.data.assigned_to_id },
          select: { role: true, is_active: true },
        });
        if (!assignee || !assignee.is_active)
          throw validationError('Assignee not found or inactive');
        if (!['SUPPORT_AGENT', 'SUPPORT_MANAGER', 'SUPER_ADMIN'].includes(assignee.role)) {
          throw validationError('Can only assign to support team members');
        }
      }
      update.assigned_to_id = body.data.assigned_to_id;
    }
    if (body.data.note !== undefined) {
      update.note = body.data.note;
    }
    // 2026-08-04 (F-019 Task 2): system-enforced limited-time free offer.
    // When the promo is live (free_item_limit set, window not expired) and
    // this catalog request is within the free limit, the quote is FORCED to
    // ₹0 — computed here instead of relying on whoever quotes the ticket
    // remembering the promo cutoff. promo_applied rides the response so the
    // admin UI can show why the price came out 0. Above the limit (or when
    // the promo is off/expired) the manual quoted_price_inr stands.
    let promoApplied = false;
    const promo = await getCatalogUploadPromo();
    if (
      promo.active &&
      existing.ticket_type === 'CATALOG_UPLOAD' &&
      existing.item_count_requested !== null &&
      existing.item_count_requested <= (promo.free_item_limit as number)
    ) {
      update.quoted_price_inr = 0;
      promoApplied = true;
    } else if (body.data.quoted_price_inr !== undefined) {
      update.quoted_price_inr = body.data.quoted_price_inr;
    }
    if (body.data.proposed_slots !== undefined) {
      update.proposed_slots = body.data.proposed_slots;
    }

    const ticket = await prisma.supportTicket.update({
      where: { id: request.params.id },
      data: update,
      select: {
        id: true,
        retailer_id: true,
        requires_visit: true,
        assigned_to_id: true,
        status: true,
        note: true,
        ticket_type: true,
        item_count_requested: true,
        quoted_price_inr: true,
        proposed_slots: true,
        confirmed_slot: true,
        paid_at: true,
        created_at: true,
        resolved_at: true,
      },
    });

    request.log.info(
      { ticket_id: ticket.id, status: ticket.status, promo_applied: promoApplied },
      'Support ticket updated',
    );

    return { data: { ...ticket, promo_applied: promoApplied } };
  });

  // ── GET /team/tickets/stats ─────────────────────────────────────
  // Aggregate ticket statistics for dashboards.
  server.get('/tickets/stats', async (request) => {
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');

    const baseWhere = tm.isSuperAdmin
      ? {}
      : { retailer: { territory_id: { in: tm.territoryIds } } };

    const [open, assigned, resolved, closed, visitRequired] = await Promise.all([
      prisma.supportTicket.count({ where: { ...baseWhere, status: 'OPEN' as const } }),
      prisma.supportTicket.count({ where: { ...baseWhere, status: 'ASSIGNED' as const } }),
      prisma.supportTicket.count({ where: { ...baseWhere, status: 'RESOLVED' as const } }),
      prisma.supportTicket.count({ where: { ...baseWhere, status: 'CLOSED' as const } }),
      prisma.supportTicket.count({ where: { ...baseWhere, requires_visit: true } }),
    ]);

    return {
      data: {
        open,
        assigned,
        resolved,
        closed,
        total: open + assigned + resolved + closed,
        requires_visit: visitRequired,
      },
    };
  });

  // ── POST /team/tickets/:id/catalog-session ──────────────────────
  // F-020: mint a short-lived, ticket-scoped token so the assigned team
  // member can upload the retailer's catalog from their own phone without
  // ever seeing the retailer's real login. Only the assigned agent (or a
  // super admin) can mint one, and only once payment cleared + a visit
  // slot is confirmed — mirrors the retailer-side confirm-slot guard in
  // retailers.ts.
  server.post<{ Params: { id: string } }>('/tickets/:id/catalog-session', async (request) => {
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: request.params.id },
      select: {
        id: true,
        ticket_type: true,
        retailer_id: true,
        assigned_to_id: true,
        paid_at: true,
        confirmed_slot: true,
      },
    });
    if (!ticket || ticket.ticket_type !== 'CATALOG_UPLOAD') {
      throw notFound('Catalog upload ticket');
    }
    if (!tm.isSuperAdmin && ticket.assigned_to_id !== tm.id) {
      throw forbidden('Only the assigned team member can start this session');
    }
    if (!ticket.paid_at || !ticket.confirmed_slot) {
      throw validationError('Visit is not confirmed yet — payment and a slot are required first');
    }

    const teamMemberId = ticket.assigned_to_id ?? tm.id;
    const token = await signCatalogUploadToken({
      retailer_id: ticket.retailer_id,
      ticket_id: ticket.id,
      team_member_id: teamMemberId,
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'staff',
        actor_id: tm.id,
        action: 'issue_catalog_session',
        resource_type: 'SupportTicket',
        resource_id: ticket.id,
        metadata: { retailer_id: ticket.retailer_id },
        ip_address: request.ip,
      },
    });

    return { data: { token, expires_in_seconds: 8 * 60 * 60 } };
  });
};
