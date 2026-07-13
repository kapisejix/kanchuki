import { generateEmbedding, formatVectorLiteral } from './embedder.js'

// ─── Interaction Weights (matches MEMORY.md §3) ────────────────────

export const INTERACTION_WEIGHTS: Record<string, number> = {
  purchase: 1.0,
  enquiry: 0.7,
  favorite: 0.5,
  view: 0.3,
  try_on: 0.6,
}

/** Minimum interaction count before DNA has statistical signal */
export const MIN_INTERACTIONS_FOR_DNA = 5

/** Minimum confidence score before DNA is usable for matching */
export const MIN_CONFIDENCE_FOR_MATCHING = 0.3

/** Products with match_score below this threshold are filtered out */
export const MATCH_SIMILARITY_THRESHOLD = 0.4

/** How many days of interactions to consider for DNA computation */
export const DNA_LOOKBACK_DAYS = 180

// ─── Types ─────────────────────────────────────────────────────────

export interface InteractionProduct {
  id: string
  search_tags: string[]
  category: string | null
  primary_color: string | null
  secondary_colors?: string[]
  fabric_estimate: string | null
  pattern: string | null
  embellishments: string[]
  occasions: string[]
  price_min: number | null
}

export interface CustomerInteraction {
  type: string
  product: InteractionProduct | null
  created_at: Date
}

export interface CustomerData {
  id: string
  pref_colors: string[]
  pref_styles: string[]
  pref_fabrics: string[]
  pref_occasions: string[]
  budget_min: number | null
  budget_max: number | null
  notes: string | null
}

export interface FashionDNAResult {
  preference_vector: number[]
  color_affinities: Record<string, number>
  style_affinities: Record<string, number>
  fabric_affinities: Record<string, number>
  occasion_affinities: Record<string, number>
  budget_range: { min: number | null; max: number | null; sweet_spot: number | null }
  interaction_count: number
  confidence_score: number
}

export interface MatchedProductRow {
  id: string
  category: string | null
  primary_color: string | null
  fabric_estimate: string | null
  price_min: number | null
  price_max: number | null
  status: string
  section_id: string | null
  search_tags: string[]
  occasions: string[]
  match_score: number
}

// ─── Known category values (for affinity extraction) ───────────────

const KNOWN_COLORS = [
  'Pink', 'Red', 'Maroon', 'Burgundy', 'Wine',
  'Blue', 'Navy Blue', 'Teal', 'Turquoise',
  'Green', 'Emerald', 'Olive', 'Mint',
  'Yellow', 'Mustard', 'Gold',
  'Orange', 'Peach', 'Coral',
  'Purple', 'Lavender', 'Mauve',
  'White', 'Cream', 'Ivory', 'Off-White',
  'Black', 'Grey', 'Silver',
  'Brown', 'Beige', 'Tan', 'Copper',
]

const KNOWN_STYLES = ['Casual', 'Party', 'Office', 'Wedding', 'Festive']

const KNOWN_FABRICS = [
  'Cotton', 'Silk', 'Georgette', 'Chiffon', 'Chanderi',
  'Crepe', 'Rayon', 'Modal', 'Net', 'Organza',
  'Linen', 'Cotton-Silk Blend', 'Cotton-Poly Blend', 'Satin',
]

const KNOWN_OCCASIONS = [
  'Casual', 'Office Wear', 'Party Wear', 'Wedding', 'Festive',
  'Sangeet', 'Mehendi', 'Pooja', 'Daily Wear', 'Special Occasion',
]

// ─── DNA Computation ───────────────────────────────────────────────

/**
 * Build a tag-frequency map from a customer's interactions.
 * Each product's tags are weighted by the interaction type.
 */
export function buildWeightedTagFrequencies(
  interactions: CustomerInteraction[],
): Record<string, number> {
  const frequencies: Record<string, number> = {}

  for (const interaction of interactions) {
    const weight = INTERACTION_WEIGHTS[interaction.type] ?? 0.3
    const product = interaction.product
    if (!product) continue

    // Core fields contribute with full weight
    const tags = new Set<string>()

    if (product.category) tags.add(product.category)
    if (product.primary_color) tags.add(product.primary_color)
    if (product.fabric_estimate) tags.add(product.fabric_estimate)
    if (product.pattern) tags.add(product.pattern)
    for (const tag of product.search_tags) tags.add(tag)
    for (const emb of product.embellishments) tags.add(emb)
    for (const occ of product.occasions) tags.add(occ)
    for (const col of product.secondary_colors ?? []) tags.add(col)

    for (const tag of tags) {
      frequencies[tag] = (frequencies[tag] ?? 0) + weight
    }
  }

  return frequencies
}

/**
 * Normalize frequency map to 0–1 range.
 */
export function normalizeFrequencies(
  frequencies: Record<string, number>,
): Record<string, number> {
  const maxScore = Math.max(...Object.values(frequencies), 1)
  const normalized: Record<string, number> = {}
  for (const [key, value] of Object.entries(frequencies)) {
    normalized[key] = value / maxScore
  }
  return normalized
}

/**
 * Extract affinity scores for a known set of values from the frequency map.
 * Returns a map of value → score (0–1), with 0 for unobserved values.
 */
