// F-032 AI Studio Shoot — which styles a product may use (option matrix §4–§6).
//
// Hard rules only (the retailer cannot override them); the API enforces the same
// function the mobile UI filters with, so a stale client cannot reach a blocked
// generation. Product facts come from the AI-tagged row: category / subtype /
// name / product_type / is_unstitched.
import { type Demographic, demographicForCategory } from './constants/index.js';
import { MODEL_STYLES, PRODUCT_STYLES } from './studio-styles.js';

/**
 * A garment that is only ever the top half of an outfit. MODEL prompts describe
 * a full standing pose, so with nothing else in frame the model invents legs and
 * a bottom that is not in the photo — callers frame head-to-hip when this is true.
 */
const TOP_ONLY_RE = /\b(kurti|blouse|t-?shirt|tee|top|tunic|crop top|shirt)\b/i;
export function isTopOnlyGarment(...parts: (string | null | undefined)[]): boolean {
  return TOP_ONLY_RE.test(parts.filter(Boolean).join(' '));
}

export interface StudioProductInput {
  name?: string | null;
  category?: string | null;
  subtype?: string | null;
  product_type?: string | null;
  is_unstitched?: boolean | null;
}

export interface ProductProfile {
  demographic: Demographic;
  kids: boolean;
  /** Fabric pieces, not a made-up garment — nothing to put on a body or a model. */
  unstitched: boolean;
  /** Pant / palazzo / salwar on its own — no top, no set. */
  bottomsOnly: boolean;
  /** Model Only styles are offered at all. */
  modelAllowed: boolean;
  /** Torso dress-form styles (PS-03/04) make sense for this garment. */
  bodyFormOk: boolean;
}

const UNSTITCHED_RE = /\b(unstitched|dress material|fabric piece)\b/i;
const BOTTOM_RE =
  /\b(pants?|trousers?|palazzos?|plazzos?|salwars?|churidars?|leggings?|jeggings?|patiala|pajamas?|pyjamas?|bottoms?|skirts?|dhoti|sharara)\b/i;
// A bottom word inside a full set / top ("salwar suit", "kurta pajama") is not a bottom-only product.
const SET_RE =
  /\b(suit|set|kurta|kurti|top|dupatta|anarkali|gown|lehenga|saree|sari|blouse|choli|co-?ord)\b/i;

export function productProfile(p: StudioProductInput): ProductProfile {
  const text = [p.name, p.category, p.subtype].filter(Boolean).join(' ');
  const demographic = demographicForCategory(
    [p.category, p.subtype].filter(Boolean).join(' '),
    p.name,
  );
  const kids = demographic === 'kids_girl' || demographic === 'kids_boy';
  const unstitched =
    p.is_unstitched === true || p.product_type === 'Unstitched' || UNSTITCHED_RE.test(text);
  const bottomsOnly = !unstitched && BOTTOM_RE.test(text) && !SET_RE.test(text);
  return {
    demographic,
    kids,
    unstitched,
    bottomsOnly,
    modelAllowed: !kids && !unstitched && !bottomsOnly,
    bodyFormOk: !unstitched && !bottomsOnly,
  };
}

/** Product Only styles that hold the garment on a torso dress form — stitched tops/sets only (§4). */
const BODY_FORM_ONLY: ReadonlySet<string> = new Set(['PS-03', 'PS-04']);
/** Teen models never get these scenes (§5/§6). Penthouse was removed; Poolside is the live one. */
const TEEN_BLOCKED: ReadonlySet<string> = new Set(['MO-06']);

/**
 * Null when the style is allowed for this product, otherwise a retailer-safe reason.
 * `tab` is the `studio_styles.tab` of the row when known: it decides model-vs-product
 * even for older catalog slugs that don't follow the MI-/MO-/PS- id scheme.
 */
export function studioStyleBlock(
  styleId: string,
  profile: ProductProfile,
  tab?: 'PRODUCT' | 'MODEL',
): string | null {
  const id = styleId.toUpperCase();
  const isModel = tab ? tab === 'MODEL' : id.startsWith('MI-') || id.startsWith('MO-');
  if (isModel) {
    if (profile.kids) return "Model shoots are not available for kids' wear.";
    if (profile.unstitched) return 'Model shoots are not available for unstitched fabric.';
    if (profile.bottomsOnly) return 'Model shoots are not available for bottoms-only products.';
    if (
      TEEN_BLOCKED.has(id) &&
      (profile.demographic === 'teen_girl' || profile.demographic === 'teen_boy')
    )
      return 'This scene is not available for teen models.';
    return null;
  }
  if (BODY_FORM_ONLY.has(id) && !profile.bodyFormOk)
    return 'This style needs a stitched garment on a dress form.';
  return null;
}

/** Ids of every owner style this product may use. */
export function allowedStudioStyleIds(profile: ProductProfile): string[] {
  return [...PRODUCT_STYLES, ...MODEL_STYLES]
    .map((s) => s.id as string)
    .filter((id) => studioStyleBlock(id, profile) === null);
}
