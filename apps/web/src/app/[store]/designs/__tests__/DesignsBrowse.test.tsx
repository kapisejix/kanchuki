import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DesignsBrowse } from '../DesignsBrowse';

// next/image renders through Next's optimizer config which jsdom doesn't
// provide — mock to a plain <img>.
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, className }: { src: string; alt?: string | null; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- test mock of next/image
    <img src={src} alt={alt ?? ''} className={className} />
  ),
}));

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

const PROFILE = {
  shop_name: 'Meera Sarees',
  city: 'Jaipur',
  state: 'Rajasthan',
  address_line1: null,
  address_line2: null,
  categories: ['Suits'],
  logo_url: null,
  banner_url: null,
  storefront_slug: null,
};

const designs = [
  {
    id: 'd1',
    name: 'Boat Neck',
    image_url: 'https://cdn.test/d1.jpg',
    category: { slug: 'suits', name: 'Suits' },
    store: { shop_name: 'Meera Sarees', slug: 'meera-sarees' },
  },
  {
    id: 'd2',
    name: null,
    image_url: 'https://cdn.test/d2.jpg',
    category: { slug: 'gala', name: 'Gala' },
    store: null,
  },
];

const feedAll = { designs, related: [], next_cursor: null };
const feedSuits = {
  designs: designs.filter((d) => d.category.slug === 'suits'),
  related: ['suits', 'gala', 'baju'],
  next_cursor: null,
};

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: string) => {
    const url = String(input);
    if (url.includes('category=suits')) {
      return { ok: true, status: 200, json: async () => ({ data: feedSuits }) };
    }
    return { ok: true, status: 200, json: async () => ({ data: feedAll }) };
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DesignsBrowse', () => {
  it('renders the store-scoped grid with chips from the current feed', () => {
    render(<DesignsBrowse store="meera-sarees" profile={PROFILE} initialData={feedAll} initialCategory={null} />);

    expect(screen.getByRole('link', { name: /Boat Neck/ })).toHaveAttribute('href', '/meera-sarees/designs/d1');
    // Header: shop identity + back-to-store link.
    expect(screen.getByRole('heading', { name: 'Meera Sarees Designs' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to store' })).toHaveAttribute('href', '/meera-sarees');
    // Chips — All + both categories present in the feed.
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suits' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gala' })).toBeInTheDocument();
    expect(screen.getByText(/2 designs/)).toBeInTheDocument();
  });

  it('refetches through the proxy when a category chip is tapped', async () => {
    render(<DesignsBrowse store="meera-sarees" profile={PROFILE} initialData={feedAll} initialCategory={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Suits' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/showcase-designs?store=meera-sarees&category=suits'),
      );
    });
    // The filtered feed drops the Gala design + its chip.
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Gala/ })).not.toBeInTheDocument();
    });
    expect(screen.getByText(/1 design/)).toBeInTheDocument();
  });

  it('shows an empty state when nothing matches', () => {
    render(
      <DesignsBrowse
        store="meera-sarees"
        profile={PROFILE}
        initialData={{ designs: [], related: [], next_cursor: null }}
        initialCategory={null}
      />,
    );
    expect(screen.getByText(/No designs here yet/)).toBeInTheDocument();
  });
});
