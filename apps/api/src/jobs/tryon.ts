// F-040 — CatVTON try-on job (BullMQ TRY_ON queue).
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
  deleteObject,
  generateTryOn,
  getDownloadPresignedUrl,
  isUnsupportedTryOnCategory,
  saveTryOnResultToR2,
} from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import {
  markCustomerJobQuotaSpent,
  markJobQuotaSpent,
  refundCustomerJobQuota,
  refundJobQuota,
} from '../lib/quota.js';
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

// `gpuMs` is passed only once the GPU has run: it is the durable trace the quota sweep reads to
// tell a paid-but-failed run (slot stays spent) from one that never reached the GPU (refund).
async function markFailed(jobId: string, reason: string, gpuMs?: number): Promise<void> {
  await prisma.tryOnJob
    .update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        failure_reason: reason.slice(0, 500),
        completed_at: new Date(),
        ...(gpuMs !== undefined && { gpu_ms: gpuMs }),
      },
    })
    .catch((err) => console.error(`[try-on] failed to mark ${jobId} FAILED:`, err));
}

// The route reserved a TRY_ON_GENERATION slot for this job_id (retailer, plus the shopper's own
// for a passport job). It is spent once the GPU call returns; every earlier exit (photo gone,
// queued job already DISCARDED, product/category/photo problems, GPU throw) hands it back here.
// BullMQ counts a `return` as completed, so its `failed` hook would miss those (RC-102).
export async function handleTryOn(data: TryOnJobData): Promise<void> {
  const held = { spent: false };
  try {
    await run(data, held);
  } finally {
    if (!held.spent) {
      await refundJobQuota(data.job_id, 'TRY_ON_GENERATION').catch((err) => {
        console.error(`[try-on] failed to refund retailer quota for job ${data.job_id}:`, err);
      });
      if (data.customer_account_id) {
        await refundCustomerJobQuota(data.job_id, 'TRY_ON_GENERATION').catch((err) => {
          console.error(`[try-on] failed to refund customer quota for job ${data.job_id}:`, err);
        });
      }
    }
  }
}

async function run(data: TryOnJobData, held: { spent: boolean }): Promise<void> {
  const { job_id, retailer_id, customer_account_id, product_id } = data;

  // The one-shot take: after this line the only copy of the wearer's photo is
  // the local `photo.buffer`, and it is gone from the store whether this job
  // succeeds or throws.
  const photo = takeTryOnPhoto(job_id);
  if (!photo) {
    await markFailed(
      job_id,
      'The submitted photo expired before it could be used. Please try again.',
    );
    return;
  }
  if (photo.buffer.length === 0) {
    await markFailed(job_id, 'The submitted photo was empty.');
    return;
  }

  // Discarded while still queued (staff closed the in-store session before the
  // worker picked this up): no GPU call, no result, and no charge - the GPU
  // never ran. The photo is already out of the store (taken above). The row is
  // left DISCARDED; markFailed would overwrite that status.
  const current = await prisma.tryOnJob.findUnique({
    where: { id: job_id },
    select: { status: true },
  });
  if (current?.status === 'DISCARDED') return;

  let gpuMs: number | undefined;
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

    // The GPU ran, so the slot(s) are spent whatever happens next: a withdrawal or discard that
    // lands mid-run still counts (otherwise withdraw-and-regenerate spends the store's allowance
    // for free - `hasLiveTryOnConsent` lets a shopper re-grant, so that loop is reachable from the
    // UI). Both caps, because a customer job spends the retailer's allowance AND the shopper's.
    // The flag is set before the writes so a later throw cannot refund a paid generation.
    held.spent = true;
    gpuMs = result.gpuMs ?? 0; // non-null even when unmetered: the sweep reads "gpu_ms set" as "GPU ran"
    await markJobQuotaSpent(job_id, 'TRY_ON_GENERATION').catch((err) => {
      console.error(`[try-on] failed to mark retailer quota spent for ${retailer_id}:`, err);
    });
    if (customer_account_id) {
      await markCustomerJobQuotaSpent(job_id, 'TRY_ON_GENERATION').catch((err) => {
        console.error(
          `[try-on] failed to mark customer quota spent for ${customer_account_id}:`,
          err,
        );
      });
    }

    // Persist ONLY the generated image. The wearer's buffer above is never
    // written anywhere — not to R2, not to the DB, and (see the store module)
    // not to Redis either.
    const resultKey = await saveTryOnResultToR2(job_id, result.outputUrl);

    // The completion write is CONDITIONAL on the consent still being live, and
    // that is not belt-and-braces: consent can be withdrawn at any moment during
    // the 35–45s this call takes. `withdrawTryOnConsent()` stamps
    // `consent_withdrawn_at` and deletes every `result_url` it can see — so a
    // key written AFTER that sweep is a stored photograph of someone who has
    // withdrawn, sitting on a row no reader will ever consult again (the status
    // route answers 'withdrawn' before it looks at anything else).
    //
    // `updateMany` with the condition in the WHERE makes the check and the write
    // one statement, so there is no gap between them for a withdrawal to land
    // in. `count === 0` means it landed.
    const claimed = await prisma.tryOnJob.updateMany({
      where: { id: job_id, consent_withdrawn_at: null, status: { not: 'DISCARDED' } },
      data: {
        status: 'COMPLETED',
        result_url: resultKey,
        completed_at: new Date(),
        gpu_ms: result.gpuMs,
      },
    });

    if (claimed.count === 0) {
      // Discarded (staff closed the in-store session) or withdrawn (consent) while
      // the GPU was working: the row has no pointer, so a failed delete below would
      // orphan the object (RC-044 shape). Record the key on the row FIRST, leaving
      // status alone, so a sweep can retry it: the age sweep finds DISCARDED rows,
      // the deletion sweep finds `consent_withdrawn_at` rows with a key (RC-072).
      const recorded = await prisma.tryOnJob
        .updateMany({
          where: {
            id: job_id,
            result_url: null,
            OR: [{ status: 'DISCARDED' }, { consent_withdrawn_at: { not: null } }],
          },
          data: { result_url: resultKey, completed_at: new Date(), gpu_ms: result.gpuMs },
        })
        .catch((err) => {
          console.error(`[try-on] job ${job_id} could not record its discarded result key:`, err);
          return { count: 0 };
        });
      // Withdrawn while the GPU was working, so this image must not outlive the
      // withdrawal. Best effort: the hourly `tryon-deletion-sweep` retries
      // anything this delete misses — the same path a failed withdrawal delete
      // takes, which is why the row is left for it (the sweep finds withdrawn
      // rows that still carry a key, whichever way they got one).
      const deleted = await deleteObject(resultKey).then(
        () => true,
        (err) => {
          console.error(
            `[try-on] job ${job_id} finished after its consent was withdrawn or it was discarded and could not delete the result it had already written:`,
            err,
          );
          return false;
        },
      );
      if (deleted && recorded.count > 0) {
        // Only the pointer goes, only after the delete succeeded.
        await prisma.tryOnJob
          .updateMany({ where: { id: job_id, result_url: resultKey }, data: { result_url: null } })
          .catch((err) =>
            console.error(
              `[try-on] job ${job_id} deleted ${resultKey} but could not clear it:`,
              err,
            ),
          );
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[try-on] job ${job_id} failed:`, err);
    await markFailed(
      job_id,
      message || 'The try-on could not be generated. Please try again.',
      gpuMs,
    );
    // Mark the job failed for BullMQ visibility. No auto-retry: each attempt is
    // a real GPU call, and a retry would have no wearer photo left (it was
    // taken above), so it could only fail again.
    throw new Error(message);
  }
}
