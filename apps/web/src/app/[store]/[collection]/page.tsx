import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { CollectionView } from '../../c/[slug]/components/CollectionView';
import { SuspendedNotice } from '../../c/[slug]/components/SuspendedNotice';
import { fetchCollection } from '../../c/[slug]/lib/fetchCollection';
import { resolveStorefront } from '../lib/resolveStorefront';

interface Props {
  params: Promise<{ store: string; collection: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store, collection } = await params;
  const resolved = await resolveStorefront(store, collection);
  if (!resolved) {
    return { title: 'Store Catalog | Kanchuki' };
  }

  const data = resolved.collection;
  const shop = data.retailer.shop_name;
  const city = data.retailer.city;
  const description = `Browse ${data.total} handpicked outfits from ${shop}${city ? `, ${city}` : ''}`;
  const ogImage = data.retailer.logo_url ?? data.retailer.banner_url;

  return {
    title: `${data.title} — ${shop}${city ? `, ${city}` : ''} | Kanchuki`,
    description,
    openGraph: {
      title: data.title,
      description,
      type: 'website',
      images: ogImage
        ? [{ url: ogImage, alt: shop }]
        : data.products[0]?.primary_photo_url
          ? [{ url: data.products[0].primary_photo_url }]
          : [],
    },
    twitter: {
      card: 'summary',
      title: data.title,
      description,
      images: ogImage
        ? [ogImage]
        : data.products[0]?.primary_photo_url
          ? [data.products[0].primary_photo_url]
          : [],
    },
  };
}

export default async function CollectionPage({ params }: Props) {
  const { store, collection } = await params;

  // If this is a browse-page pseudo-slug (all-{store} or cat-{id}), redirect
  // immediately to the canonical browse route so it never 404s.
  if (collection.startsWith('all-') || collection === 'all') {
    redirect(`/${store}/all`);
  }
  if (collection.startsWith('cat-')) {
    redirect(`/${store}/categories/${collection.slice(4)}`);
  }

  const data = await fetchCollection(collection, { page: 1, pageSize: 12 });
  if (!data) {
    // If collection does not exist, gracefully route to the store's categories
    // rather than throwing a 404 error on a customer link.
    redirect(`/${store}/categories`);
  }

  // Suspended retailer notice
  if (data.suspended) {
    return <SuspendedNotice shopName={data.retailer.shop_name} />;
  }

  // Canonical URL enforcement
  const canonicalStore = data.retailer.public_slug;
  if (canonicalStore) {
    if (canonicalStore !== store) redirect(`/${canonicalStore}/${collection}`);
  } else {
    redirect(`/c/${collection}`);
  }

  return (
    <CollectionView
      collection={data}
      slug={collection}
      store={store}
      productsApiPath={`/api/${store}/${collection}/products`}
    />
  );
}
