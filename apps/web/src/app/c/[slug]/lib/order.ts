// SECURITY §11.10: the anonymous order lookup requires the customer's phone as
// a second factor (?phone= query param) to prevent IDOR. The phone must never
// be put in a shareable URL — CheckoutForm stashes it in sessionStorage after a
// successful payment, and OrderView reads it back when polling order status.
// sessionStorage (not localStorage) so it dies with the tab.

export const orderPhoneKey = (slug: string) => `kanchuki_order_phone_${slug}`

export function saveOrderPhone(slug: string, phone: string): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(orderPhoneKey(slug), phone)
  } catch {
    // storage unavailable — order page falls back to error state, app still works
  }
}

export function loadOrderPhone(slug: string): string {
  if (typeof window === 'undefined') return ''
  try {
    return sessionStorage.getItem(orderPhoneKey(slug)) ?? ''
  } catch {
    return ''
  }
}
