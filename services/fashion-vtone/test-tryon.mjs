/**
 * V-Tone Try-On Test Script
 *
 * Tests the Fashion V-Tone v1.5 service directly (not through the full Kanchuki stack).
 * Uploads test images to R2, calls V-Tone /try-on, downloads result.
 *
 * Usage:
 *   node --env-file=.env services/fashion-vtone/test-tryon.mjs <person-image-url> <garment-image-url> [category]
 *
 *   Or use built-in test images from R2:
 *   node --env-file=.env services/fashion-vtone/test-tryon.mjs
 *
 * Requires .env with:
 *   VTONE_API_URL=http://localhost:8000   (or deployed URL)
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Config ────────────────────────────────────────────────

const VTONE_API_URL = process.env['VTONE_API_URL'] ?? 'http://localhost:8000'
const R2_ENDPOINT = process.env['R2_ACCOUNT_ID']
  ? `https://${process.env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com`
  : undefined
const R2_ACCESS_KEY = process.env['R2_ACCESS_KEY_ID']
const R2_SECRET_KEY = process.env['R2_SECRET_ACCESS_KEY']
const R2_BUCKET = process.env['R2_BUCKET_NAME']
const R2_PUBLIC_URL = process.env['R2_PUBLIC_URL']

const TEST_PREFIX = 'scratch-test-vtone'

// ─── Arg Parsing ───────────────────────────────────────────

const args = process.argv.slice(2)
const personImageUrlArg = args[0]
const garmentImageUrlArg = args[1]
const categoryArg = (args[2] ?? 'tops') // tops | bottoms | one-pieces

// ─── R2 Client ─────────────────────────────────────────────

const s3 = R2_ENDPOINT && R2_ACCESS_KEY && R2_SECRET_KEY
  ? new S3Client({
      endpoint: R2_ENDPOINT,
      region: 'auto',
      credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
    })
  : null

async function uploadToR2(key, buffer, contentType) {
  if (!s3) throw new Error('R2 not configured — set R2_* env vars')
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }))
  return R2_PUBLIC_URL
    ? `${R2_PUBLIC_URL}/${key}`
    : `https://${R2_BUCKET}.r2.dev/${key}`
}

async function objectExists(key) {
  if (!s3) return false
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    return true
  } catch {
    return false
  }
}

// ─── Image Download ────────────────────────────────────────

async function downloadImage(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  return buffer
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log('')
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║   Fashion V-Tone v1.5 Try-On Test           ║')
  console.log('╚══════════════════════════════════════════════╝')
  console.log(`  API URL:     ${VTONE_API_URL}`)
  console.log(`  Category:    ${categoryArg}`)
  console.log('')

  let personImageUrl = personImageUrlArg
  let garmentImageUrl = garmentImageUrlArg

  // If no URLs provided, try using built-in test images
  if (!personImageUrl && !garmentImageUrl) {
    console.log('No image URLs provided. Checking for test images in repo root...')
    const testPerson = join(__dirname, '../../test_person.jpg')
    const testGarment = join(__dirname, '../../test_garment.jpg')

    const fs = await import('node:fs')
    if (fs.existsSync(testPerson) && fs.existsSync(testGarment)) {
      console.log('  Found test_person.jpg and test_garment.jpg')
      console.log('  Uploading to R2 for V-Tone access...')

      const personBuf = fs.readFileSync(testPerson)
      const garmentBuf = fs.readFileSync(testGarment)
      const hash = createHash('sha256').update(`${Date.now()}`).digest('hex').slice(0, 8)

      personImageUrl = await uploadToR2(`${TEST_PREFIX}/${hash}/person.jpg`, personBuf, 'image/jpeg')
      garmentImageUrl = await uploadToR2(`${TEST_PREFIX}/${hash}/garment.jpg`, garmentBuf, 'image/jpeg')

      console.log(`  Person:  ${personImageUrl}`)
      console.log(`  Garment: ${garmentImageUrl}`)
    } else {
      console.error('  No test images found. Provide image URLs:')
      console.error('  node test-tryon.mjs <person-url> <garment-url> [category]')
      process.exit(1)
    }
  }

  if (!personImageUrl || !garmentImageUrl) {
    console.error('Both person and garment image URLs are required')
    process.exit(1)
  }

  // Test health endpoint
  console.log('')
  console.log('─── Health Check ───')
  try {
    const healthRes = await fetch(`${VTONE_API_URL}/health`)
    const health = await healthRes.json()
    console.log(`  Status:  ${health.status}`)
    console.log(`  Device:  ${health.device}`)
    console.log(`  GPU:     ${health.gpu_available}`)
    console.log(`  Pipeline: ${health.pipeline_loaded ? '✅ Loaded' : '⚠️  Not loaded'}`)
  } catch (err) {
    console.error(`  ❌ Health check failed: ${err.message}`)
    console.error('  Make sure V-Tone service is running')
    process.exit(1)
  }

  // Run try-on
  console.log('')
  console.log('─── Running Try-On ───')
  console.log(`  Person:  ${personImageUrl.slice(0, 80)}...`)
  console.log(`  Garment: ${garmentImageUrl.slice(0, 80)}...`)
  console.log(`  Category: ${categoryArg}`)

  const startTime = Date.now()

  try {
    const res = await fetch(`${VTONE_API_URL}/try-on`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(180_000), // 3min timeout for CPU
      body: JSON.stringify({
        person_image_url: personImageUrl,
        garment_image_url: garmentImageUrl,
        category: categoryArg,
      }),
    })

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    if (!res.ok) {
      const errorText = await res.text().catch(() => '')
      console.error(`  ❌ HTTP ${res.status}: ${errorText.slice(0, 200)}`)
      process.exit(1)
    }

    const result = await res.json()

    if (result.status === 'completed') {
      console.log(`  ✅ Status: completed (${elapsed}s)`)

      // Download and save result
      const outputPath = join(__dirname, `../../tryon-result-${Date.now()}.jpg`)
      console.log(`  Downloading result to ${outputPath}...`)

      const imgRes = await fetch(result.result_url)
      if (imgRes.ok) {
        const imgBuffer = Buffer.from(await imgRes.arrayBuffer())
        writeFileSync(outputPath, imgBuffer)
        console.log(`  ✅ Saved to: ${outputPath}`)
      } else {
        console.log(`  Result URL: ${result.result_url}`)
      }

      console.log(`  Latency:   ${result.latency_ms}ms`)
    } else {
      console.error(`  ❌ Failed: ${result.error ?? 'Unknown error'}`)
      console.error(`  Latency: ${result.latency_ms}ms`)
      process.exit(1)
    }
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.error(`  ❌ Error after ${elapsed}s: ${err.message}`)
    process.exit(1)
  }

  console.log('')
  console.log('✅ Test complete')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
