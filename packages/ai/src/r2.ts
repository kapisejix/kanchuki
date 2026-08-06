import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getSecret } from '@kanchuki/db';
import { readCappedBuffer, ssrfSafeFetch } from './safe-fetch.js';

// F-012: access key pair resolves through getSecret() (DB-first, .env
// fallback) via an async credentials provider — the AWS SDK's documented
// way to support rotatable credentials. R2_ACCOUNT_ID/R2_PUBLIC_URL stay
// env-only: they're non-secret identifiers baked into client construction,
// not worth a deeper async-endpoint refactor.
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com`,
  credentials: async () => ({
    accessKeyId: (await getSecret('R2_ACCESS_KEY_ID')) ?? '',
    secretAccessKey: (await getSecret('R2_SECRET_ACCESS_KEY')) ?? '',
  }),
});

async function getBucket(): Promise<string> {
  return (await getSecret('R2_BUCKET_NAME')) ?? 'kanchuki-prod';
}

const PUBLIC_URL = process.env['R2_PUBLIC_URL'] ?? '';

/** Generate presigned PUT URL for direct browser upload */
export async function getUploadPresignedUrl(
  key: string,
  contentType: string,
  expiresIn = 300, // 5 minutes
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: await getBucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2, command, { expiresIn });
}

/** Generate presigned GET URL for private objects */
export async function getDownloadPresignedUrl(
  key: string,
  expiresIn = 3600, // 1 hour
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: await getBucket(), Key: key });
  return getSignedUrl(r2, command, { expiresIn });
}

/** Delete an object from R2 */
export async function deleteObject(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: await getBucket(), Key: key }));
}

/** Download an object's bytes directly (for server-side processing, e.g. CV jobs) */
export async function downloadBuffer(key: string): Promise<Buffer> {
  const { Body } = await r2.send(new GetObjectCommand({ Bucket: await getBucket(), Key: key }));
  const chunks: Buffer[] = [];
  for await (const chunk of Body as AsyncIterable<Buffer>) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** Upload buffer directly (for server-side jobs) */
export async function uploadBuffer(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  await r2.send(
    new PutObjectCommand({
      Bucket: await getBucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
}

/** Public CDN URL for a key (works only if bucket has public access) */
export function publicUrl(key: string): string {
  return `${PUBLIC_URL}/${key}`;
}

/**
 * List every object in the bucket (cursor-paginated, MaxKeys 1000 per call).
 * Returns { key, size } pairs. Used by the daily R2 compression cron and
 * the storage measurement tool.
 */
export async function listObjects(): Promise<{ key: string; size: number }[]> {
  const bucket = await getBucket();
  const objects: { key: string; size: number }[] = [];
  let continuation: string | undefined;
  do {
    const res = await r2.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuation,
        MaxKeys: 1000,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key) objects.push({ key: obj.Key, size: obj.Size ?? 0 });
    }
    continuation = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuation);
  return objects;
}

// Same image-format list as scripts/measure-r2-storage.ts — .jpg/.jpeg/.png/.webp
// count toward "image storage" (even though only .jpg/.jpeg are compressible).
const MEASURE_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

// Type aliases, not interfaces: the measure job writes this shape into a Prisma
// Json field, and interfaces lack the implicit index signature Prisma's
// InputJsonObject requires — object-literal type aliases have it.
export type R2PrefixStat = {
  prefix: string;
  count: number;
  bytes: number;
  image_bytes: number;
};

export type R2StorageMeasurement = {
  bucket: string;
  total_objects: number;
  total_bytes: number;
  image_objects: number;
  image_bytes: number;
  /** percentage of total bytes that are image-format (0–100) */
  image_pct: number;
  /** top-level prefix breakdown, largest first */
  by_prefix: R2PrefixStat[];
};

/**
 * Pure rollup of a bucket listing into storage totals — mirrors the numbers
 * scripts/measure-r2-storage.ts prints (total/object count, image split,
 * per-prefix breakdown). Extracted pure so the math is unit-testable without
 * an S3 client; `measureR2Storage` below feeds it a real listing.
 */
export function summarizeR2Objects(
  objects: { key: string; size: number }[],
  bucket: string,
): R2StorageMeasurement {
  const byPrefix = new Map<string, { count: number; bytes: number; image_bytes: number }>();
  let totalBytes = 0;
  let imageBytes = 0;
  let imageCount = 0;

  for (const { key, size } of objects) {
    totalBytes += size;
    const prefix = key.split('/')[0] ?? '(root)';
    const stat = byPrefix.get(prefix) ?? { count: 0, bytes: 0, image_bytes: 0 };
    stat.count += 1;
    stat.bytes += size;
    const lower = key.toLowerCase();
    if (MEASURE_IMAGE_EXTS.some((ext) => lower.endsWith(ext))) {
      stat.image_bytes += size;
      imageBytes += size;
      imageCount += 1;
    }
    byPrefix.set(prefix, stat);
  }

  const byPrefixSorted = [...byPrefix.entries()]
    .map(([prefix, s]) => ({ prefix, ...s }))
    .sort((a, b) => b.bytes - a.bytes);

  return {
    bucket,
    total_objects: objects.length,
    total_bytes: totalBytes,
    image_objects: imageCount,
    image_bytes: imageBytes,
    image_pct: totalBytes > 0 ? (imageBytes / totalBytes) * 100 : 0,
    by_prefix: byPrefixSorted,
  };
}

/**
 * Measure live R2 storage: lists the whole bucket and rolls up totals
 * (the same numbers scripts/measure-r2-storage.ts prints, served over HTTP
 * via the admin Storage Report page). Throws when R2 is unconfigured.
 */
export async function measureR2Storage(): Promise<R2StorageMeasurement> {
  if (!process.env['R2_ACCOUNT_ID']) {
    throw new Error('R2 not configured on this environment (R2_ACCOUNT_ID missing)');
  }
  const bucket = await getBucket();
  return summarizeR2Objects(await listObjects(), bucket);
}

/** Fetch a URL's bytes and store them at an R2 key. Used to persist a
 *  consented copy of a photo somewhere other than its original location. */
export async function copyUrlToR2(
  sourceUrl: string,
  key: string,
  contentType: string,
): Promise<void> {
  const res = await ssrfSafeFetch(sourceUrl);
  if (!res.ok) throw new Error(`Failed to fetch ${sourceUrl}: ${res.status}`);
  const buffer = await readCappedBuffer(res);
  await uploadBuffer(key, buffer, contentType);
}
