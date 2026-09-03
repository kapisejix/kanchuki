// F-034 — AI image→video for social promo clips.
//
// The Fal image→video call + an ffmpeg crop/trim step. This is the video
// sibling of fal-client.ts's `runFalTask` (which only reads `images[]`): video
// endpoints return `video.url` and take ~60–180s instead of ~25s. Kept out of
// fal-client.ts so the hot image path stays untouched.
//
// generateImageToVideo(photoUrl, opts) → a finished MP4 Buffer, cropped to the
// requested aspect and trimmed to `seconds`. The caller uploads it to R2.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { readCappedBuffer, ssrfSafeFetch } from '@kanchuki/ai';
import { getSecret } from '@kanchuki/db';
import ffmpegPath from 'ffmpeg-static';
import { AppError } from '../plugins/error-handler.js';

const execFileAsync = promisify(execFile);
const FFMPEG_BIN = process.env.FFMPEG_BIN ?? (ffmpegPath as unknown as string) ?? 'ffmpeg';
const FAL_BASE = 'https://queue.fal.run';

export type VideoModelKey = 'seedance' | 'wan' | 'kling_std' | 'kling_pro' | 'luma';
export type VideoAspect = '9:16' | '16:9' | '1:1' | '4:5';

/**
 * Per-model config. `inrPerClip` is the current Fal price band for a 5s clip —
 * stored here (not hardcoded in credit-pack math) so it stays honest when Fal
 * changes prices. Endpoints per fal.ai/models on 2026-09-03; re-verify at
 * build time (the spec flags these as "confirm live").
 */
export const VIDEO_MODELS: Record<
  VideoModelKey,
  { endpoint: string; inrPerClip: [number, number]; label: string }
> = {
  seedance: {
    endpoint: 'fal-ai/bytedance/seedance/v1/lite/image-to-video',
    inrPerClip: [13, 34],
    label: 'Seedance (ByteDance)',
  },
  wan: {
    endpoint: 'fal-ai/wan/v2.2/image-to-video',
    inrPerClip: [15, 34],
    label: 'WAN 2.2 (Alibaba)',
  },
  kling_std: {
    endpoint: 'fal-ai/kling-video/v1.6/standard/image-to-video',
    inrPerClip: [21, 30],
    label: 'Kling 1.6 std',
  },
  kling_pro: {
    endpoint: 'fal-ai/kling-video/v2/master/image-to-video',
    inrPerClip: [42, 85],
    label: 'Kling Pro 2.x',
  },
  luma: {
    endpoint: 'fal-ai/luma-dream-machine/ray-2/image-to-video',
    inrPerClip: [40, 170],
    label: 'Luma Ray 2',
  },
};

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
  const secret = await getSecret('FAL_API_KEY').catch(() => null);
  return secret || process.env.FAL_API_KEY || process.env.FAL_KEY || null;
}

/** Fal duration knob per model — only 5 or 10 are broadly supported; ffmpeg
 *  trims to the exact requested `seconds` afterwards. */
function buildFalInput(
  model: VideoModelKey,
  imageUrl: string,
  motionPrompt: string,
  aspect: VideoAspect,
  seconds: number,
): Record<string, unknown> {
  const base: Record<string, unknown> = { image_url: imageUrl, prompt: motionPrompt };
  const dur = seconds <= 5 ? '5' : '10';
  switch (model) {
    case 'luma':
      return {
        ...base,
        aspect_ratio: aspect,
        resolution: '720p',
        duration: dur === '5' ? '5s' : '9s',
      };
    case 'wan':
      // v2.2 image-to-video has no reliable duration knob — take its default
      // and let ffmpeg trim.
      return { ...base, aspect_ratio: aspect, resolution: '720p' };
    default:
      // seedance lite + both kling tiers
      return { ...base, aspect_ratio: aspect, duration: dur };
  }
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
  const statusUrl = submit.status_url || `${FAL_BASE}/${endpoint}/requests/${requestId}/status`;
  const responseUrl = submit.response_url || `${FAL_BASE}/${endpoint}/requests/${requestId}`;

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
): Promise<Buffer> {
  const [w, h] = ASPECT_DIMS[aspect];
  const dir = await mkdtemp(join(tmpdir(), 'kanchuki-promo-vid-'));
  try {
    const inPath = join(dir, 'in.mp4');
    const outPath = join(dir, 'out.mp4');
    await writeFile(inPath, inputBuf);
    await execFileAsync(FFMPEG_BIN, [
      '-y',
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
    ]);
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export interface ImageToVideoOpts {
  model: VideoModelKey;
  motionPrompt: string;
  aspect: VideoAspect;
  seconds: 5 | 6 | 8;
  onProgress?: (p: { progress: number; etaMs: number }) => void;
}

/**
 * Photo URL in → finished promo MP4 Buffer out (cropped to aspect, trimmed to
 * seconds). `imageUrl` must be a public/fetchable URL (R2 public URL or a
 * presigned source url — same requirement as the studio shoot).
 */
export async function generateImageToVideo(
  imageUrl: string,
  opts: ImageToVideoOpts,
): Promise<Buffer> {
  const cfg = VIDEO_MODELS[opts.model];
  if (!cfg) throw new AppError('AI_VIDEO_FAILED', `Unknown video model: ${opts.model}`, 422);

  const input = buildFalInput(opts.model, imageUrl, opts.motionPrompt, opts.aspect, opts.seconds);
  const falVideoUrl = await runFalVideoTask(cfg.endpoint, input, opts.onProgress);

  const res = await ssrfSafeFetch(falVideoUrl);
  if (!res.ok) {
    throw new AppError('AI_VIDEO_FAILED', `Failed to fetch Fal video: ${res.status}`, 502);
  }
  const raw = await readCappedBuffer(res);

  return cropTrimToAspect(raw, opts.aspect, opts.seconds);
}
