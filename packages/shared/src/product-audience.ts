// Who a product is for, set by the retailer (or pre-filled by the AI tagger). NULL means
// "adult unisex / not decided": the My Style feed falls back to the keyword rule for those rows.
// Mirrors the Prisma enums ProductAudience / KidsAgeGroup (migration 160).
import { KIDS_KEYWORDS } from './my-style-look.js';

export const PRODUCT_AUDIENCES = ['WOMEN', 'MEN', 'BOYS', 'GIRLS', 'KIDS_UNISEX'] as const;
export type ProductAudienceValue = (typeof PRODUCT_AUDIENCES)[number];

export const KIDS_AGE_GROUPS = [
  'NEW_BORN',
  'AGE_0_2',
  'AGE_3_5',
  'AGE_6_8',
  'AGE_9_12',
  'AGE_13_16',
] as const;
export type KidsAgeGroupValue = (typeof KIDS_AGE_GROUPS)[number];

export const AUDIENCE_LABELS: Record<ProductAudienceValue, string> = {
  WOMEN: 'Women',
  MEN: 'Men',
  BOYS: 'Boys',
  GIRLS: 'Girls',
  KIDS_UNISEX: 'Kids unisex',
};

// The "0–2 yrs" style strings are what the My Style KidsForm shows; keep them identical.
export const AGE_GROUP_LABELS: Record<KidsAgeGroupValue, string> = {
  NEW_BORN: 'New born',
  AGE_0_2: '0–2 yrs',
  AGE_3_5: '3–5 yrs',
  AGE_6_8: '6–8 yrs',
  AGE_9_12: '9–12 yrs',
  AGE_13_16: '13–16 yrs',
};

export function isKidsAudience(a: ProductAudienceValue | null | undefined): boolean {
  return a === 'BOYS' || a === 'GIRLS' || a === 'KIDS_UNISEX';
}

const MENS =
  /\b(men'?s|mens|gents?|male|sherwani|nehru jacket|bandhgala|pathani|menswear|waistcoat|kurta paja?ma|kurta pyjama|dhoti kurta)\b/;
const WOMENS =
  /\b(women'?s|woman|ladies|lady|saree|sari|lehenga|choli|kurti|anarkali|sharara|salwar|blouse|gown)\b/;

/** Best guess from free text; null when unsure (a guess the retailer can always change). */
export function audienceForText(
  category?: string | null,
  subtype?: string | null,
  name?: string | null,
): ProductAudienceValue | null {
  const s = `${category ?? ''} ${subtype ?? ''} ${name ?? ''}`.toLowerCase();
  if (KIDS_KEYWORDS.some((k) => s.includes(k))) {
    const girl = s.includes('girl');
    const boy = s.includes('boy');
    if (girl && !boy) return 'GIRLS';
    if (boy && !girl) return 'BOYS';
    return 'KIDS_UNISEX';
  }
  const women = WOMENS.test(s);
  if (MENS.test(s) && !women) return 'MEN';
  if (women) return 'WOMEN';
  return null;
}

/** The audiences a "For my child" Girl/Boy pick may match; unisex matches both. */
export function kidsAudiencesFor(who: 'Girl' | 'Boy'): ProductAudienceValue[] {
  return who === 'Girl' ? ['GIRLS', 'KIDS_UNISEX'] : ['BOYS', 'KIDS_UNISEX'];
}

/** Maps a KidsForm age label ("3–5 yrs") to the stored enum value. */
export function ageGroupFromLabel(label: string): KidsAgeGroupValue | null {
  return KIDS_AGE_GROUPS.find((g) => AGE_GROUP_LABELS[g] === label) ?? null;
}
