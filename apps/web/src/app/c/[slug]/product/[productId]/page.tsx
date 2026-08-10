import { formatPriceRange } from '@kanchuki/shared';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { SharedProductPage } from '../../components/SharedProductPage';
import { fetchCollection } from '../../lib/fetchCollection';
import { fetchProductDetail } from '../../lib/fetchProductDetail';

interface Props {
  params: Promise<{ slug: string; productId: string }>;
}

// Legacy shared-product URL (/c/{slug}/product/{productId}) — the twin of
// [store]/[collection]/product/[productId] for retailers without a store
// slug. Retailers WITH a store slug redirect to the canonical store URL.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, productId } = await params;
  const [collection, product] = await Promise.all([
    fetchCollection(slug, { page: 1, pageSize: 1 }),
    fetchProductDetail(productId),
  ]);
  if (!collection || !product) return { title: 'Product Not Found | Kanchuki' };

  const shop = collection.retailer.shop_name;
  const city = collection.retailer.city;
  const title = `${product.name ?? product.subtype ?? product.category ?? 'Product'} — ${shop}`;
  const description = `${product.subtype ?? product.category ?? 'Product'} · ${formatPriceRange(product.price_min, product.price_max)} from ${shop}${city ? `, ${city}` : ''}. View the full catalog on Kanchuki.`;
  // Retailers with a store slug get canonicalized to the store URL form;
  // only store-less retailers canonically live on /c/{slug}/...
  const canonicalUrl = collection.retailer.public_slug
    ? `/${collection.retailer.public_slug}/${slug}/product/${productId}`
    : `/c/${slug}/product/${productId}`;

  return {
    title: `${title} | Kanchuki`,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonicalUrl,
      images: product.primary_photo_url
        ? [{ url: product.primary_photo_url, alt: title, width: 1200, height: 1600 }]
        : [],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: product.primary_photo_url ? [product.primary_photo_url] : [],
    },
  };
}

export default async function LegacySharedProductPage({ params }: Props) {
  const { slug, productId } = await params;
  const [collection, product] = await Promise.all([
    fetchCollection(slug, { page: 1, pageSize: 1 }),
    fetchProductDetail(productId),
  ]);
  if (!collection || !product) notFound();

  // Retailer has a store slug → this is a non-canonical URL for them, send
  // shared links to the store URL form (mirrors c/[slug]/page.tsx).
  const store = collection.retailer.public_slug;
  if (store) redirect(`/${store}/${slug}/product/${productId}`);

  return (
    <SharedProductPage collection={collection} product={product} collectionPath={`/c/${slug}`} />
  );
}
