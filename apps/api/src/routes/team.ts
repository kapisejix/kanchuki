import { type TeamRole, prisma } from '@kanchuki/db';
import { normalizeIndianPhone } from '@kanchuki/shared';
import { createId } from '@paralleldrive/cuid2';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { forbidden, notFound, validationError } from '../plugins/error-handler.js';
import {
  hashPassword,
  signTeamToken,
  verifyPassword,
  verifyTeamToken,
} from '../plugins/team-auth.js';
import { validAdminKey } from './admin.js';

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
});

const UpdateMemberSchema = z.object({
  is_active: z.boolean().optional(),
  max_retailers: z.number().int().min(1).max(10000).nullable().optional(),
  territory_ids: z.array(z.string()).max(100).optional(),
});

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

export const teamRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', async (request, reply) => {
    if (request.url === '/v1/team/login') return;

    // Bootstrap: the existing shared admin key acts as an unscoped Super Admin,
    // since team_members starts empty and needs a way to create the first one.
    const adminKey = request.headers['x-admin-key'] as string | undefined;
    if (validAdminKey(adminKey)) {
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
      select: { id: true, name: true, email: true, role: true, max_retailers: true },
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

    const member = await prisma.teamMember.create({
      data: {
        name: body.data.name,
        email: body.data.email.toLowerCase(),
        password_hash: hashPassword(body.data.password),
        role: body.data.role,
        max_retailers: body.data.max_retailers,
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
        role: true,
        is_active: true,
        max_retailers: true,
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
          role: true,
          is_active: true,
          max_retailers: true,
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
};
