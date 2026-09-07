import { API_URL as apiUrl } from '@/lib/apiUrl';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, Store } from 'lucide-react';
import Link from 'next/link';
import { DesignShareActions } from './DesignShareActions';
import { fetchStoreProfile } from '../lib';
import type { PublicShowcaseDesignDetail } from '../types';

interface Props {
  params: Promise<{ store: string; id: string }>;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kanchuki.app';

// Public permalink data — /v1/public/showcase-designs/:id returns is_active
// rows only (the API 404s inactive/deleted), so a 404 here means gone or
// unpublished. The public row carries the owner store when the design is
// retailer-owned; global rows (retailer_id null) have store: null and render
// under any store URL with the store's own identity.
async function fetchDesign(id: string): Promise<PublicShowcaseDesignDetail | null> {
  try {
    const res = await fetch(`${apiUrl}/v1/public/showcase-designs/${id}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data: PublicShowcaseDesignDetail };
    return json.data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store, id } = await params;
  const [design, profile] = await Promise.all([fetchDesign(id), fetchStoreProfile(store)]);
  if (!design || !profile) return { title: 'Design Not Found | Kanchuki' };

  // Owner store wins for the byline; a global design (store: null) renders
  // under the visiting store's identity. A retailer-owned design on a foreign
  // store URL is a cross-store leak → the page 404s (checked in the body), so
  // metadata here only ever names the right store.
  const shopName = design.store?.shop_name ?? profile.shop_name;
  const titleText = design.name ?? `${design.category.name ?? 'Design'} design`;
  const description = `${titleText} — design inspiration from ${shopName}. View the full collection on Kanchuki.`;

  return {
    title: `${titleText} — ${shopName} | Kanchuki`,
    description,
    alternates: { canonical: `/${store}/designs/${id}` },
    openGraph: {
      title: `${titleText} — ${shopName}`,
      description,
      type: 'website',
      url: `${SITE_URL}/${store}/designs/${id}`,
      // The watermarked design image is the whole point of sharing — WhatsApp
      // previews render it directly (R2 URLs are absolute).
      images: design.image_url ? [{ url: design.image_url, alt: titleText }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${titleText} — ${shopName}`,
      description,
      images: design.image_url ? [design.image_url] : [],
    },
  };
}

export default async function DesignPermalinkPage({ params }: Props) {
  const { store, id } = await params;
  const [design, profile] = await Promise.all([fetchDesign(id), fetchStoreProfile(store)]);
  if (!design || !profile) notFound();

  // Cross-store leak guard: a retailer-owned design must be served under its
  // own store URL. Global rows have no owner and render under any store.
  const ownerSlug = design.store?.slug ?? null;
  if (ownerSlug && ownerSlug !== store) notFound();

  const shopName = design.store?.shop_name ?? profile.shop_name;
  const titleText = design.name ?? `${design.category.name ?? 'Design'} design`;

  return (
    <div className="min-h-screen bg-[#F8F7FC] font-sans pb-12">
      {/* ── Storefront header — back to designs, shop identity ── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E0E1F6] pt-safe">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link
            href={`/${store}/designs`}
            prefetch
            className="w-9 h-9 rounded-2xl bg-white border border-[#E0E1F6] flex items-center justify-center text-[#231F48] shadow-sm hover:border-[#BB3F95] transition"
            aria-label="Back to designs"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0 text-center">
            <p className="text-xs font-bold text-[#231F48] truncate">{shopName}</p>
            <p className="text-[10px] text-[#6B4773] font-medium">Design inspiration</p>
          </div>
          <div className="w-9 h-9 rounded-2xl overflow-hidden bg-[#E0E1F6] border border-[#E0E1F6] flex items-center justify-center flex-shrink-0">
            {profile.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- storefront avatar
              <img src={profile.logo_url} alt={shopName} className="object-cover w-full h-full" />
            ) : (
              <span className="font-bold text-[#231F48] text-sm">{shopName.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6">
        {/* ── Watermarked design image ── */}
        <div className="relative w-full aspect-[3/4] rounded-3xl overflow-hidden bg-[#F8F7FC] border border-[#E0E1F6] shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element -- plain <img> keeps the watermarked R2 file untouched by the optimiser */}
          <img src={design.image_url} alt={titleText} className="object-cover w-full h-full" />
        </div>

        <h1 className="text-lg font-bold text-[#231F48] mt-5 text-center">{titleText}</h1>
        <p className="text-xs text-[#6B4773] font-medium mt-1 text-center">
          {design.category.name ?? 'Design'}
          {design.store ? ` · from ${shopName}` : ` · ${shopName}`}
        </p>

        {/* ── Share actions (Web Share / WhatsApp / copy) ── */}
        <DesignShareActions name={titleText} permalink={`${SITE_URL}/${store}/designs/${id}`} imageUrl={design.image_url} />

        {/* ── Visit store CTA ── */}
        <Link
          href={`/${store}`}
          prefetch
          className="mt-3 flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl border border-[#E0E1F6] bg-white text-[#BB3F95] font-bold text-sm shadow-sm hover:border-[#BB3F95] transition"
        >
          <Store size={17} />
          Visit store
        </Link>

        <p className="text-center text-[10px] text-[#6B4773] mt-6">
          Shared via Kanchuki — design inspiration for your next outfit
        </p>
      </main>
    </div>
  );
}
