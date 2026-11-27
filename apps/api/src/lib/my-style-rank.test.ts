import { describe, expect, it } from 'vitest';
import { type RankCandidate, type RankProfile, rankProducts } from './my-style-rank.js';

const NOW = new Date('2026-10-18T00:00:00Z');
const DAY = 86_400_000;

const cand = (id: string, over: Partial<RankCandidate> = {}): RankCandidate => ({
  id,
  retailer_id: 'r1',
  price_min: 150000, // ₹1,500 in paise
  color_family: null,
  occasions: [],
  fabrics: [],
  keywords: [],
  avg_rating: 0,
  rating_count: 0,
  created_at: new Date(NOW.getTime() - 30 * DAY),
  lat: null,
  lng: null,
  ...over,
});

const profile = (over: Partial<RankProfile> = {}): RankProfile => ({
  palette: null,
  occasions: [],
  colorFamilies: [],
  fabrics: [],
  origin: null,
  trends: [],
  ...over,
});

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
const scoreOf = (c: RankCandidate, p: RankProfile) => rankProducts([c], p, 'best', NOW)[0]!.score;

describe('kids age band (a rank boost, never a filter)', () => {
  const p = profile({ kidsAge: 'AGE_3_5' });
  const at = (age: string | null) => scoreOf(cand('a', { kids_age_group: age }), p);

  it('ranks exact > one band away > further away', () => {
    expect(at('AGE_3_5')).toBeGreaterThan(at('AGE_6_8'));
    expect(at('AGE_6_8')).toBeGreaterThan(at('AGE_13_16'));
    expect(at('AGE_0_2')).toBeCloseTo(at('AGE_6_8'), 10); // both are one band away
  });

  it('treats an unknown age like a far one: neutral, never a penalty', () => {
    expect(at(null)).toBeCloseTo(at('AGE_13_16'), 10);
  });

  it('changes nothing when the shopper gave no age', () => {
    const none = profile();
    const a = scoreOf(cand('a', { kids_age_group: 'AGE_3_5' }), none);
    const b = scoreOf(cand('a', { kids_age_group: null }), none);
    expect(a).toBeCloseTo(b, 10);
  });

  it('keeps every candidate in the result', () => {
    const pool = [
      cand('a', { kids_age_group: 'AGE_3_5' }),
      cand('b', { kids_age_group: 'AGE_13_16' }),
      cand('c', { kids_age_group: null }),
    ];
    expect(rankProducts(pool, p, 'best', NOW)).toHaveLength(3);
  });

  it('puts the exact-age product first among otherwise equal products', () => {
    const pool = [
      cand('far', { kids_age_group: 'AGE_13_16' }),
      cand('exact', { kids_age_group: 'AGE_3_5' }),
      cand('unknown', { kids_age_group: null }),
    ];
    expect(ids(rankProducts(pool, p, 'best', NOW))[0]).toBe('exact');
  });
});

describe('palette fit', () => {
  const palette = { good: ['maroon'], avoid: ['yellow'] };
  const pool = [
    cand('avoid', { color_family: 'yellow' }),
    cand('neutral', { color_family: 'blue' }),
    cand('unmapped', { color_family: null }),
    cand('good', { color_family: 'maroon' }),
  ];

  it('ranks good > neutral > avoid', () => {
    const out = rankProducts(pool, profile({ palette }), 'best', NOW);
    expect(ids(out)[0]).toBe('good');
    expect(ids(out)[3]).toBe('avoid');
    const s = Object.fromEntries(out.map((o) => [o.id, o.score]));
    expect(s.good).toBeGreaterThan(s.neutral!);
    expect(s.neutral).toBeGreaterThan(s.avoid!);
  });

  it('treats an unmapped colour like neutral, never as a penalty', () => {
    const out = rankProducts(pool, profile({ palette }), 'best', NOW);
    const s = Object.fromEntries(out.map((o) => [o.id, o.score]));
    expect(s.unmapped).toBeCloseTo(s.neutral!, 10);
  });

  it('matches family case-insensitively', () => {
    const p = profile({ palette });
    expect(scoreOf(cand('a', { color_family: 'Maroon' }), p)).toBeGreaterThan(
      scoreOf(cand('a', { color_family: 'blue' }), p),
    );
  });

  it('with no palette every family scores the same', () => {
    const out = rankProducts(pool, profile(), 'best', NOW);
    expect(new Set(out.map((o) => o.score.toFixed(9))).size).toBe(1);
  });
});

