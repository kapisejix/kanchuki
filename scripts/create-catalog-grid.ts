/**
 * Generate a multi-item catalog grid image for testing F-001c detection.
 * Composes 3-4 demo product images into a 2x2 grid layout simulating
 * a printed catalog page with multiple garments.
 *
 * Usage:
 *   npx tsx scripts/create-catalog-grid.ts
 *
 * Output:
 *   scripts/demo/catalog-grid.jpg
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DEMO_DIR = resolve(__dirname, '../scripts/demo')

// We load sharp from the ai package's node_modules
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require(resolve(__dirname, '../packages/ai/node_modules/sharp'))

interface GridItem {
  file: string
  label?: string
}

const GRID_ITEMS: GridItem[] = [
  { file: 'sample-suit.jpg', label: 'Ladies Suit - Magenta' },
  { file: 'product 02.jpg', label: 'Designer Kurti - Teal' },
  { file: 'product 03.webp', label: 'Ethnic Gown - Pink' },
  { file: 'sample-suit.jpg', label: 'Party Wear Suit - Maroon' },
]

async function main() {
  console.log('🎨 Creating multi-item catalog grid image...\n')

  // Load all images and get their dimensions
  const loaded: { buffer: Buffer; metadata: sharp.Metadata }[] = []

  for (const item of GRID_ITEMS) {
    const fullPath = resolve(DEMO_DIR, item.file)
    console.log(`  Loading: ${item.file} (${item.label})`)

    if (!readFileSync(fullPath)) {
      console.error(`  ❌ File not found: ${fullPath}`)
      continue
    }

    const buffer = readFileSync(fullPath)
    const metadata = await sharp(buffer).metadata()
    loaded.push({ buffer, metadata })
  }

  if (loaded.length === 0) {
    console.error('❌ No images could be loaded')
    process.exit(1)
  }

  // Determine grid configuration
  const cols = 2
  const rows = Math.ceil(loaded.length / cols)
  const cellCount = loaded.length

  // Find the max width and height among all images for uniform cells
  let maxCellW = 0
  let maxCellH = 0

  for (const { metadata } of loaded) {
    if ((metadata.width ?? 0) > maxCellW) maxCellW = metadata.width ?? 0
    if ((metadata.height ?? 0) > maxCellH) maxCellH = metadata.height ?? 0
  }

  // Add padding/margins between cells
  const pad = 30 // padding between cells
  const margin = 40 // outer margin

  const cellW = maxCellW + pad
  const cellH = maxCellH + pad

  const totalW = cols * cellW + margin * 2 - pad
  const totalH = rows * cellH + margin * 2 - pad

  console.log(`\n  Grid: ${cols}×${rows} (${cellCount} items)`)
  console.log(`  Cell size: ${maxCellW}×${maxCellH}px`)
  console.log(`  Canvas: ${totalW}×${totalH}px\n`)

  // Create the composite canvas
  // Build sharp overlay inputs
  const compositeOps: { input: Buffer; top: number; left: number }[] = []

  for (let i = 0; i < cellCount; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)

    const left = margin + col * cellW
    const top = margin + row * cellH

    // Resize each image to uniform cell size (maintain aspect ratio with crop)
    const resized = await sharp(loaded[i]!.buffer)
      .resize(maxCellW, maxCellH, {
        fit: 'inside',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .toBuffer()

    // Center the resized image in its cell
    const meta = await sharp(resized).metadata()
    const offsetX = Math.round((maxCellW - (meta.width ?? 0)) / 2)
    const offsetY = Math.round((maxCellH - (meta.height ?? 0)) / 2)

    compositeOps.push({
      input: resized,
      top: top + offsetY,
      left: left + offsetX,
    })
  }

  // Create the catalog grid image
  // First, create a white background canvas
  const whiteBackground = Buffer.from(
    `<svg width="${totalW}" height="${totalH}">
      <rect width="${totalW}" height="${totalH}" fill="white"/>
    </svg>`,
  )

  const result = await sharp(whiteBackground)
    .composite(compositeOps)
    .jpeg({ quality: 90 })
    .toBuffer()

  // Add header banner to simulate catalog page with grid labels
  const bannerSvg = Buffer.from(
    `<svg width="${totalW}" height="60">
      <rect width="${totalW}" height="60" fill="#f0f0f0"/>
      <text x="${totalW / 2}" y="35" text-anchor="middle" font-family="Arial" font-size="18" fill="#333" font-weight="bold">
        KANCHUKI  •  SUMMER COLLECTION 2026  •  CATALOG
      </text>
    </svg>`,
  )

  const banner = await sharp(bannerSvg).jpeg().toBuffer()

  const final = await sharp(result)
    .composite([{ input: banner, top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer()

  // Save
  const outputPath = resolve(DEMO_DIR, 'catalog-grid.jpg')
  writeFileSync(outputPath, final)

  const stats = readFileSync(outputPath).length
  console.log(`  ✅ Saved: catalog-grid.jpg (${(stats / 1024).toFixed(0)} KB)`)

  // Also create a variant with different colors by recoloring one image
  console.log(`\n  Creating variant: catalog-grid-mixed.jpg`)

  // For the mixed variant, flip product 03 horizontally (different presentation)
  const mixedOps = [...compositeOps]
  if (mixedOps.length >= 3) {
    const flipped = await sharp(loaded[2]!.buffer)
      .resize(maxCellW, maxCellH, { fit: 'inside', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .flop()
      .toBuffer()
    mixedOps[2] = { ...mixedOps[2]!, input: flipped }
  }

  const mixedResult = await sharp(whiteBackground)
    .composite(mixedOps)
    .jpeg({ quality: 90 })
    .toBuffer()

  const mixedFinal = await sharp(mixedResult)
    .composite([{ input: banner, top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer()

  const mixedPath = resolve(DEMO_DIR, 'catalog-grid-mixed.jpg')
  writeFileSync(mixedPath, mixedFinal)
  console.log(`  ✅ Saved: catalog-grid-mixed.jpg (${(mixedFinal.length / 1024).toFixed(0)} KB)`)

  console.log(`\n🎉 Done! Test images created.`)
  console.log(`  Run: npx tsx scripts/catalog-import-e2e.ts --image catalog-grid.jpg`)
  console.log(`  Run: npx tsx scripts/catalog-import-e2e.ts --image catalog-grid-mixed.jpg`)
}

main().catch((err) => {
  console.error('💥 Error:', err)
  process.exit(1)
})
