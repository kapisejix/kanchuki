// F-039 Phase 2 — CatVTON try-on job (BullMQ TRY_ON queue).
//
// Retailer flow:  POST /v1/products/:id/try-on (multipart wearer photo) → 202
// Customer flow:  same route, passport cookie instead of a Bearer token
// → client polls GET /v1/products/:id/try-on/status?job_id= until
//   'ready' (result URL) or 'failed' (reason). Generation runs here, never on
//   the HTTP request (a RunPod inference is 35–45s).
//
// The job owns four things the route deliberately does not:
//
//   1. Takes the wearer's photo from the in-process store
//      (lib/tryon-photo-store.ts). It is NOT in the BullMQ payload — see that
//      module for why (Redis is storage; T6 forbids persisting the photo).
//   2. Resolves the garment URL afresh from the product row, so a photo the
//      retailer replaced after enqueuing is the one actually tried on.
//   3. Calls RunPod and saves ONLY the generated result to R2, under a key
//      whose presigned URL the status route mints per read.
//   4. Writes the terminal TryOnJob status and increments BOTH quota counters.
//
// Mirror of jobs/studio-shoot.ts, with one structural difference: studio-shoot
// keeps its live status in Redis and falls back to a DB row; here the
// try_on_jobs row IS the status, because the row already has to exist for the
// quota/audit trail and a second source of truth would be free to disagree.
//
// Note: deliberately does NOT import from routes/ — jobs are imported by the
// whole API boot graph, so a job importing a routes helper drags that module's
// deps into every test that mocks @kanchuki/shared minimally.
import {
  clothTypeForCategory,
  generateTryOn,
  getDownloadPresignedUrl,
  isUnsupportedTryOnCategory,
  saveTryOnResultToR2,
} from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { incrementCustomerUsage, incrementUsage } from '../lib/quota.js';
import { takeTryOnPhoto } from '../lib/tryon-photo-store.js';

export interface TryOnJobData {
  job_id: string;
  retailer_id: string;
  /** null = retailer generated it in-store; set = passport-logged-in shopper. */
  customer_account_id: string | null;
  product_id: string;
}

/**
 * A fetchable URL for the garment. A stored public URL is used as-is; a
 * relative path falls back to a presigned GET URL when R2_PUBLIC_URL is unset.
 * Same rule as studioSourceUrl in jobs/studio-shoot.ts — the RunPod worker
 * fetches this URL from its side, so it has to be absolutely reachable (a
 * relative `/uploads/...` would make the worker try to resolve it locally).
 */
async function garmentUrl(photo: { url: string; r2_key: string | null }): Promise<string | null> {
  if (photo.url.startsWith('http://') || photo.url.startsWith('https://')) return photo.url;
  if (photo.r2_key) {
    try {
      // 1h: the worker fetches it within seconds, but a cold-start queue can
      // hold the job longer than the default window.
      return await getDownloadPresignedUrl(photo.r2_key, 3600);
    } catch {
      return photo.url || null;
    }
  }
  return photo.url || null;
}

async function markFailed(jobId: string, reason: string): Promise<void> {
  await prisma.tryOnJob
    .update({
      where: { id: jobId },
      data: { status: 'FAILED', failure_reason: reason.slice(0, 500), completed_at: new Date() },
    })
    .catch((err) => console.error(`[try-on] failed to mark ${jobId} FAILED:`, err));
}

export async function handleTryOn(data: TryOnJobData): Promise<void> {
  const { job_id, retailer_id, customer_account_id, product_id } = data;

  // The one-shot take: after this line the only copy of the wearer's photo is
  // the local `photo.buffer`, and it is gone from the store whether this job
  // succeeds or throws.
  const photo = takeTryOnPhoto(job_id);
  if (!photo) {
    await markFailed(job_id, 'The submitted photo expired before it could be used. Please try again.');
    return;
  }
  if (photo.buffer.length === 0) {
    await markFailed(job_id, 'The submitted photo was empty.');
    return;
  }

  try {
    // Re-verify ownership at execution time (queue = trust boundary): the
    // route checked, but a stale job must not be trusted, and for a customer
    // job it is the product that names the retailer.
    const product = await prisma.product.findFirst({
      where: { id: product_id, retailer_id, deleted_at: null },
      select: {
        id: true,
        category: true,
        photos: {
          orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }],
          take: 1,
          select: { url: true, r2_key: true },
        },
      },
    });
    if (!product) {
      await markFailed(job_id, 'Product not found. It may have been deleted.');
      return;
    }

    if (isUnsupportedTryOnCategory(product.category)) {
      await markFailed(job_id, 'This garment type cannot be tried on yet.');
      return;
    }

    const source = product.photos[0];
    const sourceUrl = source ? await garmentUrl(source) : null;
    if (!sourceUrl) {
      await markFailed(job_id, 'This product has no photo to try on.');
      return;
    }

    const result = await generateTryOn({
      personImage: photo.buffer,
      personImageContentType: photo.contentType,
      garmentImageUrl: sourceUrl,
      clothType: clothTypeForCategory(product.category),
    });

    // Persist ONLY the generated image. The wearer's buffer above is never
    // written anywhere — not to R2, not to the DB, and (see the store module)
    // not to Redis either.
    const resultKey = await saveTryOnResultToR2(job_id, result.outputUrl);

    await prisma.tryOnJob.update({
      where: { id: job_id },
      data: { status: 'COMPLETED', result_url: resultKey, completed_at: new Date() },
    });

    // Quota is spent only on success — both caps, because a customer job spends
    // the retailer's monthly allowance AND that shopper's own.
    incrementUsage(retailer_id, 'TRY_ON_GENERATION').catch((err) => {
      console.error(`[try-on] failed to record retailer quota usage for ${retailer_id}:`, err);
    });
    if (customer_account_id) {
      incrementCustomerUsage(customer_account_id, 'TRY_ON_GENERATION').catch((err) => {
        console.error(`[try-on] failed to record customer quota usage for ${customer_account_id}:`, err);
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[try-on] job ${job_id} failed:`, err);
    await markFailed(job_id, message || 'The try-on could not be generated. Please try again.');
    // Mark the job failed for BullMQ visibility. No auto-retry: each attempt is
    // a real GPU call, and a retry would have no wearer photo left (it was
    // taken above), so it could only fail again.
    throw new Error(message);
  }
}
