// F-045 My Style ranking (docs/tasks/pending/my-style.md §3.4). Pure: candidates in,
// ordered scored items out. No DB, no clock (callers pass `now`), no AI — so a fallback can
// never be mistaken for model output (RC-059). Weights live in @kanchuki/shared.
import {
  KIDS_AGE_GROUPS,
  MY_STYLE_DEFAULT_RADIUS_KM,
  MY_STYLE_DIVERSITY,
  MY_STYLE_FIT,
  MY_STYLE_FRAME,
  MY_STYLE_FRESH_DAYS,
  MY_STYLE_KIDS_AGE,
  MY_STYLE_SIMILAR,
  MY_STYLE_WEIGHTS,
  type MyStyleSort,
} from '@kanchuki/shared';
import { haversineDistance } from './geo.js';
import { trendHit } from './my-style-tabs.js';

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
  /** 0..1 from lib/my-style-similar.ts; set on every candidate or on none. */
  similarity?: number;
  /** The product's KidsAgeGroup, or null (unknown). Only read when the profile has `kidsAge`. */
  kids_age_group?: string | null;
}

export interface RankProfile {
  palette: { good: readonly string[]; avoid: readonly string[] } | null;
  occasions: readonly string[]; // requested occasion/festival + quiz occasions
  colorFamilies: readonly string[];
  fabrics: readonly string[];
  origin: { lat: number; lng: number } | null;
  radiusKm?: number;
  trends: readonly { match_keywords: readonly string[]; boost: number }[];
  /** "For my child": the child's age band (a KidsAgeGroup). Boosts, never filters. */
  kidsAge?: string;
  /** The shopper's body frame (petite/average/tall/curvy). Boosts, never filters. */
  frame?: string;
  /** /my-profile style chips (`pref_styles`). A small boost on a whole-word keyword match. */
  styles?: readonly string[];
}

/** Why a product ranked high: only parts the ranker actually matched (RC-059). Frame and kids
 * age never become a reason (no body label is ever shown). */
export interface FitReason {
  code: 'palette' | 'occasion' | 'color' | 'style' | 'fabric';
  /** The profile's own spelling of the matched occasion / style / fabric. */
  detail?: string;
}

