import { notFound } from 'next/navigation';
import { WishlistView } from '../../../c/[slug]/wishlist/WishlistView';
import { resolveStorefront } from '../../lib/resolveStorefront';

interface Props {
  params: Promise<{ store: string; collection: string }>;
}

export default async function WishlistPage({ params }: Props) {
  const { store, collection } = await params;
  // Real collection, or a browse-page pseudo-slug (cat-{id} / all-{store}).
  const resolved = await resolveStorefront(store, collection);
  if (!resolved) notFound();

  return (
    <WishlistView
      collection={resolved.collection}
      slug={resolved.key}
      store={store}
      backHref={resolved.backHref}
    />
  );
}
