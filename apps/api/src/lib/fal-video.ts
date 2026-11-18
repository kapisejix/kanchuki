// F-034 — AI image→video for social promo clips.
//
// The Fal image→video call + an ffmpeg crop/trim step. This is the video
// sibling of fal-client.ts's `runFalTask` (which only reads `images[]`): video
// endpoints return `video.url` and take ~60–180s instead of ~25s. Kept out of
// fal-client.ts so the hot image path stays untouched.
//
// generateImageToVideo(photoUrl, opts) → a finished MP4 Buffer, cropped to the
// requested aspect and trimmed to `seconds`, plus what Fal will bill for it.
// The caller uploads it to R2.
//
// Models and prices live in `video_models` / `plan_video_models` (migrations
// 166 + 167, admin-managed). No price and no endpoint list in code (F-034 T4).
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { readCappedBuffer, ssrfSafeFetch } from '@kanchuki/ai';
import { type SubscriptionPlan, getSecret, prisma } from '@kanchuki/db';
import ffmpegPath from 'ffmpeg-static';
import { AppError } from '../plugins/error-handler.js';

const execFileAsync = promisify(execFile);
const FFMPEG_BIN = process.env.FFMPEG_BIN ?? (ffmpegPath as unknown as string) ?? 'ffmpeg';
const FAL_BASE = 'https://queue.fal.run';
/** A 10 s 1080p clip can pass the 25 MB photo cap; ffmpeg re-encodes it down anyway. */
const MAX_CLIP_BYTES = 100 * 1024 * 1024;
const FFMPEG_TIMEOUT_MS = 120_000;

/** status_url / response_url from Fal's reply are fetched with our API key: Fal's own https hosts only. */
export function falUrl(candidate: string | undefined, fallback: string): string {
  if (!candidate) return fallback;
  try {
    const u = new URL(candidate);
    if (u.protocol === 'https:' && (u.hostname === 'fal.run' || u.hostname.endsWith('.fal.run'))) {
      return candidate;
    }
  } catch {
    // unparseable: fall back
  }
  return fallback;
}

export type VideoAspect = '9:16' | '16:9' | '1:1' | '4:5';

/** One `video_models` row, prices as numbers. */
export interface VideoModelCfg {
  model_key: string;
  endpoint: string;
  /** NULL = token-priced. */
  price_usd_per_second: number | null;
  /** Token-priced models only (migration 167). */
  price_usd_per_million_tokens: number | null;
}

const MODEL_SELECT = {
  model_key: true,
  endpoint: true,
  price_usd_per_second: true,
  price_usd_per_million_tokens: true,
} as const;

function toCfg(r: {
  model_key: string;
  endpoint: string;
  price_usd_per_second: unknown;
  price_usd_per_million_tokens: unknown;
}): VideoModelCfg {
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    model_key: r.model_key,
    endpoint: r.endpoint,
    price_usd_per_second: num(r.price_usd_per_second),
    price_usd_per_million_tokens: num(r.price_usd_per_million_tokens),
  };
}

/** Admin bench: any row, enabled or not, so a model can be tested before it is switched on. */
export async function getVideoModel(modelKey: string): Promise<VideoModelCfg | null> {
  const row = await prisma.videoModel.findUnique({
    where: { model_key: modelKey },
    select: MODEL_SELECT,
  });
  return row ? toCfg(row) : null;
}

/** Retailer path: the plan's model, only while it is enabled. null = feature unavailable. */
export async function videoModelForPlan(plan: SubscriptionPlan): Promise<VideoModelCfg | null> {
  const row = await prisma.planVideoModel.findUnique({
    where: { plan },
    select: { model: { select: { ...MODEL_SELECT, enabled: true } } },
  });
  return row?.model.enabled ? toCfg(row.model) : null;
}

