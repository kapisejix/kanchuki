import { notFound } from 'next/navigation';
import { CheckoutForm } from '../../../c/[slug]/checkout/CheckoutForm';
import { resolveStorefront } from '../../lib/resolveStorefront';

interface Props {
  params: Promise<{ store: string; collection: string }>;
}

export default async function CheckoutPageRoute({ params }: Props) {
  const { store, collection } = await params;
  const resolved = await resolveStorefront(store, collection);
  if (!resolved) notFound();

  return (
    <CheckoutForm
      slug={resolved.key}
      store={store}
      shopName={resolved.collection.retailer.shop_name}
      retailerPhone={resolved.collection.retailer.phone}
      backHref={resolved.backHref}
    />
  );
}
