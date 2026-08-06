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

import { publicUrl, readCappedBuffer, ssrfSafeFetch, uploadBuffer } from '@kanchuki/ai';
import { R2_PATHS } from '@kanchuki/shared';
import { z } from 'zod';
import { validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

const execFileAsync = promisify(execFile);

const SCRIPT_PATH = fileURLToPath(
  new URL('../../../../../scripts/batch-clean-photos.py', import.meta.url),
);

async function runPython(args: string[]): Promise<void> {
  for (const bin of ['python3', 'python']) {
    try {
      await execFileAsync(bin, [SCRIPT_PATH, ...args], { timeout: 60_000 });
      return;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') continue; // try next binary
      throw err;
    }
  }
  throw new Error(
    'python3/python not found on this host. Install Python + `pip install rembg pillow` to use this test tool.',
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
        if (body.blur !== undefined) {
          args.push('--blur', String(body.blur));
        } else {
          args.push('--bg-image', bgPath);
        }
        if (body.shine) args.push('--shine');

        await runPython(args);

        const resultBuf = await readFile(join(outputDir, 'product.jpg'));
        const key = R2_PATHS.photoCleanupTest(`${randomUUID()}.jpg`);
        await uploadBuffer(key, resultBuf, 'image/jpeg');

        return { data: { result_url: publicUrl(key) } };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }),
  );
};
