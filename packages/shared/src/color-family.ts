// F-045 My Style (docs/tasks/pending/my-style.md §4.1) — collapse the AI's free-text
// `primary_color` ("Mustard", "peacock blue") into a `color_families.name` so palette
// scoring can compare like with like. Rules only, no LLM; unmapped -> null, never a guess.

export interface ColorFamilyDef {
  name: string;
  aliases: readonly string[];
}

/**
 * Static copy of the `color_families` seed in migration 133. The DB table is the live
 * source (admin-editable); this is the default for callers with no DB handle and for
 * tests. color-family.test.ts parses the migration and fails if the two drift.
 */
export const DEFAULT_COLOR_FAMILIES: readonly ColorFamilyDef[] = [
  { name: 'red', aliases: ['lal','scarlet','crimson','cherry','tomato red','ruby'] },
  { name: 'maroon', aliases: ['wine','burgundy','oxblood','brick red','brick','mehroon'] },
  { name: 'pink', aliases: ['baby pink','rose','rose pink','blush','blush pink','light pink','gulabi'] },
  { name: 'magenta', aliases: ['rani','rani pink','fuchsia','hot pink','dark pink','cerise'] },
  { name: 'peach', aliases: ['coral','salmon','apricot','onion pink','onion'] },
  { name: 'orange', aliases: ['saffron','kesari','tangerine','burnt orange','rust','rust orange'] },
  { name: 'yellow', aliases: ['mustard','mustard yellow','haldi','lemon','lemon yellow','canary','pila'] },
  { name: 'green', aliases: ['bottle green','parrot green','mint','mint green','lime','sea green','pista','pista green','emerald','emerald green','mehendi','mehndi','hara'] },
  { name: 'olive', aliases: ['olive green','khaki','army green','moss','moss green','mehendi olive'] },
  { name: 'teal', aliases: ['peacock','peacock blue','peacock green','firozi','turquoise','aqua','sea blue','rama'] },
  { name: 'blue', aliases: ['sky blue','royal blue','cobalt','powder blue','baby blue','light blue','neela'] },
  { name: 'navy', aliases: ['navy blue','midnight blue','dark blue','indigo'] },
  { name: 'purple', aliases: ['lavender','lilac','violet','mauve','plum','brinjal','jamuni'] },
  { name: 'brown', aliases: ['chocolate','coffee','mocha','tan','camel','copper'] },
  { name: 'beige', aliases: ['nude','sand','taupe','fawn','skin','biscuit'] },
  { name: 'cream', aliases: ['ivory','off white','off-white','ecru','vanilla'] },
  { name: 'white', aliases: ['pure white','safed'] },
  { name: 'black', aliases: ['jet black','kala'] },
  { name: 'grey', aliases: ['gray','charcoal','slate','ash','steel grey'] },
  { name: 'gold', aliases: ['golden','antique gold','champagne'] },
  { name: 'silver', aliases: ['metallic silver','gunmetal'] },
  { name: 'multi', aliases: ['multicolor','multicolour','multi color','multi colour','multi-color','assorted'] },
];

/** Case-insensitive, trimmed, whitespace collapsed. Also used to clean admin alias input. */
export const cleanColorTerm = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, ' ');

const isWordChar = (c: string | undefined): boolean => c !== undefined && /[a-z0-9]/.test(c);

/**
 * Map a free-text colour to a family name, or null.
 *  1. the whole value equals a family name or alias            -> that family
 *  2. else every name/alias found as a whole word, longest first (a longer match
 *     swallows the shorter one inside it: "navy blue" is not also "blue")
 *     -> that family only if exactly ONE family was found; two -> null (ambiguous).
 * Pure, never throws. Caller passes only the families it wants considered (is_active).
 */
export function normalizeColorFamily(
  value: string | null | undefined,
  families: readonly ColorFamilyDef[] = DEFAULT_COLOR_FAMILIES,
): string | null {
  if (typeof value !== 'string') return null;
  const v = cleanColorTerm(value);
  if (!v) return null;

  const terms: { term: string; family: string }[] = [];
  for (const f of families) {
    for (const t of [f.name, ...f.aliases]) {
      const term = cleanColorTerm(t);
      if (term) terms.push({ term, family: f.name });
    }
  }

  const exact = terms.find((t) => t.term === v);
  if (exact) return exact.family;

  terms.sort((a, b) => b.term.length - a.term.length);
  const taken: boolean[] = new Array(v.length).fill(false);
  const found = new Set<string>();
  for (const { term, family } of terms) {
    for (let i = v.indexOf(term); i !== -1; i = v.indexOf(term, i + 1)) {
      const end = i + term.length;
      if (isWordChar(v[i - 1]) || isWordChar(v[end])) continue;
      if (taken.slice(i, end).some(Boolean)) continue;
      taken.fill(true, i, end);
      found.add(family);
    }
  }
  return found.size === 1 ? ([...found][0] ?? null) : null;
}
