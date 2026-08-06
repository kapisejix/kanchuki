/**
 * Batch-compress every image in the R2 bucket to ≤80KB (quality-first —
 * see packages/ai/src/image-compress.ts), overwriting each object IN PLACE
 * so public URLs and DB references keep working unchanged.
 *
 * Deliberately skipped by default (substrings):
 *   - 'measurements/'      — customer body photos feed AI measurement
 *                            extraction; accuracy beats bytes.
 *   - '/kyc/'              — GST/Aadhaar document photos; legibility first.
 *   - 'backups/'           — gzipped DB dumps are not images anyway.
 *
 * Usage:
 *   npx tsx scripts/compress-r2-images.ts            # dry run (default) — compresses in memory, uploads nothing
 *   npx tsx scripts/compress-r2-images.ts --apply    # compress + overwrite every eligible image
 *
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 * (loaded from the root .env automatically).
 */
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { compressImageToTarget } from '../packages/ai/src/image-compress.js'

try {
  process.loadEnvFile('.env')
} catch {
  // no .env — rely on process env
}

// JPEG only, deliberately: compressImageToTarget always outputs JPEG, and
// storing JPEG bytes under a .png/.webp key with its original content type
// breaks strict decoders — same rule as the mobile client compressor and the
// daily maintenance cron (apps/api/src/jobs/compress-r2-images.ts).
const IMAGE_EXTS = ['.jpg', '.jpeg']
const EXCLUDE_SUBSTRINGS = ['measurements/', '/kyc/', 'backups/', 'catalog-pdf']
const CONCURRENCY = 4

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
const apply = process.argv.includes('--apply')

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
})

async function download(key: string): Promise<Buffer> {
  const { Body } = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const chunks: Buffer[] = []
  for await (const chunk of Body as AsyncIterable<Buffer>) chunks.push(chunk)
  return Buffer.concat(chunks)
}

interface Outcome {
  key: string
  before: number
  after: number
  kind: 'compressed' | 'already-fine' | 'skipped' | 'failed'
  error?: string
}

async function processObject(key: string, size: number, outcomes: Outcome[]): Promise<void> {
  const lower = key.toLowerCase()
  const isImage = IMAGE_EXTS.some((ext) => lower.endsWith(ext))
  const excluded = EXCLUDE_SUBSTRINGS.some((s) => key.includes(s))
  if (!isImage || excluded) {
    outcomes.push({ key, before: size, after: size, kind: 'skipped' })
    return
  }
  if (size <= 80 * 1024) {
    outcomes.push({ key, before: size, after: size, kind: 'already-fine' })
    return
  }
  try {
    const buf = await download(key)
    const result = await compressImageToTarget(buf)
    if (result.unchanged || result.buffer.length >= buf.length) {
      outcomes.push({ key, before: size, after: size, kind: 'already-fine' })
      return
    }
    if (apply) {
      // Only JPEG keys reach here (IMAGE_EXTS above) — matches the compressor's output.
      await r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: result.buffer,
          ContentType: 'image/jpeg',
        }),
      )
    }
    outcomes.push({ key, before: size, after: result.buffer.length, kind: 'compressed' })
  } catch (err) {
    outcomes.push({ key, before: size, after: size, kind: 'failed', error: (err as Error).message })
  }
}

async function main(): Promise<void> {
  console.log(`Bucket: ${bucket} | mode: ${apply ? 'APPLY (overwriting objects)' : 'DRY RUN (nothing uploaded)'}`)
  console.log('Listing objects...')

  const keys: { key: string; size: number }[] = []
  let continuation: string | undefined
  do {
    const res = await r2.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuation, MaxKeys: 1000 }),
    )
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push({ key: obj.Key, size: obj.Size ?? 0 })
    }
    continuation = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (continuation)

  console.log(`Found ${keys.length} objects. Compressing (concurrency ${CONCURRENCY})...\n`)

  const outcomes: Outcome[] = []
  let cursor = 0
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < keys.length) {
      const item = keys[cursor]!
      cursor += 1
      await processObject(item.key, item.size, outcomes)
    }
  })
  await Promise.all(workers)

  const byKind = { compressed: 0, 'already-fine': 0, skipped: 0, failed: 0 } as Record<Outcome['kind'], number>
  let beforeBytes = 0
  let afterBytes = 0
  for (const o of outcomes) {
    byKind[o.kind] += 1
    if (o.kind === 'compressed' || o.kind === 'already-fine') {
      beforeBytes += o.before
      afterBytes += o.after
    }
  }

  console.log('════════ Compression Report ════════')
  console.log(`Scanned:           ${outcomes.length}`)
  console.log(`Compressed:        ${byKind['compressed']}`)
  console.log(`Already ≤80KB:     ${byKind['already-fine']}`)
  console.log(`Skipped (non-img): ${byKind['skipped']}`)
  console.log(`Failed:            ${byKind['failed']}`)
  console.log('')
  const saved = beforeBytes - afterBytes
  console.log(`Image bytes before:  ${formatBytes(beforeBytes)}`)
  console.log(`Image bytes after:   ${formatBytes(afterBytes)}`)
  console.log(`Saved:               ${formatBytes(saved)} (${beforeBytes > 0 ? ((saved / beforeBytes) * 100).toFixed(1) : 0}%)`)
  console.log('')
  console.log(`Result: ${apply ? '✅ written to R2' : '⚠️ DRY RUN — nothing uploaded. Re-run with --apply to write.'}`)

  const failed = outcomes.filter((o) => o.kind === 'failed')
  if (failed.length > 0) {
    console.log('\nFailures (first 5):')
    for (const f of failed.slice(0, 5)) console.log(`  ${f.key}: ${f.error}`)
  }
}

main().catch((err) => {
  console.error('\n✖ Compression pass failed:', err.message)
  process.exit(1)
})
