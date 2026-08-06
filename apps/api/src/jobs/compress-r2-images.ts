import { compressImageToTarget, downloadBuffer, listObjects, uploadBuffer } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';

/**
 * Daily R2 image compression pass (maintenance cron).
 *
 * Mirrors `scripts/compress-r2-images.ts` (the manual admin tool) but runs
 * inside the API process on a BullMQ repeat schedule, so storage stays lean
 * automatically as retailers upload. Most new uploads are already ≤80KB
 * (server catalog-import path + mobile client-side compression), but bulk
 * imports, legacy objects, and anything that bypasses those paths still land
 * full-size — this job catches them within 24h.
 *
 * Behavior:
 *  - Lists the whole bucket, skips non-images and the same exclusions as the
 *    script (measurements/ for AI accuracy, /kyc/ for document legibility,
 *    backups/ and catalog-pdf which aren't display images).
 *  - Objects already ≤80KB are skipped WITHOUT downloading (cheap daily run).
 *  - Larger images are downloaded, compressed quality-first via
 *    `compressImageToTarget` (packages/ai), and overwritten IN PLACE when the
 *    result is strictly smaller — public URLs and DB references stay unchanged.
 *  - Best-effort per object: a corrupt/undownloadable image is counted and
 *    skipped, never allowed to fail the whole pass.
 *  - Memory-conscious: concurrency 2 keeps sharp's transient decode buffers
 *    bounded inside the 2GB API container.
 *  - Writes an audit entry with the full report (purge-cron pattern).
 *
 * Credentials: resolved through @kanchuki/ai's R2 client (getSecret, DB-first
 * with .env fallback). When R2_ACCOUNT_ID is unset (e.g. local dev without R2
 * config) the pass logs a warning and returns without touching anything —
 * same "expected environment gap" shape as the backup job's no-Docker path.
 */

// JPEG only, deliberately: compressImageToTarget always outputs JPEG, and
// storing JPEG bytes under a .png/.webp key with its original content type
// breaks strict decoders — the same rule the mobile client-side compressor
// follows. PNG/WebP sources are treated as skipped (counted, not compressed).
const IMAGE_EXTS = ['.jpg', '.jpeg'];
const EXCLUDE_SUBSTRINGS = ['measurements/', '/kyc/', 'backups/', 'catalog-pdf'];
const CONCURRENCY = 2; // sharp decode buffers — bounded RSS on the 2GB container
const MAX_BYTES = 80 * 1024; // must match compressImageToTarget's default budget

interface Outcome {
  key: string;
  before: number;
  after: number;
  kind: 'compressed' | 'already_fine' | 'skipped' | 'failed';
}

export interface CompressR2Result {
  scanned: number;
  compressed: number;
  already_fine: number;
  skipped: number;
  failed: number;
  bytes_before: number;
  bytes_after: number;
  bytes_saved: number;
  /** True when R2 wasn't configured and the pass was skipped entirely. */
  skipped_unconfigured: boolean;
}

function isImageKey(key: string): boolean {
  const lower = key.toLowerCase();
  return IMAGE_EXTS.some((ext) => lower.endsWith(ext));
}

function isExcluded(key: string): boolean {
  return EXCLUDE_SUBSTRINGS.some((s) => key.includes(s));
}

export async function handleCompressR2Images(): Promise<CompressR2Result> {
  const base: CompressR2Result = {
    scanned: 0,
    compressed: 0,
    already_fine: 0,
    skipped: 0,
    failed: 0,
    bytes_before: 0,
    bytes_after: 0,
    bytes_saved: 0,
    skipped_unconfigured: false,
  };

  if (!process.env.R2_ACCOUNT_ID) {
    console.warn(
      '[compress-r2-images] R2_ACCOUNT_ID not set — compression pass skipped (expected where R2 is unconfigured).',
    );
    return { ...base, skipped_unconfigured: true };
  }

  const start = Date.now();
  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log('[compress-r2-images] Listing R2 objects...');

  const objects = await listObjects();
  base.scanned = objects.length;
  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log(
    `[compress-r2-images] Found ${objects.length} objects. Compressing (concurrency ${CONCURRENCY})...`,
  );

  const outcomes: Outcome[] = [];
  let cursor = 0;

  const processObject = async (key: string, size: number): Promise<void> => {
    if (!isImageKey(key) || isExcluded(key)) {
      outcomes.push({ key, before: size, after: size, kind: 'skipped' });
      return;
    }
    if (size <= MAX_BYTES) {
      // Already within budget — don't download, don't re-encode (a re-encode
      // of a near-80KB image can even grow it; untouched is strictly better).
      outcomes.push({ key, before: size, after: size, kind: 'already_fine' });
      return;
    }
    try {
      const buf = await downloadBuffer(key);
      const result = await compressImageToTarget(buf);
      if (result.unchanged || result.buffer.length >= buf.length) {
        outcomes.push({ key, before: size, after: size, kind: 'already_fine' });
        return;
      }
      // Overwrite in place — key unchanged, so URLs/DB references stay valid.
      // Only JPEG keys reach here (IMAGE_EXTS above), so the content type is
      // always image/jpeg — matches what the compressor encodes.
      await uploadBuffer(key, result.buffer, 'image/jpeg');
      outcomes.push({ key, before: size, after: result.buffer.length, kind: 'compressed' });
    } catch (err) {
      outcomes.push({ key, before: size, after: size, kind: 'failed' });
      console.error(`[compress-r2-images] failed on ${key}:`, (err as Error).message);
    }
  };

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < objects.length) {
      const item = objects[cursor]!;
      cursor += 1;
      await processObject(item.key, item.size);
    }
  });
  await Promise.all(workers);

  for (const o of outcomes) {
    base[o.kind] += 1;
    if (o.kind === 'compressed' || o.kind === 'already_fine') {
      base.bytes_before += o.before;
      base.bytes_after += o.after;
    }
  }
  base.bytes_saved = base.bytes_before - base.bytes_after;

  // Audit entry (purge-cron pattern) so admins can see the daily report.
  try {
    await prisma.auditLog.create({
      data: {
        actor_type: 'system',
        action: 'COMPRESS_R2_IMAGES',
        resource_type: 'R2Storage',
        metadata: {
          ...base,
          duration_seconds: (Date.now() - start) / 1000,
          max_bytes: MAX_BYTES,
          exclusions: EXCLUDE_SUBSTRINGS,
        },
      },
    });
  } catch (err) {
    console.error('[compress-r2-images] failed to write audit log:', err);
  }

  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log(
    `[compress-r2-images] Complete in ${((Date.now() - start) / 1000).toFixed(1)}s — ` +
      `${base.compressed} compressed, ${base.already_fine} already ≤80KB, ${base.skipped} skipped, ` +
      `${base.failed} failed | saved ${base.bytes_saved} bytes`,
  );

  return base;
}
