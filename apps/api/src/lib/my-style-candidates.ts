// F-045 My Style: the candidate query shared by /feed and /complete-look. SQL narrows to
// live, in-stock, public-storefront products near the shopper; callers rank in memory.
import { type Prisma, prisma } from '@kanchuki/db';
import { KIDS_KEYWORDS, kidsAudiencesFor } from '@kanchuki/shared';
import { getBoundingBox, haversineDistance } from './geo.js';
import type { RankCandidate } from './my-style-rank.js';

// Ranking runs in memory over the newest N matches. Past this a very large catalogue is
// ranked best-effort; the response flags it (`truncated`) rather than hiding it.
export const CANDIDATE_CAP = 300;

export interface CandidateQuery {
  /** Device position; else the account city; else everywhere. */
  origin: { lat: number; lng: number } | null;
  city: string | null;
  radiusKm: number;
  budgetMax?: number; // paise
  size?: string; // uppercase
  undertone: string | null;
  depth: string | null;
  /** 'adults' (default) leaves kids' wear out; 'kids' shows only kids' wear ("For my child"). */
  audience?: 'adults' | 'kids';
  /** With audience 'kids': the child's Girl/Boy pick narrows stored audiences (unisex matches both). */
  kidsWho?: 'Girl' | 'Boy';
  /** AND-ed into the product filter (e.g. a complement slot). */
  extraWhere?: Prisma.ProductWhereInput;
}

// The adult / kids split. A product's stored `audience` decides. Only a product whose audience
// is NULL (adult unisex, or never classified) falls back to the KIDS_KEYWORDS guess on
// category + subtype. Every audience arm is an explicit `audience IN (...)` or `audience IS NULL`
// and never a NOT over audience: SQL `NOT (x IN ..)` / `NOT (x ILIKE ..)` is NULL for a NULL
// column and would silently drop the very rows the fallback exists for.
const KIDS_AUDIENCES = ['BOYS', 'GIRLS', 'KIDS_UNISEX'] as const;

// Keyword fallback (audience IS NULL only). Each keyword is "null, or not containing it" on
// both fields so a product with no subtype is not dropped.
const notKidsByKeyword: Prisma.ProductWhereInput[] = KIDS_KEYWORDS.flatMap((k) =>
  (['category', 'subtype'] as const).map((f) => ({
    OR: [{ [f]: null }, { NOT: { [f]: { contains: k, mode: 'insensitive' as const } } }],
  })),
);
const kidsByKeyword: Prisma.ProductWhereInput = {
  OR: KIDS_KEYWORDS.flatMap((k) => [
    { category: { contains: k, mode: 'insensitive' as const } },
    { subtype: { contains: k, mode: 'insensitive' as const } },
  ]),
};

export const adultsWhere = (): Prisma.ProductWhereInput => ({
  OR: [{ audience: { in: ['WOMEN', 'MEN'] } }, { AND: [{ audience: null }, ...notKidsByKeyword] }],
});

/** `who` (the KidsForm Girl/Boy pick) hard-filters stored audiences; unisex matches both. */
export const kidsWhere = (who?: 'Girl' | 'Boy'): Prisma.ProductWhereInput => ({
  OR: [
    { audience: { in: who ? kidsAudiencesFor(who) : [...KIDS_AUDIENCES] } },
    { AND: [{ audience: null }, kidsByKeyword] },
  ],
});

/** The active palette for a saved photo read; null without one (no lookup). Feed + profile share it. */
export async function loadPalette(undertone: string | null, depth: string | null) {
  if (!undertone || !depth) return null;
  return prisma.stylePalette.findFirst({
    where: { undertone, depth, is_active: true },
    orderBy: { version: 'desc' },
    select: { good_families: true, avoid_families: true },
  });
}

export async function loadMyStyleCandidates(q: CandidateQuery) {
  const { origin, city, radiusKm, budgetMax, size } = q;
  const locationScope = origin ? 'radius' : city ? 'city' : 'nationwide';
  const box = origin ? getBoundingBox(origin.lat, origin.lng, radiusKm) : null;

  const palette = await loadPalette(q.undertone, q.depth);

  const rows = await prisma.product.findMany({
    where: {
      deleted_at: null,
      status: 'AVAILABLE',
      retailer: {
        is_suspended: false,
        deleted_at: null,
        public_slug: { not: null },
        ...(box
          ? {
              latitude: { gte: box.minLat, lte: box.maxLat },
              longitude: { gte: box.minLng, lte: box.maxLng },
            }
          : city
            ? { city: { equals: city, mode: 'insensitive' as const } }
            : {}),
      },
      ...(budgetMax ? { price_min: { lte: budgetMax } } : {}),
      // Unsized garments (sarees, unstitched) have no sizes and must not vanish.
      ...(size ? { OR: [{ sizes: { has: size } }, { sizes: { isEmpty: true } }] } : {}),
      AND: [
        q.audience === 'kids' ? kidsWhere(q.kidsWho) : adultsWhere(),
        ...(q.extraWhere ? [q.extraWhere] : []),
      ],
    },
    orderBy: { created_at: 'desc' },
    take: CANDIDATE_CAP,
    include: {
      photos: { orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }], take: 1 },
      section: { select: { name: true } },
      _count: { select: { photos: true } },
      retailer: {
        select: {
          id: true,
          shop_name: true,
          public_slug: true,
          city: true,
          latitude: true,
          longitude: true,
        },
      },
    },
  });

  // The bounding box is a square; the radius is a circle.
  const inRange = origin
    ? rows.filter(
        (p) =>
          p.retailer.latitude !== null &&
          p.retailer.longitude !== null &&
          haversineDistance(origin.lat, origin.lng, p.retailer.latitude, p.retailer.longitude) <=
            radiusKm,
      )
    : rows;

  return { rows, inRange, palette, locationScope } as const;
}

export type CandidateRow = Awaited<ReturnType<typeof loadMyStyleCandidates>>['inRange'][number];

export function toRankCandidate(p: CandidateRow): RankCandidate {
  return {
    id: p.id,
    retailer_id: p.retailer_id,
    price_min: p.price_min,
    color_family: p.color_family,
    occasions: p.occasions,
    fabrics: p.fabrics,
    keywords: [p.category, p.subtype, ...p.styles, ...p.search_tags]
      .filter((k): k is string => !!k)
      .map((k) => k.toLowerCase()),
    avg_rating: p.avg_rating,
    rating_count: p.rating_count,
    created_at: p.created_at,
    kids_age_group: p.kids_age_group,
    lat: p.retailer.latitude,
    lng: p.retailer.longitude,
  };
}
