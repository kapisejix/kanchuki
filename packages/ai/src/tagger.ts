import { createHash } from 'crypto'
import sharp from 'sharp'
import type { AiTagResult } from '@kanchuki/shared'
import { runVisionAsk, runVisionExtract } from './providers.js'
import type { AiJsonSchema, ProviderUsedInfo } from './providers.js'
import { ssrfSafeFetch, readCappedBuffer } from './safe-fetch.js'

const SYSTEM_PROMPT = `You are an expert in Indian ethnic fashion with deep knowledge of:
- Indian apparel categories (unstitched suits, kurtis, sarees, lehengas, sherwanis, etc.)
- Fabric types used in Indian fashion (cotton, silk, georgette, chanderi, chiffon, crepe, rayon, modal, net, organza, etc.)
- Indian embroidery and embellishment styles (zari, zardozi, gota patti, mirror work, bandhani, chikankari, phulkari, sequin work, etc.)
- Regional clothing styles (Punjabi suit, Gujarati saree, Banarasi silk, Lucknowi work, etc.)
- Garment silhouettes/styles (Anarkali, Sharara, Palazzo, Patiala, Pakistani suit, Straight Cut, Indo Western, etc.)
- Color terminology in Indian fashion context (bottle green, wine, mustard, peacock blue, ivory, off-white, rani pink, etc.)
- Price range estimation from visible quality and materials

Your task is to analyze the product image and extract structured attributes accurately.
Always be specific — "Cotton Silk Blend" is better than "Mixed Fabric".
If unsure about a field, return null rather than guessing.
Include both English and common Hindi transliterations in search_tags.
Also generate a retail-ready product_name and short_description — concise and
factual, no marketing fluff ("stunning", "must-have", etc.).`

const EXTRACT_SCHEMA: AiJsonSchema = {
  name: 'extract_product_attributes',
  description: 'Extract structured fashion product attributes from an Indian ethnic wear image',
  schema: {
    type: 'object' as const,
    properties: {
      category: {
        type: 'string',
        enum: [
          'Ladies Suit', 'Kurti', 'Saree', 'Lehenga', 'Gown', 'Dupatta',
          'Blouse', "Men's Kurta Pajama", 'Sherwani', 'Kids Ethnic Wear',
          'Readymade Suit', 'Other',
        ],
      },
      subtype: {
        type: 'string',
        description:
          'Finer-grained garment type than category, e.g. "Lehenga Skirt", "Lehenga Choli", ' +
          '"Kurta Set", "Kurti", "Suit with Dupatta", "Sharara Set", "Palazzo Set", "Anarkali Suit", ' +
          '"Co-ord Set", "Dhoti Set". Be as specific as the photo allows.',
      },
      product_type: {
        type: 'string',
        enum: ['Unstitched', 'Semi-Stitched', 'Readymade', 'N/A'],
      },
      primary_color: {
        type: 'string',
        description: 'Main/dominant color (e.g., "Pink", "Navy Blue", "Mustard", "Bottle Green")',
      },
      secondary_colors: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional colors for border, embroidery, dupatta, etc.',
      },
      fabric_estimate: {
        type: 'string',
        description: 'Estimated fabric (e.g., "Cotton", "Silk", "Georgette", "Cotton-Silk Blend")',
      },
      pattern: {
        type: 'string',
        enum: [
          'Plain', 'Printed', 'Embroidered', 'Block Print', 'Bandhani',
          'Chikankari', 'Phulkari', 'Woven', 'Checked', 'Striped', 'Other',
        ],
      },
      embellishments: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'Zari Work', 'Zardozi', 'Gota Patti', 'Mirror Work', 'Sequin',
            'Stone Work', 'Resham Embroidery', 'Thread Work', 'None',
          ],
        },
      },
      neck_style: {
        type: 'string',
        description: 'Neck style if visible (e.g., "Round Neck", "V-Neck", "Boat Neck")',
      },
      sleeve_type: {
        type: 'string',
        description: 'Sleeve style if visible (e.g., "Full Sleeve", "3/4 Sleeve", "Sleeveless")',
      },
      style: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Garment silhouette/style descriptors (e.g. "Anarkali Suits", "Straight Cut", ' +
          '"Palazzo Suits", "Sharara Suits", "Indo Western", "A-Line", "Peplum", "Angrakha", ' +
          '"Traditional", "Festive", "Bridal", "Contemporary", "Casual"). Always identify and return the style/silhouette for the garment.',
      },
      fabrics: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Fabric(s) used, one entry per distinct fabric/blend component (e.g. ["Cotton"], or ' +
          '["Georgette", "Net"] for a layered dupatta). Prefer specific names over "Mixed".',
      },
      price_range_estimate: {
        type: 'string',
        enum: [
          'Under ₹500', '₹500-₹1000', '₹1000-₹2000', '₹2000-₹5000',
          '₹5000-₹10000', 'Above ₹10000', 'Cannot determine',
        ],
      },
      design_number_visible: {
        type: 'string',
        description: 'Design/catalog number visible on tag or catalog page, else null',
      },
      is_catalog_image: {
        type: 'boolean',
        description: 'True if printed catalog/lookbook image, false if direct store photo',
      },
      search_tags: {
        type: 'array',
        items: { type: 'string' },
        description: '6-8 searchable keywords: colors, fabrics, style in English + Hindi transliterations',
      },
      product_name: {
        type: 'string',
        description:
          '3-6 word retail product title combining color + a notable design detail + subtype, ' +
          'e.g. "Peach Floral Lehenga Skirt", "Off-White Linen Kurta".',
      },
      short_description: {
        type: 'string',
        description:
          '1-2 sentence product listing description covering fabric, design/pattern, and color. ' +
          'Factual, no marketing fluff.',
      },
    },
    required: [
      'category',
      'subtype',
      'primary_color',
      'style',
      'fabrics',
      'search_tags',
      'is_catalog_image',
      'product_name',
      'short_description',
    ],
  },
}

