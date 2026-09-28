// Shared public-route helpers/schemas extracted from public.ts
// (scripts/check-route-size.sh split). Route modules import from here.
import { getDownloadPresignedUrl } from '@kanchuki/ai';
import type { Prisma } from '@kanchuki/db';
import { PUBLIC_PRICE_BUCKETS, SIZE_OPTIONS } from '@kanchuki/shared';
import { z } from 'zod';
import { isNewArrival, isOnSale } from '../../lib/product-flags.js';

// Helper: generate a display-ready URL — uses stored public_url when valid,
// falls back to presigned GET URL when R2_PUBLIC_URL is not set.
export async function displayUrl(url: string, r2Key: string | null): Promise<string> {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (r2Key) {
    try {
      return await getDownloadPresignedUrl(r2Key, 3600);
    } catch {}
  }
  return url;
}

export const publicProductQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
  category: z.string().optional(),
  price: z.string().optional(),
  color: z.string().optional(),
  // Roadmap N — Indian Size System. Products carry a `sizes` array the retailer
  // picks from the shared SIZE_OPTIONS list, so this is an exact element match
  // (`has`), not a substring: "L" must not match "XL", which any case-insensitive
  // `contains` would do. Normalised to uppercase to match how the retailer app
  // stores them, so a lowercase `?size=l` still works.
  size: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .optional(),
});

export type PublicProductQuery = z.infer<typeof publicProductQuerySchema>;

// Builds the Prisma filter for the Product side of a CollectionProduct/category
// query from the same category/price/color params the web FilterBar exposes —
// kept here so list, count, and facet queries agree on one shape.
export function buildProductFilterWhere(query: PublicProductQuery): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { deleted_at: null };
  if (query.category) where.category = query.category;
  if (query.color) where.primary_color = { equals: query.color, mode: 'insensitive' };
  if (query.size) where.sizes = { has: query.size };

  const bucket = PUBLIC_PRICE_BUCKETS.find((b) => b.label === query.price);
  if (bucket) {
    if ('min' in bucket) {
      where.price_min = { gte: bucket.min, ...('max' in bucket ? { lt: bucket.max } : {}) };
    } else {
      where.OR = [{ price_min: null }, { price_min: { lt: bucket.max } }];
    }
  }
  return where;
}

// A raw retailer upload carries neither marker — hide it from the customer
// catalog, keep it for the retailer. `original_r2_key` is set the first time
// background-cleanup runs (photo-cleanup.ts, now automatic on every add —
// see tag-product.ts), `studio` marks an AI Studio Shoot row (studio-shoot.ts).
function isCustomerVisiblePhoto(metadata: unknown): boolean {
  const meta = metadata as Record<string, unknown> | null;
  return !!(meta?.studio || meta?.original_r2_key);
}

// Falls back to the full list when nothing has been processed yet, so a
// product isn't left with an empty customer gallery.
export function customerVisiblePhotos<T extends { metadata: unknown }>(photos: T[]): T[] {
  const visible = photos.filter((p) => isCustomerVisiblePhoto(p.metadata));
  return visible.length > 0 ? visible : photos;
}

// Thin product shape for grid/list views — one presigned URL (primary photo)
// per product instead of every photo + every spin frame + every variant.
export async function toPublicProductSummary(p: {
  id: string;
  name: string | null;
  price_min: number | null;
  price_max: number | null;
  mrp: number | null;
  created_at: Date;
  status: string;
  category: string | null;
  subtype: string | null;
  primary_color: string | null;
  location_notes: string | null;
  section: { name: string | null } | null;
  photos: { url: string; r2_key: string; metadata: unknown }[];
  _count: { photos?: number; spin_frames?: number };
  avg_rating?: number;
  rating_count?: number;
}) {
  const photo = customerVisiblePhotos(p.photos)[0];
  return {
    id: p.id,
    name: p.name,
    price_min: p.price_min,
    price_max: p.price_max,
    // F-024 (Option A): New Arrivals/Sale are query-time virtual filters, not
    // AI-assignable categories — a photo can't reveal stock age or discount.
    is_new_arrival: isNewArrival(p.created_at),
    on_sale: isOnSale({ mrp: p.mrp, price_min: p.price_min }),
    status: p.status,
    category: p.category,
    subtype: p.subtype,
    primary_color: p.primary_color,
    location: [p.section?.name, p.location_notes].filter(Boolean).join(' — ') || null,
    primary_photo_url: photo ? await displayUrl(photo.url, photo.r2_key) : '',
    // Spin-frame feature removed (PR #15); kept in the shape for type parity.
    has_360: false,
    avg_rating: p.avg_rating ?? 0,
    rating_count: p.rating_count ?? 0,
  };
}

