// AI occasion backfill: fills products.occasions for products tagged before occasion was
// re-added to the tagger. One-off and owner-run (apps/api/scripts/occasion-backfill.ts) —
// deliberately NOT a repeating cron. Each product costs one text-only AI call.
//
// Only rows with NULL or empty occasions; the write re-checks that, so a retailer or a
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

  // The summary prints even when an AI call aborts the run, so a partial run is never silent.
  try {
    while (result.scanned < limit) {
      // products.occasions is a nullable TEXT[] with no default, and nothing has written it
      // since 2026-08-10, so those rows are NULL. Prisma's `isEmpty` is `= '{}'` and skips
      // NULL, so candidate ids come from raw SQL.
      const ids = (
        await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM products
        WHERE ai_tagged AND deleted_at IS NULL
          AND (occasions IS NULL OR cardinality(occasions) = 0)
          AND id > ${cursor ?? ''}
        ORDER BY id ASC
        LIMIT ${Math.min(BATCH_SIZE, limit - result.scanned)}`
      ).map((r) => r.id);
      if (ids.length === 0) break;

      const batch = await prisma.product.findMany({
        where: { id: { in: ids } },
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
        if (result.scanned % 10 === 0) {
          console.info(
            `[occasion-backfill] progress scanned=${result.scanned} updated=${result.updated} empty=${result.empty}`,
          );
        }
        if (occasions.length === 0) {
          result.empty++;
        } else if (dryRun) {
          result.samples.push({ id: p.id, category: p.category, subtype: p.subtype, occasions });
        } else {
          // Re-check NULL/empty in the write so a retailer edit or a concurrent re-tag wins.
          const changed = await prisma.$executeRaw`
          UPDATE products SET occasions = ${occasions}::text[]
          WHERE id = ${p.id} AND (occasions IS NULL OR cardinality(occasions) = 0)`;
          if (changed > 0) {
            result.updated++;
            await addEmbeddingJob({ product_id: p.id, retailer_id: p.retailer_id });
          }
        }
      }
      cursor = ids[ids.length - 1];
    }
  } finally {
    console.info(
      `[occasion-backfill] dryRun=${dryRun} scanned=${result.scanned} updated=${result.updated} empty=${result.empty}`,
    );
  }
  return result;
}
