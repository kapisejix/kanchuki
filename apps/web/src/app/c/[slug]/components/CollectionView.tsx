'use client';

import type { PublicCollection, PublicProduct } from '@kanchuki/shared';
import { buildEnquiryMessage, buildWhatsAppEnquiryLink, formatPriceRange } from '@kanchuki/shared';
import { Filter, Heart, MessageCircle, Share2, ShoppingBag, Sparkles, Star, Calendar, ChevronRight, LayoutGrid } from 'lucide-react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type WishlistItem,
  loadWishlist,
  productToWishlistItem,
  saveWishlist,
  wishlistKey,
} from '../lib/wishlist';
import { CategoryChips, FilterBar } from './FilterBar';
import { PageTransitionWrapper } from '@/components/PageTransitionWrapper';

// Lazy-load sheet and modal — only fetched when user taps a product or try-on.
// The components include image carousels, forms, and heavy lucide icons that
// should not block the initial page render.
const ProductDetailSheet = dynamic(
  () => import('./ProductDetailSheet').then((m) => m.ProductDetailSheet),
  { ssr: false },
);
const TryOnModal = dynamic(() => import('./TryOnModal').then((m) => m.TryOnModal), { ssr: false });
const BookingForm = dynamic(() => import('./BookingForm').then((m) => m.BookingForm), { ssr: false });
const PromotionBanner = dynamic(() => import('./PromotionBanner').then((m) => m.PromotionBanner), { ssr: false });
const RecentlyViewed = dynamic(() => import('./RecentlyViewedRow').then((m) => m.RecentlyViewed), { ssr: false });
const StyleQuiz = dynamic(() => import('./StyleQuiz').then((m) => m.StyleQuiz), { ssr: false });
const AIStylist = dynamic(() => import('./AIStylist').then((m) => m.AIStylist), { ssr: false });
const RegionalFilters = dynamic(() => import('./RegionalFilters').then((m) => m.RegionalFilters), { ssr: false });
const CustomerReferral = dynamic(() => import('./CustomerReferral').then((m) => m.CustomerReferral), { ssr: false });

// VTO hidden for launch — backend live but buttons removed per pre-launch checklist.
const TRY_ON_ENABLED = false;

const PAGE_SIZE = 12;

interface Props {
  collection: PublicCollection;
  slug: string;
  // Store URL segment (public_slug) — canonical collection URLs are
  // /{store}/{slug}. Null/undefined keeps legacy /c/{slug} URLs (used by the
  // legacy /c/[slug] fallback for retailers without a store slug).
  store?: string | null;
  // Web proxy path this flow's paginated/filtered product fetches go through
  // — differs for a plain collection vs. a category listing (both render
  // this same component). See apps/web/src/app/api/c/[slug]/products and
  // apps/web/src/app/api/store/[slug]/categories/[categoryId]/products.
  productsApiPath: string;
}

