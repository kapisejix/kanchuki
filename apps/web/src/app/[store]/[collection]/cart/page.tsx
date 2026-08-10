import { fetchCheckoutEnabled } from '@/lib/checkout';
import { notFound } from 'next/navigation';
import { CartPage } from '../../../c/[slug]/cart/CartPage';
import { resolveStorefront } from '../../lib/resolveStorefront';

interface Props {
  params: Promise<{ store: string; collection: string }>;
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
