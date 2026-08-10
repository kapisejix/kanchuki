import { API_URL as apiUrl } from '@/lib/apiUrl';
import { notFound } from 'next/navigation';
import { CartPage } from '../../../c/[slug]/cart/CartPage';
import { resolveStorefront } from '../../lib/resolveStorefront';

interface Props {
  params: Promise<{ store: string; collection: string }>;
}

// Server-side checkout status for the cart's "Proceed to Checkout" gate.
// Uses the store's public_slug (not the collection/pseudo slug) — the API's
// retailer-status endpoint resolves retailers by public_slug, which works for
// every storefront page including category / All Products browse pages.
async function fetchCheckoutEnabled(store: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiUrl}/v1/public/checkout/retailer-status/${store}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { data: { checkout_enabled: boolean } };
    return json.data?.checkout_enabled ?? false;
  } catch {
    return false;
  }
}

export default async function CartPageRoute({ params }: Props) {
  const { store, collection } = await params;
  const resolved = await resolveStorefront(store, collection);
  if (!resolved) notFound();

  return (
    <CartPage
      slug={resolved.key}
      store={store}
      shopName={resolved.collection.retailer.shop_name}
      checkoutEnabled={await fetchCheckoutEnabled(store)}
      backHref={resolved.backHref}
    />
  );
}