describe('other signals', () => {
  it('occasion, quiz colour and fabric each lift the score', () => {
    const p = profile({ occasions: ['Wedding'], colorFamilies: ['red'], fabrics: ['silk'] });
    const base = scoreOf(cand('p'), p);
    expect(scoreOf(cand('p', { occasions: ['wedding'] }), p)).toBeGreaterThan(base);
    expect(scoreOf(cand('p', { color_family: 'red' }), p)).toBeGreaterThan(base);
    expect(scoreOf(cand('p', { fabrics: ['Silk'] }), p)).toBeGreaterThan(base);
  });

  it('a matching trend lifts the score by weight × boost; no match = no lift', () => {
    const c = cand('p', { keywords: ['anarkali'] });
    const none = scoreOf(c, profile());
    const hit = scoreOf(c, profile({ trends: [{ match_keywords: ['Anarkali'], boost: 1 }] }));
    const miss = scoreOf(c, profile({ trends: [{ match_keywords: ['sharara'], boost: 1 }] }));
    expect(hit - none).toBeCloseTo(0.2, 10);
    expect(miss).toBeCloseTo(none, 10);
  });

  it('unrated is neutral: beats a 2-star product, loses to a 5-star one', () => {
    const out = rankProducts(
      [
        cand('two', { avg_rating: 2, rating_count: 9 }),
        cand('new'),
        cand('five', { avg_rating: 5, rating_count: 9 }),
      ],
      profile(),
      'best',
      NOW,
    );
    expect(ids(out)).toEqual(['five', 'new', 'two']);
  });

  it('newer beats older; freshness bottoms out at 0 for very old stock', () => {
    const out = rankProducts(
      [
        cand('old', { created_at: new Date(NOW.getTime() - 400 * DAY) }),
        cand('new', { created_at: NOW }),
      ],
      profile(),
      'best',
      NOW,
    );
    expect(ids(out)).toEqual(['new', 'old']);
  });

  it('closer store scores higher; missing coordinates are neutral, not nearest', () => {
    const out = rankProducts(
      [
        cand('far', { lat: 28.9, lng: 77.2 }),
        cand('near', { lat: 28.61, lng: 77.2 }),
        cand('unknown', { lat: null, lng: null }),
      ],
      profile({ origin: { lat: 28.6, lng: 77.2 } }),
      'best',
      NOW,
    );
    expect(ids(out)).toEqual(['near', 'unknown', 'far']);
    expect(out.find((o) => o.id === 'unknown')!.distance_km).toBeNull();
    expect(out.find((o) => o.id === 'near')!.distance_km).toBeCloseTo(1.1, 1);
  });

  it('score stays within 0..1 even with an out-of-range trend boost', () => {
    const s = scoreOf(
      cand('max', {
        color_family: 'maroon',
        occasions: ['x'],
        fabrics: ['y'],
        avg_rating: 5,
        rating_count: 1,
        created_at: NOW,
        lat: 1,
        lng: 1,
        keywords: ['k'],
      }),
      profile({
        palette: { good: ['maroon'], avoid: [] },
        occasions: ['x'],
        colorFamilies: ['maroon'],
        fabrics: ['y'],
        origin: { lat: 1, lng: 1 },
        trends: [{ match_keywords: ['k'], boost: 5 }],
        styles: ['k'], // every fit part on, incl. Phase 3 pref_styles (RC-190)
      }),
    );
    expect(s).toBeLessThanOrEqual(1);
    expect(s).toBeGreaterThan(0.99);
  });
});