export function CollectionView({ collection, slug, store, productsApiPath }: Props) {
  // Canonical base path for this collection's sub-flows (cart/wishlist) and
  // their API proxies. store=null ⇒ legacy /c/{slug} form.
  const basePath = store ? `/${store}/${slug}` : `/c/${slug}`;
  const apiBasePath = store ? `/api/${store}/${slug}` : `/api/c/${slug}`;
  // Start EMPTY and hydrate from localStorage in an effect — reading
  // localStorage during render (useState initializer) makes the client's
  // first render differ from SSR HTML (server always renders an empty Map),
  // which trips React hydration errors #418/#422 on the collection page.
  // Same deferred-load pattern as WishlistView/CartPage/CheckoutForm.
  const [favorites, setFavorites] = useState<Map<string, WishlistItem>>(new Map());
  useEffect(() => {
    setFavorites(loadWishlist(slug));
  }, [slug]);
  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterPrice, setFilterPrice] = useState<string | null>(null);
  const [filterColor, setFilterColor] = useState<string | null>(null);
  const [filterRegional, setFilterRegional] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [tryOnProduct, setTryOnProduct] = useState<PublicProduct | null>(null);
  const [showBooking, setShowBooking] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizDone, setQuizDone] = useState(false);

  // Check if quiz was already completed for this store
  useEffect(() => {
    try {
      const existing = localStorage.getItem(`kanchuki_quiz_${slug}`)
      if (existing) setQuizDone(true)
    } catch {}
  }, [slug])

  // F-302: Check if the retailer has online checkout enabled.
  // Goes through the web proxy (/api/c/[slug]/checkout-status) — a relative
  // /v1/... fetch would 404 on the web origin (no /v1 routes/rewrites) and
  // silently leave checkout disabled for every retailer.
  const [checkoutEnabled, setCheckoutEnabled] = useState(false);
  useEffect(() => {
    fetch(`${apiBasePath}/checkout-status`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data?.checkout_enabled) setCheckoutEnabled(true);
      })
      .catch(() => undefined);
  }, [apiBasePath]);

  // Fire-and-forget view tracking so the retailer's dashboard "Views" stat
  // increments. The /view endpoint writes a CollectionView row server-side.
  useEffect(() => {
    void fetch(`${apiBasePath}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => undefined)
  }, [apiBasePath])

  // Product list, pagination, and loading are now server-driven — the initial
  // page comes from SSR (`collection`), further pages/filter changes refetch
  // through productsApiPath.
  const [products, setProducts] = useState(collection.products);
  const [total, setTotal] = useState(collection.total);
  const [page, setPage] = useState(collection.page);
  const [loading, setLoading] = useState(false);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isFirstRun = useRef(true);

  // Fetch-on-demand cache: products seen this session are cached here for
  // the "Enquire about N items" detail resolution when a favorite wasn't
  // captured at heart-click time (e.g. a session restored from a cold load).
  // Primary source of truth is now the wishlist itself (product summaries
  // stored in localStorage), so this cache is strictly a fallback.
  const productCacheRef = useRef<Map<string, PublicProduct>>(
    new Map(collection.products.map((p) => [p.id, p])),
  );

  const fetchProducts = useCallback(
    async (
      nextPage: number,
      filters: {
        category: string | null;
        price: string | null;
        color: string | null;
      },
    ) => {
      setLoading(true);
      const qs = new URLSearchParams({ page: String(nextPage), pageSize: String(PAGE_SIZE) });
      if (filters.category) qs.set('category', filters.category);
      if (filters.price) qs.set('price', filters.price);
      if (filters.color) qs.set('color', filters.color);
      if ((filters as { regional?: string }).regional) qs.set('regional', (filters as { regional?: string }).regional!);
      try {
        const res = await fetch(`${productsApiPath}?${qs}`);
        if (!res.ok) return;
        const json = (await res.json()) as { data: PublicCollection };
        setProducts(json.data.products);
        setTotal(json.data.total);
        setPage(json.data.page);
        for (const p of json.data.products) {
          productCacheRef.current.set(p.id, p);
        }
      } finally {
        setLoading(false);
      }
    },
    [productsApiPath],
  );

  // Filter change → refetch page 1. Skips the very first run since SSR
  // already fetched page 1 with no filters applied.
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }      void fetchProducts(1, {
        category: filterCategory,
        price: filterPrice,
        color: filterColor,
        regional: filterRegional,
      } as Parameters<typeof fetchProducts>[1]);
  }, [filterCategory, filterPrice, filterColor, filterRegional, fetchProducts]);

  const goToPage = useCallback(
    (nextPage: number) => {
      void fetchProducts(nextPage, {
        category: filterCategory,
        price: filterPrice,
        color: filterColor,
        regional: filterRegional,
      } as Parameters<typeof fetchProducts>[1]);
    },
    [fetchProducts, filterCategory, filterPrice, filterColor, filterRegional],
  );

  const toggleFavorite = useCallback(
    (
      productId: string,
      product?: {
        name: string | null;
        price_min: number | null;
        price_max: number | null;
        category: string | null;
      },
    ) => {
      setFavorites((prev) => {
        const next = new Map(prev);
        if (next.has(productId)) {
          next.delete(productId);
        } else {
          // Store product summary at heart-click time (we have the product
          // object in hand) — this is the core F-006 fix: no more bare IDs.
          next.set(
            productId,
            productToWishlistItem({
              id: productId,
              name: product?.name ?? null,
              price_min: product?.price_min ?? null,
              price_max: product?.price_max ?? null,
              category: product?.category ?? null,
            }),
          );
          // Fire-and-forget analytics ping
          void fetch(`${apiBasePath}/favorite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: productId }),
          });
        }
        saveWishlist(slug, next);
        return next;
      });
    },
    [apiBasePath, slug],
  );

  // Resolve favorite items: try stored summaries first, fall back to session cache
  const favoriteProducts: Array<{
    id: string;
    name: string | null;
    price_min: number | null;
    price_max: number | null;
    category: string | null;
  }> = Array.from(favorites.values()).map((item) =>
    item.name ? item : (productCacheRef.current.get(item.id) ?? item),
  );

  const handleEnquireAll = useCallback(() => {
    const message = buildEnquiryMessage({
      shopName: collection.retailer.shop_name,
      collectionTitle: collection.title,
      products: favoriteProducts.length > 0 ? favoriteProducts : products.slice(0, 3),
    });
    const url = buildWhatsAppEnquiryLink(collection.retailer.phone, message);
    window.open(url, '_blank');
  }, [collection, favoriteProducts, products]);

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: collection.title, url });
    } else {
      await navigator.clipboard.writeText(url);
    }
  }, [collection.title]);

  const bannerUrl = collection.retailer.banner_url;

  return (
    <PageTransitionWrapper>
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* ── Hero Banner ── */}
      {bannerUrl && (
        <div className="relative w-full h-48 md:h-56 overflow-hidden bg-gray-100">
          <Image
            src={bannerUrl}
            alt={`${collection.retailer.shop_name} banner`}
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute bottom-3 left-4 right-4">
            <p className="text-white text-xs font-semibold uppercase tracking-wider drop-shadow">
              {collection.retailer.shop_name} · {collection.retailer.city}
            </p>
            <h1 className="text-white text-xl font-bold drop-shadow leading-tight">
              {collection.title}
            </h1>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className={`sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100 ${bannerUrl ? '' : ''}`}>
        <div className="max-w-md mx-auto px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              {!bannerUrl && (
                <p className="text-[11px] text-cyan-700/80 font-semibold uppercase tracking-wider truncate">
                  {collection.retailer.shop_name} · {collection.retailer.city}
                </p>
              )}
              <h1 className={`font-bold leading-tight tracking-tight truncate ${bannerUrl ? 'text-sm text-gray-700' : 'font-display text-lg text-gray-900'}`}>
                {collection.title}
              </h1>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={`p-2.5 rounded-full transition-all active:scale-90 ${
                  showFilters
                    ? 'bg-cyan-50 text-cyan-700 shadow-soft'
                    : 'text-gray-500 hover:bg-gray-100'
                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2`}
                aria-label="Toggle filters"
              >
                <Filter size={18} />
              </button>
              <button
                onClick={() => void handleShare()}
                className="p-2.5 rounded-full text-gray-500 hover:bg-gray-100 transition-all active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
                aria-label="Share collection"
              >
                <Share2 size={18} />
              </button>
            </div>
          </div>

          {/* Secondary filters (price / color) — category chips render
              unconditionally above the grid in CategoryChips. */}
          {showFilters && (
            <FilterBar
              colors={collection.filters.colors}
              filterPrice={filterPrice}
              filterColor={filterColor}
              onPriceChange={setFilterPrice}
              onColorChange={setFilterColor}
            />
          )}
        </div>
      </header>

      {/* ── Promotion Banner ── */}
      <div className="max-w-md mx-auto px-3 pt-3">
        <PromotionBanner storeSlug={store ?? slug} />
      </div>

      {/* ── Product Grid ── */}
      <main className="max-w-md mx-auto px-3 py-4">
        {collection.description && (
          <p className="text-sm text-gray-600 leading-relaxed mb-4 px-1">
            {collection.description}
          </p>
        )}

        {/* Regional weave/style filters */}
        <RegionalFilters
          activeFilter={filterRegional}
          onFilterChange={setFilterRegional}
        />

        {/* Style quiz — show once if not completed */}
        {!quizDone && !showQuiz && (
          <button
            onClick={() => setShowQuiz(true)}
            className="w-full bg-gradient-to-r from-cyan-50 to-indigo-50 border border-cyan-100 rounded-2xl p-3 mb-4 flex items-center gap-3 hover:from-cyan-100 hover:to-indigo-100 transition-colors"
          >
            <span className="text-xl">✨</span>
            <div className="text-left">
              <p className="text-xs font-bold text-gray-900">Take a quick style quiz</p>
              <p className="text-[10px] text-gray-500">Help us suggest outfits you&apos;ll love</p>
            </div>
            <ChevronRight size={16} className="text-cyan-400 ml-auto" />
          </button>
        )}
        {showQuiz && !quizDone && (
          <div className="mb-4">
            <StyleQuiz
              storeSlug={store ?? slug}
              onComplete={() => { setQuizDone(true); setShowQuiz(false) }}
            />
          </div>
        )}

        {/* Recently viewed products */}
        <RecentlyViewed
          storeSlug={store ?? slug}
          onProductTap={(p) => setSelectedProduct(p as PublicProduct)}
        />

        {/* Always-visible category chip bar (count-bearing, matches the
            reference browse layout) — independent of the filter toggle. */}
        <div className="mb-4 -mx-1 px-1">
          <CategoryChips
            categories={collection.filters.categories}
            filterCategory={filterCategory}
            // Static collection total — category chip counts are static server
            // facets, so the "All" chip must not shrink when other filters apply.
            totalCount={collection.total}
            onCategoryChange={setFilterCategory}
          />
        </div>

        {products.length === 0 ? (
          <div className="text-center py-20 px-6">
            <div className="w-16 h-16 rounded-2xl bg-cyan-50 flex items-center justify-center mx-auto mb-4">
              <ShoppingBag size={26} className="text-cyan-400" />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">No products match this filter</p>
            <p className="text-xs text-gray-400 mb-4">
              Try clearing a filter to see more of the collection
            </p>
            <button
              onClick={() => {
                setFilterCategory(null);
                setFilterPrice(null);
                setFilterColor(null);
                setFilterRegional(null);
              }}
              className="text-cyan-700 bg-cyan-50 hover:bg-cyan-100 text-sm font-semibold px-4 py-2 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <div
              className={`grid grid-cols-2 gap-3 transition-opacity ${loading ? 'opacity-50' : ''}`}
            >
              {products.map((product, idx) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  isFavorited={favorites.has(product.id)}
                  onFavorite={(id) => toggleFavorite(id, product)}
                  onTap={() => setSelectedProduct(product)}
                  collectionSlug={slug}
                  priority={idx < 2}
                  onTryOn={(p) => setTryOnProduct(p)}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-5">
                <button
                  onClick={() => goToPage(Math.max(1, page - 1))}
                  disabled={page === 1 || loading}
                  className="px-4 py-2 rounded-full text-sm font-semibold bg-white border border-gray-100 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                >
                  Prev
                </button>
                <span className="text-xs font-medium text-gray-500">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => goToPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages || loading}
                  className="px-4 py-2 rounded-full text-sm font-semibold bg-white border border-gray-100 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Sticky Bottom Bar — 4 buttons: Buy Now / Selected / Enquire / Book Visit ── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-gray-100 safe-area-inset-bottom shadow-[0_-8px_24px_-12px_rgb(0,0,0,0.08)]">
        <div className="max-w-md mx-auto px-3 py-3 grid grid-cols-4 gap-1.5">
          {/* Buy Now only exists once the retailer connects a payment gateway
              — no disabled placeholder for stores without checkout. */}
          {checkoutEnabled && (
            <Link
              href={`${basePath}/cart`}
              className="flex flex-col items-center justify-center gap-0.5 bg-cyan-600 hover:bg-cyan-700 text-white
                         font-semibold py-2.5 rounded-2xl shadow-soft-lg transition-all active:scale-[0.98]
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
            >
              <ShoppingBag size={15} />
              <span className="text-[10px] leading-tight">Buy Now</span>
            </Link>
          )}
          <Link
            href={`${basePath}/wishlist`}
            className="flex flex-col items-center justify-center gap-0.5 text-gray-700 font-semibold
                       bg-gray-50 border border-gray-100 rounded-2xl py-2.5 hover:bg-rose-50 hover:border-rose-200
                       transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
            <Heart size={15} className="text-rose-500 fill-rose-500" />
            <span className="text-[10px] leading-tight">
              Selected{favorites.size > 0 && ` (${favorites.size})`}
            </span>
          </Link>
          <button
            onClick={handleEnquireAll}
            className="flex flex-col items-center justify-center gap-0.5 bg-green-500 hover:bg-green-600 text-white
                       font-semibold py-2.5 rounded-2xl shadow-soft-lg transition-all active:scale-[0.98]
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
          >
            <MessageCircle size={15} />
            <span className="text-[10px] leading-tight">
              Enquire{favorites.size > 0 && ` (${favorites.size})`}
            </span>
          </button>
          <button
            onClick={() => setShowBooking(true)}
            className="flex flex-col items-center justify-center gap-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700
                       font-semibold py-2.5 rounded-2xl border border-purple-100 transition-all active:scale-[0.98]
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
          >
            <Calendar size={15} />
            <span className="text-[10px] leading-tight">Book Visit</span>
          </button>
        </div>
      </div>

      {/* ── Product Detail Sheet ── */}
      {selectedProduct && (          <ProductDetailSheet
              product={selectedProduct}
              retailer={collection.retailer}
              collectionTitle={collection.title}
              isFavorited={favorites.has(selectedProduct.id)}
              checkoutEnabled={checkoutEnabled}
              slug={slug}
              store={store ?? null}
              onFavorite={toggleFavorite}
              onTryOn={() => setTryOnProduct(selectedProduct)}
              onClose={() => setSelectedProduct(null)}
          />
      )}

      {/* ── Try-On Modal ── */}
      {tryOnProduct && (
        <TryOnModal
          productName={tryOnProduct.category ?? 'Product'}
          productPhotoUrl={tryOnProduct.primary_photo_url}
          collectionSlug={slug}
          productId={tryOnProduct.id}
          onClose={() => setTryOnProduct(null)}
        />
      )}

      {/* ── AI Stylist FAB + Modal ── */}
      <AIStylist
        storeSlug={store ?? slug}
        storeName={collection.retailer.shop_name}
        onProductTap={(id) => {
          const p = products.find((x) => x.id === id)
          if (p) setSelectedProduct(p)
        }}
      />

      {/* ── Booking Form Modal ── */}
      {showBooking && (
        <BookingForm
          storeSlug={store ?? slug}
          storeName={collection.retailer.shop_name}
          onClose={() => setShowBooking(false)}
        />
      )}

      {/* Referral program */}
      <div className="max-w-md mx-auto px-3 mb-4">
        <CustomerReferral
          storeSlug={store ?? slug}
          storeName={collection.retailer.shop_name}
        />
      </div>

      {/* Bottom padding for sticky nav */}
      <div className="h-20" />

      {/* ── Bottom Nav Bar ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-gray-100">
        <div className="max-w-md mx-auto flex items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <Link
            href={basePath}
            className="flex flex-col items-center gap-0.5 px-4 py-1 text-cyan-600"
          >
            <LayoutGrid size={20} />
            <span className="text-[10px] font-semibold">Catalog</span>
          </Link>
          <Link
            href={`${basePath}/wishlist`}
            className="flex flex-col items-center gap-0.5 px-4 py-1 text-gray-400 hover:text-rose-500 transition-colors"
          >
            <Heart size={20} />
            <span className="text-[10px] font-semibold">Saved</span>
          </Link>
        </div>
      </nav>
    </div>
    </PageTransitionWrapper>
  );
}

// ─── Product Card ─────────────────────────────────────────────────

interface CardProps {
  product: PublicProduct;
  isFavorited: boolean;
  onFavorite: (id: string) => void;
  onTap: () => void;
  collectionSlug?: string;
  priority?: boolean;
  onTryOn?: (product: PublicProduct) => void;
}

function ProductCard({ product, isFavorited, onFavorite, onTap, priority, onTryOn }: CardProps) {
  const isSold = product.status === 'SOLD';
  const isReserved = product.status === 'RESERVED';
  const isUnavailable = isSold || isReserved;
  const badgeLabel = product.subtype ?? product.category;

  return (
    <div
      className={`group bg-white rounded-2xl overflow-hidden shadow-soft border transition-all duration-200 hover:-translate-y-1 hover:shadow-soft-lg ${isSold ? 'border-red-100 opacity-80' : isReserved ? 'border-amber-100' : 'border-gray-100'}`}
    >
      {/* Photo */}
      <div
        role="button"
        tabIndex={0}
        onClick={onTap}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onTap();
          }
        }}
        className="relative w-full aspect-[3/4] block cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-inset"
      >
        {product.primary_photo_url ? (
          <Image
            src={product.primary_photo_url}
            alt={product.name ?? product.category ?? 'Product'}
            fill
            sizes="(max-width: 640px) 45vw, 200px"
            className={`object-cover transition-transform duration-300 group-hover:scale-[1.03] ${isSold ? 'grayscale' : ''}`}
            priority={priority}
            loading={priority ? 'eager' : 'lazy'}
          />
        ) : (
          <div className="w-full h-full bg-gray-100 flex items-center justify-center">
            <ShoppingBag size={32} className="text-gray-300" />
          </div>
        )}

        {/* Subtype badge — small white pill over the photo (matches the
            reference card style). Sits below the status ribbon when the
            product is sold/reserved so both stay readable. */}
        {badgeLabel && (
          <span
            className={`absolute left-2.5 bg-white/95 backdrop-blur-sm text-gray-800 text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm ${
              isUnavailable ? 'top-11' : 'top-2.5'
            }`}
          >
            {badgeLabel}
          </span>
        )}

        {/* Status badge ribbon */}
        {isSold && (
          <div className="absolute top-2.5 left-2.5 bg-red-500 text-white text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full shadow-sm">
            Sold Out
          </div>
        )}
        {isReserved && (
          <div className="absolute top-2.5 left-2.5 bg-amber-400 text-amber-900 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full shadow-sm">
            Reserved
          </div>
        )}

        {/* Favorite button — hide for SOLD */}
        {!isSold && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFavorite(product.id);
            }}
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm
                       flex items-center justify-center shadow-soft transition-transform active:scale-90
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart
              size={16}
              className={isFavorited ? 'text-rose-500 fill-rose-500' : 'text-gray-400'}
            />
          </button>
        )}

        {/* Bottom gradient-overlay caption with the product name */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent pt-12 px-2.5 pb-2">
          <p className="text-white text-xs font-semibold leading-snug line-clamp-2 drop-shadow-sm">
            {product.name ?? product.category ?? 'Product'}
          </p>
        </div>
      </div>

      {/* Try-On button — hide for SOLD, show as disabled for RESERVED */}
      {TRY_ON_ENABLED && !isUnavailable && (
        <div className="px-2.5 pt-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTryOn?.(product);
            }}
            className="w-full bg-cyan-50 hover:bg-cyan-100 text-cyan-700 text-xs font-semibold
                       py-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1"
          >
            <Sparkles size={13} />
            Try On
          </button>
        </div>
      )}

      {/* Info — price line (name now lives in the image caption above) */}
      <div className="p-2.5 pt-2">
        <div className="flex items-center gap-1.5">
          {product.primary_color && (
            <span
              className="w-2.5 h-2.5 rounded-full border border-gray-200 flex-shrink-0"
              style={{ backgroundColor: product.primary_color.toLowerCase() }}
              title={product.primary_color}
            />
          )}
          <p
            className={`font-display text-sm font-bold tabular-nums ${isSold ? 'text-gray-400 line-through' : 'text-gray-900'}`}
          >
            {formatPriceRange(product.price_min, product.price_max)}
          </p>
          {product.rating_count > 0 && (
            <span className="flex items-center gap-0.5 ml-auto">
              <Star size={11} className="text-amber-400 fill-amber-400" />
              <span className="text-[10px] font-semibold text-gray-600">
                {product.avg_rating.toFixed(1)}
              </span>
            </span>
          )}
          {isSold && <span className="text-[10px] text-red-400 font-semibold ml-auto">Sold</span>}
          {isReserved && (
            <span className="text-[10px] text-amber-500 font-semibold ml-auto">Reserved</span>
          )}
        </div>
      </div>
    </div>
  );
}
