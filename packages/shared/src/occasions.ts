// AI-tagged product occasions (F-045 ranking input only: never a form field, a public
// filter or a shopper-facing fact). The spellings are what the My Style ranker compares
// (lowercased, exact match) and what the quiz in style-quiz.ts emits, so a new value here
// must also exist there, and vice versa (pinned by occasions.test.ts).

export const PRODUCT_OCCASIONS = [
  'Daily Wear',
  'Party Wear',
  'Festive',
  'Wedding',
  'Office Wear',
  'Casual',
] as const;

export const MAX_PRODUCT_OCCASIONS = 2;

/** Keep only canonical values (case-insensitive), deduped, capped. Anything else is dropped. */
export function normalizeOccasions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const canon = PRODUCT_OCCASIONS.find((o) => o.toLowerCase() === v.trim().toLowerCase());
    if (canon && !out.includes(canon)) out.push(canon);
  }
  return out.slice(0, MAX_PRODUCT_OCCASIONS);
}
