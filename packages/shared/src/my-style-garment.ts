// F-045 PR-9 — "find similar": what a garment photo may be read into.
//
// A garment descriptor is NOT personal data about the shopper: it describes a piece of
// clothing in our own tagging taxonomy. It is held by the client for the session and sent
// back with the feed request; nothing here is stored. Enums only, so a model reply (or a
// hand-built feed request) cannot carry free text into the embedding or the ranking.
import {
  EMBELLISHMENT_TYPES,
  PATTERN_TYPES,
  PRODUCT_CATEGORIES,
  PRODUCT_TYPES,
} from './constants/index.js';

/** Why a garment photo could not be read — an enum, same reasoning as the selfie reasons. */
export const MY_STYLE_GARMENT_UNUSABLE_REASONS = [
  'no_garment',
  'blurry',
  'multiple_garments',
] as const;

/** `None` is the absence of an embellishment: an empty array says it. */
export const GARMENT_EMBELLISHMENTS = EMBELLISHMENT_TYPES.filter((e) => e !== 'None');

const MAX_EMBELLISHMENTS = 3;
/** Colour family names are admin-edited DB rows, so the shape is checked, not the list. */
const FAMILY_SHAPE = /^[A-Za-z][A-Za-z -]{0,39}$/;

export interface GarmentDescriptor {
  category: (typeof PRODUCT_CATEGORIES)[number];
  product_type?: (typeof PRODUCT_TYPES)[number];
  color_family: string;
  pattern?: (typeof PATTERN_TYPES)[number];
  embellishments: (typeof GARMENT_EMBELLISHMENTS)[number][];
}

/**
 * Ranking blend for find-similar (docs/tasks/pending/my-style.md §3.4). Constants with a
 * unit test, not admin knobs: they are untuned guesses until real feed data exists.
 *  - fitShare: how much of `fit` similarity takes over when a descriptor is present.
 *  - embeddingShare: inside similarity, the weight of the embedding vs attribute overlap
 *    (a product with no embedding uses attribute overlap alone).
 *  - cosLo/cosHi: cosine range mapped onto 0..1; short-text embeddings of related items sit
 *    well below 1.
 */
export const MY_STYLE_SIMILAR = {
  fitShare: 0.5,
  embeddingShare: 0.5,
  cosLo: 0.25,
  cosHi: 0.75,
} as const;

const oneOf = <T extends readonly string[]>(list: T, v: unknown): v is T[number] =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

const KEYS = new Set(['category', 'product_type', 'color_family', 'pattern', 'embellishments']);

/** Validate untrusted input (model reply or request body). Null = not a descriptor. */
export function parseGarmentDescriptor(raw: unknown): GarmentDescriptor | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).some((k) => !KEYS.has(k))) return null;

  if (!oneOf(PRODUCT_CATEGORIES, r.category)) return null;
  if (typeof r.color_family !== 'string' || !FAMILY_SHAPE.test(r.color_family)) return null;
  if (r.product_type != null && !oneOf(PRODUCT_TYPES, r.product_type)) return null;
  if (r.pattern != null && !oneOf(PATTERN_TYPES, r.pattern)) return null;

  const emb = r.embellishments ?? [];
  if (!Array.isArray(emb) || emb.length > MAX_EMBELLISHMENTS) return null;
  if (!emb.every((e) => oneOf(GARMENT_EMBELLISHMENTS, e))) return null;

  return {
    category: r.category,
    ...(r.product_type != null ? { product_type: r.product_type } : {}),
    color_family: r.color_family.toLowerCase(),
    ...(r.pattern != null ? { pattern: r.pattern } : {}),
    embellishments: (emb as GarmentDescriptor['embellishments']).filter(
      (e, i, all) => all.indexOf(e) === i,
    ),
  };
}
