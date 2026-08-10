import { API_URL as apiUrl } from '@/lib/apiUrl';
import type { PublicCollection } from '@kanchuki/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CollectionView } from '../../../c/[slug]/components/CollectionView';

interface Props {
  params: Promise<{ store: string; categoryId: string }>;
}

async function fetchCategory(
  store: string,
  categoryId: string,
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
    const res = await fetch(
      `${apiUrl}/v1/public/retailers/${store}/categories/${categoryId}${qs}`,
      {
        next: { revalidate: 60 },
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data: PublicCollection };
    return json.data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store, categoryId } = await params;
  const category = await fetchCategory(store, categoryId, { page: 1, pageSize: 1 });
  if (!category) return { title: 'Category Not Found | Kanchuki' };

  const shop = category.retailer.shop_name;
  const city = category.retailer.city;
  const description = `Browse ${category.total} ${category.title} from ${shop}${city ? `, ${city}` : ''}`;
  const ogImage = category.retailer.logo_url ?? category.retailer.banner_url;

  return {
    title: `${category.title} — ${shop}${city ? `, ${city}` : ''} | Kanchuki`,
    description,
    alternates: { canonical: `/${store}/categories/${categoryId}` },
    openGraph: {
      title: `${category.title} — ${shop}`,
      description,
      type: 'website',
      url: `/${store}/categories/${categoryId}`,
      images: ogImage
        ? [{ url: ogImage, alt: shop }]
        : category.products[0]?.primary_photo_url
          ? [{ url: category.products[0].primary_photo_url }]
          : [],
    },
    twitter: {
      card: 'summary',
      title: `${category.title} — ${shop}`,
      description,
      images: ogImage
        ? [ogImage]
        : category.products[0]?.primary_photo_url
          ? [category.products[0].primary_photo_url]
          : [],
    },
  };
}

export default async function StoreCategoryProductsPage({ params }: Props) {
  const { store, categoryId } = await params;
  const category = await fetchCategory(store, categoryId, { page: 1, pageSize: 12 });
  if (!category) notFound();

  // Reuses CollectionView as-is — the public API shapes category products
  // identically to a collection. `slug` here only scopes the client-side
  // wishlist localStorage key and the best-effort favorite-count ping.
  return (
    <CollectionView
      collection={category}
      slug={`cat-${categoryId}`}
      store={store}
      productsApiPath={`/api/${store}/categories/${categoryId}/products`}
    />
  );
}
