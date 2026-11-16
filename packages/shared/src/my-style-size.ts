// F-045 My Style size match (docs/tasks/pending/my-style-body-profile.md §5). Pure: shopper
// measurements + a retailer's size chart + the sizes on offer -> a suggested size, or nothing.
// Never a guess: no chart, no overlapping measurement, or a body larger than the largest size
// all answer null. Boost-free: it only labels a card, it never filters or reorders.
import { SIZE_OPTIONS } from './constants/index.js';
import { MY_STYLE_MEASUREMENT_RANGES } from './my-style-measurements.js';

export const SIZE_CHART_DIMENSIONS = ['bust', 'waist', 'hip'] as const;
export type SizeChartDimension = (typeof SIZE_CHART_DIMENSIONS)[number];
/** cm ranges per size: { M: { bust: [85, 89], waist: [67, 71] } }. */
export type SizeChart = Record<string, Partial<Record<SizeChartDimension, [number, number]>>>;

export interface SizeSuggestion {
  size: string;
  /** Present when the dimensions point at different sizes: the smallest and largest needed. */
  between?: [string, string];
}

const order = (s: string) => (SIZE_OPTIONS as readonly string[]).indexOf(s);

/** Validate untrusted input (a retailer's chart). Returns the chart, or null if anything is off. */
export function parseSizeChart(input: unknown): SizeChart | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out: SizeChart = {};
  for (const [size, row] of Object.entries(input)) {
    if (order(size) < 0 || !row || typeof row !== 'object' || Array.isArray(row)) return null;
    const dims: Partial<Record<SizeChartDimension, [number, number]>> = {};
    for (const [dim, range] of Object.entries(row)) {
      if (!(SIZE_CHART_DIMENSIONS as readonly string[]).includes(dim)) return null;
      const r = MY_STYLE_MEASUREMENT_RANGES[`${dim as SizeChartDimension}_cm`];
      if (!Array.isArray(range) || range.length !== 2) return null;
      const [lo, hi] = range as [unknown, unknown];
      if (!Number.isInteger(lo) || !Number.isInteger(hi)) return null;
      const [a, b] = [lo as number, hi as number];
      if (a > b || a < r.min || b > r.max) return null;
      dims[dim as SizeChartDimension] = [a, b];
    }
    if (Object.keys(dims).length === 0) return null;
    out[size] = dims;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function suggestSize(
  m: Partial<Record<'height_cm' | 'bust_cm' | 'waist_cm' | 'hip_cm', number | null | undefined>>,
  chart: SizeChart | null | undefined,
  available: readonly string[],
): SizeSuggestion | null {
  if (!chart) return null;
  const sizes = Object.keys(chart)
    .filter((s) => available.includes(s) && order(s) >= 0)
    .sort((a, b) => order(a) - order(b));
  const needs: string[] = [];
  for (const dim of SIZE_CHART_DIMENSIONS) {
    const v = m[`${dim}_cm`];
    if (v === null || v === undefined) continue;
    const row = sizes.filter((s) => chart[s]?.[dim]);
    if (row.length === 0) continue; // the chart has no such dimension: ignore it
    // Smallest listed size whose upper bound still covers the body; a gap rounds up.
    const need = row.find((s) => (chart[s]?.[dim]?.[1] ?? -1) >= v);
    if (!need) return null; // larger than the largest size: say nothing rather than guess
    needs.push(need);
  }
  if (needs.length === 0) return null;
  needs.sort((a, b) => order(a) - order(b));
  const lo = needs[0] as string;
  const hi = needs[needs.length - 1] as string;
  return lo === hi ? { size: hi } : { size: hi, between: [lo, hi] };
}
