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
import { VIDEO_MODELS, cropTrimToAspect } from './fal-video.js';

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

  it('crops a landscape clip to 9:16 and trims to 5s', async () => {
    const out = await cropTrimToAspect(source, '9:16', 5);
    expect(out.length).toBeGreaterThan(1000);
    const info = await probe(out);
    expect(info).toMatch(/1080x1920/);
    expect(info).toMatch(/Duration: 00:00:0[45]/); // 5s ± container rounding
  }, 60_000);

  it('crops to a 1:1 square', async () => {
    const out = await cropTrimToAspect(source, '1:1', 5);
    const info = await probe(out);
    expect(info).toMatch(/1080x1080/);
  }, 60_000);

  it('has 5 models, all Fal endpoints with a valid price band', () => {
    const keys = Object.keys(VIDEO_MODELS);
    expect(keys).toHaveLength(5);
    for (const cfg of Object.values(VIDEO_MODELS)) {
      expect(cfg.endpoint).toMatch(/^fal-ai\//);
      expect(cfg.inrPerClip[0]).toBeLessThanOrEqual(cfg.inrPerClip[1]);
    }
  });
});
