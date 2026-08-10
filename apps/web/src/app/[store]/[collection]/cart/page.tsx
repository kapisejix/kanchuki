import { API_URL as apiUrl } from '@/lib/apiUrl';
import { notFound } from 'next/navigation';
import { CartPage } from '../../../c/[slug]/cart/CartPage';
import { fetchCollection } from '../../../c/[slug]/lib/fetchCollection';

interface Props {
  params: Promise<{ store: string; collection: string }>;
}

// Server-side checkout status for the cart's "Proceed to Checkout" gate —
// previously hardcoded `false`, which dead-ended the flow at the cart even for
// checkout-enabled retailers. Mirrors fetchCollection's API_URL + ISR pattern.
async function fetchCheckoutEnabled(collection: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiUrl}/v1/public/checkout/retailer-status/${collection}`, {
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
  const data = await fetchCollection(collection);
  if (!data) notFound();

  return (
    <CartPage
      slug={collection}
      store={store}
      shopName={data.retailer.shop_name}
      checkoutEnabled={await fetchCheckoutEnabled(collection)}
    />
  );
}