export function extractScores(
  frequencies: Record<string, number>,
  knownValues: readonly string[],
): Record<string, number> {
  const scores: Record<string, number> = {}
  for (const value of knownValues) {
    const direct = frequencies[value] ?? 0
    // Also check for partial matches (e.g. "Cotton-Silk Blend" contains "Cotton")
    const partial = Object.entries(frequencies)
      .filter(([key]) => key.toLowerCase().includes(value.toLowerCase()))
      .reduce((sum, [, score]) => sum + score, 0)
    scores[value] = Math.max(direct, partial * 0.5) // partial matches at half weight
  }
  return scores
}

/**
 * Build a text representation of customer preferences for embedding.
 * This text is what gets embedded into the preference_vector.
 */
export function buildPreferenceText(
  frequencies: Record<string, number>,
  customer: CustomerData,
  normalizedFreq: Record<string, number>,
): string {
  const parts: string[] = []

  // Add explicit preferences first (highest priority)
  if (customer.pref_colors.length > 0) parts.push(`prefers colors: ${customer.pref_colors.join(', ')}`)
  if (customer.pref_styles.length > 0) parts.push(`prefers styles: ${customer.pref_styles.join(', ')}`)
  if (customer.pref_fabrics.length > 0) parts.push(`prefers fabrics: ${customer.pref_fabrics.join(', ')}`)
  if (customer.pref_occasions.length > 0) parts.push(`prefers occasions: ${customer.pref_occasions.join(', ')}`)

  // Add budget signals
  if (customer.budget_min != null || customer.budget_max != null) {
    const min = customer.budget_min != null ? customer.budget_min / 100 : 0
    const max = customer.budget_max != null ? customer.budget_max / 100 : 'unlimited'
    parts.push(`budget range: rupees ${min} to ${max}`)
  }

  // Add interaction-derived preferences (tag frequency weighted)
  // Sort by score descending and take top 20 to keep the embedding focused
  const sortedTags = Object.entries(normalizedFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)

  if (sortedTags.length > 0) {
    const tagText = sortedTags
      .filter(([, score]) => score > 0.05) // filter noise
      .map(([tag]) => tag)
      .join(', ')
    if (tagText) parts.push(`interacted with: ${tagText}`)
  }

  // Add notes if they contain style signals
  if (customer.notes) {
    parts.push(`notes: ${customer.notes}`)
  }

  return parts.filter(Boolean).join('. ')
}

/**
 * Calculate confidence score based on interaction count.
 * Sigmoid-like curve: 0 interactions → 0, 10 → ~0.5, 50 → ~0.9
 */
export function calculateConfidence(interactionCount: number): number {
  if (interactionCount === 0) return 0
  return interactionCount / (interactionCount + 10)
}

/**
 * Compute the Fashion DNA for a customer given their interactions and data.
 * Returns the full DNA result including preference vector and affinity scores.
 */
export async function computeFashionDNA(
  interactions: CustomerInteraction[],
  customer: CustomerData,
): Promise<FashionDNAResult | null> {
  if (interactions.length < MIN_INTERACTIONS_FOR_DNA) return null

  const frequencies = buildWeightedTagFrequencies(interactions)
  const normalizedFreq = normalizeFrequencies(frequencies)

  // Extract affinity scores for known categories
  const color_affinities = extractScores(normalizedFreq, KNOWN_COLORS)
  const style_affinities = extractScores(normalizedFreq, KNOWN_STYLES)
  const fabric_affinities = extractScores(normalizedFreq, KNOWN_FABRICS)
  const occasion_affinities = extractScores(normalizedFreq, KNOWN_OCCASIONS)

  // Compute budget range from interacted products & explicit preferences
  const budgetRange = computeBudgetRange(interactions, customer)

  // Build preference text and generate embedding
  const preferenceText = buildPreferenceText(frequencies, customer, normalizedFreq)
  const preference_vector = await generateEmbedding(preferenceText)

  const interactionCount = interactions.length
  const confidenceScore = calculateConfidence(interactionCount)

  return {
    preference_vector,
    color_affinities,
    style_affinities,
    fabric_affinities,
    occasion_affinities,
    budget_range: budgetRange,
    interaction_count: interactionCount,
    confidence_score: confidenceScore,
  }
}

/**
 * Compute the budget range from interactions and explicit preferences.
 */
export function computeBudgetRange(
  interactions: CustomerInteraction[],
  customer: CustomerData,
): { min: number | null; max: number | null; sweet_spot: number | null } {
  // Explicit budget takes priority
  if (customer.budget_min != null || customer.budget_max != null) {
    return {
      min: customer.budget_min,
      max: customer.budget_max,
      sweet_spot: customer.budget_min != null && customer.budget_max != null
        ? Math.round((customer.budget_min + customer.budget_max) / 2)
        : (customer.budget_min ?? customer.budget_max),
    }
  }

  // Derive from interacted products' prices
  const prices = interactions
    .map((i) => i.product?.price_min)
    .filter((p): p is number => p != null)

  if (prices.length === 0) return { min: null, max: null, sweet_spot: null }

  const sorted = [...prices].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return {
    min: sorted[0] ?? null,
    max: sorted[sorted.length - 1] ?? null,
    sweet_spot: sorted[mid] ?? null,
  }
}

/**
 * Format the preference_vector as a PostgreSQL vector literal.
 */
export function formatPreferenceVector(embedding: number[]): string {
  return formatVectorLiteral(embedding)
}


