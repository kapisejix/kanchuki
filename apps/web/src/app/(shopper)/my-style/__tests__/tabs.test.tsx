// F-045 PR-10a: the Festival / Occasion / Trending tabs on /my-style.
//
// What matters: extra tabs exist only when the feed says something is behind them; the
// Occasion tab sends the canonical name and never labels a card with an occasion (occasions
// are a ranking input, not a shopper-facing fact); a tab that loses its data falls back.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MyStylePage from '../page';

const fetchMock = vi.fn();

const card = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  name: 'Wine Silk Suit',
  price_min: 210000,
  price_max: 210000,
  primary_photo_url: 'https://img.test/p1.jpg',
  distance_km: 3.2,
  retailer: { shop_name: 'Shree Sarees', slug: 'shree-sarees', city: 'Surat' },
  ...over,
});

function feed(meta: Record<string, unknown> = {}, data: unknown[] = [card()]) {
  return new Response(
    JSON.stringify({
      data,
      meta: {
        total: data.length,
        page: 1,
        limit: 12,
        sort: 'best',
        location_scope: 'city',
        rationale_source: 'none',
        truncated: false,
        ...meta,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

const lastBody = () =>
  JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string);
const tabBar = () => screen.getByRole('navigation', { name: 'Feed tabs' });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  window.scrollTo = vi.fn();
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('tab bar', () => {
  it('shows only For you and Occasion when the feed reports no festival and no trends', async () => {
    fetchMock.mockResolvedValue(feed({ tabs: { festival: null, trending: false } }));
    render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');
    const names = within(tabBar())
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names).toEqual(['For you', 'Occasion']);
    expect(lastBody()).toMatchObject({ tab: 'foryou' });
  });

  it('shows the festival by name and Trending when present; a tab click re-requests page 1', async () => {
    fetchMock.mockResolvedValue(feed({ tabs: { festival: { name: 'Navratri' }, trending: true } }));
    render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');
    expect(
      within(tabBar())
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['For you', 'Navratri', 'Occasion', 'Trending']);

    fireEvent.click(within(tabBar()).getByRole('button', { name: 'Trending' }));
    await waitFor(() => expect(lastBody()).toMatchObject({ tab: 'trending', page: 1 }));
  });

  it('falls back to For you when the open tab loses its data', async () => {
    fetchMock.mockResolvedValueOnce(
      feed({ tabs: { festival: { name: 'Navratri' }, trending: false } }),
    );
    render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');

    fetchMock.mockResolvedValue(feed({ tabs: { festival: null, trending: false } }, []));
    fireEvent.click(within(tabBar()).getByRole('button', { name: 'Navratri' }));
    await waitFor(() => expect(lastBody()).toMatchObject({ tab: 'foryou' }));
  });

  it('says so when the Trending tab is empty (no canned content)', async () => {
    fetchMock.mockResolvedValueOnce(feed({ tabs: { festival: null, trending: true } }));
    render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');

    fetchMock.mockResolvedValue(feed({ tabs: { festival: null, trending: true } }, []));
    fireEvent.click(within(tabBar()).getByRole('button', { name: 'Trending' }));
    expect(await screen.findByText(/Nothing trending near you/)).toBeTruthy();
  });
});

describe('Occasion tab', () => {
  async function openOccasionTab(first: Record<string, unknown> = {}) {
    fetchMock.mockResolvedValueOnce(feed({ tabs: { festival: null, trending: false } }));
    render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');
    fetchMock.mockResolvedValue(feed({ occasion_matches: null, ...first }));
    fireEvent.click(within(tabBar()).getByRole('button', { name: 'Occasion' }));
    await waitFor(() => expect(lastBody()).toMatchObject({ tab: 'occasion' }));
  }

  it('offers the four canonical occasions and sends the picked one unmodified', async () => {
    await openOccasionTab();
    const chips = within(screen.getByRole('group', { name: 'Occasion' }));
    expect(chips.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Daily Wear',
      'Party Wear',
      'Festive',
      'Wedding',
    ]);
    expect(lastBody().occasion).toBeUndefined();

    fireEvent.click(chips.getByRole('button', { name: 'Wedding' }));
    await waitFor(() => expect(lastBody()).toMatchObject({ tab: 'occasion', occasion: 'Wedding' }));
  });

  it('tells the shopper honestly when nothing is tagged, and still shows the feed', async () => {
    await openOccasionTab();
    fetchMock.mockResolvedValue(feed({ occasion_matches: 0 }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Occasion' })).getByRole('button', { name: 'Wedding' }),
    );
    expect(await screen.findByText(/Nothing near you is marked for Wedding yet/)).toBeTruthy();
    expect(screen.getByText('Wine Silk Suit')).toBeTruthy();
  });

  it('never prints an occasion on a card, even when the API sends one', async () => {
    await openOccasionTab();
    fetchMock.mockResolvedValue(
      feed({ occasion_matches: 1 }, [card({ occasions: ['Wedding'], tags: ['Festive'] })]),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Occasion' })).getByRole('button', { name: 'Wedding' }),
    );
    const item = (await screen.findByText('Wine Silk Suit')).closest('li')!;
    expect(item.textContent).not.toMatch(/wedding|festive|party wear|daily wear/i);
  });
});
