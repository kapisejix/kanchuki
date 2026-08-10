// Fuzzy name matching for the AI-tag → retailer-taxonomy soft-match layer
// (F-024/F-027). The AI returns free-text values ("Kurti", "Anarkali Suit")
// while the retailer's lists are canonical ("Kurtis", "Anarkali Suits") —
// a strict === never hits, so Category/Style/Fabric auto-assignment silently
// no-ops (the exact bug F-030's sibling features kept hitting). These helpers
// normalize + singularize + token-overlap so the AI's singular/free-form
// output lands on the retailer's own row.

/** Lowercase, collapse punctuation/whitespace, trim. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Best-effort English singularization (plural→singular). Deliberately simple:
 * the containment/token checks below absorb the edge cases this misses
 * ("dresses"→"dresse" still contains "dress"; "sarees"→"saree" is exact).
 */
function singular(s: string): string {
  if (s.endsWith('ies') && s.length > 3) return `${s.slice(0, -3)}y`;
  // Protect double-s words ("dress", "blouse" is fine — no trailing s).
  if (s.endsWith('ss')) return s;
  if (s.endsWith('s') && s.length > 1) return s.slice(0, -1);
  return s;
}

/** True when two names refer to the same thing for our taxonomy purposes. */
export function namesMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Singular/plural-insensitive ("Kurti" → "Kurtis", "Saree" → "Sarees")
  if (singular(na) === singular(nb)) return true;
  // Containment ("Kurti" ⊂ "Kurtis", "dress" ⊂ "dresse")
  if (na.includes(nb) || nb.includes(na)) return true;
  // Token overlap, singularized — "Ladies Suit" → "Salwar Suits" via "suit"
  const ta = na
    .split(' ')
    .map(singular)
    .filter((t) => t.length >= 3);
  const tb = nb
    .split(' ')
    .map(singular)
    .filter((t) => t.length >= 3);
  return ta.some((t) => tb.includes(t));
}

/**
 * Best candidate from `candidates` matching `needle`, or null. Returns the
 * first hit — candidates are usually already ordered (e.g. by sort_order),
 * and the exact-match path is covered by namesMatch's normalized equality.
 */
export function findBestMatch(needle: string, candidates: readonly string[]): string | null {
  for (const c of candidates) {
    if (namesMatch(needle, c)) return c;
  }
  return null;
}
