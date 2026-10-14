import { describe, expect, it } from 'vitest';
import { type FeedRow, groupCategoryFeed } from '../public-helpers.js';

// Rows arrive newest-first, as the route's orderBy delivers them.
const row = (shop: string, cat: string, lat: number | null = null, lng: number | null = null) =>
  ({
    shop,
    cat,
    retailer: { public_slug: shop, latitude: lat, longitude: lng },
    product_category: { name: cat },
  }) satisfies FeedRow & { shop: string; cat: string };

const spread = (cat: string) => ['a', 'b', 'c'].flatMap((s) => [row(s, cat), row(s, cat)]); // 6 products, 3 shops

describe('groupCategoryFeed', () => {
  it('keeps a row with products from several shops', () => {
    const out = groupCategoryFeed(spread('Suits'), null);
    expect(out.map((g) => g.category)).toEqual(['Suits']);
    expect(out[0]?.items).toHaveLength(6);
  });

  it('drops thin rows: a single product', () => {
    expect(groupCategoryFeed([row('a', 'Sarees')], null)).toEqual([]);
  });

  it('keeps a small pilot row: one shop, two products', () => {
    const out = groupCategoryFeed(
      Array.from({ length: 8 }, () => row('a', 'Kurtis')),
      null,
    );
    expect(out[0]?.items).toHaveLength(2); // capped at 2 per shop
  });

  it('caps each shop at 2 per row', () => {
    const rows = [...Array.from({ length: 5 }, () => row('a', 'Suits')), ...spread('Suits')];
    const out = groupCategoryFeed(rows, null);
    expect(out[0]?.items.filter((i) => i.row.shop === 'a')).toHaveLength(2);
  });

  it('orders nearest shop first when coordinates are given, newest otherwise', () => {
    const rows = [
      row('far', 'Suits', 19.07, 72.87), // Mumbai, newest
      row('near', 'Suits', 26.92, 75.8), // Jaipur
      row('near', 'Suits', 26.92, 75.8),
      row('far', 'Suits', 19.07, 72.87),
      row('mid', 'Suits', 26.0, 75.0),
      row('mid', 'Suits', 26.0, 75.0),
    ];
    const jaipur = { lat: 26.92, lng: 75.8 };
    expect(groupCategoryFeed(rows, jaipur)[0]?.items[0]?.row.shop).toBe('near');
    expect(groupCategoryFeed(rows, null)[0]?.items[0]?.row.shop).toBe('far');
  });

  it('skips products with no category or no public slug', () => {
    const rows = [
      ...spread('Suits'),
      {
        retailer: { public_slug: null, latitude: null, longitude: null },
        product_category: { name: 'Suits' },
      },
      { retailer: { public_slug: 'z', latitude: null, longitude: null }, product_category: null },
    ];
    expect(groupCategoryFeed(rows, null)[0]?.items).toHaveLength(6);
  });
});
