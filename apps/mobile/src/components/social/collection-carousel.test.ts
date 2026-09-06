import { describe, expect, it } from 'vitest';
import { collectionProductsToCarouselItems } from './collection-carousel';

const row = (id: string, photoId: string | null) => ({
  product: { id, photos: photoId ? [{ id: photoId }] : [] },
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
