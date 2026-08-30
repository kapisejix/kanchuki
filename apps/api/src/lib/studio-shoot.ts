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
import { demographicForCategory, type Demographic } from '@kanchuki/shared';
import { getSecret, prisma } from '@kanchuki/db';
import { AppError } from '../plugins/error-handler.js';
import { generateFluxKontext, generateFluxProImage, generateFluxSchnellImage, resolveFalKey } from './fal-client.js';
import { generateGoogleImagen, isImagenConfigured, resolveGeminiKey } from './imagen-client.js';

const BFL_BASE = 'https://api.bfl.ai/v1';
export const STUDIO_SHOOT_CONCURRENCY = 3;

export async function resolveBflKey(): Promise<string | null> {
  const secret = await getSecret('BFL_API_KEY').catch(() => null);
  return secret || process.env.BFL_API_KEY || null;
}

export async function isStudioShootConfigured(): Promise<boolean> {
  const fal = await resolveFalKey();
  if (fal) return true;
  const gemini = await resolveGeminiKey();
  if (gemini) return true;
  const bfl = await resolveBflKey();
  if (bfl) return true;
  return false;
}

export type StudioEngine =
  | 'flux_pro'
  | 'imagen_3'
  | 'flux_schnell'
  | 'imagen_3_fast'
  | 'bfl_kontext';

/** The subset of a studio-shoot job payload that comes from a studio_styles row. */
export interface StudioStyleJobFields {
  slug: string;
  prompt: string;
  tab: 'PRODUCT' | 'MODEL';
  engine?: StudioEngine;
  audience: string[];
  style_id: string;
}

/**
 * Resolve a `studio_styles` slug into the job-payload fields. Throws 422 if the
 * slug is unknown. Any status is accepted — the retailer route does its own
 * PUBLISHED + per-plan check before calling this; the internal callers
 * (festival background, growth backgrounds/social) use curated slugs.
 */
export async function resolveStudioStyleJob(slug: string): Promise<StudioStyleJobFields> {
  const style = await prisma.studioStyle.findFirst({ where: { slug } });
  if (!style) throw new AppError('VALIDATION_ERROR', `Unknown studio style: ${slug}`, 422);
  return {
    slug: style.slug,
    prompt: style.prompt,
    tab: style.tab,
    engine: (style.engine as StudioEngine | null) ?? undefined,
    audience: style.audience,
    style_id: style.id,
  };
}

export interface StudioGenerationResult {
  status: 'ready' | 'failed';
  /** Present when ready — a signed URL or base64 payload */
  sampleUrl?: string;
  base64Data?: string;
  error?: string;
}

/** How long to poll for a single generation before giving up. */
const POLL_TIMEOUT_MS = 180_000;
const POLL_INTERVALS_MS = [1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 3_000, 3_000, 5_000, 5_000, 10_000, 10_000, 15_000, 15_000];

/**
 * The person to render for each product demographic. Fed into every
 * model scene so a male / teen / kids product no longer renders as an
 * adult woman (the old hardcoded "graceful Indian fashion model").
 */
const PERSON_CLAUSE: Record<Demographic, string> = {
  womens: 'a graceful adult Indian woman fashion model',
  mens: 'a dignified adult Indian man fashion model',
  teen_girl: 'an Indian teenage girl model, about 15 years old',
  teen_boy: 'an Indian teenage boy model, about 15 years old',
  kids_girl: 'a young Indian girl child model, about 6 years old',
  kids_boy: 'a young Indian boy child model, about 6 years old',
};

/** Explicit demographic (admin bench) wins; otherwise infer from the product. */
function resolveDemographic(
  explicit: string | undefined,
  product?: { category?: string | null; name?: string | null },
): Demographic {
  if (explicit && explicit in PERSON_CLAUSE) return explicit as Demographic;
  return demographicForCategory(product?.category, product?.name);
}

/**
 * Generate a studio product photo or AI fashion-model shot for a resolved
 * prompt (the caller — retailer route, job, or admin bench — pulls the prompt
 * from a `studio_styles` row).
 *
 * `tab: 'MODEL'` injects a demographic-correct person clause and neutralises
 * any stock "graceful Indian fashion model" wording in the prompt.
 * `tab: 'PRODUCT'` uses the prompt verbatim (product-only scenes, no person).
 */
