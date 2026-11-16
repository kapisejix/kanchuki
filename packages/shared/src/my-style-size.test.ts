import { describe, expect, it } from 'vitest';
import { type SizeChart, parseSizeChart, suggestSize } from './my-style-size.js';

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
