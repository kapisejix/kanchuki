// F-036 Phase A (Task 1): the /my-stores page as the shopper experiences it.
//
// The list's data rules are covered in lib.test.ts; what matters here is which
// branch each response selects, and what reaches the DOM:
//   - 401 → the sign-in prompt, never a list;
//   - 200 with no visits → the empty state;
//   - 200 with visits → one real tap-through link per store, pointing at the
//     store's existing catalog route (/{public_slug}). That href is the whole
//     feature — a row without it is dead text — so it is asserted exactly.
//
// A page-level test also pins the fail-quiet contract: any non-401 failure is
// treated as "not signed in" rather than surfacing a partial or stale list.
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MyStoresPage from '../page';

const STORES_URL = '/api/passport/stores';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Two visits, in the order the API returns them (newest first). */
const VISITS = {
  stores: [
    {
      retailer: {
        id: 'ret_2',
        shop_name: 'Shree Sarees',
        city: 'Surat',
        logo_url: null,
        public_slug: 'shree-sarees',
      },
      first_visited_at: '2026-09-01T10:00:00.000Z',
      last_visited_at: '2026-09-15T10:00:00.000Z',
      visit_count: 1,
      is_muted: false,
      contact_shared: false,
    },
    {
      retailer: {
        id: 'ret_1',
        shop_name: 'Meena Bazaar',
        city: 'Jaipur',
        logo_url: 'https://r2.example.com/meena.png',
        public_slug: 'meena-bazaar',
      },
      first_visited_at: '2026-08-01T10:00:00.000Z',
      last_visited_at: '2026-09-10T10:00:00.000Z',
      visit_count: 3,
      is_muted: false,
      contact_shared: true,
    },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const SIGNED_OUT = /please log in to see the stores/i;

describe('my-stores page', () => {
  it('asks the passport-scoped endpoint for the visits, with cookies', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { stores: [] }));
    render(<MyStoresPage />);

    // The endpoint is the only thing scoping the list to this shopper — the
    // client never passes a customer id, so there is nothing to tamper with.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(STORES_URL, { credentials: 'include' });
  });

  it('prompts a signed-out shopper to log in instead of showing a list', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: { code: 'NO_SESSION', message: 'Not authenticated' } }),
    );
    render(<MyStoresPage />);

    expect(await screen.findByText(SIGNED_OUT)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/no stores yet/i)).not.toBeInTheDocument();
  });

  it('renders the empty state when the shopper has no visits yet', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { stores: [] }));
    render(<MyStoresPage />);

    expect(await screen.findByText(/no stores yet/i)).toBeInTheDocument();
    expect(screen.getByText('My Stores')).toBeInTheDocument();
    expect(screen.getByText(/stores you scan or shop with will show up here/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('taps through to each store through its existing catalog route', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, VISITS));
    render(<MyStoresPage />);

    await screen.findByText('Shree Sarees');

    // The exact href is the contract with the storefront: /{public_slug} is the
    // route the QR scan and the WhatsApp share already open.
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/shree-sarees',
      '/meena-bazaar',
    ]);

    // Both rows render — including the one with no logo.
    expect(screen.getByText('Meena Bazaar')).toBeInTheDocument();
  });

  it('counts the visits in the header', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, VISITS));
    render(<MyStoresPage />);

    expect(await screen.findByText("2 stores you've visited.")).toBeInTheDocument();
  });

  it('keeps a store with no catalog page, but offers nothing to tap', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        stores: [
          {
            retailer: {
              id: 'ret_3',
              shop_name: 'New Shop',
              city: null,
              logo_url: null,
              public_slug: null,
            },
            last_visited_at: '2026-09-16T10:00:00.000Z',
            visit_count: 1,
            is_muted: false,
          },
        ],
      }),
    );
    render(<MyStoresPage />);

    expect(await screen.findByText('New Shop')).toBeInTheDocument();
    expect(screen.getByText(/published a catalog page yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('treats a server error as signed-out rather than showing a stale list', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: 'boom' }));
    render(<MyStoresPage />);

    expect(await screen.findByText(SIGNED_OUT)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('treats a network failure as signed-out rather than hanging on the skeleton', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    render(<MyStoresPage />);

    expect(await screen.findByText(SIGNED_OUT)).toBeInTheDocument();
  });
});
