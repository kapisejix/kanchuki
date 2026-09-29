import { describe, expect, it } from 'vitest';
import {
  type RelatedCandidate,
  buildFacets,
  buildProductFilterWhere,
  buildSizeFacet,
  publicProductQuerySchema,
  rankRelatedProducts,
  scoreRelatedProduct,
} from '../public-helpers.js';

// These three functions are the single place the storefront's list, count, and
// facet queries all agree on — public-collections.ts and
// public-retailers-catalog.ts both import them. There was no test file on them
// at all, which is how a size filter could ship matching "XL" when the shopper
// asked for "L" and no test would notice.
describe('publicProductQuerySchema — size', () => {
  it('normalises to the uppercase labels the retailer app stores', () => {
    // Products store 'L', 'XL' — a lowercase query string is still a hit.
    expect(publicProductQuerySchema.parse({ size: ' l ' }).size).toBe('L');
    expect(publicProductQuerySchema.parse({ size: 'xxl' }).size).toBe('XXL');
  });

  it('keeps the other params working and tolerates their absence', () => {
    const parsed = publicProductQuerySchema.parse({ page: '2', pageSize: '20' });
    expect(parsed).toMatchObject({ page: 2, pageSize: 20 });
    expect(parsed.size).toBeUndefined();
  });
});

describe('buildProductFilterWhere — size', () => {
  it('matches a size as a whole array element', () => {
    // `has` is exact. `contains`/`mode: insensitive` would make the query for
    // "L" also return every XL and XXL product, which is the entire bug this
    // filter exists to avoid.
    const where = buildProductFilterWhere({ size: 'L' });
    expect(where.sizes).toEqual({ has: 'L' });
    expect(JSON.stringify(where.sizes)).not.toContain('contains');
    expect(JSON.stringify(where.sizes)).not.toContain('insensitive');
  });

  it('omits the filter entirely when no size was asked for', () => {
    expect(buildProductFilterWhere({})).toEqual({ deleted_at: null });
    expect(buildProductFilterWhere({ size: undefined })).toEqual({ deleted_at: null });
  });

  it('treats a whitespace-only size as no filter rather than matching ""', () => {
    const parsed = publicProductQuerySchema.parse({ size: '   ' });
    expect(buildProductFilterWhere(parsed)).toEqual({ deleted_at: null });
  });

  it('still builds category, colour and price alongside it', () => {
    // Regression guard on the shared helper: adding `size` must not quietly
    // replace the existing branches.
    const where = buildProductFilterWhere({
      category: 'Saree',
      color: 'Maroon',
      size: 'M',
    });
    expect(where.category).toBe('Saree');
    expect(where.primary_color).toEqual({ equals: 'Maroon', mode: 'insensitive' });
    expect(where.sizes).toEqual({ has: 'M' });
  });
});

describe('buildSizeFacet', () => {
  it('orders by the canonical size ladder, not by count', () => {
    // Count-descending would render "XXL (1), L (5), M (4)", which reads like a
    // bug on a size row.
    const facet = buildSizeFacet([['XXL'], ['L', 'M'], ['L', 'M', 'S'], ['L'], ['M']]);
    expect(facet.map((f) => f.value)).toEqual(['S', 'M', 'L', 'XXL']);
  });

  it('counts a size once per product even if the array repeats it', () => {
    const facet = buildSizeFacet([['M', 'M', 'M'], ['M']]);
    expect(facet).toEqual([{ value: 'M', count: 2 }]);
  });

  it('drops labels outside the shared list instead of offering an unfilterable chip', () => {
    // SIZE_OPTIONS is the retailer app's picker, so these can only be legacy or
    // hand-written data — a chip for them would still filter, but it would sit
    // outside the ladder and behind every genuine size.
    const facet = buildSizeFacet([['M'], ['Free Size'], ['XXL']]);
    expect(facet.map((f) => f.value)).toEqual(['M', 'XXL']);
  });

  it('returns nothing when no product has sizes recorded', () => {
    expect(buildSizeFacet([[], []])).toEqual([]);
  });
});

