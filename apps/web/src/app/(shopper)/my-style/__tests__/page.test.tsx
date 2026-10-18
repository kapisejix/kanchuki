// F-045 PR-4a: /my-style as the shopper experiences it.
//
// What matters: which request each control sends, what reaches the DOM (paise
// -> rupees through the shared formatter, RC-055; Enquire not Buy; no reason
// line while rationale_source is "none", RC-059), and the pager (scroll reset,
// RC-053). The kids form and nav entries are PR-4b.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MyStylePage from '../page';

const fetchMock = vi.fn();

function card(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: 'Wine Silk Suit',
    price_min: 210000,
    price_max: 210000,
    primary_photo_url: 'https://img.test/p1.jpg',
    distance_km: 3.2,
    retailer: { shop_name: 'Shree Sarees', slug: 'shree-sarees', city: 'Surat' },
    ...over,
  };
}

function feed(over: { data?: unknown[]; meta?: Record<string, unknown> } = {}, status = 200) {
  return new Response(
    JSON.stringify({
      data: over.data ?? [card()],
      meta: {
        total: 1,
        page: 1,
        limit: 12,
        sort: 'best',
        location_scope: 'city',
        rationale_source: 'none',
        truncated: false,
        ...over.meta,
      },
    }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

const bodyOf = (n: number) => JSON.parse((fetchMock.mock.calls[n]![1] as RequestInit).body as string);

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  window.scrollTo = vi.fn();
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('My Style feed', () => {
  it('loads the best-match feed and renders cards honestly', async () => {
    fetchMock.mockResolvedValue(feed());
    render(<MyStylePage />);

    expect(await screen.findByText('Wine Silk Suit')).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/my-style/feed');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(bodyOf(0)).toMatchObject({ sort: 'best', page: 1 });

    // paise 210000 -> ₹2,100 (never ₹2,10,000, RC-055)
    expect(screen.getByText(/₹2,100/)).toBeTruthy();
    expect(screen.getByText(/Shree Sarees/)).toBeTruthy();
    expect(screen.getByText(/3\.2 km/)).toBeTruthy();
    const enquire = screen.getByRole('link', { name: /Enquire/ });
    expect(enquire.getAttribute('href')).toBe('/shree-sarees');
    expect(screen.queryByText(/buy/i)).toBeNull();
  });

  it('has no file input anywhere (no photo path in 4a)', async () => {
    fetchMock.mockResolvedValue(feed());
    const { container } = render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it('switching sort re-requests from page 1', async () => {
    fetchMock.mockResolvedValue(feed());
    render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');

    fireEvent.click(screen.getByRole('button', { name: 'Nearest' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodyOf(1)).toMatchObject({ sort: 'nearest', page: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Price' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(bodyOf(2)).toMatchObject({ sort: 'price', page: 1 });
  });

  it('budget filter is sent in paise', async () => {
    fetchMock.mockResolvedValue(feed());
    render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');

    fireEvent.change(screen.getByLabelText('Budget'), { target: { value: '300000' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodyOf(1).budget_max).toBe(300000);
  });

  it('Next page requests page 2 and scrolls to the top (RC-053)', async () => {
    fetchMock.mockResolvedValue(feed({ meta: { total: 30 } }));
    render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');

    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodyOf(1).page).toBe(2);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('Near me sends the device position', async () => {
    fetchMock.mockResolvedValue(feed());
    const getCurrentPosition = vi.fn((ok: (p: unknown) => void) =>
      ok({ coords: { latitude: 21.17, longitude: 72.83 } }),
    );
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');

    fireEvent.click(screen.getByRole('button', { name: /Near me/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodyOf(1)).toMatchObject({ lat: 21.17, lng: 72.83 });
  });

  it('says so when results are nationwide', async () => {
    fetchMock.mockResolvedValue(feed({ meta: { location_scope: 'nationwide' } }));
    render(<MyStylePage />);
    expect(await screen.findByText(/all of India/i)).toBeTruthy();
  });

  it('shows the empty state', async () => {
    fetchMock.mockResolvedValue(feed({ data: [], meta: { total: 0 } }));
    render(<MyStylePage />);
    expect(await screen.findByText(/No matches yet/i)).toBeTruthy();
  });

  it('a 401 sends the shopper to login with return_to=/my-style', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    render(<MyStylePage />);
    const link = await screen.findByRole('link', { name: /log in/i });
    expect(link.getAttribute('href')).toBe('/login?return_to=%2Fmy-style');
  });

  it('a server error shows a retry, not an empty feed', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 })).mockResolvedValue(feed());
    render(<MyStylePage />);
    fireEvent.click(await screen.findByRole('button', { name: /Try again/i }));
    expect(await screen.findByText('Wine Silk Suit')).toBeTruthy();
  });

  it('an aborted request is not an error state (RC-014)', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('aborted', 'AbortError')).mockResolvedValue(feed());
    render(<MyStylePage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Try again/i })).toBeNull();
  });
});
