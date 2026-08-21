import { API_URL as apiUrl } from '@/lib/apiUrl';
import { LayoutGrid, Store } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { buildStoreDescription, localBusinessLd, storeOgImage } from '../lib/store-seo';
import { SeasonalPicks } from '../components/SeasonalPicks';

interface PublicCategory {
  id: string;
  name: string;
  image_url: string | null;
  product_count: number;
}

interface StoreCategoriesData {
  shop_name: string;
  city: string | null;
  state: string | null;
  address_line1: string | null;
  address_line2: string | null;
  categories: string[];
  logo_url: string | null;
  banner_url: string | null;
  storefront_slug: string | null;
  categoryList: PublicCategory[];
  total_products: number;
}

interface Props {
  params: Promise<{ store: string }>;
}

async function fetchData(store: string): Promise<StoreCategoriesData | null> {
  try {
    const [profileRes, categoriesRes] = await Promise.all([
      fetch(`${apiUrl}/v1/public/retailers/${store}`, { next: { revalidate: 60 } }),
      fetch(`${apiUrl}/v1/public/retailers/${store}/categories`, { next: { revalidate: 60 } }),
    ]);
    if (!profileRes.ok) return null;
    const profile = (await profileRes.json()) as {
      data: {
        shop_name: string;
        city: string | null;
        state: string | null;
        address_line1: string | null;
        address_line2: string | null;
        categories: string[];
        logo_url: string | null;
        banner_url: string | null;
        storefront_slug: string | null;
      };
    };
    const categoriesJson = (await categoriesRes.json()) as {
      data: PublicCategory[];
      total_products?: number;
    };
    return {
      ...profile.data,
      categoryList: categoriesJson.data ?? [],
      total_products: categoriesJson.total_products ?? 0,
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store } = await params;
  const data = await fetchData(store);
  if (!data) return { title: 'Store Not Found | Kanchuki' };

  const description = buildStoreDescription(data);
  const ogImage = storeOgImage(data);

  return {
    title: `${data.shop_name} — Categories${data.city ? `, ${data.city}` : ''} | Kanchuki`,
    description,
    alternates: { canonical: `/${store}/categories` },
    openGraph: {
      title: `${data.shop_name} — Categories`,
      description,
      type: 'website',
      url: `/${store}/categories`,
      images: ogImage ? [{ url: ogImage, alt: data.shop_name }] : [],
    },
    twitter: {
      card: 'summary',
      title: `${data.shop_name} — Categories`,
      description,
      images: ogImage ? [ogImage] : [],
    },
  };
}

export default async function StoreCategoriesPage({ params }: Props) {
  const { store } = await params;
  const data = await fetchData(store);
  if (!data) notFound();

  // No categories AND no products at all — fall back to the retailer's single
  // storefront collection (pre-category behavior), or a friendly empty state.
  if (data.categoryList.length === 0 && data.total_products === 0) {
    if (data.storefront_slug) redirect(`/${store}/${data.storefront_slug}`);
    return (
      <div className="min-h-screen bg-cyan-50 flex flex-col items-center justify-center px-6 gap-4">
        <div className="w-14 h-14 bg-cyan-100 rounded-full items-center justify-center flex">
          <Store size={26} className="text-cyan-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">{data.shop_name}</h1>
        <p className="text-sm text-gray-400">Catalog coming soon.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-md mx-auto px-4 py-3.5">
          <p className="text-[11px] text-cyan-700/80 font-semibold uppercase tracking-wider truncate">
            {data.shop_name}
            {data.city ? ` · ${data.city}` : ''}
          </p>
          <h1 className="font-display text-lg font-bold text-gray-900 leading-tight tracking-tight">
            Browse by Category
          </h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5">
        {/* Seasonal / curated collections */}
        <SeasonalPicks storeSlug={store} />

        <div className="grid grid-cols-2 gap-3">
        {/* All Products tile — always first so the full catalog (including
            products with no category) is one tap away and never hidden. */}
        <Link
          href={`/${store}/all`}
          className="bg-white rounded-2xl border border-cyan-200 overflow-hidden shadow-sm active:scale-[0.98] transition-transform"
        >
          <div className="w-full aspect-square bg-gradient-to-br from-cyan-600 to-cyan-800 relative flex items-center justify-center">
            <LayoutGrid size={44} className="text-white" />
          </div>
          <div className="p-3">
            <p className="text-sm font-semibold text-gray-900 truncate">All Products</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {data.total_products} product{data.total_products === 1 ? '' : 's'}
            </p>
          </div>
        </Link>

        {data.categoryList.map((cat) => (
          <Link
            key={cat.id}
            href={`/${store}/categories/${cat.id}`}
            className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm active:scale-[0.98] transition-transform"
          >
            <div className="w-full aspect-square bg-gray-100 relative">
              {cat.image_url ? (
                <Image
                  src={cat.image_url}
                  alt={cat.name}
                  fill
                  className="object-cover"
                  sizes="200px"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl">🗂️</div>
              )}
            </div>
            <div className="p-3">
              <p className="text-sm font-semibold text-gray-900 truncate">{cat.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {cat.product_count} product{cat.product_count === 1 ? '' : 's'}
              </p>
            </div>
          </Link>
        ))}
        </div>
      </main>

      {/* LocalBusiness structured data (F-031) — same block as the store home. */}
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD from our own retailer data, no user input
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessLd(data, store)) }}
      />
    </div>
  );
}
