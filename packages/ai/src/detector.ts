import { createHash } from 'node:crypto';
import type { AiTagResult } from '@kanchuki/shared';
import { publicUrl, uploadBuffer } from './r2.js';
import { readCappedBuffer, ssrfSafeFetch } from './safe-fetch.js';
import { type TaggingCallOpts, tagProductImageUrl } from './tagger.js';

interface DetectedBbox {
  x_pct: number; // 0-100, left edge
  y_pct: number; // 0-100, top edge
  w_pct: number; // 0-100, width
  h_pct: number; // 0-100, height
}

export interface DetectedItem {
  bbox: DetectedBbox;
  description: string;
  tags: AiTagResult;
}

/**
 * Fetch an image buffer from a URL.
 */
export async function fetchImageBuffer(imageUrl: string): Promise<Buffer> {
  const res = await ssrfSafeFetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  return readCappedBuffer(res);
}

function isJpegPngWebp(b: Buffer): boolean {
  const jpeg = b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png =
    b.length >= 8 &&
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp =
    b.length >= 12 &&
    b.toString('latin1', 0, 4) === 'RIFF' &&
    b.toString('latin1', 8, 12) === 'WEBP';
  return jpeg || png || webp;
}

/**
 * Upload the photo to R2 as-is and run AI tagging on it. One product per photo:
 * multi-item detection, cropping and perceptual-hash duplicate detection were
 * removed (2026-10-09, docs/tasks/pending/improvments-railway.md). Return shape
 * is unchanged so catalog-import callers keep working.
 */
export async function detectCropAndTag(
  sourceImageUrl: string,
  retailerId: string,
  opts?: TaggingCallOpts,
): Promise<Array<DetectedItem & { croppedUrl: string; r2Key: string }>> {
  const imageBuffer = await fetchImageBuffer(sourceImageUrl);
  // H5-2: same magic-byte gate as verifyUpload (RC-075) — this key goes on the public CDN.
  // ponytail: inline copy, packages/ai cannot import sniffUploadType from apps/api; move it to
  // @kanchuki/shared if a third caller needs it.
  if (!isJpegPngWebp(imageBuffer)) throw new Error('Not a JPEG/PNG/WebP image');
  const r2Key = `catalog-import/${retailerId}/${createHash('sha256').update(imageBuffer).digest('hex').slice(0, 16)}.jpg`;
  await uploadBuffer(r2Key, imageBuffer, 'image/jpeg');
  const croppedUrl = publicUrl(r2Key);
  await opts?.beforeCall?.();
  const tags = await tagProductImageUrl(sourceImageUrl, opts);
  return [
    {
      bbox: { x_pct: 0, y_pct: 0, w_pct: 100, h_pct: 100 },
      description: 'Full image',
      tags,
      croppedUrl,
      r2Key,
    },
  ];
}