// Target canvas per aspect. ffmpeg centre-crops the model output to the aspect
// ratio then scales to these dims — so a model that ignores our aspect hint
// still lands on-spec.
const ASPECT_DIMS: Record<VideoAspect, [number, number]> = {
  '9:16': [1080, 1920],
  '16:9': [1920, 1080],
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
};

async function resolveFalKey(): Promise<string | null> {
  const secret = await getSecret('FAL_API_KEY').catch((err) => {
    console.error('[fal-video] getSecret FAL_API_KEY failed:', err);
    return null;
  });
  return secret || process.env.FAL_API_KEY || process.env.FAL_KEY || null;
}

/** Wan bills video seconds at 16 fps (fal.ai llms.txt, 2026-11-17). */
const WAN_BILLING_FPS = 16;

/**
 * Fal input per model family, keyed on the endpoint (the DB row is the truth).
 * Schemas from each endpoint's llms.txt on 2026-11-17. ffmpeg crops/trims
 * afterwards, so an aspect a model cannot do falls back to the nearest one.
 */
export function buildFalInput(
  endpoint: string,
  imageUrl: string,
  motionPrompt: string,
  aspect: VideoAspect,
  seconds: number,
): Record<string, unknown> {
  if (endpoint.includes('/kling-video/')) {
    // No aspect param: output follows the photo. 2.6 renames the image field and
    // defaults generate_audio=true, which doubles the price; we strip audio anyway.
    const v26 = endpoint.includes('/v2.6/');
    return {
      [v26 ? 'start_image_url' : 'image_url']: imageUrl,
      prompt: motionPrompt,
      duration: seconds <= 5 ? '5' : '10',
      ...(v26 ? { generate_audio: false } : {}),
    };
  }
  if (endpoint.includes('/wan/')) {
    // No duration param: length = num_frames / 16 (5 s -> 81 frames, the default).
    return {
      image_url: imageUrl,
      prompt: motionPrompt,
      resolution: '720p',
      num_frames: seconds * WAN_BILLING_FPS + 1,
      aspect_ratio: aspect === '4:5' ? '9:16' : aspect,
    };
  }
  if (endpoint.includes('/seedance/')) {
    // Default is 1080p (~2.25x the tokens of 720p); no 4:5, 3:4 is closest.
    return {
      image_url: imageUrl,
      prompt: motionPrompt,
      resolution: '720p',
      duration: String(seconds),
      aspect_ratio: aspect === '4:5' ? '3:4' : aspect,
    };
  }
  throw new AppError('AI_VIDEO_FAILED', `No Fal input mapping for endpoint ${endpoint}`, 422);
}

/** Width, height, fps and duration of the clip Fal returned (before our crop). */
export interface RawClipInfo {
  width: number;
  height: number;
  fps: number;
  seconds: number;
}

/** Parse ffmpeg's `-i` banner. null when any field is missing. */
export function parseClipInfo(stderr: string): RawClipInfo | null {
  const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr);
  const vid = /Video:.*?(\d{2,5})x(\d{2,5}).*?([\d.]+) fps/.exec(stderr);
  if (!dur || !vid) return null;
  return {
    width: Number(vid[1]),
    height: Number(vid[2]),
    fps: Number(vid[3]),
    seconds: Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]),
  };
}

