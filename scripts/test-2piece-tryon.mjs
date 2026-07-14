// 2-Piece Try-On Test Script
// Run: node --env-file=.env scripts/test-2piece-tryon.mjs
//
// Tests the full multi-piece chaining pipeline:
// 1. Uploads test_person.jpg to R2
// 2. Crops test_garment.jpg into upper + lower using sharp
// 3. Runs chained triggerTryOn() (upper→customer, then lower→result)
// 4. Saves final try-on result
//
// Prerequisites:
//   - .env with R2 + RunPod credentials
//   - test_person.jpg at repo root
//   - A garment photo at test_garment.jpg or E:/Kanchuki/test_garment.jpg

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

// ─── Config from .env ─────────────────────────────────────────
const R2_ACCOUNT_ID = process.env['R2_ACCOUNT_ID'] ?? ''
const R2_ACCESS_KEY_ID = process.env['R2_ACCESS_KEY_ID'] ?? ''
const R2_SECRET_ACCESS_KEY = process.env['R2_SECRET_ACCESS_KEY'] ?? ''
const R2_BUCKET = process.env['R2_BUCKET_NAME'] ?? 'kanchuki-prod'
const R2_PUBLIC_URL = process.env['R2_PUBLIC_URL'] ?? ''
const CATVTON_API_URL = process.env['CATVTON_API_URL'] ?? ''
const RUNPOD_API_KEY = process.env['RUNPOD_API_KEY'] ?? ''

console.log('=== 2-Piece Try-On Test ===')
console.log('R2:', R2_PUBLIC_URL ? '✅ configured' : '❌ missing')
console.log('RunPod:', CATVTON_API_URL ? '✅ configured' : '❌ missing')
console.log('RunPod Key:', RUNPOD_API_KEY ? '✅ configured' : '❌ missing')

// ─── Check RunPod health first ───────────────────────────────
console.log('\n[0] Checking RunPod endpoint health...')
try {
  const healthRes = await fetch(`${CATVTON_API_URL}/health`, {
    headers: { Authorization: `Bearer ${RUNPOD_API_KEY}` },
    signal: AbortSignal.timeout(10_000),
  })
  const health = await healthRes.json()
  const ready = health.workers?.ready ?? 0
  console.log(`  Workers: ready=${ready}, idle=${health.workers?.idle ?? 0}, running=${health.workers?.running ?? 0}`)
  if (ready === 0 && health.workers?.idle === 0) {
    console.log('  ⚠️  No GPU workers available! The try-on call will likely time out.')
    console.log('  Start a worker on RunPod dashboard or wait for auto-scale.')
  }
} catch {
  console.log('  ❌ RunPod endpoint unreachable!')
}

// ─── Step 1: Upload customer photo to R2 ─────────────────────
console.log('\n[1] Uploading test_person.jpg to R2...')
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})

const personBuf = await readFile('test_person.jpg')
const personKey = `tryon-test/${Date.now()}/person.jpg`
await r2.send(new PutObjectCommand({
  Bucket: R2_BUCKET, Key: personKey, Body: personBuf, ContentType: 'image/jpeg',
}))
const personUrl = `${R2_PUBLIC_URL}/${personKey}`
console.log('  ✅ Person photo URL:', personUrl)

// ─── Step 2: Try to load garment photo and split it ──────────
console.log('\n[2] Trying to load garment photo...')
let garmentBuf
try {
  garmentBuf = await readFile('test_garment.jpg')
  console.log('  ✅ test_garment.jpg loaded:', (garmentBuf.length / 1024).toFixed(1), 'KB')
} catch {
  console.log('  ❌ test_garment.jpg not found at repo root')
  console.log('  You can manually set GARMENT_URL env var instead')
  if (!process.env['GARMENT_URL']) {
    console.log('  No GARMENT_URL set either. Exiting.')
    process.exit(1)
  }
}

// Try to split garment into upper (60% top) and lower (40% bottom) for testing
if (garmentBuf) {
  const metadata = await sharp(garmentBuf).metadata()
  console.log('  Image dimensions:', metadata.width, 'x', metadata.height)

  const upperHeight = Math.round((metadata.height ?? 800) * 0.6)
  const lowerHeight = (metadata.height ?? 800) - upperHeight

  // Crop upper portion
  const upperBuf = await sharp(garmentBuf)
    .extract({ left: 0, top: 0, width: metadata.width ?? 600, height: upperHeight })
    .toBuffer()
  const upperKey = `tryon-test/${Date.now()}/upper.jpg`
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: upperKey, Body: upperBuf, ContentType: 'image/jpeg',
  }))
  const upperUrl = `${R2_PUBLIC_URL}/${upperKey}`
  console.log('  ✅ Upper crop URL:', upperUrl)

  // Upload full garment as the lower piece (real use case would have separate photos)
  const lowerKey = `tryon-test/${Date.now()}/lower.jpg`
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: lowerKey, Body: garmentBuf, ContentType: 'image/jpeg',
  }))
  const lowerUrl = `${R2_PUBLIC_URL}/${lowerKey}`
  console.log('  ✅ Full garment (lower) URL:', lowerUrl)

  // ─── Step 3: Run chained try-on ────────────────────────────
  console.log('\n[3] Running chained triggerTryOn()...')
  console.log('  Category: Ladies Suit (will use resolveClothType → overall + chained path)')
  console.log('  This requires 2 sequential CatVTON runs (~60-120s total)')
  console.log('  ⚠️  Requires GPU workers to be running on RunPod!')

  // Import the tryon module from dist (need to build it first if not already built)
  try {
    const { triggerTryOn, saveTryOnResultToR2 } = await import('../packages/ai/dist/tryon.js')

    const started = Date.now()
    const result = await triggerTryOn({
      customerPhotoUrl: personUrl,
      productPhotoUrl: upperUrl,
      productCategory: 'Ladies Suit',
      pieceGarmentUrls: { upper: upperUrl, lower: lowerUrl },
    })
    const elapsed = ((Date.now() - started) / 1000).toFixed(1)
    console.log(`  ✅ Completed in ${elapsed}s`)
    console.log('  Status:', result.status)
    console.log('  Output URLs:', result.outputUrls)

    if (result.outputUrls[0]) {
      const finalUrl = await saveTryOnResultToR2(`tryon-test-${Date.now()}`, result.outputUrls[0])
      console.log('  ✅ Final result saved to R2:', finalUrl)

      // Also save locally
      const imgRes = await fetch(finalUrl)
      await writeFile('tryon-2piece-result.jpg', Buffer.from(await imgRes.arrayBuffer()))
      console.log('  ✅ Also saved locally: tryon-2piece-result.jpg')
      console.log('\n📸 Open tryon-2piece-result.jpg to check the visual quality!')
    }
  } catch (err) {
    console.log('  ❌ Try-on failed:', err instanceof Error ? err.message : String(err))
    console.log('\n💡 Most likely: No GPU worker available on RunPod.')
    console.log('  1. Go to https://www.runpod.io/serverless/gpu/pnvchif9f4bcom')
    console.log('  2. Ensure at least 1 worker is running (scale up from 0)')
    console.log('  3. Re-run this script')
    console.log('\n   Alternative: Test with a single-piece test first:')
    console.log('   cat packages/ai/scratch-test-tryon.mjs')
  }
} else {
  console.log('\n❌ Cannot proceed without garment photos.')
  console.log('   Place test_garment.jpg at project root and re-run.')
}
