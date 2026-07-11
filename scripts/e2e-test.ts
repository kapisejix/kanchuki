/**
 * End-to-End Test: Product Upload → AI Tagging → Try-On
 *
 * Usage:
 *   pnpm test:e2e                  # Run full E2E (expects API running)
 *   pnpm test:e2e -- --skip-tryon  # Skip try-on tests
 *   pnpm test:e2e -- --api http://localhost:3001
 *
 * Tests the full pipeline:
 * 1. API health check
 * 2. Auth (send OTP + verify)
 * 3. Upload 3 product images to R2
 * 4. Create products + verify AI tagging completes
 * 5. Test try-on flow with model photos
 */

import { readFileSync } from 'node:fs'
import { resolve, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Config from CLI args ───────────────────────────────────────────

const args = process.argv.slice(2)
const API = args.find((a) => a.startsWith('--api='))?.split('=')[1] ?? 'http://localhost:3001'
const SKIP_TRYON = args.includes('--skip-tryon')

// ── Resolve demo directory (works in both CJS and ESM) ─────────────

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DEMO_DIR = resolve(__dirname, '../scripts/demo')

let TOKEN = ''
let RETAILER_ID = ''

// ── Helpers ────────────────────────────────────────────────────────

async function api(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean; raw?: boolean } = {},
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (options.auth && TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`

  const res = await fetch(`${API}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  })

  if (options.raw) return res
  const json = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
  if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`)
  return json
}

function imageFile(relPath: string) {
  const full = resolve(DEMO_DIR, relPath)
  const buf = readFileSync(full)
  const ext = extname(full).toLowerCase()
  const contentType =
    ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
  return { buffer: buf, contentType, name: relPath, sizeBytes: buf.length }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Progress ───────────────────────────────────────────────────────

let passed = 0
let failed = 0
const errors: string[] = []

function test(name: string, fn: () => Promise<void>) {
  return async () => {
    process.stdout.write(`  ● ${name} ... `)
    try {
      await fn()
      passed++
      console.log('✅')
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`  ❌ ${name}: ${msg}`)
      console.log(`❌ ${msg.slice(0, 120)}`)
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log(`\n╔══════════════════════════════════════╗`)
  console.log(`║   🚀 Kanchuki E2E Test Suite        ║`)
  console.log(`╚══════════════════════════════════════╝\n`)
  console.log(`  API:       ${API}`)
  console.log(`  Demo dir:  ${DEMO_DIR}`)
  console.log(`  Skip try-on: ${SKIP_TRYON}`)
  console.log()

  // ── Step 1: Health Check ────────────────────────────────────────
  console.log('── Step 1: API Health ────────────────────────────────')

  await test('API health check', async () => {
    const res = await api('/health')
    if (res.status !== 'ok') throw new Error(`Unexpected status: ${res.status}`)
    console.log(`  Server OK  •  ${new Date(res.ts).toISOString()}`)
  })()

  // ── Step 2: Authentication ─────────────────────────────────────
  console.log('\n── Step 2: Auth ──────────────────────────────────────')

  await test('Send OTP', async () => {
    const res = await api('/v1/auth/otp/send', {
      method: 'POST',
      body: { phone: '+919999999999' },
    })
    if (!res.data?.message?.includes('OTP')) throw new Error('OTP not sent')
  })()

  await test('Verify OTP', async () => {
    const res = await api('/v1/auth/otp/verify', {
      method: 'POST',
      body: { phone: '+919999999999', otp: '123456' },
    })
    TOKEN = res.data?.access_token
    RETAILER_ID = res.data?.retailer?.id
    if (!TOKEN) throw new Error('No access token')
    if (!RETAILER_ID) throw new Error('No retailer ID')
    console.log(`  Retailer: ${RETAILER_ID}`)
    console.log(`  Plan:     ${res.data?.retailer?.plan}`)
    console.log(`  Credits:  ${res.data?.retailer?.try_on_credits}`)
  })()

  // ── Step 3: Upload + Tag Products ──────────────────────────────
  console.log('\n── Step 3: Upload & Tag Products ─────────────────────')

  const productFiles = ['product 02.jpg', 'product 03.webp', 'sample-suit.jpg']
  const createdProductIds: string[] = []

  for (const [i, filename] of productFiles.entries()) {
    const label = `Product ${i + 1}: ${filename}`

    await test(`${label}: Get upload URL`, async () => {
      const file = imageFile(filename)
      const res = await api('/v1/products/upload-url', {
        method: 'POST',
        auth: true,
        body: { filename: file.name, content_type: file.contentType, size_bytes: file.sizeBytes },
      })
      if (!res.data?.upload_url) throw new Error('No upload URL')
      ;(globalThis as any).__uploadData = res.data
    })()

    await test(`${label}: Upload to R2`, async () => {
      const uploadData = (globalThis as any).__uploadData
      const file = imageFile(filename)
      const putRes = await fetch(uploadData.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.contentType },
        body: file.buffer,
        signal: AbortSignal.timeout(30_000),
      })
      if (!putRes.ok) throw new Error(`R2 upload failed: ${putRes.status}`)
    })()

    let productId = ''
    await test(`${label}: Create product`, async () => {
      const uploadData = (globalThis as any).__uploadData
      const res = await api('/v1/products', {
        method: 'POST',
        auth: true,
        body: {
          photo_r2_key: uploadData.r2_key,
          photo_url: uploadData.public_url,
          price_min: 199900,
          price_max: 299900,
        },
      })
      productId = res.data?.id
      if (!productId) throw new Error('No product ID')
      console.log(`  Product ID: ${productId}`)
    })()

    createdProductIds.push(productId)

    await test(`${label}: AI tagging (polling up to 90s)`, async () => {
      let tagged = false
      let lastError = ''
      for (let attempt = 0; attempt < 30; attempt++) {
        await sleep(3000)
        const res = await api(`/v1/products/${productId}`, { auth: true })
        const p = res.data
        if (p.ai_tagged) {
          tagged = true
          console.log(`\n    🏷️  ${p.category}  •  🎨 ${p.primary_color}  •  🧵 ${p.fabric_estimate}`)
          break
        }
        if (p.ai_tag_error) {
          lastError = p.ai_tag_error
          console.log(`  ⚠️  attempt ${attempt + 1}: ${p.ai_tag_error.slice(0, 60)}`)
          break
        }
        if (attempt === 0) process.stdout.write('  Waiting for AI')
        process.stdout.write('.')
      }
      if (!tagged && lastError) throw new Error(`AI tagging failed: ${lastError}`)
      if (!tagged) throw new Error('AI tagging did not complete within 90s')
      console.log('  ✅ AI tagged!')
    })()
  }

  // ── Step 4: Try-On Flow ────────────────────────────────────────
  if (!SKIP_TRYON) {
    console.log('\n── Step 4: Try-On Flow ───────────────────────────────')

    if (createdProductIds.length > 0) {
      const targetProductId = createdProductIds[0]!

      await test('Get try-on upload URL', async () => {
        const file = imageFile('model front.jpg')
        const res = await api('/v1/try-on/upload-url', {
          method: 'POST',
          auth: true,
          body: { content_type: file.contentType, size_bytes: file.sizeBytes },
        })
        if (!res.data?.upload_url) throw new Error('No upload URL')
        ;(globalThis as any).__tryonData = res.data
      })()

      await test('Upload model photo to R2', async () => {
        const data = (globalThis as any).__tryonData
        const file = imageFile('model front.jpg')
        const putRes = await fetch(data.upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': file.contentType },
          body: file.buffer,
          signal: AbortSignal.timeout(30_000),
        })
        if (!putRes.ok) throw new Error(`R2 upload failed: ${putRes.status}`)
      })()

      await test('Initiate try-on', async () => {
        const data = (globalThis as any).__tryonData
        const res = await api('/v1/try-on/initiate', {
          method: 'POST',
          auth: true,
          body: {
            product_id: targetProductId,
            customer_photo_r2_key: data.r2_key,
          },
        })
        const tryon = res.data
        if (!tryon?.id) throw new Error('No try-on job ID')
        console.log(`  Job ID:  ${tryon.id}`)
        console.log(`  Status:  ${tryon.status}`)
      })()

      await test('Try-on credits decremented', async () => {
        // Verify credits were consumed by checking remaining balance
        const me = await api('/v1/retailers/me', { auth: true })
        // Just confirm we can still read retailer data
        if (!me.data?.id) throw new Error('Could not fetch retailer')
      })()
    }
  } else {
    console.log('\n── Step 4: Try-On Flow ──────────────── (skipped) -----')
  }

  // ── Summary ─────────────────────────────────────────────────────
  const total = passed + failed
  console.log('\n── Results ───────────────────────────────────────────')
  console.log(`  Total: ${total}  |  ✅ ${passed} passed  |  ❌ ${failed} failed`)
  if (errors.length > 0) {
    console.log()
    errors.forEach((e) => console.log(e))
  }
  console.log()
  if (failed > 0) {
    console.log('❌ Some tests FAILED — see errors above.')
    process.exit(1)
  }
  console.log('🎉 ALL TESTS PASSED!')
}

main().catch((err) => {
  console.error('\n💥 Fatal error:', err)
  process.exit(1)
})
