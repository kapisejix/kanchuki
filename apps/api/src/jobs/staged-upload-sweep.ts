// H5-2 follow-up / RC-152 — hourly backstop for staged uploads nobody confirmed.
//
// Every presign route hands out an `uploads/pending/...` key and `verifyUpload` promotes it to its
// final key. An object still under that prefix after the TTL was never confirmed: an abandoned
// upload, or bytes planted through a presigned URL. They sit on the public CDN until something
// removes them; the R2 lifecycle rule (owner check 7) is a dashboard setting nothing in the repo
// can see, so this job does not depend on it.
//
// Only ever lists and deletes the staging prefix, and only objects whose age is known. Bounded per
// run so a first run after a long gap cannot hold the concurrency-1 maintenance lane; the next
// hourly run takes the rest.
import { deleteObject, listObjectsByPrefix } from '@kanchuki/ai';
import { STAGING_PREFIX } from '../lib/upload-guard.js';

/** Longer than any realistic gap between a presign and its confirm. */
export const STAGED_UPLOAD_TTL_HOURS = 24;
export const STAGED_UPLOAD_BATCH = 500;

export interface StagedUploadSweepResult {
  scanned: number;
  deleted: number;
  failed: number;
  /** True when R2 isn't configured and the pass was skipped. */
  skipped_unconfigured: boolean;
}

export async function handleStagedUploadSweep(): Promise<StagedUploadSweepResult> {
  const res: StagedUploadSweepResult = {
    scanned: 0,
    deleted: 0,
    failed: 0,
    skipped_unconfigured: false,
  };
  if (!process.env.R2_ACCOUNT_ID) return { ...res, skipped_unconfigured: true };

  const cutoff = Date.now() - STAGED_UPLOAD_TTL_HOURS * 3600_000;
  // The age filter runs while paging, not after a capped listing: R2 lists in key order, so a cap
  // applied first lets 1000+ young keys sorted ahead of the stale ones hide them for good.
  const isStale = (o: { modified: Date | null }) => !!o.modified && o.modified.getTime() < cutoff;
  const objects = await listObjectsByPrefix(STAGING_PREFIX, STAGED_UPLOAD_BATCH, isStale);
  res.scanned = objects.length;

  // Prefix and age are re-checked here, not trusted from the listing call.
  const stale = objects
    .filter((o) => o.key.startsWith(STAGING_PREFIX) && isStale(o))
    .slice(0, STAGED_UPLOAD_BATCH);

  for (const o of stale) {
    try {
      await deleteObject(o.key);
      res.deleted++;
    } catch (err) {
      res.failed++;
      console.warn(`[staged-upload-sweep] could not delete ${o.key}:`, err);
    }
  }
  return res;
}
