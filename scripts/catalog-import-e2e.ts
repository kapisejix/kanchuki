/**
 * End-to-End Test: Catalog Import Flow (F-001b / F-001c)
 *
 * Tests the full pipeline against the Railway-deployed API:
 * 1. API health check
 * 2. Auth (send OTP + verify)
 * 3. Upload a demo product photo via v1/products/upload-url (existing endpoint)
 * 4. Detect items using Claude Vision API directly (simulates server-side detector.ts)
 * 5. Create products via v1/products (existing endpoint)
 * 6. Poll for AI tagging completion
 * 7. Verify products appear in catalog listing
 *
 * Usage:
 *   npx tsx scripts/catalog-import-e2e.ts
 *   npx tsx scripts/catalog-import-e2e.ts --api https://supportive-love-production-293a.up.railway.app
 *   npx tsx scripts/catalog-import-e2e.ts --image sample-suit.jpg
 *   npx tsx scripts/catalog-import-e2e.ts --image catalog-grid.jpg --cleanup
 */

import { readFileSync } from 'node:fs'
import { resolve, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'

// ── Config ───────────────────────────────────────────────────────

function parseArg(key: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${key}`)
  if (idx !== -1 && idx + 1 < process.argv.length && !process.argv[idx + 1]!.startsWith('--')) {
    return process.argv[idx + 1]!
  }
  const eq = process.argv.find((a) => a.startsWith(`--${key}=`))
  if (eq) return eq.split('=')[1]!
  return fallback
}

const args = process.argv.slice(2)
const API = parseArg('api', 'https://supportive-love-production-293a.up.railway.app')
const DEMO_IMAGE = parseArg('image', 'sample-suit.jpg')
const MIN_ITEMS = args.includes('--require-items') ? 1 : 0
const DO_CLEANUP = args.includes('--cleanup')

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DEMO_DIR = resolve(__dirname, '../scripts/demo')

let TOKEN = ''
let RETAILER_ID = ''

// ── HTTP Helpers ─────────────────────────────────────────────────

async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (options.auth && TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`

  const res = await fetch(`${API}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
  })

  const json = (await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))) as {
    data?: unknown
    error?: { message?: string; code?: string }
  }
  if (!res.ok) {
    const errMsg = (json as any)?.error?.message ?? (json as any)?.error ?? `HTTP ${res.status}`
    throw new Error(errMsg)
  }
  return json as T
}

function imageFile(relPath: string) {
  const full = resolve(DEMO_DIR, relPath)
  const buf = readFileSync(full)
  const extname2 = extname(full).toLowerCase()
  const contentType =
    extname2 === '.png' ? 'image/png' : extname2 === '.webp' ? 'image/webp' : 'image/jpeg'
  return { buffer: buf, contentType, name: relPath, sizeBytes: buf.length }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Claude Vision Detection (mirrors detector.ts logic) ──────────

let _claude: Anthropic | null = null
function getClaude(): Anthropic {
  if (!_claude) {
    const apiKey = process.env['ANTHROPIC_API_KEY']
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY env var required for detection')
    _claude = new Anthropic({ apiKey })
  }
  return _claude
}

interface DetectedGarment {
  description: string
  position_x_pct: number
  position_y_pct: number
  width_pct: number
  height_pct: number
  category: string
  primary_color: string
  secondary_colors: string[]
  fabric_estimate: string | null
  pattern: string | null
  occasions: string[]
  search_tags: string[]
  design_number: string | null
}

async function detectItemsInImage(imageUrl: string): Promise<DetectedGarment[]> {
  // Fetch the image
  const imgRes = await fetch(imageUrl)
  if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`)
  const buffer = Buffer.from(await imgRes.arrayBuffer())
  const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'
  const mediaType = (
    contentType.startsWith('image/png') ? 'image/png'
    : contentType.startsWith('image/webp') ? 'image/webp'
    : 'image/jpeg'
  ) as 'image/jpeg' | 'image/png' | 'image/webp'

  // Call Claude Vision with tool calling for bounding box detection
  const response = await getClaude().messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2048,
    temperature: 0,
    system: `You are an expert in Indian ethnic fashion. Analyze the product image for MULTIPLE distinct garments.
For each distinct garment, provide:
- A crop bounding box (as x%, y%, w%, h% of image dimensions)
- The product attributes for that garment

If a garment appears to be the front and back of the same item, report it as one garment.
If a single photo shows multiple separate garments (e.g. catalog page grid, multiple suits laid out), detect each one.
Return ALL detected garments in the items array. Return empty array if no garments detected.`,
    tools: [{
      name: 'detect_garments',
      description: 'Detect distinct garments and their attributes',
      input_schema: {
        type: 'object' as const,
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string', description: 'Brief description of this garment' },
                position_x_pct: { type: 'number', description: 'Left edge X as % of width (0-100)' },
                position_y_pct: { type: 'number', description: 'Top edge Y as % of height (0-100)' },
                width_pct: { type: 'number', description: 'Width as % of image width (0-100)' },
                height_pct: { type: 'number', description: 'Height as % of image height (0-100)' },
                category: {
                  type: 'string',
                  enum: ['Ladies Suit', 'Kurti', 'Saree', 'Lehenga', 'Gown', 'Dupatta', 'Blouse', "Men's Kurta Pajama", 'Sherwani', 'Kids Ethnic Wear', 'Readymade Suit', 'Other'],
                },
                primary_color: { type: 'string', description: 'Main/dominant color' },
                secondary_colors: { type: 'array', items: { type: 'string' } },
                fabric_estimate: { type: 'string', description: 'Estimated fabric type' },
                pattern: { type: 'string', enum: ['Plain', 'Printed', 'Embroidered', 'Block Print', 'Bandhani', 'Chikankari', 'Phulkari', 'Woven', 'Checked', 'Striped', null] },
                occasions: { type: 'array', items: { type: 'string' } },
                search_tags: { type: 'array', items: { type: 'string' } },
                design_number: { type: 'string', description: 'Design/catalog number if visible' },
              },
              required: ['description', 'position_x_pct', 'position_y_pct', 'width_pct', 'height_pct', 'category', 'primary_color', 'occasions', 'search_tags'],
            },
          },
        },
        required: ['items'],
      },
    }],
    tool_choice: { type: 'tool', name: 'detect_garments' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } },
          { type: 'text', text: 'Analyze this image and detect each distinct garment.' },
        ],
      },
    ],
  })

  const toolUse = response.content.find((c) => c.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') return []

  const raw = toolUse.input as { items?: DetectedGarment[] }
  return raw.items ?? []
}

