'use client';

import type { PublicCollection, PublicProductDetail } from '@kanchuki/shared';
import { formatPriceRange } from '@kanchuki/shared';
import { ArrowLeft, Info, MessageCircle, ShoppingBag, Sparkles, Star } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ContactGate } from '@/app/[store]/components/ContactGate';
import { KanchukiBrandBar } from './KanchukiBrandBar';
import { ProductGallery } from './ProductGallery';
import { ReviewForm } from './StarPicker';
import { CustomerConsentModal } from './CustomerConsentModal';

interface Props {
  collection: PublicCollection;
  product: PublicProductDetail;
  // Canonical base path for this collection (e.g. /meera-sarees/festive-edit
  // or the legacy /c/festive-edit) — where the back-to-catalog CTA points.
  collectionPath: string;
}

const leadKey = (slug: string) => `kanchuki_lead_${slug}`;

export function SharedProductPage({ collection, product, collectionPath }: Props) {
  const router = useRouter();
  const shop = collection.retailer.shop_name;
  const city = collection.retailer.city;
  const isSold = product.status === 'SOLD';
  const isReserved = product.status === 'RESERVED';
  const [showConsentModal, setShowConsentModal] = useState(false);

  const storeSlug = collection.retailer.public_slug;
  const catalogTarget = storeSlug
    ? collectionPath.startsWith(`/${storeSlug}/categories/`) || collectionPath === `/${storeSlug}/all`
      ? collectionPath
      : collectionPath.includes(`/all-`) || collectionPath.endsWith('/all')
        ? `/${storeSlug}/all`
        : collectionPath.includes(`/cat-`)
          ? `/${storeSlug}/categories/${collectionPath.slice(collectionPath.indexOf('/cat-') + 5)}`
          : collectionPath
    : collectionPath;

  const [needsLead, setNeedsLead] = useState(() => Boolean(storeSlug));
  useEffect(() => {
    if (!storeSlug) return;
    setNeedsLead(!localStorage.getItem(leadKey(storeSlug)));
  }, [storeSlug]);

  useEffect(() => {
    window.history.pushState({ kanchukiSharedEntry: true }, '', window.location.href);
    const onPopState = () => router.push(catalogTarget);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [catalogTarget, router]);

  const galleryAlt = product.name ?? product.subtype ?? product.category ?? 'Product';

  if (needsLead && storeSlug) {
    return (
      <ContactGate
        slug={storeSlug}
        profile={{
          shop_name: shop,
          city,
          logo_url: collection.retailer.logo_url,
        }}
        onSuccess={() => setNeedsLead(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7FC] font-sans pb-16">
      {/* ── Header — back to the catalog ── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E0E1F6]">
        <KanchukiBrandBar />
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            href={catalogTarget}
            className="w-9 h-9 rounded-2xl bg-white border border-[#E0E1F6] flex items-center justify-center text-[#231F48] shadow-sm hover:border-[#BB3F95] transition"
            aria-label="Back to catalog"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-[#231F48] to-[#560A39] text-white flex items-center justify-center font-serif font-bold text-xs shadow-sm">
              {shop.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 text-center">
              <h1 className="font-bold text-xs text-[#231F48] truncate max-w-[200px]">
                {shop}
              </h1>
              {city && <p className="text-[10px] text-[#6B4773] font-medium">{city}</p>}
            </div>
          </div>
          <Link
            href={catalogTarget}
            className="w-9 h-9 rounded-2xl bg-white border border-[#E0E1F6] flex items-center justify-center text-[#231F48] shadow-sm hover:border-[#BB3F95] transition"
            aria-label="Catalog"
          >
            <ShoppingBag size={16} />
          </Link>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-4 space-y-4">
        {/* ── Swipeable photo/variant gallery with floating thumbnail strip ── */}
        <ProductGallery
          photos={product.photos}
          variants={product.variants.map((v) => ({
            color: v.color,
            photoUrl: v.photo_url,
            status: v.status,
          }))}
          alt={galleryAlt}
          isSold={isSold}
          isReserved={isReserved}
        />

        {/* ── Price & Title Section (Spec #12) ── */}
        <div className="flex justify-between items-start pt-1">
          <div>
            <h2 className="text-2xl font-extrabold text-[#231F48] font-sans">
              {formatPriceRange(product.price_min, product.price_max)}
            </h2>
            <p className="text-xs text-[#6B4773] font-bold mt-0.5">
              {product.category ?? 'Salwar Suits'} • Festive Collection
            </p>
            {product.rating_count > 0 && (
              <div className="flex items-center gap-1 mt-1">
                <Star size={13} className="text-[#BB3F95] fill-[#BB3F95]" />
                <span className="text-xs font-bold text-[#231F48]">
                  {(product.avg_rating ?? 0).toFixed(1)}
                </span>
                <span className="text-[10px] text-[#6B4773]">
                  ({product.rating_count})
                </span>
              </div>
            )}
          </div>
          {product.name && (
            <div className="text-right">
              <span className="text-xs font-extrabold text-[#231F48] block truncate max-w-[150px]">
                {product.name}
              </span>
              <span className="text-[10px] text-[#6B4773] font-semibold bg-[#E0E1F6]/60 px-2 py-0.5 rounded-md">
                {product.subtype ?? 'Ethnic'}
              </span>
            </div>
          )}
        </div>

        {/* ── AI Summary Card ── */}
        {product.description && (
          <div className="p-4 bg-gradient-to-br from-[#FAF9FE] to-[#F2F1FA] border border-[#E0E1F6] rounded-[24px] shadow-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles size={14} className="text-[#BB3F95]" />
              <span className="text-xs font-bold text-[#BB3F95] uppercase tracking-wider">AI Summary</span>
            </div>
            <p className="text-xs text-[#231F48] leading-relaxed font-medium">
              {product.description}
            </p>
          </div>
        )}

        {/* ── Product Specifications Card ── */}
        <div className="p-4 bg-white border border-[#E0E1F6] rounded-[24px] shadow-sm space-y-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Info size={14} className="text-[#6B4773]" />
            <span className="text-xs font-bold text-[#231F48] uppercase tracking-wider">Product Info</span>
          </div>
          {product.name && (
            <div className="flex justify-between text-xs py-1 border-b border-[#E0E1F6]/60">
              <span className="text-[#6B4773] font-medium">Name</span>
              <span className="font-bold text-[#231F48]">{product.name}</span>
            </div>
          )}
          {product.fabric_estimate && (
            <div className="flex justify-between text-xs py-1 border-b border-[#E0E1F6]/60">
              <span className="text-[#6B4773] font-medium">Fabric</span>
              <span className="font-bold text-[#231F48]">{product.fabric_estimate}</span>
            </div>
          )}
          {product.subtype && (
            <div className="flex justify-between text-xs py-1">
              <span className="text-[#6B4773] font-medium">Type</span>
              <span className="font-bold text-[#231F48]">{product.subtype}</span>
            </div>
          )}
        </div>

        {/* ── Family Sizing Selector Card ── */}
        <div className="p-4 bg-white border border-[#E0E1F6] rounded-[24px] shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">👥</span>
              <h4 className="text-xs font-bold text-[#231F48]">Shopping for Family?</h4>
            </div>
            <span className="text-xs font-bold text-[#BB3F95] cursor-pointer">+ Add</span>
          </div>
          <p className="text-[10px] text-[#6B4773]">Save family sizes to find the right fit when gifting</p>
          
          <div className="flex items-center justify-between p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-emerald-800">Your size: XL</span>
            </div>
            <span className="text-xs font-extrabold text-emerald-700">✓</span>
          </div>
        </div>

        {/* ── Available Sizes ── */}
        {product.sizes.length > 0 && (
          <div className="p-4 bg-white border border-[#E0E1F6] rounded-[24px] shadow-sm">
            <p className="text-xs text-[#6B4773] font-bold uppercase tracking-wider mb-2.5">Available Sizes</p>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((size) => (
                <span
                  key={size}
                  className="text-xs font-bold bg-[#FAF9FE] border border-[#E0E1F6] text-[#231F48] px-3.5 py-1.5 rounded-xl"
                >
                  {size}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Dual CTA Action Buttons ── */}
        {!isSold && (
          <div className="space-y-3 pt-2">
            <button
              onClick={() => setShowConsentModal(true)}
              className="w-full py-4 px-5 rounded-3xl bg-gradient-to-r from-[#231F48] to-[#560A39] text-white flex items-center justify-center gap-2.5 shadow-lg shadow-[#231F48]/25 hover:shadow-xl transition-all active:scale-[0.98]"
            >
              <MessageCircle size={18} className="fill-current text-emerald-400" />
              <span className="text-sm font-extrabold text-white">Enquire Now</span>
            </button>

            <Link
              href={catalogTarget}
              className="flex items-center justify-center gap-2 w-full font-bold py-3.5 rounded-3xl bg-white border border-[#E0E1F6] text-[#231F48] shadow-sm hover:border-[#BB3F95] transition text-xs uppercase tracking-wider"
            >
              <ShoppingBag size={16} />
              View Full Catalog
            </Link>
          </div>
        )}

        {/* ── Rate this product Review Form ── */}
        <div className="pt-2">
          <ReviewForm
            productName={product.name ?? product.category ?? 'this product'}
            retailerId={collection.retailer.id}
            productId={product.id}
            retailerName={shop}
          />
        </div>

        <p className="text-center text-[10px] text-[#6B4773] mt-4">
          Shared from {shop}
          {city ? `, ${city}` : ''} via Kanchuki Direct Boutique Connect
        </p>
      </main>

      {/* Customer WhatsApp Lead & Consent Modal (Spec #13) */}
      {showConsentModal && (
        <CustomerConsentModal
          product={product}
          retailer={collection.retailer}
          collectionTitle={collection.title}
          onClose={() => setShowConsentModal(false)}
        />
      )}
    </div>
  );
}

