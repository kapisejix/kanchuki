import { prisma } from '@kanchuki/db';
import { addTaggingJob } from './index.js';

/**
 * Backfill for the 2026-08-03 AI-fields launch (migration 043).
 *
 * Products tagged BEFORE that build went out got category/color/fabric/etc.
 * but no name/subtype/SKU/description — the old tagger prompt didn't return
 * them and the columns were null. The per-product retag endpoint
 * (`POST /products/:id/retag`) fixes one at a time; this job backfills the
 * whole cohort at once by re-enqueueing a tag-product job for every product
 * that was tagged but still has any of the four fields null.
 *
 * Safe by construction:
 *  - Only touches `ai_tagged = true` products (a product mid-tag or in an
 *    error state is left alone — its own job/retry handles it).
 *  - The tag-product handler never clobbers a retailer's manual edit (only
 *    writes fields that are still null), so re-tagging an already-edited
 *    product is harmless.
 *  - Cursor-batched + capped per run so one run can't flood the AI queue
 *    with thousands of jobs. Run it repeatedly until it reports 0 re-queued.
 *
 * Quota/credits: each re-queued job runs through the normal checkQuota +
 * reserveAiCredits gate, so a retailer whose AI_TAGGING_CALL quota is spent
 * simply has the job fail its quota check and retry/error — no surprise
 * spend.
 */

type BackfillRow = {
  id: string;
  retailer_id: string;
  photos: { url: string; r2_key: string }[];
};

const BATCH_SIZE = 50;
const DEFAULT_CAP = 250; // max jobs enqueued per run (queue flood guard)

export interface BackfillResult {
  scanned: number;
  requeued: number;
  skipped_quota_or_error: number;
  done: boolean; // true when fewer than batch_size candidates remain
}

export async function handleBackfillMissingAiFields(cap = DEFAULT_CAP): Promise<BackfillResult> {
  let requeued = 0;
  let skipped = 0;
  let cursor: string | null = null;
  let scanned = 0;

  for (;;) {
    const rows: BackfillRow[] = await prisma.product.findMany({
      where: {
        ai_tagged: true,
        deleted_at: null,
        OR: [{ name: null }, { sku: null }, { description: null }, { subtype: null }],
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        retailer_id: true,
        photos: { where: { is_primary: true }, take: 1, select: { url: true, r2_key: true } },
      },
    });

    scanned += rows.length;
    if (rows.length === 0) break;

    for (const row of rows) {
      if (requeued >= cap) return { scanned, requeued, skipped_quota_or_error: skipped, done: false };
      const photo = row.photos[0];
      if (!photo) {
        skipped += 1; // no primary photo — nothing to tag from
        continue;
      }
      // Reset to in-progress so the mobile poll re-picks it up, then queue.
      try {
        await prisma.product.update({
          where: { id: row.id },
          data: { ai_tagged: false, ai_tag_error: null },
        });
        // auto_cleanup: false — the photo was already cropped/bg-stripped at
        // first upload; re-running cleanup could re-crop a styled shot.
        await addTaggingJob({
          product_id: row.id,
          retailer_id: row.retailer_id,
          photo_url: photo.url,
          r2_key: photo.r2_key,
          auto_cleanup: false,
        });
        requeued += 1;
      } catch (err) {
        skipped += 1;
        console.error(`[backfill-missing-ai-fields] failed to queue product ${row.id}:`, err);
      }
    }

    if (rows.length < BATCH_SIZE) break;
    cursor = rows[rows.length - 1]!.id;
  }

  return { scanned, requeued, skipped_quota_or_error: skipped, done: true };
}
