import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env['R2_ACCESS_KEY_ID'] ?? '',
    secretAccessKey: process.env['R2_SECRET_ACCESS_KEY'] ?? '',
  },
})

const BUCKET = process.env['R2_BUCKET_NAME'] ?? 'kanchuki-prod'
const PUBLIC_URL = process.env['R2_PUBLIC_URL'] ?? ''

/** Generate presigned PUT URL for direct browser upload */
export async function getUploadPresignedUrl(
  key: string,
  contentType: string,
  expiresIn = 300, // 5 minutes
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
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
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return getSignedUrl(r2, command, { expiresIn })
}

/** Delete an object from R2 */
export async function deleteObject(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

/** True if an object exists at this key, without downloading its body */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return true
  } catch {
    return false
  }
}

/** Download an object's bytes directly (for server-side processing, e.g. CV jobs) */
export async function downloadBuffer(key: string): Promise<Buffer> {
  const { Body } = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
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
      Bucket: BUCKET,
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
