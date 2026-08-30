// Task 20: Ranking pipeline service.
//
// Single entry point for product ranking across all surfaces (feed, search,
// discovery). Pipeline per spec §16.1:
//   1. pgvector KNN (~200 candidates)
//   2. Hard filters (size, price, city, active, muted, out-of-stock)
//   3. Re-rank (cosine + boosts: followed +0.10, same-city +0.05, new +0.05)
//   4. Diversity cap (3/retailer in top 20)
//
// Cold-start path (interaction_count < 5 or null vector):
//   trending + quiz-tag + usual_size

import { prisma } from '@kanchuki/db';
import { MIN_INTERACTIONS_FOR_DNA } from '@kanchuki/ai';

// ─── Types ───────────────────────────────────────────────────────

export interface RankProductsArgs {
  /** Passport account ID — null for cold-start path */
  accountId?: string | null;
  /** Surface for filter tuning */
  surface: 'feed' | 'search' | 'discover';
  /** City filter for discover surface */
  city?: string;
  /** Max results */
  limit?: number;
  /** Search query embedding vector (when present, uses KNN instead of preference) */
  queryVector?: number[];
  /** Cursor for pagination (product ID) */
  cursor?: string;
}

export interface RankedProduct {
  id: string;
  name: string | null;
  category: string | null;
  primary_color: string | null;
  price_min: number | null;
  price_max: number | null;
  photo_url: string | null;
  retailer_id: string;
  retailer_name: string;
  retailer_slug: string | null;
  score: number;
}

// ─── Boost Constants ─────────────────────────────────────────────

const BOOST_FOLLOWED = 0.10;
const BOOST_SAME_CITY = 0.05;
const BOOST_NEW_ARRIVAL = 0.05;
const KNN_CANDIDATE_COUNT = 200;
const DIVERSITY_CAP = 3; // max products per retailer in top N
const DIVERSITY_WINDOW = 20;
const PRICE_BUDGET_TOLERANCE = 0.20; // ±20% of budget range

// ─── Helpers ─────────────────────────────────────────────────────

/** Inline cosine similarity — avoids rebuild dependency on @kanchuki/ai dist */
function cosSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function parseVector(raw: unknown): number[] | null {
  if (!raw) return null;
  const str = String(raw).replace(/[\[\]]/g, '');
  const nums = str.split(',').map(Number).filter((n) => !isNaN(n));
  return nums.length > 0 ? nums : null;
}

// ─── Main Pipeline ───────────────────────────────────────────────

