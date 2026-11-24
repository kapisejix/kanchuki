import { deleteItem, getItem, setItem } from './storage';

/**
 * 5B.2 — carry a `?ref=<CODE>` from an app link into onboarding.
 *
 * `kanchuki://onboarding?ref=CODE` (built by the web /for-retailers page) reaches a
 * phone that is usually NOT logged in yet, and /onboarding is an auth-protected
 * route, so expo-router can't deliver the param there. The root layout captures it
 * from the raw URL instead; onboarding reads it back to PREFILL the existing code
 * field. It never auto-submits, and the server still validates the code (T4).
 *
 * Play Install Referrer is not read: there is no Play Store listing yet (5B.1).
 */
const KEY = 'pending_referral_code';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Same shape the field accepts: uppercase, max 20, letters/digits/hyphen. */
export function parseReferralCode(url: string | null | undefined): string | null {
  // ponytail: regex, not URL — RN's URL polyfill has no searchParams.
  const raw = url?.match(/[?&]ref=([^&#]*)/)?.[1];
  if (!raw) return null;
  let code: string;
  try {
    code = decodeURIComponent(raw).trim().toUpperCase();
  } catch {
    return null;
  }
  return /^[A-Z0-9-]{3,20}$/.test(code) ? code : null;
}

export async function captureReferralFromUrl(url: string | null | undefined): Promise<void> {
  const code = parseReferralCode(url);
  if (code) await setItem(KEY, JSON.stringify({ code, at: Date.now() }));
}

/** The captured code, or null when none, unreadable, or older than 30 days. */
export async function getCapturedReferralCode(now = Date.now()): Promise<string | null> {
  try {
    const saved = JSON.parse((await getItem(KEY)) ?? 'null') as {
      code?: unknown;
      at?: unknown;
    } | null;
    if (typeof saved?.code !== 'string' || typeof saved.at !== 'number') return null;
    return now - saved.at <= MAX_AGE_MS ? saved.code : null;
  } catch {
    return null;
  }
}

export async function clearCapturedReferralCode(): Promise<void> {
  await deleteItem(KEY);
}