describe('sort modes', () => {
  const origin = { lat: 28.6, lng: 77.2 };
  const pool = [
    cand('a', { price_min: 300000, lat: 28.61, lng: 77.2, avg_rating: 1, rating_count: 5 }),
    cand('b', { price_min: 100000, lat: 28.7, lng: 77.2, avg_rating: 5, rating_count: 5 }),
    cand('c', { price_min: null, lat: null, lng: null }),
  ];

  it('nearest orders by distance, unknown last', () => {
    expect(ids(rankProducts(pool, profile({ origin }), 'nearest', NOW))).toEqual(['a', 'b', 'c']);
  });

  it('price orders by paise ascending, missing price last', () => {
    expect(ids(rankProducts(pool, profile({ origin }), 'price', NOW))).toEqual(['b', 'a', 'c']);
  });

  it('price ties break on score; full ties break on id (stable)', () => {
    const tie = [
      cand('z', { price_min: 5 }),
      cand('y', { price_min: 5, avg_rating: 5, rating_count: 1 }),
      cand('x', { price_min: 5 }),
    ];
    expect(ids(rankProducts(tie, profile(), 'price', NOW))).toEqual(['y', 'x', 'z']);
  });

  it('keeps prices as the integer paise it was given', () => {
    const out = rankProducts([cand('p', { price_min: 199900 })], profile(), 'price', NOW);
    expect(out[0]!.price_min).toBe(199900);
  });

  it('does not mutate its input', () => {
    const input = [cand('b'), cand('a')];
    rankProducts(input, profile(), 'best', NOW);
    expect(ids(input)).toEqual(['b', 'a']);
  });

  it('returns [] for no candidates', () => {
    expect(rankProducts([], profile(), 'best', NOW)).toEqual([]);
  });
});

describe('diversity cap (best match only)', () => {
  // store "big" has 8 great products, s0..s9 have one ordinary product each (10 > 12 − 3,
  // so the window can be filled without a 4th "big" item).
  const pool = [
    ...Array.from({ length: 8 }, (_, i) =>
      cand(`big${i}`, { retailer_id: 'big', avg_rating: 5, rating_count: 3 }),
    ),
    ...Array.from({ length: 10 }, (_, i) => cand(`s${i}`, { retailer_id: `s${i}` })),
  ];

  it('caps one store at 3 inside the first 12 and drops nothing', () => {
    const out = rankProducts(pool, profile(), 'best', NOW);
    expect(out.slice(0, 12).filter((o) => o.retailer_id === 'big')).toHaveLength(3);
    expect(out).toHaveLength(pool.length);
  });

  it('is skipped for price sort', () => {
    const out = rankProducts(pool, profile(), 'price', NOW);
    expect(out.slice(0, 8).every((o) => o.retailer_id === 'big')).toBe(true);
  });

  it('does not starve the feed when one store is all there is', () => {
    const one = Array.from({ length: 5 }, (_, i) => cand(`only${i}`));
    expect(rankProducts(one, profile(), 'best', NOW)).toHaveLength(5);
  });
});

describe('find similar (PR-9)', () => {
  it('no similarity on any candidate leaves the score exactly as before', () => {
    const c = cand('a');
    expect(scoreOf({ ...c }, profile())).toBe(scoreOf(c, profile()));
  });

  it('a more similar product outranks a less similar one, all else equal', () => {
    const out = rankProducts(
      [cand('far', { similarity: 0.1 }), cand('near', { similarity: 0.9 })],
      profile(),
      'best',
      NOW,
    );
    expect(ids(out)).toEqual(['near', 'far']);
  });

  it('similarity takes over only fitShare of fit: it can lift but not replace the palette', () => {
    const p = profile({ palette: { good: ['red'], avoid: ['blue'] } });
    const avoidSimilar = scoreOf(cand('a', { color_family: 'blue', similarity: 1 }), p);
    const goodDissimilar = scoreOf(cand('b', { color_family: 'red', similarity: 0 }), p);
    const avoidDissimilar = scoreOf(cand('c', { color_family: 'blue', similarity: 0 }), p);
    expect(avoidSimilar).toBeGreaterThan(avoidDissimilar);
    expect(avoidSimilar).toBeGreaterThan(0);
    expect(goodDissimilar).toBeGreaterThan(avoidDissimilar);
  });

  it('score stays within 0..1 for an out-of-range similarity', () => {
    const s = scoreOf(cand('a', { similarity: 7 }), profile());
    expect(s).toBeLessThanOrEqual(1);
    expect(scoreOf(cand('b', { similarity: -3 }), profile())).toBeGreaterThanOrEqual(0);
  });

  it('the per-store diversity cap still applies to a similar-ranked list', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      cand(`s${i}`, { retailer_id: 'same', similarity: 1 - i / 10 }),
    );
    const other = cand('other', { retailer_id: 'x', similarity: 0.05 });
    const out = rankProducts([...many, other], profile(), 'best', NOW);
    expect(ids(out).indexOf('other')).toBeLessThan(5);
  });
});

