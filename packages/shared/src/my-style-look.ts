// F-045 PR-10b (docs/tasks/pending/my-style.md §7, T22): "Complete the look" vocabulary.
// Pure and shared so the API and its tests read one map.
//
// `products.category` is a free-text AI tag, not a slug taxonomy, so matching is keyword
// containment on lowercased category/subtype. There is no jewellery category: it is left out
// rather than invented, and an anchor with no mapped complement answers "nothing nearby".

export interface LookProduct {
  category: string | null;
  subtype: string | null;
}

export type LookAnchorKind = 'suit' | 'saree' | 'lehenga' | 'blouse' | 'dupatta';

export interface LookSlot {
  key: string;
  label: string;
  /** A product fits when its category (or subtype, see withSubtype) contains any of these. */
  keywords: readonly string[];
  /** Match the subtype too. Off by default: a suit whose subtype says "with dupatta" is a suit. */
  withSubtype?: true;
}

export const LOOK_SLOTS = {
  dupatta: { key: 'dupatta', label: 'Dupattas', keywords: ['dupatta', 'stole', 'shawl'] },
  // ponytail: no "bottom" AI category exists; subtype keywords only. A suit set whose subtype
  // names a palazzo can match. Upgrade path: a tagged `bottom` category.
  bottom: {
    key: 'bottom',
    label: 'Bottoms',
    keywords: ['palazzo', 'sharara', 'pant', 'churidar', 'bottom', 'legging'],
    withSubtype: true,
  },
  blouse: { key: 'blouse', label: 'Blouses', keywords: ['blouse', 'choli'] },
  saree: { key: 'saree', label: 'Sarees', keywords: ['saree', 'sari'] },
  suit: { key: 'suit', label: 'Suits & kurtis', keywords: ['suit', 'kurti', 'kurta', 'anarkali'] },
} as const satisfies Record<string, LookSlot>;

export const COMPLEMENT_MAP: Record<LookAnchorKind, readonly LookSlot[]> = {
  suit: [LOOK_SLOTS.dupatta, LOOK_SLOTS.bottom],
  saree: [LOOK_SLOTS.blouse],
  lehenga: [LOOK_SLOTS.dupatta, LOOK_SLOTS.blouse],
  blouse: [LOOK_SLOTS.saree],
  dupatta: [LOOK_SLOTS.suit],
};

// First match wins, so the narrow garments come before the broad "suit".
const ANCHOR_PATTERNS: readonly [LookAnchorKind, RegExp][] = [
  ['dupatta', /dupatta|stole|shawl|scarf/],
  ['blouse', /blouse|choli/],
  ['lehenga', /lehenga/],
  ['saree', /saree|sari/],
  ['suit', /suit|salwar|kurti|kurta|anarkali|churidar/],
];
// Men's and kids' wear do not complete with the ladies' slots above ("women" has no \bmen).
const NOT_LADIES = /\bmen|sherwani|kids?\b|boy|girl|child/;

/** Category first (reliable), subtype only when the category says nothing. Null = unmapped. */
export function classifyAnchor(p: LookProduct): LookAnchorKind | null {
  for (const field of [p.category, p.subtype]) {
    const t = field?.toLowerCase().trim();
    if (!t) continue;
    if (NOT_LADIES.test(t)) return null;
    const hit = ANCHOR_PATTERNS.find(([, re]) => re.test(t));
    if (hit) return hit[0];
  }
  return null;
}

export function matchesSlot(p: LookProduct, slot: LookSlot): boolean {
  const text = `${p.category ?? ''} ${slot.withSubtype ? (p.subtype ?? '') : ''}`.toLowerCase();
  return slot.keywords.some((k) => text.includes(k));
}

/** Neutrals sit with any colour. */
export const NEUTRAL_FAMILIES = ['white', 'cream', 'beige', 'black', 'grey', 'gold', 'silver'] as const;

/**
 * Hand-written pairings over the `color_families` names (see color-family.ts). Not a colour
 * theory engine: a short, reviewable starting table. Same family (tonal) and neutrals are
 * added by `complementFamilies`. `multi` has no entry: only neutrals and itself.
 */
export const COMPLEMENTARY_COLORS: Record<string, readonly string[]> = {
  red: ['green', 'teal', 'navy'],
  maroon: ['olive', 'teal', 'peach'],
  pink: ['green', 'teal', 'navy', 'olive'],
  magenta: ['green', 'teal', 'yellow'],
  peach: ['teal', 'maroon', 'navy'],
  orange: ['blue', 'teal', 'navy', 'purple'],
  yellow: ['purple', 'navy', 'magenta'],
  green: ['pink', 'magenta', 'maroon', 'orange'],
  olive: ['maroon', 'peach', 'orange', 'brown'],
  teal: ['maroon', 'magenta', 'orange', 'red'],
  blue: ['orange', 'peach', 'yellow', 'brown'],
  navy: ['pink', 'peach', 'yellow', 'orange'],
  purple: ['yellow', 'green', 'peach'],
  brown: ['teal', 'olive', 'orange', 'blue'],
};

/**
 * Families that go with the anchor's colour, for the ranker's colour boost. [] = no
 * preference (unknown colour, or a neutral anchor that goes with everything).
 */
export function complementFamilies(family: string | null): string[] {
  const f = family?.trim().toLowerCase();
  if (!f) return [];
  if ((NEUTRAL_FAMILIES as readonly string[]).includes(f)) return [];
  return Array.from(new Set([f, ...(COMPLEMENTARY_COLORS[f] ?? []), ...NEUTRAL_FAMILIES]));
}

/** Items shown per slot. */
export const LOOK_SLOT_LIMIT = 6;
