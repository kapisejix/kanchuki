import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type SocialProofWindow,
  favoritedChipText,
  fetchSocialProof,
  socialProofChip,
  viewedChipText,
} from '../socialProof';

// The client half of the honesty rule (§2 row 5): the API omits a product it
// has no real count for, and the storefront must render NOTHING for it — never
// "0 viewed", never a rounded or estimated stand-in.
const DAY_MS = 86_400_000;
const isoDaysAgo = (days: number) =>
  new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);

const window = (today: string | null, weekTo = today): SocialProofWindow => ({
  today,
  week_from: today,
  week_to: weekTo,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('socialProofChip — only products with a real count get a chip', () => {
  it('a product absent from the API map renders no chip at all', () => {
    // The whole point: absence is not zero. There is no count to show, so
    // there is nothing to render — not a muted chip, not a zero.
    expect(socialProofChip(undefined, window(isoDaysAgo(1)))).toBeNull();
    expect(socialProofChip({}, window(isoDaysAgo(1)))).toBeNull();
  });

  it('never renders a zero, even if one somehow arrives', () => {
    expect(socialProofChip({ viewed_today: 0 }, window(isoDaysAgo(1)))).toBeNull();
    expect(socialProofChip({ favorited_week: 0 }, window(isoDaysAgo(1)))).toBeNull();
    expect(
      socialProofChip({ viewed_today: 0, favorited_week: 0 }, window(isoDaysAgo(1))),
    ).toBeNull();
  });

  it('returns the real count and a label derived from the window', () => {
    expect(socialProofChip({ viewed_today: 8 }, window(isoDaysAgo(0)))).toEqual({
      kind: 'viewed',
      count: 8,
      label: '8 viewed today',
    });
    // The rollup summarizes completed days, so "yesterday" is the normal case —
    // and it must say so rather than claiming "today".
    expect(socialProofChip({ viewed_today: 8 }, window(isoDaysAgo(1)))).toEqual({
      kind: 'viewed',
      count: 8,
      label: '8 viewed yesterday',
    });
    expect(socialProofChip({ viewed_today: 8 }, window(isoDaysAgo(9)))).toEqual({
      kind: 'viewed',
      count: 8,
      label: '8 viewed recently',
    });
    expect(socialProofChip({ favorited_week: 3 }, window(isoDaysAgo(1), isoDaysAgo(1)))).toEqual({
      kind: 'favorited',
      count: 3,
      label: '3 saved this week',
    });
  });

  it('prefers the higher-intent favorite count when both exist', () => {
    expect(socialProofChip({ viewed_today: 40, favorited_week: 3 }, window(isoDaysAgo(1)))).toEqual(
      {
        kind: 'favorited',
        count: 3,
        label: '3 saved this week',
      },
    );
    // ...but falls back to the view count when there is no favorite count.
    expect(socialProofChip({ viewed_today: 4 }, window(isoDaysAgo(1)))).toEqual({
      kind: 'viewed',
      count: 4,
      label: '4 viewed yesterday',
    });
  });

  it('labels degrade without a window rather than inventing a date', () => {
    expect(viewedChipText(5, null)).toBe('5 viewed');
    expect(favoritedChipText(2, null)).toBe('2 saved');
    expect(socialProofChip({ viewed_today: 5 }, null)?.label).toBe('5 viewed');
  });
});

describe('fetchSocialProof', () => {
  it('asks for the store once and passes the slug through encoded', async () => {
    const fetchMock = vi.fn(async (_input: string) => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          products: { p1: { viewed_today: 8, favorited_week: 3 } },
          window: { today: '2026-09-27', week_from: '2026-09-21', week_to: '2026-09-27' },
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const proof = await fetchSocialProof('meera sarees');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/engagement-chips?store=meera%20sarees');
    expect(proof?.products.p1).toEqual({ viewed_today: 8, favorited_week: 3 });
    expect(proof?.window.today).toBe('2026-09-27');
  });

  it('resolves to null on a non-ok response, a malformed shape, or a network failure', async () => {
    // 404 (a store with no public slug) — no chips, no error surfaced.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
    expect(await fetchSocialProof('ghost')).toBeNull();

    // A 200 with no usable map (e.g. an unrecognised envelope) — same outcome,
    // rather than a crash partway through the grid.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: {} }) })),
    );
    expect(await fetchSocialProof('meera')).toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    expect(await fetchSocialProof('meera')).toBeNull();
  });
});
