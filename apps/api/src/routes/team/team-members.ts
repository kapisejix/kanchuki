// Auto-split from team.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma } from '@kanchuki/db';
import { normalizeIndianPhone } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { forbidden, notFound, validationError } from '../../plugins/error-handler.js';
import { hashPassword } from '../../plugins/team-auth.js';
import {
  AGENT_ROLES_BY_MANAGER,
  MANAGER_ROLES,
  generateReferralCode,
  teamAuthPreHandler,
} from './team-helpers.js';

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

export const teamMembersRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', teamAuthPreHandler);

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
};
