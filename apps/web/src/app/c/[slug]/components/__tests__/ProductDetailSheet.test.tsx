import type { PublicCollection, PublicProduct } from '@kanchuki/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductDetailSheet } from '../ProductDetailSheet';

// The sheet is a product-detail modal used by CollectionView — this test locks
// the Related Products strip behaviour: the heading is "Related Products"
// (was "Related suits") and clicking a thumb swaps the sheet to that product
// via onSelectProduct (was a dead onClose() that went nowhere).

// next/image renders through Next's optimizer config which jsdom doesn't
// provide — mock to a plain <img> carrying the src/alt.
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, className }: { src: string; alt?: string | null; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- test mock of next/image
    <img src={src} alt={alt ?? ''} className={className} />
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

// Heavy children — stub to light elements so this test can focus on the
// Related Products strip.
vi.mock('../Product360Viewer', () => ({ Product360Viewer: () => null }));
vi.mock('../ReviewList', () => ({ ReviewList: () => null }));
vi.mock('../FabricGlossary', () => ({ FabricGlossary: () => null }));
vi.mock('../NotifyWhenAvailable', () => ({ NotifyWhenAvailable: () => null }));
vi.mock('../SavedSize', () => ({ SavedSize: () => null }));
vi.mock('../DesignGallery', () => ({ DesignGallery: () => null }));
vi.mock('../ShowcaseDesigns', () => ({ ShowcaseDesigns: () => null }));
vi.mock('../FamilyProfiles', () => ({ FamilyProfiles: () => null }));
vi.mock('../CustomerConsentModal', () => ({ CustomerConsentModal: () => null }));
vi.mock('../lib/recentlyViewed', () => ({ trackRecentlyViewed: vi.fn() }));
vi.mock('../lib/cart', () => ({
  productToCartItem: vi.fn(),
  saveCart: vi.fn(),
  loadCart: vi.fn(() => []),
}));

const PRODUCT: PublicProduct = {
  id: 'prod-1',
  name: 'Maroon Silk Saree',
  price_min: 250000,
  price_max: 300000,
  status: 'AVAILABLE',
  category: 'Saree',
  subtype: null,
  primary_color: 'Maroon',
  is_new_arrival: false,
  on_sale: false,
  location: null,
  primary_photo_url: 'https://cdn.test/prod-1.jpg',
  has_360: false,
  avg_rating: 0,
  rating_count: 0,
};

const RETAILER: PublicCollection['retailer'] = {
  id: 'ret-1',
  shop_name: 'Meera Sarees',
  city: 'Jaipur',
  phone: '919999999999',
  logo_url: null,
  banner_url: null,
  public_slug: 'meera-sarees',
  latitude: null,
  longitude: null,
};

function makeRelated(i: number): PublicProduct {
  return {
    ...PRODUCT,
    id: `rel-${i}`,
    name: `Related Saree ${i}`,
    primary_photo_url: `https://cdn.test/rel-${i}.jpg`,
  };
}

const fetchMock = vi.fn(async (input: string) => {
  const url = typeof input === 'string' ? input : String(input);
  if (url.includes('/related')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [makeRelated(1), makeRelated(2)] }),
    };
  }
  if (url.includes('/api/products/prod-1')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: { photos: [], spin_frames: [], variants: [], sizes: [], fabric_estimate: null },
      }),
    };
  }
  return { ok: false, status: 404, json: async () => ({}) };
});

describe('ProductDetailSheet Related Products strip', () => {
  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('labels the strip "Related Products" (was "Related suits")', async () => {
    render(
      <ProductDetailSheet
        product={PRODUCT}
        retailer={RETAILER}
        collectionTitle="Festive Edit"
        isFavorited={false}
        checkoutEnabled={false}
        slug="festive-edit"
        store="meera-sarees"
        onFavorite={() => undefined}
        onClose={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Related Products')).toBeInTheDocument();
    });
    expect(screen.queryByText('Related suits')).not.toBeInTheDocument();
  });

  it('clicking a related product swaps the sheet to it via onSelectProduct', async () => {
    const onSelectProduct = vi.fn();
    render(
      <ProductDetailSheet
        product={PRODUCT}
        retailer={RETAILER}
        collectionTitle="Festive Edit"
        isFavorited={false}
        checkoutEnabled={false}
        slug="festive-edit"
        store="meera-sarees"
        onFavorite={() => undefined}
        onSelectProduct={onSelectProduct}
        onClose={() => undefined}
      />,
    );

    // The card's accessible name is the image alt (= product name) — the
    // strip shows image + price + colour, not a text label.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Related Saree 1/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Related Saree 1/ }));

    expect(onSelectProduct).toHaveBeenCalledTimes(1);
    expect(onSelectProduct).toHaveBeenCalledWith(expect.objectContaining({ id: 'rel-1' }));
  });
});
