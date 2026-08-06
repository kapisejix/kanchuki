/**
 * Measure R2 bucket storage — total bytes, object count, and a per-prefix
 * breakdown (so we can see where storage goes and what a compression pass
 * could reclaim).
 *
 * Usage:
 *   npx tsx scripts/measure-r2-storage.ts
 *
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 * (loaded from the root .env automatically when present).
 */
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'

// Load the root .env so the script works with `npx tsx` without extra flags.
try {
  process.loadEnvFile('.env')
} catch {
  // no .env — rely on process env
}

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp']

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set (root .env or process env)`)
  return v
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const accountId = requireEnv('R2_ACCOUNT_ID')
const accessKeyId = requireEnv('R2_ACCESS_KEY_ID')
const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY')
const bucket = process.env.R2_BUCKET_NAME ?? 'kanchuki-prod'

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
})

interface PrefixStat {
  count: number
  bytes: number
  imageBytes: number
  imageCount: number
}

async function main(): Promise<void> {
  console.log(`Listing objects in bucket '${bucket}'...`)
  let continuation: string | undefined
  let total = 0
  let totalBytes = 0
  let imageBytes = 0
  let imageCount = 0
  const byPrefix = new Map<string, PrefixStat>()

  do {
    const res = await r2.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuation,
        MaxKeys: 1000,
      }),
    )
    for (const obj of res.Contents ?? []) {
      const key = obj.Key ?? ''
      const size = obj.Size ?? 0
      total += 1
      totalBytes += size

      const prefix = key.split('/')[0] ?? '(root)'
      const stat = byPrefix.get(prefix) ?? { count: 0, bytes: 0, imageBytes: 0, imageCount: 0 }
      stat.count += 1
      stat.bytes += size
      const lower = key.toLowerCase()
      if (IMAGE_EXTS.some((ext) => lower.endsWith(ext))) {
        stat.imageCount += 1
        stat.imageBytes += size
        imageCount += 1
        imageBytes += size
      }
      byPrefix.set(prefix, stat)
    }
    continuation = res.IsTruncated ? res.NextContinuationToken : undefined
    process.stdout.write(`\r  scanned ${total} objects (${formatBytes(totalBytes)})...`)
  } while (continuation)

  console.log('\n\n════════ R2 Storage Report ════════')
  console.log(`Bucket:          ${bucket}`)
  console.log(`Total objects:   ${total.toLocaleString('en-IN')}`)
  console.log(`Total storage:   ${formatBytes(totalBytes)}`)
  console.log(`Image objects:   ${imageCount.toLocaleString('en-IN')}`)
  console.log(`Image storage:   ${formatBytes(imageBytes)} (${totalBytes > 0 ? ((imageBytes / totalBytes) * 100).toFixed(1) : 0}% of total)`)
  console.log('')

  const rows = [...byPrefix.entries()].sort((a, b) => b[1].bytes - a[1].bytes)
  console.log('Per-prefix breakdown:')
  console.log('  prefix                    objects        bytes        image bytes')
  for (const [prefix, stat] of rows) {
    console.log(
      `  ${prefix.padEnd(26)} ${String(stat.count).padStart(10)} ${formatBytes(stat.bytes).padStart(12)} ${formatBytes(stat.imageBytes).padStart(14)}`,
    )
  }
  console.log('\n(compressible = image bytes; backups/videos are not image-format)')
}

main().catch((err) => {
  console.error('\n✖ Measurement failed:', err.message)
  process.exit(1)
})
