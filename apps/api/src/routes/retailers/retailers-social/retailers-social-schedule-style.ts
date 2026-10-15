// retailers-social-schedule-style.ts — F-043 Task 4: image templates for the
// scheduler calendar. Split from retailers-social-schedule.ts (route-size guard).
//
// Routes (all under /v1/retailers/me/social/schedule):
//   GET  /templates              registry for the picker               (owner, manager)
//   POST /items/:id/style        style ONE slide now (preview render)  (owner)
//   POST /posts/:id/style        style every slide of one post         (owner)
//   POST /plans/:id/style        style every editable slide of a plan  (owner)
//   PATCH /plans/:id/design      cover style + rotation pool           (owner)
//
// `template` is a template id, `'rotate'` (round-robin over the plan's
// rotation pool, D3) or `null` (back to the original photo). Bulk routes only
// write the choice — the image itself is rendered by the publish tick, so
// "apply to all" is instant and the price on the strip is the price at post
// time. Owner-only by MANAGER_ALLOWED_ROUTES default-deny (§8.3).
import { publicUrl } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { SCHEDULE_COVER_STYLES, SCHEDULE_SLIDE_TEMPLATES } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { styleItemNow } from '../../../lib/schedule-render.js';
import { isRealOwner } from '../../../plugins/auth.js';
import { AppError, forbidden, notFound, validationError } from '../../../plugins/error-handler.js';

const EDITABLE = ['DRAFT', 'READY', 'FAILED', 'MISSED'] as const;
const LABELS: Record<string, string> = {
  white_price: 'White + price',
  new_arrival: 'New Arrival badge',
  festival_frame: 'Festival frame',
  logo_corner: 'Store logo',
  collage_cover: 'Collage cover',
};

type Slide = (typeof SCHEDULE_SLIDE_TEMPLATES)[number];

const styleSchema = z.object({
  template: z.union([z.enum(SCHEDULE_SLIDE_TEMPLATES), z.literal('rotate'), z.null()]),
});
const designSchema = z.object({
  cover_style: z.enum(SCHEDULE_COVER_STYLES).nullable().optional(),
  rotation_pool: z.array(z.enum(SCHEDULE_SLIDE_TEMPLATES)).max(10).optional(),
});

const conflict = (msg: string) => new AppError('CONFLICT', msg, 409);

