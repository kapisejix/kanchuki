// F-045 PR-9 — find-similar scoring (docs/tasks/pending/my-style.md §3.4, T21).
//
// A garment descriptor (shared/my-style-garment.ts) is turned into a 0..1 `similarity` per
// candidate product, which lib/my-style-rank.ts blends into `fit`:
//   - a product with an embedding row:  embeddingShare·cosine' + (1−embeddingShare)·attributes
//   - a product without one:            attributes alone
// Attribute overlap always exists, so a catalogue with missing embeddings (the backfill only
// covers ai_tagged products) still ranks. The caller reports which source ran
// (`similar_source`) so a degraded result is never presented as a semantic match (RC-059).
//
// The descriptor is embedded here, in the request, with a small cache: the feed refetches on
// every sort/page click and one OpenAI call per click would be absurd. It is the same bounded
// synchronous embedding call public-search.ts already makes; no photo is involved.
import { createHash } from 'node:crypto';
import { buildProductEmbeddingText, formatVectorLiteral, generateEmbedding } from '@kanchuki/ai';
import { Prisma, prisma } from '@kanchuki/db';
import { type GarmentDescriptor, MY_STYLE_SIMILAR } from '@kanchuki/shared';

const EMBED_TIMEOUT_MS = 8_000;
// ponytail: per-process FIFO. Upgrade to Redis if instance count makes the hit rate matter.
const CACHE_MAX = 200;
const cache = new Map<string, number[]>();

/** Same text shape as the stored product vectors (embedder.ts), so both sit in one space. */
export function descriptorText(g: GarmentDescriptor): string {
  return buildProductEmbeddingText({
    category: g.category,
    product_type: g.product_type,
    primary_color: g.color_family,
    pattern: g.pattern,
    embellishments: g.embellishments,
  });
}

export interface SimilarityProduct {
  category: string | null;
  product_type: string | null;
  color_family: string | null;
  pattern: string | null;
  embellishments: string[];
}

const ATTR_WEIGHTS = { category: 0.4, color: 0.3, type: 0.1, pattern: 0.1, embellishments: 0.1 };
const eq = (a: string | null, b: string) => a?.trim().toLowerCase() === b.toLowerCase();

/** Share of the descriptor's stated attributes the product matches. Unstated ones do not count. */
export function attributeScore(g: GarmentDescriptor, p: SimilarityProduct): number {
  let got = 0;
  let max = ATTR_WEIGHTS.category + ATTR_WEIGHTS.color;
  if (eq(p.category, g.category)) got += ATTR_WEIGHTS.category;
  if (eq(p.color_family, g.color_family)) got += ATTR_WEIGHTS.color;
  if (g.product_type) {
    max += ATTR_WEIGHTS.type;
    if (eq(p.product_type, g.product_type)) got += ATTR_WEIGHTS.type;
  }
  if (g.pattern) {
    max += ATTR_WEIGHTS.pattern;
    if (eq(p.pattern, g.pattern)) got += ATTR_WEIGHTS.pattern;
  }
  if (g.embellishments.length > 0) {
    max += ATTR_WEIGHTS.embellishments;
    const have = new Set(p.embellishments.map((e) => e.toLowerCase()));
    const hit = g.embellishments.filter((e) => have.has(e.toLowerCase())).length;
    got += (ATTR_WEIGHTS.embellishments * hit) / g.embellishments.length;
  }
  return got / max;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** `cosine` null = this product has no embedding (or embeddings are unavailable). */
export function combineSimilarity(attrs: number, cosine: number | null): number {
  if (cosine === null) return clamp01(attrs);
  const { cosLo, cosHi, embeddingShare } = MY_STYLE_SIMILAR;
  const e = clamp01((cosine - cosLo) / (cosHi - cosLo));
  return clamp01(embeddingShare * e + (1 - embeddingShare) * attrs);
}

export function __resetSimilarCache(): void {
  cache.clear();
}

/** Null when embeddings cannot be produced (no key, provider down, timeout) — never throws. */
export async function embedDescriptor(g: GarmentDescriptor): Promise<number[] | null> {
  const text = descriptorText(g);
  const key = createHash('sha256').update(text).digest('hex');
  const hit = cache.get(key);
  if (hit) return hit;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const vec = await Promise.race([
      generateEmbedding(text),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('embedding timed out')), EMBED_TIMEOUT_MS);
      }),
    ]);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, vec);
    return vec;
  } catch (err) {
    console.error(
      '[my-style] descriptor embedding failed; using attribute match:',
      err instanceof Error ? err.message : String(err),
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Cosine similarity (−1..1) for each of `ids` that has a stored embedding; others are absent. */
export async function embeddingSimilarities(
  vec: number[],
  ids: readonly string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ product_id: string; cos: number }[]>(Prisma.sql`
    SELECT product_id, 1 - (embedding <=> ${formatVectorLiteral(vec)}::vector) AS cos
    FROM product_embeddings
    WHERE product_id = ANY(${ids as string[]}::text[])
  `);
  return new Map(rows.map((r) => [r.product_id, Number(r.cos)]));
}
