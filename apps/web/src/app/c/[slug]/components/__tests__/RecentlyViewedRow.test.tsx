import type { PublicProduct } from '@kanchuki/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackRecentlyViewed } from '../../lib/recentlyViewed';
import { RecentlyViewed } from '../RecentlyViewedRow';

// next/image goes through Next's optimizer config, which jsdom doesn't provide.
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    className,
  }: {
    src: string;
    alt?: string | null;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element -- stand-in for next/image under test
    <img src={src} alt={alt ?? ''} className={className} />
  ),
}));

const track = (id: string, subtype?: string | null): void =>
  trackRecentlyViewed('meera', {
    id,
    name: `Product ${id}`,
    category: 'Saree',
    subtype,
    primary_color: 'Maroon',
    price_min: 100_000,
    price_max: 200_000,
    primary_photo_url: `https://cdn.test/${id}.jpg`,
  });

beforeEach(() => localStorage.clear());

describe('RecentlyViewed', () => {
  it('renders nothing at all for a first-time visitor', () => {
    // Not an empty heading around an empty carousel — the whole section is
    // absent, because most visitors have no history on this store.
    const { container } = render(<RecentlyViewed storeSlug="meera" onProductTap={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the stored items newest-first', () => {
    track('p1');
    track('p2');
    const { container } = render(<RecentlyViewed storeSlug="meera" onProductTap={() => {}} />);

    expect(screen.getByText('Recently Viewed')).toBeInTheDocument();
    expect(Array.from(container.querySelectorAll('img'), (i) => i.getAttribute('src'))).toEqual([
      'https://cdn.test/p2.jpg',
      'https://cdn.test/p1.jpg',
    ]);
  });

  it('hands the sheet a complete PublicProduct, subtype included', () => {
    // The defect this guards: the row used to synthesize a product missing
    // fields that `PublicProduct` types as required, so the subtype badge fell
    // back to a generic label and the sheet's rating block had nothing to read.
    track('p1', 'Unstitched');
    const onProductTap = vi.fn();
    render(<RecentlyViewed storeSlug="meera" onProductTap={onProductTap} />);

    fireEvent.click(screen.getAllByRole('button')[0]);

    expect(onProductTap).toHaveBeenCalledTimes(1);
    const product = onProductTap.mock.calls[0][0] as PublicProduct;
    expect(product.id).toBe('p1');
    expect(product.subtype).toBe('Unstitched');
    expect(product.primary_photo_url).toBe('https://cdn.test/p1.jpg');
    // Absent from the local record on purpose — the sheet fetches the real
    // product by id, and `rating_count: 0` makes its ReviewList render nothing
    // rather than "0.0 (0 reviews)".
    expect(product.rating_count).toBe(0);
    expect(product.has_360).toBe(false);
  });

  it('still hands over a usable product when the record has no photo', () => {
    trackRecentlyViewed('meera', {
      id: 'p9',
      name: null,
      category: null,
      primary_color: null,
      price_min: null,
      price_max: null,
      primary_photo_url: null,
    });
    const onProductTap = vi.fn();
    render(<RecentlyViewed storeSlug="meera" onProductTap={onProductTap} />);

    fireEvent.click(screen.getAllByRole('button')[0]);

    const product = onProductTap.mock.calls[0][0] as PublicProduct;
    // Empty rather than null: the sheet's photo builder reads '' as "no photos
    // yet" and falls back to the fetched gallery.
    expect(product.primary_photo_url).toBe('');
    expect(product.subtype).toBeNull();
  });
});
