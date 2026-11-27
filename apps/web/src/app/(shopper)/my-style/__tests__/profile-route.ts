// Test helper: the page reads GET /api/my-style/profile beside the feed (Phase 1, R3). Page tests
// that only care about the feed stub fetch with this, so /profile is answered here and never
// reaches (or shifts the call counts of) their feed double.
import { vi } from 'vitest';

export type SavedProfile = { style_profile: unknown; measurements: unknown; taste: unknown };
export const EMPTY_PROFILE: SavedProfile = { style_profile: null, measurements: null, taste: null };

export function stubFetchWithProfile(
  feedMock: (url: string, init?: RequestInit) => unknown,
  profile: () => SavedProfile = () => EMPTY_PROFILE,
) {
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
    String(url).includes('/my-style/profile')
      ? Promise.resolve(new Response(JSON.stringify({ data: profile() }), { status: 200 }))
      : feedMock(url, init),
  );
}
