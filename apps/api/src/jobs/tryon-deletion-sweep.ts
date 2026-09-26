// F-040 — retry sweep for try-on results that a withdrawal did not
// manage to delete (hourly maintenance job).
//
// WHY THIS EXISTS. `withdrawTryOnConsent()` deletes the stored images as part
// of the withdrawal, and that inline delete is deliberate: a "cleanup job that
// runs later" would make the promise conditional on the job's health. But an
// inline delete is still a network call to R2, and when it fails the withdrawal
// cannot delete the row's `result_url` — that key is the ONLY pointer to an
// object the platform still owes this person a delete for, so clearing it would
// orphan the object permanently while making the row claim there was nothing to
// remove. The row therefore ends up `consent_withdrawn_at != null` WITH a
// `result_url`, which is precisely the state this job looks for.
//
// The same state is also reachable from the other direction: a generation that
// finishes after its consent was withdrawn writes its result key moments after
// the withdrawal swept. `handleTryOn` deletes that key itself (and refuses to
// attach it to the row), but its delete can fail the same way. So this job is
// the single retry path for BOTH, which is why it keys on the state rather than
// on an error code.
//
// NOT a general R2 orphan cleaner: it only ever touches keys that a
// `consent_withdrawn_at` row still points at, so it cannot delete an image
// whose owner is still consented.
//
// No index on the sweep's predicate, on purpose. `try_on_jobs` is small (one row
// per generation, and generations are quota-capped per plan), the query is
// hourly, and a partial index on `(result_url)` WHERE `consent_withdrawn_at IS
// NOT NULL AND result_url IS NOT NULL` would cost a migration and a write-path
// change to make a scan that is already negligible faster. If try-on volume ever
// makes this the slowest thing in the maintenance queue, that is the moment to
// add it — not before.
import { deleteObject } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';

/** Bounded, because the first run after a long outage could owe thousands of
 *  deletes and the maintenance worker is a single concurrency-1 lane shared with
 *  every other cron. The next hourly run picks up the rest. */
const BATCH_SIZE = 100;

export interface TryOnDeletionSweepResult {
  /** Withdrawn rows that still carried a result key. */
  owed: number;
  deleted: number;
  /** Still owed. Logged loudly, since these are unmet deletion promises. */
  failed: number;
}

export async function handleTryOnDeletionSweep(): Promise<TryOnDeletionSweepResult> {
  const jobs = await prisma.tryOnJob.findMany({
    where: {
      consent_withdrawn_at: { not: null },
      result_url: { not: null },
    },
    // Oldest promise first — a backlog drains in the order it was incurred.
    orderBy: { consent_withdrawn_at: 'asc' },
    take: BATCH_SIZE,
    select: { id: true, result_url: true },
  });

  const result: TryOnDeletionSweepResult = { owed: jobs.length, deleted: 0, failed: 0 };

  for (const job of jobs) {
    const key = job.result_url;
    if (!key) continue;

    try {
      await deleteObject(key);
    } catch (err) {
      result.failed += 1;
      console.error(`[try-on] deletion sweep could not delete ${key} for job ${job.id}:`, err);
      // The key stays. It is still the only pointer to the object.
      continue;
    }

    result.deleted += 1;

    // `consent_withdrawn_at` is deliberately NOT touched: the withdrawal is the
    // audit record and has to survive the cleanup it triggered. Only the pointer
    // goes. Idempotent — a concurrent run that cleared it first leaves this
    // update matching zero rows, which is a success, not an error.
    await prisma.tryOnJob
      .updateMany({
        where: { id: job.id, result_url: key },
        data: { result_url: null },
      })
      .catch((err) => {
        console.error(
          `[try-on] deletion sweep deleted ${key} but could not clear it on job ${job.id} — the next run will retry the delete:`,
          err,
        );
      });
  }

  if (result.owed > 0) {
    console.info(
      `[try-on] deletion sweep: ${result.deleted}/${result.owed} owed images deleted, ${result.failed} still owed`,
    );
  }

  return result;
}
