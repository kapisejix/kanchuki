import { API_URL as apiUrl } from '@/lib/apiUrl';
import type { PublicCollection } from '@kanchuki/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CollectionView } from '../c/[slug]/components/CollectionView';
import { ContactGate } from './components/ContactGate';
import { buildStoreDescription, localBusinessLd, storeOgImage } from './lib/store-seo';

export interface RetailerProfile {
  shop_name: string;
  city: string | null;
  state: string | null;
  address_line1: string | null;
  address_line2: string | null;
  categories: string[];
  logo_url: string | null;
  banner_url: string | null;
  storefront_slug: string | null;
}

interface Props {
  params: Promise<{ store: string }>;
}

async function fetchProfile(store: string): Promise<RetailerProfile | null> {
  try {
    const res = await fetch(`${apiUrl}/v1/public/retailers/${store}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data: RetailerProfile };
    return json.data;
  } catch {
    return null;
  }
}

// #4: the store root also fetches the all-products listing so the catalog can
// render in place once the contact gate passes — no hard hop to /categories.
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
  const profile = await fetchProfile(store);
  if (!profile) return { title: 'Store Not Found | Kanchuki' };

  // Store-specific meta (F-031): the store's own name, logo/banner og:image,
  // and a description built from its real details (city/state/categories) —
  // not the platform's default Kanchuki branding.
  const description = buildStoreDescription(profile);
  const ogImage = storeOgImage(profile);

  return {
    title: `${profile.shop_name}${profile.city ? ` — ${profile.city}` : ''} | Kanchuki`,
    description,
    alternates: { canonical: `/${store}` },
    openGraph: {
      title: profile.shop_name,
      description,
      type: 'website',
      url: `/${store}`,
      images: ogImage ? [{ url: ogImage, alt: profile.shop_name }] : [],
    },
    twitter: {
      card: 'summary',
      title: profile.shop_name,
      description,
      images: ogImage ? [ogImage] : [],
    },
  };
}

export default async function StoreProfilePage({ params }: Props) {
  const { store } = await params;
  const profile = await fetchProfile(store);
  if (!profile) notFound();

  // #4: catalog rendered behind the gate — ContactGate reveals these children
  // instead of router.replace'ing to /categories (removes one full-page load
  // per visit). Mirrors the /all route's data + CollectionView props exactly.
  const data = await fetchAllProducts(store, { page: 1, pageSize: 12 });

  return (
    <>
      {/* LocalBusiness structured data — city/state/address feed Google's local
          ranking without needing the city in the URL (F-031). */}
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD from our own retailer data, no user input
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessLd(profile, store)) }}
      />
      <ContactGate slug={store} profile={profile}>
        {data ? (
          <CollectionView
            collection={data}
            slug={`all-${store}`}
            store={store}
            productsApiPath={`/api/${store}/products`}
          />
        ) : null}
      </ContactGate>
    </>
  );
}