// AI occasion backfill: fills products.occasions for products tagged before occasion was
// re-added to the tagger. One-off and owner-run (apps/api/scripts/occasion-backfill.ts) —
// deliberately NOT a repeating cron. Each product costs one text-only AI call.
//
// Only rows with an empty occasions array; the write re-checks that, so a retailer or a
// concurrent re-tag is never overwritten and a re-run touches nothing it already filled.
// A failed AI call FAILS the job (RC-059/060): skipping would report a clean "success".
// Calls are platform-paid: no onProviderUsed, so no retailer AI_TAGGING_CALL quota drain.
// occasions feeds the embedding text, so each updated product is queued for re-embedding
// (the weekly embedding-backfill only fills MISSING embeddings, it never refreshes).

import { suggestOccasionsFromText } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { addEmbeddingJob } from './index.js';

const BATCH_SIZE = 50;

export interface OccasionBackfillOpts {
  /** Max products to look at (use ~30 + dryRun for the human-check sample). */
  limit?: number;
  /** Call the AI and report, but write nothing. */
  dryRun?: boolean;
}

export interface OccasionBackfillResult {
  scanned: number;
  updated: number;
  empty: number;
  samples: { id: string; category: string | null; subtype: string | null; occasions: string[] }[];
}

export async function handleOccasionBackfill(
  opts: OccasionBackfillOpts = {},
): Promise<OccasionBackfillResult> {
  const { limit = Number.POSITIVE_INFINITY, dryRun = false } = opts;
  const result: OccasionBackfillResult = { scanned: 0, updated: 0, empty: 0, samples: [] };
  let cursor: string | undefined;

  while (result.scanned < limit) {
    const batch = await prisma.product.findMany({
      where: {
        ai_tagged: true,
        deleted_at: null,
        occasions: { isEmpty: true },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: {
        id: true,
        retailer_id: true,
        category: true,
        subtype: true,
        pattern: true,
        styles: true,
        fabrics: true,
        embellishments: true,
        search_tags: true,
      },
      orderBy: { id: 'asc' },
      take: Math.min(BATCH_SIZE, limit - result.scanned),
    });
    if (batch.length === 0) break;

    for (const p of batch) {
      const occasions = await suggestOccasionsFromText(p);
      result.scanned++;
      if (occasions.length === 0) {
        result.empty++;
      } else if (dryRun) {
        result.samples.push({ id: p.id, category: p.category, subtype: p.subtype, occasions });
      } else {
        const res = await prisma.product.updateMany({
          where: { id: p.id, occasions: { isEmpty: true } },
          data: { occasions },
        });
        if (res.count > 0) {
          result.updated++;
          await addEmbeddingJob({ product_id: p.id, retailer_id: p.retailer_id });
        }
      }
    }
    cursor = batch[batch.length - 1]?.id;
  }

  console.info(
    `[occasion-backfill] dryRun=${dryRun} scanned=${result.scanned} updated=${result.updated} empty=${result.empty}`,
  );
  return result;
}
