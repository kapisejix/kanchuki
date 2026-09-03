// growth-campaigns-reactivation.ts — reactivation-suggestions audience packaging (split from apps/api/src/routes/growth/growth-campaigns.ts — body byte-identical)
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireGrowth } from './growth-campaigns-helpers.js';
export const growthCampaignReactivationRoutes: FastifyPluginAsync = async (server) => {
  const retailerGuard = async (request: { retailerId: string }) =>
    requireGrowth(request.retailerId);

  // ─── POST /growth/reactivation-suggestions ──────────────────────
  // Roadmap G: find customers who haven't interacted in N days and package
  // them as one-tap reactivation audience suggestions.
  server.post('/reactivation-suggestions', async (request) => {
    const retailerId = request.retailerId;
    await retailerGuard(request);
    const body = z
      .object({ inactive_days: z.number().int().min(7).max(3650).default(60) })
      .safeParse(request.body ?? {});
    const inactiveDays = body.success ? body.data.inactive_days : 60;

    const _cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);
    const active: any[] = [];
    const activeIds = new Set(active.map((a) => a.customer_id));

    const customers = await prisma.customer.findMany({
      where: { retailer_id: retailerId, deleted_at: null, consent_given: true },
      select: { id: true, name: true, phone: true, total_spent: true, last_visit_at: true },
    });
    const inactive = customers.filter((c) => !activeIds.has(c.id));

    // Split into VIP (ever spent >= ₹2,000) vs regular for template variety.
    const vip = inactive.filter((c) => (c.total_spent ?? 0) >= 200_000);
    const regular = inactive.filter((c) => (c.total_spent ?? 0) < 200_000);

    return {
      data: {
        inactive_days: inactiveDays,
        total_inactive: inactive.length,
        groups: [
          { label: 'VIP reactivation', customer_ids: vip.map((c) => c.id), count: vip.length },
          {
            label: 'Regular reactivation',
            customer_ids: regular.map((c) => c.id),
            count: regular.length,
          },
        ],
      },
    };
  });
};
