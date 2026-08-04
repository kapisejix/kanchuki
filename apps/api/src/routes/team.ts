import { type TeamRole, prisma } from '@kanchuki/db';
import { normalizeIndianPhone } from '@kanchuki/shared';
import { getCatalogUploadPromo } from './admin-settings.js';
import { createId } from '@paralleldrive/cuid2';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { forbidden, notFound, validationError } from '../plugins/error-handler.js';
import {
  hashPassword,
  signCatalogUploadToken,
  signTeamToken,
  verifyPassword,
  verifyTeamToken,
} from '../plugins/team-auth.js';
import { validAdminKey, verifyAdminSession } from './admin.js';

declare module 'fastify' {
  interface FastifyRequest {
    teamMember?: {
      id: string;
      role: TeamRole;
      territoryIds: string[]; // empty + isSuperAdmin true means "unscoped, sees all"
      isSuperAdmin: boolean;
    };
  }
}

const MANAGER_ROLES: TeamRole[] = ['MARKETING_MANAGER', 'SUPPORT_MANAGER'];
const AGENT_ROLES_BY_MANAGER: Record<string, TeamRole> = {
  MARKETING_MANAGER: 'MARKETING_AGENT',
  SUPPORT_MANAGER: 'SUPPORT_AGENT',
};

function requireRole(request: import('fastify').FastifyRequest, allowed: TeamRole[]): void {
  const tm = request.teamMember;
  if (!tm) throw forbidden('Not authenticated');
  if (tm.isSuperAdmin) return;
  if (!allowed.includes(tm.role)) throw forbidden('Insufficient role for this action');
}

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

const TerritorySchema = z.object({
  name: z.string().min(1).max(100),
  level: z.enum(['STATE', 'CITY', 'ZONE']),
  parent_id: z.string().optional(),
  pincodes: z.array(z.string().max(10)).max(500).optional(),
});

const CreateMemberSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  // 2026-08-04: optional phone enables phone-OTP login into the mobile staff
  // screens (auth.ts /otp/verify) — normalized to the same Indian format
  // the OTP flow uses so lookups always match.
  phone: z
    .string()
    .min(10)
    .max(15)
    .optional()
    .transform((v) => (v ? normalizeIndianPhone(v) : undefined)),
  password: z.string().min(8).max(128),
  role: z.enum([
    'SUPER_ADMIN',
    'MARKETING_MANAGER',
    'MARKETING_AGENT',
    'SUPPORT_MANAGER',
    'SUPPORT_AGENT',
  ]),
  max_retailers: z.number().int().min(1).max(10000).optional(),
  territory_ids: z.array(z.string()).max(100).optional(),
  referral_code: z.string().min(4).max(20).optional(), // F-018
});

const UpdateMemberSchema = z.object({
  is_active: z.boolean().optional(),
  max_retailers: z.number().int().min(1).max(10000).nullable().optional(),
  territory_ids: z.array(z.string()).max(100).optional(),
  referral_code: z.string().min(4).max(20).nullable().optional(), // F-018
  // 2026-08-04: set/clear the phone used for OTP login into mobile staff screens
  phone: z
    .string()
    .min(10)
    .max(15)
    .nullable()
    .optional()
    .transform((v) => (v ? normalizeIndianPhone(v) : null)),
});

// F-018: short code a retailer can type at self-serve signup. Auto-generated
// for marketing agents so every agent has one without a manual admin step.
function generateReferralCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const OnboardRetailerSchema = z.object({
  phone: z
    .string()
    .min(10)
    .max(15)
    .transform((v) => normalizeIndianPhone(v)),
  shop_name: z.string().min(1).max(200),
  owner_name: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().max(100).optional(),
  pincode: z.string().max(10).optional(),
  categories: z.array(z.string().max(50)).max(10).optional(),
  territory_id: z.string().optional(), // override auto-derivation
});

/** Territory is auto-derived from a ZONE-level territory whose pincodes list contains this pincode. */
async function deriveTerritoryFromPincode(pincode: string | undefined): Promise<string | null> {
  if (!pincode) return null;
  const zone = await prisma.territory.findFirst({
    where: { level: 'ZONE', pincodes: { has: pincode } },
    select: { id: true },
  });
  return zone?.id ?? null;
}

// ── Ticket Routing ──────────────────────────────────────────────────
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

