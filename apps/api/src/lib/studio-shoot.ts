// F-032 Phase A — AI Studio Shoots via Black Forest Labs FLUX.1 Kontext [pro].
//
// What this is: a retailer taps "Studio shoot" on a product photo, picks a
// TEMPLATE (no free-text prompts — see STUDIO_TEMPLATES in @kanchuki/shared),
// and the API generates a subject-consistent studio image: the original
// photo goes in, FLUX Kontext replaces the background while preserving the
// product's pixels (the "own the subject, not the scene" lesson — the exact
// thing the flat-paste look gets wrong). The result is stored as a NEW
// product photo (never overwriting the source), so the original stays one
// tap away and the edited image can be set as primary.
//
// BFL contract (verified 2026-08-13, docs.bfl.ml/kontext/kontext_image_editing):
//   - SUBMIT  POST https://api.bfl.ai/v1/flux-kontext-pro
//             headers: x-key: <BFL_API_KEY>  (NOT Authorization / Bearer)
//             body: { prompt, input_image, aspect_ratio? }
//               input_image = base64 OR a public URL, ≤20MB/20MP.
//               aspect_ratio omitted → matches the input image dimensions.
//             → { id, polling_url }
//   - POLL    GET <polling_url> with the same x-key
//             status: Pending | Processing | Ready | Error | Failed | Content Moderated
//             Ready → result.sample = SIGNED URL, valid only 10 minutes —
//             we must download + re-serve from R2, never link it directly.
//   - LIMITS  24 active tasks (6 for kontext-max) — 429 when exceeded;
//             402 = out of credits.
//
// Env: BFL_API_KEY on the API service. Generation is ASYNC (10–60s), so the
// route enqueues a BullMQ job and the mobile app polls a status endpoint —
// never holds an HTTP request open across inference (same pattern as the
// V-Tone admin tool / spin-frame extraction).
import { Redis } from 'ioredis';
import { compressImageToTarget, publicUrl, readCappedBuffer, ssrfSafeFetch, uploadBuffer } from '@kanchuki/ai';
import { getStudioTemplate, type StudioTemplateId } from '@kanchuki/shared';
import { AppError } from '../plugins/error-handler.js';

const BFL_BASE = 'https://api.bfl.ai/v1';
// 24 active tasks is the BFL cap for flux-kontext-pro; stay well under it
// per Worker so a burst of studio shoots can't 429 the whole API key.
export const STUDIO_SHOOT_CONCURRENCY = 3;

export function isStudioShootConfigured(): boolean {
  return Boolean(process.env.BFL_API_KEY);
}

function bflKey(): string {
  const key = process.env.BFL_API_KEY;
  if (!key) throw new AppError('STUDIO_SHOOT_FAILED', 'AI Studio Shoots are not configured', 503);
  return key;
}

// ─── BFL submit + poll ─────────────────────────────────────────────

export interface StudioGenerationResult {
  status: 'ready' | 'failed';
  /** Present when ready — a signed URL valid only 10 minutes. */
  sampleUrl?: string;
  error?: string;
}

/** How long to poll for a single generation before giving up. */
const POLL_TIMEOUT_MS = 180_000; // Increased to 3 minutes to match BFL expectations
// Adaptive polling intervals: start frequent, then back off
const POLL_INTERVALS_MS = [1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 3_000, 3_000, 5_000, 5_000, 10_000, 10_000, 15_000, 15_000];

/**
 * Run one FLUX Kontext generation: submit the photo URL + template prompt,
 * poll until Ready, and return the signed result URL (must be downloaded
 * and re-served from R2 within 10 minutes). Throws AppError on hard
 * failures (unconfigured key, submit rejected, out of credits).
 * 
 * @param onProgress Optional callback to report progress during polling
 */