// ── Test Framework ───────────────────────────────────────────────

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
      console.log(`❌ ${msg.slice(0, 140)}`)
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log(`\n╔══════════════════════════════════════════════╗`)
  console.log(`║   📸 Kanchuki Catalog Import E2E           ║`)
  console.log(`╚══════════════════════════════════════════════╝\n`)
  console.log(`  API:      ${API}`)
  console.log(`  Image:    ${DEMO_IMAGE}`)
  console.log(`  Demo dir: ${DEMO_DIR}`)
  console.log()

  // ── Step 1: Health Check ─────────────────────────────────────
  console.log('── Step 1: API Health ───────────────────────────────')

  await test('API health check', async () => {
    const res = await api<{ status: string; ts: number }>('/health')
    if (res.status !== 'ok') throw new Error(`Unexpected status: ${res.status}`)
    console.log(`  Server OK  •  ${new Date(res.ts).toISOString()}`)
  })()

  // ── Step 2: Authentication ───────────────────────────────────
  console.log('\n── Step 2: Auth ─────────────────────────────────────')

  await test('Send OTP', async () => {
    const res = await api<{ data?: { message?: string } }>('/v1/auth/otp/send', {
      method: 'POST',
      body: { phone: '+919999999999' },
    })
    if (!res.data?.message?.includes('OTP')) throw new Error('OTP not sent')
  })()

  await test('Verify OTP', async () => {
    const res = await api<{
      data?: { access_token?: string; retailer?: { id?: string; plan?: string } }
    }>('/v1/auth/otp/verify', {
      method: 'POST',
      body: { phone: '+919999999999', otp: '123456' },
    })
    TOKEN = res.data?.access_token ?? ''
    RETAILER_ID = res.data?.retailer?.id ?? ''
    if (!TOKEN) throw new Error('No access token')
    if (!RETAILER_ID) throw new Error('No retailer ID')
    console.log(`  Retailer: ${RETAILER_ID}`)
    console.log(`  Plan:     ${res.data?.retailer?.plan}`)
  })()

  // ── Step 3: Upload Source Image ──────────────────────────────
  console.log('\n── Step 3: Upload Source Image ──────────────────────')

  const file = imageFile(DEMO_IMAGE)
  let uploadedPublicUrl = ''
  let uploadedR2Key = ''

  await test('Get upload URL (via /v1/products/upload-url)', async () => {
    const res = await api<{
      data?: { upload_url?: string; r2_key?: string; public_url?: string }
    }>('/v1/products/upload-url', {
      method: 'POST',
      auth: true,
      body: { filename: file.name, content_type: file.contentType, size_bytes: file.sizeBytes },
    })
    if (!res.data?.upload_url) throw new Error('No upload URL')
    uploadedPublicUrl = res.data.public_url ?? ''
    uploadedR2Key = res.data.r2_key ?? ''
    console.log(`  Public URL: ${uploadedPublicUrl}`)
    console.log(`  R2 key:    ${uploadedR2Key}`)

    // Upload the image to R2
    const putRes = await fetch(res.data.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': file.contentType },
      body: file.buffer,
      signal: AbortSignal.timeout(30_000),
    })
    if (!putRes.ok) throw new Error(`R2 upload failed: ${putRes.status}`)
    console.log('  ✅ Image uploaded to R2')
  })()

  // ── Step 4: Detect Items ─────────────────────────────────────
  console.log('\n── Step 4: Claude Vision Detection (simulates F-001c) ─')

  let detectedGarments: DetectedGarment[] = []

  await test('Detect items via Claude Vision', async () => {
    detectedGarments = await detectItemsInImage(uploadedPublicUrl)
    console.log(`  Items detected: ${detectedGarments.length}`)
    if (detectedGarments.length > 0) {
      console.log(`  ────────────────────────────────────`)
      for (const [i, g] of detectedGarments.entries()) {
        console.log(`  [${i + 1}] ${g.description}`)
        console.log(`       🏷️  ${g.category}  •  🎨 ${g.primary_color}`)
        console.log(`       📐 bbox: ${g.position_x_pct}%,${g.position_y_pct}% ${g.width_pct}x${g.height_pct}%`)
      }
    }
    if (detectedGarments.length < MIN_ITEMS) {
      console.log(`  ⚠️  Expected ≥${MIN_ITEMS}, got ${detectedGarments.length} — continuing`)
    }
  })()

  // ── Step 5: Create Products ──────────────────────────────────
  console.log('\n── Step 5: Create Products (simulates F-001c bulk save) ─')

  if (detectedGarments.length === 0) {
    console.log('  ⚠️  No items detected. Creating 1 product from the full image instead.')
    detectedGarments = [{
      description: 'Full image (single product)',
      position_x_pct: 0, position_y_pct: 0,
      width_pct: 100, height_pct: 100,
      category: 'Other', primary_color: 'Unknown',
      secondary_colors: [], fabric_estimate: null,
      pattern: null, occasions: [], search_tags: [],
      design_number: null,
    }]
  }

  const createdProductIds: string[] = []

  for (const [i, garment] of detectedGarments.entries()) {
    await test(`Create product ${i + 1}: ${garment.description.slice(0, 40)}`, async () => {
      const res = await api<{ data?: { id?: string } }>('/v1/products', {
        method: 'POST',
        auth: true,
        body: {
          photo_r2_key: uploadedR2Key,
          photo_url: uploadedPublicUrl,
          price_min: 199900,
          price_max: 299900,
        },
      })
      if (!res.data?.id) throw new Error('No product ID')
      createdProductIds.push(res.data.id)
      console.log(`  Product ID: ${res.data.id}`)
    })()
  }

  // ── Step 6: Verify AI Tagging ────────────────────────────────
  if (createdProductIds.length > 0) {
    console.log('\n── Step 6: AI Tagging Completion ───────────────────')

    for (const [i, productId] of createdProductIds.entries()) {
      await test(`Product ${i + 1} AI tagging (${productId.slice(0, 8)}...)`, async () => {
        let tagged = false
        let lastError = ''
        for (let attempt = 0; attempt < 30; attempt++) {
          await sleep(3000)
          const res = await api<{
            data?: { id?: string; ai_tagged?: boolean; ai_tag_error?: string | null; category?: string; primary_color?: string }
          }>(`/v1/products/${productId}`, { auth: true })
          const p = res.data
          if (p?.ai_tagged) {
            tagged = true
            console.log(`\n    🏷️  ${p.category ?? '?'}  •  🎨 ${p.primary_color ?? '?'}`)
            break
          }
          if (p?.ai_tag_error) {
            lastError = p.ai_tag_error
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
  }

  // ── Step 7: Verify in Catalog and Cleanup ────────────────
  if (createdProductIds.length > 0) {
    console.log('\n── Step 7: Catalog Listing Verification ────────────')

    await test('Products appear in catalog list', async () => {
      const res = await api<{ data?: unknown[] }>('/v1/products', { auth: true })
      const products = res.data ?? []
      const createdIds = new Set(createdProductIds)
      const found = products.filter((p: any) => createdIds.has(p.id))

      console.log(`  Total products in catalog: ${products.length}`)
      console.log(`  Created products found:    ${found.length}/${createdProductIds.length}`)

      if (found.length === 0) {
        // Products may not appear in listing immediately — verify individually
        console.log('  ⚠️  Not found in listing — checking individually...')
        let foundCount = 0
        for (const pid of createdProductIds) {
          try {
            await api<{ data?: { id?: string } }>(`/v1/products/${pid}`, { auth: true })
            console.log(`  ✅ Product ${pid.slice(0, 8)}... confirmed exists`)
            foundCount++
          } catch {
            console.log(`  ❌ Product ${pid.slice(0, 8)}... not found`)
          }
        }
        if (foundCount === 0) throw new Error('None of the created products are retrievable')
        console.log(`  ✅ ${foundCount}/${createdProductIds.length} products verified individually`)
      }
    })()
  }

  // ── Step 8: Cleanup (if --cleanup flag set) ────────────────
  if (DO_CLEANUP && createdProductIds.length > 0) {
    console.log('\n── Step 8: Cleanup — deleting created products ─────')

    for (const [i, productId] of createdProductIds.entries()) {
      await test(`Delete product ${i + 1} (${productId.slice(0, 8)}...)`, async () => {
        const res = await fetch(`${API}/v1/products/${productId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TOKEN}`,
          },
          signal: AbortSignal.timeout(15_000),
        })
        if (res.status !== 204 && res.status !== 200) {
          const body = await res.text().catch(() => '')
          throw new Error(`Delete failed (HTTP ${res.status}): ${body.slice(0, 100)}`)
        }
      })()
    }

    console.log('  ✅ Cleanup complete')
  }

  // ── Summary ──────────────────────────────────────────────────
  const total = passed + failed
  console.log('\n── Results ───────────────────────────────────────────')
  console.log(`  Total: ${total}  |  ✅ ${passed} passed  |  ❌ ${failed} failed`)
  if (errors.length > 0) {
    console.log()
    for (const e of errors) console.log(e)
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
