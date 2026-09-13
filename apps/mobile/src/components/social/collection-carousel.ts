import { CAROUSEL_CAP } from './types';

/** A collection detail row as returned by GET /v1/collections/:id. */
interface CollectionProductRow {
  product?: { id?: string; photos?: { id: string; url?: string }[] } | null;
}

/** One fan-out item — a product plus its primary photo id. */
export interface CarouselItem {
  product_id: string;
  photo_id: string;
}

/**
 * Turn a collection's product rows into CAROUSEL fan-out items: keep only
 * products that have a photo, cap at the IG limit, and pair each with its
 * (primary) photo id. The API resolves the actual media from the ids.
 */
export function collectionProductsToCarouselItems(
  rows: CollectionProductRow[] | undefined,
): CarouselItem[] {
  return (rows ?? [])
    .map((r) => r.product)
    .filter((p): p is { id: string; photos: { id: string }[] } => !!p?.id && !!p.photos?.[0]?.id)
    .slice(0, CAROUSEL_CAP)
    .map((p) => ({ product_id: p.id, photo_id: p.photos[0].id }));
}

/**
 * A cover image for a Collection-Link post (link-only format, no items in
 * the fan-out payload — RC: the composer preview and the Facebook link post
 * both went out with no photo because nothing here ever supplied one). Picks
 * the first collection product that has a photo.
 */
export function firstCollectionProductPhotoUrl(
  rows: CollectionProductRow[] | undefined,
): string | null {
  for (const row of rows ?? []) {
    const url = row.product?.photos?.[0]?.url;
    if (url) return url;
  }
  return null;
}