export async function generateStudioImage(
   templateId: StudioTemplateId,
   inputImageUrl: string,
   onProgress?: (progress: { progress: number; etaMs: number }) => void,
   inputImageMeta?: { width?: number | null; height?: number | null; sizeBytes?: number | null },
): Promise<StudioGenerationResult> {
  const template = getStudioTemplate(templateId);
  if (!template) {
    throw new AppError('STUDIO_SHOOT_FAILED', 'Unknown studio template', 422);
  }

  // BFL FLUX Kontext accepts ≤20MP and ≤20MB. Validate early to avoid
  // wasting API credits on inputs that will be rejected.
  const MAX_MP = 20_000_000;
  const MAX_BYTES = 20 * 1024 * 1024;
  if (inputImageMeta?.width && inputImageMeta?.height) {
    const mp = inputImageMeta.width * inputImageMeta.height;
    if (mp > MAX_MP) {
      throw new AppError(
        'STUDIO_SHOOT_FAILED',
        `Image is too large (${(mp / 1_000_000).toFixed(1)}MP). Maximum is 20MP.`,
        422,
      );
    }
  }
  if (inputImageMeta?.sizeBytes && inputImageMeta.sizeBytes > MAX_BYTES) {
    throw new AppError(
      'STUDIO_SHOOT_FAILED',
      `Image file is too large (${(inputImageMeta.sizeBytes / 1024 / 1024).toFixed(1)}MB). Maximum is 20MB.`,
      422,
    );
  }

  const auth = bflKey();
  let submit: { id?: string; polling_url?: string };
  try {
    const res = await fetch(`${BFL_BASE}/flux-kontext-pro`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'x-key': auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: template.prompt,
        // URL form is accepted (≤20MB) — no base64 round-trip needed for
        // photos already on R2. aspect_ratio omitted → matches input dims.
        input_image: inputImageUrl,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    submit = (await res.json()) as { id?: string; polling_url?: string };
    if (!res.ok) {
      const reason =
        res.status === 402
          ? 'AI Studio Shoots are temporarily unavailable (out of credits). Please try again later.'
          : res.status === 429
            ? 'Too many studio shoots right now. Please try again in a minute.'
            : 'AI Studio Shoots could not be started. Please try again.';
      throw new AppError('STUDIO_SHOOT_FAILED', reason, res.status >= 500 ? 503 : 429);
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      'STUDIO_SHOOT_FAILED',
      'AI Studio Shoots could not be started. Please try again.',
      503,
    );
  }

const pollingUrl = submit.polling_url;
   if (!pollingUrl) {
     throw new AppError('STUDIO_SHOOT_FAILED', 'AI Studio Shoots returned no task. Please retry.', 503);
   }

   const startTime = Date.now();
   const deadline = Date.now() + POLL_TIMEOUT_MS;
   let pollIntervalIndex = 0;
   while (Date.now() < deadline) {
     let poll: { status?: string; result?: { sample?: string }; error?: string };
     try {
       const res = await fetch(pollingUrl, {
         headers: { accept: 'application/json', 'x-key': auth },
         signal: AbortSignal.timeout(10_000),
       });
       poll = (await res.json()) as { status?: string; result?: { sample?: string }; error?: string };
     } catch {
       // Transient network hiccup — keep polling until the deadline.
       await sleep(POLL_INTERVALS_MS[Math.min(pollIntervalIndex, POLL_INTERVALS_MS.length - 1)]!);
       pollIntervalIndex++;
       
       // Update progress during wait
       if (onProgress) {
         const elapsed = Date.now() - startTime;
         const progress = Math.min(95, Math.floor((elapsed / POLL_TIMEOUT_MS) * 100));
         const etaMs = Math.max(0, POLL_TIMEOUT_MS - elapsed);
         onProgress({ progress, etaMs });
       }
       
       continue;
     }

     if (poll.status === 'Ready' && poll.result?.sample) {
       if (onProgress) {
         onProgress({ progress: 100, etaMs: 0 });
       }
       return { status: 'ready', sampleUrl: poll.result.sample };
     }
     if (poll.status === 'Error' || poll.status === 'Failed' || poll.status === 'Content Moderated') {
       if (onProgress) {
         onProgress({ progress: 0, etaMs: 0 });
       }
       return {
         status: 'failed',
         error: poll.error ?? 'The studio shoot could not be generated. Please try again.',
       };
     }
     
     // Update progress during polling
     if (onProgress) {
       const elapsed = Date.now() - startTime;
       const progress = Math.min(90, Math.floor((elapsed / POLL_TIMEOUT_MS) * 100)); // Cap at 90% until complete
       const etaMs = Math.max(0, POLL_TIMEOUT_MS - elapsed);
       onProgress({ progress, etaMs });
     }
     
     await sleep(POLL_INTERVALS_MS[Math.min(pollIntervalIndex, POLL_INTERVALS_MS.length - 1)]!);
     pollIntervalIndex++;
   }

   if (onProgress) {
     onProgress({ progress: 0, etaMs: 0 });
   }
   return { status: 'failed', error: 'The studio shoot timed out. Please try again.' };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Download → compress → upload (re-serve from R2) ───────────────

export interface StudioR2Output {
  key: string;
  url: string;
  width: number;
  height: number;
}

/**
 * Fetch the BFL signed result URL (10-min validity), quality-compress to
 * ≤80KB, and store under the given R2 key. Returns the new key + public URL.
 * Uses the SSRF-safe downloader — the URL comes from a third party.
 */
export async function downloadCompressAndUpload(
  sampleUrl: string,
  r2Key: string,
): Promise<StudioR2Output> {
  const res = await ssrfSafeFetch(sampleUrl);
  if (!res.ok) throw new Error(`Failed to fetch studio result: ${res.status}`);
  const raw = await readCappedBuffer(res);
  const { buffer, width, height } = await compressImageToTarget(raw);
  await uploadBuffer(r2Key, buffer, 'image/jpeg');
  return { key: r2Key, url: publicUrl(r2Key), width, height };
}

// ─── Job status (Redis, short-fail — mirrors msg91-otp/public-cache) ─
// The route returns 202 + job_id; the mobile app polls the status endpoint
// while the BullMQ job runs. Status lives in Redis with a TTL — it's a
// transient progress signal, not a record of truth (the DB photo row is).
// Own short-fail client (NOT getRedis()/BullMQ — maxRetriesPerRequest: null
// would retry forever on a down connection and hang the hot path).

export interface StudioJobStatus {
   status: 'processing' | 'ready' | 'failed';
   photo_id?: string;
   url?: string;
   error?: string;
   /** Progress percentage (0-100) */
   progress?: number;
   /** Estimated time until completion in milliseconds */
   etaMs?: number;
 }

const STATUS_KEY = (jobId: string) => `studio:job:${jobId}`;
const STATUS_TTL_SEC = 60 * 30; // 30 min — far longer than a generation

export interface StudioRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<'OK' | null>;
}

let studioRedis: Redis | null = null;

function getStudioRedis(): Redis {
  studioRedis ??= new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 10_000,
  });
  return studioRedis;
}

