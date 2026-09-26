// F-039 Phase 2 — in-process handoff for the wearer's photo.
//
// WHY THIS EXISTS (T6, security-critical)
//
// The try-on job is asynchronous: the route accepts a multipart wearer photo,
// enqueues a BullMQ job, and the worker (in this same process) calls RunPod
// 35–45s later. The obvious way to move the bytes from route to job is to put
// them in the job payload — and that is exactly what this module exists to
// avoid. BullMQ serialises a payload into Redis, and Redis **is persistent
// storage**: the base64 photo would then sit in the queue, survive restarts,
// and be covered by no retention policy. That is the same DPDP violation T6
// forbids for R2, only with a different database.
//
// So the photo never crosses a serialization boundary. The route stashes the
// Buffer here, keyed by the job id it is about to enqueue; the job takes it
// (one-shot) and the entry is gone. Between `put` and `take` the only copy is
// this Map, in this process's memory.
//
// WHAT THAT COSTS
//
// The handoff only works while the worker runs in the same process. It does:
// `startWorkers()` is called from `index.ts` in the API process, and there is
// no separate worker entrypoint. If a dedicated worker process is ever split
// out, this module breaks loudly (the job takes nothing and fails with
// "photo expired") rather than silently persisting anything — and the fix is
// to move the try-on call itself to the worker, not to widen this store.
//
// The TTL is a backstop, not the mechanism: the worker takes the photo within
// seconds of the enqueue. A photo that expires before its job runs is a failed
// job the shopper retries, never a stored photo.

/** How long a stashed photo may wait for its job. The job is enqueued in the
 *  same request that stashes the photo and the worker is already running, so
 *  this is far longer than the real gap — it only bounds the leak from a job
 *  that never ran (Redis down, worker crashed). */
export const TRYON_PHOTO_TTL_MS = 3 * 60_000;

/** Soft ceiling on the bytes held across all pending jobs. These are
 *  phone-camera JPEGs (typ. 2–8 MB); 256 MB is room for dozens of concurrent
 *  handoffs. Reaching it is a busy-server signal, not a routine event, so the
 *  route answers 503 and the shopper retries — the alternative (unbounded
 *  growth) is an OOM in a process that also serves every other route. */
export const TRYON_PHOTO_MAX_BYTES = 256 * 1024 * 1024;

interface StashedPhoto {
  buffer: Buffer;
  contentType: string;
  expiresAt: number;
}

const photos = new Map<string, StashedPhoto>();

/** Drop expired entries. Called on every put — the map is small enough that a
 *  sweep is cheaper than a timer, and a timer would keep the process alive in
 *  tests. */
function sweep(now: number): void {
  for (const [key, value] of photos) {
    if (value.expiresAt <= now) photos.delete(key);
  }
}

function bytesInUse(): number {
  let total = 0;
  for (const value of photos.values()) total += value.buffer.length;
  return total;
}

/**
 * Stash the wearer's photo for its job. Returns false when the store is full —
 * the caller answers 503 rather than growing without bound.
 */
export function putTryOnPhoto(jobId: string, buffer: Buffer, contentType: string): boolean {
  const now = Date.now();
  sweep(now);
  if (bytesInUse() + buffer.length > TRYON_PHOTO_MAX_BYTES) return false;
  photos.set(jobId, { buffer, contentType, expiresAt: now + TRYON_PHOTO_TTL_MS });
  return true;
}

/**
 * Take the photo, deleting it in the same step — a job must never see a photo
 * a retry could also see, and the entry should not outlive its one use. Returns
 * null when it was never stashed or has expired.
 */
export function takeTryOnPhoto(jobId: string): { buffer: Buffer; contentType: string } | null {
  const entry = photos.get(jobId);
  if (!entry) return null;
  photos.delete(jobId);
  if (entry.expiresAt <= Date.now()) return null;
  return { buffer: entry.buffer, contentType: entry.contentType };
}

/** Drop a stashed photo without using it — the route calls this when the
 *  enqueue itself fails, so a failed enqueue does not hold a photo for TTL. */
export function discardTryOnPhoto(jobId: string): void {
  photos.delete(jobId);
}

/** Test/diagnostics only: how many photos are currently held. */
export function tryOnPhotoCount(): number {
  return photos.size;
}
