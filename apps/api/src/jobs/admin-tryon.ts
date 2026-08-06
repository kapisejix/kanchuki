import {
  compressImageToTarget,
  publicUrl,
  readCappedBuffer,
  ssrfSafeFetch,
  triggerTryOn,
  uploadBuffer,
} from '@kanchuki/ai';
import type { VtoneCategory } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { R2_PATHS } from '@kanchuki/shared';

/**
 * Admin on-model try-on job — powers the "Generate on model" button on the
 * Photo Cleanup Test admin page (F: Fashion V-Tone on-model catalog shot).
 *
 * Takes a cleaned product photo + a model photo and runs the self-hosted
 * Fashion V-Tone pipeline (services/fashion-vtone, CPU-capable, Apache 2.0)
 * to produce a "person wearing the garment" image. The result is persisted
 * under the admin photo-cleanup R2 path so the page can show it next to the
 * cleanup results, and an ADMIN_TRYON audit entry records the run for the
 * results feed.
 *
 * Runs on the MAINTENANCE queue (same worker as the compression/measurement
 * jobs) so the admin page enqueues + polls instead of holding an HTTP
 * request open across a 30-60s CPU inference.
 */
export interface AdminTryOnJobData {
  /** client-generated id — the page matches audit entries against it on poll */
  job_id: string;
  model_url: string;
  product_url: string;
  /** V-Tone category: tops | bottoms | one-pieces */
  category: VtoneCategory;
}

export async function handleAdminTryOn(data: AdminTryOnJobData): Promise<void> {
  const { job_id, model_url, product_url, category } = data;
  const startedAt = new Date();

  try {
    const result = await triggerTryOn({
      customerPhotoUrl: model_url,
      productPhotoUrl: product_url,
      vtoneCategory: category,
    });

    if (result.status !== 'completed' || !result.outputUrls[0]) {
      throw new Error(result.errorMessage ?? 'Try-on engine returned no result');
    }

    // Persist under the admin path so the page can render it like a cleanup
    // result. The engine returns a public URL (its own R2 upload) — fetch it
    // with the SSRF-safe bounded downloader (NOT downloadBuffer, which takes
    // an R2 key, not a URL), re-encode quality-first to ≤80KB JPEG, then store
    // under the admin photo-cleanup prefix (compression cron keeps it lean).
    const outputUrl = result.outputUrls[0];
    const res = await ssrfSafeFetch(outputUrl);
    if (!res.ok) throw new Error(`Failed to fetch try-on result: ${res.status}`);
    const { buffer: resultBuf } = await compressImageToTarget(await readCappedBuffer(res));
    const key = R2_PATHS.photoCleanupTest(`${job_id}-onmodel.jpg`);
    await uploadBuffer(key, resultBuf, 'image/jpeg');
    const resultUrl = publicUrl(key);

    // Best-effort (same as the failure path and the compress cron): the image
    // is already in R2 — an audit-write blip must not fail the job AFTER the
    // work completed, or the page would show "failed" for a finished result.
    await prisma.auditLog
      .create({
        data: {
          actor_type: 'system',
          action: 'ADMIN_TRYON',
          resource_type: 'TryOnTest',
          metadata: {
            job_id,
            status: 'completed',
            result_url: resultUrl,
            model_url,
            product_url,
            category,
            duration_ms: Date.now() - startedAt.getTime(),
          },
        },
      })
      .catch(() => {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Audit the failure too — the page's poll resolves it as a failed run
    // instead of hanging until the 12-attempt timeout.
    await prisma.auditLog
      .create({
        data: {
          actor_type: 'system',
          action: 'ADMIN_TRYON',
          resource_type: 'TryOnTest',
          metadata: {
            job_id,
            status: 'failed',
            error: message.slice(0, 500),
            model_url,
            product_url,
            category,
            duration_ms: Date.now() - startedAt.getTime(),
          },
        },
      })
      .catch(() => {});
    // Mark the job failed for queue visibility. attempts defaults to 1 in
    // addAdminTryOnJob, so there's no auto-retry — each job writes exactly one
    // audit row (the failed one above), no duplicate feed entries.
    throw err;
  }
}
