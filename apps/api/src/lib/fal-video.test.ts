// F-034 step 1 self-check — the only non-trivial logic in fal-video.ts is the
// ffmpeg crop/trim (the Fal submit/poll is a thin copy of runFalTask). Mock
// nothing here: generate a real source clip with ffmpeg, run cropTrimToAspect,
// and read the output back with ffmpeg to assert the aspect + duration landed.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type VideoModelCfg,
  buildFalInput,
  clipCost,
  cropTrimToAspect,
  falUrl,
  parseClipInfo,
} from './fal-video.js';

const execFileAsync = promisify(execFile);
const FFMPEG = process.env.FFMPEG_BIN ?? (ffmpegPath as unknown as string) ?? 'ffmpeg';

/** Read a clip's reported resolution + duration out of ffmpeg's stderr. */
async function probe(buf: Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fal-video-probe-'));
  try {
    const p = join(dir, 'probe.mp4');
    await writeFile(p, buf);
    const { stderr } = await execFileAsync(FFMPEG, ['-i', p, '-f', 'null', '-']);
    return stderr;
  } catch (err) {
    // `-f null -` normally exits 0; if it errors, surface its stderr anyway.
    return (err as { stderr?: string }).stderr ?? String(err);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('fal-video', () => {
  let source: Buffer;

  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fal-video-src-'));
    try {
      const out = join(dir, 'src.mp4');
      await execFileAsync(FFMPEG, [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=640x480:rate=25:duration=10',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        out,
      ]);
      source = await readFile(out);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('crops a landscape clip to 9:16, trims to 5s and measures the raw clip', async () => {
    const { mp4, raw } = await cropTrimToAspect(source, '9:16', 5);
    expect(mp4.length).toBeGreaterThan(1000);
    const info = await probe(mp4);
    expect(info).toMatch(/1080x1920/);
    expect(info).toMatch(/Duration: 00:00:0[45]/); // 5s ± container rounding
    // raw = the INPUT clip (what a token-priced model bills), not our crop.
    expect(raw).toMatchObject({ width: 640, height: 480, fps: 25 });
    expect(raw?.seconds).toBeCloseTo(10, 0);
  }, 60_000);

  it('crops to a 1:1 square', async () => {
    const { mp4 } = await cropTrimToAspect(source, '1:1', 5);
    const info = await probe(mp4);
    expect(info).toMatch(/1080x1080/);
  }, 60_000);

  it('refuses bytes that are not MP4 (demuxer pinned: no playlist/other-format sniffing)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fal-video-ts-'));
    try {
      const out = join(dir, 'src.ts');
      await execFileAsync(FFMPEG, [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=320x240:rate=25:duration=2',
        '-c:v',
        'mpeg2video',
        '-f',
        'mpegts',
        out,
      ]);
      await expect(cropTrimToAspect(await readFile(out), '1:1', 1)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('falUrl', () => {
  const FB = 'https://queue.fal.run/x/requests/1';
  it.each([
    ['https://queue.fal.run/x/requests/1/status', true],
    ['https://fal.run/x', true],
    ['https://evil.example/fal.run', false],
    ['https://fal.run.evil.example/x', false],
    ['https://evilfal.run/x', false],
    ['http://queue.fal.run/x', false],
    ['not a url', false],
  ])('%s kept=%s (our API key goes with it)', (u, kept) => {
    expect(falUrl(u, FB)).toBe(kept ? u : FB);
  });
  it('falls back when Fal sent nothing', () => {
    expect(falUrl(undefined, FB)).toBe(FB);
  });
});

// Endpoints as seeded by migration 166 (schemas read from llms.txt 2026-11-17).
const KLING_25 = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video';
const KLING_26 = 'fal-ai/kling-video/v2.6/pro/image-to-video';
const WAN = 'fal-ai/wan/v2.2-a14b/image-to-video';
const SEEDANCE = 'fal-ai/bytedance/seedance/v1/pro/fast/image-to-video';

const perSecond = (endpoint: string, price: number): VideoModelCfg => ({
  model_key: 'm',
  endpoint,
  price_usd_per_second: price,
  price_usd_per_million_tokens: null,
});

describe('buildFalInput', () => {
  it('Kling 2.6 uses start_image_url and turns audio off (audio doubles the price)', () => {
    const input = buildFalInput(KLING_26, 'https://x/a.jpg', 'p', '9:16', 5);
    expect(input).toEqual({
      start_image_url: 'https://x/a.jpg',
      prompt: 'p',
      duration: '5',
      generate_audio: false,
    });
  });

  it('Kling 2.5 uses image_url, no audio flag, 8 s asks for 10', () => {
    const input = buildFalInput(KLING_25, 'https://x/a.jpg', 'p', '9:16', 8);
    expect(input).toEqual({ image_url: 'https://x/a.jpg', prompt: 'p', duration: '10' });
  });

  it('Wan sets length by frames at 16 fps and maps 4:5 to 9:16', () => {
    const input = buildFalInput(WAN, 'https://x/a.jpg', 'p', '4:5', 5);
    expect(input).toMatchObject({ num_frames: 81, resolution: '720p', aspect_ratio: '9:16' });
  });

  it('Seedance asks for 720p (default is 1080p) and maps 4:5 to 3:4', () => {
    const input = buildFalInput(SEEDANCE, 'https://x/a.jpg', 'p', '4:5', 6);
    expect(input).toMatchObject({ resolution: '720p', duration: '6', aspect_ratio: '3:4' });
  });

  it('refuses an endpoint it has no mapping for', () => {
    expect(() => buildFalInput('fal-ai/luma/x', 'https://x/a.jpg', 'p', '9:16', 5)).toThrow(
      /No Fal input mapping/,
    );
  });
});

describe('clipCost', () => {
  const raw720 = { width: 720, height: 1280, fps: 24, seconds: 5 };

  it('per-second Kling bills the requested duration', () => {
    const m = perSecond(KLING_26, 0.07);
    const u = clipCost(m, buildFalInput(KLING_26, 'u', 'p', '9:16', 5), raw720);
    expect(u).toMatchObject({ billed_seconds: 5, tokens: null, cost_usd: 0.35 });
  });

  it('per-second Wan bills num_frames / 16', () => {
    const m = perSecond(WAN, 0.08);
    const u = clipCost(m, buildFalInput(WAN, 'u', 'p', '9:16', 5), null);
    expect(u.billed_seconds).toBeCloseTo(81 / 16);
    expect(u.cost_usd).toBeCloseTo(0.405, 4);
  });

  it('token-priced Seedance: h*w*fps*s/1024 tokens at the DB price per 1M', () => {
    const m: VideoModelCfg = {
      model_key: 's',
      endpoint: SEEDANCE,
      price_usd_per_second: null,
      price_usd_per_million_tokens: 1,
    };
    const u = clipCost(m, {}, raw720);
    expect(u.tokens).toBe(108_000);
    expect(u.cost_usd).toBe(0.108);
  });

  it('no price or no measurement gives null cost, never a guess', () => {
    const noPrice: VideoModelCfg = {
      model_key: 's',
      endpoint: SEEDANCE,
      price_usd_per_second: null,
      price_usd_per_million_tokens: null,
    };
    expect(clipCost(noPrice, {}, raw720).cost_usd).toBeNull();
    expect(clipCost({ ...noPrice, price_usd_per_million_tokens: 1 }, {}, null).cost_usd).toBeNull();
  });
});

describe('parseClipInfo', () => {
  it('reads size, fps and duration from an ffmpeg banner', () => {
    const banner =
      '  Duration: 00:00:05.04, start: 0.000000, bitrate: 1234 kb/s\n' +
      '  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 720x1280 [SAR 1:1 DAR 9:16], 900 kb/s, 24 fps, 24 tbr';
    expect(parseClipInfo(banner)).toEqual({ width: 720, height: 1280, fps: 24, seconds: 5.04 });
  });

  it('returns null when the banner has no video stream', () => {
    expect(parseClipInfo('  Duration: 00:00:05.00')).toBeNull();
  });
});
