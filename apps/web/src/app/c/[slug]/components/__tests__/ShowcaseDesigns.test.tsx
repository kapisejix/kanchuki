import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShowcaseDesigns } from '../ShowcaseDesigns';

// next/image renders through Next's optimizer config which jsdom doesn't
// provide — mock to a plain <img> carrying the src/alt.
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, className }: { src: string; alt?: string | null; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- test mock of next/image
    <img src={src} alt={alt ?? ''} className={className} />
  ),
}));

const DESIGNS = {
  data: {
    designs: [
      { id: 'd1', name: 'Boat Neck', image_url: 'https://cdn.test/d1.jpg', category: { slug: 'suits', name: 'Suits' } },
      { id: 'd2', name: null, image_url: 'https://cdn.test/d2.jpg', category: { slug: 'gala', name: 'Gala' } },
    ],
    category: { slug: 'suits', name: 'Suits', related: ['suits', 'gala', 'baju'] },
  },
};

describe('ShowcaseDesigns strip', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => DESIGNS })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the category-named strip with design thumbs and a View-more browse link', async () => {
    render(<ShowcaseDesigns productId="prod-1" storeSlug="meera-sarees" />);

    expect(await screen.findByText('Suits Designs')).toBeInTheDocument();
    // Both thumbs render, name fallback to category for the unnamed one.
    expect(screen.getByRole('link', { name: /Boat Neck/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Gala/ })).toBeInTheDocument();

    const viewMore = screen.getByRole('link', { name: 'View more' });
    expect(viewMore).toHaveAttribute('href', '/meera-sarees/designs?ref=prod-1');
    expect(viewMore).toHaveAttribute('target', '_blank');

    // First thumb deep-links to the store-scoped permalink route.
    expect(screen.getByRole('link', { name: /Boat Neck/ })).toHaveAttribute(
      'href',
      '/meera-sarees/designs/d1',
    );
  });

  it('stays hidden when the API returns no matching designs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: { designs: [], category: null } }),
      })),
    );
    const { container } = render(<ShowcaseDesigns productId="prod-1" storeSlug="meera-sarees" />);
    // Let the fetch promise settle, then assert nothing rendered.
    await waitFor(() => expect(container.textContent).toBe(''));
  });

  it('stays hidden on a legacy /c/ page (no store slug — no /{store}/designs route)', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => DESIGNS })),
    );
    const { container } = render(<ShowcaseDesigns productId="prod-1" storeSlug={null} />);
    expect(container.textContent).toBe('');
  });

  it('fails open — a fetch error keeps the strip hidden, not crashed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));
    const { container } = render(<ShowcaseDesigns productId="prod-1" storeSlug="meera-sarees" />);
    await waitFor(() => expect(container.textContent).toBe(''));
  });
});
