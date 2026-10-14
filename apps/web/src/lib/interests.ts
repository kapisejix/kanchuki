// Device-local shopper interests — what they viewed or searched on Kanchuki.
// localStorage only: never sent anywhere, works for anonymous visitors, and the
// homepage "Picked for you" row reads it client-side. Newest term first, capped.
const KEY = 'kanchuki_interests';
const MAX_TERMS = 40;

function read(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

export function recordInterest(terms: (string | null | undefined)[]): void {
  if (typeof window === 'undefined') return;
  const clean = terms
    .map((t) => t?.trim().toLowerCase())
    .filter((t): t is string => !!t && t.length > 1);
  if (clean.length === 0) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...clean, ...read()].slice(0, MAX_TERMS)));
  } catch {
    // storage full / blocked — personalisation just stays off
  }
}

/** Most frequent recent terms; ties go to the more recent one. */
export function topInterests(limit = 5): string[] {
  const counts = new Map<string, number>();
  for (const t of read()) counts.set(t, (counts.get(t) ?? 0) + 1);
  const order = new Map(
    read()
      .map((t, i) => [t, i] as const)
      .reverse(),
  ); // first index wins
  return Array.from(counts.keys())
    .sort(
      (a, b) =>
        (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || (order.get(a) ?? 0) - (order.get(b) ?? 0),
    )
    .slice(0, limit);
}

/** How many interest terms appear in this product's text fields. */
export function interestScore(fields: (string | null | undefined)[], interests: string[]): number {
  const text = fields.filter(Boolean).join(' ').toLowerCase();
  return interests.reduce((n, term) => (text.includes(term) ? n + 1 : n), 0);
}
