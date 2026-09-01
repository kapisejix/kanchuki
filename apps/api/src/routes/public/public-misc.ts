// Auto-split from public.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma } from '@kanchuki/db';
import { PLAN_PRICING } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { validationError } from '../../plugins/error-handler.js';
import { getTheme } from '../admin-settings.js';

type Plan = 'STARTER' | 'GROWTH' | 'PRO';
const PLANS: Plan[] = ['STARTER', 'GROWTH', 'PRO'];

const CONTACT_TOPICS = [
  'Getting started',
  'Catalog help',
  'Billing',
  'Partnership',
  'Something else',
] as const;

export const publicMiscRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /public/theme ─────────────────────────────────────────
  // Admin-configurable brand color (apps/web/src/app/admin/settings/theme).
  // No auth — read by the web app (CSS var injection) and the mobile app
  // (fetched at launch, see apps/mobile/src/lib/theme.tsx) so a color
  // change is live without a new deploy/app-store release.
  server.get(
    '/theme',
    {
      config: {
        cacheControl: 'public, max-age=60, s-maxage=60, stale-while-revalidate=600',
      },
    },
    async () => {
      const data = await getTheme();
      return { data };
    },
  );

  // ─── GET /public/pricing ────────────────────────────────────────
  // Admin-configurable plan pricing (plan_pricing table). No auth — read
  // by the marketing site (pricing page + homepage pricing section) so a
  // price change is live without a redeploy. Falls back to the hardcoded
  // PLAN_PRICING constant for any plan an admin hasn't edited yet.
  server.get(
    '/pricing',
    {
      config: {
        cacheControl: 'public, max-age=60, s-maxage=60, stale-while-revalidate=600',
      },
    },
    async () => {
      const rows = await prisma.planPricing.findMany();
      const byPlan = new Map(rows.map((r) => [r.plan, r]));

      const data = PLANS.map((plan) => {
        const row = byPlan.get(plan);
        return {
          plan,
          monthly: row?.monthly_paise ?? PLAN_PRICING[plan].monthly,
        };
      });

      return { data };
    },
  );

  // ─── GET /public/stats ─────────────────────────────────────────
  // Landing page stats — real counts from the platform, no auth needed.
  server.get(
    '/stats',
    {
      config: {
        cacheControl: 'public, max-age=60, s-maxage=60, stale-while-revalidate=600',
      },
    },
    async (_request, reply) => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [productCount, collectionCount, retailerCount, monthEnquiries] = await Promise.all([
        prisma.product.count({ where: { deleted_at: null } }),
        prisma.collection.count({ where: { deleted_at: null } }),
        prisma.retailer.count({ where: { deleted_at: null } }),
        prisma.collectionEnquiry.count({ where: { created_at: { gte: monthStart } } }),
      ]);

      reply.header('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=600');

      return {
        data: {
          total_products: productCount,
          total_collections: collectionCount,
          total_retailers: retailerCount,
          enquiries_this_month: monthEnquiries,
        },
      };
    },
  );

  // ─── POST /public/contact ────────────────────────────────────────
  // Real "how to reach us" form submission (docs/content/pages/contact.md
  // — explicitly "no fake submit"). No new table/migration: reuses AuditLog
  // (already readable by admins at GET /admin/activity?resource_type=
  // ContactSubmission, F-014's platform activity feed). Global rate limiter
  // (200/min/IP, apps/api/src/index.ts) is the abuse guard — no per-route
  // limiter added, this is a low-traffic marketing-site form.
  server.post('/contact', async (request, reply) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(100),
        shop_city: z.string().trim().max(200).optional(),
        topic: z.enum(CONTACT_TOPICS),
        message: z.string().trim().min(1).max(2000),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const { name, shop_city, topic, message } = body.data;

    await prisma.auditLog.create({
      data: {
        actor_type: 'anonymous',
        action: 'CONTACT_FORM_SUBMIT',
        resource_type: 'ContactSubmission',
        metadata: { name, shop_city: shop_city ?? null, topic, message },
        ip_address: request.ip,
      },
    });

    return reply.status(201).send({ data: { received: true } });
  });
};