export interface ClipUsage {
  /** Seconds Fal bills for a per-second model. */
  billed_seconds: number | null;
  /** Tokens Fal bills for a token-priced model (measured from the raw clip). */
  tokens: number | null;
  /** null when the DB has no price for the model or the clip could not be measured. */
  cost_usd: number | null;
  raw: RawClipInfo | null;
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * What one clip costs, from the DB price. Per-second models are billed on the
 * duration we asked for (Kling: "5"/"10"; Wan: num_frames / 16). Token-priced
 * models (Seedance): tokens = h * w * fps * seconds / 1024, measured from the
 * clip Fal returned because the response carries no usage.
 */
export function clipCost(
  model: VideoModelCfg,
  input: Record<string, unknown>,
  raw: RawClipInfo | null,
): ClipUsage {
  if (model.price_usd_per_second != null) {
    const billed =
      typeof input.num_frames === 'number'
        ? input.num_frames / WAN_BILLING_FPS
        : Number(input.duration ?? raw?.seconds ?? Number.NaN);
    const ok = Number.isFinite(billed);
    return {
      billed_seconds: ok ? billed : null,
      tokens: null,
      cost_usd: ok ? round4(billed * model.price_usd_per_second) : null,
      raw,
    };
  }
  const tokens = raw ? Math.round((raw.width * raw.height * raw.fps * raw.seconds) / 1024) : null;
  return {
    billed_seconds: null,
    tokens,
    cost_usd:
      tokens != null && model.price_usd_per_million_tokens != null
        ? round4((tokens / 1_000_000) * model.price_usd_per_million_tokens)
        : null,
    raw,
  };
}

function extractVideoUrl(payload: unknown): string | null {
  const p = payload as { video?: { url?: string } | string; videos?: { url?: string }[] };
  if (typeof p.video === 'string') return p.video;
  if (p.video?.url) return p.video.url;
  if (p.videos?.[0]?.url) return p.videos[0].url;
  return null;
}

/** Submit an image→video task to the Fal queue and poll until it finishes. */
async function runFalVideoTask(
  endpoint: string,
  input: Record<string, unknown>,
  onProgress?: (p: { progress: number; etaMs: number }) => void,
): Promise<string> {
  const apiKey = await resolveFalKey();
  if (!apiKey) {
    throw new AppError(
      'AI_VIDEO_FAILED',
      'Fal.ai API key is not configured in Admin → Integrations.',
      503,
    );
  }

  const submitRes = await fetch(`${FAL_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(30_000),
  });
  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => '');
    if (submitRes.status === 402 || submitRes.status === 403) {
      throw new AppError(
        'AI_VIDEO_FAILED',
        'Fal.ai account has insufficient balance or invalid key.',
        402,
      );
    }
    throw new AppError(
      'AI_VIDEO_FAILED',
      `Fal.ai video submission failed (${submitRes.status}): ${errText}`,
      503,
    );
  }

  const submit = (await submitRes.json()) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
    video?: unknown;
    videos?: unknown;
  };
  const immediate = extractVideoUrl(submit);
  if (immediate) return immediate;

  const requestId = submit.request_id;
  const statusUrl = falUrl(
    submit.status_url,
    `${FAL_BASE}/${endpoint}/requests/${requestId}/status`,
  );
  const responseUrl = falUrl(submit.response_url, `${FAL_BASE}/${endpoint}/requests/${requestId}`);

  const start = Date.now();
  const timeoutMs = 240_000; // video ≈ 60–180s
  const deadline = start + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3_000));
    const elapsed = Date.now() - start;
    onProgress?.({
      progress: Math.min(95, Math.floor((elapsed / timeoutMs) * 100)),
      etaMs: Math.max(0, timeoutMs - elapsed),
    });

    try {
      const statusRes = await fetch(statusUrl, {
        headers: { Authorization: `Key ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!statusRes.ok) continue;
      const status = (await statusRes.json()) as { status?: string; error?: string };
      if (status.status === 'COMPLETED') {
        const finalRes = await fetch(responseUrl, {
          headers: { Authorization: `Key ${apiKey}` },
          signal: AbortSignal.timeout(10_000),
        });
        const url = extractVideoUrl(await finalRes.json());
        if (!url) throw new AppError('AI_VIDEO_FAILED', 'Fal returned no video URL.', 502);
        onProgress?.({ progress: 100, etaMs: 0 });
        return url;
      }
      if (status.status === 'FAILED' || status.status === 'ERROR') {
        throw new AppError('AI_VIDEO_FAILED', status.error ?? 'Fal video generation failed.', 500);
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      // transient — keep polling
    }
  }
  throw new AppError('AI_VIDEO_FAILED', 'Video generation timed out. Please try again.', 504);
}

