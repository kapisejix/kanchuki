import { notFound } from 'next/navigation';
import { fetchCollection } from '../../../c/[slug]/lib/fetchCollection';
import { WishlistView } from '../../../c/[slug]/wishlist/WishlistView';

interface Props {
  params: Promise<{ store: string; collection: string }>;
}

export default async function WishlistPage({ params }: Props) {
  const { store, collection } = await params;
  const data = await fetchCollection(collection);
  if (!data) notFound();

  return <WishlistView collection={data} slug={collection} store={store} />;
}
