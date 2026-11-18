// F-034 T5 — AI promo video job (studio queue, job name `promo-video`).
// Spec: docs/tasks/pending/ai-promo-video.md §6.
//
// The route reserved an AI_VIDEO slot keyed by job_id. It is spent the moment Fal reports the
// clip done (Fal has billed us); every exit before that hands it back in `finally` (RC-102).
// Fal's output URL is third-party: generateImageToVideo fetches it with ssrfSafeFetch +
// readCappedBuffer and ffmpeg decodes and re-encodes it, so only our own H.264 bytes reach
// R2, under a server-chosen key (no client key to verify, same as Ken Burns).
// The row id IS the job id, so the status route and the quota sweep can find the result
// after the Redis status expires.
import { publicUrl, uploadBuffer } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { R2_PATHS } from '@kanchuki/shared';
import {
  type ClipUsage,
  type VideoAspect,
  generateImageToVideo,
  videoModelForPlan,
} from '../lib/fal-video.js';
import { markJobQuotaSpent, refundJobQuota } from '../lib/quota.js';
import { setStudioJobStatus } from '../lib/studio-shoot.js';
import { studioSourceUrl } from './studio-shoot.js';

export interface PromoVideoJobData {
  job_id: string;
  retailer_id: string;
  product_id: string;
  photo_id: string;
  style_slug: string;
  motion_prompt: string;
  aspect: VideoAspect;
  seconds: 5 | 6 | 8;
}

/** D4 cap, re-checked here: two jobs queued for one product can both pass the route. */
const MAX_VIDEOS_PER_PRODUCT = 3;
/** CLAUDE.md §5 cost budget: one tagging credit is ~$0.004 (~₹0.33). Lets the RC-081 daily
 *  credit alert see Fal spend. ponytail: fixed rate; read cost_usd directly if the alert moves to USD. */
export const USD_PER_CREDIT = 0.004;
const ESTIMATED_MS = 120_000;
const SAFE_ERROR = 'The video could not be made. Please try again.';

function recordFalVideoUsage(retailerId: string, modelKey: string, usage: ClipUsage): void {
  if (usage.cost_usd == null) {
    console.warn(`[promo-video] no cost measured for ${modelKey}; logged with 0 credits`);
  }
  prisma.aiUsageLog
    .create({
      data: {
        retailer_id: retailerId,
        provider_id: null,
        provider_type: 'FAL',
        model_name: modelKey,
        resource_type: 'AI_VIDEO',
        credits_used: usage.cost_usd == null ? 0 : Math.ceil(usage.cost_usd / USD_PER_CREDIT),
        cost_usd: usage.cost_usd,
      },
    })
    .catch((err) => console.error(`[promo-video] usage log failed for ${retailerId}:`, err));
}

export async function handlePromoVideo(data: PromoVideoJobData): Promise<void> {
  const { job_id, retailer_id, product_id, photo_id } = data;
  const fail = (error = SAFE_ERROR) =>
    setStudioJobStatus(job_id, { status: 'failed', error, progress: 0, etaMs: 0 });
  // Once the clip is live a status write must not turn it into "failed" (the retailer would pay again).
  const ready = (video: { id: string; public_url: string }) =>
    setStudioJobStatus(job_id, {
      status: 'ready',
      video_id: video.id,
      url: video.public_url,
      progress: 100,
      etaMs: 0,
    }).catch((err) => console.error(`[promo-video] ready status failed for ${job_id}:`, err));
  const markSpent = () =>
    markJobQuotaSpent(job_id, 'AI_VIDEO').catch((err) =>
      console.error(`[promo-video] mark spent failed for ${job_id}:`, err),
    );

  await setStudioJobStatus(job_id, { status: 'processing', progress: 0, etaMs: ESTIMATED_MS });

  let spent = false;
  try {
    // BullMQ re-runs a stalled job (worker killed by a redeploy): never pay Fal twice for one slot.
    const existing = await prisma.productVideo.findUnique({
      where: { id: job_id },
      select: { id: true, public_url: true },
    });
    if (existing) {
      spent = true;
      await markSpent();
      await ready(existing);
      return;
    }
    const slot = await prisma.quotaReservation.findFirst({
      where: { job_id, resource_type: 'AI_VIDEO' },
      select: { state: true },
    });
    if (slot && slot.state !== 'RESERVED') {
      // ponytail: SPENT with no video row = the first run crashed after Fal billed; that slot is
      // lost. Store Fal's clip URL on the job to resume the download if this shows up in practice.
      await fail();
      return;
    }

    // Queue = trust boundary: re-check everything the route checked that can change.
    const retailer = await prisma.retailer.findUniqueOrThrow({
      where: { id: retailer_id },
      select: { plan: true },
    });
    const model = await videoModelForPlan(retailer.plan);
    if (!model) {
      await fail('AI promo videos are not available right now.');
      return;
    }

    const photo = await prisma.productPhoto.findFirst({
      where: { id: photo_id, product_id, retailer_id },
      select: { id: true, url: true, r2_key: true },
    });
    const product = await prisma.product.findFirst({
      where: { id: product_id, retailer_id, deleted_at: null },
      select: { id: true, _count: { select: { videos: true } } },
    });
    if (!photo || !product) {
      await fail('The product or photo was deleted.');
      return;
    }
    if (product._count.videos >= MAX_VIDEOS_PER_PRODUCT) {
      await fail(`This product already has ${MAX_VIDEOS_PER_PRODUCT} videos.`);
      return;
    }
    const sourceUrl = await studioSourceUrl(photo);
    if (!sourceUrl) {
      await fail();
      return;
    }

    const { mp4 } = await generateImageToVideo(sourceUrl, {
      model,
      motionPrompt: data.motion_prompt,
      aspect: data.aspect,
      seconds: data.seconds,
      onProgress: (p) => {
        setStudioJobStatus(job_id, { status: 'processing', ...p }).catch(() => {});
      },
      // Fal has charged us from here: the slot is used even if our download/encode/upload fails.
      onFalComplete: async () => {
        spent = true;
        await markSpent();
      },
      onUsage: (usage) => recordFalVideoUsage(retailer_id, model.model_key, usage),
    });

    const r2Key = R2_PATHS.productVideo(retailer_id, product_id, `ai-${job_id}.mp4`);
    await uploadBuffer(r2Key, mp4, 'video/mp4');
    const video = await prisma.productVideo.create({
      data: {
        id: job_id,
        product_id,
        retailer_id,
        r2_key: r2Key,
        public_url: publicUrl(r2Key),
        duration_sec: data.seconds,
        source: 'AI_GEN',
        style_slug: data.style_slug,
        model_key: model.model_key,
      },
    });

    await ready(video);
  } catch (err) {
    // Never log job.data or the photo URL; the provider's text stays out of the retailer's view.
    console.error(`[promo-video] job ${job_id} failed:`, err instanceof Error ? err.message : err);
    await fail();
    throw err; // BullMQ marks it failed -> reportJobFailure (no retry: each attempt costs USD)
  } finally {
    if (!spent) {
      await refundJobQuota(job_id, 'AI_VIDEO').catch((err) =>
        console.error(`[promo-video] refund failed for ${job_id}:`, err),
      );
    }
  }
}