// RC-171: the photo read returns a body frame and it was stored and displayed but never read
// by the ranker (a field that succeeds while doing nothing, RC-030 shape).
describe('body frame (a rank boost, never a filter)', () => {
  const match = cand('m', { keywords: ['anarkali'] });
  const other = cand('o', { keywords: ['straight kurta'] });
  const curvy = profile({ frame: 'curvy' });

  it('lifts a silhouette listed for the frame above one that is not', () => {
    expect(scoreOf(match, curvy)).toBeGreaterThan(scoreOf(other, curvy));
  });

  it('changes nothing without a frame, or for the neutral "average" frame', () => {
    expect(scoreOf(match, profile())).toBeCloseTo(scoreOf(other, profile()), 10);
    expect(scoreOf(match, profile({ frame: 'average' }))).toBeCloseTo(
      scoreOf(other, profile({ frame: 'average' })),
      10,
    );
  });

  it('is a boost only: a non-matching product stays in the result', () => {
    expect(ids(rankProducts([match, other], curvy, 'best', NOW)).sort()).toEqual(['m', 'o']);
  });

  it('ignores an unknown frame value', () => {
    expect(scoreOf(match, profile({ frame: 'bogus' }))).toBeCloseTo(
      scoreOf(other, profile({ frame: 'bogus' })),
      10,
    );
  });

  // Real subtypes are phrases ("straight cut kurti", "short kurti set"), so a listed silhouette
  // must count when it appears as whole words inside a keyword, not only as the whole keyword.
  it('counts a silhouette that appears as whole words inside a longer keyword', () => {
    const petite = profile({ frame: 'petite' });
    const phrase = cand('p', { keywords: ['straight cut kurti'] });
    const none = cand('n', { keywords: ['kurta set'] });
    expect(scoreOf(phrase, petite)).toBeGreaterThan(scoreOf(none, petite));
    const shortSet = cand('s', { keywords: ['short kurti set'] });
    expect(scoreOf(shortSet, petite)).toBeGreaterThan(scoreOf(none, petite));
  });

  it('does not count a silhouette that is only part of a word', () => {
    const tall = profile({ frame: 'tall' });
    const inside = cand('x', { keywords: ['maxine', 'gowns'] });
    const none = cand('n', { keywords: ['kurta set'] });
    expect(scoreOf(inside, tall)).toBeCloseTo(scoreOf(none, tall), 10);
  });

  it('matches a hyphenated silhouette inside a phrase', () => {
    const phrase = cand('a', { keywords: ['a-line kurti'] });
    expect(scoreOf(phrase, curvy)).toBeGreaterThan(scoreOf(other, curvy));
  });
});

describe('pref_styles + reasons', () => {
  const rank1 = (c: RankCandidate, p: RankProfile) => rankProducts([c], p, 'best', NOW)[0]!;

  it('boosts a product whose keywords carry a chosen style', () => {
    const p = profile({ styles: ['Anarkali'] });
    const hit = scoreOf(cand('a', { keywords: ['anarkali suit'] }), p);
    const miss = scoreOf(cand('b', { keywords: ['straight kurti'] }), p);
    expect(hit - miss).toBeCloseTo(0.45 * 0.05, 4);
  });

  it('matches regex characters literally and only as whole words', () => {
    const p = profile({ styles: ['A-line (long)'] });
    expect(rank1(cand('a', { keywords: ['a-line (long) kurti'] }), p).reasons).toContainEqual({
      code: 'style',
      detail: 'A-line (long)',
    });
    expect(rank1(cand('b', { keywords: ['a-linexlong'] }), p).reasons).toEqual([]);
  });

  it('orders reasons palette first, with the matched occasion as detail', () => {
    const p = profile({
      palette: { good: ['red'], avoid: ['grey'] },
      occasions: ['Festive'],
    });
    const r = rank1(cand('a', { color_family: 'red', occasions: ['festive'] }), p).reasons;
    expect(r.map((x) => x.code)).toEqual(['palette', 'occasion']);
    expect(r[1]).toEqual({ code: 'occasion', detail: 'Festive' });
  });

  it('never gives an avoid family as a reason', () => {
    const p = profile({ palette: { good: ['red'], avoid: ['grey'] } });
    expect(rank1(cand('a', { color_family: 'grey' }), p).reasons).toEqual([]);
  });

  it('reports colour and fabric matches', () => {
    const p = profile({ colorFamilies: ['red'], fabrics: ['Silk'] });
    expect(rank1(cand('a', { color_family: 'red', fabrics: ['silk'] }), p).reasons).toEqual([
      { code: 'color' },
      { code: 'fabric', detail: 'Silk' },
    ]);
  });
});
