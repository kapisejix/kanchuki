// Admin test page backend for scripts/batch-clean-photos.py (F: standalone
// product-photo cleanup script, see CLAUDE.md 2026-08-05 entry). Shells out
// to the existing, already-verified Python script instead of reimplementing
// bg-removal/shadow/shine in TypeScript — one behavior, one place.
//
// ponytail: this requires `python3`/`python` + `pip install rembg pillow` on
// whatever machine runs the API. It is NOT wired into the Railway Dockerfile
// — the API container has a memory cap that has already caused one outage
// (see CLAUDE.md "cap API heap below Railway container memory limit"), and
// rembg's onnx model is a real footprint. This route is for local/dev admin
// testing only; deploying it to prod needs its own infra decision.
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

export const adminPhotoCleanupRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── POST /admin/photo-cleanup/run ────────────────────────────────
  // Runs the standalone cleanup script against an uploaded product photo +
  // background image (both already-uploaded R2 URLs — client gets there via
  // the existing /admin/background-images/upload-url presign endpoint, no
  // new upload plumbing needed). Sample/reference image stays client-side
  // only — it's a visual target, never fed into the script.
  server.post('/photo-cleanup/run', async (request) => {
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
  });
};
