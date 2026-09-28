import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MIN_FAVORITED_CHIP,
  MIN_VIEWED_CHIP,
  type SocialProofWindow,
  favoritedChipText,
  fetchSocialProof,
  socialProofChip,
  useSocialProof,
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

// The two floors are deliberately different heights, and this block exists so a
// future "simplify by using one threshold" edit has to argue with a test rather
// than slip through.
describe('socialProofChip — minimum counts', () => {
  it('suppresses a lone or near-lone view count instead of shipping it', () => {
    // "1 viewed yesterday" is the exact chip this floor exists to prevent: one
    // passive look is indistinguishable from noise, so the chip would argue
    // against the product. Below the floor the card renders nothing at all.
    expect(socialProofChip({ viewed_today: 1 }, window(isoDaysAgo(1)))).toBeNull();
    expect(socialProofChip({ viewed_today: 2 }, window(isoDaysAgo(1)))).toBeNull();

    // At the floor it renders, showing the real count.
    expect(socialProofChip({ viewed_today: MIN_VIEWED_CHIP }, window(isoDaysAgo(1)))).toEqual({
      kind: 'viewed',
      count: 3,
      label: '3 viewed yesterday',
    });
  });

  it('renders on a single save, because a save is deliberate', () => {
    expect(socialProofChip({ favorited_week: 1 }, window(isoDaysAgo(1)))).toEqual({
      kind: 'favorited',
      count: 1,
      label: '1 saved this week',
    });
  });

  it('keeps the view floor above the favorite floor', () => {
    // The asymmetry is the design, not an accident: passive looks need more
    // corroboration than deliberate saves. Collapsing the two to one number
    // would either hide real single saves or re-ship the "1 viewed" chip.
    expect(MIN_VIEWED_CHIP).toBeGreaterThan(MIN_FAVORITED_CHIP);
  });

  it('lets a real save outrank a below-floor view count', () => {
    // The floors are applied per signal, so a weak view must not block a strong
    // save from rendering.
    expect(socialProofChip({ viewed_today: 1, favorited_week: 1 }, window(isoDaysAgo(1)))).toEqual(
      {
        kind: 'favorited',
        count: 1,
        label: '1 saved this week',
      },
    );
  });
});

describe('useSocialProof', () => {
  it('fetches the store once and exposes the map', async () => {
    const fetchMock = vi.fn(async (_input: string) => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          products: { p1: { viewed_today: 8 } },
          window: { today: '2026-09-27', week_from: '2026-09-21', week_to: '2026-09-27' },
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSocialProof('meera'));
    await waitFor(() => expect(result.current?.products.p1).toEqual({ viewed_today: 8 }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches nothing without a slug, so a store-less surface costs no request', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSocialProof(null));
    expect(result.current).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays null when the store has no counts, rather than throwing', async () => {
    // A weak assertion by nature — the failure path is observable only as "did
    // not crash and did not invent chips". It is here as a crash guard, since
    // this hook now runs on a live product page as well as the grid.
    const fetchMock = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSocialProof('ghost'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBeNull();
  });
});