/** SHA-256 hash of image buffer for cache key */
export function imageHash(imageBuffer: Buffer): string {
  return createHash('sha256').update(imageBuffer).digest('hex')
}

export type TaggableImage = {
  buffer: Buffer
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
}

export interface TaggingCallOpts {
  /** Called with the winning provider (for per-call usage attribution). */
  onProviderUsed?: (info: ProviderUsedInfo) => void
  /** Called before each AI call this request will make — throw to abort
   *  remaining calls (e.g. quota exhausted mid multi-item/multi-page batch). */
  beforeCall?: () => Promise<void>
}

/** Tag a product from one or more images (e.g. front + back) using the configured AI providers. */
export async function tagProductImages(
  images: TaggableImage[],
  opts?: TaggingCallOpts,
): Promise<AiTagResult> {
  if (images.length === 0) throw new Error('At least one image required for tagging')
  if (images.length > 2) throw new Error('Max 2 images per tagging request (front + back)')

  const label =
    images.length === 2
      ? 'Analyze these front and back photos of the same Indian ethnic fashion product and extract all product attributes. Use the back photo for fabric texture, embellishment, and design-number details not visible from the front.'
      : 'Analyze this Indian ethnic fashion product image and extract all product attributes.'

  // Multi-provider failover (Claude → OpenAI → Gemini); contract errors from
  // a responding provider rethrow without burning another provider's quota.
  const raw = await runVisionExtract({
    images,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: label,
    maxTokens: 1024,
    schema: EXTRACT_SCHEMA,
    ...(opts?.onProviderUsed ? { onProviderUsed: opts.onProviderUsed } : {}),
  })

  // Claude sometimes fills optional string fields with the literal word "null" instead of omitting them
  const nullable = (v: unknown): string | null => (v == null || v === 'null' ? null : (v as string))

  const result: AiTagResult = {
    category: nullable(raw['category']),
    subtype: nullable(raw['subtype']),
    product_type: nullable(raw['product_type']),
    primary_color: nullable(raw['primary_color']),
    secondary_colors: (raw['secondary_colors'] as string[]) ?? [],
    fabric_estimate: nullable(raw['fabric_estimate']),
    pattern: nullable(raw['pattern']),
    embellishments: (raw['embellishments'] as string[]) ?? [],
    neck_style: nullable(raw['neck_style']),
    sleeve_type: nullable(raw['sleeve_type']),
    style: (raw['style'] as string[]) ?? [],
    fabrics: (raw['fabrics'] as string[]) ?? [],
    price_range_estimate: nullable(raw['price_range_estimate']),
    design_number_visible: nullable(raw['design_number_visible']),
    is_catalog_image: (raw['is_catalog_image'] as boolean) ?? false,
    search_tags: (raw['search_tags'] as string[]) ?? [],
    confidence_notes: null,
    product_name: nullable(raw['product_name']),
    short_description: nullable(raw['short_description']),
  }

  // product_name/short_description are required in the schema above, but some
  // providers still skip string fields with null/empty. Deterministic fallbacks
  // keep the catalog listing never-blank: name falls back to "{color} {subtype
  // | category}" and description to a factual "fabric · pattern · color" line.
  // Subtype stays null when genuinely unknown — the UI already falls back to
  // category for display.
  if (!result.product_name) {
    const fallback = [result.primary_color, result.subtype ?? result.category]
      .filter(Boolean)
      .join(' ')
    result.product_name = fallback || null
  }
  if (!result.short_description) {
    const detail = [result.fabric_estimate, result.pattern, result.primary_color]
      .filter(Boolean)
      .join(' · ')
    result.short_description = detail ? `${detail}.` : null
  }

  return result
}

