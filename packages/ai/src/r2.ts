import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getSecret } from '@kanchuki/db'

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
})

async function getBucket(): Promise<string> {
  return (await getSecret('R2_BUCKET_NAME')) ?? 'kanchuki-prod'
}

const PUBLIC_URL = process.env['R2_PUBLIC_URL'] ?? ''

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
  })
  return getSignedUrl(r2, command, { expiresIn })
}

/** Generate presigned GET URL for private objects */
export async function getDownloadPresignedUrl(
  key: string,
  expiresIn = 3600, // 1 hour
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: await getBucket(), Key: key })
  return getSignedUrl(r2, command, { expiresIn })
}

/** Delete an object from R2 */
export async function deleteObject(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: await getBucket(), Key: key }))
}

/** Download an object's bytes directly (for server-side processing, e.g. CV jobs) */
export async function downloadBuffer(key: string): Promise<Buffer> {
  const { Body } = await r2.send(new GetObjectCommand({ Bucket: await getBucket(), Key: key }))
  const chunks: Buffer[] = []
  for await (const chunk of Body as AsyncIterable<Buffer>) chunks.push(chunk)
  return Buffer.concat(chunks)
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
  )
}

/** Public CDN URL for a key (works only if bucket has public access) */
export function publicUrl(key: string): string {
  return `${PUBLIC_URL}/${key}`
}

/** Fetch a URL's bytes and store them at an R2 key. Used to persist a
 *  consented copy of a photo somewhere other than its original location. */
export async function copyUrlToR2(
  sourceUrl: string,
  key: string,
  contentType: string,
): Promise<void> {
  const res = await fetch(sourceUrl)
  if (!res.ok) throw new Error(`Failed to fetch ${sourceUrl}: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  await uploadBuffer(key, buffer, contentType)
}
