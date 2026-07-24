// F-302: Client-side cart. Same localStorage pattern as the existing Wishlist
// (F-006) — matches the app's anonymous-browsing principle throughout.
// No customer account needed.

export interface CartItem {
  id: string
  name: string | null
  price_min: number | null
  category: string | null
  primary_photo_url: string
  quantity: number // always 1 for MVP (one Product = one garment)
}

export type CartMap = Map<string, CartItem>

export const cartKey = (slug: string) => `kanchuki_cart_${slug}`

export function loadCart(slug: string): CartMap {
  if (typeof window === 'undefined') return new Map()
  try {
    const raw = JSON.parse(localStorage.getItem(cartKey(slug)) ?? '[]')
    if (Array.isArray(raw)) {
      const map = new Map<string, CartItem>()
      for (const item of raw as CartItem[]) {
        if (item && item.id) map.set(item.id, item)
      }
      return map
    }
    return new Map()
  } catch {
    return new Map()
  }
}

export function saveCart(slug: string, items: CartMap): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(cartKey(slug), JSON.stringify(Array.from(items.values())))
  } catch {
    // localStorage full — silently fail
  }
}

export function productToCartItem(p: {
  id: string
  name: string | null
  price_min: number | null
  category: string | null
  primary_photo_url: string
}): CartItem {
  return {
    id: p.id,
    name: p.name,
    price_min: p.price_min,
    category: p.category,
    primary_photo_url: p.primary_photo_url,
    quantity: 1,
  }
}

/** Total cart value in paise */
export function cartTotal(items: CartMap): number {
  let total = 0
  items.forEach((item) => {
    total += (item.price_min ?? 0) * item.quantity
  })
  return total
}

/** Number of unique items in cart */
export function cartCount(items: CartMap): number {
  return items.size
}
