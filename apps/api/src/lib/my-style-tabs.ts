// F-045 PR-10 (docs/tasks/pending/my-style.md §3.2): which trends / festival are live, and
// which products belong on each feed tab. Pure: callers pass rows and `now`.
//
// Honesty rules: a tab with nothing behind it is hidden (the caller checks), never filled with
// canned content (RC-059). NULL/empty `occasions` means "no signal": such a product is never
// claimed for an occasion, it just sorts after the ones that match.
import {
  FESTIVAL_LOOKAHEAD_DAYS,
  FESTIVAL_OCCASIONS,
  type MyStyleTab,
  STYLE_TREND_KINDS,
} from '@kanchuki/shared';

export interface TrendRow {
  kind: string;
  match_keywords: string[];
  boost: number;
  starts_at: Date | null;
  ends_at: Date | null;
  is_active: boolean;
}

export interface FestivalRow {
  name: string;
  region: string;
  starts_at: Date;
  ends_at: Date;
  deleted_at: Date | null;
}

const DAY_MS = 86_400_000;

/** Active rows of a known kind whose date window (open-ended where null) contains `now`. */
export function activeTrends<T extends TrendRow>(rows: readonly T[], now: Date): T[] {
  const kinds: readonly string[] = STYLE_TREND_KINDS;
  return rows.filter(
    (t) =>
      t.is_active &&
      kinds.includes(t.kind) &&
      (t.starts_at === null || t.starts_at <= now) &&
      (t.ends_at === null || t.ends_at >= now),
  );
}

/**
 * The festival to show: running now, or starting within the lookahead; the region is
 * PAN_INDIA or the shopper's state. Several -> the one that started/starts first.
 */
export function pickFestival<T extends FestivalRow>(
  rows: readonly T[],
  state: string | null,
  now: Date,
): T | null {
  const horizon = new Date(now.getTime() + FESTIVAL_LOOKAHEAD_DAYS * DAY_MS);
  const st = state?.trim().toLowerCase() ?? null;
  const live = rows
    .filter(
      (f) =>
        f.deleted_at === null &&
        f.ends_at >= now &&
        f.starts_at <= horizon &&
        (f.region === 'PAN_INDIA' || (st !== null && f.region.trim().toLowerCase() === st)),
    )
    .sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime());
  return live[0] ?? null;
}

/** A trend matches a product when any of its keywords is one of the product's keywords. */
export function trendHit(
  keywords: readonly string[],
  t: { match_keywords: readonly string[] },
): boolean {
  return t.match_keywords.some((k) => keywords.includes(k.trim().toLowerCase()));
}

interface TabCandidate {
  occasions: readonly string[];
  keywords: readonly string[]; // lowercased, as RankCandidate.keywords
}

const lowered = (xs: readonly string[]) => xs.map((x) => x.trim().toLowerCase());

/**
 * Trending / Festival list only products that match; For you and Occasion list everyone
 * (Occasion only reorders, see promoteMatches).
 */
export function matchesTab(c: TabCandidate, tab: MyStyleTab, trends: readonly TrendRow[]): boolean {
  if (tab === 'trending') {
    return trends.some((t) => t.kind === 'trending' && trendHit(c.keywords, t));
  }
  if (tab === 'festival') {
    const occ = lowered(c.occasions);
    return (
      FESTIVAL_OCCASIONS.some((o) => occ.includes(o)) ||
      trends.some((t) => t.kind === 'festival' && trendHit(c.keywords, t))
    );
  }
  return true;
}

/** Stable partition: matches first, the rest after, each keeping its ranked order. */
export function promoteMatches<T>(items: readonly T[], isMatch: (i: T) => boolean): T[] {
  const hit: T[] = [];
  const rest: T[] = [];
  for (const i of items) (isMatch(i) ? hit : rest).push(i);
  return [...hit, ...rest];
}
