import { getHeapStatistics } from 'node:v8';
import type { FastifyPluginAsync } from 'fastify';
import { adminAuthPreHandler } from '../admin-auth.js';

/**
 * Server memory — live process memory plus a 24 h in-process history, so the
 * Railway RAM bill can be attributed from the admin panel (see
 * docs/tasks/pending/improvments-railway.md). Read-only, Super Admin only
 * (segment `server-memory` in packages/shared admin-access.ts).
 *
 * rss        = everything the OS charges the container for
 * heapTotal  = V8 JS heap committed;  heapUsed = live JS objects in it
 * external   = native memory tied to JS objects (Buffers, sharp, etc.)
 * native_other = rss - heapTotal - external → Prisma engine, libvips, glibc
 *                arenas, loaded code. A big number here = native, not a JS leak.
 *
 * History is per process: it resets on every deploy/restart/wake-from-sleep.
 * ponytail: in-memory ring buffer, no DB writes; persist to AuditLog only if a
 * history that survives restarts is ever needed.
 */

export interface MemorySample {
  at: string;
  rss_mb: number;
  heap_used_mb: number;
  heap_total_mb: number;
  external_mb: number;
  array_buffers_mb: number;
  native_other_mb: number;
}

export const SAMPLE_INTERVAL_MS = 5 * 60_000;
export const MAX_SAMPLES = 288; // 24 h at 5 min

const history: MemorySample[] = [];
const mb = (bytes: number): number => Math.round((bytes / 1048576) * 10) / 10;

export function takeMemorySample(now: Date = new Date()): MemorySample {
  const m = process.memoryUsage();
  return {
    at: now.toISOString(),
    rss_mb: mb(m.rss),
    heap_used_mb: mb(m.heapUsed),
    heap_total_mb: mb(m.heapTotal),
    external_mb: mb(m.external),
    array_buffers_mb: mb(m.arrayBuffers),
    native_other_mb: Math.max(0, mb(m.rss - m.heapTotal - m.external)),
  };
}

export function recordMemorySample(): MemorySample {
  const sample = takeMemorySample();
  history.push(sample);
  if (history.length > MAX_SAMPLES) history.shift();
  return sample;
}

export function getMemoryHistory(): MemorySample[] {
  return history.slice();
}

let timer: NodeJS.Timeout | null = null;

/** Idempotent. unref'd so it never keeps the process (or tests) alive. */
export function startMemorySampler(): void {
  if (timer) return;
  recordMemorySample();
  timer = setInterval(recordMemorySample, SAMPLE_INTERVAL_MS);
  timer.unref();
}

export const adminServerMemoryRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);
  startMemorySampler();

  // ─── GET /admin/server-memory ─────────────────────────────────
  server.get('/server-memory', async () => ({
    data: {
      now: takeMemorySample(),
      history: getMemoryHistory(),
      heap_limit_mb: mb(getHeapStatistics().heap_size_limit),
      uptime_s: Math.round(process.uptime()),
      node: process.version,
      sample_interval_s: SAMPLE_INTERVAL_MS / 1000,
    },
  }));
};