// ─── Related products ────────────────────────────────────────────────────
// Weighted attribute overlap, replacing the old "same category, newest six".
// Category alone is a weak signal in Indian ethnic wear: "Saree" spans a ₹700
// cotton daily-wear saree and a ₹40,000 Banarasi, and neither is a useful
// suggestion for the other. Fabric, subtype and colour are what a shopper
// actually means by "more like this".
export interface RelatedCandidate {
  category: string | null;
  subtype: string | null;
  fabrics: string[] | null;
  primary_color: string | null;
  price_min: number | null;
  created_at: Date;
}

// Weights are ordered by how much each attribute narrows intent, not by how easy
// they are to match. Category still leads because it is the field the AI tagger
// always fills; fabric and subtype are frequently null.
const W_CATEGORY = 6;
const W_SUBTYPE = 4;
const W_FABRIC_SHARED = 3;
const W_COLOR = 2;
const W_PRICE_NEAR = 1;

export function scoreRelatedProduct(base: RelatedCandidate, cand: RelatedCandidate): number {
  let score = 0;
  if (base.category && cand.category === base.category) score += W_CATEGORY;
  if (base.subtype && cand.subtype === base.subtype) score += W_SUBTYPE;
  if ((base.fabrics ?? []).some((f) => (cand.fabrics ?? []).includes(f))) {
    score += W_FABRIC_SHARED;
  }
  if (
    base.primary_color &&
    cand.primary_color &&
    cand.primary_color.toLowerCase() === base.primary_color.toLowerCase()
  ) {
    score += W_COLOR;
  }
  if (base.price_min && cand.price_min) {
    // Loose band, not equality — prices are per-product, so exact matching would
    // never fire. A shopper who tapped a ₹2,000 suit should not be shown a
    // ₹20,000 lehenga as "related".
    const ratio = cand.price_min / base.price_min;
    if (ratio >= 0.6 && ratio <= 1.6) score += W_PRICE_NEAR;
  }
  return score;
}

// Newest-first tie-break so equally-relevant products don't reshuffle between
// requests — the response is CDN-cached for 10 minutes, and an unstable order
// would show a different "related" row for the same product URL.
export function rankRelatedProducts<T extends RelatedCandidate>(
  base: RelatedCandidate,
  candidates: T[],
  limit: number,
): T[] {
  return candidates
    .map((c) => ({ c, score: scoreRelatedProduct(base, c) }))
    .sort((a, b) => b.score - a.score || b.c.created_at.getTime() - a.c.created_at.getTime())
    .slice(0, limit)
    .map((e) => e.c);
}

// Distinct filter-chip options with counts — always computed from the full
// unfiltered product set for the collection/category so picking one filter
// doesn't shrink the options for the others (matches prior client-side
// behavior). Counts drive the "All (10)", "Kurta (1)" chip labels.
function countBy<T>(values: T[]): { value: T; count: number }[] {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return Array.from(counts, ([value, count]) => ({ value, count })).sort(
    (a, b) => b.count - a.count,
  );
}

// Sizes are the one facet where count-descending order is wrong: a size row
// has to read S, M, L, XL — "XXL (1), L (5), M (4)" looks like a bug to a
// shopper. So this sorts by the shared SIZE_OPTIONS order instead of by count,
// and drops anything the retailer typed that isn't a known label rather than
// offering a chip that can't be filtered consistently.
export function buildSizeFacet(sizes: string[][]): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const list of sizes) {
    for (const size of new Set(list)) counts.set(size, (counts.get(size) ?? 0) + 1);
  }
  return SIZE_OPTIONS.filter((size) => counts.has(size)).map((size) => ({
    value: size,
    count: counts.get(size) ?? 0,
  }));
}

export function buildFacets(
  products: {
    category: string | null;
    primary_color: string | null;
    sizes?: string[];
  }[],
) {
  return {
    categories: countBy(products.map((p) => p.category).filter((c): c is string => c !== null)),
    colors: countBy(products.map((p) => p.primary_color).filter((c): c is string => c !== null)),
    sizes: buildSizeFacet(products.map((p) => p.sizes ?? [])),
  };
}
