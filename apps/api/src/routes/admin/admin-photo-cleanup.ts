// Admin test page backend for scripts/batch-clean-photos.py (F: standalone
// product-photo cleanup script, see CLAUDE.md 2026-08-05 entry). Shells out
// to the existing, already-verified Python script instead of reimplementing
// bg-removal/shadow/shine in TypeScript — one behavior, one place.
//
// Production wiring: python3 + pip + rembg + pillow and the pre-baked u2net
// ONNX model are added in apps/api/Dockerfile. Memory guardrails: runs are
// serialized (one Python/onnx process at a time) and the Node heap is capped
// at 1536MB below the container's 2GB limit — see serializeCleanup below.
// Without Python on the host (e.g. a bare dev machine), runPython throws a
// clear "python3/python not found" error instead of failing silently.
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type { FastifyPluginAsync } from 'fastify';

import {
  compressImageToTarget,
  publicUrl,
  readCappedBuffer,
  ssrfSafeFetch,
  uploadBuffer,
} from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { R2_PATHS } from '@kanchuki/shared';
import { z } from 'zod';
import { addAdminTryOnJob } from '../../jobs/index.js';
import { AppError, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

const execFileAsync = promisify(execFile);

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

const SCRIPT_PATH = fileURLToPath(
  new URL('../../../../../scripts/batch-clean-photos.py', import.meta.url),
);

async function runPython(args: string[], timeoutMs = 180_000): Promise<void> {
  let lastEnvError: string | undefined;
  for (const bin of ['python3', 'python']) {
    try {
      // 180s, not 60s: the first-ever run on a dev machine is a cold start —
      // `import rembg` + onnxruntime can take 30s+ alone, then the ~170MB
      // u2net model loads, then CPU inference runs. A 60s execFile cap
      // killed the whole run with a bare "Command failed" and no detail.
      // --ghost-mannequin gets a longer cap (see caller) — its first-ever
      // run also downloads + loads the LaMa checkpoint on top of rembg's.
      await execFileAsync(bin, [SCRIPT_PATH, ...args], { timeout: timeoutMs });
      return;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') continue; // binary doesn't exist, try next
      const e = err as NodeJS.ErrnoException & {
        stdout?: string;
        stderr?: string;
        killed?: boolean;
      };
      // The script's real per-photo failure reason ("FAILED: ...") is a
      // print() — it lands on stdout, not stderr. Surface both.
      const detail = [e.stdout, e.stderr]
        .map((s) => s?.trim())
        .filter(Boolean)
        .join(' | ');
      // A dev box can have multiple Python installs under different names
      // (e.g. a Windows Store `python3` alias vs a real `python` with deps
      // installed). "No module named ..." — whether it's an uncaught
      // top-level traceback OR caught by the script's own per-photo
      // try/except and printed as "FAILED: ... No module named ..." (the
      // real shape hit in practice: --ghost-mannequin's LaMa import is
      // lazy, inside the try block) — means THIS BINARY's environment is
      // missing a dependency, not a real per-photo image failure. Try the
      // next binary instead of surfacing a misleading error.
      if (!e.killed && detail.includes('No module named')) {
        lastEnvError = detail;
        continue;
      }
      throw new Error(
        `photo-cleanup script failed${e.killed ? ` (killed — hit the ${timeoutMs / 1000}s cap)` : ''}${detail ? `: ${detail.slice(0, 800)}` : ''}`,
      );
    }
  }
  throw new Error(
    lastEnvError
      ? `no working python3/python found (all installs crashed): ${lastEnvError.slice(0, 800)}. Install Python + \`pip install rembg pillow simple-lama-inpainting\` to use this test tool.`
      : 'python3/python not found on this host. Install Python + `pip install rembg pillow simple-lama-inpainting` to use this test tool.',
  );
}

// ─── serialize cleanup runs (memory guardrail) ───────────────────────────
// Each run spawns a Python process that loads the ~170MB u2net ONNX model
// into memory (peak RSS ~1GB during inference). Two concurrent runs on the
// 2GB Railway container would risk an OOM; serializing keeps the worst case
// bounded to one model in memory at a time. The Node heap is capped at
// 1536MB via --max-old-space-size (see Dockerfile) and the API's
// steady-state RSS is far below that, so one transient cleanup fits.
let cleanupRunChain: Promise<unknown> = Promise.resolve();

function serializeCleanup<T>(fn: () => Promise<T>): Promise<T> {
  const run = cleanupRunChain.then(fn, fn);
  cleanupRunChain = run.catch(() => undefined);
  return run;
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
    serializeCleanup(async () => {
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

      const dir = await mkdtemp(join(tmpdir(), 'photo-cleanup-'));
      const inputDir = join(dir, 'input');
      const outputDir = join(dir, 'output');
      try {
        const [productRes, bgRes] = await Promise.all([
          ssrfSafeFetch(body.product_url),
          ssrfSafeFetch(body.background_url),
        ]);
        if (!productRes.ok) throw validationError('Could not fetch product_url');
        if (!bgRes.ok) throw validationError('Could not fetch background_url');
        const [productBuf, bgBuf] = await Promise.all([
          readCappedBuffer(productRes),
          readCappedBuffer(bgRes),
        ]);

        await mkdir(inputDir, { recursive: true });
        const productPath = join(inputDir, 'product.jpg');
        const bgPath = join(dir, 'background.jpg');
        await writeFile(productPath, productBuf);
        await writeFile(bgPath, bgBuf);

        const args = [inputDir, outputDir];
        if (!body.ghost_mannequin && body.blur !== undefined) {
          args.push('--blur', String(body.blur));
        } else {
          args.push('--bg-image', bgPath);
        }
        if (body.shine) args.push('--shine');
        if (body.ghost_mannequin) args.push('--ghost-mannequin');
        if (body.crop) {
          const { x1, y1, x2, y2 } = body.crop;
          args.push('--crop', `${x1},${y1},${x2},${y2}`);
        }

        // Ghost mannequin's first-ever run also downloads + loads the LaMa
        // checkpoint on top of rembg's — same cold-start shape as the u2net
        // download, give it more room than the default 180s cap.
        await runPython(args, body.ghost_mannequin ? 600_000 : 180_000);

        // Compress the cleaned output to ≤80KB (quality-first) before it
        // lands in R2 — this is a test tool, the result is a preview, and
        // every stored byte counts (see scripts/compress-r2-images.ts).
        const { buffer: resultBuf } = await compressImageToTarget(
          await readFile(join(outputDir, 'product.jpg')),
        );
        const key = R2_PATHS.photoCleanupTest(`${randomUUID()}.jpg`);
        await uploadBuffer(key, resultBuf, 'image/jpeg');

        return { data: { result_url: publicUrl(key) } };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
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