/**
 * Centre-crop `inputBuf` to `aspect` and trim to `seconds`, re-encoding to a
 * web-playable silent H.264 MP4. Exported for the self-check.
 */
export async function cropTrimToAspect(
  inputBuf: Buffer,
  aspect: VideoAspect,
  seconds: number,
): Promise<{ mp4: Buffer; raw: RawClipInfo | null }> {
  const [w, h] = ASPECT_DIMS[aspect];
  const dir = await mkdtemp(join(tmpdir(), 'kanchuki-promo-vid-'));
  try {
    const inPath = join(dir, 'in.mp4');
    const outPath = join(dir, 'out.mp4');
    await writeFile(inPath, inputBuf);
    // Third-party bytes: pin the demuxer and allow only local file reads, so a playlist
    // disguised as the clip cannot make ffmpeg open other files or URLs.
    const { stderr } = await execFileAsync(
      FFMPEG_BIN,
      [
        '-y',
        '-protocol_whitelist',
        'file',
        '-f',
        'mp4',
        '-i',
        inPath,
        '-t',
        String(seconds),
        '-vf',
        `crop='min(iw,ih*${w}/${h})':'min(ih,iw*${h}/${w})',scale=${w}:${h},setsar=1`,
        '-c:v',
        'libx264',
        '-crf',
        '23',
        '-preset',
        'faster',
        '-pix_fmt',
        'yuv420p',
        '-an',
        '-movflags',
        '+faststart',
        outPath,
      ],
      { timeout: FFMPEG_TIMEOUT_MS },
    );
    // The `-i` banner on stderr already describes the input clip: no extra probe.
    return { mp4: await readFile(outPath), raw: parseClipInfo(stderr) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export interface ImageToVideoOpts {
  model: VideoModelCfg;
  motionPrompt: string;
  aspect: VideoAspect;
  seconds: 5 | 6 | 8;
  onProgress?: (p: { progress: number; etaMs: number }) => void;
  /** Fal has finished (and billed) the clip; awaited before we download it. */
  onFalComplete?: () => Promise<void>;
  /** Called once whenever Fal may have billed: after the clip (success or not), or on a poll
   *  timeout (Fal keeps rendering). Cost is measured only when ffmpeg read the clip. */
  onUsage?: (usage: ClipUsage) => void;
}

/**
 * Photo URL in → finished promo MP4 Buffer out (cropped to aspect, trimmed to
 * seconds). `imageUrl` must be a public/fetchable URL (R2 public URL or a
 * presigned source url — same requirement as the studio shoot).
 */
export async function generateImageToVideo(
  imageUrl: string,
  opts: ImageToVideoOpts,
): Promise<{ mp4: Buffer; usage: ClipUsage }> {
  const input = buildFalInput(
    opts.model.endpoint,
    imageUrl,
    opts.motionPrompt,
    opts.aspect,
    opts.seconds,
  );
  let falVideoUrl: string;
  try {
    falVideoUrl = await runFalVideoTask(opts.model.endpoint, input, opts.onProgress);
  } catch (err) {
    // Our poll gave up but Fal does not stop: it still renders and bills the clip.
    if (err instanceof AppError && err.status === 504) {
      opts.onUsage?.(clipCost(opts.model, input, null));
    }
    throw err;
  }
  await opts.onFalComplete?.();

  let info: RawClipInfo | null = null;
  try {
    const res = await ssrfSafeFetch(falVideoUrl, undefined, MAX_CLIP_BYTES);
    if (!res.ok) {
      throw new AppError('AI_VIDEO_FAILED', `Failed to fetch Fal video: ${res.status}`, 502);
    }
    const raw = await readCappedBuffer(res, MAX_CLIP_BYTES);
    const out = await cropTrimToAspect(raw, opts.aspect, opts.seconds);
    info = out.raw;
    return { mp4: out.mp4, usage: clipCost(opts.model, input, info) };
  } finally {
    opts.onUsage?.(clipCost(opts.model, input, info));
  }
}
