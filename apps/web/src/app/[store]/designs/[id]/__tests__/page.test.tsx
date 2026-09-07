import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import DesignPermalinkPage from '../page';

// next/image renders through Next's optimizer config which jsdom doesn't
// provide — mock to a plain <img> carrying the alt text.
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, className }: { src: string; alt?: string | null; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- test mock of next/image
    <img src={src} alt={alt ?? ''} className={className} />
  ),
}));

// next/link renders an anchor through Next's router context — mock to a plain
// <a> carrying the href (drops prefetch etc.).
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...rest
  }: {
    href: string
    children: React.ReactNode
    prefetch?: boolean
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// notFound throws through next/navigation's router context — this test
// exercises the fetch/404 decision, so a thrown error (missing route) is fine.
const notFoundMock = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
}));

// Pin the API base so the outbound fetch URLs are deterministic.
vi.mock('@/lib/apiUrl', () => ({
  API_URL: 'https://api.test.invalid',
}));

const profile = {
  data: {
    shop_name: 'Meera Sarees',
    city: 'Jaipur',
    state: 'Rajasthan',
    address_line1: null,
    address_line2: null,
    categories: ['Saree'],
    logo_url: null,
    banner_url: null,
    storefront_slug: null,
  },
};

const ownDesign = {
  data: {
    id: 'design-1',
    name: 'Boat Neck Suit',
    image_url: 'https://cdn.test/wm-design-1.jpg',
    category: { slug: 'suits', name: 'Suits' },
    store: { shop_name: 'Meera Sarees', slug: 'meera-sarees' },
    created_at: '2026-09-01T00:00:00.000Z',
  },
};

const globalDesign = {
  data: {
    id: 'design-2',
    name: null,
    image_url: 'https://cdn.test/wm-global.jpg',
    category: { slug: 'suits', name: 'Suits' },
    store: null,
    created_at: '2026-09-01T00:00:00.000Z',
  },
};

const fetchRoutes: Record<string, { status: number; body: unknown }> = {};
const fetchMock = vi.fn((input: string) => {
  const url = typeof input === 'string' ? input : String(input);
  const route = fetchRoutes[url];
  if (!route) return Promise.reject(new Error(`unexpected fetch: ${url}`));
  return Promise.resolve(
    new Response(JSON.stringify(route.body), {
      status: route.status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
});

const profileUrl = 'https://api.test.invalid/v1/public/retailers/meera-sarees';
const designUrl = 'https://api.test.invalid/v1/public/showcase-designs/design-1';

beforeEach(() => {
  fetchRoutes[profileUrl] = { status: 200, body: profile };
  notFoundMock.mockClear();
  fetchMock.mockReset();
  fetchMock.mockImplementation((input: string) => {
    const url = typeof input === 'string' ? input : String(input);
    const route = fetchRoutes[url];
    if (!route) return Promise.reject(new Error(`unexpected fetch: ${url}`));
    return Promise.resolve(
      new Response(JSON.stringify(route.body), {
        status: route.status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderPermalink = async () =>
  DesignPermalinkPage({ params: Promise.resolve({ store: 'meera-sarees', id: 'design-1' }) }).then((el) => {
    render(el);
  });

describe('DesignPermalinkPage ({store}/designs/[id])', () => {
  it('renders a retailer-owned design under its own store URL', async () => {
    fetchRoutes[designUrl] = { status: 200, body: ownDesign };
    await renderPermalink();

    // Watermarked image + design name + share CTAs + Visit store.
    expect(screen.getByAltText('Boat Neck Suit')).toBeInTheDocument();
    expect(screen.getByText('Boat Neck Suit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Share design/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /WhatsApp/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy link/ })).toBeInTheDocument();
    const storeLink = screen.getByRole('link', { name: /Visit store/ });
    expect(storeLink.getAttribute('href')).toBe('/meera-sarees');
  });

  it('renders a global design under the visiting store', async () => {
    fetchRoutes[designUrl] = { status: 200, body: globalDesign };
    await renderPermalink();
    // No name — falls back to the category label for the image alt/heading.
    expect(screen.getByAltText('Suits design')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Visit store/ })).toHaveAttribute('href', '/meera-sarees');
  });

  it("404s a retailer-owned design on a foreign store URL (cross-store leak guard)", async () => {
    // design-1 belongs to meera-sarees but is requested under another store.
    fetchRoutes['https://api.test.invalid/v1/public/retailers/radha-stores'] = {
      status: 200,
      body: {
        data: {
          shop_name: 'Radha Stores',
          city: 'Pune',
          state: 'Maharashtra',
          address_line1: null,
          address_line2: null,
          categories: ['Suits'],
          logo_url: null,
          banner_url: null,
          storefront_slug: null,
        },
      },
    };
    fetchRoutes[designUrl] = { status: 200, body: ownDesign };

    await expect(
      DesignPermalinkPage({ params: Promise.resolve({ store: 'radha-stores', id: 'design-1' }) }).then(() => undefined),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalled();
  });

  it('404s when the design is unpublished (API returns 404)', async () => {
    fetchRoutes[designUrl] = { status: 404, body: { error: 'Design not found' } };
    await expect(renderPermalink()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
