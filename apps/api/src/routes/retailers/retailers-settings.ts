// Auto-split from retailers.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma, vaultDelete } from '@kanchuki/db';
import type { QuotaPeriod, QuotaResourceType } from '@kanchuki/db';
import { generateCollectionSlug } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hardDeleteRetailer } from '../../jobs/purge-retailer-now.js';
import { buildStoreUrl } from '../../lib/store-urls.js';
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
        demo_plan: z.boolean().optional(),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    // When demo_plan is set, grant PRO-level access with TRIAL status — no
    // payment required. This lets new retailers explore every feature during
    // onboarding before committing to a paid plan.
    const demoPlanData = body.data.demo_plan
      ? {
          plan: 'PRO' as const,
          plan_status: 'TRIAL' as const,
          max_products: 999999,
          max_customers: 999999,
          try_on_credits: 500,
        }
      : {};

    const updated = await prisma.retailer.update({
      where: { id: request.retailerId },
      data: {
        onboarding_step: body.data.step,
        ...(body.data.completed === true ? { onboarding_completed: true } : {}),
        ...demoPlanData,
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
        metadata: {
          onboarding_step: body.data.step,
          completed: body.data.completed ?? false,
          ...(body.data.demo_plan ? { demo_plan_activated: true } : {}),
        },
        ip_address: request.ip,
      },
    });

    return { data: updated };
  });

  // ─── POST /retailers/me/qr-slug ─────────────────────────────────
  // Get-or-create the stable slug the QR code encodes ({WEB_URL}/{slug}).
  server.post('/me/qr-slug', async (request) => {
    const existing = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: { public_slug: true, shop_name: true },
    });
    if (!existing) throw notFound('Retailer');

    if (existing.public_slug) {
      return {
        data: {
          public_slug: existing.public_slug,
          profile_url: buildStoreUrl(existing.public_slug),
        },
      };
    }

    // Bounded collision retry — same guard as the rename path in
    // retailers-profile.ts: soft-deleted retailers keep their slug, so a
    // pathological name must never spin forever (timestamp fallback after
    // 8 attempts, outside the 4-char random-suffix space).
    const base = existing.shop_name;
    let slug: string;
    for (let attempt = 0; ; attempt++) {
      slug = generateCollectionSlug(base);
      if (attempt >= 8) {
        slug = `${slug}-${Date.now().toString(36)}`;
        break;
      }
      if (!(await prisma.retailer.findUnique({ where: { public_slug: slug } }))) break;
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
        // slug was just assigned to public_slug (schema type is nullable, so
        // the select return is string | null — use the local to avoid the cast).
        profile_url: buildStoreUrl(slug),
      },
    };
  });

  // ─── DELETE /retailers/me/qr-slug ───────────────────────────────
  // Remove the store QR: clears public_slug so {WEB_URL}/{slug} (and any
  // printed QR / shared link) stops resolving. The mobile QR screen does
  // NOT call this directly — the retailer must type their shop name as
  // verification first (see store-profile.tsx) per the user's "don't
  // delete directly" requirement. Idempotent: no slug → still 204.
  server.delete('/me/qr-slug', async (request, reply) => {
    const existing = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: { public_slug: true },
    });
    if (!existing) throw notFound('Retailer');

    if (!existing.public_slug) {
      return reply.status(204).send(); // nothing to delete
    }

    const deletedSlug = existing.public_slug;
    await prisma.retailer.update({
      where: { id: request.retailerId },
      data: { public_slug: null },
      select: { public_slug: true },
    });
    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'delete',
        resource_type: 'Retailer',
        resource_id: request.retailerId,
        metadata: { public_slug_deleted: true, slug: deletedSlug },
        ip_address: request.ip,
      },
    });

    return reply.status(204).send();
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
  // Hard-delete the retailer and ALL related data (products, customers,
  // collections, staff, orders, marketing data — everything). The phone
  // number is released so the retailer can sign up fresh.
  server.delete('/me', async (request, reply) => {
    const retailerId = request.retailerId;

    const existing = await prisma.retailer.findUnique({
      where: { id: retailerId, deleted_at: null },
    });
    if (!existing) throw notFound('Retailer');

    // Vault snapshot before hard-delete (fire-and-forget, best-effort)
    vaultDelete({
      source_table: 'retailers',
      source_id: retailerId,
      retailer_id: retailerId,
      payload: existing as unknown as Record<string, unknown>,
      delete_reason: 'user_self_delete',
      deleted_by: retailerId,
    });

    // Hard-delete: removes retailer + every FK-linked row in one transaction.
    // Uses the scoped purge role (SECURITY §19) with the allow_hard_delete
    // guardrail bypass.
    await hardDeleteRetailer(retailerId);

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'HARD_DELETE',
        resource_type: 'Retailer',
        resource_id: retailerId,
        metadata: { hard_delete: true, phone: existing.phone },
        ip_address: request.ip,
      },
    });

    return reply.status(204).send();
  });
};
