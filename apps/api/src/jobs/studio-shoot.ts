// F-032 Phase A — AI Studio Shoot job (BullMQ STUDIO_SHOOT queue).
//
// Retailer flow: POST /products/:id/photos/:photoId/studio-shoot {template}
// → 202 {job_id} → mobile polls GET .../studio-shoot/status?job_id= until
// ready/failed. This job does the actual generation:
//
//   1. Verify the photo belongs to the retailer + product (re-checked here —
//      the queue is a trust boundary; the route already checked, but a
//      retailer id in a stale job must not be trusted).
//   2. Run FLUX Kontext on the photo URL with the template prompt (async
//      submit + poll, up to ~2 min).
//   3. Download the signed result (10-min validity), compress ≤80KB, store
//      under a NEW studio R2 key (never overwrites the source photo).
//   4. Create a new ProductPhoto row (is_primary: false, metadata carries
//      studio provenance) so the original stays one tap away and the edited
//      image can be promoted via the existing "Set as main" PATCH.
//   5. Write the job status to Redis (ready: photo_id+url / failed: error)
//      for the polling endpoint.
//
// Run on its OWN queue (QUEUES.STUDIO_SHOOT), not MAINTENANCE — it's a
// retailer-facing hot path with bounded concurrency (STUDIO_SHOOT_CONCURRENCY)
// to respect BFL's 24-active-task cap. Failures throw so BullMQ marks the
// job failed for queue visibility; the status write happens on BOTH paths.
//
// Note: deliberately does NOT import from routes/ — jobs are imported by the
// whole API boot graph, so a job importing a routes helper drags that
// module's deps (e.g. SIZE_OPTIONS from @kanchuki/shared) into every test
// that mocks @kanchuki/shared minimally. The URL fallback below mirrors
// photoUrlToDisplay inline instead.
import { getDownloadPresignedUrl } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { R2_PATHS, type StudioTemplateId } from '@kanchuki/shared';
import { createId } from '@paralleldrive/cuid2';
import {
  downloadCompressAndUpload,
  generateStudioImage,
  setStudioJobStatus,
} from '../lib/studio-shoot.js';

/** Same fallback as routes/products/products-helpers.ts photoUrlToDisplay —
 * a stored public URL is used as-is; a relative path falls back to a
 * presigned GET URL when R2_PUBLIC_URL is unset. */
async function studioSourceUrl(photo: {
  url: string;
  r2_key: string | null;
}): Promise<string | null> {
  if (photo.url.startsWith('http://') || photo.url.startsWith('https://')) return photo.url;
  if (photo.r2_key) {
    try {
      return await getDownloadPresignedUrl(photo.r2_key, 3600);
    } catch {
      return photo.url || null;
    }
  }
  return photo.url || null;
}

export interface StudioShootJobData {
  job_id: string;
  retailer_id: string;
  product_id: string;
  photo_id: string;
  template: StudioTemplateId;
}

export async function handleStudioShoot(data: StudioShootJobData): Promise<void> {
  const { job_id, retailer_id, product_id, photo_id, template } = data;
  const startedAt = new Date();

  try {
    // Re-verify ownership at execution time (queue = trust boundary).
    const photo = await prisma.productPhoto.findFirst({
      where: { id: photo_id, product_id, retailer_id },
    });
    if (!photo) {
      await setStudioJobStatus(job_id, {
        status: 'failed',
        error: 'Product photo not found. It may have been deleted.',
      });
      return;
    }

    const displayUrl = await studioSourceUrl(photo);
    if (!displayUrl) {
      await setStudioJobStatus(job_id, {
        status: 'failed',
        error: 'Could not resolve the source photo URL.',
      });
      return;
    }

    // 2. Generate (async submit + poll inside generateStudioImage).
    const result = await generateStudioImage(template, displayUrl);
    if (result.status !== 'ready' || !result.sampleUrl) {
      await setStudioJobStatus(job_id, {
        status: 'failed',
        error: result.error ?? 'The studio shoot could not be generated. Please try again.',
      });
      return;
    }

    // 3–4. Download → compress → upload to a NEW key → create a new photo row.
    const filename = `studio-${photo.id}-${createId()}.jpg`;
    const r2Key = R2_PATHS.studioShot(retailer_id, product_id, filename);
    const uploaded = await downloadCompressAndUpload(result.sampleUrl, r2Key);

    const newPhoto = await prisma.productPhoto.create({
      data: {
        product_id,
        retailer_id,
        r2_key: uploaded.key,
        url: uploaded.url,
        is_primary: false,
        width: uploaded.width,
        height: uploaded.height,
        metadata: {
          studio: {
            job_id,
            template,
            source_photo_id: photo.id,
            generated_at: startedAt.toISOString(),
          },
        },
      },
    });

    // 5. Status AFTER the DB row exists — ready means the photo is live.
    await setStudioJobStatus(job_id, {
      status: 'ready',
      photo_id: newPhoto.id,
      url: newPhoto.url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[studio-shoot] job ${job_id} failed:`, err);
    await setStudioJobStatus(job_id, {
      status: 'failed',
      error: 'The studio shoot failed. Please try again.',
    });
    // Mark the job failed for BullMQ visibility (no auto-retry by default —
    // each generation costs real BFL credits, so don't burn credits on retry).
    throw new Error(message);
  }
}
