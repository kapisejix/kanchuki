import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'crypto'
import type { AiTagResult } from '@kanchuki/shared'

let _claude: Anthropic | null = null
function getClaude(): Anthropic {
  _claude ??= new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] })
  return _claude
}

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
Include both English and common Hindi transliterations in search_tags.`

const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'extract_product_attributes',
  description: 'Extract structured fashion product attributes from an Indian ethnic wear image',
  input_schema: {
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
    },
    required: ['category', 'primary_color', 'occasions', 'search_tags', 'is_catalog_image'],
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

/** Tag a product from one or more images (e.g. front + back) using Claude Vision. */
export async function tagProductImages(images: TaggableImage[]): Promise<AiTagResult> {
  if (images.length === 0) throw new Error('At least one image required for tagging')
  if (images.length > 2) throw new Error('Max 2 images per tagging request (front + back)')

  const imageBlocks: Anthropic.ImageBlockParam[] = images.map((img) => ({
    type: 'image',
    source: { type: 'base64', media_type: img.mediaType, data: img.buffer.toString('base64') },
  }))

  const label =
    images.length === 2
      ? 'Analyze these front and back photos of the same Indian ethnic fashion product and extract all product attributes. Use the back photo for fabric texture, embellishment, and design-number details not visible from the front.'
      : 'Analyze this Indian ethnic fashion product image and extract all product attributes.'

  const response = await getClaude().messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    temperature: 0,
    system: SYSTEM_PROMPT,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: 'tool', name: 'extract_product_attributes' },
    messages: [
      {
        role: 'user',
        content: [...imageBlocks, { type: 'text', text: label }],
      },
    ],
  })

  // Extract tool result
  const toolUse = response.content.find((c) => c.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Claude did not return tool use result')
  }

  const raw = toolUse.input as Record<string, unknown>

  // Claude sometimes fills optional string fields with the literal word "null" instead of omitting them
  const nullable = (v: unknown): string | null => (v == null || v === 'null' ? null : (v as string))

  return {
    category: nullable(raw['category']),
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
  }
}

async function fetchTaggableImage(imageUrl: string): Promise<TaggableImage> {
  const res = await fetch(imageUrl)
  if (!res.ok) throw new Error(`Failed to fetch image for tagging: ${res.status}`)

  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const mediaType = (
    contentType.startsWith('image/png') ? 'image/png'
    : contentType.startsWith('image/webp') ? 'image/webp'
    : 'image/jpeg'
  ) as 'image/jpeg' | 'image/png' | 'image/webp'

  return { buffer: Buffer.from(await res.arrayBuffer()), mediaType }
}

/** Tag via URL(s) — fetches image(s) and uses base64 (SDK v0.30 lacks url source type) */
export async function tagProductImageUrl(imageUrl: string): Promise<AiTagResult> {
  return tagProductImages([await fetchTaggableImage(imageUrl)])
}

/** Tag via front + back photo URLs for higher-accuracy extraction */
export async function tagProductImageUrls(imageUrls: string[]): Promise<AiTagResult> {
  const images = await Promise.all(imageUrls.map(fetchTaggableImage))
  return tagProductImages(images)
}

/**
 * Quick color-only detection using Claude Haiku (cheaper than full tagging).
 * Returns just the dominant color name, intended for the "Add Color Variant"
 * screen to pre-fill the color field instead of requiring manual entry.
 */
export async function detectColor(imageUrl: string): Promise<string | null> {
  const image = await fetchTaggableImage(imageUrl)

  const response = await getClaude().messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 50,
    temperature: 0,
    system: 'You are a color expert for Indian fashion. Extract only the dominant color of the garment in the photo. Return a short, specific color name like "Bottle Green", "Rani Pink", "Navy Blue", "Mustard Yellow", "Maroon", "Peach", "Ivory", "Teal", etc. Return JUST the color name, nothing else.',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: image.mediaType, data: image.buffer.toString('base64') },
          },
          { type: 'text', text: 'What is the dominant color of this garment?' },
        ],
      },
    ],
  })

  const text = response.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map((c) => c.text.trim())
    .join(' ')

  return text || null
}