describe('buildFacets', () => {
  it('returns sizes alongside categories and colours', () => {
    const facets = buildFacets([
      { category: 'Saree', primary_color: 'Maroon', sizes: ['M', 'L'] },
      { category: 'Saree', primary_color: 'Maroon', sizes: ['L'] },
      { category: 'Kurti', primary_color: 'Blue', sizes: [] },
    ]);
    expect(facets.categories).toEqual([
      { value: 'Saree', count: 2 },
      { value: 'Kurti', count: 1 },
    ]);
    expect(facets.sizes).toEqual([
      { value: 'M', count: 1 },
      { value: 'L', count: 2 },
    ]);
  });

  it('tolerates a caller that did not select the sizes column', () => {
    const facets = buildFacets([{ category: 'Saree', primary_color: 'Maroon' }]);
    expect(facets.sizes).toEqual([]);
  });
});

// "More like this". The old rule was `category` equality only, which in Indian
// ethnic wear is close to no rule at all — a ₹700 cotton daily-wear saree and a
// ₹40,000 Banarasi are both "Saree".
const base: RelatedCandidate = {
  category: 'Saree',
  subtype: 'Banarasi',
  fabrics: ['Silk'],
  primary_color: 'Maroon',
  price_min: 4_000_000,
  created_at: new Date('2026-01-01T00:00:00Z'),
};

const cand = (over: Partial<RelatedCandidate> = {}): RelatedCandidate => ({
  category: 'Kurti',
  subtype: null,
  fabrics: [],
  primary_color: null,
  price_min: null,
  created_at: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

describe('scoreRelatedProduct', () => {
  it('scores a same-everything product above one that only shares the category', () => {
    const twin = scoreRelatedProduct(base, cand({ ...base, created_at: base.created_at }));
    const sameCategoryOnly = scoreRelatedProduct(base, cand());
    expect(twin).toBeGreaterThan(sameCategoryOnly);
  });

  it('ranks fabric above colour', () => {
    // Fabric narrows what the garment IS; colour is the easiest thing to have
    // in common and the least useful as a suggestion.
    const fabricMatch = scoreRelatedProduct(base, cand({ fabrics: ['Silk'] }));
    const colourMatch = scoreRelatedProduct(base, cand({ primary_color: 'maroon' }));
    expect(fabricMatch).toBeGreaterThan(colourMatch);
  });

  it('matches colour case-insensitively', () => {
    expect(scoreRelatedProduct(base, cand({ primary_color: 'MAROON' }))).toBe(
      scoreRelatedProduct(base, cand({ primary_color: 'maroon' })),
    );
  });

  it('ignores a price an order of magnitude away', () => {
    // ₹4,000 vs ₹40,000 — both "Saree", not a useful pair.
    const far = scoreRelatedProduct(base, cand({ price_min: 40_000_000 }));
    const near = scoreRelatedProduct(base, cand({ price_min: 4_500_000 }));
    expect(near).toBeGreaterThan(far);
  });

  it('does not score a null attribute as a match', () => {
    // Two uncategorised products are not "related" — they are both unknown.
    const blank = cand({ category: null, subtype: null, fabrics: [], primary_color: null });
    expect(scoreRelatedProduct(blank, cand({ category: null }))).toBe(0);
  });

  it('treats a null fabric array the same as an empty one', () => {
    // Prisma types `fabrics` as a non-nullable list, but a row written before
    // the column existed still comes back null through a partial select — the
    // scorer has to tolerate both rather than throw on `.some`.
    const nullFabric = cand({ category: null, fabrics: null });
    const emptyFabric = cand({ category: null, fabrics: [] });
    expect(scoreRelatedProduct(base, nullFabric)).toBe(scoreRelatedProduct(base, emptyFabric));
    expect(scoreRelatedProduct(nullFabric, nullFabric)).toBe(0);
  });
});

describe('rankRelatedProducts', () => {
  it('returns the closest matches first and honours the limit', () => {
    const strong = cand({ ...base, created_at: new Date('2026-02-01T00:00:00Z') });
    const medium = cand({ fabrics: ['Silk'], created_at: new Date('2026-03-01T00:00:00Z') });
    const weak = cand({ primary_color: 'Maroon', created_at: new Date('2026-04-01T00:00:00Z') });
    expect(rankRelatedProducts(base, [weak, strong, medium], 2)).toEqual([strong, medium]);
  });

  it('breaks ties by newest, so a cached response cannot reshuffle', () => {
    const older = cand({ created_at: new Date('2026-01-01T00:00:00Z') });
    const newer = cand({ created_at: new Date('2026-06-01T00:00:00Z') });
    expect(rankRelatedProducts(base, [older, newer], 2)).toEqual([newer, older]);
  });

  it('returns an empty list rather than throwing when there is nothing to rank', () => {
    expect(rankRelatedProducts(base, [], 6)).toEqual([]);
  });
});
