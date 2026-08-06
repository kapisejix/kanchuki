import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { addCompressR2ImagesJob } from '../../jobs/index.js';
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
  // Per-run savings report from the COMPRESS_R2_IMAGES audit trail.
  // Daily cron = ~1 row/day; 120 rows covers ~4 months. Newest first.
  server.get('/storage-report', async () => {
    const rows = await prisma.auditLog.findMany({
      where: { action: 'COMPRESS_R2_IMAGES' },
      orderBy: { created_at: 'desc' },
      take: 120,
      select: { id: true, created_at: true, metadata: true },
    });

    const runs = rows.map((r) => parseCompressionRun(r.id, r.created_at, r.metadata));
    return { data: { summary: summarizeCompressionRuns(runs), runs } };
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
};
