// Shared runner for scripts/batch-clean-photos.py — one behavior, one
// place: both the admin Photo Cleanup Test page and the retailer-facing
// pro-cleanup route (products-pro-cleanup.ts) go through runPhotoCleanup()
// below.
//
// Two execution modes, chosen by env:
//   * PHOTO_CLEANUP_SERVICE_URL set (PRODUCTION) — the heavy Python stack
//     (rembg + torch + SAM2 + LaMa, peak ~2.2GB RSS — see
//     scripts/demo/2026-08-08-sam2/memtest.py) lives in the photo-cleanup
//     sidecar on the Hetzner CX43 box (services/photo-cleanup/), NOT the
//     2GB Railway API container. The API downloads the photo + background
//     through its own ssrfSafeFetch guard and POSTs the BYTES to the
//     sidecar's POST /clean (multipart) — the sidecar has zero egress, so
//     the SSRF boundary stays in the API. Auth: X-Cleanup-Key header =
//     CLEANUP_SHARED_SECRET (F-012 integration key, same pattern as V-Tone).
//   * unset (local dev) — shells out to python3/python directly with the
//     same arg mapping. Without Python on the host, runPhotoCleanupScript
//     throws a clear "python3/python not found" error instead of failing
//     silently.
//
// Memory guardrails: cleanup runs are serialized (one Python/onnx process at
// a time) and the Node heap is capped at 1536MB below the container's 2GB
// limit — see serializePhotoCleanup below. (Serialization also protects the
// sidecar from concurrent ~2.2GB runs, though its 16GB box could take a few.)
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { readCappedBuffer, ssrfSafeFetch } from '@kanchuki/ai';
import { getSecret } from '@kanchuki/db';

const execFileAsync = promisify(execFile);

export const PHOTO_CLEANUP_SCRIPT = fileURLToPath(
  new URL('../../../../scripts/batch-clean-photos.py', import.meta.url),
);

export interface PhotoCleanupRunResult {
  /** Combined stdout+stderr of the last (working) Python invocation — the
   * script reports per-photo status ("done:", "FAILED:") and best-effort
   * degradations ("HARDWARE_SKIPPED: ...") on stdout. */
  output: string;
}

export interface PhotoCleanupRequest {
   /** Public R2 URL of the raw photo (fetched SSRF-safely by this module). */
   photoUrl: string;
   /** Optional backdrop-library image URL (F-011 / admin test page). */
   bgImageUrl?: string | null;
   removeHardware?: boolean;
   tightCrop?: boolean;
   /** Pixel rect to isolate the subject before rembg. */
   crop?: { x1: number; y1: number; x2: number; y2: number } | null;
   /** Tap-to-fix: normalized (0..1) foreground points marking hardware. */
   promptPoints?: [number, number][];
   /** Tap-to-fix: normalized (0..1) negative points marking the garment. */
   promptExcludes?: [number, number][];
   /** Portrait mode: keep the shot's own background, blur it by this radius. */
   blur?: number | null;
   ghostMannequin?: boolean;
   shine?: boolean;
   /** Output JPEG quality (1-100) for fast/slow quality mode. */
   quality?: number | null;
}

export interface PhotoCleanupResult {
  /** Script stdout (flag detection: HARDWARE_SKIPPED, point-prompt, ...). */
  output: string;
  /** Cleaned JPEG bytes. */
  jpeg: Buffer;
}

/**
 * Build the batch-clean-photos.py CLI args for a request — the single
 * source of truth for the local-exec mode. The sidecar's services/
 * photo-cleanup/app.py build_args() mirrors this mapping 1:1 (keep in sync:
 * both are unit-tested against the same cases).
 */
export function buildCleanupScriptArgs(
   inputDir: string,
   outputDir: string,
   req: PhotoCleanupRequest & { bgImagePath?: string | null },
): string[] {
   const args = [inputDir, outputDir];
   // Blur (portrait) mode wins over composite unless ghost-mannequin forces
   // composite — same branching as the script's main().
   if (req.blur != null && !req.ghostMannequin) {
     args.push('--blur', String(req.blur));
     if (req.shine) args.push('--shine');
     if (req.crop) {
       args.push('--crop', `${req.crop.x1},${req.crop.y1},${req.crop.x2},${req.crop.y2}`);
     }
     if (req.quality != null) {
       args.push('--quality', String(req.quality));
     }
     return args;
   }
   if (req.bgImagePath) args.push('--bg-image', req.bgImagePath);
   if (req.shine) args.push('--shine');
   if (req.ghostMannequin) args.push('--ghost-mannequin');
   if (req.removeHardware) args.push('--remove-hardware');
   if (req.promptPoints?.length) {
     args.push('--prompt-points', req.promptPoints.map(([x, y]) => `${x},${y}`).join(';'));
   }
   if (req.promptExcludes?.length) {
     args.push('--prompt-excludes', req.promptExcludes.map(([x, y]) => `${x},${y}`).join(';'));
   }
   if (req.tightCrop) args.push('--tight-crop');
   if (req.crop) {
     args.push('--crop', `${req.crop.x1},${req.crop.y1},${req.crop.x2},${req.crop.y2}`);
   }
   if (req.quality != null) {
     args.push('--quality', String(req.quality));
   }
   return args;
 }

