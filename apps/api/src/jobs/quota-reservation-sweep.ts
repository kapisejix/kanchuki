// RC-102 follow-up — hourly sweep for quota_reservations still RESERVED long after their job
// should have ended (process died mid-job, stalled-out job whose `failed` hook never ran, or a
// refund / mark-spent write that failed). The handler `finally` is the normal refund point and
// the BullMQ `failed` hook the stalled backup; this is the last net.
//
// A stuck row is settled, not blindly refunded: where the job leaves a durable trace of a paid
// result the slot is marked SPENT instead, so a failed mark-spent write followed by a missed
// `finally` cannot hand back a paid generation. Truth per resource:
//   STUDIO_SHOOT         a product_photos row carrying metadata.studio.job_id
//   TRY_ON_GENERATION    try_on_jobs.gpu_ms set (written on every path after the GPU ran,
//                        including discarded / withdrawn / a failed result save) or status COMPLETED
//   AI_VIDEO             a product_videos row whose id is the job id
//   anything else        no durable trace (My Style state lives in Redis for 15 min) -> refund
// Both settle calls are idempotent (UPDATE .. WHERE state = 'RESERVED'), so a job that finishes
// between the read and the write is not double-counted.
import { prisma } from '@kanchuki/db';
import type { QuotaResourceType } from '@kanchuki/db';
import {
  markCustomerJobQuotaSpent,
  markJobQuotaSpent,
  refundCustomerJobQuota,
  refundJobQuota,
} from '../lib/quota.js';

// ponytail: a fixed age instead of asking BullMQ whether the job is still live. Must exceed the
// longest queue wait + job run (studio / try-on run under a minute; 6 h is far past any backlog).
// Add a live-job check if a queue ever backs up that long.
export const RESERVATION_MIN_AGE_MS = 6 * 60 * 60 * 1000;
const BATCH = 500;

async function producedResult(resource: QuotaResourceType, jobId: string): Promise<boolean> {
  if (resource === 'STUDIO_SHOOT') {
    // Raw so the predicate is exactly the expression indexed by migration 145
    // (`metadata #> '{studio,job_id}'`); Prisma's JSON-path filter builds its own expression and
    // measured as a sequential scan of product_photos per stuck row (52 ms at 100k rows).
    const rows = await prisma.$queryRaw<{ one: number }[]>`
      SELECT 1 AS one FROM product_photos
      WHERE metadata #> '{studio,job_id}' = to_jsonb(${jobId}::text)
      LIMIT 1`;
    return rows.length > 0;
  }
  if (resource === 'AI_CUSTOM_TEMPLATE') {
    // ai_custom_designs.id is the job id; READY is written before the slot is marked spent.
    const row = await prisma.aiCustomDesign.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    return row?.status === 'READY';
  }
  if (resource === 'AI_VIDEO') {
    // product_videos.id is the job id (F-034 T5); the row is written before mark-spent.
    const row = await prisma.productVideo.findUnique({
      where: { id: jobId },
      select: { id: true },
    });
    return row !== null;
  }
  if (resource === 'TRY_ON_GENERATION') {
    const job = await prisma.tryOnJob.findUnique({
      where: { id: jobId },
      select: { gpu_ms: true, status: true },
    });
    return job !== null && (job.gpu_ms !== null || job.status === 'COMPLETED');
  }
  return false;
}

export interface QuotaReservationSweepResult {
  spent: number;
  refunded: number;
  failed: number;
}

export async function handleQuotaReservationSweep(
  now = new Date(),
): Promise<QuotaReservationSweepResult> {
  const rows = await prisma.quotaReservation.findMany({
    where: {
      state: 'RESERVED',
      created_at: { lt: new Date(now.getTime() - RESERVATION_MIN_AGE_MS) },
    },
    orderBy: { created_at: 'asc' },
    take: BATCH,
    select: { job_id: true, resource_type: true, retailer_id: true, customer_account_id: true },
  });

  const result: QuotaReservationSweepResult = { spent: 0, refunded: 0, failed: 0 };
  for (const r of rows) {
    try {
      const customer = r.customer_account_id !== null;
      if (await producedResult(r.resource_type, r.job_id)) {
        await (customer ? markCustomerJobQuotaSpent : markJobQuotaSpent)(r.job_id, r.resource_type);
        result.spent++;
      } else {
        await (customer ? refundCustomerJobQuota : refundJobQuota)(r.job_id, r.resource_type);
        result.refunded++;
      }
    } catch (err) {
      // One bad row must not stop the rest; it stays RESERVED and the next run retries it.
      result.failed++;
      console.error(`[quota-sweep] could not settle ${r.resource_type} job ${r.job_id}:`, err);
    }
  }

  console.info(
    `[quota-sweep] scanned=${rows.length} spent=${result.spent} refunded=${result.refunded} failed=${result.failed}`,
  );
  return result;
}
