// retailers-social-schedule.ts — F-043 Social Post Scheduler: plan builder +
// calendar API (Task 1). Nothing here publishes; the publish tick is Task 2.
//
// Routes (all under /v1/retailers/me/social/schedule):
//   GET    /plans                     list plans + post counts           (owner, manager)
//   POST   /plans                     create plan + build DRAFT calendar (owner)
//   GET    /plans/:id                 calendar: posts + slides           (owner, manager)
//   POST   /plans/:id/confirm         DRAFT → ACTIVE, posts → READY      (owner)
//   PATCH  /items/:id                 slide: swap product / other photo  (owner)
//   DELETE /items/:id                 slide: remove                      (owner)
//   PATCH  /posts/:id                 caption edit, skip, retry          (owner, manager)
//   PATCH  /plan-state/:id            pause / resume                     (owner, manager)
//
// Access (docs/tasks/pending/post-scheduler.md §8.3): manager gets the GET
// prefix, `posts` and `plan-state` only — see MANAGER_ALLOWED_ROUTES in
// plugins/auth.ts. Everything else is owner-only by default-deny. Salesperson
// gets nothing. Reconnect Meta is untouched (owner-only, other module).
//
// Gating: `SOCIAL_SCHEDULER` fails CLOSED (hasFeature) at plan create, confirm
// and resume; the publish tick re-checks at publish time (Task 2).
import { publicUrl } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { SCHEDULE_COVER_STYLES, SCHEDULE_SLIDE_TEMPLATES } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hasFeature } from '../../../lib/features.js';
import {
  MAX_SLIDES,
  addDays,
  buildSchedule,
  istDateString,
} from '../../../lib/post-schedule-builder.js';
import { resolvePostTemplate } from '../../../lib/post-template-placeholders.js';
import { effectiveLimit, getQuotaStatus, periodStart } from '../../../lib/quota.js';
import { isRealOwner } from '../../../plugins/auth.js';
import {
  AppError,
  featureUnavailable,
  forbidden,
  notFound,
  planLimitExceeded,
  validationError,
} from '../../../plugins/error-handler.js';

const DAY_MS = 86_400_000;
const RECENT_POST_DAYS = 14; // "skip posted within N days"
const EDITABLE = ['DRAFT', 'READY', 'FAILED', 'MISSED'] as const;
const HORIZON_DAYS = { '1W': 7, '2W': 14, '1M': 30 } as const;

const rangeSchema = z
  .object({
    min: z.number().int().min(1).max(MAX_SLIDES),
    max: z.number().int().min(1).max(MAX_SLIDES),
  })
  .refine((r) => r.min <= r.max, 'min must be ≤ max');

