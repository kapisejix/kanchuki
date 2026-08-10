import { notFound } from 'next/navigation';
import { fetchCollection } from '../../../../c/[slug]/lib/fetchCollection';
import { OrderView } from '../../../../c/[slug]/order/[orderId]/OrderView';

interface Props {
  params: Promise<{ store: string; collection: string; orderId: string }>;
}

export default async function OrderPage({ params }: Props) {
  const { store, collection, orderId } = await params;
  const data = await fetchCollection(collection);
  if (!data) notFound();

  return <OrderView slug={collection} store={store} orderId={orderId} />;
}
