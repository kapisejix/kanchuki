// Task 17: ProductEmbedding backfill sweep.
//
// Finds active products that don't have a ProductEmbedding row and enqueues
// generate-embedding jobs for them. Runs weekly via the MAINTENANCE queue
// to catch any products that slipped through (bulk uploads, race conditions).

import { prisma } from '@kanchuki/db';
import { addEmbeddingJob } from './index.js';

const BATCH_SIZE = 50;

export async function handleEmbeddingBackfill(): Promise<{ enqueued: number }> {
  let totalEnqueued = 0;
  let cursor: string | undefined;

  while (true) {
    // Find active products without embeddings
    const batch = await prisma.product.findMany({
      where: {
        status: 'AVAILABLE',
        deleted_at: null,
        embedding: null,
        ai_tagged: true, // only backfill products that have been AI-tagged
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true, retailer_id: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });

    if (batch.length === 0) break;

    for (const product of batch) {
      await addEmbeddingJob({
        product_id: product.id,
        retailer_id: product.retailer_id,
      });
      totalEnqueued++;
    }

    cursor = batch[batch.length - 1]?.id;
  }

  console.log(`[embedding-backfill] Enqueued ${totalEnqueued} embedding jobs`);

  return { enqueued: totalEnqueued };
}
