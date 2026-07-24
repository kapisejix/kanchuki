// F-006: Store a lightweight product summary alongside the ID so the
// "Enquire about N items" message always resolves names/prices without
// needing a session-cache workaround. Migrates the old bare-ID format
// transparently on first read.

export interface WishlistItem {
  id: string
  name: string | null
  price_min: number | null
  price_max: number | null
  category: string | null
}

export const wishlistKey = (slug: string) => `kanchuki_wishlist_${slug}`

export function loadWishlist(slug: string): Map<string, WishlistItem> {
  if (typeof window === 'undefined') return new Map()
  try {
    const raw = JSON.parse(localStorage.getItem(wishlistKey(slug)) ?? '[]')
    // Migrate old bare-ID format (string[] or Set-compatible array) to v2
    if (Array.isArray(raw) && (raw.length === 0 || typeof raw[0] === 'string')) {
      const migrated = new Map<string, WishlistItem>()
      for (const id of raw as string[]) {
        migrated.set(id, { id, name: null, price_min: null, price_max: null, category: null })
      }
      saveWishlist(slug, migrated)
      return migrated
    }
    // v2 format: array of WishlistItem objects
    if (Array.isArray(raw)) {
      const map = new Map<string, WishlistItem>()
      for (const item of raw as WishlistItem[]) {
        if (item && item.id) map.set(item.id, item)
      }
      return map
    }
    return new Map()
  } catch {
    return new Map()
  }
}

export function saveWishlist(slug: string, items: Map<string, WishlistItem>): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(wishlistKey(slug), JSON.stringify(Array.from(items.values())))
  } catch {
    // localStorage full or unavailable — silently fail, app still works
  }
}

/** Build a WishlistItem from a minimal product-like object (avoids leaking
 * the full PublicProduct shape into localStorage which can get stale). */
export function productToWishlistItem(p: {
  id: string
  name: string | null
  price_min: number | null
  price_max: number | null
  category: string | null
}): WishlistItem {
  return { id: p.id, name: p.name, price_min: p.price_min, price_max: p.price_max, category: p.category }
}
