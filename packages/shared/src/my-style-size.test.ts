import { describe, expect, it } from 'vitest';
import {
  MY_STYLE_BODY_CONSENT,
  cmToFeetInches,
  cmToInches,
  feetInchesToCm,
  inchesToCm,
} from './my-style-measurements.js';
import {
  STANDARD_SIZE_CHART,
  USUAL_SIZE_OPTIONS,
  type SizeChart,
  chartFromInches,
  inchesFromChart,
  parseSizeChart,
  standardChartFor,
  standardInchRows,
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

describe('inch rows <-> size chart', () => {
  it('builds cm ranges from "fits up to" inches', () => {
    expect(chartFromInches({ S: { bust: 34 }, M: { bust: 36 } })).toEqual({
      S: { bust: [81, 86] },
      M: { bust: [87, 91] },
    });
  });
  it('starts each dimension at its first size', () => {
    expect(chartFromInches({ S: { bust: 34 }, M: { hip: 39 } })).toEqual({
      S: { bust: [81, 86] },
      M: { hip: [94, 99] },
    });
  });
  it('is null when everything is blank', () => {
    expect(chartFromInches({})).toBeNull();
    expect(chartFromInches({ S: {} })).toBeNull();
  });
  it('is invalid when sizes do not rise', () => {
    expect(chartFromInches({ S: { bust: 36 }, M: { bust: 34 } })).toBe('invalid');
  });
  it('reads a chart back as inches to the nearest half', () => {
    expect(inchesFromChart({ M: { bust: [89, 94] } })).toEqual({ M: { bust: 37 } });
  });
  it('round-trips the standard chart without changing suggestions', () => {
    const back = chartFromInches(inchesFromChart(STANDARD_SIZE_CHART));
    expect(back).not.toBe('invalid');
    const sizes = Object.keys(STANDARD_SIZE_CHART);
    for (const bust_cm of [85, 91, 100, 118]) {
      expect(suggestSize({ bust_cm }, back as SizeChart, sizes)).toEqual(
        suggestSize({ bust_cm }, STANDARD_SIZE_CHART, sizes),
      );
    }
  });
  it('gives standard rows only for sizes in the standard chart', () => {
    expect(standardInchRows(['M', '5XL'])).toEqual({ M: { bust: 37, waist: 30.5, hip: 40 } });
  });
});

describe('standardChartFor reads the product name too (review fix)', () => {
  it('a men kurta with no audience and a plain category gets no chart', () => {
    expect(
      standardChartFor({
        audience: null,
        category: 'Kurta',
        subtype: null,
        name: 'Mens Kurta Pajama',
      }),
    ).toBeNull();
  });
  it('a women name keeps the chart', () => {
    expect(
      standardChartFor({ audience: null, category: 'Kurta', subtype: null, name: 'Ladies kurta' }),
    ).toBe(STANDARD_SIZE_CHART);
  });
});

describe('unit helpers (B2)', () => {
  it('converts inches to whole cm and cm to the nearest half inch', () => {
    expect(inchesToCm(34)).toBe(86);
    expect(inchesToCm(34.5)).toBe(88);
    expect(cmToInches(86)).toBe(34);
    expect(cmToInches(88)).toBe(34.5);
  });

  it('splits cm into feet and inches, and back', () => {
    expect(cmToFeetInches(163)).toEqual({ feet: 5, inches: 4 });
    expect(cmToFeetInches(152)).toEqual({ feet: 5, inches: 0 });
    expect(feetInchesToCm(5, 4)).toBe(163);
  });

  it('offers XS..4XL as usual sizes, the same span as the standard chart', () => {
    expect(USUAL_SIZE_OPTIONS).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL']);
    expect(Object.keys(STANDARD_SIZE_CHART)).toEqual([...USUAL_SIZE_OPTIONS]);
  });

  it('body consent 1.1 names the usual size', () => {
    expect(MY_STYLE_BODY_CONSENT.version).toBe('mystyle-body-1.1');
    expect(MY_STYLE_BODY_CONSENT.intro).toMatch(/usual size/i);
  });
});
