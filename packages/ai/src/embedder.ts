import OpenAI from 'openai'
import { createHash } from 'crypto'
import { getSecret } from '@kanchuki/db'
import { normalizeSearchQuery } from '@kanchuki/shared'

let _openai: OpenAI | null = null
async function getOpenAI(): Promise<OpenAI> {
  _openai ??= new OpenAI({ apiKey: await getSecret('OPENAI_API_KEY') })
  return _openai
}

export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMENSIONS = 1536

/** Build text representation of a product for embedding */
export function buildProductEmbeddingText(product: {
  category?: string | null
  product_type?: string | null
  primary_color?: string | null
  secondary_colors?: string[]
  fabric_estimate?: string | null
  pattern?: string | null
  embellishments?: string[]
  occasions?: string[]
  search_tags?: string[]
  price_min?: number | null
  notes?: string | null
}): string {
  const parts: string[] = []

  if (product.category) parts.push(product.category)
  if (product.product_type) parts.push(product.product_type)
  if (product.primary_color) parts.push(product.primary_color)
  if (product.secondary_colors?.length) parts.push(...product.secondary_colors)
  if (product.fabric_estimate) parts.push(product.fabric_estimate)
  if (product.pattern) parts.push(product.pattern)
  if (product.embellishments?.length) parts.push(...product.embellishments)
  if (product.occasions?.length) parts.push(...product.occasions)
  if (product.search_tags?.length) parts.push(...product.search_tags)
  if (product.price_min != null) {
    const rupees = product.price_min / 100
    parts.push(`price rupees ${rupees}`)
  }
  if (product.notes) parts.push(product.notes)

  return parts.filter(Boolean).join(' ')
}

/** SHA-256 hash of text input for cache invalidation */
export function textHash(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/** Generate embedding vector for a text string */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await (await getOpenAI()).embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  })

  const embedding = response.data[0]?.embedding
  if (!embedding) throw new Error('No embedding returned from OpenAI')
  return embedding
}

/** Generate embedding for a product (normalizes text before embedding) */
export async function embedProduct(product: Parameters<typeof buildProductEmbeddingText>[0]): Promise<{
  embedding: number[]
  input_hash: string
}> {
  const text = buildProductEmbeddingText(product)
  const embedding = await generateEmbedding(text)
  return { embedding, input_hash: textHash(text) }
}

/** Generate embedding for a search query (normalizes Hindi terms) */
export async function embedSearchQuery(query: string): Promise<number[]> {
  const normalized = normalizeSearchQuery(query)
  return generateEmbedding(normalized)
}

/** Format embedding array for PostgreSQL vector literal */
export function formatVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}
