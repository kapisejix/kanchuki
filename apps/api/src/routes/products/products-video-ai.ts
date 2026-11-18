// F-034 T5 — AI promo video (Fal image-to-video). Spec: docs/tasks/pending/ai-promo-video.md §6.
//
// POST → 202 {job_id} → app polls GET /:id/promo-video/:jobId. The clip is made by
// jobs/generate-promo-video.ts on the studio queue. Every gate below runs BEFORE the
// AI_VIDEO slot is reserved: each clip is a real USD charge at Fal.
// Quota: AI_VIDEO is METERED (no plan_limits row = limit 0), reserved at enqueue keyed by
// job_id and handed back by the job unless a video row was made (RC-102).
import { prisma } from '@kanchuki/db';
import { productProfile } from '@kanchuki/shared';
import { createId } from '@paralleldrive/cuid2';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addPromoVideoJob } from '../../jobs/index.js';
import { type VideoAspect, videoModelForPlan } from '../../lib/fal-video.js';
import { hasFeature } from '../../lib/features.js';
import { getQuotaStatus, refundJobQuota, reserveJobQuota } from '../../lib/quota.js';
import {
  MAX_VIDEOS_PER_PRODUCT,
  claimPromoVideoSlot,
  getStudioJobStatus,
  releasePromoVideoSlot,
} from '../../lib/studio-shoot.js';
import { isDelegate } from '../../plugins/auth.js';
import {
  AppError,
  featureUnavailable,
  forbidden,
  notFound,
  validationError,
} from '../../plugins/error-handler.js';

/** D4: same cap as growth-videos.ts (uploads + Ken Burns + AI clips together). */
const ASPECTS = ['9:16', '4:5', '1:1'] as const;
const SECONDS = [5, 6, 8] as const;

const BodySchema = z.object({
  photo_id: z.string().min(1),
  style_slug: z.string().min(1),
  aspect: z.enum(ASPECTS).optional(),
});

/** Nearest duration the clip pipeline supports (generateImageToVideo takes 5 | 6 | 8). */
function clipSeconds(styleSec: number | null): 5 | 6 | 8 {
  const want = styleSec ?? 5;
  return SECONDS.reduce<5 | 6 | 8>(
    (best, s) => (Math.abs(s - want) < Math.abs(best - want) ? s : best),
    5,
  );
}

/**
 * D11 (open): until the owner decides child detection, a product the studio rules keep away
 * from a person (kids, unstitched, bottoms-only) only gets `no_person` VIDEO styles.
 */
function personAllowed(product: Parameters<typeof productProfile>[0]): boolean {
  return productProfile(product).modelAllowed;
}

const PRODUCT_PROFILE_SELECT = {
  name: true,
  category: true,
  subtype: true,
  product_type: true,
  is_unstitched: true,
} as const;

