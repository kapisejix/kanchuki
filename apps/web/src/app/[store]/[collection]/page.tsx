import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { CollectionView } from '../../c/[slug]/components/CollectionView';
import { fetchCollection } from '../../c/[slug]/lib/fetchCollection';

interface Props {
  params: Promise<{ store: string; collection: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collection } = await params;
  const data = await fetchCollection(collection, { page: 1, pageSize: 1 });
  if (!data) return { title: 'Collection Not Found | Kanchuki' };

  const shop = data.retailer.shop_name;
  const city = data.retailer.city;
  const description = `Browse ${data.total} handpicked outfits from ${shop}${city ? `, ${city}` : ''}`;
  // Store branding first (F-031), product shot as fallback — shared links
  // should show the store, not the platform logo.
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
      images: ogImage ? [ogImage] : data.products[0]?.primary_photo_url ? [data.products[0].primary_photo_url] : [],
    },
  };
}

export default async function CollectionPage({ params }: Props) {
  const { store, collection } = await params;
  const data = await fetchCollection(collection, { page: 1, pageSize: 12 });
  if (!data) notFound();

  // Canonical URL enforcement: the store segment in the URL must be this
  // retailer's public_slug. A retailer without a store slug lives at the
  // legacy /c/{slug} URL (the API only generates that form when public_slug
  // is null), so a store-style URL for them is non-canonical too.
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
