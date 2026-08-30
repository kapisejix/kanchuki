// Interaction retention cron job (Task 14).
//
// Purges CustomerInteraction records older than 24 months, keeping
// purchase/enquiry interactions (valuable for CRM + Fashion DNA history).
// Runs monthly via the MAINTENANCE queue.

import { prisma } from '@kanchuki/db';

const RETENTION_MONTHS = 24;
const BATCH_SIZE = 500;

// Interaction types to keep forever (purchase history + enquiry follow-up)
const KEEP_TYPES = ['purchase', 'enquiry'];

export async function handleInteractionRetention(): Promise<{ deleted: number }> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);

  let totalDeleted = 0;
  let cursor: string | undefined;

  while (true) {
    // Find a batch of old interactions, excluding kept types
    const batch = await prisma.customerInteraction.findMany({
      where: {
        created_at: { lt: cutoff },
        type: { notIn: KEEP_TYPES },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });

    if (batch.length === 0) break;

    const ids = batch.map((r) => r.id);
    cursor = ids[ids.length - 1];

    await prisma.customerInteraction.deleteMany({
      where: { id: { in: ids } },
    });

    totalDeleted += ids.length;
  }

  console.log(`[interaction-retention] Purged ${totalDeleted} interactions older than ${RETENTION_MONTHS} months (kept purchase/enquiry)`);

  return { deleted: totalDeleted };
}
