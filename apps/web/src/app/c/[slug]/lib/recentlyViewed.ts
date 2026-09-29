// Recently-viewed products tracker — localStorage-based, per-store scope.
// Stores the most recent 20 products per store, ordered by most-recently-viewed.

export interface RecentlyViewedProduct {
  id: string
  name: string | null
  category: string | null
  // Added with the storefront carousel: the detail sheet renders subtype as a
  // badge at the top of the product, so a row that omitted it made every
  // re-opened product show the generic fallback. Optional because records
  // written before this field existed are already in shoppers' localStorage.
  subtype?: string | null
  primary_color: string | null
  price_min: number | null
  price_max: number | null
  photo_url: string | null
  viewed_at: number // timestamp
}

const MAX_ITEMS = 20

function storageKey(storeSlug: string): string {
  return `kanchuki_recent_${storeSlug}`
}

export function loadRecentlyViewed(storeSlug: string): RecentlyViewedProduct[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(storageKey(storeSlug))
    if (!raw) return []
    return JSON.parse(raw) as RecentlyViewedProduct[]
  } catch {
    return []
  }
}

export function trackRecentlyViewed(
  storeSlug: string,
  product: {
    id: string
    name: string | null
    category: string | null
    subtype?: string | null
    primary_color: string | null
    price_min: number | null
    price_max: number | null
    primary_photo_url: string | null
  },
): void {
  if (typeof window === 'undefined') return
  try {
    const existing = loadRecentlyViewed(storeSlug)
    // Remove if already exists (will be re-added at top)
    const filtered = existing.filter((p) => p.id !== product.id)
    // Add to front with current timestamp
    const updated: RecentlyViewedProduct[] = [
      {
        id: product.id,
        name: product.name,
        category: product.category,
        subtype: product.subtype ?? null,
        primary_color: product.primary_color,
        price_min: product.price_min,
        price_max: product.price_max,
        photo_url: product.primary_photo_url,
        viewed_at: Date.now(),
      },
      ...filtered,
    ].slice(0, MAX_ITEMS)
    localStorage.setItem(storageKey(storeSlug), JSON.stringify(updated))
  } catch {
    // localStorage full or unavailable — fail silently
  }
}
