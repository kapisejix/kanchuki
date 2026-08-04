// Auto-split from retailers.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma, vaultDelete } from '@kanchuki/db';
import type { QuotaPeriod, QuotaResourceType } from '@kanchuki/db';
import { generateCollectionSlug } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';

function periodStart(period: QuotaPeriod, now = new Date()): Date {
  if (period === 'DAY') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'MONTH') return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(0); // LIFETIME
}

export const retailersSettingsRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /retailers/me/plan ─────────────────────────────────────
  server.get('/me/plan', async (request) => {
    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: {
        plan: true,
        plan_status: true,
        trial_ends_at: true,
        plan_expires_at: true,
        max_products: true,
        max_customers: true,
        try_on_credits: true,
      },
    });
    if (!retailer) throw notFound('Retailer');
    return { data: retailer };
  });

  // ─── PATCH /retailers/me/onboarding ────────────────────────────
  server.patch('/me/onboarding', async (request) => {
    const body = z
      .object({
        step: z.number().int().min(0).max(6),
        completed: z.boolean().optional(),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const updated = await prisma.retailer.update({
      where: { id: request.retailerId },
      data: {
        onboarding_step: body.data.step,
        ...(body.data.completed === true ? { onboarding_completed: true } : {}),
      },
      select: { onboarding_step: true, onboarding_completed: true },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'update',
        resource_type: 'Retailer',
        resource_id: request.retailerId,
        metadata: { onboarding_step: body.data.step, completed: body.data.completed ?? false },
        ip_address: request.ip,
      },
    });

    return { data: updated };
  });

  // ─── POST /retailers/me/qr-slug ─────────────────────────────────
  // Get-or-create the stable slug the QR code encodes (/store/{slug}).
  server.post('/me/qr-slug', async (request) => {
    const existing = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: { public_slug: true, shop_name: true },
    });
    if (!existing) throw notFound('Retailer');
    const webBase = process.env.WEB_URL ?? '';

    if (existing.public_slug) {
      return {
        data: {
          public_slug: existing.public_slug,
          profile_url: `${webBase}/store/${existing.public_slug}`,
        },
      };
    }

    let slug = generateCollectionSlug(existing.shop_name);
    while (await prisma.retailer.findUnique({ where: { public_slug: slug } })) {
      slug = generateCollectionSlug(existing.shop_name);
    }

    const updated = await prisma.retailer.update({
      where: { id: request.retailerId },
      data: { public_slug: slug },
      select: { public_slug: true },
    });
    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'update',
        resource_type: 'Retailer',
        resource_id: request.retailerId,
        metadata: { public_slug_created: true, slug: updated.public_slug },
        ip_address: request.ip,
      },
    });

    return {
      data: {
        public_slug: updated.public_slug,
        profile_url: `${webBase}/store/${updated.public_slug}`,
      },
    };
  });

  // ─── PATCH /retailers/me/storefront ─────────────────────────────
  // Pick which collection the QR profile page opens into after the
  // contact gate. Pass collection_id: null to unset.
  server.patch('/me/storefront', async (request) => {
    const body = z.object({ collection_id: z.string().nullable() }).safeParse(request.body);
    if (!body.success) throw validationError('Invalid body');

    if (body.data.collection_id) {
      const owned = await prisma.collection.findFirst({
        where: { id: body.data.collection_id, retailer_id: request.retailerId, deleted_at: null },
      });
      if (!owned) throw validationError('Collection does not belong to your store');
    }

    const updated = await prisma.retailer.update({
      where: { id: request.retailerId },
      data: { storefront_collection_id: body.data.collection_id },
      select: { storefront_collection_id: true },
    });
    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'update',
        resource_type: 'Retailer',
        resource_id: request.retailerId,
        metadata: { storefront_collection_id: body.data.collection_id },
        ip_address: request.ip,
      },
    });

    return { data: updated };
  });

  // ─── GET /retailers/me/usage ──────────────────────────────────────
  // F-010: Return usage vs limits for all metered resources.
  server.get('/me/usage', async (request) => {
    const retailerId = request.retailerId;

    const retailer = await prisma.retailer.findUnique({
      where: { id: retailerId },
      select: { plan: true },
    });
    if (!retailer) throw notFound('Retailer');

    const ALL_RESOURCES: QuotaResourceType[] = [
      'PRODUCT_UPLOAD',
      'AI_TAGGING_CALL',
      'TRY_ON',
      'IMAGE_CROP',
      'BG_REMOVAL',
      'API_REQUEST',
    ];

    // Check for per-retailer override
    const overrides = await prisma.retailerLimitOverride.findMany({
      where: { retailer_id: retailerId },
    });
    const overrideMap = new Map(overrides.map((o) => [o.resource_type, o]));

    // Fetch plan limits for retailer's plan
    const planLimits = await prisma.planLimit.findMany({
      where: { plan: retailer.plan },
    });
    const planLimitMap = new Map(planLimits.map((p) => [p.resource_type, p]));

    // Fetch current usage counters
    const now = new Date();
    const counters = await prisma.usageCounter.findMany({
      where: { retailer_id: retailerId },
    });

    const usage = ALL_RESOURCES.map((resourceType) => {
      const override = overrideMap.get(resourceType);
      if (override) {
        // Per-retailer override takes priority
        const start = periodStart(override.period, now);
        const counter = counters.find(
          (c) => c.resource_type === resourceType && c.period_start.getTime() === start.getTime(),
        );
        return {
          resource_type: resourceType,
          limit: override.limit_per_period,
          used: counter?.count ?? 0,
          period: override.period,
          source: 'override' as const,
        };
      }

      const planLimit = planLimitMap.get(resourceType);
      if (!planLimit) {
        // No limit configured — unlimited
        return {
          resource_type: resourceType,
          limit: -1, // unlimited
          used: 0,
          period: 'LIFETIME' as QuotaPeriod,
          source: 'unlimited' as const,
        };
      }

      const start = periodStart(planLimit.period, now);
      const counter = counters.find(
        (c) => c.resource_type === resourceType && c.period_start.getTime() === start.getTime(),
      );
      return {
        resource_type: resourceType,
        limit: planLimit.limit_per_period,
        used: counter?.count ?? 0,
        period: planLimit.period,
        source: 'plan' as const,
      };
    });

    return { data: usage };
  });

  // ─── DELETE /retailers/me ───────────────────────────────────────
  // F-009: Soft-delete the retailer account. Collections become inaccessible.
  // Products/customers/billing records are retained for audit/GST compliance.
  server.delete('/me', async (request, reply) => {
    const retailerId = request.retailerId;

    const existing = await prisma.retailer.findUnique({
      where: { id: retailerId, deleted_at: null },
    });
    if (!existing) throw notFound('Retailer');

    // Fetch collections before archiving for vault snapshots
    const collectionsBeforeDelete = await prisma.collection.findMany({
      where: { retailer_id: retailerId, deleted_at: null },
    });

    // Soft-delete retailer + archive all collections + deactivate staff
    await Promise.all([
      prisma.retailer.update({
        where: { id: retailerId },
        data: { deleted_at: new Date() },
      }),
      prisma.collection.updateMany({
        where: { retailer_id: retailerId, deleted_at: null },
        data: { deleted_at: new Date(), status: 'ARCHIVED' },
      }),
      prisma.staff.updateMany({
        where: { retailer_id: retailerId, is_active: true },
        data: { is_active: false },
      }),
    ]);

    // F-016: Vault snapshot of the deleted retailer (fire-and-forget)
    vaultDelete({
      source_table: 'retailers',
      source_id: retailerId,
      retailer_id: retailerId,
      payload: existing as unknown as Record<string, unknown>,
      delete_reason: 'user_delete',
      deleted_by: retailerId,
    });
    // F-016: Vault snapshot of each archived collection (fire-and-forget)
    Promise.allSettled(
      collectionsBeforeDelete.map((c) =>
        vaultDelete({
          source_table: 'collections',
          source_id: c.id,
          retailer_id: retailerId,
          payload: c as unknown as Record<string, unknown>,
          delete_reason: 'user_delete',
          deleted_by: retailerId,
        }),
      ),
    );

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'delete',
        resource_type: 'Retailer',
        resource_id: retailerId,
        metadata: { soft_delete: true },
        ip_address: request.ip,
      },
    });

    return reply.status(204).send();
  });
};
