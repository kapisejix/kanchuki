import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
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
    last_run_ok:
      runs[0] && !runs[0].skipped_unconfigured ? runs[0].failed === 0 : null,
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
};
