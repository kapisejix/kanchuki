import { notFound } from 'next/navigation';
import { OrderView } from '../../../../c/[slug]/order/[orderId]/OrderView';
import { resolveStorefront } from '../../../lib/resolveStorefront';

interface Props {
  params: Promise<{ store: string; collection: string; orderId: string }>;
}

export default async function OrderPage({ params }: Props) {
  const { store, collection, orderId } = await params;
  // Gate on the listing resolving (real collection or browse pseudo-slug) so
  // orders placed from category / All Products pages don't 404.
  const resolved = await resolveStorefront(store, collection);
  if (!resolved) notFound();

  return (
    <OrderView slug={resolved.key} store={store} orderId={orderId} backHref={resolved.backHref} />
  );
}
