import { getSetting } from '../routes/admin-settings/settings-store.js';

// Admin kill switch for Kanchuki-staff support sessions
// (docs/tasks/pending/support-session-access.md §8). Default OFF; enforced
// server-side on request, token mint, and every support-token request in
// auth.ts — turning it off ends live sessions on their next call.
//
// Stored in the same audit-log key/value store as the other admin settings.
// getSetting() returns null on a read failure, so a DB hiccup fails CLOSED.

export const SUPPORT_SESSIONS_SETTING_KEY = 'support_sessions_enabled';

// Short cache: this is read on every support-token request. 5 s is the worst-
// case kill-switch latency on other instances; the writer clears its own.
const CACHE_MS = 5_000;
let cached: { value: boolean; at: number } | null = null;

export async function supportSessionsEnabled(): Promise<boolean> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const saved = await getSetting(SUPPORT_SESSIONS_SETTING_KEY);
  const value = saved?.enabled === true;
  cached = { value, at: Date.now() };
  return value;
}

export function clearSupportSessionsFlagCache(): void {
  cached = null;
}
