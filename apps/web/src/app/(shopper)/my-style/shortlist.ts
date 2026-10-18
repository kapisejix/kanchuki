// F-045 PR-5b: the My Style shortlist. Kept on the device (a server-synced version needs a
// passport DELETE proxy and a retailer id on feed cards); stored per store because that is
// how enquiries go out (one per store) and how a future cart would group items (spec §5).
// Prices stay in paise.
import type { FeedCard } from './lib'

const KEY = 'my-style:shortlist'
/** The enquire route accepts at most 20 products per store. */
export const MAX_PER_STORE = 20

export interface ShortItem {
  id: string
  name: string | null
  price_min: number | null
  price_max: number | null
  photo: string
  shop_name: string
  slug: string
}

export interface StoreGroup {
  slug: string
  shop_name: string
  items: ShortItem[]
}

export function toShortItem(c: FeedCard): ShortItem | null {
  if (!c.retailer.slug) return null
  return {
    id: c.id,
    name: c.name,
    price_min: c.price_min,
    price_max: c.price_max,
    photo: c.primary_photo_url,
    shop_name: c.retailer.shop_name,
    slug: c.retailer.slug,
  }
}

export function loadShortlist(): ShortItem[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter(
      (i): i is ShortItem =>
        !!i && typeof i.id === 'string' && typeof i.slug === 'string' && typeof i.shop_name === 'string',
    )
  } catch {
    return []
  }
}

export function saveShortlist(items: ShortItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    // Storage blocked or full: the shortlist still works for this visit.
  }
}

export function groupByStore(items: ShortItem[]): StoreGroup[] {
  const groups = new Map<string, StoreGroup>()
  for (const i of items) {
    const g = groups.get(i.slug) ?? { slug: i.slug, shop_name: i.shop_name, items: [] }
    g.items.push(i)
    groups.set(i.slug, g)
  }
  return Array.from(groups.values())
}
