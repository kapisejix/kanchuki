import { describe, expect, it } from 'vitest';
import { collectionProductsToCarouselItems, firstCollectionProductPhotoUrl } from './collection-carousel';

const row = (id: string, photoId: string | null, url?: string) => ({
  product: { id, photos: photoId ? [{ id: photoId, url }] : [] },
});

describe('collectionProductsToCarouselItems', () => {
  it('maps products with a photo to {product_id, photo_id}', () => {
    expect(collectionProductsToCarouselItems([row('p1', 'ph1'), row('p2', 'ph2')])).toEqual([
      { product_id: 'p1', photo_id: 'ph1' },
      { product_id: 'p2', photo_id: 'ph2' },
    ]);
  });

  it('drops products with no photo', () => {
    expect(collectionProductsToCarouselItems([row('p1', 'ph1'), row('p2', null)])).toEqual([
      { product_id: 'p1', photo_id: 'ph1' },
    ]);
  });

  it('caps at 10 (IG limit)', () => {
    const many = Array.from({ length: 15 }, (_, i) => row(`p${i}`, `ph${i}`));
    expect(collectionProductsToCarouselItems(many)).toHaveLength(10);
  });

  it('returns [] for undefined / empty', () => {
    expect(collectionProductsToCarouselItems(undefined)).toEqual([]);
    expect(collectionProductsToCarouselItems([])).toEqual([]);
  });
});

describe('firstCollectionProductPhotoUrl', () => {
  it('returns the first product photo url', () => {
    expect(
      firstCollectionProductPhotoUrl([
        row('p1', null),
        row('p2', 'ph2', 'https://cdn/cover.jpg'),
        row('p3', 'ph3', 'https://cdn/other.jpg'),
      ]),
    ).toBe('https://cdn/cover.jpg');
  });

  it('returns null when no product has a photo url', () => {
    expect(firstCollectionProductPhotoUrl([row('p1', null), row('p2', 'ph2')])).toBeNull();
  });

  it('returns null for undefined / empty', () => {
    expect(firstCollectionProductPhotoUrl(undefined)).toBeNull();
    expect(firstCollectionProductPhotoUrl([])).toBeNull();
  });
});