async function fetchTaggableImage(imageUrl: string): Promise<TaggableImage> {
  const res = await ssrfSafeFetch(imageUrl)
  if (!res.ok) throw new Error(`Failed to fetch image for tagging: ${res.status}`)

  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const mediaType = (
    contentType.startsWith('image/png') ? 'image/png'
    : contentType.startsWith('image/webp') ? 'image/webp'
    : 'image/jpeg'
  ) as 'image/jpeg' | 'image/png' | 'image/webp'

  return { buffer: await readCappedBuffer(res), mediaType }
}

/** Tag via URL(s) — fetches image(s) and uses base64 (SDK v0.30 lacks url source type) */
export async function tagProductImageUrl(
  imageUrl: string,
  opts?: TaggingCallOpts,
): Promise<AiTagResult> {
  return tagProductImages([await fetchTaggableImage(imageUrl)], opts)
}

/** Tag via front + back photo URLs for higher-accuracy extraction */
export async function tagProductImageUrls(
  imageUrls: string[],
  opts?: TaggingCallOpts,
): Promise<AiTagResult> {
  const images = await Promise.all(imageUrls.map(fetchTaggableImage))
  return tagProductImages(images, opts)
}

/**
 * Quick color-only detection using Claude Haiku (cheaper than full tagging).
 * Returns just the dominant color name, intended for the "Add Color Variant"
 * screen to pre-fill the color field instead of requiring manual entry.
 */
const COLOR_SYSTEM_PROMPT =
  'You are a color expert for Indian fashion. Extract only the dominant color of the garment in the photo. Return a short, specific color name like "Bottle Green", "Rani Pink", "Navy Blue", "Mustard Yellow", "Maroon", "Peach", "Ivory", "Teal", etc. Return JUST the color name, nothing else.'

/**
 * Quick color-only detection (Claude Haiku by default — cheaper than full
 * tagging), with multi-provider failover. Returns just the dominant color
 * name, intended for the "Add Color Variant" screen to pre-fill the color
 * field instead of requiring manual entry.
 */
