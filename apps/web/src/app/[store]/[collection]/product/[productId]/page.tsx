import { formatPriceRange } from '@kanchuki/shared';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { SharedProductPage } from '../../../../c/[slug]/components/SharedProductPage';
import { fetchCollection } from '../../../../c/[slug]/lib/fetchCollection';
import { fetchProductDetail } from '../../../../c/[slug]/lib/fetchProductDetail';
import { resolveStorefront } from '../../../lib/resolveStorefront';
import type { PublicCollection } from '@kanchuki/shared';

interface Props {
  params: Promise<{ store: string; collection: string; productId: string }>;
}

// Resolves the collection segment of a shared-product URL. It may be a real
// collection slug (light page-1 fetch, same as before) OR a browse-page
// pseudo-slug (all-{store} / cat-{categoryId}) — CollectionView passes the
// browse slug into the product sheet's share button, so links shared from
// "All Products" / category pages must resolve the same way the wishlist /
// cart / checkout routes do (resolveStorefront fallback) instead of 404ing.
// backHref is the "back to catalog" target: the real collection page, or the
// browse page the customer was actually on (never the pseudo-slug URL, which
// has no page behind it).
async function resolveProductCollection(
  store: string,
  collectionSlug: string,
): Promise<{ collection: PublicCollection; backHref: string } | null> {
  const real = await fetchCollection(collectionSlug, { page: 1, pageSize: 1 });
  if (real) return { collection: real, backHref: `/${store}/${collectionSlug}` };

  const resolved = await resolveStorefront(store, collectionSlug);
  if (!resolved) return null;
  return { collection: resolved.collection, backHref: resolved.backHref };
}

// Shared product link — this page IS the URL customers forward on WhatsApp.
// The OG image is the product's own photo so the WhatsApp link preview shows
// the product (not the collection/logo), and the page's primary CTA takes the
// recipient back into the full catalog.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store, collection: collectionSlug, productId } = await params;
  const [resolved, product] = await Promise.all([
    resolveProductCollection(store, collectionSlug),
    fetchProductDetail(productId),
  ]);
  if (!resolved || !product) return { title: 'Product Not Found | Kanchuki' };

  const collection = resolved.collection;

  const shop = collection.retailer.shop_name;
  const city = collection.retailer.city;
  const title = `${product.name ?? product.subtype ?? product.category ?? 'Product'} — ${shop}`;
  const description = `${product.subtype ?? product.category ?? 'Product'} · ${formatPriceRange(product.price_min, product.price_max)} from ${shop}${city ? `, ${city}` : ''}. View the full catalog on Kanchuki.`;

  // Canonical = the retailer's real store URL (public_slug wins over the
  // requested store segment; no store slug means the legacy /c/ form).
  const canonicalStore = collection.retailer.public_slug;
  const canonicalUrl = canonicalStore
    ? `/${canonicalStore}/${collectionSlug}/product/${productId}`
    : `/c/${collectionSlug}/product/${productId}`;

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

export default async function SharedProductPageRoute({ params }: Props) {
  const { store, collection: collectionSlug, productId } = await params;
  const [resolved, product] = await Promise.all([
    resolveProductCollection(store, collectionSlug),
    fetchProductDetail(productId),
  ]);
  if (!resolved || !product) notFound();

  const { collection, backHref } = resolved;

  // Canonical URL enforcement — mirrors [store]/[collection]/page.tsx.
  const canonicalStore = collection.retailer.public_slug;
  if (canonicalStore) {
    if (canonicalStore !== store)
      redirect(`/${canonicalStore}/${collectionSlug}/product/${productId}`);
  } else {
    redirect(`/c/${collectionSlug}/product/${productId}`);
  }

  return (
    <SharedProductPage
      collection={collection}
      product={product}
      // Real collection → back to the collection; pseudo-slug → back to the
      // browse page the customer was on (All Products / category), never the
      // pseudo-slug URL itself (no page behind it).
      collectionPath={backHref}
    />
  );
}
