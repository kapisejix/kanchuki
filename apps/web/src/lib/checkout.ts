import { API_URL } from './apiUrl';

/**
 * Server-side checkout availability check for a retailer.
 *
 * `slugOrStore` may be either the retailer's public_slug (QR storefront) or a
 * collection slug — the API resolves both. Used by the cart pages (to gate
 * "Proceed to Checkout") and the checkout pages (to hide the payment form if
 * the store disabled its payment gateway after items were already in a
 * customer's cart).
 *
 * Mirrors fetchCollection's API_URL + ISR pattern: 60s revalidate so a
 * retailer's gateway toggle propagates quickly without hammering Postgres.
 */
export async function fetchCheckoutEnabled(slugOrStore: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${API_URL}/v1/public/checkout/retailer-status/${encodeURIComponent(slugOrStore)}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return false;
    const json = (await res.json()) as { data: { checkout_enabled: boolean } };
    return json.data?.checkout_enabled ?? false;
  } catch {
    return false;
  }
}