export async function extractDominantColorFromBuffer(buffer: Buffer): Promise<string> {
  try {
    const { data, info } = await sharp(buffer)
      .resize(64, 64, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const pixelCount = info.width * info.height
    let totalR = 0
    let totalG = 0
    let totalB = 0
    let counted = 0

    // Sample pixels, ignoring near-white studio background (R,G,B > 235) and near-black borders (R,G,B < 20)
    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 3
      const r = data[offset]!
      const g = data[offset + 1]!
      const b = data[offset + 2]!

      const isNearWhite = r > 235 && g > 235 && b > 235
      const isNearBlack = r < 20 && g < 20 && b < 20
      if (isNearWhite || isNearBlack) continue

      totalR += r
      totalG += g
      totalB += b
      counted++
    }

    if (counted === 0) {
      for (let i = 0; i < pixelCount; i++) {
        const offset = i * 3
        totalR += data[offset]!
        totalG += data[offset + 1]!
        totalB += data[offset + 2]!
        counted++
      }
    }

    const avgR = totalR / counted
    const avgG = totalG / counted
    const avgB = totalB / counted

    // RGB to HSL
    const rNorm = avgR / 255
    const gNorm = avgG / 255
    const bNorm = avgB / 255
    const max = Math.max(rNorm, gNorm, bNorm)
    const min = Math.min(rNorm, gNorm, bNorm)
    const delta = max - min

    let h = 0
    if (delta !== 0) {
      if (max === rNorm) {
        h = ((gNorm - bNorm) / delta) % 6
      } else if (max === gNorm) {
        h = (bNorm - rNorm) / delta + 2
      } else {
        h = (rNorm - gNorm) / delta + 4
      }
      h = Math.round(h * 60)
      if (h < 0) h += 360
    }

    const l = (max + min) / 2
    const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))

    const lPct = l * 100
    const sPct = s * 100

    // Indian Ethnic Fashion Palette Mapping
    if (lPct < 15) return 'Black'
    if (lPct > 90 && sPct < 15) return 'White'
    if (sPct < 15) {
      if (lPct > 75) return 'Ivory'
      if (lPct > 45) return 'Silver Grey'
      return 'Charcoal'
    }

    if (h < 15 || h >= 345) {
      if (lPct < 35) return 'Maroon'
      if (sPct < 45) return 'Dusty Rose'
      if (lPct > 65) return 'Pink'
      return 'Red'
    }
    if (h >= 15 && h < 40) {
      if (lPct < 35) return 'Rust'
      if (lPct > 70) return 'Peach'
      return 'Orange'
    }
    if (h >= 40 && h < 65) {
      if (lPct < 45) return 'Mustard Yellow'
      if (lPct > 75) return 'Lemon Yellow'
      return 'Yellow'
    }
    if (h >= 65 && h < 165) {
      if (lPct < 30) return 'Bottle Green'
      if (h < 100) return 'Olive Green'
      if (lPct > 70) return 'Mint Green'
      return 'Green'
    }
    if (h >= 165 && h < 195) {
      return 'Teal'
    }
    if (h >= 195 && h < 255) {
      if (lPct < 30) return 'Navy Blue'
      if (lPct > 70) return 'Sky Blue'
      if (sPct > 60) return 'Royal Blue'
      return 'Blue'
    }
    if (h >= 255 && h < 290) {
      if (lPct > 65) return 'Lavender'
      if (lPct < 35) return 'Deep Purple'
      return 'Purple'
    }
    if (h >= 290 && h < 345) {
      if (lPct > 60) return 'Rani Pink'
      if (lPct < 40) return 'Wine'
      return 'Magenta'
    }

    return 'Multi-color'
  } catch {
    return 'Multi-color'
  }
}

/**
 * Quick color-only detection with multi-provider failover and image-buffer fallback.
 * Always returns a valid color name so the color variant can be saved automatically.
 */
export async function detectColor(
  imageUrl: string,
  opts?: TaggingCallOpts,
): Promise<string> {
  let image: TaggableImage | null = null
  try {
    image = await fetchTaggableImage(imageUrl)
  } catch {
    // If fetching fails, return fallback
    return 'Multi-color'
  }

  try {
    const text = await runVisionAsk({
      images: [image],
      systemPrompt: COLOR_SYSTEM_PROMPT,
      userPrompt: 'What is the dominant color of this garment? Return ONLY the specific color name (e.g. Rani Pink, Bottle Green, Navy Blue, Mustard Yellow, Maroon, Teal, Red, Peach, etc.).',
      maxTokens: 50,
      ...(opts?.onProviderUsed ? { onProviderUsed: opts.onProviderUsed } : {}),
    })

    const clean = text
      .replace(/^(the\s+dominant\s+color\s+(is|of\s+this\s+garment\s+is)|color\s*:|the\s+color\s+is)\s*/i, '')
      .replace(/[."']/g, '')
      .trim()

    if (clean && clean.length > 0 && !/error|unknown|none|null/i.test(clean)) {
      return clean
    }
  } catch {
    // AI provider failed/unavailable — fallback to sharp image analysis
  }

  return extractDominantColorFromBuffer(image.buffer)
}