export const retailersSocialScheduleStyleRoutes: FastifyPluginAsync = async (server) => {
  const owner = (request: Parameters<typeof isRealOwner>[0]) => {
    if (!isRealOwner(request)) throw forbidden('Only the shop owner can style posts');
  };

  server.get('/me/social/schedule/templates', async () => ({
    data: {
      slide: SCHEDULE_SLIDE_TEMPLATES.map((id) => ({ id, label: LABELS[id] })),
      cover: SCHEDULE_COVER_STYLES.map((id) => ({ id, label: LABELS[id] })),
    },
  }));

  // ── one slide: render now so the retailer sees the result ──────
  server.post('/me/social/schedule/items/:id/style', async (request) => {
    owner(request);
    const { id } = request.params as { id: string };
    const parsed = styleSchema.safeParse(request.body);
    if (!parsed.success || parsed.data.template === 'rotate') {
      throw validationError('Pick a template, or none to use the original photo');
    }
    const { template } = parsed.data;
    const retailerId = request.retailerId;

    const item = await prisma.scheduledPostItem.findFirst({
      where: { id, retailer_id: retailerId },
      include: { scheduled_post: { select: { id: true, status: true, scheduled_at: true } } },
    });
    if (!item) throw notFound('Slide');
    if (!(EDITABLE as readonly string[]).includes(item.scheduled_post.status)) {
      throw conflict('This post can no longer be edited');
    }

    if (template === null) {
      await prisma.scheduledPostItem.updateMany({
        where: { id: item.id, retailer_id: retailerId },
        data: { image_level: 'ORIGINAL', template_id: null, resolved_image_key: null },
      });
      return { data: { template: null, resolved_image_url: null } };
    }

    try {
      const key = await styleItemNow(
        retailerId,
        item.scheduled_post.id,
        item,
        template,
        item.scheduled_post.scheduled_at,
      );
      return { data: { template, resolved_image_url: publicUrl(key) } };
    } catch (err) {
      console.error('[schedule-style] render failed', item.id, err);
      throw validationError('Could not apply that style to this photo. Try another.');
    }
  });

  // Assign `template` (or round-robin from the pool) to a set of items, lazily.
  async function applyToItems(
    retailerId: string,
    items: { id: string }[],
    template: Slide | 'rotate' | null,
    pool: string[],
  ) {
    if (items.length === 0) return 0;
    if (template === 'rotate') {
      const ids = pool.filter((p): p is Slide =>
        (SCHEDULE_SLIDE_TEMPLATES as readonly string[]).includes(p),
      );
      if (ids.length === 0) {
        throw validationError('Add templates to the rotation pool first');
      }
      await prisma.$transaction(
        items.map((it, n) =>
          prisma.scheduledPostItem.updateMany({
            where: { id: it.id, retailer_id: retailerId },
            data: {
              image_level: 'TEMPLATE',
              template_id: ids[n % ids.length] as string,
              resolved_image_key: null,
            },
          }),
        ),
      );
      return items.length;
    }
    await prisma.scheduledPostItem.updateMany({
      where: { id: { in: items.map((i) => i.id) }, retailer_id: retailerId },
      data:
        template === null
          ? { image_level: 'ORIGINAL', template_id: null, resolved_image_key: null }
          : { image_level: 'TEMPLATE', template_id: template, resolved_image_key: null },
    });
    return items.length;
  }

  // ── one post ───────────────────────────────────────────────────
  server.post('/me/social/schedule/posts/:id/style', async (request) => {
    owner(request);
    const { id } = request.params as { id: string };
    const parsed = styleSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('Invalid style');
    const retailerId = request.retailerId;

    const post = await prisma.scheduledPost.findFirst({
      where: { id, retailer_id: retailerId },
      include: { plan: { select: { rotation_pool: true } }, items: { select: { id: true } } },
    });
    if (!post) throw notFound('Post');
    if (!(EDITABLE as readonly string[]).includes(post.status)) {
      throw conflict('This post can no longer be edited');
    }
    const pool = Array.isArray(post.plan.rotation_pool)
      ? (post.plan.rotation_pool as string[])
      : [];
    const count = await applyToItems(retailerId, post.items, parsed.data.template, pool);
    return { data: { styled: count } };
  });

  // ── whole plan ─────────────────────────────────────────────────
  server.post('/me/social/schedule/plans/:id/style', async (request) => {
    owner(request);
    const { id } = request.params as { id: string };
    const parsed = styleSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('Invalid style');
    const retailerId = request.retailerId;

    const plan = await prisma.postSchedulePlan.findFirst({
      where: { id, retailer_id: retailerId },
      select: { id: true, status: true, rotation_pool: true },
    });
    if (!plan) throw notFound('Plan');
    if (plan.status === 'ENDED') throw conflict('This plan has ended');
    const items = await prisma.scheduledPostItem.findMany({
      where: {
        retailer_id: retailerId,
        scheduled_post: { plan_id: plan.id, status: { in: [...EDITABLE] } },
      },
      orderBy: [{ scheduled_post_id: 'asc' }, { position: 'asc' }],
      select: { id: true },
    });
    const pool = Array.isArray(plan.rotation_pool) ? (plan.rotation_pool as string[]) : [];
    const count = await applyToItems(retailerId, items, parsed.data.template, pool);
    return { data: { styled: count } };
  });

  // ── cover style + rotation pool on an existing plan ────────────
  server.patch('/me/social/schedule/plans/:id/design', async (request) => {
    owner(request);
    const { id } = request.params as { id: string };
    const parsed = designSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('Invalid cover style or template pool');
    const { cover_style, rotation_pool } = parsed.data;
    if (cover_style === undefined && rotation_pool === undefined) {
      throw validationError('Nothing to change');
    }
    const retailerId = request.retailerId;
    const res = await prisma.postSchedulePlan.updateMany({
      where: { id, retailer_id: retailerId, status: { in: ['DRAFT', 'ACTIVE', 'PAUSED'] } },
      data: {
        ...(cover_style !== undefined ? { cover_style } : {}),
        ...(rotation_pool !== undefined ? { rotation_pool } : {}),
      },
    });
    if (res.count === 0) throw notFound('Plan');
    return { data: { cover_style: cover_style ?? null, rotation_pool: rotation_pool ?? null } };
  });
};
