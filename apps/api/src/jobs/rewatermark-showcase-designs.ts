// ─── Re-watermark Suits Designs job ──────────────────────────────
// Runs on the maintenance queue when the admin changes the platform
// watermark config (logo / opacity / scale / gravity) — docs/tasks/
// suits-designs.md §6: "Logo/opacity change (admin): background
// re-watermark from original_r2_key — deferred job, not inline."
//
// Every showcase design keeps its RAW upload (original_r2_key) so the final
// watermarked image can be regenerated when the stamp config changes. This
// job walks those rows, re-composites with the CURRENT config (and the
// retailer's CURRENT logo, resolved per row at run time), and uploads each
// final under a NEW key — same as the photo-replace path — so CDN/public
// caches can never serve stale bytes for the old URL. The raw is never
// deleted (that's what makes a future re-watermark possible).
//
// Behavior:
//  - Rows with no original_r2_key can't be re-composited → skipped (counted).
//  - Inactive rows are re-watermarked too — toggling one back on must not
//    resurface a stale logo.
//  - Best-effort per row: a corrupt raw / failed composite is counted and
//    skipped, never allowed to fail the whole pass.
//  - Old final objects are deleted only after the new final + DB row land
//    (best effort on R2, same as photo replace).
//  - Writes one audit entry with the pass report (compress-r2 pattern).
//  - No-ops cleanly when R2 isn't configured (expected env gap, local dev).
//
// Idempotency note: re-running is safe — every row gets re-composited to a
// fresh key regardless of prior state; the previous final was already
// deleted on the first pass, and the raw is untouched.

import { deleteObject, publicUrl } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { R2_PATHS } from '@kanchuki/shared';
import { createId } from '@paralleldrive/cuid2';
import { watermarkShowcaseDesign } from '../lib/showcase-watermark.js';
import { getMaintenanceQueue } from './queue.js';

// Only ever delete keys under the owner prefix this module could have
// minted as finals — never an admin-typed or foreign key.
const FINAL_PREFIX = 'showcase-designs/';

export interface RewatermarkShowcaseDesignsJobData {
  /** Who asked — surfaced in the audit metadata (admin settings PUT). */
  triggered_by?: 'admin-config-change';
}

export interface RewatermarkShowcaseDesignsResult {
  scanned: number;
  rewatermarked: number;
  skipped_no_original: number;
  failed: number;
  /** True when R2 wasn't configured and the pass was skipped entirely. */
  skipped_unconfigured: boolean;
}

/** Enqueue a re-watermark pass on the shared maintenance queue. */
export async function addRewatermarkShowcaseDesignsJob(
  data?: RewatermarkShowcaseDesignsJobData,
): Promise<void> {
  await getMaintenanceQueue().add('rewatermark-showcase-designs', data ?? {}, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 20 },
  });
}

/**
 * Run one re-watermark pass: every row with a raw upload gets its final
 * re-composited under a new key with the current config + logos.
 */
export async function handleRewatermarkShowcaseDesigns(options?: {
  triggered_by?: RewatermarkShowcaseDesignsJobData['triggered_by'];
}): Promise<RewatermarkShowcaseDesignsResult> {
  const base: RewatermarkShowcaseDesignsResult = {
    scanned: 0,
    rewatermarked: 0,
    skipped_no_original: 0,
    failed: 0,
    skipped_unconfigured: false,
  };

  if (!process.env.R2_ACCOUNT_ID) {
    console.warn(
      '[rewatermark-showcase-designs] R2_ACCOUNT_ID not set — pass skipped (expected where R2 is unconfigured).',
    );
    return { ...base, skipped_unconfigured: true };
  }

  const start = Date.now();

  const rows = await prisma.showcaseDesign.findMany({
    where: { original_r2_key: { not: null } },
    select: { id: true, retailer_id: true, r2_key: true, original_r2_key: true },
    orderBy: { created_at: 'asc' },
  });
  base.scanned = rows.length;

  // biome-ignore lint/suspicious/noConsoleLog: admin background job logging
  console.log(`[rewatermark-showcase-designs] Re-watermarking ${rows.length} designs...`);

  for (const row of rows) {
    if (!row.original_r2_key) {
      base.skipped_no_original += 1;
      continue;
    }
    try {
      const ownerKey = row.retailer_id ?? 'global';
      const newFinalKey = R2_PATHS.showcaseDesign(ownerKey, `${createId()}.jpg`);

      // Re-composite with the CURRENT config — resolveWatermark reads the
      // live settings blob + the retailer's live logo per row, so a platform
      // logo change and a retailer rebrand both land correctly.
      await watermarkShowcaseDesign({
        rawR2Key: row.original_r2_key,
        finalR2Key: newFinalKey,
        ownerRetailerId: row.retailer_id,
      });

      await prisma.showcaseDesign.update({
        where: { id: row.id },
        data: { r2_key: newFinalKey, image_url: publicUrl(newFinalKey) },
      });

      // Old final is deletable only now — the new final + DB row both landed.
      // Never the original (kept for the next re-watermark).
      if (row.r2_key && row.r2_key !== newFinalKey && row.r2_key.startsWith(FINAL_PREFIX)) {
        await deleteObject(row.r2_key).catch(() => undefined);
      }
      base.rewatermarked += 1;
    } catch (err) {
      base.failed += 1;
      console.error(
        `[rewatermark-showcase-designs] failed on design ${row.id}:`,
        (err as Error).message,
      );
    }
  }

  // Audit entry (compress-r2-images pattern) so the admin can see the pass.
  try {
    await prisma.auditLog.create({
      data: {
        actor_type: 'system',
        action: 'REWATERMARK_SHOWCASE_DESIGNS',
        resource_type: 'ShowcaseDesign',
        metadata: {
          ...base,
          triggered_by: options?.triggered_by ?? 'admin-config-change',
          duration_seconds: (Date.now() - start) / 1000,
        },
      },
    });
  } catch (err) {
    console.error('[rewatermark-showcase-designs] failed to write audit log:', err);
  }

  // biome-ignore lint/suspicious/noConsoleLog: admin background job logging
  console.log(
    `[rewatermark-showcase-designs] Complete in ${((Date.now() - start) / 1000).toFixed(1)}s — ` +
      `${base.rewatermarked} re-watermarked, ${base.skipped_no_original} skipped (no raw), ` +
      `${base.failed} failed`,
  );

  return base;
}