export async function generateStudioImage(
  inputImageUrl: string,
  opts: {
    prompt: string;
    tab: 'PRODUCT' | 'MODEL';
    engine?: StudioEngine;
    /** Demographic override (admin bench). Omitted → inferred from the
     * product category. Decides which person a MODEL scene renders. */
    demographic?: Demographic | string;
    onProgress?: (progress: { progress: number; etaMs: number }) => void;
    product?: {
      name?: string | null;
      category?: string | null;
      primary_color?: string | null;
      secondary_colors?: string[];
      fabric?: string | null;
      pattern?: string | null;
      embellishments?: string[];
    };
  },
): Promise<StudioGenerationResult> {
  const { prompt, tab, engine, onProgress } = opts;
  const falKey = await resolveFalKey();
  const geminiKey = await resolveGeminiKey();
  const bflAuthKey = await resolveBflKey();

  if (!falKey && !geminiKey && !bflAuthKey) {
    throw new AppError(
      'STUDIO_SHOOT_FAILED',
      'AI Studio Shoots are not configured. Please add an API key in Admin → Integrations.',
      503,
    );
  }

  const product = opts.product;
  const colorSpec = [
    product?.primary_color ? `exact primary color is ${product.primary_color}` : '',
    product?.secondary_colors?.length ? `secondary colors are ${product.secondary_colors.join(', ')}` : '',
    product?.fabric ? `fabric: ${product.fabric}` : '',
    product?.pattern ? `pattern: ${product.pattern}` : '',
    product?.embellishments?.length ? `embellishments: ${product.embellishments.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  const demographic = resolveDemographic(
    typeof opts.demographic === 'string' ? opts.demographic : undefined,
    product,
  );
  const indianModelDesc = PERSON_CLAUSE[demographic];

  let basePrompt: string = prompt;

  // Demographic person-swap: the curated MODEL scene prompts hardcode
  // "a graceful Indian fashion model" (an adult woman). For a male / teen /
  // kids product — or an explicit bench demographic — force the right person
  // into the scene and neutralise the stock wording. PRODUCT scenes have no
  // person and are used verbatim.
  if (tab === 'MODEL') {
    basePrompt = basePrompt.replace(
      /a (?:graceful|professional|dignified|charming|elegant|young)[^.,]*?Indian (?:fashion model|lady \/ female fashion model|gentleman \/ male fashion model|lady|gentleman|boy model|woman fashion model|man fashion model)/gi,
      indianModelDesc,
    );
    basePrompt = `The person wearing this garment is ${indianModelDesc}. ${basePrompt}`;
  }

  const colorEnforcement = colorSpec
    ? ` The garment has ${colorSpec}. CRITICAL COLOR ACCURACY: Absolutely preserve the garment's exact fabric dye, color tone, embroidery, and saturation without any tinting, hue shift, or color alteration. Use neutral 5500K daylight-balanced CRI-98 key lighting on the garment.`
    : ` CRITICAL COLOR ACCURACY: Preserve the garment's exact original color, hue, dye, saturation, and embroidery 100% faithfully to the input photo without color shifting or tinting. Use neutral 5500K daylight-balanced key lighting on the garment.`;

  // FLUX Kontext is an instruction-edit model: it changes only what the
  // prompt names and leaves the rest of the pixels alone. Plain flux
  // img2img (strength 0.65) regenerates most of the frame, and Imagen is
  // pure text-to-image (it never even receives the input photo) — BOTH
  // recolour / redraw the garment, which is the "changed the product
  // colour" bug. So the default path is Kontext only; flux_pro / imagen /
  // flux_schnell run only when a caller explicitly asks via `engine`.
  const sceneGuard =
    'Edit ONLY the background, setting and scene of this photograph. Keep the garment itself pixel-identical to the input: exact same colour, dye, print, pattern, embroidery, fabric, cut, drape and proportions. Do not recolour, restyle or regenerate the clothing.';
  const promptText = `${sceneGuard} ${basePrompt} ${colorEnforcement}`;

  // Explicit engine override (admin bench / future UI) — attempt it, but
  // still fall through to Kontext if it errors.
  if (engine === 'flux_pro' && falKey) {
    try {
      const res = await generateFluxProImage(promptText, { inputImageUrl, onProgress });
      return { status: 'ready', sampleUrl: res.sampleUrl };
    } catch (err) {
      console.error('[studio-shoot] flux_pro (explicit) failed, falling back to Kontext:', err);
    }
  }
  if ((engine === 'imagen_3' || engine === 'imagen_3_fast') && geminiKey) {
    try {
      const res = await generateGoogleImagen(promptText, {
        model: engine === 'imagen_3_fast' ? 'imagen-3.0-fast-generate-001' : 'imagen-3.0-generate-002',
        onProgress,
      });
      return { status: 'ready', base64Data: res.base64Data };
    } catch (err) {
      console.error('[studio-shoot] imagen (explicit) failed, falling back to Kontext:', err);
    }
  }
  if (engine === 'flux_schnell' && falKey) {
    try {
      const res = await generateFluxSchnellImage(promptText, { inputImageUrl, onProgress });
      return { status: 'ready', sampleUrl: res.sampleUrl };
    } catch (err) {
      console.error('[studio-shoot] flux_schnell (explicit) failed, falling back to Kontext:', err);
    }
  }

  // DEFAULT: FLUX Kontext via Fal (subject-preserving). Falls through to the
  // BFL direct API below when Fal errors or only BFL_API_KEY is configured.
  if (falKey) {
    try {
      const res = await generateFluxKontext(promptText, inputImageUrl, onProgress);
      return { status: 'ready', sampleUrl: res.sampleUrl };
    } catch (err) {
      console.error('[studio-shoot] Fal Kontext failed, trying BFL direct:', err);
      if (!bflAuthKey) throw err;
    }
  }

  // Fallback: Black Forest Labs FLUX Kontext Pro (direct API)
  if (!bflAuthKey) {
    throw new AppError(
      'STUDIO_SHOOT_FAILED',
      'AI Studio Shoots are not configured. Please add an API key in Admin → Integrations.',
      503,
    );
  }

  let submit: { id?: string; polling_url?: string };
  try {
    const res = await fetch(`${BFL_BASE}/flux-kontext-pro`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'x-key': bflAuthKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Send the fully-assembled prompt (basePrompt + colour tail + any
        // runway/model/customPrompt tweak) — NOT the bare template string.
        prompt: promptText,
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
    throw new AppError('STUDIO_SHOOT_FAILED', 'AI Studio Shoots could not be started. Please try again.', 503);
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
         headers: { accept: 'application/json', 'x-key': bflAuthKey },
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
  sampleUrlOrBase64: string,
  r2Key: string,
  isBase64 = false,
): Promise<StudioR2Output> {
  let raw: Buffer;
  if (isBase64) {
    raw = Buffer.from(sampleUrlOrBase64, 'base64');
  } else {
    const res = await ssrfSafeFetch(sampleUrlOrBase64);
    if (!res.ok) throw new Error(`Failed to fetch studio result: ${res.status}`);
    raw = await readCappedBuffer(res);
  }
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
