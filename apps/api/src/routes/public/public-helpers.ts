// Shared public-route helpers/schemas extracted from public.ts
// (scripts/check-route-size.sh split). Route modules import from here.
import { getDownloadPresignedUrl } from '@kanchuki/ai';
import type { Prisma } from '@kanchuki/db';
import { PUBLIC_PRICE_BUCKETS } from '@kanchuki/shared';
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
});

export type PublicProductQuery = z.infer<typeof publicProductQuerySchema>;

// Builds the Prisma filter for the Product side of a CollectionProduct/category
// query from the same category/price/color params the web FilterBar exposes —
// kept here so list, count, and facet queries agree on one shape.
export function buildProductFilterWhere(query: PublicProductQuery): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { deleted_at: null };
  if (query.category) where.category = query.category;
  if (query.color) where.primary_color = { equals: query.color, mode: 'insensitive' };

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
  _count: { photos?: number; spin_frames?: number };  avg_rating?: number;
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
        rating_count: p.rating_count ?? 0,
  };
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

export function buildFacets(products: { category: string | null; primary_color: string | null }[]) {
  return {
    categories: countBy(products.map((p) => p.category).filter((c): c is string => c !== null)),
    colors: countBy(products.map((p) => p.primary_color).filter((c): c is string => c !== null)),
  };
}
