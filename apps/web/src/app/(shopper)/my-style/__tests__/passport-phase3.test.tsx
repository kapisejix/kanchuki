// Phase 3 on /my-style: "why this matches" chips, the show-all-wear toggle (D6), and the deep
// links the Style Passport on /my-profile uses (?retake=1, ?palette=1).
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StyleCard } from '../StyleCard';
import type { FeedCard } from '../lib';
import { reasonLabel } from '../lib';
import MyStylePage from '../page';
import { EMPTY_PROFILE, stubFetchWithProfile } from './profile-route';

vi.mock('../shortlist', async (orig) => ({
  ...(await orig<typeof import('../shortlist')>()),
  fetchShortlist: async () => null,
  moveDeviceShortlist: async () => {},
}));

const fetchMock = vi.fn();

const card = (over: Partial<FeedCard> = {}): FeedCard => ({
  id: 'p1',
  name: 'Wine Silk Suit',
  price_min: 210000,
  price_max: 210000,
  primary_photo_url: 'https://img.test/p1.jpg',
  distance_km: 1.2,
  retailer: { shop_name: 'Shree', slug: 'shree', city: 'Surat' },
  ...over,
});

const feed = (meta: Record<string, unknown> = {}, data: unknown[] = [card()]) =>
  new Response(
    JSON.stringify({
      data,
      meta: { total: 1, page: 1, limit: 12, location_scope: 'city', rationale_source: 'rules', ...meta },
    }),
    { status: 200 },
  );

const feedBodies = () =>
  fetchMock.mock.calls
    .filter(([u]) => u === '/api/my-style/feed')
    .map(([, i]) => JSON.parse((i as RequestInit).body as string));

beforeEach(() => {
  stubFetchWithProfile(fetchMock, () => EMPTY_PROFILE);
  window.scrollTo = vi.fn();
  window.history.pushState({}, '', '/my-style');
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('reasonLabel', () => {
  it.each([
    [{ code: 'palette' }, 'Your colour'],
    [{ code: 'occasion', detail: 'Festive' }, 'For Festive'],
    [{ code: 'color' }, 'Colour you like'],
    [{ code: 'style', detail: 'Anarkali' }, 'Anarkali, your style'],
    [{ code: 'fabric', detail: 'Silk' }, 'Silk, you like it'],
    [{ code: 'size', detail: 'M' }, 'Size M in stock'],
    [{ code: 'near', detail: '1.2' }, '1.2 km away'],
    [{ code: 'mystery' }, null],
  ])('%j -> %s', (r, label) => {
    expect(reasonLabel(r)).toBe(label);
  });
});

describe('StyleCard reason chips', () => {
  it('shows at most two chips', () => {
    render(
      <ul>
        <StyleCard
          card={card({
            reasons: [
              { code: 'palette' },
              { code: 'occasion', detail: 'Festive' },
              { code: 'near', detail: '1.2' },
            ],
          })}
          saved={false}
          full={false}
          busy={false}
          onToggle={() => {}}
          onEnquire={() => {}}
        />
      </ul>,
    );
    const chips = screen.getByRole('list', { name: 'Why this matches' });
    expect(chips.textContent).toContain('Your colour');
    expect(chips.textContent).toContain('For Festive');
    expect(chips.textContent).not.toContain('km away');
  });
  it('no reasons, no chip list', () => {
    render(
      <ul>
        <StyleCard
          card={card()}
          saved={false}
          full={false}
          busy={false}
          onToggle={() => {}}
          onEnquire={() => {}}
        />
      </ul>,
    );
    expect(screen.queryByRole('list', { name: 'Why this matches' })).toBeNull();
  });
});

describe('show all wear toggle (D6)', () => {
  it('appears when the feed filtered by gender and asks for all wear on click', async () => {
    fetchMock.mockImplementation(async () =>
      feed({ gender_filter: feedBodies().at(-1)?.all_wear ? null : 'FEMALE' }),
    );
    render(<MyStylePage />);
    expect(await screen.findByText("Showing women's wear")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    await waitFor(() => expect(feedBodies().at(-1)?.all_wear).toBe(true));
    // Still offered after the switch, so the shopper can go back.
    const back = await screen.findByRole('button', { name: "Women's wear only" });
    fireEvent.click(back);
    await waitFor(() => expect(feedBodies().at(-1)?.all_wear).toBeUndefined());
  });
  it('is hidden when the feed never filtered', async () => {
    fetchMock.mockImplementation(async () => feed({ gender_filter: null }));
    render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');
    expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull();
  });
});

describe('Style Passport links', () => {
  it('header links to the Style Passport', async () => {
    fetchMock.mockImplementation(async () => feed());
    render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');
    expect(
      screen.getByRole('link', { name: /Style Passport/ }).getAttribute('href'),
    ).toBe('/my-profile#passport');
  });
  it('?retake=1 opens the photo sheet', async () => {
    window.history.pushState({}, '', '/my-style?retake=1');
    fetchMock.mockImplementation(async () => feed());
    render(<MyStylePage />);
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });
  it('?palette=1 starts with Shop my colours on', async () => {
    window.history.pushState({}, '', '/my-style?palette=1');
    fetchMock.mockImplementation(async () => feed());
    render(<MyStylePage />);
    await waitFor(() => expect(feedBodies().length).toBeGreaterThan(0));
    expect(feedBodies().at(-1)?.palette_only).toBe(true);
  });
});

describe('complete the look follows the toggle', () => {
  it('fetchLook sends all_wear=1 only when asked', async () => {
    const { fetchLook } = await import('../lib');
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (u: string) => {
      urls.push(u);
      return new Response(JSON.stringify({ data: { anchor: { id: 'a', name: null }, slots: [] }, meta: { reason: null } }));
    });
    await fetchLook('a', null, new AbortController().signal);
    await fetchLook('a', null, new AbortController().signal, true);
    expect(urls[0]).not.toContain('all_wear');
    expect(urls[1]).toContain('all_wear=1');
  });
});
