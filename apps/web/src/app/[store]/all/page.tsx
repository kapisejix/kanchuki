import { API_URL as apiUrl } from '@/lib/apiUrl';
import type { PublicCollection } from '@kanchuki/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CollectionView } from '../../c/[slug]/components/CollectionView';

interface Props {
  params: Promise<{ store: string }>;
}

async function fetchAllProducts(
  store: string,
  params?: { page?: number; pageSize?: number },
): Promise<PublicCollection | null> {
  const qs = params
    ? `?${new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      )}`
    : '';
  try {
    const res = await fetch(`${apiUrl}/v1/public/retailers/${store}/products${qs}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data: PublicCollection };
    return json.data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store } = await params;
  const data = await fetchAllProducts(store, { page: 1, pageSize: 1 });
  if (!data) return { title: 'Store Not Found | Kanchuki' };

  const shop = data.retailer.shop_name;
  const city = data.retailer.city;
  const ogImage = data.retailer.logo_url ?? data.retailer.banner_url;
  return {
    title: `${shop} — All Products${city ? `, ${city}` : ''} | Kanchuki`,
    description: `Browse all ${data.total} products from ${shop}${city ? `, ${city}` : ''} — the full catalog in one place.`,
    alternates: { canonical: `/${store}/all` },
    openGraph: {
      title: `${shop} — All Products`,
      description: `Browse all ${data.total} products from ${shop}${city ? `, ${city}` : ''}.`,
      url: `/${store}/all`,
      images: ogImage
        ? [{ url: ogImage }]
        : data.products[0]?.primary_photo_url
          ? [{ url: data.products[0].primary_photo_url }]
          : [],
    },
  };
}

export default async function StoreAllProductsPage({ params }: Props) {
  const { store } = await params;
  const data = await fetchAllProducts(store, { page: 1, pageSize: 12 });
  if (!data) notFound();

  // Store-scoped slug (mirrors the category page's `cat-${categoryId}`) so the
  // wishlist localStorage key is unique per store — a plain "all" would
  // collide across every store in the same browser.
  return (
    <CollectionView
      collection={data}
      slug={`all-${store}`}
      store={store}
      productsApiPath={`/api/${store}/products`}
    />
  );
}
