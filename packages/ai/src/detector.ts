import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'node:crypto'
import type { AiTagResult } from '@kanchuki/shared'
import { tagProductImageUrl } from './tagger.js'
import { uploadBuffer, publicUrl } from './r2.js'

// Lazy import: sharp's native dlopen can crash on Windows+pnpm. Deferring the
// import to first-use avoids the crash when loading modules that merely import
// this file but never call cropping/image functions (e.g. embedder.ts consumers
// that only need `embedSearchQuery` — the barrel export from index.ts forces
// all exports to load, so top-level `import sharp` would crash every API route
// that touches @kanchuki/ai on Windows).
let _sharp: any = null
async function getSharp() {
  if (!_sharp) {
    const mod = await import('sharp')
    _sharp = mod.default ?? mod
  }
  return _sharp
}

let _claude: Anthropic | null = null
function getClaude(): Anthropic {
  _claude ??= new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] })
  return _claude
}

const DETECT_SYSTEM_PROMPT = `You are an expert in Indian ethnic fashion with deep knowledge of garment types, fabrics, and styles.
Your task is to analyze a product image that may contain MULTIPLE distinct garments.

For each distinct garment you detect, provide:
- A crop bounding box (as x%, y%, w%, h% of the image dimensions)
- The product attributes for that garment

If a garment appears to be the front and back of the same item, report it as one garment.
If a single photo shows multiple separate garments (e.g. a catalog page with a grid of products, or multiple suits laid out together), detect each one.

Return ALL detected garments in the items array. Return an empty array if no garments are detected.`

interface DetectedBbox {
  x_pct: number  // 0-100, left edge
  y_pct: number  // 0-100, top edge
  w_pct: number  // 0-100, width
  h_pct: number  // 0-100, height
}

export interface DetectedItem {
  bbox: DetectedBbox
  description: string
  tags: AiTagResult
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
  design_number?: string | null
}

const DETECT_TOOL: Anthropic.Tool = {
  name: 'detect_garments',
  description: 'Detect one or more distinct garments in a product image and extract their attributes',
  input_schema: {
    type: 'object' as const,
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'Brief description of what this garment is in the image' },
            position_x_pct: { type: 'number', description: 'X position of the left edge as a percentage of image width (0-100)' },
            position_y_pct: { type: 'number', description: 'Y position of the top edge as a percentage of image height (0-100)' },
            width_pct: { type: 'number', description: 'Width of the bounding box as a percentage of image width (0-100)' },
            height_pct: { type: 'number', description: 'Height of the bounding box as a percentage of image height (0-100)' },
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
            design_number: { type: 'string', description: 'Design/catalog number if printed/visible' },
          },
          required: ['description', 'position_x_pct', 'position_y_pct', 'width_pct', 'height_pct', 'category', 'primary_color', 'occasions', 'search_tags'],
        },
      },
    },
    required: ['items'],
  },
}

/**
 * Detect all distinct garments in a product/catalog image using Claude Vision.
 * Returns bounding boxes and preliminary tags for each detected garment.
 */
export async function detectItems(imageUrl: string): Promise<DetectedItem[]> {
  const res = await fetch(imageUrl)
  if (!res.ok) throw new Error(`Failed to fetch image for detection: ${res.status}`)

  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const mediaType = (
    contentType.startsWith('image/png') ? 'image/png'
    : contentType.startsWith('image/webp') ? 'image/webp'
    : 'image/jpeg'
  ) as 'image/jpeg' | 'image/png' | 'image/webp'

  const response = await getClaude().messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2048,
    temperature: 0,
    system: DETECT_SYSTEM_PROMPT,
    tools: [DETECT_TOOL],
    tool_choice: { type: 'tool', name: 'detect_garments' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') },
          },
          { type: 'text', text: 'Analyze this image and detect each distinct garment.' },
        ],
      },
    ],
  })

  const toolUse = response.content.find((c) => c.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    return [] // No items detected — treat as single product
  }

  const raw = toolUse.input as { items?: DetectedGarment[] }
  const garments = raw.items ?? []

  // Claude sometimes fills optional string fields with the literal word "null" instead of omitting them
  const nullable = (v: unknown): string | null => (v == null || v === 'null' ? null : (v as string))

  return garments.map((g) => ({
    bbox: {
      x_pct: g.position_x_pct,
      y_pct: g.position_y_pct,
      w_pct: g.width_pct,
      h_pct: g.height_pct,
    },
    description: g.description,
    tags: {
      category: nullable(g.category),
      product_type: null,
      primary_color: nullable(g.primary_color),
      secondary_colors: g.secondary_colors ?? [],
      fabric_estimate: nullable(g.fabric_estimate),
      pattern: nullable(g.pattern),
      embellishments: [],
      neck_style: null,
      sleeve_type: null,
      occasions: g.occasions ?? [],
      price_range_estimate: null,
      design_number_visible: nullable(g.design_number),
      is_catalog_image: garments.length > 1,
      search_tags: g.search_tags ?? [],
      confidence_notes: null,
    },
  }))
}