async function awaitRedisReady(redis: Redis): Promise<void> {
  if (redis.status === 'ready') return;
  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      redis.off('error', onError);
      resolve();
    };
    const onError = (err: Error) => {
      redis.off('ready', onReady);
      reject(err);
    };
    redis.once('ready', onReady);
    redis.once('error', onError);
  });
}

// Same VITEST bypass convention as msg91-otp/public-cache — route tests run
// without Redis and stay deterministic.
function redisAvailable(): boolean {
  return process.env.VITEST !== 'true';
}

/** Write the job status (best-effort — a Redis blip must not fail the job). */
export async function setStudioJobStatus(jobId: string, status: StudioJobStatus): Promise<void> {
  if (!redisAvailable()) return;
  const redis = getStudioRedis();
  try {
    await awaitRedisReady(redis);
    await redis.set(STATUS_KEY(jobId), JSON.stringify(status), 'EX', STATUS_TTL_SEC);
  } catch (err) {
    console.error(`[studio-shoot] failed to write status for ${jobId}:`, err);
  }
}

/** Read the job status — returns null when absent/expired/Redis down. */
export async function getStudioJobStatus(jobId: string): Promise<StudioJobStatus | null> {
  if (!redisAvailable()) return null;
  const redis = getStudioRedis();
  try {
    await awaitRedisReady(redis);
    const raw = await redis.get(STATUS_KEY(jobId));
    return raw ? (JSON.parse(raw) as StudioJobStatus) : null;
  } catch {
    return null;
  }
}