export interface RankedItem {
  id: string;
  retailer_id: string;
  price_min: number | null;
  score: number;
  distance_km: number | null; // null = unknown (no origin or store has no coordinates)
  reasons: FitReason[];
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const lower = (xs: readonly string[]) => new Set(xs.map((x) => x.trim().toLowerCase()));

// Exact band = `exact`, a neighbouring band = `adjacent`, anything else (or an unknown age) = 0.
function ageBoost(c: RankCandidate, p: RankProfile): number {
  if (!p.kidsAge || !c.kids_age_group) return 0;
  const want = (KIDS_AGE_GROUPS as readonly string[]).indexOf(p.kidsAge);
  const have = (KIDS_AGE_GROUPS as readonly string[]).indexOf(c.kids_age_group);
  if (want < 0 || have < 0) return 0;
  const gap = Math.abs(want - have);
  return gap === 0 ? MY_STYLE_KIDS_AGE.exact : gap === 1 ? MY_STYLE_KIDS_AGE.adjacent : 0;
}

// One regex per frame: a listed silhouette counts when it appears as whole words inside a keyword
// ("straight cut kurti" hits "straight"; "maxine" does not hit "maxi"). Real subtypes are
// phrases, so an exact-string match fired on ~3% of the live catalog.
const FRAME_RX: Readonly<Record<string, RegExp>> = Object.fromEntries(
  Object.entries(MY_STYLE_FRAME.silhouettes).map(([frame, terms]) => [
    frame,
    new RegExp(
      `(^|[^a-z0-9])(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})($|[^a-z0-9])`,
    ),
  ]),
);

// A product whose keywords include one of the frame's silhouettes gets `boost`; unknown or
// "average" frames have no list, so nothing happens.
function frameBoost(c: RankCandidate, p: RankProfile): number {
  const rx = p.frame ? FRAME_RX[p.frame] : undefined;
  return rx && c.keywords.some((k) => rx.test(k)) ? MY_STYLE_FRAME.boost : 0;
}

const escapeRx = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One whole-word regex per chosen style (same shape as FRAME_RX), built once per request.
function styleMatchers(styles: readonly string[] | undefined) {
  return (styles ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => ({
      style: s,
      rx: new RegExp(`(^|[^a-z0-9])${escapeRx(s.toLowerCase())}($|[^a-z0-9])`),
    }));
}
type StyleMatchers = ReturnType<typeof styleMatchers>;

function fit(
  c: RankCandidate,
  p: RankProfile,
  styles: StyleMatchers,
): { value: number; reasons: FitReason[] } {
  const family = c.color_family?.toLowerCase() ?? null;
  const palette =
    !family || !p.palette
      ? 0
      : p.palette.good.includes(family)
        ? 1
        : p.palette.avoid.includes(family)
          ? -1
          : 0;
  // The profile's spelling of the first value both sides share, else null.
  const shared = (mine: readonly string[], wanted: readonly string[]) => {
    const have = lower(mine);
    return wanted.find((w) => have.has(w.trim().toLowerCase())) ?? null;
  };
  const occasion = shared(c.occasions, p.occasions);
  const fabric = shared(c.fabrics, p.fabrics);
  const color = !!family && lower(p.colorFamilies).has(family);
  const keywords = c.keywords.map((k) => k.toLowerCase());
  const style = styles.find((m) => keywords.some((k) => m.rx.test(k)))?.style ?? null;

  const reasons: FitReason[] = [];
  if (palette === 1) reasons.push({ code: 'palette' });
  if (occasion) reasons.push({ code: 'occasion', detail: occasion });
  if (color) reasons.push({ code: 'color' });
  if (style) reasons.push({ code: 'style', detail: style });
  if (fabric) reasons.push({ code: 'fabric', detail: fabric });

  const base = clamp01(
    MY_STYLE_FIT.base +
      MY_STYLE_FIT.palette * palette +
      MY_STYLE_FIT.occasion * (occasion ? 1 : 0) +
      MY_STYLE_FIT.prefColor * (color ? 1 : 0) +
      MY_STYLE_FIT.prefFabric * (fabric ? 1 : 0) +
      MY_STYLE_FIT.prefStyle * (style ? 1 : 0) +
      ageBoost(c, p) +
      frameBoost(c, p),
  );
  // Find similar: the garment the shopper showed us takes over part of `fit`. Absent =
  // an ordinary feed, unchanged.
  if (c.similarity === undefined) return { value: base, reasons };
  return {
    value:
      (1 - MY_STYLE_SIMILAR.fitShare) * base + MY_STYLE_SIMILAR.fitShare * clamp01(c.similarity),
    reasons,
  };
}

function trend(c: RankCandidate, p: RankProfile): number {
  let best = 0;
  for (const t of p.trends) {
    if (trendHit(c.keywords, t)) best = Math.max(best, t.boost);
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
  const styles = styleMatchers(profile.styles);
  const items = candidates.map((c): RankedItem => {
    const km = distanceKm(c, profile);
    const f = fit(c, profile, styles);
    return {
      id: c.id,
      retailer_id: c.retailer_id,
      price_min: c.price_min,
      distance_km: km === null ? null : Math.round(km * 10) / 10,
      score:
        w.fit * f.value +
        w.trend * trend(c, profile) +
        w.rating * rating(c) +
        w.freshness * freshness(c, now) +
        w.proximity * proximity(km, profile),
      reasons: f.reasons,
    };
  });
  items.sort(COMPARE[sort]);
  return sort === 'best' ? diversify(items) : items;
}
