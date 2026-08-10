import { removeBackground } from '@imgly/background-removal-node'
import { createHash } from 'node:crypto'
import type { AiTagResult } from '@kanchuki/shared'
import { runVisionExtract } from './providers.js'
import type { AiJsonSchema, ProviderUsedInfo } from './providers.js'
import { tagProductImageUrl, type TaggingCallOpts } from './tagger.js'
import { uploadBuffer, publicUrl } from './r2.js'
import { computePhash } from './phash.js'
import { compressImageToTarget } from './image-compress.js'
import { ssrfSafeFetch, readCappedBuffer } from './safe-fetch.js'

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

// @imgly/background-removal-node's default publicPath is computed via
// path.resolve(process.cwd(), 'node_modules/@imgly/.../dist/') — a raw cwd
// join, not real module resolution. Under pnpm's non-hoisted layout that
// path doesn't exist from most cwds (e.g. apps/api), so model loading
// ENOENTs. Resolve the package's real install location instead.
let _bgRemovalPublicPath: string | null = null
export function bgRemovalPublicPath(): string {
  if (_bgRemovalPublicPath !== null) return _bgRemovalPublicPath
  // import.meta.resolve is a Node 20.6+ native API — present in production
  // but unavailable under vitest's SSR transform (the shim only carries url
  // + env). Fall back to '' there: the @imgly module is mocked in those
  // tests, so the publicPath argument is never consumed.
  const resolveFn = (import.meta as ImportMeta & {
    resolve?: (specifier: string) => string
  }).resolve
  _bgRemovalPublicPath = resolveFn
    ? new URL('.', resolveFn('@imgly/background-removal-node')).toString()
    : ''
  return _bgRemovalPublicPath
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

const DETECT_SCHEMA: AiJsonSchema = {
  name: 'detect_garments',
  description: 'Detect one or more distinct garments in a product image and extract their attributes',
  schema: {
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
export async function detectItems(
  imageUrl: string,
  opts?: TaggingCallOpts,
): Promise<DetectedItem[]> {
  const res = await ssrfSafeFetch(imageUrl)
  if (!res.ok) throw new Error(`Failed to fetch image for detection: ${res.status}`)

  const buffer = await readCappedBuffer(res)
  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const mediaType = (
    contentType.startsWith('image/png') ? 'image/png'
    : contentType.startsWith('image/webp') ? 'image/webp'
    : 'image/jpeg'
  ) as 'image/jpeg' | 'image/png' | 'image/webp'

  // Multi-provider failover (Claude → OpenAI → Gemini). missingToolUseIsEmpty
  // keeps the old semantics: a model that responds without a detect_garments
  // call (or an empty/{} payload) means "no distinct items" → single product.
  const raw = await runVisionExtract({
    images: [{ buffer, mediaType }],
    systemPrompt: DETECT_SYSTEM_PROMPT,
    userPrompt: 'Analyze this image and detect each distinct garment.',
    maxTokens: 2048,
    schema: DETECT_SCHEMA,
    missingToolUseIsEmpty: true,
    ...(opts?.onProviderUsed ? { onProviderUsed: opts.onProviderUsed } : {}),
    // Attribution bucket for the Admin → AI Usage dashboard: item detection is
    // distinct from per-item tagging (detectCropAndTag fires both).
    resourceType: 'AI_ITEM_DETECT',
  })

  const garments = (raw['items'] as DetectedGarment[] | undefined) ?? []

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
      subtype: null,
      product_type: null,
      primary_color: nullable(g.primary_color),
      secondary_colors: g.secondary_colors ?? [],
      fabric_estimate: nullable(g.fabric_estimate),
      pattern: nullable(g.pattern),
      embellishments: [],
      neck_style: null,
      sleeve_type: null,
      occasions: g.occasions ?? [],
      style: [],
      fabrics: [],
      price_range_estimate: null,
      design_number_visible: nullable(g.design_number),
      is_catalog_image: garments.length > 1,
      search_tags: g.search_tags ?? [],
      confidence_notes: null,
      product_name: null,
      short_description: null,
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
  const res = await ssrfSafeFetch(imageUrl)
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)
  return readCappedBuffer(res)
}

// Builds a soft "grounding" drop shadow layer for sharp's composite(): a
// blurred, faded, black silhouette of the cutout's own alpha shape, offset
// down slightly so it reads as a shadow rather than a halo. Manual pixel
// fade (not sharp's .linear() on the alpha band) because that API's
// per-band behavior on alpha isn't reliably documented across sharp
// versions — a raw buffer loop is slower but unambiguous.
async function buildShadowLayer(
  s: Awaited<ReturnType<typeof getSharp>>,
  cutout: Buffer,
  width: number,
  height: number,
): Promise<{ input: Buffer; top: number; left: number }> {
  const { data, info } = await s(cutout).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const shadowOpacity = 0.35
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0
    data[i + 1] = 0
    data[i + 2] = 0
    data[i + 3] = Math.round(data[i + 3] * shadowOpacity)
  }
  const blurSigma = Math.max(6, Math.round(Math.min(width, height) * 0.02))
  const offsetY = Math.max(4, Math.round(height * 0.015))
  const silhouette = await s(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .blur(blurSigma)
    .png()
    .toBuffer()
  return { input: silhouette, top: offsetY, left: 0 }
}

/**
 * Strip background and composite onto a backdrop — plain white by default,
 * or a retailer-selected background image (PRO-REQUIREMENTS.md F-011) when
 * `backgroundImageUrl` is given. `addShadow` composites a soft drop shadow
 * under the cutout first (retailer toggle, PRO-REQUIREMENTS.md F-030).
 * Callers should fall back to the original buffer on failure — a
 * raw-but-tagged photo beats a failed upload.
 */
export async function cleanupProductPhoto(
  buffer: Buffer,
  backgroundImageUrl?: string,
  addShadow?: boolean,
): Promise<Buffer> {
  const s = await getSharp()
  // node's Blob defaults .type to '' when constructed from a plain Buffer,
  // and @imgly's decoder switches on blob.type (not the actual bytes) — an
  // untyped blob always hits its "Unsupported format" branch.
  const { format } = await s(buffer).metadata()
  const inputBlob = new Blob([buffer], { type: `image/${format ?? 'jpeg'}` })
  const blob = await removeBackground(inputBlob, { publicPath: bgRemovalPublicPath() })
  const cutout = Buffer.from(await blob.arrayBuffer())
  const { width = 0, height = 0 } = await s(cutout).metadata()

  const shadow = addShadow ? await buildShadowLayer(s, cutout, width, height).catch(() => null) : null
  const layers = shadow ? [shadow, { input: cutout }] : [{ input: cutout }]

  if (backgroundImageUrl) {
    try {
      const bg = await fetchImageBuffer(backgroundImageUrl)
      const bgResized = await s(bg).resize(width, height, { fit: 'cover' }).toBuffer()
      const composite = await s(bgResized).composite(layers).jpeg({ quality: 88 }).toBuffer()
      return (await compressImageToTarget(composite)).buffer
    } catch (err) {
      // ponytail: best-effort — bad/unreachable background image falls back
      // to the white backdrop rather than failing the whole photo cleanup.
      console.error('Custom background composite failed, falling back to white:', err)
    }
  }

  const flattened = shadow
    ? await s({ create: { width, height, channels: 3, background: '#ffffff' } })
        .composite(layers)
        .jpeg({ quality: 88 })
        .toBuffer()
    : await s(cutout).flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toBuffer()
  // Quality-first compression to ≤80KB (packages/ai/src/image-compress.ts)
  // keeps the product photo small in storage; catalog images never need the
  // full original detail for web/mobile display.
  return (await compressImageToTarget(flattened)).buffer
}

/**
 * Detect items, crop each one, upload crops to R2, and run AI tagging on each crop.
 * Returns the detected items with their final tagged data and R2 URLs.
 */
export async function detectCropAndTag(
  sourceImageUrl: string,
  retailerId: string,
  opts?: TaggingCallOpts,
): Promise<Array<DetectedItem & { croppedUrl: string; r2Key: string; phash: string }>> {
  // Fetch image
  const imageBuffer = await fetchImageBuffer(sourceImageUrl)
  const { width, height } = await getImageDimensions(imageBuffer)

  // Detect items
  const items = await detectItems(sourceImageUrl, opts)

  if (items.length <= 1) {
    // Single item — no cropping needed, just tag the original
    if (items.length === 0) {
      // No items detected — create one product from the whole image
      const cleaned = await cleanupProductPhoto(imageBuffer).catch(() => imageBuffer)
      const r2Key = `catalog-import/${retailerId}/${createHash('sha256').update(cleaned).digest('hex').slice(0, 16)}.jpg`
      await uploadBuffer(r2Key, cleaned, 'image/jpeg')
      const croppedUrl = publicUrl(r2Key)
      await opts?.beforeCall?.()
      const tags = await tagProductImageUrl(sourceImageUrl, opts)
      const phash = await computePhash(cleaned)
      return [{ bbox: { x_pct: 0, y_pct: 0, w_pct: 100, h_pct: 100 }, description: 'Full image', tags, croppedUrl, r2Key, phash }]
    }
    // Single item detected
    const item = items[0]!
    const cropped = await cropImage(imageBuffer, item.bbox, width, height)
    const cleaned = await cleanupProductPhoto(cropped).catch(() => cropped)
    const r2Key = `catalog-import/${retailerId}/${createHash('sha256').update(cleaned).digest('hex').slice(0, 16)}.jpg`
    await uploadBuffer(r2Key, cleaned, 'image/jpeg')
    const croppedUrl = publicUrl(r2Key)
    await opts?.beforeCall?.()
    const tags = await tagProductImageUrl(croppedUrl, opts)
    const phash = await computePhash(cleaned)
    return [{ ...item, tags, croppedUrl, r2Key, phash }]
  }

  // Multiple items — crop each one, upload, tag. beforeCall re-checks quota
  // per item so a fan-out from one photo can't blow past the budget the
  // route only verified headroom for once, up front.
  const results: Array<DetectedItem & { croppedUrl: string; r2Key: string; phash: string }> = []

  for (const item of items) {
    try {
      const cropped = await cropImage(imageBuffer, item.bbox, width, height)
      const cleaned = await cleanupProductPhoto(cropped).catch(() => cropped)
      const r2Key = `catalog-import/${retailerId}/${createHash('sha256').update(cleaned).digest('hex').slice(0, 16)}.jpg`
      await uploadBuffer(r2Key, cleaned, 'image/jpeg')
      const croppedUrl = publicUrl(r2Key)
      await opts?.beforeCall?.()
      const tags = await tagProductImageUrl(croppedUrl, opts)
      const phash = await computePhash(cleaned)
      results.push({ ...item, tags, croppedUrl, r2Key, phash })
    } catch (err) {
      // Skip items that fail detection — log but don't crash the batch
      console.error(`Failed to process detected item "${item.description}":`, err)
    }
  }

  return results
}
