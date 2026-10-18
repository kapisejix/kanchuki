import { describe, expect, it } from 'vitest';
import {
  type FestivalRow,
  type TrendRow,
  activeTrends,
  matchesTab,
  pickFestival,
  promoteMatches,
  trendHit,
} from './my-style-tabs.js';

const NOW = new Date('2026-10-18T00:00:00Z');
const day = 86_400_000;
const at = (d: number) => new Date(NOW.getTime() + d * day);

const trend = (over: Partial<TrendRow> = {}): TrendRow => ({
  kind: 'trending',
  match_keywords: ['bandhani'],
  boost: 0.3,
  starts_at: null,
  ends_at: null,
  is_active: true,
  ...over,
});
const fest = (over: Partial<FestivalRow> = {}): FestivalRow => ({
  name: 'Navratri',
  region: 'PAN_INDIA',
  starts_at: at(-1),
  ends_at: at(5),
  deleted_at: null,
  ...over,
});

describe('activeTrends', () => {
  it('keeps active rows of a known kind inside their window; null bounds are open', () => {
    const rows = [trend(), trend({ starts_at: at(-2), ends_at: at(2) })];
    expect(activeTrends(rows, NOW)).toHaveLength(2);
  });

  it.each([
    ['inactive', { is_active: false }],
    ['ended', { ends_at: at(-1) }],
    ['not started', { starts_at: at(1) }],
    ['unknown kind', { kind: 'viral' }],
  ])('drops %s', (_n, over) => {
    expect(activeTrends([trend(over as Partial<TrendRow>)], NOW)).toEqual([]);
  });
});

describe('pickFestival', () => {
  it('picks a running or soon-to-start festival, earliest first', () => {
    const soon = fest({ name: 'Diwali', starts_at: at(20), ends_at: at(25) });
    expect(pickFestival([soon, fest()], null, NOW)?.name).toBe('Navratri');
    expect(pickFestival([soon], null, NOW)?.name).toBe('Diwali');
  });

  it('ignores past, too-far, deleted and other-region festivals', () => {
    expect(pickFestival([fest({ ends_at: at(-1) })], null, NOW)).toBeNull();
    expect(pickFestival([fest({ starts_at: at(31), ends_at: at(35) })], null, NOW)).toBeNull();
    expect(pickFestival([fest({ deleted_at: at(-1) })], null, NOW)).toBeNull();
    expect(pickFestival([fest({ region: 'Kerala' })], 'Punjab', NOW)).toBeNull();
    expect(pickFestival([fest({ region: 'Kerala' })], null, NOW)).toBeNull();
  });

  it('matches the shopper state case-insensitively', () => {
    expect(pickFestival([fest({ region: 'Kerala' })], ' kerala ', NOW)).not.toBeNull();
  });
});

describe('matchesTab', () => {
  const c = (occasions: string[], keywords: string[] = []) => ({ occasions, keywords });

  it('For you and Occasion list everyone, including products with no occasion signal', () => {
    expect(matchesTab(c([]), 'foryou', [])).toBe(true);
    expect(matchesTab(c([]), 'occasion', [])).toBe(true);
  });

  it('Trending needs a trending-kind keyword hit (a festival-kind trend does not count)', () => {
    expect(matchesTab(c([], ['bandhani']), 'trending', [trend()])).toBe(true);
    expect(matchesTab(c([], ['bandhani']), 'trending', [trend({ kind: 'festival' })])).toBe(false);
    expect(matchesTab(c([], ['plain']), 'trending', [trend()])).toBe(false);
  });

  it('Festival needs Festive/Wedding or a festival-kind keyword; empty occasions never match', () => {
    expect(matchesTab(c(['Festive']), 'festival', [])).toBe(true);
    expect(matchesTab(c(['wedding']), 'festival', [])).toBe(true);
    expect(matchesTab(c(['Daily Wear']), 'festival', [])).toBe(false);
    expect(matchesTab(c([]), 'festival', [])).toBe(false);
    expect(matchesTab(c([], ['bandhani']), 'festival', [trend({ kind: 'festival' })])).toBe(true);
  });
});

describe('trendHit', () => {
  it('trims and lowercases the trend keyword; the product side is already lowercase', () => {
    expect(trendHit(['bandhani'], { match_keywords: [' Bandhani '] })).toBe(true);
    expect(trendHit(['bandhani'], { match_keywords: [] })).toBe(false);
  });
});

describe('promoteMatches', () => {
  it('is a stable partition', () => {
    expect(promoteMatches([1, 2, 3, 4, 5], (n) => n % 2 === 0)).toEqual([2, 4, 1, 3, 5]);
  });
});
