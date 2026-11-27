// F-045 PR-5b + Phase 3: the My Style shortlist. The account wishlist is the one source
// ("Saved looks", synced across devices); an older device-only copy is moved up once. Grouped
// per store because that is how enquiries go out (one per store, spec §5). Prices stay in paise.
import type { FeedCard } from './lib';

const KEY = 'my-style:shortlist';
/** The enquire route accepts at most 20 products per store. */
export const MAX_PER_STORE = 20;

export interface ShortItem {
  id: string;
  name: string | null;
  price_min: number | null;
  price_max: number | null;
  photo: string;
  shop_name: string;
  slug: string;
}

export interface StoreGroup {
  slug: string;
  shop_name: string;
  items: ShortItem[];
}

export function toShortItem(c: FeedCard): ShortItem | null {
  if (!c.retailer.slug) return null;
  return {
    id: c.id,
    name: c.name,
    price_min: c.price_min,
    price_max: c.price_max,
    photo: c.primary_photo_url,
    shop_name: c.retailer.shop_name,
    slug: c.retailer.slug,
  };
}

export function loadShortlist(): ShortItem[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (i): i is ShortItem =>
        !!i &&
        typeof i.id === 'string' &&
        typeof i.slug === 'string' &&
        typeof i.shop_name === 'string',
    );
  } catch {
    return [];
  }
}

export function saveShortlist(items: ShortItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage blocked or full: the shortlist still works for this visit.
  }
}

export function groupByStore(items: ShortItem[]): StoreGroup[] {
  const groups = new Map<string, StoreGroup>();
  for (const i of items) {
    const g = groups.get(i.slug) ?? { slug: i.slug, shop_name: i.shop_name, items: [] };
    g.items.push(i);
    groups.set(i.slug, g);
  }
  return Array.from(groups.values());
}

const WISHLIST = '/api/passport/wishlist';

interface WishlistRow {
  product: {
    id: string;
    name: string | null;
    price_min: number | null;
    price_max: number | null;
    photo_url: string | null;
    retailer: { shop_name: string; public_slug: string | null };
  };
}

/** The account's saved products as shortlist items; null when signed out (401), 'error' when
 * they could not be read, so a failed load never passes for an empty list. */
export async function fetchShortlist(): Promise<ShortItem[] | null | 'error'> {
  try {
    const res = await fetch(WISHLIST, { credentials: 'include' });
    if (res.status === 401) return null;
    if (!res.ok) return 'error';
    const { items } = (await res.json()) as { items: WishlistRow[] };
    return items.flatMap(({ product: p }) =>
      p.retailer.public_slug
        ? [
            {
              id: p.id,
              name: p.name,
              price_min: p.price_min,
              price_max: p.price_max,
              photo: p.photo_url ?? '',
              shop_name: p.retailer.shop_name,
              slug: p.retailer.public_slug,
            },
          ]
        : [],
    );
  } catch {
    return 'error';
  }
}

/** Raw status of one save/remove; 0 = network error. */
async function send(method: 'POST' | 'DELETE', id: string): Promise<number> {
  try {
    const res = await fetch(WISHLIST, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: id }),
    });
    return res.status;
  } catch {
    return 0;
  }
}

export const addShort = async (id: string) => (await send('POST', id)) === 200;
export const removeShort = async (id: string) => (await send('DELETE', id)) === 200;

/** Moves a device-only shortlist into the account once. A product that is gone (404) counts as
 * done; any other failure keeps the device copy so the next load retries. */
export async function moveDeviceShortlist(): Promise<void> {
  const items = loadShortlist();
  if (items.length === 0) return;
  const codes = await Promise.all(items.map((i) => send('POST', i.id)));
  if (codes.every((c) => c === 200 || c === 404)) {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // storage blocked: the next load re-posts, which is a no-op upsert
    }
  }
}