export const productsVideoAiRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /products/promo-video/styles?product_id= ─────────────────
  server.get('/promo-video/styles', async (request) => {
    const q = z.object({ product_id: z.string().min(1) }).safeParse(request.query);
    if (!q.success) throw validationError('product_id is required', 'product_id');

    const retailer = await prisma.retailer.findUniqueOrThrow({
      where: { id: request.retailerId },
      select: { plan: true },
    });
    const product = await prisma.product.findFirst({
      where: { id: q.data.product_id, retailer_id: request.retailerId, deleted_at: null },
      select: PRODUCT_PROFILE_SELECT,
    });
    if (!product) throw notFound('Product');

    const [rows, featureOn, model, quota] = await Promise.all([
      prisma.studioStyle.findMany({
        where: { status: 'PUBLISHED', kind: 'VIDEO', plans: { has: retailer.plan } },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
        select: {
          slug: true,
          label: true,
          description: true,
          thumbnail_url: true,
          default_aspect: true,
          duration_sec: true,
          no_person: true,
        },
      }),
      hasFeature(request.retailerId, 'AI_PROMO_VIDEO'),
      videoModelForPlan(retailer.plan),
      getQuotaStatus(request.retailerId, 'AI_VIDEO'),
    ]);
    const person = personAllowed(product);
    return {
      data: rows.filter((r) => person || r.no_person),
      meta: {
        available: featureOn && model !== null,
        unavailable_reason: !featureOn
          ? 'AI promo videos are not included in your plan.'
          : model
            ? null
            : 'AI promo videos are not available right now.',
        quota,
      },
    };
  });

  // ─── POST /products/:id/promo-video ────────────────────────────────
  server.post(
    '/:id/promo-video',
    { config: { rateLimit: { max: 6, timeWindow: 60 * 1000 } } },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // RC-142: a delegated session must not spend the retailer's AI_VIDEO quota.
      if (isDelegate(request)) throw forbidden('Only the shop team can make AI videos');

      if (!(await hasFeature(request.retailerId, 'AI_PROMO_VIDEO'))) {
        throw featureUnavailable('AI promo video');
      }
      const retailer = await prisma.retailer.findUniqueOrThrow({
        where: { id: request.retailerId },
        select: { plan: true },
      });
      const model = await videoModelForPlan(retailer.plan);
      if (!model) {
        throw new AppError(
          'FEATURE_UNAVAILABLE',
          'AI promo videos are not available on your plan right now.',
          403,
        );
      }

      const body = BodySchema.safeParse(request.body ?? {});
      if (!body.success) {
        throw validationError(body.error.issues[0]?.message ?? 'Invalid request', 'style_slug');
      }

      const product = await prisma.product.findFirst({
        where: { id, retailer_id: request.retailerId, deleted_at: null },
        select: { ...PRODUCT_PROFILE_SELECT, _count: { select: { videos: true } } },
      });
      if (!product) throw notFound('Product');

      // The job resolves the source URL from our own row; the client only names the photo.
      const photo = await prisma.productPhoto.findFirst({
        where: { id: body.data.photo_id, product_id: id, retailer_id: request.retailerId },
        select: { id: true },
      });
      if (!photo) throw notFound('Product photo');

      const style = await prisma.studioStyle.findFirst({
        where: { slug: body.data.style_slug, status: 'PUBLISHED', kind: 'VIDEO' },
      });
      if (!style) throw validationError('Unknown or unavailable video style.', 'style_slug');
      if (!style.plans.includes(retailer.plan)) {
        throw new AppError(
          'FEATURE_UNAVAILABLE',
          'This video style is not included in your plan.',
          403,
        );
      }
      if (!style.no_person && !personAllowed(product)) {
        throw validationError(
          'This style shows a person, which is not available for this product. Pick a product-only style.',
          'style_slug',
        );
      }
      if (product._count.videos >= MAX_VIDEOS_PER_PRODUCT) {
        throw validationError(`Maximum ${MAX_VIDEOS_PER_PRODUCT} videos per product`, 'product');
      }

      const defaultAspect = ASPECTS.find((a) => a === style.default_aspect) ?? '9:16';
      const jobId = createId();
      // L5: the clip's row lands only after Fal finishes, so the count above cannot see a clip in the
      // making. One in-flight AI clip per product, claimed before any quota is spent.
      if (!(await claimPromoVideoSlot(id, jobId))) {
        throw new AppError(
          'VIDEO_IN_PROGRESS',
          'A video is already being made for this product. Try again when it is ready.',
          409,
        );
      }
      try {
        await reserveJobQuota(request.retailerId, 'AI_VIDEO', jobId);
      } catch (err) {
        await releasePromoVideoSlot(id, jobId);
        throw err;
      }
      try {
        await addPromoVideoJob({
          job_id: jobId,
          retailer_id: request.retailerId,
          product_id: id,
          photo_id: photo.id,
          style_slug: style.slug,
          motion_prompt: style.prompt,
          aspect: (body.data.aspect ?? defaultAspect) as VideoAspect,
          seconds: clipSeconds(style.duration_sec),
        });
      } catch (err) {
        await refundJobQuota(jobId, 'AI_VIDEO').catch((refundErr) => {
          request.log.error({ err: refundErr, job_id: jobId }, 'Failed to refund AI_VIDEO quota');
        });
        await releasePromoVideoSlot(id, jobId);
        throw err;
      }

      return reply.status(202).send({ data: { job_id: jobId, status: 'processing' } });
    },
  );

  // ─── GET /products/:id/promo-video/:jobId ──────────────────────────
  server.get('/:id/promo-video/:jobId', async (request) => {
    const { id, jobId } = request.params as { id: string; jobId: string };
    // Product must be this retailer's; the status is keyed by retailer, so a foreign jobId reads nothing.
    const product = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId },
      select: { id: true },
    });
    if (!product) throw notFound('Product');

    const status = await getStudioJobStatus(request.retailerId, jobId);
    if (status) return { data: status };

    // Redis expired or down: the job writes the video row with id = job_id (RC-063).
    const video = await prisma.productVideo.findFirst({
      where: { id: jobId, product_id: id, retailer_id: request.retailerId },
      select: { id: true, public_url: true },
    });
    if (video) return { data: { status: 'ready', video_id: video.id, url: video.public_url } };
    return { data: { status: 'processing' } };
  });
};
