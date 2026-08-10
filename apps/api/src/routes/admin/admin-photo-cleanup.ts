// Admin test page backend for scripts/batch-clean-photos.py (F: standalone
// product-photo cleanup script, see CLAUDE.md 2026-08-05 entry). Shells out
// to the existing, already-verified Python script instead of reimplementing
// bg-removal/shadow/shine in TypeScript — one behavior, one place.
// The Python discovery + run serialization live in lib/photo-cleanup-runner.ts
// (sole shared runner — the retailer-facing pro-cleanup route that also used
// it was removed 2026-08-09 along with the mobile Pro capture mode).
import { randomUUID } from 'node:crypto';

import type { FastifyPluginAsync } from 'fastify';

import { compressImageToTarget, publicUrl, uploadBuffer } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { R2_PATHS } from '@kanchuki/shared';
import { z } from 'zod';
import { addAdminTryOnJob } from '../../jobs/index.js';
import { runPhotoCleanup, serializePhotoCleanup } from '../../lib/photo-cleanup-runner.js';
import { AppError, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

export interface TryOnFeedRow {
  id: string;
  job_id: string;
  status: 'completed' | 'failed';
  result_url: string | null;
  error: string | null;
  model_url: string | null;
  product_url: string | null;
  category: string;
  duration_ms: number | null;
  ran_at: string;
}

/**
 * Defensive parse of an ADMIN_TRYON audit entry into a typed feed row — same
 * pattern as parseCompressionRun in admin-storage.ts. Failure rows carry an
 * error message; rows without a result_url are treated as failed so the page
 * never renders a broken image tile.
 */
export function parseTryOnResult(id: string, createdAt: Date, metadata: unknown): TryOnFeedRow {
  const m = (metadata ?? {}) as Record<string, unknown>;
  // Narrow through locals — TS can't narrow m.result_url through the aliased
  // hasResult const (it's unknown under Record<string, unknown>).
  const resultUrl = typeof m.result_url === 'string' ? m.result_url : null;
  const isCompleted = m.status === 'completed' && resultUrl !== null;
  return {
    id,
    job_id: typeof m.job_id === 'string' ? m.job_id : '',
    status: isCompleted ? 'completed' : 'failed',
    result_url: resultUrl,
    error: typeof m.error === 'string' ? m.error : null,
    model_url: typeof m.model_url === 'string' ? m.model_url : null,
    product_url: typeof m.product_url === 'string' ? m.product_url : null,
    category: typeof m.category === 'string' ? m.category : 'tops',
    duration_ms: typeof m.duration_ms === 'number' ? m.duration_ms : null,
    ran_at: createdAt.toISOString(),
  };
}

export const adminPhotoCleanupRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── POST /admin/photo-cleanup/run ────────────────────────────────
  // Runs the standalone cleanup script against an uploaded product photo +
  // background image (both already-uploaded R2 URLs — client gets there via
  // the existing /admin/background-images/upload-url presign endpoint, no
  // new upload plumbing needed). Sample/reference image stays client-side
  // only — it's a visual target, never fed into the script.
  //
  // The whole handler runs inside serializeCleanup(): only one Python
  // cleanup process (and thus one onnx model in memory) exists at a time.
  server.post('/photo-cleanup/run', async (request) =>
    serializePhotoCleanup(async () => {
      const body = z
        .object({
          product_url: z.string().url(),
          background_url: z.string().url(),
          shine: z.boolean().default(false),
          blur: z.number().int().min(1).max(100).optional(),
          // Ghost mannequin: fills the hollow neckline/sleeve/waist gaps in
          // the garment silhouette via local LaMa inpainting (no 3rd-party
          // API/key — see docs/photo-feature/ghost-mannequin-research.md
          // for why the earlier Snappyit integration was dead on arrival).
          // Passed straight through to batch-clean-photos.py's
          // --ghost-mannequin flag, which forces composite mode (blur is
          // ignored when set).
          ghost_mannequin: z.boolean().default(false),
          // Pixel rect (x1,y1,x2,y2) to isolate the subject before rembg —
          // fixes the documented rembg failure mode where a second
          // garment/prop in frame gets kept as "foreground" too.
          crop: z
            .object({
              x1: z.number().int(),
              y1: z.number().int(),
              x2: z.number().int(),
              y2: z.number().int(),
            })
            .optional(),
        })
        .parse(request.body);

      // Runs through the shared runner (services/photo-cleanup sidecar in
      // production, local python in dev) — same path the removed retailer
      // pro-cleanup route used, one behavior, one place. Ghost mannequin's
      // first-ever run also loads the LaMa checkpoint on top of rembg's —
      // give it more room than the default 240s cap.
      const { jpeg } = await runPhotoCleanup(
        {
          photoUrl: body.product_url,
          bgImageUrl: body.background_url,
          blur: body.blur ?? null,
          ghostMannequin: body.ghost_mannequin,
          shine: body.shine,
          crop: body.crop ?? null,
        },
        body.ghost_mannequin ? 600_000 : 240_000,
      );

      // Compress the cleaned output to ≤80KB (quality-first) before it
      // lands in R2 — this is a test tool, the result is a preview, and
      // every stored byte counts (see scripts/compress-r2-images.ts).
      const { buffer: resultBuf } = await compressImageToTarget(jpeg);
      const key = R2_PATHS.photoCleanupTest(`${randomUUID()}.jpg`);
      await uploadBuffer(key, resultBuf, 'image/jpeg');

      return { data: { result_url: publicUrl(key) } };
    }),
  );

  // ─── POST /admin/photo-cleanup/tryon ───────────────────────────────
  // "Generate on model" — enqueues the admin-tryon maintenance job, which
  // runs the self-hosted Fashion V-Tone pipeline (services/fashion-vtone,
  // CPU-capable, Apache 2.0) to put the cleaned product photo on a model.
  // The job writes an ADMIN_TRYON audit entry when it finishes (success or
  // failure) so the page can poll the results feed for its job_id.
  server.post('/photo-cleanup/tryon', async (request) => {
    const body = z
      .object({
        job_id: z.string().min(1).max(64),
        model_url: z.string().url(),
        product_url: z.string().url(),
        category: z.enum(['tops', 'bottoms', 'one-pieces']),
      })
      .parse(request.body);

    try {
      await addAdminTryOnJob(body);
    } catch (err) {
      request.log.error({ err }, 'Failed to enqueue admin try-on job');
      throw new AppError(
        'QUEUE_UNAVAILABLE',
        'The try-on job queue is unavailable (Redis down?). Try again shortly.',
        503,
      );
    }

    return {
      data: {
        queued: true,
        job_id: body.job_id,
        message:
          'On-model generation enqueued — the V-Tone pipeline takes ~30-60s, and the result appears in the feed below when it finishes.',
      },
    };
  });

  // ─── GET /admin/photo-cleanup/tryon-results ────────────────────────
  // Reads the ADMIN_TRYON audit trail (written by the admin-tryon job) into
  // a typed results feed for the page. Newest first; 50 rows covers a long
  // test session. Same audit-as-feed pattern as the storage report.
  server.get('/photo-cleanup/tryon-results', async () => {
    const rows = await prisma.auditLog.findMany({
      where: { action: 'ADMIN_TRYON' },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: { id: true, created_at: true, metadata: true },
    });

    return {
      data: rows.map((r) => parseTryOnResult(r.id, r.created_at, r.metadata)),
    };
  });
};
