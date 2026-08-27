import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import { downloadBuffer, publicUrl, uploadBuffer } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { R2_PATHS } from '@kanchuki/shared';
import { createId } from '@paralleldrive/cuid2';

const execFileAsync = promisify(execFile);

// Use FFMPEG_BIN if set (e.g. system binary), otherwise fall back to ffmpeg-static binary
const FFMPEG_BIN = process.env.FFMPEG_BIN ?? (ffmpegPath as unknown as string) ?? 'ffmpeg';

const MAX_PHOTOS = 3;
const TOTAL_MAX_SEC = 6.0; // Max 6 seconds total video duration
const FPS = 25;
const CANVAS_W = 1080;
const CANVAS_H = 1350; // 4:5 — matches Facebook/Instagram feed video crop

export interface KenBurnsVideoJobData {
  product_id: string;
  retailer_id: string;
}

export async function handleGenerateKenBurnsVideo(data: KenBurnsVideoJobData): Promise<void> {
  const { product_id, retailer_id } = data;
  const dir = await mkdtemp(join(tmpdir(), 'kanchuki-kenburns-'));

  try {
    const photos = await prisma.productPhoto.findMany({
      where: { product_id },
      orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }],
      take: MAX_PHOTOS,
    });
    if (photos.length < 2) {
      throw new Error('Product needs at least 2 photos to generate a video');
    }

    const photoPaths = await Promise.all(
      photos.map(async (photo, i) => {
        const buf = await downloadBuffer(photo.r2_key);
        const path = join(dir, `photo-${i}.jpg`);
        await writeFile(path, buf);
        return path;
      }),
    );

    const outPath = join(dir, 'output.mp4');
    const segSec = Number((TOTAL_MAX_SEC / photoPaths.length).toFixed(2));
    const frames = Math.round(FPS * segSec);

    // Pass single static image per photo into ffmpeg.
    // zoompan takes 1 frame per input and outputs exactly `frames` frames at `fps`.
    const inputArgs = photoPaths.flatMap((p) => ['-i', p]);
    const perClip = photoPaths.map(
      (_, i) =>
        `[${i}:v]scale=${CANVAS_W}*2:${CANVAS_H}*2:force_original_aspect_ratio=increase,` +
        `crop=${CANVAS_W}*2:${CANVAS_H}*2,` +
        `zoompan=z='min(zoom+0.0015,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${CANVAS_W}x${CANVAS_H}:fps=${FPS}[v${i}]`,
    );
    const concatInputs = photoPaths.map((_, i) => `[v${i}]`).join('');
    const filterComplex = `${perClip.join(';')};${concatInputs}concat=n=${photoPaths.length}:v=1:a=0[outv]`;

    await execFileAsync(FFMPEG_BIN, [
      '-y',
      ...inputArgs,
      '-filter_complex',
      filterComplex,
      '-map',
      '[outv]',
      '-c:v',
      'libx264',
      '-crf',
      '23',
      '-preset',
      'faster',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outPath,
    ]);

    const videoBuf = await readFile(outPath);
    const filename = `${createId()}.mp4`;
    const r2Key = R2_PATHS.productVideo(retailer_id, product_id, filename);
    await uploadBuffer(r2Key, videoBuf, 'video/mp4');

    const hasVideo = await prisma.productVideo.findFirst({ where: { product_id } });
    await prisma.productVideo.create({
      data: {
        product_id,
        retailer_id,
        r2_key: r2Key,
        public_url: publicUrl(r2Key),
        duration_sec: Math.round(segSec * photoPaths.length),
        is_main: !hasVideo,
        source: 'KEN_BURNS',
      },
    });
  } catch (err) {
    console.error(`[jobs] generate-ken-burns-video failed ${product_id}:`, err);
    throw err; // re-throw so BullMQ records the failure
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
