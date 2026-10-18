// F-045 My Style ranking (docs/tasks/pending/my-style.md §3.4). Pure: candidates in,
// ordered scored items out. No DB, no clock (callers pass `now`), no AI — so a fallback can
// never be mistaken for model output (RC-059). Weights live in @kanchuki/shared.
import {
  MY_STYLE_DEFAULT_RADIUS_KM,
  MY_STYLE_DIVERSITY,
  MY_STYLE_FIT,
  MY_STYLE_FRESH_DAYS,
  MY_STYLE_WEIGHTS,
  type MyStyleSort,
} from '@kanchuki/shared';
import { haversineDistance } from './geo.js';

export interface RankCandidate {
  id: string;
  retailer_id: string;
  price_min: number | null; // paise, never converted here (RC-055)
  color_family: string | null;
  occasions: string[];
  fabrics: string[];
  keywords: string[]; // lowercased category/subtype/styles/tags, for trend matching
  avg_rating: number;
  rating_count: number;
  created_at: Date;
  lat: number | null; // the store's position
  lng: number | null;
}

export interface RankProfile {
  palette: { good: readonly string[]; avoid: readonly string[] } | null;
  occasions: readonly string[]; // requested occasion/festival + quiz occasions
  colorFamilies: readonly string[];
  fabrics: readonly string[];
  origin: { lat: number; lng: number } | null;
  radiusKm?: number;
  trends: readonly { match_keywords: readonly string[]; boost: number }[];
}

export interface RankedItem {
  id: string;
  retailer_id: string;
  price_min: number | null;
  score: number;
  distance_km: number | null; // null = unknown (no origin or store has no coordinates)
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const lower = (xs: readonly string[]) => new Set(xs.map((x) => x.trim().toLowerCase()));

function fit(c: RankCandidate, p: RankProfile): number {
  const family = c.color_family?.toLowerCase() ?? null;
  const palette =
    !family || !p.palette
      ? 0
      : p.palette.good.includes(family)
        ? 1
        : p.palette.avoid.includes(family)
          ? -1
          : 0;
  const hit = (mine: readonly string[], wanted: Set<string>) =>
    mine.some((m) => wanted.has(m.trim().toLowerCase())) ? 1 : 0;
  return clamp01(
    MY_STYLE_FIT.base +
      MY_STYLE_FIT.palette * palette +
      MY_STYLE_FIT.occasion * hit(c.occasions, lower(p.occasions)) +
      MY_STYLE_FIT.prefColor * (family && lower(p.colorFamilies).has(family) ? 1 : 0) +
      MY_STYLE_FIT.prefFabric * hit(c.fabrics, lower(p.fabrics)),
  );
}

function trend(c: RankCandidate, p: RankProfile): number {
  let best = 0;
  for (const t of p.trends) {
    if (t.match_keywords.some((k) => c.keywords.includes(k.toLowerCase())))
      best = Math.max(best, t.boost);
  }
  return clamp01(best);
}

// Unrated is neutral (0.5), not 0: a new product must not lose to a 2.5-star one.
const rating = (c: RankCandidate) => (c.rating_count > 0 ? clamp01(c.avg_rating / 5) : 0.5);

function freshness(c: RankCandidate, now: Date): number {
  const ageDays = (now.getTime() - c.created_at.getTime()) / 86_400_000;
  return clamp01(1 - ageDays / MY_STYLE_FRESH_DAYS);
}

function distanceKm(c: RankCandidate, p: RankProfile): number | null {
  if (!p.origin || c.lat === null || c.lng === null) return null;
  return haversineDistance(p.origin.lat, p.origin.lng, c.lat, c.lng);
}

// Distance unknown is neutral (0.5) so a missing location never wins or loses the feed.
function proximity(km: number | null, p: RankProfile): number {
  return km === null ? 0.5 : clamp01(1 - km / (p.radiusKm ?? MY_STYLE_DEFAULT_RADIUS_KM));
}

const nullsLast = (a: number | null, b: number | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a - b;

const bestFirst = (a: RankedItem, b: RankedItem) =>
  b.score - a.score || nullsLast(a.distance_km, b.distance_km) || a.id.localeCompare(b.id);

const COMPARE: Record<MyStyleSort, (a: RankedItem, b: RankedItem) => number> = {
  best: bestFirst,
  nearest: (a, b) => nullsLast(a.distance_km, b.distance_km) || bestFirst(a, b),
  price: (a, b) => nullsLast(a.price_min, b.price_min) || bestFirst(a, b),
};

/** Max `perStore` per store inside the first `window` results; the rest follow in order. */
function diversify(sorted: RankedItem[]): RankedItem[] {
  const { perStore, window } = MY_STYLE_DIVERSITY;
  const perStoreCount = new Map<string, number>();
  const head: RankedItem[] = [];
  const rest: RankedItem[] = [];
  for (const item of sorted) {
    const n = perStoreCount.get(item.retailer_id) ?? 0;
    if (head.length < window && n < perStore) {
      head.push(item);
      perStoreCount.set(item.retailer_id, n + 1);
    } else rest.push(item);
  }
  return [...head, ...rest];
}

export function rankProducts(
  candidates: readonly RankCandidate[],
  profile: RankProfile,
  sort: MyStyleSort,
  now: Date,
): RankedItem[] {
  const w = MY_STYLE_WEIGHTS;
  const items = candidates.map((c): RankedItem => {
    const km = distanceKm(c, profile);
    return {
      id: c.id,
      retailer_id: c.retailer_id,
      price_min: c.price_min,
      distance_km: km === null ? null : Math.round(km * 10) / 10,
      score:
        w.fit * fit(c, profile) +
        w.trend * trend(c, profile) +
        w.rating * rating(c) +
        w.freshness * freshness(c, now) +
        w.proximity * proximity(km, profile),
    };
  });
  items.sort(COMPARE[sort]);
  return sort === 'best' ? diversify(items) : items;
}