const createPlanSchema = z
  .object({
    social_account_id: z.string().min(1),
    post_type: z.enum(['CAROUSEL', 'SINGLE_PRODUCT']).default('CAROUSEL'),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    // keyed by weekday '0'..'6'; every selected weekday needs a range
    batch_ranges: z.record(z.string().regex(/^[0-6]$/), rangeSchema),
    post_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    source: z.enum(['NEWEST', 'CATEGORY', 'MANUAL']).default('NEWEST'),
    category: z.string().min(1).max(80).optional(),
    product_ids: z.array(z.string()).max(310).optional(),
    cover_style: z.enum(SCHEDULE_COVER_STYLES).nullable().optional(),
    rotation_pool: z.array(z.enum(SCHEDULE_SLIDE_TEMPLATES)).max(10).default([]),
    horizon: z.enum(['1W', '2W', '1M']),
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .refine((b) => b.weekdays.every((w) => b.batch_ranges[String(w)]), {
    message: 'Every selected weekday needs a batch range',
  })
  .refine((b) => b.source !== 'CATEGORY' || !!b.category, { message: 'category is required' })
  .refine((b) => b.source !== 'MANUAL' || (b.product_ids?.length ?? 0) > 0, {
    message: 'product_ids is required',
  });

const patchPostSchema = z
  .object({
    caption: z.string().trim().min(1).max(2200).optional(),
    action: z.enum(['skip', 'retry']).optional(),
  })
  .refine((b) => b.caption !== undefined || b.action !== undefined, 'Nothing to change');

const patchItemSchema = z.union([
  z.object({ action: z.literal('swap'), product_id: z.string().min(1) }),
  z.object({ action: z.literal('photo'), photo_id: z.string().min(1) }),
]);

const planStateSchema = z.object({ status: z.enum(['PAUSED', 'ACTIVE']) });

// Calendar slides carry the product name + photo urls so the app can draw
// thumbnails without a second round-trip per slide.
const ITEMS_WITH_PRODUCT = {
  orderBy: { position: 'asc' as const },
  include: {
    product: {
      select: {
        name: true,
        photos: { select: { id: true, url: true, is_primary: true } },
      },
    },
  },
};

const conflict = (msg: string) => new AppError('CONFLICT', msg, 409);

function defaultCaption(
  names: string[],
  price: number | null,
  category: string | null,
  shop: string,
) {
  const single = names.length === 1;
  return resolvePostTemplate(
    single
      ? 'New in: {product_names} — ₹{price} in {category} at {store_name}'
      : 'New in: {product_names} at {store_name}',
    { productNames: names, pricePaise: single ? price : null, category, storeName: shop },
  ).slice(0, 2200);
}

export const retailersSocialScheduleRoutes: FastifyPluginAsync = async (server) => {
  const owner = (request: Parameters<typeof isRealOwner>[0], what: string) => {
    if (!isRealOwner(request)) throw forbidden(`Only the shop owner can ${what}`);
  };

  // Active/paused plan count for one platform vs the plan's `ACTIVE_SCHEDULE_PLAN`
  // limit (-1 / unconfigured = unlimited). A live count, not a usage counter.
  async function assertPlanSlot(
    retailerId: string,
    platform: 'FACEBOOK' | 'INSTAGRAM',
    exceptId?: string,
  ) {
    const eff = await effectiveLimit(retailerId, 'ACTIVE_SCHEDULE_PLAN');
    if (!eff || eff.limit === -1) return;
    const live = await prisma.postSchedulePlan.count({
      where: {
        retailer_id: retailerId,
        platform,
        status: { in: ['ACTIVE', 'PAUSED'] },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (live >= eff.limit) throw planLimitExceeded('active scheduling plans');
  }

  // ── list ───────────────────────────────────────────────────────
  server.get('/me/social/schedule/plans', async (request) => {
    const plans = await prisma.postSchedulePlan.findMany({
      where: { retailer_id: request.retailerId, status: { not: 'ENDED' } },
      orderBy: { created_at: 'desc' },
      include: { _count: { select: { posts: true } } },
    });
    return { data: plans };
  });

  // ── status card (§4a) — derived on every load, nothing stored ──
  // Owner + manager read the same payload; the app hides Reconnect for managers.
  server.get('/me/social/schedule/status', async (request) => {
    const retailerId = request.retailerId;
    const now = new Date();
    const [accounts, plans, nextPost, failures, eff, studio, planCap] = await Promise.all([
      prisma.socialAccount.findMany({
        // inactive account + live plan stays visible: show why it paused + Reconnect
        where: {
          retailer_id: retailerId,
          OR: [
            { is_active: true },
            { schedule_plans: { some: { status: { in: ['ACTIVE', 'PAUSED'] } } } },
          ],
        },
        select: {
          id: true,
          platform: true,
          platform_account_name: true,
          is_active: true,
          token_expires_at: true,
        },
      }),
      prisma.postSchedulePlan.findMany({
        where: { retailer_id: retailerId, status: { in: ['ACTIVE', 'PAUSED'] } },
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          social_account_id: true,
          status: true,
          pause_reason: true,
          post_time: true,
        },
      }),
      prisma.scheduledPost.findMany({
        where: { retailer_id: retailerId, status: 'READY', plan: { status: 'ACTIVE' } },
        orderBy: { scheduled_at: 'asc' },
        take: 20,
        select: {
          id: true,
          plan_id: true,
          scheduled_at: true,
          _count: { select: { items: true } },
        },
      }),
      prisma.scheduledPost.findMany({
        where: {
          retailer_id: retailerId,
          status: { in: ['FAILED', 'MISSED'] },
          plan: { status: { in: ['ACTIVE', 'PAUSED'] } },
        },
        orderBy: { scheduled_at: 'desc' },
        take: 5,
        select: {
          id: true,
          plan_id: true,
          status: true,
          scheduled_at: true,
          error: true,
          plan: { select: { platform: true } },
        },
      }),
      effectiveLimit(retailerId, 'SCHEDULED_POST'),
      getQuotaStatus(retailerId, 'STUDIO_SHOOT'),
      effectiveLimit(retailerId, 'ACTIVE_SCHEDULE_PLAN'),
    ]);

    // Own the allowance math: getQuotaStatus turns a -1 (unlimited) row into a
    // tier default, which is right for Studio but wrong for this seeded -1.
    const unlimited = !eff || eff.limit === -1;
    const counter = await prisma.usageCounter.findUnique({
      where: {
        retailer_id_resource_type_period_start: {
          retailer_id: retailerId,
          resource_type: 'SCHEDULED_POST',
          period_start: periodStart(eff?.period ?? 'MONTH'),
        },
      },
    });

    const tokenOf = (exp: Date | null) => {
      if (!exp) return { state: 'OK' as const, days_left: null };
      const days = Math.ceil((exp.getTime() - now.getTime()) / DAY_MS);
      if (days <= 0) return { state: 'EXPIRED' as const, days_left: 0 };
      return { state: days <= 7 ? ('EXPIRING' as const) : ('OK' as const), days_left: days };
    };

    const platforms = accounts.map((a) => {
      const plan = plans.find((p) => p.social_account_id === a.id) ?? null;
      const next = plan ? nextPost.find((p) => p.plan_id === plan.id) : undefined;
      return {
        account_id: a.id,
        platform: a.platform,
        account_name: a.platform_account_name,
        token: tokenOf(a.is_active ? a.token_expires_at : new Date(0)), // inactive reads EXPIRED
        plan: plan
          ? {
              id: plan.id,
              status: plan.status,
              pause_reason: plan.pause_reason,
              post_time: plan.post_time,
            }
          : null,
        next_post: next
          ? { id: next.id, scheduled_at: next.scheduled_at, slides: next._count.items }
          : null,
      };
    });

    return {
      data: {
        platforms,
        allowance: {
          used: counter?.count ?? 0,
          limit: unlimited ? null : eff.limit,
          period: eff?.period ?? 'MONTH',
        },
        active_plans: {
          count: plans.length,
          max: planCap && planCap.limit !== -1 ? planCap.limit : null,
        },
        studio_shoots: {
          included: studio.unlimited || studio.limit > 0,
          unlimited: studio.unlimited,
          used: studio.used,
          limit: studio.limit,
          remaining: studio.remaining,
        },
        failures: failures.map((f) => ({
          id: f.id,
          plan_id: f.plan_id,
          platform: f.plan.platform,
          status: f.status,
          scheduled_at: f.scheduled_at,
          reason: f.error,
        })),
        needs_attention:
          plans.some((p) => p.status === 'PAUSED') ||
          failures.length > 0 ||
          platforms.some((p) => p.plan && p.token.state !== 'OK'),
      },
    };
  });

  // ── calendar ───────────────────────────────────────────────────
  server.get('/me/social/schedule/plans/:id', async (request) => {
    const { id } = request.params as { id: string };
    const plan = await prisma.postSchedulePlan.findFirst({
      where: { id, retailer_id: request.retailerId },
      include: {
        posts: {
          orderBy: { scheduled_at: 'asc' },
          include: { items: ITEMS_WITH_PRODUCT },
        },
      },
    });
    if (!plan) throw notFound('Plan');
    // Rendered previews: the key is storage-internal, the app needs a URL.
    const posts = plan.posts.map((post) => ({
      ...post,
      items: post.items.map((i) => ({
        ...i,
        resolved_image_url: i.resolved_image_key ? publicUrl(i.resolved_image_key) : null,
      })),
    }));
    return { data: { ...plan, posts } };
  });

  // ── create plan + build DRAFT calendar ─────────────────────────
  server.post('/me/social/schedule/plans', async (request) => {
    owner(request, 'create a posting plan');
    const parsed = createPlanSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? 'Invalid plan');
    const body = parsed.data;
    const retailerId = request.retailerId;

    // Fails closed: no plan_features row = OFF.
    if (!(await hasFeature(retailerId, 'SOCIAL_SCHEDULER'))) {
      throw featureUnavailable('Post scheduling');
    }

    const account = await prisma.socialAccount.findFirst({
      where: { id: body.social_account_id, retailer_id: retailerId, is_active: true },
    });
    if (!account) throw validationError('That social account is not connected');
    await assertPlanSlot(retailerId, account.platform);

    // One draft per account: starting over ends the previous draft.
    const stale = await prisma.postSchedulePlan.findMany({
      where: { retailer_id: retailerId, social_account_id: account.id, status: 'DRAFT' },
      select: { id: true },
    });
    if (stale.length > 0) {
      const ids = stale.map((p) => p.id);
      await prisma.$transaction([
        prisma.scheduledPost.updateMany({
          where: { plan_id: { in: ids }, retailer_id: retailerId },
          data: { status: 'SKIPPED' },
        }),
        prisma.postSchedulePlan.updateMany({
          where: { id: { in: ids }, retailer_id: retailerId },
          data: { status: 'ENDED' },
        }),
      ]);
    }

    // ── product pool: newest unposted in-stock, minus recently posted / already queued
    const since = new Date(Date.now() - RECENT_POST_DAYS * DAY_MS);
    const [posted, queued, retailer] = await Promise.all([
      prisma.socialPost.findMany({
        where: {
          retailer_id: retailerId,
          platform: account.platform,
          status: 'POSTED',
          created_at: { gte: since },
        },
        select: { product_ids: true },
      }),
      prisma.scheduledPostItem.findMany({
        where: {
          retailer_id: retailerId,
          scheduled_post: {
            status: { in: ['DRAFT', 'READY', 'PUBLISHING'] },
            plan: { platform: account.platform },
          },
        },
        select: { product_id: true },
      }),
      prisma.retailer.findUniqueOrThrow({
        where: { id: retailerId },
        select: { shop_name: true },
      }),
    ]);
    const exclude = new Set([
      ...posted.flatMap((p) => p.product_ids),
      ...queued.map((q) => q.product_id),
    ]);

    const rows = await prisma.product.findMany({
      where: {
        retailer_id: retailerId,
        deleted_at: null,
        status: 'AVAILABLE',
        photos: { some: { retailer_id: retailerId } },
        ...(body.source === 'CATEGORY' ? { category: body.category } : {}),
        ...(body.source === 'MANUAL' ? { id: { in: body.product_ids } } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: 300,
      select: {
        id: true,
        name: true,
        category: true,
        price_min: true,
        photos: {
          where: { retailer_id: retailerId },
          select: { id: true, is_primary: true },
        },
      },
    });
    let pool = rows.filter((r) => !exclude.has(r.id));
    if (body.source === 'MANUAL') {
      const order = new Map((body.product_ids ?? []).map((id, i) => [id, i]));
      pool = [...pool].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }
    const byId = new Map(pool.map((p) => [p.id, p]));

    const startsOn = body.start_date ?? addDays(istDateString(new Date()), 1);
    if (startsOn < istDateString(new Date())) throw validationError('Start date is in the past');

    const ranges = Object.fromEntries(
      Object.entries(body.batch_ranges).map(([k, v]) => [Number(k), v]),
    );
    const planned = buildSchedule({
      products: pool.map((p) => ({ id: p.id, category: p.category })),
      weekdays: body.weekdays,
      ranges,
      post_time: body.post_time,
      starts_on: startsOn,
      horizon_days: HORIZON_DAYS[body.horizon],
      single: body.post_type === 'SINGLE_PRODUCT',
    });
    if (planned.length === 0) throw validationError('No in-stock products with photos to schedule');

    const plan = await prisma.$transaction(async (tx) => {
      const created = await tx.postSchedulePlan.create({
        data: {
          retailer_id: retailerId,
          social_account_id: account.id,
          platform: account.platform,
          post_type: body.post_type,
          weekdays: body.weekdays,
          post_time: body.post_time,
          batch_ranges: body.batch_ranges,
          source: body.source,
          source_category: body.category ?? null,
          source_product_ids: body.product_ids ?? [],
          cover_style: body.cover_style ?? null,
          rotation_pool: body.rotation_pool,
          horizon_days: HORIZON_DAYS[body.horizon],
          starts_on: startsOn,
          status: 'DRAFT',
        },
      });
      for (const post of planned) {
        const items = post.product_ids.map((id) => byId.get(id)).filter((p) => !!p);
        const first = items[0];
        await tx.scheduledPost.create({
          data: {
            plan_id: created.id,
            retailer_id: retailerId,
            scheduled_at: post.scheduled_at,
            caption: defaultCaption(
              items.map((p) => p?.name ?? 'New arrival'),
              first?.price_min ?? null,
              first?.category ?? null,
              retailer.shop_name,
            ),
            status: 'DRAFT',
            client_post_id: crypto.randomUUID(),
            items: {
              create: items.map((p, position) => ({
                retailer_id: retailerId,
                product_id: p?.id as string,
                position,
                image_level: 'ORIGINAL' as const,
                photo_id: (p?.photos.find((ph) => ph.is_primary) ?? p?.photos[0])?.id ?? null,
              })),
            },
          },
        });
      }
      return created;
    });

    const full = await prisma.postSchedulePlan.findFirstOrThrow({
      where: { id: plan.id, retailer_id: retailerId },
      include: {
        posts: {
          orderBy: { scheduled_at: 'asc' },
          include: { items: ITEMS_WITH_PRODUCT },
        },
      },
    });
    return { data: full };
  });

  // ── confirm ────────────────────────────────────────────────────
  server.post('/me/social/schedule/plans/:id/confirm', async (request) => {
    owner(request, 'confirm a posting plan');
    const { id } = request.params as { id: string };
    const retailerId = request.retailerId;

    const plan = await prisma.postSchedulePlan.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!plan) throw notFound('Plan');
    if (plan.status !== 'DRAFT') throw conflict('This plan is already confirmed');
    if (!(await hasFeature(retailerId, 'SOCIAL_SCHEDULER'))) {
      throw featureUnavailable('Post scheduling');
    }
    const account = await prisma.socialAccount.findFirst({
      where: { id: plan.social_account_id, retailer_id: retailerId, is_active: true },
      select: { id: true },
    });
    if (!account) throw validationError('Reconnect your social account before confirming');
    await assertPlanSlot(retailerId, plan.platform, plan.id);

    // Slots that are already in the past by confirm time can never post: skip them.
    await prisma.scheduledPost.updateMany({
      where: {
        plan_id: plan.id,
        retailer_id: retailerId,
        status: 'DRAFT',
        scheduled_at: { lt: new Date() },
      },
      data: { status: 'SKIPPED' },
    });
    const [, flipped] = await prisma.$transaction([
      prisma.postSchedulePlan.updateMany({
        where: { id: plan.id, retailer_id: retailerId, status: 'DRAFT' },
        data: { status: 'ACTIVE', pause_reason: null },
      }),
      prisma.scheduledPost.updateMany({
        where: { plan_id: plan.id, retailer_id: retailerId, status: 'DRAFT' },
        data: { status: 'READY' },
      }),
    ]);
    if (flipped.count === 0)
      throw validationError('Nothing left to schedule — every slot is in the past');

    const [original, templated, eff] = await Promise.all([
      prisma.scheduledPostItem.count({
        where: {
          retailer_id: retailerId,
          image_level: 'ORIGINAL',
          scheduled_post: { plan_id: plan.id, status: 'READY' },
        },
      }),
      prisma.scheduledPostItem.count({
        where: {
          retailer_id: retailerId,
          image_level: 'TEMPLATE',
          scheduled_post: { plan_id: plan.id, status: 'READY' },
        },
      }),
      effectiveLimit(retailerId, 'SCHEDULED_POST'),
    ]);
    return {
      data: {
        plan_id: plan.id,
        posts: flipped.count,
        slides_original: original,
        slides_templated: templated,
        // display only here — hard enforcement is at publish time (Task 2)
        monthly_limit: eff && eff.limit !== -1 ? eff.limit : null,
      },
    };
  });

  // ── end plan (owner) ───────────────────────────────────────────
  // Without this a plan could never leave ACTIVE/PAUSED, so a per-platform plan
  // limit of 1 would lock the retailer out of ever replacing it.
  server.post('/me/social/schedule/plans/:id/end', async (request) => {
    owner(request, 'end a posting plan');
    const { id } = request.params as { id: string };
    const retailerId = request.retailerId;
    const plan = await prisma.postSchedulePlan.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!plan) throw notFound('Plan');
    if (plan.status === 'ENDED') throw conflict('This plan has already ended');
    await prisma.$transaction([
      // never touch PUBLISHING (a tick owns it) or terminal rows
      prisma.scheduledPost.updateMany({
        where: { plan_id: plan.id, retailer_id: retailerId, status: { in: [...EDITABLE] } },
        data: { status: 'SKIPPED' },
      }),
      prisma.postSchedulePlan.updateMany({
        where: { id: plan.id, retailer_id: retailerId },
        data: { status: 'ENDED', pause_reason: null },
      }),
    ]);
    return { data: { ended: true } };
  });

  // ── slide edit: swap product / other photo ─────────────────────
  server.patch('/me/social/schedule/items/:id', async (request) => {
    owner(request, 'edit the calendar');
    const { id } = request.params as { id: string };
    const parsed = patchItemSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('Invalid slide change');
    const retailerId = request.retailerId;

    const item = await prisma.scheduledPostItem.findFirst({
      where: { id, retailer_id: retailerId },
      include: { scheduled_post: { select: { id: true, status: true } } },
    });
    if (!item) throw notFound('Slide');
    if (!(EDITABLE as readonly string[]).includes(item.scheduled_post.status)) {
      throw conflict('This post can no longer be edited');
    }

    if (parsed.data.action === 'photo') {
      const photoId = parsed.data.photo_id;
      const photo = await prisma.productPhoto.findFirst({
        where: { id: photoId, product_id: item.product_id, retailer_id: retailerId },
        select: { id: true },
      });
      if (!photo) throw validationError('That photo does not belong to the product');
      const updated = await prisma.scheduledPostItem.update({
        where: { id: item.id },
        data: {
          photo_id: photo.id,
          image_level: 'ORIGINAL',
          template_id: null,
          resolved_image_key: null,
        },
      });
      return { data: updated };
    }

    const productId = parsed.data.product_id;
    const dup = await prisma.scheduledPostItem.findFirst({
      where: { scheduled_post_id: item.scheduled_post.id, product_id: productId },
      select: { id: true },
    });
    if (dup) throw validationError('That product is already in this post');
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        retailer_id: retailerId,
        deleted_at: null,
        status: 'AVAILABLE',
        photos: { some: { retailer_id: retailerId } },
      },
      select: {
        id: true,
        photos: { where: { retailer_id: retailerId }, select: { id: true, is_primary: true } },
      },
    });
    if (!product) throw validationError('That product is not available to post');
    const photo = product.photos.find((p) => p.is_primary) ?? product.photos[0];
    const updated = await prisma.scheduledPostItem.update({
      where: { id: item.id },
      data: {
        product_id: product.id,
        photo_id: photo?.id ?? null,
        image_level: 'ORIGINAL',
        template_id: null,
        resolved_image_key: null,
      },
    });
    return { data: updated };
  });

  // ── slide remove (hard delete of the join row — DELETE granted in 129) ──
  server.delete('/me/social/schedule/items/:id', async (request) => {
    owner(request, 'edit the calendar');
    const { id } = request.params as { id: string };
    const retailerId = request.retailerId;
    const item = await prisma.scheduledPostItem.findFirst({
      where: { id, retailer_id: retailerId },
      include: { scheduled_post: { select: { id: true, status: true } } },
    });
    if (!item) throw notFound('Slide');
    if (!(EDITABLE as readonly string[]).includes(item.scheduled_post.status)) {
      throw conflict('This post can no longer be edited');
    }
    const postId = item.scheduled_post.id;
    await prisma.$transaction(async (tx) => {
      await tx.scheduledPostItem.delete({ where: { id: item.id } });
      const rest = await tx.scheduledPostItem.findMany({
        where: { scheduled_post_id: postId, retailer_id: retailerId },
        orderBy: { position: 'asc' },
        select: { id: true },
      });
      if (rest.length === 0) {
        await tx.scheduledPost.updateMany({
          where: { id: postId, retailer_id: retailerId },
          data: { status: 'SKIPPED' },
        });
        return;
      }
      // Close the gap. Two-phase through the high range so the
      // (post, position) unique index is never violated mid-update.
      for (const [i, r] of rest.entries()) {
        await tx.scheduledPostItem.update({
          where: { id: r.id },
          data: { position: i + MAX_SLIDES },
        });
      }
      for (const [i, r] of rest.entries()) {
        await tx.scheduledPostItem.update({ where: { id: r.id }, data: { position: i } });
      }
    });
    return { data: { removed: true } };
  });

  // ── post: caption edit / skip / retry (manager allowed) ────────
  server.patch('/me/social/schedule/posts/:id', async (request) => {
    const { id } = request.params as { id: string };
    const parsed = patchPostSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? 'Invalid change');
    const { caption, action } = parsed.data;
    const retailerId = request.retailerId;

    const post = await prisma.scheduledPost.findFirst({ where: { id, retailer_id: retailerId } });
    if (!post) throw notFound('Post');
    if (!(EDITABLE as readonly string[]).includes(post.status)) {
      throw conflict('This post can no longer be changed');
    }
    if (action === 'retry' && post.status !== 'FAILED' && post.status !== 'MISSED') {
      throw conflict('Only a failed or missed post can be retried');
    }

    const data: Record<string, unknown> = {};
    if (caption !== undefined) data.caption = caption;
    if (action === 'skip') data.status = 'SKIPPED';
    if (action === 'retry') {
      data.status = 'READY';
      data.attempts = 0;
      data.error = null;
      // A past slot would be MISSED again on the next tick — re-queue it for now.
      if (post.scheduled_at < new Date()) data.scheduled_at = new Date();
    }

    // CAS on the status we read: a tick that claimed the row in between wins.
    const res = await prisma.scheduledPost.updateMany({
      where: { id: post.id, retailer_id: retailerId, status: post.status },
      data,
    });
    if (res.count === 0) throw conflict('This post just changed — refresh and try again');
    const fresh = await prisma.scheduledPost.findFirstOrThrow({
      where: { id: post.id, retailer_id: retailerId },
    });
    return { data: fresh };
  });

  // ── plan pause / resume (manager allowed) ──────────────────────
  server.patch('/me/social/schedule/plan-state/:id', async (request) => {
    const { id } = request.params as { id: string };
    const parsed = planStateSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('status must be PAUSED or ACTIVE');
    const retailerId = request.retailerId;

    const plan = await prisma.postSchedulePlan.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!plan) throw notFound('Plan');

    if (parsed.data.status === 'PAUSED') {
      if (plan.status !== 'ACTIVE') throw conflict('Only a running plan can be paused');
      const res = await prisma.postSchedulePlan.updateMany({
        where: { id: plan.id, retailer_id: retailerId, status: 'ACTIVE' },
        data: { status: 'PAUSED', pause_reason: 'Paused by you' },
      });
      if (res.count === 0) throw conflict('This plan just changed — refresh and try again');
    } else {
      if (plan.status !== 'PAUSED') throw conflict('Only a paused plan can be resumed');
      if (!(await hasFeature(retailerId, 'SOCIAL_SCHEDULER'))) {
        throw featureUnavailable('Post scheduling');
      }
      await assertPlanSlot(retailerId, plan.platform, plan.id);
      const res = await prisma.postSchedulePlan.updateMany({
        where: { id: plan.id, retailer_id: retailerId, status: 'PAUSED' },
        data: { status: 'ACTIVE', pause_reason: null },
      });
      if (res.count === 0) throw conflict('This plan just changed — refresh and try again');
    }
    const fresh = await prisma.postSchedulePlan.findFirstOrThrow({
      where: { id: plan.id, retailer_id: retailerId },
    });
    return { data: fresh };
  });
};
