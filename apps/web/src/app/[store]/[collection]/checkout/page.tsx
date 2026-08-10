import { notFound } from 'next/navigation';
import { CheckoutForm } from '../../../c/[slug]/checkout/CheckoutForm';
import { fetchCollection } from '../../../c/[slug]/lib/fetchCollection';

interface Props {
  params: Promise<{ store: string; collection: string }>;
}

export default async function CheckoutPageRoute({ params }: Props) {
  const { store, collection } = await params;
  const data = await fetchCollection(collection);
  if (!data) notFound();

  return (
    <CheckoutForm
      slug={collection}
      store={store}
      shopName={data.retailer.shop_name}
      retailerPhone={data.retailer.phone}
    />
  );
}
