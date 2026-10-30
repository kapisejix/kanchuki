import * as Sentry from '@sentry/node';
import type { Job } from 'bullmq';

/**
 * Report a BullMQ job failure to Sentry (RC-113). Every `failed` listener only
 * console.error'd, so a dead job (tagging, publish, push, payout...) was invisible
 * unless someone read Railway logs.
 *
 * `failed` also fires for each attempt that will be retried; only the final
 * failure is reported, to avoid one event per retry. A missing `job` (BullMQ
 * "job stalled more than allowable limit") is always final.
 */
export function reportJobFailure(queue: string, job: Job | undefined, err: Error): void {
  const attempts = job?.opts?.attempts ?? 1;
  if (job && job.attemptsMade < attempts) return;
  // Tags/ids only: job.data can hold customer phones and tokens, so it is never sent.
  Sentry.captureException(err, {
    tags: { area: 'job', queue, job: job?.name ?? 'unknown' },
    extra: { job_id: job?.id, attempts_made: job?.attemptsMade },
  });
}
