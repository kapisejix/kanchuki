// Does a Google place plausibly belong to this shop? The retailer chooses their own
// google_place_id and Google gives no proof of ownership, so before a place's public rating is
// shown as the shop's own we require: a shared DISTINCTIVE word in the name, and the shop's city
// in the place address. Fail-safe: any doubt hides the badge.
// ponytail: a same-named shop in the same city still passes; real proof of ownership is the
// Google Business Profile link (dark until Google approves API access).

const GENERIC = new Set([
  'and',
  'the',
  'boutique',
  'fashion',
  'fashions',
  'store',
  'stores',
  'shop',
  'shopping',
  'collection',
  'collections',
  'textile',
  'textiles',
  'saree',
  'sarees',
  'suit',
  'suits',
  'ladies',
  'mens',
  'gents',
  'kids',
  'wear',
  'garments',
  'clothing',
  'clothes',
  'creation',
  'creations',
  'fabric',
  'fabrics',
  'designer',
  'house',
  'emporium',
  'centre',
  'center',
  'mart',
  'palace',
  'world',
]);

const words = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);

/** Distinctive (non-generic) words of a name: what another store must share to be a look-alike. */
export function placeNameWords(name: string): string[] {
  return words(name).filter((w) => !GENERIC.has(w));
}

export function placeMatchesShop(
  place: { name: string; address: string },
  shop: { shop_name: string; city: string | null },
): boolean {
  const shopWords = words(shop.shop_name);
  const placeWords = words(place.name);
  if (shopWords.length === 0 || placeWords.length === 0) return false;

  const distinctive = shopWords.filter((w) => !GENERIC.has(w));
  const nameOk =
    distinctive.length > 0
      ? distinctive.some((w) => placeWords.includes(w))
      : shopWords.join(' ') === placeWords.join(' '); // only generic words: exact name or nothing
  if (!nameOk) return false;

  const city = shop.city?.trim().toLowerCase();
  return !city || place.address.toLowerCase().includes(city);
}
