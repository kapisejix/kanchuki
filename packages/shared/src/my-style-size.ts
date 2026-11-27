// F-045 My Style size match (docs/tasks/pending/my-style-body-profile.md §5). Pure: shopper
// measurements + a retailer's size chart + the sizes on offer -> a suggested size, or nothing.
// Never a guess: no chart, no overlapping measurement, or a body larger than the largest size
// all answer null. Boost-free: it only labels a card, it never filters or reorders.
import { SIZE_OPTIONS } from './constants/index.js';
import { MY_STYLE_MEASUREMENT_RANGES, cmToInches, inchesToCm } from './my-style-measurements.js';
import { type ProductAudienceValue, audienceForText } from './product-audience.js';

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
  // Each dimension must rise with size, or suggestSize would pick a wrong size.
  const sizes = Object.keys(out).sort((a, b) => order(a) - order(b));
  for (const dim of SIZE_CHART_DIMENSIONS) {
    let prev = -1;
    for (const s of sizes) {
      const hi = out[s]?.[dim]?.[1];
      if (hi === undefined) continue;
      if (hi <= prev) return null;
      prev = hi;
    }
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

/**
 * Phase 4: a standard Indian women's body chart (cm), used when a product has no chart of its
 * own. Common brand inch chart (bust 32-46", waist 26-40", hip 35-49", 2" a size) as ±1" bands.
 * ponytail: a constant, not a table; an admin editor only if the owner needs to change it often.
 */
export const STANDARD_SIZE_CHART: SizeChart = {
  XS: { bust: [79, 83], waist: [64, 68], hip: [86, 91] },
  S: { bust: [84, 88], waist: [69, 73], hip: [92, 96] },
  M: { bust: [89, 94], waist: [74, 78], hip: [97, 101] },
  L: { bust: [95, 99], waist: [79, 83], hip: [102, 106] },
  XL: { bust: [100, 104], waist: [84, 88], hip: [107, 111] },
  XXL: { bust: [105, 109], waist: [89, 93], hip: [112, 116] },
  XXXL: { bust: [110, 114], waist: [94, 98], hip: [117, 121] },
  '4XL': { bust: [115, 119], waist: [99, 104], hip: [122, 127] },
};

const STITCHED =
  /\b(kurtis?|kurtas?|suits?|salwar|anarkali|gowns?|tops?|tunics?|co-ords?|ladies)\b/;
const NOT_SIZED =
  /\b(sarees?|sari|dupattas?|lehengas?|unstitched|dress material|blouse piece|fabric|stoles?)\b/;

/** The standard chart for stitched women's wear only; null for men, kids, saree, dupatta… */
export function standardChartFor(p: {
  audience: ProductAudienceValue | null;
  category: string | null;
  subtype: string | null;
  /** Read only for the men / kids guess: "Mens Kurta Pajama" filed under a plain "Kurta". */
  name?: string | null;
}): SizeChart | null {
  if (p.audience !== 'WOMEN') {
    if (p.audience !== null) return null;
    const guess = audienceForText(p.category, p.subtype, p.name);
    if (guess !== null && guess !== 'WOMEN') return null;
  }
  const text = `${p.category ?? ''} ${p.subtype ?? ''}`.toLowerCase();
  if (NOT_SIZED.test(text) || !STITCHED.test(text)) return null;
  return STANDARD_SIZE_CHART;
}

/** B2: sizes a shopper can save as their usual size; the same span as STANDARD_SIZE_CHART. */
export const USUAL_SIZE_OPTIONS = [
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  'XXXL',
  '4XL',
] as const satisfies readonly (typeof SIZE_OPTIONS)[number][];
export type UsualSize = (typeof USUAL_SIZE_OPTIONS)[number];

/** Retailer entry: the "fits up to" body measurement per size and dimension, in inches. */
export type InchRows = Record<string, Partial<Record<SizeChartDimension, number>>>;

/**
 * Inches -> cm chart. Upper = round(in × 2.54); lower = the previous listed size's upper + 1
 * (upper − 5 for a dimension's first size). suggestSize reads only uppers, so this loses nothing.
 * null when everything is blank; 'invalid' when parseSizeChart rejects the result.
 */
export function chartFromInches(rows: InchRows): SizeChart | null | 'invalid' {
  const sizes = Object.keys(rows).sort((a, b) => order(a) - order(b));
  const raw: Record<string, Partial<Record<SizeChartDimension, [number, number]>>> = {};
  for (const dim of SIZE_CHART_DIMENSIONS) {
    let prev: number | null = null;
    for (const s of sizes) {
      const v = rows[s]?.[dim];
      if (v === undefined || !Number.isFinite(v)) continue;
      const hi = inchesToCm(v);
      raw[s] = { ...raw[s], [dim]: [prev === null ? hi - 5 : prev + 1, hi] };
      prev = hi;
    }
  }
  if (Object.keys(raw).length === 0) return null;
  return parseSizeChart(raw) ?? 'invalid';
}

/** cm chart -> "fits up to" inches, to the nearest half inch (edit form). */
export function inchesFromChart(chart: SizeChart): InchRows {
  const out: InchRows = {};
  for (const [size, dims] of Object.entries(chart)) {
    const row: Partial<Record<SizeChartDimension, number>> = {};
    for (const dim of SIZE_CHART_DIMENSIONS) {
      const r = dims[dim];
      if (r) row[dim] = cmToInches(r[1]);
    }
    out[size] = row;
  }
  return out;
}

/** The standard chart as inch rows, for the ticked sizes it covers. */
export function standardInchRows(sizes: readonly string[]): InchRows {
  const all = inchesFromChart(STANDARD_SIZE_CHART);
  return Object.fromEntries(
    sizes.filter((s) => all[s]).map((s) => [s, all[s] as InchRows[string]]),
  );
}
