import { API_URL as apiUrl } from '@/lib/apiUrl';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DesignsBrowse } from './DesignsBrowse';
import { fetchStoreProfile, type StoreProfile } from './lib';
import type { BrowseResponse } from './types';

interface Props {
  params: Promise<{ store: string }>;
  searchParams?: Promise<{ category?: string; ref?: string }>;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kanchuki.app';

// The designs browser (/{store}/designs) — the "View more" target from the
// product-detail strip, opened in a new tab (docs/tasks/suits-designs.md §2.4).
// Store-scoped feed: global rows + the store's own, filtered by an optional
// ?category= slug. `ref` (a product id) is provenance only — the feed itself
// is store-scoped, not product-scoped.
async function fetchBrowse(
  store: string,
  category?: string,
): Promise<BrowseResponse | null> {
  const qs = new URLSearchParams({ store });
  if (category) qs.set('category', category);
  try {
    const res = await fetch(`${apiUrl}/v1/public/showcase-designs?${qs}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data: BrowseResponse };
    return json.data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { store } = await params;
  const { category } = (await searchParams) ?? {};
  const [profile, browse] = await Promise.all([
    fetchStoreProfile(store),
    fetchBrowse(store, category),
  ]);
  if (!profile || !browse) return { title: 'Store Not Found | Kanchuki' };

  const shop = profile.shop_name;
  const city = profile.city;
  const ogImage = profile.logo_url ?? profile.banner_url;
  return {
    title: `${category ? `${browse.designs[0]?.category.name ?? 'Designs'} — ` : ''}${shop} Designs${city ? `, ${city}` : ''} | Kanchuki`,
    description: `Browse design inspiration from ${shop}${city ? ` in ${city}` : ''} — ${browse.designs.length} designs to love and recreate.`,
    alternates: { canonical: `/${store}/designs` },
    openGraph: {
      title: `${shop} Designs`,
      description: `Browse design inspiration from ${shop}${city ? ` in ${city}` : ''}.`,
      url: `${SITE_URL}/${store}/designs`,
      images: ogImage ? [{ url: ogImage }] : [],
    },
  };
}

export default async function DesignsBrowsePage({ params, searchParams }: Props) {
  const { store } = await params;
  const { category } = (await searchParams) ?? {};

  const [profile, browse] = await Promise.all([
    fetchStoreProfile(store),
    fetchBrowse(store, category),
  ]);
  if (!profile || !browse) notFound();

  return <DesignsBrowse store={store} profile={profile} initialData={browse} initialCategory={category ?? null} />;
}
