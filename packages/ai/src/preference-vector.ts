// Task 16: computePreferenceVector — recency-decayed weighted mean of ProductEmbedding.
//
// This is a lightweight, purely mathematical vector computation that runs
// after every batch of interactions. It produces a preference_vector by
// computing a weighted mean of the ProductEmbedding vectors for products
// the shopper has interacted with, with more recent interactions weighted higher.
//
// Unlike computeFashionDNA (which uses text embeddings via OpenAI),
// this function works entirely with pre-computed ProductEmbedding vectors
// and requires no API calls.

import { createHash } from 'node:crypto';
import { formatVectorLiteral } from './embedder.js';

// Half-life in days for recency decay
const HALF_LIFE_DAYS = 30;

/**
 * Compute a recency-decayed weighted mean of ProductEmbedding vectors.
 *
 * @param embeddings - Array of { product_id, vector, interaction_type, created_at }
 * @param signalWeights - Map of interaction type → weight (same as SIGNAL_WEIGHTS)
 * @returns The weighted mean vector, or null if no valid embeddings
 */
export function computePreferenceVector(
  embeddings: Array<{
    product_id: string;
    vector: number[];
    interaction_type: string;
    created_at: Date;
  }>,
  signalWeights: Record<string, number> = {
    purchase: 10,
    favorite: 5,
    enquiry: 4,
    try_on: 3,
    collection_open: 2,
    view: 1,
    search: 1,
    store_visit: 1,
    quiz_answer: 1,
    unfavorite: -5,
    not_interested: -5,
  },
): number[] | null {
  if (embeddings.length === 0) return null;

  const now = Date.now();
  const firstVec = embeddings[0]?.vector;
  if (!firstVec) return null;
  const dimension = firstVec.length;

  // Track weighted sum and total weight
  const weightedSum = new Array<number>(dimension).fill(0);
  let totalWeight = 0;

  for (const emb of embeddings) {
    const signalWeight = signalWeights[emb.interaction_type] ?? 0.3;
    if (signalWeight <= 0) continue; // skip negative/unrecognized signals

    // Recency decay: weight = signal_weight * 2^(-days_since / half_life)
    const daysSince = (now - emb.created_at.getTime()) / (1000 * 60 * 60 * 24);
    const recencyWeight = signalWeight * Math.pow(2, -daysSince / HALF_LIFE_DAYS);

    for (let i = 0; i < dimension; i++) {
      weightedSum[i]! += (emb.vector[i] ?? 0) * recencyWeight;
    }
    totalWeight += recencyWeight;
  }

  if (totalWeight === 0) return null;

  // Normalize to unit vector
  const result = weightedSum.map((v: number) => v / totalWeight);
  const norm = Math.sqrt(result.reduce((sum: number, v: number) => sum + v * v, 0));
  if (norm === 0) return null;

  return result.map((v: number) => v / norm);
}

export { formatVectorLiteral };

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) * (a[i] ?? 0);
    normB += (b[i] ?? 0) * (b[i] ?? 0);
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Hash a preference vector for cache-key purposes.
 * Returns a short hex hash (first 16 chars of SHA-256).
 */
export function hashVector(vector: number[]): string {
  const str = vector.map((v) => v.toFixed(4)).join(',');
  return createHash('sha256').update(str).digest('hex').slice(0, 16);
}
