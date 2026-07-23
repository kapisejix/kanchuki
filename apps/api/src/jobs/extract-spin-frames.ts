import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { cleanupProductPhoto, deleteObject, downloadBuffer, publicUrl, uploadBuffer } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { R2_PATHS } from '@kanchuki/shared';

const execFileAsync = promisify(execFile);

// ponytail: shell out to system ffmpeg/ffprobe (same approach as the Python CV
// script in extract-measurement.ts) instead of a fluent-ffmpeg wrapper dependency.
const FFMPEG_BIN = process.env.FFMPEG_BIN ?? 'ffmpeg';
const FFPROBE_BIN = process.env.FFPROBE_BIN ?? 'ffprobe';
const SPIN_FRAME_COUNT = 24;

export interface SpinFrameJobData {
  product_id: string;
  retailer_id: string;
  video_r2_key: string;
}

export async function handleExtractSpinFrames(data: SpinFrameJobData): Promise<void> {
  const { product_id, retailer_id, video_r2_key } = data;
  const dir = await mkdtemp(join(tmpdir(), 'kanchuki-spin-'));
  const videoPath = join(dir, 'input.mp4');

  try {
    const videoBuf = await downloadBuffer(video_r2_key);
    await writeFile(videoPath, videoBuf);

    const { stdout: durationOut } = await execFileAsync(FFPROBE_BIN, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      videoPath,
    ]);
    const duration = Number.parseFloat(durationOut.trim());
    if (!duration || duration <= 0) throw new Error('Could not read spin video duration');

    const fps = SPIN_FRAME_COUNT / duration;
    await execFileAsync(FFMPEG_BIN, [
      '-i',
      videoPath,
      '-vf',
      `fps=${fps}`,
      '-vsync',
      'vfr',
      '-q:v',
      '3',
      join(dir, 'frame-%03d.jpg'),
    ]);

    const frameFiles = (await readdir(dir))
      .filter((f) => f.startsWith('frame-'))
      .sort()
      .slice(0, SPIN_FRAME_COUNT);
    if (frameFiles.length === 0) throw new Error('ffmpeg produced no frames');

    // F-011: if the retailer has picked a custom background, composite every
    // frame onto it (same cutout+composite as the static photo). No custom
    // background selected → frames stay as raw ffmpeg output, unchanged.
    const product = await prisma.product.findUnique({
      where: { id: product_id },
      include: { background_image: true },
    });
    const bgUrl =
      product?.background_image?.is_active ? product.background_image.image_url : undefined;

    const uploaded = await Promise.all(
      frameFiles.map(async (file, i) => {
        let buf: Buffer = await readFile(join(dir, file));
        if (bgUrl) {
          // ponytail: best-effort per frame — one bad frame falls back to
          // its raw ffmpeg output instead of failing the whole spin.
          buf = await cleanupProductPhoto(buf, bgUrl).catch(() => buf);
        }
        const r2Key = R2_PATHS.spinFrame(retailer_id, product_id, i);
        await uploadBuffer(r2Key, buf, 'image/jpeg');
        return { r2Key, i };
      }),
    );

    await prisma.$transaction([
      prisma.productSpinFrame.deleteMany({ where: { product_id } }),
      prisma.productSpinFrame.createMany({
        data: uploaded.map(({ r2Key, i }) => ({
          product_id,
          retailer_id,
          r2_key: r2Key,
          url: publicUrl(r2Key),
          frame_index: i,
        })),
      }),
    ]);

    await prisma.product.update({
      where: { id: product_id },
      data: { spin_status: 'ready', spin_error: null },
    });

    // Source video is only needed to produce the frames — drop it once done.
    await deleteObject(video_r2_key).catch(() => {});
  } catch (err) {
    await prisma.product
      .update({
        where: { id: product_id },
        data: {
          spin_status: 'failed',
          spin_error: err instanceof Error ? err.message : 'Frame extraction failed',
        },
      })
      .catch(() => {});
    console.error(`[jobs] extract-spin-frames failed ${product_id}:`, err);
    throw err; // re-throw so BullMQ records the failure and retries
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
