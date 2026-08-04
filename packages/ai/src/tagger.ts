import { createHash } from 'crypto'
import type { AiTagResult } from '@kanchuki/shared'
import { runVisionAsk, runVisionExtract } from './providers.js'
import type { AiJsonSchema, ProviderUsedInfo } from './providers.js'
import { ssrfSafeFetch, readCappedBuffer } from './safe-fetch.js'

const SYSTEM_PROMPT = `You are an expert in Indian ethnic fashion with deep knowledge of:
- Indian apparel categories (unstitched suits, kurtis, sarees, lehengas, sherwanis, etc.)
- Fabric types used in Indian fashion (cotton, silk, georgette, chanderi, chiffon, crepe, rayon, modal, net, organza, etc.)
- Indian embroidery and embellishment styles (zari, zardozi, gota patti, mirror work, bandhani, chikankari, phulkari, sequin work, etc.)
- Regional clothing styles (Punjabi suit, Gujarati saree, Banarasi silk, Lucknowi work, etc.)
- Indian fashion occasions (wedding, festive/pooja, casual, office wear, party wear, sangeet, mehendi, etc.)
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
      occasions: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'Casual', 'Office Wear', 'Party Wear', 'Wedding', 'Festive',
            'Sangeet', 'Mehendi', 'Pooja', 'Daily Wear', 'Special Occasion',
          ],
        },
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
        description: '6-8 searchable keywords: colors, fabrics, occasions, style in English + Hindi transliterations',
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
          '1-2 sentence product listing description covering fabric, design/pattern, color, and ' +
          'a suggested occasion or styling note. Factual, no marketing fluff.',
      },
    },
    required: [
      'category',
      'subtype',
      'primary_color',
      'occasions',
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
    occasions: (raw['occasions'] as string[]) ?? [],
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
  // | category}" and description to a factual "fabric · pattern · color (+ a
  // suggested occasion)" line. Subtype stays null when genuinely unknown — the
  // UI already falls back to category for display.
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
    const occasion = result.occasions[0]
    result.short_description = detail
      ? `${detail}.${occasion ? ` Ideal for ${occasion.toLowerCase()}.` : ''}`
      : occasion
        ? `Ideal for ${occasion.toLowerCase()}.`
        : null
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
export async function detectColor(
  imageUrl: string,
  opts?: TaggingCallOpts,
): Promise<string | null> {
  const image = await fetchTaggableImage(imageUrl)

  const text = await runVisionAsk({
    images: [image],
    systemPrompt: COLOR_SYSTEM_PROMPT,
    userPrompt: 'What is the dominant color of this garment?',
    maxTokens: 50,
    ...(opts?.onProviderUsed ? { onProviderUsed: opts.onProviderUsed } : {}),
  })

  return text.trim() || null
}
