import { describe, expect, it } from 'vitest';
import { recommendSizeFromSignals, chartCategoryForProduct } from './size-recommend.js';
import { SizeChartCategory, type SizeChartRow } from '@kanchuki/db';

function chartRow(sizeLabel: string): SizeChartRow {
  return {
    id: `row_${sizeLabel}`,
    size_chart_id: 'chart_1',
    size_label: sizeLabel,
    sort_order: 0,
    bust_min_cm: null,
    bust_max_cm: null,
    waist_min_cm: null,
    waist_max_cm: null,
    hip_min_cm: null,
    hip_max_cm: null,
    length_min_cm: null,
    length_max_cm: null,
  };
}

describe('recommendSizeFromSignals (roadmap N)', () => {
  it('prefers the usual size when the product stocks it', () => {
    const r = recommendSizeFromSignals(
      { usual_size: 'XL' },
      { sizes: ['S', 'M', 'XL'] },
      ['M', 'M'],
      chartRow('M'),
    );
    expect(r).toEqual({ suggested_size: 'XL', basis: 'USUAL' });
  });

  it('falls back to the most-bought history size when usual size is not stocked', () => {
    const r = recommendSizeFromSignals(
      { usual_size: 'XL' },
      { sizes: ['S', 'M'] },
      ['M', 'M', 'L'],
      chartRow('M'),
    );
    expect(r).toEqual({ suggested_size: 'M', basis: 'HISTORY' });
  });

  it('uses the size chart when there is no usual size or history', () => {
    const r = recommendSizeFromSignals(
      { usual_size: null },
      { sizes: ['S', 'M', 'L'] },
      [],
      chartRow('M'),
    );
    expect(r).toEqual({ suggested_size: 'M', basis: 'CHART' });
  });

  it('never recommends a size the product does not stock', () => {
    const r = recommendSizeFromSignals(
      { usual_size: '4XL' },
      { sizes: ['S', 'M'] },
      ['L', 'L'],
      chartRow('XXXL'),
    );
    expect(r).toEqual({ suggested_size: null, basis: null });
  });

  it('picks the most frequent history size when several are stocked', () => {
    const r = recommendSizeFromSignals(
      { usual_size: null },
      { sizes: ['S', 'M', 'L', 'XL'] },
      ['L', 'M', 'L', 'S'],
      null,
    );
    expect(r).toEqual({ suggested_size: 'L', basis: 'HISTORY' });
  });
});

describe('chartCategoryForProduct (roadmap N)', () => {
  it('maps lower-body categories to LOWER', () => {
    expect(chartCategoryForProduct('Palazzo Pants')).toBe(SizeChartCategory.LOWER);
    expect(chartCategoryForProduct('Lehenga')).toBe(SizeChartCategory.LOWER);
    expect(chartCategoryForProduct('Jeans')).toBe(SizeChartCategory.LOWER);
  });

  it('defaults everything else to UPPER', () => {
    expect(chartCategoryForProduct('Kurti')).toBe(SizeChartCategory.UPPER);
    expect(chartCategoryForProduct('Saree')).toBe(SizeChartCategory.UPPER);
    expect(chartCategoryForProduct(null)).toBe(SizeChartCategory.UPPER);
  });
});
