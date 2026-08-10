import { API_URL as apiUrl } from '@/lib/apiUrl';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContactGate } from './components/ContactGate';

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store } = await params;
  const profile = await fetchProfile(store);
  if (!profile) return { title: 'Store Not Found | Kanchuki' };

  return {
    title: `${profile.shop_name} | Kanchuki`,
    description: `Visit ${profile.shop_name}${profile.city ? `, ${profile.city}` : ''} on Kanchuki`,
  };
}

export default async function StoreProfilePage({ params }: Props) {
  const { store } = await params;
  const profile = await fetchProfile(store);
  if (!profile) notFound();

  return <ContactGate slug={store} profile={profile} />;
}
