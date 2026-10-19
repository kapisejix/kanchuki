// F-045 My Style — the StyleQuiz's option labels -> CustomerAccount columns. One table,
// used by the API (PATCH /passport/style-quiz). The web sends the labels it displays and
// never maps them itself, so a label change cannot drift from the columns.
import {
  type ColorFamilyDef,
  DEFAULT_COLOR_FAMILIES,
  normalizeColorFamily,
} from './color-family.js';
import { PRODUCT_OCCASIONS } from './occasions.js';

export interface StyleQuizAnswers {
  occasion?: string[];
  region?: string[];
  budget?: string[];
  fabric?: string[];
  color?: string[];
}

export interface StyleQuizColumns {
  pref_occasions?: string[];
  pref_styles?: string[];
  pref_fabrics?: string[];
  pref_colors?: string[];
  budget_min?: number | null; // paise
  budget_max?: number | null; // paise
}

// product.occasions holds free text ("Party Wear", "Festive"); these are the spellings
// the ranking engine compares against (lowercased).
const OCCASIONS: Record<string, string[]> = {
  'daily wear': ['daily wear'],
  'party / festive': ['party wear', 'festive'],
  'wedding / bridal': ['wedding'],
  'office / formal': ['daily wear'],
  'casual outings': ['daily wear'],
};

/**
 * Any occasion the shopper can pick (quiz/dropdown label like "Party / Festive", or a
 * canonical value like "Party Wear") -> the lowercase spellings the ranker compares. An
 * unknown label gives [] (no boost), never a throw. RC-070: the feed used to pass the
 * dropdown label straight to the ranker, where it matched nothing.
 */
export function occasionTargets(label: string): string[] {
  const k = key(label);
  return OCCASIONS[k] ?? (PRODUCT_OCCASIONS.some((o) => o.toLowerCase() === k) ? [k] : []);
}

// [min, max] in paise; null = open-ended.
const BUDGETS: Record<string, [number | null, number | null]> = {
  'under ₹500': [null, 50_000],
  '₹500 – ₹1,500': [50_000, 150_000],
  '₹1,500 – ₹3,000': [150_000, 300_000],
  '₹3,000 – ₹5,000': [300_000, 500_000],
  '₹5,000 – ₹10,000': [500_000, 1_000_000],
  '₹10,000+': [1_000_000, null],
};

const key = (s: string) => s.trim().toLowerCase();
// Array.from, not a spread: apps/web typechecks this file at a target without Set iteration.
const uniq = (xs: string[]) => Array.from(new Set(xs));
const skipNoPreference = (s: string) => key(s) !== 'no preference';

/**
 * Only the keys present in `answers` produce columns, so a partial PATCH never wipes the
 * rest. Unknown labels are ignored (the web copy may change before the API does).
 * Colours: each part of "Red / Maroon" is mapped to a colour family; a part with no
 * family ("Pastels") is kept as its own lowercase term — it never matches a product but
 * is not thrown away.
 */
export function mapStyleQuizAnswers(
  answers: StyleQuizAnswers,
  families: readonly ColorFamilyDef[] = DEFAULT_COLOR_FAMILIES,
): StyleQuizColumns {
  const out: StyleQuizColumns = {};
  if (answers.occasion) {
    out.pref_occasions = uniq(answers.occasion.flatMap((l) => OCCASIONS[key(l)] ?? []));
  }
  if (answers.region) {
    out.pref_styles = uniq(answers.region.filter(skipNoPreference).map(key));
  }
  if (answers.fabric) {
    out.pref_fabrics = uniq(answers.fabric.filter(skipNoPreference).map(key));
  }
  if (answers.color) {
    out.pref_colors = uniq(
      answers.color.flatMap((l) =>
        l.split('/').map((part) => normalizeColorFamily(part, families) ?? key(part)),
      ),
    ).filter(Boolean);
  }
  if (answers.budget) {
    const range = answers.budget.map((l) => BUDGETS[key(l)]).find(Boolean);
    if (range) [out.budget_min, out.budget_max] = range;
  }
  return out;
}
