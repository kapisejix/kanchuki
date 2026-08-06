import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { addCompressR2ImagesJob, addMeasureR2StorageJob } from '../../jobs/index.js';
import { AppError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

/**
 * Storage report — reads the COMPRESS_R2_IMAGES audit entries written by the
 * daily R2 compression maintenance cron (apps/api/src/jobs/compress-r2-images.ts)
 * and shapes them into a per-run savings report with a rollup summary.
 *
 * Each cron run writes one AuditLog row with action COMPRESS_R2_IMAGES and
 * metadata = CompressR2Result + { duration_seconds, max_bytes, exclusions }.
 * The parse/summary functions below are pure so the report math is unit-testable.
 */

export interface CompressionRun {
  id: string;
  created_at: string;
  /** 'admin' = manual trigger from this page, 'schedule' = the 4:30 AM cron */
  triggered_by: 'schedule' | 'admin';
  /** true when R2 was unconfigured and the pass no-op'd (no bucket scan) */
  skipped_unconfigured: boolean;
  scanned: number;
  compressed: number;
  already_fine: number;
  skipped: number;
  failed: number;
  bytes_before: number;
  bytes_after: number;
  bytes_saved: number;
  duration_seconds: number;
}

export interface StoragePrefixStat {
  prefix: string;
  count: number;
  bytes: number;
  image_bytes: number;
}

export interface StorageMeasurement {
  /** audit row id — used by the page to detect a fresh measurement on poll */
  id: string;
  measured_at: string;
  bucket: string;
  total_objects: number;
  total_bytes: number;
  image_objects: number;
  image_bytes: number;
  /** percentage of total bytes that are image-format (0–100) */
  image_pct: number;
  by_prefix: StoragePrefixStat[];
}

export interface CompressionSummary {
  total_runs: number;
  /** runs that actually scanned the bucket (skipped_unconfigured excluded) */
  active_runs: number;
  unconfigured_runs: number;
  total_scanned: number;
  total_compressed: number;
  total_bytes_before: number;
  total_bytes_after: number;
  total_bytes_saved: number;
  avg_bytes_saved_per_run: number;
  last_run_at: string | null;
  last_run_ok: boolean | null;
}

/**
 * Defensive coercion of a possibly-missing JSON metadata number.
 * Note: this summarizes ONLY the runs it is handed (the route passes the most
 * recent 120) — the rollup is a window, not full history.
 */
function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function parseCompressionRun(
  id: string,
  createdAt: Date,
  metadata: unknown,
): CompressionRun {
  const m = (metadata ?? {}) as Record<string, unknown>;
  return {
    id,
    created_at: createdAt.toISOString(),
    triggered_by: m.triggered_by === 'admin' ? 'admin' : 'schedule',
    skipped_unconfigured: m.skipped_unconfigured === true,
    scanned: num(m.scanned),
    compressed: num(m.compressed),
    already_fine: num(m.already_fine),
    skipped: num(m.skipped),
    failed: num(m.failed),
    bytes_before: num(m.bytes_before),
    bytes_after: num(m.bytes_after),
    bytes_saved: num(m.bytes_saved),
    duration_seconds: num(m.duration_seconds),
  };
}

/**
 * Parse an R2_STORAGE_MEASURE audit entry (written by the measure-r2-storage
 * maintenance job) into a typed live-storage snapshot. Same defensive coercion
 * as parseCompressionRun.
 */
export function parseStorageMeasurement(
  id: string,
  createdAt: Date,
  metadata: unknown,
): StorageMeasurement {
  const m = (metadata ?? {}) as Record<string, unknown>;
  const rawPrefix = Array.isArray(m.by_prefix) ? m.by_prefix : [];
  return {
    id,
    measured_at: createdAt.toISOString(),
    bucket: typeof m.bucket === 'string' ? m.bucket : 'unknown',
    total_objects: num(m.total_objects),
    total_bytes: num(m.total_bytes),
    image_objects: num(m.image_objects),
    image_bytes: num(m.image_bytes),
    image_pct: num(m.image_pct),
    by_prefix: rawPrefix.map((p) => {
      const row = (p ?? {}) as Record<string, unknown>;
      return {
        prefix: typeof row.prefix === 'string' ? row.prefix : '(root)',
        count: num(row.count),
        bytes: num(row.bytes),
        image_bytes: num(row.image_bytes),
      };
    }),
  };
}

export function summarizeCompressionRuns(runs: CompressionRun[]): CompressionSummary {
  const active = runs.filter((r) => !r.skipped_unconfigured);
  const totalBytesSaved = runs.reduce((s, r) => s + r.bytes_saved, 0);
  return {
    total_runs: runs.length,
    active_runs: active.length,
    unconfigured_runs: runs.length - active.length,
    total_scanned: active.reduce((s, r) => s + r.scanned, 0),
    total_compressed: active.reduce((s, r) => s + r.compressed, 0),
    total_bytes_before: active.reduce((s, r) => s + r.bytes_before, 0),
    total_bytes_after: active.reduce((s, r) => s + r.bytes_after, 0),
    total_bytes_saved: totalBytesSaved,
    avg_bytes_saved_per_run: active.length > 0 ? Math.round(totalBytesSaved / active.length) : 0,
    last_run_at: runs[0]?.created_at ?? null,
    // null when there is no run OR the latest run was an unconfigured no-op —
    // an env gap is not a failure, and the card must not show an amber alert.
    last_run_ok: runs[0] && !runs[0].skipped_unconfigured ? runs[0].failed === 0 : null,
  };
}

export const adminStorageRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/storage-report ────────────────────────────────
  // Per-run savings report from the COMPRESS_R2_IMAGES audit trail, plus the
  // latest live R2 storage measurement (R2_STORAGE_MEASURE audit entry).
  // Daily cron = ~1 row/day; 120 rows covers ~4 months. Newest first.
  server.get('/storage-report', async () => {
    const [rows, measureRows] = await Promise.all([
      prisma.auditLog.findMany({
        where: { action: 'COMPRESS_R2_IMAGES' },
        orderBy: { created_at: 'desc' },
        take: 120,
        select: { id: true, created_at: true, metadata: true },
      }),
      prisma.auditLog.findMany({
        where: { action: 'R2_STORAGE_MEASURE' },
        orderBy: { created_at: 'desc' },
        take: 1,
        select: { id: true, created_at: true, metadata: true },
      }),
    ]);

    const runs = rows.map((r) => parseCompressionRun(r.id, r.created_at, r.metadata));
    const latest = measureRows[0];
    return {
      data: {
        summary: summarizeCompressionRuns(runs),
        runs,
        live_measurement: latest
          ? parseStorageMeasurement(latest.id, latest.created_at, latest.metadata)
          : null,
      },
    };
  });

  // ─── POST /admin/storage-report/run ─────────────────────────────
  // Manual "Run compression now" — enqueues the same maintenance job the
  // 4:30 AM cron fires, so an admin can force a pass right after a bulk
  // import instead of waiting for the schedule. The job writes its usual
  // COMPRESS_R2_IMAGES audit entry with triggered_by: 'admin', which this
  // report page surfaces as a manual run. R2 unconfigured is fine — the job
  // no-ops with a skipped_unconfigured audit entry rather than erroring.
  server.post('/storage-report/run', async (request) => {
    try {
      await addCompressR2ImagesJob({ triggered_by: 'admin' });
    } catch (err) {
      request.log.error({ err }, 'Failed to enqueue compression job from admin UI');
      throw new AppError(
        'QUEUE_UNAVAILABLE',
        'The compression job queue is unavailable (Redis down?). Try again shortly.',
        503,
      );
    }

    // Audit the admin intent (best-effort — the run's own audit entry is the
    // source of truth for the report; this one just records who pressed it).
    try {
      await prisma.auditLog.create({
        data: {
          actor_type: 'admin',
          action: 'COMPRESS_R2_IMAGES_RUN',
          resource_type: 'R2Storage',
          metadata: { triggered_from: 'admin-ui' },
          ip_address: request.ip,
        },
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to audit manual compression trigger');
    }

    request.log.info('Compression pass enqueued from admin UI');
    return {
      data: {
        queued: true,
        message:
          'Compression pass enqueued — the maintenance worker will run it and the result appears in the table below when finished.',
      },
    };
  });

  // ─── POST /admin/storage-report/measure ─────────────────────────
  // Manual "Re-measure" — enqueues the measure-r2-storage maintenance job,
  // which lists the whole bucket and writes an R2_STORAGE_MEASURE audit entry
  // with the live totals (total/object count, image split, per-prefix
  // breakdown). Same queue + poll pattern as the compression run button.
  server.post('/storage-report/measure', async (request) => {
    try {
      await addMeasureR2StorageJob();
    } catch (err) {
      request.log.error({ err }, 'Failed to enqueue storage measurement job from admin UI');
      throw new AppError(
        'QUEUE_UNAVAILABLE',
        'The storage measurement queue is unavailable (Redis down?). Try again shortly.',
        503,
      );
    }

    try {
      await prisma.auditLog.create({
        data: {
          actor_type: 'admin',
          action: 'R2_STORAGE_MEASURE_RUN',
          resource_type: 'R2Storage',
          metadata: { triggered_from: 'admin-ui' },
          ip_address: request.ip,
        },
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to audit manual storage measurement');
    }

    request.log.info('Storage measurement enqueued from admin UI');
    return {
      data: {
        queued: true,
        message:
          'Storage measurement enqueued — the worker will list the bucket and the live totals update when it finishes.',
      },
    };
  });
};
