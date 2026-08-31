import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductGallery } from '../ProductGallery';

// next/image renders through Next's optimizer config which jsdom doesn't
// provide — mock to a plain <img> carrying the src/alt.
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, className }: { src: string; alt?: string | null; className?: string }) => (
    <img src={src} alt={alt ?? ''} className={className} />
  ),
}));

const PHOTOS = ['https://cdn.test/p1.jpg', 'https://cdn.test/p2.jpg', 'https://cdn.test/p3.jpg'];
const VARIANTS = [
  { color: 'Maroon', photoUrl: 'https://cdn.test/v1.jpg', status: 'AVAILABLE' },
  // No photo — chip only, never a slide.
  { color: 'Teal', photoUrl: null, status: 'AVAILABLE' },
];

describe('ProductGallery', () => {
  it('builds slides from photos + variant photos, deduped', () => {
    const { container } = render(
      <ProductGallery
        photos={[...PHOTOS, 'https://cdn.test/v1.jpg']} // duplicate variant photo
        variants={VARIANTS}
        alt="Kurta Set"
      />,
    );
    // 3 photos + 1 variant photo = 4 slides → live region reads "Photo 1 of 4"
    expect(container.textContent).toContain('Photo 1 of 4');
    // Multi-slide controls appear: arrows + a thumbnail for slide 2
    expect(screen.getByRole('button', { name: 'Next photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Photo 2' })).toBeInTheDocument();
    // No previous arrow on the first slide
    expect(screen.queryByRole('button', { name: 'Previous photo' })).not.toBeInTheDocument();
  });

  it('shows no counter/thumbs/arrows for a single photo', () => {
    const { container } = render(
      <ProductGallery photos={['https://cdn.test/p1.jpg']} variants={[]} alt="Kurta Set" />,
    );
    expect(container.textContent).not.toContain('/ 1');
    expect(screen.queryByRole('button', { name: 'Photo 2' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next photo' })).not.toBeInTheDocument();
  });

  it('renders the variant color chip and jumps to its slide on tap', () => {
    const { container } = render(
      <ProductGallery photos={PHOTOS} variants={VARIANTS} alt="Kurta Set" />,
    );
    // Chip exists for the photo variant; Teal (no photo) is a static chip.
    const maroonChip = screen.getByRole('button', { name: 'Maroon' });
    fireEvent.click(maroonChip);
    // Variant slide is last → live region reads "Photo 4 of 4, Maroon"
    expect(container.textContent).toContain('Photo 4 of 4');
  });

  it('opens the fullscreen lightbox on photo click and closes it', () => {
    render(<ProductGallery photos={PHOTOS} variants={VARIANTS} alt="Kurta Set" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Open photo in fullscreen' })[0]!);
    expect(screen.getByRole('button', { name: 'Close fullscreen photo' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close fullscreen photo' }));
    expect(
      screen.queryByRole('button', { name: 'Close fullscreen photo' }),
    ).not.toBeInTheDocument();
  });

  it('marks sold products with a Sold ribbon', () => {
    const { container } = render(
      <ProductGallery photos={PHOTOS} variants={[]} alt="Kurta Set" isSold />,
    );
    expect(container.textContent).toContain('Sold');
  });
});
