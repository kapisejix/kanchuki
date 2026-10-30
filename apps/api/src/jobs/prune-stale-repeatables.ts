import type { Queue } from 'bullmq';

/**
 * T1.4 F4: a BullMQ repeat key includes the cron pattern, so changing a pattern in code (or
 * CATALOG_SYNC_CRON) leaves the old repeatable in Redis and the job fires at both times.
 * `registered` holds `${name}|${pattern}` for every cron this boot just added. A repeatable is
 * removed only when its NAME is registered but its pattern is not, so a repeatable some other
 * module owns is never touched. Never throws: a failed prune must not stop the workers booting.
 */
export async function pruneStaleRepeatables(
  queue: Pick<Queue, 'getRepeatableJobs' | 'removeRepeatableByKey'>,
  registered: Set<string>,
): Promise<void> {
  try {
    const names = new Set([...registered].map((r) => r.slice(0, r.indexOf('|'))));
    for (const job of await queue.getRepeatableJobs()) {
      if (!names.has(job.name) || registered.has(`${job.name}|${job.pattern}`)) continue;
      await queue.removeRepeatableByKey(job.key);
      console.warn(`[jobs] removed stale repeatable ${job.name} (${job.pattern})`);
    }
  } catch (err) {
    console.error('[jobs] stale repeatable prune failed:', err);
  }
}
