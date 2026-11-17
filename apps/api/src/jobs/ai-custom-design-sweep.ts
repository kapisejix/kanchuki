// RC-102 follow-up — hourly sweep for ai_custom_designs rows still PENDING long after their job
// should have ended (process died mid-job, or markFailed's own write failed). quota-reservation-
// sweep settles the quota slot but never touches this row, so the retailer's poll would show
// PENDING forever. Same 6 h cutoff as the quota sweep. One idempotent UPDATE; a DB error
// propagates so BullMQ marks the run failed.
import { prisma } from '@kanchuki/db';
import { GENERIC_FAILURE } from './ai-custom-design.js';
import { RESERVATION_MIN_AGE_MS } from './quota-reservation-sweep.js';

export async function handleAiCustomDesignSweep(now = new Date()): Promise<{ failed: number }> {
  const { count } = await prisma.aiCustomDesign.updateMany({
    where: {
      status: 'PENDING',
      created_at: { lt: new Date(now.getTime() - RESERVATION_MIN_AGE_MS) },
    },
    data: { status: 'FAILED', error: GENERIC_FAILURE },
  });
  console.info(`[ai-custom-design-sweep] failed=${count}`);
  return { failed: count };
}
