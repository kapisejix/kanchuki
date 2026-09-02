'use client';

import type { PublicCollection } from '@kanchuki/shared';
import {
  buildEnquiryMessage,
  buildWhatsAppEnquiryLink,
  formatPriceRange,
} from '@kanchuki/shared';
import { ArrowLeft, Heart, LayoutGrid, MapPin, MessageCircle, ShoppingBag } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KanchukiBrandBar } from '../components/KanchukiBrandBar';
import { type WishlistItem, loadWishlist } from '../lib/wishlist';

interface Props {
  collection: PublicCollection;
  slug: string;
  // Store URL segment (public_slug). Null = legacy /c/{slug} URLs.
  store?: string | null;
  // Correct "back to catalog" target for this listing (category / All
  // Products browse pages pass their real page URL — the pseudo-slug has no
  // page behind it). Defaults to the standard collection basePath.
  backHref?: string;
}

export function WishlistView({ collection, slug, store, backHref }: Props) {
  const basePath = store ? `/${store}/${slug}` : `/c/${slug}`;
  const browseHref = backHref ?? basePath;
  const [savedMap, setSavedMap] = useState<Map<string, WishlistItem> | null>(null);

  useEffect(() => {
    setSavedMap(loadWishlist(slug));
  }, [slug]);

  const savedProducts = useMemo(
    () => (savedMap === null ? [] : collection.products.filter((p) => savedMap.has(p.id))),
    [savedMap, collection.products],
  );

  const handleEnquireAll = useCallback(() => {
    const message = buildEnquiryMessage({
      shopName: collection.retailer.shop_name,
      collectionTitle: collection.title,
      products: savedProducts.length > 0 ? savedProducts : collection.products.slice(0, 3),
    });
    const url = buildWhatsAppEnquiryLink(collection.retailer.phone, message);
    window.open(url, '_blank');
  }, [collection, savedProducts]);

  if (savedMap === null) return null;

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <KanchukiBrandBar />
        <div className="max-w-md mx-auto px-4 py-3.5 flex items-center gap-3">
          <Link
            href={browseHref}
            className="p-2 -ml-2 rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Back to catalog"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="font-display text-lg font-bold text-gray-900">
            Selected Products {savedProducts.length > 0 && `(${savedProducts.length})`}
          </h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-3 py-4 pb-28">
        {savedProducts.length === 0 ? (
          <div className="text-center py-20 px-6">
            <div className="w-16 h-16 rounded-2xl bg-cyan-50 flex items-center justify-center mx-auto mb-4">
              <Heart size={26} className="text-cyan-400" />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">No selected items yet</p>
            <p className="text-xs text-gray-400 mb-4">
              Tap the heart on any product to add it here.
            </p>
            <Link
              href={browseHref}
              className="inline-block text-cyan-700 bg-cyan-50 hover:bg-cyan-100 text-sm font-semibold px-4 py-2 rounded-full transition-colors"
            >
              Browse catalog
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {savedProducts.map((product) => (
              <div
                key={product.id}
                className="bg-white rounded-2xl overflow-hidden shadow-soft border border-gray-100"
              >
                <div className="relative w-full aspect-[3/4] bg-gray-50">
                  {product.primary_photo_url ? (
                    <Image
                      src={product.primary_photo_url}
                      alt={product.name ?? product.category ?? 'Product'}
                      fill
                      sizes="(max-width: 640px) 45vw, 200px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ShoppingBag size={32} className="text-gray-300" />
                    </div>
                  )}
                </div>
                <div className="p-2.5 space-y-1">
                  <p className="font-display text-sm font-bold tabular-nums text-gray-900">
                    {formatPriceRange(product.price_min, product.price_max)}
                  </p>
                  {product.location && (
                    <p className="flex items-center gap-1 text-xs text-cyan-700 truncate">
                      <MapPin size={11} className="flex-shrink-0" />
                      {product.location}
                    </p>
                  )}
                  {product.primary_color && (
                    <p className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-gray-200 flex-shrink-0"
                        style={{ backgroundColor: product.primary_color.toLowerCase() }}
                      />
                      {product.primary_color}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Fixed Bottom Overlay Nav: Catalog, Saved, Enquire ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-gray-100 shadow-[0_-8px_24px_-12px_rgb(0,0,0,0.08)]">
        <div className="max-w-md mx-auto grid grid-cols-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <Link
            href={browseHref}
            className="flex flex-col items-center justify-center gap-0.5 py-1 text-gray-500 hover:text-cyan-600 transition-colors"
          >
            <LayoutGrid size={20} />
            <span className="text-[10px] font-semibold">Catalog</span>
          </Link>
          <Link
            href={`${basePath}/wishlist`}
            className="flex flex-col items-center justify-center gap-0.5 py-1 text-rose-500 font-semibold relative"
          >
            <div className="relative">
              <Heart
                size={20}
                className={savedProducts.length > 0 ? 'text-rose-500 fill-rose-500' : ''}
              />
              {savedProducts.length > 0 && (
                <span className="absolute -top-1 -right-2.5 min-w-[16px] h-4 px-1 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                  {savedProducts.length}
                </span>
              )}
            </div>
            <span className="text-[10px] font-semibold">Saved</span>
          </Link>
          <button
            onClick={handleEnquireAll}
            className="flex flex-col items-center justify-center gap-0.5 py-1 text-emerald-600 hover:text-emerald-700 active:scale-95 transition-all"
          >
            <MessageCircle size={20} />
            <span className="text-[10px] font-semibold">Enquire</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
