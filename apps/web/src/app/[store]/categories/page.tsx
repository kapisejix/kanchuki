import { API_URL as apiUrl } from '@/lib/apiUrl';
import { LayoutGrid, Sparkles, Store } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { buildStoreDescription, localBusinessLd, storeOgImage } from '../lib/store-seo';

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
  new_arrivals_count: number;
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
      new_arrivals_count?: number;
    };
    return {
      ...profile.data,
      categoryList: categoriesJson.data ?? [],
      total_products: categoriesJson.total_products ?? 0,
      new_arrivals_count: categoriesJson.new_arrivals_count ?? 0,
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

  // No categories AND no products at all — fall back to friendly empty state
  if (data.categoryList.length === 0 && data.total_products === 0) {
    if (data.storefront_slug) redirect(`/${store}/${data.storefront_slug}`);
    return (
      <div className="min-h-screen bg-[#F8F7FC] flex flex-col items-center justify-center px-6 gap-4">
        <div className="w-16 h-16 bg-white rounded-3xl items-center justify-center flex border border-[#E0E1F6] shadow-sm">
          <Store size={28} className="text-[#231F48]" />
        </div>
        <h1 className="text-xl font-bold text-[#231F48] font-marcellus">{data.shop_name}</h1>
        <p className="text-sm text-[#6B4773]">Catalog coming soon.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7FC] font-sans pb-20">
      {/* ── Top Header & Greeting (Spec #9 Discovery) ── */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-[#E0E1F6]">
        <div className="max-w-xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl overflow-hidden bg-[#E0E1F6] border border-[#E0E1F6] flex items-center justify-center shadow-sm">
              {data.logo_url ? (
                <Image
                  src={data.logo_url}
                  alt={data.shop_name}
                  width={40}
                  height={40}
                  className="object-cover w-full h-full"
                />
              ) : (
                <span className="font-bold text-[#231F48] font-marcellus text-sm">
                  {data.shop_name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-[#231F48]">Hi, Welcome!</p>
              <p className="text-[10px] uppercase tracking-wider text-[#6B4773] font-bold truncate max-w-[180px]">
                {data.shop_name} {data.city ? `· ${data.city}` : ''}
              </p>
            </div>
          </div>

          <Link
            href={`/${store}/all`}
            className="w-10 h-10 rounded-2xl bg-white border border-[#E0E1F6] shadow-sm flex items-center justify-center text-[#231F48] hover:bg-[#F8F7FC] transition-colors relative"
            aria-label="View all products"
          >
            <LayoutGrid size={18} className="text-[#231F48]" />
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#BB3F95] text-white text-[9px] font-extrabold flex items-center justify-center shadow-sm">
              {data.total_products > 99 ? '99+' : data.total_products}
            </span>
          </Link>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 pt-5 pb-8">
        {/* ── Headline Area (Spec #9 Discovery) ── */}
        <div className="mb-5">
          <h2 className="text-2xl font-extrabold text-[#231F48] font-marcellus leading-tight">
            Find the best<br />collections for you
          </h2>
          <p className="text-xs text-[#6B4773] font-medium mt-1">
            Explore curated ethnic fashion and designer wear
          </p>
        </div>

        {/* ── Category Cards Grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
          {/* All Products tile */}
          <Link
            href={`/${store}/all`}
            className="group bg-white rounded-[28px] overflow-hidden border border-[#E0E1F6] shadow-sm hover:shadow-md transition-all flex flex-col p-1.5"
          >
            <div className="w-full aspect-[4/3] bg-gradient-to-br from-[#231F48] to-[#560A39] rounded-[24px] relative flex items-center justify-center overflow-hidden">
              <LayoutGrid size={32} className="text-white opacity-90 group-hover:scale-110 transition-transform duration-300" />
              <div className="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md">
                <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                  {data.total_products} Items
                </span>
              </div>
            </div>
            <div className="p-3 bg-white flex flex-col justify-between flex-1">
              <p className="text-xs font-bold text-[#231F48] font-marcellus truncate">All Products</p>
              <p className="text-[11px] text-[#BB3F95] font-bold mt-1">
                Explore catalog →
              </p>
            </div>
          </Link>

          {/* New Arrivals tile (21-day auto window) */}
          {data.new_arrivals_count > 0 && (
            <Link
              href={`/${store}/categories/new-arrivals`}
              className="group bg-white rounded-[28px] overflow-hidden border border-[#BB3F95]/30 shadow-sm hover:shadow-md transition-all flex flex-col p-1.5"
            >
              <div className="w-full aspect-[4/3] bg-gradient-to-br from-[#BB3F95] to-[#8C1D6B] rounded-[24px] relative flex items-center justify-center overflow-hidden">
                <Sparkles size={32} className="text-white opacity-95 group-hover:scale-110 transition-transform duration-300 animate-pulse" />
                <div className="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full bg-white/25 backdrop-blur-md">
                  <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                    {data.new_arrivals_count} New
                  </span>
                </div>
              </div>
              <div className="p-3 bg-white flex flex-col justify-between flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-[#231F48] font-marcellus truncate">New Arrivals</p>
                  <span className="px-1.5 py-0.2 rounded-md bg-fuchsia-50 text-[9px] font-bold text-[#BB3F95]">21 Days</span>
                </div>
                <p className="text-[11px] text-[#BB3F95] font-bold mt-1">
                  Fresh catalog →
                </p>
              </div>
            </Link>
          )}

          {data.categoryList.map((cat) => (
            <Link
              key={cat.id}
              href={`/${store}/categories/${cat.id}`}
              className="group bg-white rounded-[28px] overflow-hidden border border-[#E0E1F6] shadow-sm hover:shadow-md transition-all flex flex-col p-1.5"
            >
              <div className="w-full aspect-[4/3] bg-[#E0E1F6] rounded-[24px] relative overflow-hidden">
                {cat.image_url ? (
                  <Image
                    src={cat.image_url}
                    alt={cat.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                    sizes="(max-width: 640px) 50vw, 240px"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl bg-[#FAF9FE]">🗂️</div>
                )}
                <div className="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full bg-[#231F48]/85 backdrop-blur-md">
                  <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                    {cat.product_count} {cat.product_count === 1 ? 'Item' : 'Items'}
                  </span>
                </div>
              </div>
              <div className="p-3 bg-white flex flex-col justify-between flex-1">
                <p className="text-xs font-bold text-[#231F48] font-marcellus truncate">{cat.name}</p>
                <p className="text-[11px] text-[#BB3F95] font-bold mt-1">
                  View collection →
                </p>
              </div>
            </Link>
          ))}
        </div>
      </main>

      {/* LocalBusiness structured data (F-031) */}
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD from our own retailer data, no user input
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessLd(data, store)) }}
      />
    </div>
  );
}
