// AI-tagged product occasions (F-045 ranking input only: never a form field, a public
// filter or a shopper-facing fact). The spellings are what the My Style ranker compares
// (lowercased, exact match) and what the quiz in style-quiz.ts emits, so a new value here
// must also exist there, and vice versa (pinned by occasions.test.ts).

export const PRODUCT_OCCASIONS = [
  'Daily Wear',
  'Party Wear',
  'Festive',
  'Wedding',
] as const;

export const MAX_PRODUCT_OCCASIONS = 2;

// Office Wear and Casual were folded into Daily Wear (owner: they mean the same thing for a
// shopper, and the model never separated them). Aliases keep old rows and old replies valid.
const LEGACY_ALIASES: Record<string, (typeof PRODUCT_OCCASIONS)[number]> = {
  'office wear': 'Daily Wear',
  casual: 'Daily Wear',
};

/** Keep only canonical values (case-insensitive), deduped, capped. Anything else is dropped. */
export function normalizeOccasions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const key = v.trim().toLowerCase();
    const canon = LEGACY_ALIASES[key] ?? PRODUCT_OCCASIONS.find((o) => o.toLowerCase() === key);
    if (canon && !out.includes(canon)) out.push(canon);
  }
  return out.slice(0, MAX_PRODUCT_OCCASIONS);
}
