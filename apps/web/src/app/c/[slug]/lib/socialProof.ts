// Real social-proof chip counts for the customer storefront grid — F-037 §2
// row 5 ("real counts only, never fabricated").
//
// Fetched ONCE per collection load and shared by every card, not once per
// product: the API answers for the whole store, so a 12-card page is one
// request. Products the API has no real count for simply get no chip — the map
// is sparse by design (only each day's top-10 viewed / top-10 favorited
// products are stored), and a missing key means "did not make the top 10",
// which is NOT the same fact as zero.

/** Both optional: a present key is a real summed count, a missing key is
 *  "no count to show" — never rendered as 0. */
export interface SocialProofCounts {
  viewed_today?: number;
  favorited_week?: number;
}

/** The UTC day window the counts actually cover. The nightly rollup
 *  summarizes completed days only, so `today` is normally yesterday — the
 *  labels below are derived from this rather than hardcoding "today". */
export interface SocialProofWindow {
  today: string | null;
  week_from: string | null;
  week_to: string | null;
}

export interface SocialProof {
  products: Record<string, SocialProofCounts>;
  window: SocialProofWindow;
}

export interface SocialProofChip {
  kind: 'favorited' | 'viewed';
  count: number;
  label: string;
}

// Bounded, like every other outbound call in this repo (RC-011's lesson) — a
// hung chips read must never leave the grid waiting on a promise.
const FETCH_TIMEOUT_MS = 10_000;

const DAY_MS = 86_400_000;

/** UTC day number for a `YYYY-MM-DD` string, or null when absent/unparseable. */
function utcDayNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(parsed) ? null : Math.floor(parsed / DAY_MS);
}

function todayUtcDayNumber(): number {
  const now = new Date();
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / DAY_MS);
}

function ageInDays(value: string | null | undefined): number | null {
  const dayNumber = utcDayNumber(value);
  return dayNumber === null ? null : todayUtcDayNumber() - dayNumber;
}

/**
 * Read the store's chip counts. Never throws and never resolves to partial
 * data: any failure (offline, 404, proxy 5xx, a shape we don't recognise)
 * yields null, and a null proof renders no chips at all.
 */
export async function fetchSocialProof(storeSlug: string): Promise<SocialProof | null> {
  try {
    const res = await fetch(`/api/engagement-chips?store=${encodeURIComponent(storeSlug)}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Partial<SocialProof> } | null;
    const data = json?.data;
    if (!data || typeof data.products !== 'object' || data.products === null) return null;
    return {
      products: data.products as Record<string, SocialProofCounts>,
      window: data.window ?? { today: null, week_from: null, week_to: null },
    };
  } catch {
    return null;
  }
}

/** "8 viewed today" / "8 viewed yesterday" / "8 viewed recently" — chosen from
 *  the window the count covers, so the chip never asserts a date the rollup
 *  cannot back up. */
export function viewedChipText(count: number, window: SocialProofWindow | null): string {
  const daysAgo = ageInDays(window?.today);
  if (daysAgo === null) return `${count} viewed`;
  if (daysAgo <= 0) return `${count} viewed today`;
  if (daysAgo === 1) return `${count} viewed yesterday`;
  return `${count} viewed recently`;
}

/** "3 saved this week" / "3 saved recently" — same rule as above. */
export function favoritedChipText(count: number, window: SocialProofWindow | null): string {
  const daysAgo = ageInDays(window?.week_to);
  if (daysAgo === null) return `${count} saved`;
  return daysAgo <= 1 ? `${count} saved this week` : `${count} saved recently`;
}

/**
 * The one chip a card should render for this product, or null when there is no
 * real count to show — in which case the card renders nothing.
 *
 * Favorited wins when both exist: it is the higher-intent signal of the two,
 * and the spec's own example copy uses it. A non-positive count is treated as
 * absent rather than displayed — a chip is only ever evidence, never a
 * placeholder.
 */
export function socialProofChip(
  counts: SocialProofCounts | undefined,
  window: SocialProofWindow | null,
): SocialProofChip | null {
  if (!counts) return null;
  if (typeof counts.favorited_week === 'number' && counts.favorited_week > 0) {
    return {
      kind: 'favorited',
      count: counts.favorited_week,
      label: favoritedChipText(counts.favorited_week, window),
    };
  }
  if (typeof counts.viewed_today === 'number' && counts.viewed_today > 0) {
    return {
      kind: 'viewed',
      count: counts.viewed_today,
      label: viewedChipText(counts.viewed_today, window),
    };
  }
  return null;
}
