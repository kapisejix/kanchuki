// F-045 PR-10b: the "Complete the look" tab on /my-style.
//
// What matters: the tab does not exist until a piece is picked; picking one asks the API for
// THAT piece's look (and does not refetch the feed); an unmapped garment, an empty
// neighbourhood and a sold anchor each say so plainly instead of showing filler; the anchor
// survives a reload (sessionStorage) and a ?look= link opens the tab directly.
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const feed = () =>
  json({
    data: [card()],
    meta: {
      total: 1,
      page: 1,
      limit: 12,
      sort: 'best',
      location_scope: 'city',
      rationale_source: 'none',
      truncated: false,
    },
  });

const look = (slots: unknown[], reason: string | null = null) =>
  json({
    data: { anchor: { id: 'p1', name: 'Wine Silk Suit' }, slots },
    meta: { reason, location_scope: 'city', truncated: false },
  });

const dupattas = {
  key: 'dupatta',
  label: 'Dupattas',
  items: [card({ id: 'd1', name: 'Green Dupatta', price_min: 90000, price_max: 90000 })],
};

// Feed calls are POSTs to /feed, look calls are GETs to /complete-look.
const lookCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).includes('complete-look'));
const feedCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).includes('/feed'));
const tabBar = () => screen.getByRole('navigation', { name: 'Feed tabs' });

function routeFetch(lookRes: () => Response) {
  fetchMock.mockImplementation((u: string) =>
    Promise.resolve(String(u).includes('complete-look') ? lookRes() : feed()),
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  window.scrollTo = vi.fn();
  window.sessionStorage.clear();
  window.history.pushState({}, '', '/my-style');
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('Complete the look', () => {
  it('has no tab until a piece is picked, then asks for that piece and shows the slots', async () => {
    routeFetch(() => look([dupattas]));
    render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');
    expect(
      within(tabBar())
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).not.toContain('Complete the look');

    const feedBefore = feedCalls().length;
    fireEvent.click(screen.getByRole('button', { name: 'Complete the look' }));

    await screen.findByText('Green Dupatta');
    expect(screen.getByRole('region', { name: 'Dupattas' })).toBeInTheDocument();
    expect(String(lookCalls().at(-1)?.[0])).toContain('anchor=p1');
    // The look tab replaces the feed grid and does not refetch it.
    expect(feedCalls()).toHaveLength(feedBefore);
    expect(within(tabBar()).getByRole('button', { name: 'Complete the look' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(window.sessionStorage.getItem('my-style:look-anchor')).toBe('p1');
  });

  it('says so when nothing near the shopper goes with the piece', async () => {
    routeFetch(() => look([], 'none_nearby'));
    render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');
    fireEvent.click(screen.getByRole('button', { name: 'Complete the look' }));
    await screen.findByText(/Nothing near you goes with this piece yet/);
  });

  it('a sold or deleted anchor says so and offers the way back to the feed', async () => {
    routeFetch(() => json({ error: { code: 'ANCHOR_UNAVAILABLE' } }, 404));
    render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');
    fireEvent.click(screen.getByRole('button', { name: 'Complete the look' }));
    await screen.findByText('That piece is no longer available.');

    fireEvent.click(screen.getByRole('button', { name: 'Back to your feed' }));
    await waitFor(() =>
      expect(within(tabBar()).getByRole('button', { name: 'For you' })).toHaveAttribute(
        'aria-current',
        'page',
      ),
    );
  });

  it('a server error offers a retry', async () => {
    let calls = 0;
    routeFetch(() => (++calls === 1 ? json({}, 500) : look([dupattas])));
    render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');
    fireEvent.click(screen.getByRole('button', { name: 'Complete the look' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await screen.findByText('Green Dupatta');
  });

  it('?look=<id> opens the tab straight away', async () => {
    window.history.pushState({}, '', '/my-style?look=abc');
    routeFetch(() => look([dupattas]));
    render(<MyStylePage />);
    await screen.findByText('Green Dupatta');
    expect(String(lookCalls().at(-1)?.[0])).toContain('anchor=abc');
  });

  it('remembers the last anchor for the session but opens on the feed', async () => {
    window.sessionStorage.setItem('my-style:look-anchor', 'p9');
    routeFetch(() => look([dupattas]));
    render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');
    const t = within(tabBar()).getByRole('button', { name: 'Complete the look' });
    expect(t).not.toHaveAttribute('aria-current');
    fireEvent.click(t);
    await screen.findByText('Green Dupatta');
    expect(String(lookCalls().at(-1)?.[0])).toContain('anchor=p9');
  });

  it('a shortlisted piece can start a look too', async () => {
    routeFetch(() => look([dupattas]));
    render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');
    fireEvent.click(screen.getByRole('button', { name: 'Shortlist' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Complete the look for Wine Silk Suit' }),
    );
    await screen.findByText('Green Dupatta');
    expect(String(lookCalls().at(-1)?.[0])).toContain('anchor=p1');
  });
});
