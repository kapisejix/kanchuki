import { measureR2Storage } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';

/**
 * Live R2 storage measurement job (maintenance queue).
 *
 * Mirrors `scripts/measure-r2-storage.ts` (the manual CLI) inside the API
 * process: lists the whole bucket and writes an R2_STORAGE_MEASURE audit
 * entry with the totals (total/object count, image split, per-prefix
 * breakdown). The admin Storage Report page reads that entry to show live
 * storage next to the compression-savings report, and its "Re-measure now"
 * button enqueues this job on demand.
 *
 * Throws when R2 is unconfigured (R2_ACCOUNT_ID missing) — the worker's
 * 'failed' handler logs it and the page's poll times out with a neutral
 * message, same shape as a compression-pass failure.
 */
export async function handleMeasureR2Storage(): Promise<void> {
  const start = Date.now();
  const measurement = await measureR2Storage();
  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log(
    `[measure-r2-storage] ${measurement.bucket}: ${measurement.total_objects} objects, ` +
      `${measurement.total_bytes} bytes (${measurement.image_bytes} image bytes) in ` +
      `${((Date.now() - start) / 1000).toFixed(1)}s`,
  );

  // Audit entry so the Storage Report page (and activity feed) can show the
  // measurement; best-effort like the compression job's own audit write.
  try {
    await prisma.auditLog.create({
      data: {
        actor_type: 'system',
        action: 'R2_STORAGE_MEASURE',
        resource_type: 'R2Storage',
        metadata: {
          ...measurement,
          duration_seconds: (Date.now() - start) / 1000,
        },
      },
    });
  } catch (err) {
    console.error('[measure-r2-storage] failed to write audit log:', err);
  }
}
