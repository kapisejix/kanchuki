export const wishlistKey = (slug: string) => `kanchuki_wishlist_${slug}`

export function loadWishlist(slug: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    return new Set(JSON.parse(localStorage.getItem(wishlistKey(slug)) ?? '[]'))
  } catch {
    return new Set()
  }
}