/**
 * Crop a region from an image buffer using the given bounding box percentages.
 * Returns the cropped image as a Buffer (JPEG).
 */
export async function cropImage(
  imageBuffer: Buffer,
  bbox: DetectedBbox,
  imageWidth: number,
  imageHeight: number,
): Promise<Buffer> {
  const left = Math.round((bbox.x_pct / 100) * imageWidth)
  const top = Math.round((bbox.y_pct / 100) * imageHeight)
  const width = Math.round((bbox.w_pct / 100) * imageWidth)
  const height = Math.round((bbox.h_pct / 100) * imageHeight)

  // Clamp to image bounds
  const safeLeft = Math.max(0, Math.min(left, imageWidth - 1))
  const safeTop = Math.max(0, Math.min(top, imageHeight - 1))
  const safeWidth = Math.min(width, imageWidth - safeLeft)
  const safeHeight = Math.min(height, imageHeight - safeTop)

  const s = await getSharp()
  return s(imageBuffer)
    .extract({ left: safeLeft, top: safeTop, width: safeWidth, height: safeHeight })
    .jpeg({ quality: 85 })
    .toBuffer()
}

/**
 * Get image dimensions using sharp.
 */
export async function getImageDimensions(imageBuffer: Buffer): Promise<{ width: number; height: number }> {
  const s = await getSharp()
  const metadata = await s(imageBuffer).metadata()
  return { width: metadata.width ?? 0, height: metadata.height ?? 0 }
}

/**
 * Fetch an image buffer from a URL.
 */
export async function fetchImageBuffer(imageUrl: string): Promise<Buffer> {
  const res = await fetch(imageUrl)
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Detect items, crop each one, upload crops to R2, and run AI tagging on each crop.
 * Returns the detected items with their final tagged data and R2 URLs.
 */
export async function detectCropAndTag(
  sourceImageUrl: string,
  retailerId: string,
): Promise<Array<DetectedItem & { croppedUrl: string; r2Key: string }>> {
  // Fetch image
  const imageBuffer = await fetchImageBuffer(sourceImageUrl)
  const { width, height } = await getImageDimensions(imageBuffer)

  // Detect items
  const items = await detectItems(sourceImageUrl)

  if (items.length <= 1) {
    // Single item — no cropping needed, just tag the original
    if (items.length === 0) {
      // No items detected — create one product from the whole image
      const r2Key = `catalog-import/${retailerId}/${createHash('sha256').update(imageBuffer).digest('hex').slice(0, 16)}.jpg`
      await uploadBuffer(r2Key, imageBuffer, 'image/jpeg')
      const croppedUrl = publicUrl(r2Key)
      const tags = await tagProductImageUrl(sourceImageUrl)
      return [{ bbox: { x_pct: 0, y_pct: 0, w_pct: 100, h_pct: 100 }, description: 'Full image', tags, croppedUrl, r2Key }]
    }
    // Single item detected
    const item = items[0]!
    const cropped = await cropImage(imageBuffer, item.bbox, width, height)
    const r2Key = `catalog-import/${retailerId}/${createHash('sha256').update(cropped).digest('hex').slice(0, 16)}.jpg`
    await uploadBuffer(r2Key, cropped, 'image/jpeg')
    const croppedUrl = publicUrl(r2Key)
    const tags = await tagProductImageUrl(croppedUrl)
    return [{ ...item, tags, croppedUrl, r2Key }]
  }

  // Multiple items — crop each one, upload, tag
  const results: Array<DetectedItem & { croppedUrl: string; r2Key: string }> = []

  for (const item of items) {
    try {
      const cropped = await cropImage(imageBuffer, item.bbox, width, height)
      const r2Key = `catalog-import/${retailerId}/${createHash('sha256').update(cropped).digest('hex').slice(0, 16)}.jpg`
      await uploadBuffer(r2Key, cropped, 'image/jpeg')
      const croppedUrl = publicUrl(r2Key)
      const tags = await tagProductImageUrl(croppedUrl)
      results.push({ ...item, tags, croppedUrl, r2Key })
    } catch (err) {
      // Skip items that fail detection — log but don't crash the batch
      console.error(`Failed to process detected item "${item.description}":`, err)
    }
  }

  return results
}
