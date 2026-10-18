// F-045 PR-4b: every My Style entry point (spec 3.1 #1-#5) links to /my-style.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PublicCollection } from '@kanchuki/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createControllablePathname } from '@/test/__mocks__/next-navigation';
import { clearPassportCache } from '@/lib/passport-client';
import { AIStylist } from '@/app/c/[slug]/components/AIStylist';
import { CollectionView } from '@/app/c/[slug]/components/CollectionView';
import StoresDirectory from '@/app/stores/StoresDirectory';
import ForCustomersPage from '@/app/for-customers/page';
import ShopperLayout from '../../layout';

vi.mock('next/dynamic', () => ({ __esModule: true, default: () => () => null }));
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt?: string | null }) => (
    // eslint-disable-next-line @next/next/no-img-element -- test mock of next/image
    <img src={src} alt={alt ?? ''} />
  ),
}));

const nav = createControllablePathname('/my-stores');
const hrefOf = (name: RegExp) => screen.getByRole('link', { name }).getAttribute('href');

beforeEach(() => {
  nav.reset();
  clearPassportCache();
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      String(url).includes('/passport/me')
        ? new Response(
            JSON.stringify({
              account: { id: 'c1', name: 'Ananya', phone_masked: '••9999', usual_size: 'M', city: 'Jaipur' },
            }),
            { status: 200 },
          )
        : new Response(JSON.stringify({ data: { stores: [], cities: [], total: 0, suggestions: [] } }), {
            status: 200,
          }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('My Style entry points', () => {
  it('#1 shopper header nav lists My Style first', async () => {
    render(
      <ShopperLayout>
        <p>content</p>
      </ShopperLayout>,
    );
    await screen.findByText('content');
    const links = screen.getAllByRole('link').filter((l) => l.closest('nav'));
    expect(links[0]?.textContent).toBe('My Style');
    expect(links[0]?.getAttribute('href')).toBe('/my-style');
  });

  it('#2 the storefront bottom bar has a My Style button', () => {
    const collection = {
      retailer: {
        id: 'r1', shop_name: 'Meera Sarees', city: 'Jaipur', phone: '919999999999', logo_url: null,
        banner_url: null, public_slug: 'meera-sarees', latitude: null, longitude: null,
      },
      title: 'Festive Edit', description: '', expires_at: null, products: [], total: 0, page: 1,
      page_size: 12, filters: { categories: [], colors: [], sizes: [] },
    } as unknown as PublicCollection;
    render(<CollectionView collection={collection} slug="festive-edit" productsApiPath="/api/c/festive-edit/products" />);
    expect(hrefOf(/My Style/)).toBe('/my-style');
  });

  it('#3 the AI Stylist footer links to My Style as a full navigation', () => {
    render(<AIStylist storeSlug="s" storeName="Meera Sarees" />);
    fireEvent.click(screen.getByLabelText('Open AI Stylist'));
    const link = screen.getByRole('link', { name: /Search all stores in My Style/ });
    expect(link.getAttribute('href')).toBe('/my-style');
    // A client-side <Link> would unmount the stylist, whose cleanup then calls
    // history.back() and undoes the navigation (RC-065/RC-006). A plain anchor
    // makes the browser do a document load instead.
    expect(link.tagName).toBe('A');
  });

  it('#4 the store directory has a "Find what suits you" card', async () => {
    render(<StoresDirectory initial={null} />);
    await waitFor(() => expect(screen.getByRole('link', { name: /Find what suits you/ })).toBeTruthy());
    expect(hrefOf(/Find what suits you/)).toBe('/my-style');
  });

  it('#5 For Customers has a My Style section with a CTA', () => {
    // The marketing chrome animates on scroll; jsdom has neither API.
    vi.stubGlobal('matchMedia', () => ({
      matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(),
    }));
    class NoopObserver {
      observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
    }
    vi.stubGlobal('IntersectionObserver', NoopObserver);
    vi.stubGlobal('ResizeObserver', NoopObserver);
    render(<ForCustomersPage />);
    const ctas = screen.getAllByRole('link', { name: /My Style/ });
    expect(ctas.some((a) => a.getAttribute('href') === '/my-style')).toBe(true);
  });
});
