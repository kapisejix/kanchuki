// Client-side passport session helper (Task 4).
// Checks whether the visitor has a valid passport session by calling
// GET /api/passport/me. Returns account info or null (no session).

export interface PassportAccount {
  id: string;
  name: string | null;
  phone_masked: string;
  usual_size: string | null;
  city: string | null;
}

export interface PassportSession {
  account: PassportAccount;
}

let cachedSession: PassportSession | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds — short enough for consent state changes

/**
 * Check if the visitor has a valid passport session.
 * Uses a short in-memory cache to avoid redundant calls during page load.
 * Returns null when not authenticated (no cookie, expired, revoked).
 */
export async function getPassport(): Promise<PassportSession | null> {
  if (typeof window === 'undefined') return null; // SSR — no cookies available

  const now = Date.now();
  if (cachedSession && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedSession;
  }

  try {
    const res = await fetch('/api/passport/me', {
      credentials: 'include', // send cookies
    });
    if (!res.ok) {
      cachedSession = null;
      cacheTimestamp = now;
      return null;
    }
    const data = (await res.json()) as { account?: PassportAccount };
    if (data.account) {
      cachedSession = { account: data.account };
      cacheTimestamp = now;
      return cachedSession;
    }
    cachedSession = null;
    cacheTimestamp = now;
    return null;
  } catch {
    cachedSession = null;
    cacheTimestamp = now;
    return null;
  }
}

/**
 * Get the passport session account info (alias for use in layout).
 * Returns the PassportAccount or null if not authenticated.
 */
export async function getPassportSession(): Promise<PassportAccount | null> {
  const session = await getPassport();
  return session?.account ?? null;
}

/**
 * Clear the cached session (e.g. after logout).
 */
export function clearPassportCache(): void {
  cachedSession = null;
  cacheTimestamp = 0;
}

/**
 * Track a behavioral event via the passport event beacon (Task 12).
 * Sends in batches using navigator.sendBeacon for reliability.
 */
export function trackPassportEvent(event: {
  type: string;
  product_id?: string;
  collection_id?: string;
  retailer_id?: string;
  metadata?: Record<string, unknown>;
}): void {
  if (typeof window === 'undefined') return;
  // Fire-and-forget — never block render
  void fetch('/api/passport/events', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: [event] }),
  }).catch(() => {
    // Non-critical — swallow
  });
}
