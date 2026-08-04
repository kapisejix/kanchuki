// Auto-split from team.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma } from '@kanchuki/db';
import { normalizeIndianPhone } from '@kanchuki/shared';
import { createId } from '@paralleldrive/cuid2';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { seedDefaultCategories } from '../../lib/default-categories.js';
import { forbidden, validationError } from '../../plugins/error-handler.js';
import { deriveTerritoryFromPincode, requireRole, teamAuthPreHandler } from './team-helpers.js';

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

export const teamRetailersRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', teamAuthPreHandler);

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

    // F-024: agent-created retailers get the default Shop-By-Categories
    // template seeded too (idempotent, safe on the upsert's update path).
    await seedDefaultCategories(retailer.id);

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
