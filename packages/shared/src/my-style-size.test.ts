import { describe, expect, it } from 'vitest';
import {
  STANDARD_SIZE_CHART,
  type SizeChart,
  parseSizeChart,
  standardChartFor,
  suggestSize,
} from './my-style-size.js';

// Synthetic chart, cm ranges per size.
const chart: SizeChart = {
  S: { bust: [80, 84], waist: [62, 66], hip: [86, 90] },
  M: { bust: [85, 89], waist: [67, 71], hip: [91, 95] },
  L: { bust: [90, 94], waist: [72, 76], hip: [96, 100] },
};
const all = ['S', 'M', 'L'];

describe('suggestSize', () => {
  it('picks the size whose ranges contain every measurement', () => {
    expect(suggestSize({ bust_cm: 87, waist_cm: 69, hip_cm: 93 }, chart, all)).toEqual({
      size: 'M',
    });
  });

  it('when the dimensions disagree, takes the larger size and says it is between', () => {
    // bust is an M, hip is an L: the garment must fit the biggest dimension
    expect(suggestSize({ bust_cm: 87, hip_cm: 98 }, chart, all)).toEqual({
      size: 'L',
      between: ['M', 'L'],
    });
  });

  it('uses only the dimensions both sides have', () => {
    expect(suggestSize({ bust_cm: 91 }, chart, all)).toEqual({ size: 'L' });
    expect(suggestSize({ height_cm: 163 }, chart, all)).toBeNull(); // height is not a chart dimension
  });

  it('a gap between two sizes rounds up to the next size', () => {
    expect(suggestSize({ bust_cm: 84.5 }, chart, all)).toEqual({ size: 'M' });
  });

  it('smaller than the smallest size still gets the smallest', () => {
    expect(suggestSize({ bust_cm: 70 }, chart, all)).toEqual({ size: 'S' });
  });

  it('larger than the largest size gets nothing, never a guess', () => {
    expect(suggestSize({ bust_cm: 120 }, chart, all)).toBeNull();
  });

  it('only suggests a size the retailer lists as available', () => {
    expect(suggestSize({ bust_cm: 87 }, chart, ['S', 'L'])).toEqual({ size: 'L' });
    expect(suggestSize({ bust_cm: 87 }, chart, [])).toBeNull();
  });

  it('returns nothing without a chart or without measurements', () => {
    expect(suggestSize({ bust_cm: 87 }, null, all)).toBeNull();
    expect(suggestSize({}, chart, all)).toBeNull();
  });
});

describe('parseSizeChart', () => {
  it('accepts a valid chart and returns it', () => {
    expect(parseSizeChart(chart)).toEqual(chart);
  });

  it.each([
    ['an unknown size', { XS5: { bust: [80, 84] } }],
    ['min above max', { M: { bust: [90, 85] } }],
    ['out of range', { M: { bust: [10, 20] } }],
    ['not whole numbers', { M: { bust: [85.5, 89] } }],
    ['an unknown dimension', { M: { shoulder: [38, 40] } }],
    ['an empty size row', { M: {} }],
    ['an empty chart', {}],
    ['not an object', 'M'],
  ])('rejects %s', (_n, bad) => {
    expect(parseSizeChart(bad)).toBeNull();
  });
});

describe('parseSizeChart rising rule', () => {
  it('rejects a chart whose upper bounds do not rise with size', () => {
    expect(parseSizeChart({ S: { bust: [84, 88] }, M: { bust: [80, 86] } })).toBeNull();
  });
  it('ignores object key order', () => {
    const c = { M: { bust: [89, 94] }, S: { bust: [84, 88] } };
    expect(parseSizeChart(c)).toEqual(c);
  });
  it('allows a dimension to be missing in one size', () => {
    const c = { S: { bust: [84, 88] }, M: { hip: [97, 101] }, L: { bust: [95, 99] } };
    expect(parseSizeChart(c)).toEqual(c);
  });
});

describe('standardChartFor', () => {
  const p = (audience: any, category: string | null, subtype: string | null = null) => ({
    audience,
    category,
    subtype,
  });
  it('is a valid rising chart', () => {
    expect(parseSizeChart(STANDARD_SIZE_CHART)).toEqual(STANDARD_SIZE_CHART);
  });
  it.each([
    'Ladies Suit',
    'Kurti',
    'Kurtis',
    'Salwar Suits',
    'Gown',
    'Tops & Tunics',
    'Co-ords',
    'Ladies',
  ])('covers stitched women wear: %s', (c) => {
    expect(standardChartFor(p('WOMEN', c))).toBe(STANDARD_SIZE_CHART);
  });
  it('covers untagged audience when the text is not men or kids', () => {
    expect(standardChartFor(p(null, 'Kurta'))).toBe(STANDARD_SIZE_CHART);
    expect(standardChartFor(p(null, 'Women Kurti'))).toBe(STANDARD_SIZE_CHART);
  });
  it.each(['MEN', 'GIRLS', 'BOYS', 'KIDS_UNISEX'])('never for audience %s', (a) => {
    expect(standardChartFor(p(a, 'Kurti'))).toBeNull();
  });
  it('never for untagged men or kids text', () => {
    expect(standardChartFor(p(null, "Men's Kurta Pajama"))).toBeNull();
    expect(standardChartFor(p(null, 'Girls Kurti'))).toBeNull();
  });
  it.each([
    'Saree',
    'Lehenga',
    'Dupatta',
    'Unstitched Suit',
    'Dress Material',
    'Blouse Piece',
    'Stole',
    'Laptop Bag',
  ])('never for %s', (c) => {
    expect(standardChartFor(p('WOMEN', c))).toBeNull();
  });
  it('never without category text', () => {
    expect(standardChartFor(p('WOMEN', null, null))).toBeNull();
  });
  it('suggests sizes from the standard chart', () => {
    expect(suggestSize({ bust_cm: 72 }, STANDARD_SIZE_CHART, ['XS', 'S'])).toEqual({ size: 'XS' });
    expect(
      suggestSize({ bust_cm: 91, waist_cm: 76, hip_cm: 99 }, STANDARD_SIZE_CHART, ['S', 'M', 'L']),
    ).toEqual({ size: 'M' });
    expect(suggestSize({ bust_cm: 125 }, STANDARD_SIZE_CHART, ['4XL'])).toBeNull();
  });
});