/**
 * Run batch-clean-photos.py with the given args, discovering a working
 * python3/python binary with the required dependencies.
 *
 * - ENOENT → try the next binary name (binary doesn't exist).
 * - "No module named ..." in the combined output (whether an uncaught
 *   top-level traceback OR a script-caught per-photo "FAILED: ... No module
 *   named ..." line) means THIS BINARY's environment is missing a
 *   dependency — try the next binary instead of surfacing a misleading
 *   error (a dev box can have multiple Python installs under different
 *   names, e.g. a Windows Store `python3` alias vs a real `python`).
 * - Anything else (nonzero exit, killed by timeout) is a real failure and
 *   is thrown with the script's own output included.
 */
export async function runPhotoCleanupScript(
  args: string[],
  timeoutMs = 180_000,
): Promise<PhotoCleanupRunResult> {
  let lastEnvError: string | undefined;
  for (const bin of ['python3', 'python']) {
    try {
      // 180s default, not 60s: the first-ever run on a dev machine is a cold
      // start — `import rembg` + onnxruntime can take 30s+ alone, then the
      // ~170MB model loads, then CPU inference runs. --ghost-mannequin and
      // --remove-hardware get longer caps (see callers) — their first runs
      // also download + load the LaMa checkpoint (and torch/SAM2 for
      // hardware removal) on top of rembg's.
      // Run the script THROUGH the discovered python3/python binary — the
      // bin loop exists exactly for this: a bare .py path isn't directly
      // executable on Windows, and different names can point at different
      // environments with/without the deps.
      const { stdout, stderr } = await execFileAsync(bin, [PHOTO_CLEANUP_SCRIPT, ...args], {
        timeout: timeoutMs,
      });
      return {
        output: [stdout, stderr]
          .map((s) => s?.trim())
          .filter(Boolean)
          .join('\n'),
      };
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
      ? `no working python3/python found (all installs crashed): ${lastEnvError.slice(0, 800)}. Install Python + \`pip install rembg pillow simple-lama-inpainting\` to use photo cleanup.`
      : 'python3/python not found on this host. Install Python + `pip install rembg pillow simple-lama-inpainting` to use photo cleanup.',
  );
}

// ─── service mode: POST bytes to the photo-cleanup sidecar ───────────────
// PRODUCTION path. The sidecar (services/photo-cleanup/) hosts the heavy
// Python stack — this API container carries no Python at all (see
// apps/api/Dockerfile). We download the photo + background here through the
// API's SSRF guard and ship the BYTES as multipart; the sidecar never
// fetches anything, so no SSRF surface exists on the box.
async function runPhotoCleanupViaService(
   serviceUrl: string,
   req: PhotoCleanupRequest,
   timeoutMs: number,
): Promise<PhotoCleanupResult> {
   const [photoRes, bgRes] = await Promise.all([
     ssrfSafeFetch(req.photoUrl),
     req.bgImageUrl ? ssrfSafeFetch(req.bgImageUrl) : Promise.resolve(null),
   ]);
   if (!photoRes.ok) throw new Error(`fetch failed (${photoRes.status})`);
   if (bgRes && !bgRes.ok) throw new Error(`background fetch failed (${bgRes.status})`);
   const [photoBuf, bgBuf] = await Promise.all([
     readCappedBuffer(photoRes),
     bgRes ? readCappedBuffer(bgRes) : Promise.resolve(null),
   ]);

   const form = new FormData();
   form.append('photo', new Blob([photoBuf], { type: 'image/jpeg' }), 'photo.jpg');
   if (bgBuf) form.append('background', new Blob([bgBuf], { type: 'image/jpeg' }), 'background.jpg');
   if (req.removeHardware) form.append('remove_hardware', 'true');
   if (req.tightCrop) form.append('tight_crop', 'true');
   if (req.crop) {
     form.append('crop', `${req.crop.x1},${req.crop.y1},${req.crop.x2},${req.crop.y2}`);
   }
   if (req.promptPoints?.length) {
     form.append('prompt_points', req.promptPoints.map(([x, y]) => `${x},${y}`).join(';'));
   }
   if (req.promptExcludes?.length) {
     form.append('prompt_excludes', req.promptExcludes.map(([x, y]) => `${x},${y}`).join(';'));
   }
   if (req.blur != null) form.append('blur', String(req.blur));
   if (req.ghostMannequin) form.append('ghost_mannequin', 'true');
   if (req.shine) form.append('shine', 'true');
   if (req.quality != null) form.append('quality', String(req.quality));

   const secret = await getSecret('CLEANUP_SHARED_SECRET');
   const res = await fetch(`${serviceUrl.replace(/\/+$/, '')}/clean`, {
     method: 'POST',
     headers: { ...(secret ? { 'X-Cleanup-Key': secret } : {}) },
     body: form,
     signal: AbortSignal.timeout(timeoutMs),
   });

   if (!res.ok) {
     const detail = (await res.text().catch(() => '')).slice(0, 500);
     throw new Error(`cleanup service ${res.status}: ${detail || res.statusText}`);
   }
   const json = (await res.json()) as { output?: string; image_b64?: string };
   if (!json.image_b64) throw new Error('cleanup service returned no image');
   // Sanity cap on the decoded payload: a cleaned JPEG is a few hundred KB;
   // anything near MBs means the sidecar is misbehaving — fail instead of
   // letting a bad response balloon this container's memory.
   const jpeg = Buffer.from(json.image_b64, 'base64');
   if (jpeg.byteLength > 20 * 1024 * 1024) {
     throw new Error(
       `cleanup service returned an unreasonably large image (${jpeg.byteLength} bytes)`,
     );
   }
   return { output: json.output ?? '', jpeg };
 }

// ─── local mode: direct python exec (dev fallback) ───────────────────────
async function runPhotoCleanupLocally(
  req: PhotoCleanupRequest,
  timeoutMs: number,
): Promise<PhotoCleanupResult> {
  const [photoRes, bgRes] = await Promise.all([
    ssrfSafeFetch(req.photoUrl),
    req.bgImageUrl ? ssrfSafeFetch(req.bgImageUrl) : Promise.resolve(null),
  ]);
  if (!photoRes.ok) throw new Error(`fetch failed (${photoRes.status})`);
  if (bgRes && !bgRes.ok) throw new Error(`background fetch failed (${bgRes.status})`);
  const [photoBuf, bgBuf] = await Promise.all([
    readCappedBuffer(photoRes),
    bgRes ? readCappedBuffer(bgRes) : Promise.resolve(null),
  ]);

  const dir = await mkdtemp(join(tmpdir(), 'photo-cleanup-'));
  const inputDir = join(dir, 'input');
  const outputDir = join(dir, 'output');
  try {
    await mkdir(inputDir, { recursive: true });
    await writeFile(join(inputDir, 'photo.jpg'), photoBuf);
    let bgImagePath: string | null = null;
    if (bgBuf) {
      bgImagePath = join(dir, 'background.jpg');
      await writeFile(bgImagePath, bgBuf);
    }
    const args = buildCleanupScriptArgs(inputDir, outputDir, { ...req, bgImagePath });
    const { output } = await runPhotoCleanupScript(args, timeoutMs);
    return { output, jpeg: await readFile(join(outputDir, 'photo.jpg')) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Log the local-exec fallback once per process — deploy-ordering guard: if
  * the API ships without PHOTO_CLEANUP_SERVICE_URL configured, the cleanup
  * routes silently degrade to local python, which the Railway image no longer
  * has (python removed 2026-08-08). Make that failure mode loud. */
let warnedLocalFallback = false;

/**
 * Run one photo through the cleanup pipeline and return the cleaned JPEG +
 * script stdout. Dispatches on PHOTO_CLEANUP_SERVICE_URL (F-012 integration
 * key, DB-first with env fallback — same getSecret pattern as VTONE_API_URL):
 * set → sidecar (production), unset → local python exec (dev fallback).
 */
export async function runPhotoCleanup(
  req: PhotoCleanupRequest,
  timeoutMs = 240_000,
): Promise<PhotoCleanupResult> {
  const serviceUrl = (await getSecret('PHOTO_CLEANUP_SERVICE_URL'))?.trim();
  if (serviceUrl) return runPhotoCleanupViaService(serviceUrl, req, timeoutMs);
  
  // Improved local dev fallback error handling
  if (!warnedLocalFallback) {
    warnedLocalFallback = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[photo-cleanup] PHOTO_CLEANUP_SERVICE_URL is not configured — using local python exec. ' +
      'In production this requires python3+rembg+torch+SAM2 on the API host, which the Railway ' +
      'Dockerfile no longer ships. Set PHOTO_CLEANUP_SERVICE_URL (Admin → Integrations) to point ' +
      'at the photo-cleanup sidecar (services/photo-cleanup/). ' +
      'For local development, ensure Python 3.x is installed with: pip install rembg pillow simple-lama-inpainting',
    );
    
    // In development, provide a more actionable error if Python dependencies are missing
    if (process.env.NODE_ENV === 'development') {
      // We'll let the local execution proceed, but the runPhotoCleanupScript function
      // will provide detailed error messages if dependencies are missing
    }
  }
  
  return runPhotoCleanupLocally(req, timeoutMs);
}

// ─── serialize cleanup runs (memory guardrail) ───────────────────────────
// Each run spawns a Python process that loads the ~170MB u2net ONNX model
// into memory (peak RSS ~1GB during inference). Two concurrent runs on the
// 2GB Railway container would risk an OOM; serializing keeps the worst case
// bounded to one model in memory at a time. The Node heap is capped at
// 1536MB via --max-old-space-size (see Dockerfile) and the API's
// steady-state RSS is far below that, so one transient cleanup fits.
let cleanupRunChain: Promise<unknown> = Promise.resolve();

export function serializePhotoCleanup<T>(fn: () => Promise<T>): Promise<T> {
  const run = cleanupRunChain.then(fn, fn);
  cleanupRunChain = run.catch(() => undefined);
  return run;
}
