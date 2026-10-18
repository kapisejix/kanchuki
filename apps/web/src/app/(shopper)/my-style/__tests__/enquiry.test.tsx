// F-045 PR-5b: shortlist -> one enquiry per store -> that store's WhatsApp.
// RC-015 (double click), RC-014 (no unhandled rejections), honest failure (no fabricated link).
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MyStylePage from '../page';

const fetchMock = vi.fn();

const card = (id: string, slug: string, shop: string) => ({
  id,
  name: `Name ${id}`,
  price_min: 210000,
  price_max: 210000,
  primary_photo_url: 'https://img.test/x.jpg',
  distance_km: null,
  retailer: { shop_name: shop, slug, city: 'Surat' },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const feedBody = {
  data: [card('a', 's1', 'Shree'), card('b', 's2', 'Rang'), card('c', 's1', 'Shree')],
  meta: { total: 3, page: 1, limit: 12, location_scope: 'city', rationale_source: 'none' },
};

/** Feed on every load, then the enquire route answers per store. */
function route(enquire: (slug: string) => Response | Promise<Response>) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/my-style/feed') return json(feedBody);
    if (url === '/api/my-style/enquire') {
      return enquire(JSON.parse(init?.body as string).retailer_slug);
    }
    throw new Error(`unexpected ${url}`);
  });
}

const enquireCalls = () =>
  fetchMock.mock.calls
    .filter(([u]) => u === '/api/my-style/enquire')
    .map(([, init]) => JSON.parse((init as RequestInit).body as string));

const wa = (slug: string) =>
  json({ data: { whatsapp_url: `https://wa.me/${slug}`, recorded: true } });

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
  window.scrollTo = vi.fn();
  vi.spyOn(window, 'open').mockReturnValue(null);
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function shortlist(...names: string[]) {
  for (const n of names) {
    const cardEl = (await screen.findByText(n)).closest('li') as HTMLElement;
    fireEvent.click(cardEl.querySelector('button[aria-pressed]') as HTMLElement);
  }
}

describe('My Style multi-store enquiry', () => {
  it('shortlisting shows a bar that counts stores, not items', async () => {
    route(wa);
    render(<MyStylePage />);
    await shortlist('Name a', 'Name c');
    expect(screen.getByRole('button', { name: 'Enquire at 1 store' })).toBeTruthy();
    await shortlist('Name b');
    expect(screen.getByRole('button', { name: 'Enquire at 2 stores' })).toBeTruthy();
  });

  it('two stores -> one POST each with only that store picks, then a link per store', async () => {
    route(wa);
    render(<MyStylePage />);
    await shortlist('Name a', 'Name b', 'Name c');
    fireEvent.click(screen.getByRole('button', { name: 'Enquire at 2 stores' }));

    await waitFor(() => expect(enquireCalls()).toHaveLength(2));
    expect(enquireCalls()).toEqual([
      { retailer_slug: 's1', product_ids: ['a', 'c'] },
      { retailer_slug: 's2', product_ids: ['b'] },
    ]);
    const link = await screen.findByRole('link', { name: /Open WhatsApp.*Rang/ });
    expect(link.getAttribute('href')).toBe('https://wa.me/s2');
    expect(screen.getByRole('link', { name: /Open WhatsApp.*Shree/ })).toBeTruthy();
    expect(window.open).not.toHaveBeenCalled(); // several stores: the user taps each link
  });

  it('exactly one store opens its WhatsApp straight away', async () => {
    route(wa);
    render(<MyStylePage />);
    await shortlist('Name a');
    fireEvent.click(screen.getByRole('button', { name: 'Enquire at 1 store' }));
    await waitFor(() => expect(window.open).toHaveBeenCalledWith('https://wa.me/s1', '_self'));
  });

  it('a failed store shows an honest error and a retry, never a made-up link', async () => {
    route((slug) => (slug === 's2' ? json({ error: 'x' }, 422) : wa(slug)));
    render(<MyStylePage />);
    await shortlist('Name a', 'Name b');
    fireEvent.click(screen.getByRole('button', { name: 'Enquire at 2 stores' }));

    expect(await screen.findByText(/Could not reach Rang/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Open WhatsApp.*Rang/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Open WhatsApp.*Shree/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    await waitFor(() => expect(enquireCalls()).toHaveLength(3));
  });

  it('a double click sends each store once (RC-015)', async () => {
    route(wa);
    render(<MyStylePage />);
    await shortlist('Name a', 'Name b');
    const btn = screen.getByRole('button', { name: 'Enquire at 2 stores' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await screen.findByRole('link', { name: /Open WhatsApp.*Rang/ });
    expect(enquireCalls()).toHaveLength(2);
  });

  it('the per-card Enquire sends just that piece to its store', async () => {
    route(wa);
    render(<MyStylePage />);
    const cardEl = (await screen.findByText('Name b')).closest('li') as HTMLElement;
    fireEvent.click(cardEl.querySelector('button.enquire') as HTMLElement);
    await waitFor(() =>
      expect(enquireCalls()).toEqual([{ retailer_slug: 's2', product_ids: ['b'] }]),
    );
  });

  it('a card opens the shared product page', async () => {
    route(wa);
    render(<MyStylePage />);
    const name = await screen.findByText('Name a');
    expect(name.closest('a')?.getAttribute('href')).toBe('/s1/all-s1/product/a');
  });

  it('a session that ended mid-send shows the login link', async () => {
    route(() => json({ error: 'x' }, 401));
    render(<MyStylePage />);
    await shortlist('Name a');
    fireEvent.click(screen.getByRole('button', { name: 'Enquire at 1 store' }));
    expect(await screen.findByRole('link', { name: /log in/i })).toBeTruthy();
  });

  it('no cart, order or payment copy', async () => {
    route(wa);
    render(<MyStylePage />);
    await shortlist('Name a');
    expect(document.body.textContent).not.toMatch(/\b(cart|checkout|order|pay(ment)?|buy)\b/i);
  });
});