export const teamRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', async (request, reply) => {
    if (request.url === '/v1/team/login') return;

    // Bootstrap: the existing shared admin key acts as an unscoped Super Admin,
    // since team_members starts empty and needs a way to create the first one.
    const adminKey = request.headers['x-admin-key'] as string | undefined;
    if (adminKey && (validAdminKey(adminKey) || (await verifyAdminSession(adminKey)))) {
      request.teamMember = {
        id: 'admin-key',
        role: 'SUPER_ADMIN',
        territoryIds: [],
        isSuperAdmin: true,
      };
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'Missing Bearer token', status: 401 } });
    }

    const claims = await verifyTeamToken(authHeader.slice(7));
    if (!claims) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token', status: 401 },
      });
    }

    const member = await prisma.teamMember.findUnique({
      where: { id: claims.sub },
      select: { id: true, role: true, is_active: true },
    });
    if (!member || !member.is_active) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Account inactive or removed', status: 403 },
      });
    }

    const isSuperAdmin = member.role === 'SUPER_ADMIN';
    let territoryIds: string[] = [];
    if (!isSuperAdmin) {
      const rows = await prisma.teamMemberTerritory.findMany({
        where: { team_member_id: member.id },
        select: { territory_id: true },
      });
      territoryIds = rows.map((r) => r.territory_id);
    }

    request.teamMember = { id: member.id, role: member.role, territoryIds, isSuperAdmin };
  });

  // ─── POST /team/login ────────────────────────────────────────────
  server.post('/login', async (request) => {
    const body = LoginSchema.safeParse(request.body);
    if (!body.success)
      throw validationError(body.error.issues[0]?.message ?? 'Invalid credentials');

    const member = await prisma.teamMember.findUnique({
      where: { email: body.data.email.toLowerCase() },
    });
    if (!member || !member.is_active || !verifyPassword(body.data.password, member.password_hash)) {
      throw forbidden('Invalid credentials');
    }

    const token = await signTeamToken({ sub: member.id, role: member.role });
    return {
      data: {
        token,
        team_member: { id: member.id, name: member.name, email: member.email, role: member.role },
      },
    };
  });

  // ─── GET /team/me ────────────────────────────────────────────────
  server.get('/me', async (request) => {
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');
    if (tm.id === 'admin-key') {
      return { data: { id: 'admin-key', name: 'Admin', role: 'SUPER_ADMIN', territories: [] } };
    }
    const member = await prisma.teamMember.findUnique({
      where: { id: tm.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        max_retailers: true,
        referral_code: true,
      },
    });
    if (!member) throw notFound('Team member');
    const territories = await prisma.territory.findMany({
      where: { id: { in: tm.territoryIds } },
      select: { id: true, name: true, level: true },
    });
    return { data: { ...member, territories } };
  });

  // ─── Territories ─────────────────────────────────────────────────
  server.post('/territories', async (request) => {
    requireRole(request, []);
    const body = TerritorySchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid territory');

    const territory = await prisma.territory.create({
      data: {
        name: body.data.name,
        level: body.data.level,
        parent_id: body.data.parent_id,
        pincodes: body.data.pincodes ?? [],
      },
    });
    return { data: territory };
  });

  server.get('/territories', async () => {
    const territories = await prisma.territory.findMany({ orderBy: { name: 'asc' } });
    return { data: territories };
  });

  server.patch<{ Params: { id: string } }>('/territories/:id', async (request) => {
    requireRole(request, []);
    const body = TerritorySchema.partial().safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid territory');

    const territory = await prisma.territory
      .update({ where: { id: request.params.id }, data: body.data })
      .catch(() => null);
    if (!territory) throw notFound('Territory');
    return { data: territory };
  });

  // ─── Members ─────────────────────────────────────────────────────
  server.post('/members', async (request) => {
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');
    const body = CreateMemberSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid member');

    if (!tm.isSuperAdmin) {
      const allowedRole = AGENT_ROLES_BY_MANAGER[tm.role];
      if (!allowedRole || body.data.role !== allowedRole) {
        throw forbidden('Managers may only create their own agent role');
      }
    }

    const existing = await prisma.teamMember.findUnique({
      where: { email: body.data.email.toLowerCase() },
    });
    if (existing) throw validationError('Email already in use', 'email');

    // F-018: agents get a referral code automatically; other roles only if given one.
    // ponytail: no collision retry — 36^6 code space vs. dozens of agents, not worth it.
    const referralCode =
      body.data.referral_code ??
      (body.data.role === 'MARKETING_AGENT' ? generateReferralCode() : undefined);

    const member = await prisma.teamMember.create({
      data: {
        name: body.data.name,
        email: body.data.email.toLowerCase(),
        phone: body.data.phone,
        password_hash: hashPassword(body.data.password),
        role: body.data.role,
        max_retailers: body.data.max_retailers,
        referral_code: referralCode,
        territories: body.data.territory_ids
          ? { create: body.data.territory_ids.map((territory_id) => ({ territory_id })) }
          : undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        max_retailers: true,
        is_active: true,
        referral_code: true,
      },
    });
    return { data: member };
  });

  server.get('/members', async (request) => {
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');
    const where = tm.isSuperAdmin
      ? {}
      : MANAGER_ROLES.includes(tm.role)
        ? { territories: { some: { territory_id: { in: tm.territoryIds } } } }
        : { id: tm.id }; // agents see only themselves

    const members = await prisma.teamMember.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        is_active: true,
        max_retailers: true,
        referral_code: true,
        territories: { select: { territory: { select: { id: true, name: true, level: true } } } },
        _count: { select: { onboarded_retailers: true, supported_retailers: true } },
      },
      orderBy: { name: 'asc' },
    });

    return {
      data: members.map((m) => {
        const retailerCount =
          m.role === 'SUPPORT_MANAGER' || m.role === 'SUPPORT_AGENT'
            ? m._count.supported_retailers
            : m._count.onboarded_retailers;
        return {
          id: m.id,
          name: m.name,
          email: m.email,
          role: m.role,
          is_active: m.is_active,
          max_retailers: m.max_retailers,
          referral_code: m.referral_code,
          territories: m.territories.map((t) => t.territory),
          retailer_count: retailerCount,
          over_capacity: m.max_retailers != null && retailerCount > m.max_retailers,
        };
      }),
    };
  });

  server.patch<{ Params: { id: string } }>('/members/:id', async (request) => {
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');
    const body = UpdateMemberSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid update');

    if (!tm.isSuperAdmin) {
      // Managers may only edit members who currently share one of their territories.
      const target = await prisma.teamMember.findUnique({
        where: { id: request.params.id },
        select: { territories: { select: { territory_id: true } } },
      });
      if (!target) throw notFound('Team member');
      const shared = target.territories.some((t) => tm.territoryIds.includes(t.territory_id));
      if (!shared || !MANAGER_ROLES.includes(tm.role)) throw forbidden('Cannot edit this member');

      // Managers may only assign territories within their own scope.
      if (body.data.territory_ids?.some((id) => !tm.territoryIds.includes(id))) {
        throw forbidden('Cannot assign territories outside your own scope');
      }
    }

    const { territory_ids, ...rest } = body.data;
    const member = await prisma.teamMember
      .update({
        where: { id: request.params.id },
        data: {
          ...rest,
          territories: territory_ids
            ? {
                deleteMany: {},
                create: territory_ids.map((territory_id) => ({ territory_id })),
              }
            : undefined,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          is_active: true,
          max_retailers: true,
          referral_code: true,
        },
      })
      .catch(() => null);
    if (!member) throw notFound('Team member');
    return { data: member };
  });

  // ─── Retailer onboarding (marketing agent, in-person signup) ─────
  server.post('/retailers', async (request) => {
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');
    requireRole(request, ['MARKETING_AGENT', 'MARKETING_MANAGER']);

    const body = OnboardRetailerSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid retailer');

    const territoryId =
      body.data.territory_id ?? (await deriveTerritoryFromPincode(body.data.pincode));

    const retailer = await prisma.retailer.upsert({
      where: { phone: body.data.phone },
      create: {
        // No Supabase auth user exists yet for an agent-created retailer — a
        // placeholder is replaced with the real auth_user_id on first OTP
        // login (see auth.ts otp/verify phone-linking fallback).
        auth_user_id: `pending:${createId()}`,
        phone: body.data.phone,
        shop_name: body.data.shop_name,
        owner_name: body.data.owner_name,
        city: body.data.city,
        state: body.data.state,
        pincode: body.data.pincode,
        categories: body.data.categories ?? [],
        plan: 'STARTER',
        plan_status: 'TRIAL',
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        onboarding_completed: false,
        onboarding_step: 0,
        territory_id: territoryId,
        onboarded_by_id: tm.id === 'admin-key' ? null : tm.id,
        support_owner_id: tm.id === 'admin-key' ? null : tm.id,
      },
      update: {}, // retailer already exists (e.g. re-visit) — attribution isn't overwritten
      select: { id: true, shop_name: true, phone: true, territory_id: true, onboarded_by_id: true },
    });

    let overCapacity = false;
    if (tm.id !== 'admin-key') {
      const member = await prisma.teamMember.findUnique({
        where: { id: tm.id },
        select: { max_retailers: true },
      });
      if (member?.max_retailers != null) {
        const count = await prisma.retailer.count({
          where: { onboarded_by_id: tm.id, deleted_at: null },
        });
        overCapacity = count > member.max_retailers;
      }
    }

    return { data: { retailer, over_capacity: overCapacity } };
  });

  // ─── GET /team/retailers — territory-scoped dashboard list ───────
  server.get('/retailers', async (request) => {
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');
    const where = tm.isSuperAdmin
      ? { deleted_at: null }
      : { deleted_at: null, territory_id: { in: tm.territoryIds } };

    const retailers = await prisma.retailer.findMany({
      where,
      select: {
        id: true,
        shop_name: true,
        phone: true,
        city: true,
        territory_id: true,
        onboarded_by_id: true,
        support_owner_id: true,
        plan_status: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    return { data: retailers };
  });

  // ═══════════════════════════════════════════════════════════════
  //  (Phase 0.5) Support Tickets
  // ═══════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════
  //  (Phase 0.5) Manager Reporting
  // ═══════════════════════════════════════════════════════════════

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