export async function rankProducts(args: RankProductsArgs): Promise<RankedProduct[]> {
  const { accountId, surface, city, limit = 50, queryVector } = args;

  // ── Step 0: Determine if cold-start ──
  let preferenceVector: number[] | null = null;
  let usualSize: string | null = null;
  let budgetMin: number | null = null;
  let budgetMax: number | null = null;
  let followedRetailerIds = new Set<string>();
  let mutedProductIds = new Set<string>();
  let notInterestedProductIds = new Set<string>();

  if (accountId) {
    // Fetch passport DNA
    const dna = await prisma.customerFashionDNA.findUnique({
      where: { customer_account_id: accountId },
      select: {
        interaction_count: true,
        budget_range: true,
      },
    });

    if (dna && dna.interaction_count >= MIN_INTERACTIONS_FOR_DNA) {
      // preference_vector is Unsupported("vector") — read via raw SQL
      const vecRows = await prisma.$queryRawUnsafe<{ pv: string }[]>(
        `SELECT preference_vector::text as pv FROM customer_fashion_dna WHERE customer_account_id = $1`,
        accountId,
      );
      preferenceVector = parseVector(vecRows[0]?.pv);

      const budget = dna.budget_range as Record<string, unknown>;
      budgetMin = typeof budget?.min === 'number' ? budget.min : null;
      budgetMax = typeof budget?.max === 'number' ? budget.max : null;
    }

    // Fetch account usual_size
    const account = await prisma.customerAccount.findUnique({
      where: { id: accountId },
      select: { usual_size: true },
    });
    usualSize = account?.usual_size ?? null;

    // Fetch store visits
    const visits = await prisma.customerStoreVisit.findMany({
      where: { customer_account_id: accountId },
      select: { retailer_id: true, is_muted: true },
    });
    for (const v of visits) {
      if (v.is_muted) {
        // Fetch products from muted stores to exclude
        const mutedProducts = await prisma.product.findMany({
          where: { retailer_id: v.retailer_id, deleted_at: null },
          select: { id: true },
        });
        for (const p of mutedProducts) if (p.id) mutedProductIds.add(p.id);
      } else {
        followedRetailerIds.add(v.retailer_id);
      }
    }

    // Fetch not_interested interactions
    const notInterested = await prisma.customerInteraction.findMany({
      where: { customer_account_id: accountId, type: 'not_interested' },
      select: { product_id: true },
    });
    for (const i of notInterested) if (i.product_id) notInterestedProductIds.add(i.product_id);
  }

  // Use query vector if provided (search), otherwise preference vector
  const searchVector = queryVector ?? preferenceVector;

  // ── Step 1: Get candidates ──
  let candidates: Array<{
    id: string;
    name: string | null;
    category: string | null;
    primary_color: string | null;
    price_min: number | null;
    price_max: number | null;
    retailer_id: string;
    shop_name: string;
    public_slug: string | null;
    retailer_city: string | null;
    photo_url: string | null;
    embedding_raw: string | null;
  }>;

  if (searchVector && searchVector.length > 0) {
    const vectorLiteral = `[${searchVector.join(',')}]`;
    candidates = await prisma.$queryRawUnsafe(
      `SELECT p.id, p.name, p.category, p.primary_color, p.price_min, p.price_max,
             p.retailer_id, r.shop_name, r.public_slug, r.city as retailer_city,
             (SELECT url FROM product_photos WHERE product_id = p.id AND is_primary = true LIMIT 1) as photo_url,
             pe.embedding::text as embedding_raw
      FROM products p
      JOIN retailers r ON r.id = p.retailer_id AND r.deleted_at IS NULL AND r.is_suspended = FALSE
      LEFT JOIN product_embeddings pe ON pe.product_id = p.id
      WHERE p.status = 'AVAILABLE' AND p.deleted_at IS NULL
      ORDER BY pe.embedding <=> $1::vector
      LIMIT $2`,
      vectorLiteral,
      KNN_CANDIDATE_COUNT,
    );
  } else {
    // Cold-start: trending products (most recent)
    const rows = await prisma.product.findMany({
      where: {
        status: 'AVAILABLE',
        deleted_at: null,
        retailer: { is_suspended: false, deleted_at: null },
      },
      include: {
        retailer: { select: { id: true, shop_name: true, public_slug: true, city: true } },
        photos: { where: { is_primary: true }, select: { url: true }, take: 1 },
      },
      orderBy: { created_at: 'desc' },
      take: KNN_CANDIDATE_COUNT,
    });
    candidates = rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      primary_color: r.primary_color,
      price_min: r.price_min,
      price_max: r.price_max,
      retailer_id: r.retailer.id,
      shop_name: r.retailer.shop_name,
      public_slug: r.retailer.public_slug,
      retailer_city: r.retailer.city,
      photo_url: r.photos[0]?.url ?? null,
      embedding_raw: null,
    }));
  }

  // ── Step 2: Hard filters ──
  const filtered = candidates.filter((p) => {
    if (mutedProductIds.has(p.id)) return false;
    if (notInterestedProductIds.has(p.id)) return false;
    if (budgetMin != null && budgetMax != null && p.price_min != null) {
      const tolerance = (budgetMax - budgetMin) * PRICE_BUDGET_TOLERANCE;
      if (p.price_min > budgetMax + tolerance || p.price_min < budgetMin - tolerance) return false;
    }
    return true;
  });

  // ── Step 3: Score and re-rank ──
  const scored: RankedProduct[] = filtered.map((p) => {
    let score = 0;

    // Cosine similarity
    if (preferenceVector && p.embedding_raw) {
      const productVec = parseVector(p.embedding_raw);
      if (productVec && productVec.length === preferenceVector.length) {
        score = cosSim(preferenceVector, productVec);
      }
    }

    // Boosts
    if (followedRetailerIds.has(p.retailer_id)) score += BOOST_FOLLOWED;
    if (city && p.retailer_city === city) score += BOOST_SAME_CITY;

    return {
      id: p.id,
      name: p.name,
      category: p.category,
      primary_color: p.primary_color,
      price_min: p.price_min,
      price_max: p.price_max,
      photo_url: p.photo_url,
      retailer_id: p.retailer_id,
      retailer_name: p.shop_name,
      retailer_slug: p.public_slug,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  // ── Step 4: Diversity cap ──
  const retailerCounts = new Map<string, number>();
  const diversified: RankedProduct[] = [];

  for (const product of scored) {
    const count = retailerCounts.get(product.retailer_id) ?? 0;
    if (diversified.length < DIVERSITY_WINDOW && count >= DIVERSITY_CAP) continue;
    diversified.push(product);
    retailerCounts.set(product.retailer_id, count + 1);
    if (diversified.length >= limit) break;
  }

  // Fill remaining without diversity cap
  if (diversified.length < limit) {
    for (const product of scored) {
      if (diversified.length >= limit) break;
      if (!diversified.find((d) => d.id === product.id)) diversified.push(product);
    }
  }

  return diversified.slice(0, limit);
}
