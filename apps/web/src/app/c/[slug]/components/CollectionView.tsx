'use client';

import type { PublicCollection, PublicProduct } from '@kanchuki/shared';
import { buildEnquiryMessage, buildWhatsAppEnquiryLink, formatPriceRange } from '@kanchuki/shared';
import {
  Filter,
  Heart,
  MessageCircle,
  Share2,
  ShoppingBag,
  Sparkles,
  Star,
  Calendar,
  ChevronRight,
  LayoutGrid,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
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
import { KanchukiBrandBar } from './KanchukiBrandBar';
import { PageTransitionWrapper } from '@/components/PageTransitionWrapper';

// Lazy-load sheet and modal — only fetched when user taps a product or try-on.
// The components include image carousels, forms, and heavy lucide icons that
// should not block the initial page render.
const ProductDetailSheet = dynamic(
  () => import('./ProductDetailSheet').then((m) => m.ProductDetailSheet),
  { ssr: false },
);

const PromotionBanner = dynamic(() => import('./PromotionBanner').then((m) => m.PromotionBanner), { ssr: false });
const RecentlyViewed = dynamic(() => import('./RecentlyViewedRow').then((m) => m.RecentlyViewed), { ssr: false });
const StyleQuiz = dynamic(() => import('./StyleQuiz').then((m) => m.StyleQuiz), { ssr: false });
const AIStylist = dynamic(() => import('./AIStylist').then((m) => m.AIStylist), { ssr: false });
const RegionalFilters = dynamic(() => import('./RegionalFilters').then((m) => m.RegionalFilters), { ssr: false });
// Feature flags for customer catalog screen
const REGIONAL_FILTERS_ENABLED = false;

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
  // Direct route for "Catalog" navigation — canonical browse page when on a pseudo-slug
  const catalogPath = store
    ? slug.startsWith('all-') || slug === 'all'
      ? `/${store}/all`
      : slug.startsWith('cat-')
        ? `/${store}/categories/${slug.slice(4)}`
        : `/${store}/${slug}`
    : `/c/${slug}`;
  // Start EMPTY and hydrate from localStorage in an effect — reading
  // localStorage during render (useState initializer) makes the client's
  // first render differ from SSR HTML (server always renders an empty Map),
  // which trips React hydration errors #418/#422 on the collection page.
  // Same deferred-load pattern as WishlistView/CartPage/CheckoutForm.
  const [favorites, setFavorites] = useState<Map<string, WishlistItem>>(new Map());
  useEffect(() => {
    setFavorites(loadWishlist(slug));
  }, [slug]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterPrice, setFilterPrice] = useState<string | null>(null);
  const [filterColor, setFilterColor] = useState<string | null>(null);
  const [filterRegional, setFilterRegional] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

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
      // Deep link each listed product to its shared page so the retailer can
      // open it directly instead of matching by name alone.
      products: (favoriteProducts.length > 0 ? favoriteProducts : products.slice(0, 3)).map(
        (p) => ({
          name: p.name,
          price_min: p.price_min,
          product_url: `${window.location.origin}${basePath}/product/${p.id}`,
        }),
      ),
    });
    const url = buildWhatsAppEnquiryLink(collection.retailer.phone, message);
    window.open(url, '_blank');
  }, [collection, favoriteProducts, products, basePath]);

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: collection.title, url });
    } else {
      await navigator.clipboard.writeText(url);
    }
  }, [collection.title]);

  const filteredProducts = products.filter((p) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = (p.name ?? '').toLowerCase().includes(q);
      const matchCat = (p.category ?? '').toLowerCase().includes(q);
      const matchSubtype = (p.subtype ?? '').toLowerCase().includes(q);
      const matchColor = (p.primary_color ?? '').toLowerCase().includes(q);
      const matchLocation = (p.location ?? '').toLowerCase().includes(q);
      if (!matchName && !matchCat && !matchSubtype && !matchColor && !matchLocation) return false;
    }
    return true;
  });

  return (
    <PageTransitionWrapper>
    <div className="min-h-screen bg-[#F8F7FC] font-sans pb-24">
      {/* ── Top Header & Greeting (Spec #9 Discovery) ── */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-[#E0E1F6]">
        <KanchukiBrandBar />
        <div className="max-w-md mx-auto px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl overflow-hidden bg-[#E0E1F6] border border-[#E0E1F6] flex items-center justify-center flex-shrink-0 shadow-sm">
                {collection.retailer.logo_url ? (
                  <Image
                    src={collection.retailer.logo_url}
                    alt={collection.retailer.shop_name}
                    width={40}
                    height={40}
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <span className="font-bold text-[#231F48] font-marcellus text-sm">
                    {collection.retailer.shop_name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#231F48] truncate">
                  Hi, Welcome!
                </p>
                <div className="flex items-center gap-1.5">
                  <p className="text-[10px] text-[#6B4773] font-bold uppercase tracking-wider truncate">
                    {collection.retailer.shop_name} {collection.retailer.city ? `· ${collection.retailer.city}` : ''}
                  </p>
                  {collection.retailer.latitude != null && collection.retailer.longitude != null && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${collection.retailer.latitude},${collection.retailer.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 w-5 h-5 rounded-full bg-[#BB3F95]/10 flex items-center justify-center"
                      aria-label="Get directions to store"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#BB3F95" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all active:scale-90 ${
                  showFilters || filterPrice || filterColor
                    ? 'bg-[#231F48] text-white border-[#231F48]'
                    : 'bg-white text-[#231F48] border-[#E0E1F6] shadow-sm'
                }`}
                aria-label="Toggle filters"
              >
                <SlidersHorizontal size={18} />
              </button>

              <button
                onClick={() => void handleShare()}
                className="w-10 h-10 rounded-2xl bg-white border border-[#E0E1F6] shadow-sm flex items-center justify-center text-[#231F48] hover:bg-[#F8F7FC] transition-all active:scale-90"
                aria-label="Share collection"
              >
                <Share2 size={18} />
              </button>
            </div>
          </div>

          {/* Secondary filters (price / color) */}
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

      {/* ── Main Discovery Content ── */}
      <main className="max-w-md mx-auto px-4 py-4">
        {/* ── Collection summary ── */}
        <div className="mb-4">
          <p className="text-xs text-[#6B4773] font-medium">
            {collection.title} · {collection.total} curated items
          </p>
        </div>

        {/* ── Discovery Search Bar (Spec #9) ── */}
        <div className="relative mb-4">
          <div className="w-full bg-white rounded-2xl py-3 pl-11 pr-12 shadow-sm border border-[#E0E1F6] flex items-center">
            <Search size={18} className="text-[#928EB2] absolute left-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by outfit, fabric, color..."
              className="w-full text-xs font-semibold text-[#231F48] placeholder-[#928EB2] bg-transparent focus:outline-none"
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="w-7 h-7 rounded-xl bg-[#F8F7FC] flex items-center justify-center text-[#231F48] text-xs absolute right-3 border border-[#E0E1F6]"
              >
                <X size={14} />
              </button>
            ) : (
              <button
                onClick={() => setShowFilters((v) => !v)}
                className="w-7 h-7 rounded-xl bg-[#F8F7FC] flex items-center justify-center text-[#231F48] text-xs absolute right-3 border border-[#E0E1F6]"
              >
                <SlidersHorizontal size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ── Promotion Banner ── */}
        <div className="mb-4">
          <PromotionBanner storeSlug={store ?? slug} />
        </div>

        {/* Always-visible category chip bar */}
        <div className="mb-4 -mx-1 px-1">
          <CategoryChips
            categories={collection.filters.categories}
            filterCategory={filterCategory}
            totalCount={collection.total}
            onCategoryChange={setFilterCategory}
          />
        </div>

        {filteredProducts.length === 0 ? (
          <div className="text-center py-16 px-6">
            <div className="w-16 h-16 rounded-3xl bg-white border border-[#E0E1F6] shadow-sm flex items-center justify-center mx-auto mb-4">
              <ShoppingBag size={26} className="text-[#6B4773]" />
            </div>
            <p className="text-sm font-bold text-[#231F48] mb-1 font-marcellus">No products match this filter</p>
            <p className="text-xs text-[#6B4773] mb-4">
              Try clearing a filter to see more of the collection
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setFilterCategory(null);
                setFilterPrice(null);
                setFilterColor(null);
                setFilterRegional(null);
              }}
              className="text-[#231F48] bg-white border border-[#E0E1F6] hover:bg-[#F8F7FC] text-xs font-bold px-4 py-2 rounded-full transition-colors shadow-sm"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <div
              className={`grid grid-cols-2 gap-3 transition-opacity ${loading ? 'opacity-50' : ''}`}
            >
              {filteredProducts.map((product, idx) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  isFavorited={favorites.has(product.id)}
                  onFavorite={(id) => toggleFavorite(id, product)}
                  onTap={() => setSelectedProduct(product)}
                  collectionSlug={slug}
                  priority={idx < 2}

                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-5">
                <button
                  onClick={() => goToPage(Math.max(1, page - 1))}
                  disabled={page === 1 || loading}
                  className="px-4 py-2 rounded-full text-sm font-semibold bg-white border border-sand-100 text-sand-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-sand-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-500"
                >
                  Prev
                </button>
                <span className="text-xs font-medium text-gray-500">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => goToPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages || loading}
                  className="px-4 py-2 rounded-full text-sm font-semibold bg-white border border-sand-100 text-sand-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-sand-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-500"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>



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

              onClose={() => setSelectedProduct(null)}
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





      {/* Bottom padding for sticky nav */}
      <div className="h-20" />

      {/* ── Fixed Bottom Overlay Nav: Catalog, Saved, Enquire ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E0E1F6] shadow-[0_-8px_24px_-12px_rgba(35,31,72,0.1)]">
        <div className="max-w-md mx-auto grid grid-cols-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <Link
            href={catalogPath}
            prefetch
            className="flex flex-col items-center justify-center gap-0.5 py-1 text-[#231F48] hover:text-[#BB3F95] transition-colors"
          >
            <LayoutGrid size={20} />
            <span className="text-[10px] font-semibold">Catalog</span>
          </Link>
          <Link
            href={`${basePath}/wishlist`}
            prefetch
            className="flex flex-col items-center justify-center gap-0.5 py-1 text-[#6B4773] hover:text-[#BB3F95] transition-colors relative"
          >
            <div className="relative">
              <Heart
                size={20}
                className={favorites.size > 0 ? 'text-[#BB3F95] fill-[#BB3F95]' : ''}
              />
              {favorites.size > 0 && (
                <span className="absolute -top-1 -right-2.5 min-w-[16px] h-4 px-1 bg-[#BB3F95] text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                  {favorites.size}
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
      onClick={onTap}
      className={`group bg-white rounded-[28px] overflow-hidden shadow-sm hover:shadow-md border border-[#E0E1F6] transition-all p-1.5 cursor-pointer flex flex-col justify-between ${
        isSold ? 'opacity-75' : ''
      }`}
    >
      {/* Photo Container */}
      <div className="relative w-full aspect-[3/4] rounded-[24px] overflow-hidden bg-[#FAF9FE]">
        {product.primary_photo_url ? (
          <Image
            src={product.primary_photo_url}
            alt={product.name ?? product.category ?? 'Product'}
            fill
            sizes="(max-width: 640px) 45vw, 200px"
            className={`object-cover transition-transform duration-300 group-hover:scale-105 ${isSold ? 'grayscale' : ''}`}
            priority={priority}
            loading={priority ? 'eager' : 'lazy'}
          />
        ) : (
          <div className="w-full h-full bg-[#E0E1F6] flex items-center justify-center">
            <ShoppingBag size={32} className="text-[#6B4773]" />
          </div>
        )}

        {/* Status badge ribbon (top-left) */}
        {isSold && (
          <div className="absolute top-2.5 left-2.5 bg-[#560A39]/90 text-white text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-full shadow-sm backdrop-blur-sm">
            Sold Out
          </div>
        )}
        {isReserved && (
          <div className="absolute top-2.5 left-2.5 bg-amber-500/95 text-white text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-full shadow-sm backdrop-blur-sm">
            Reserved
          </div>
        )}

        {/* Subtype pill if not sold */}
        {!isUnavailable && badgeLabel && (
          <span className="absolute top-2.5 left-2.5 bg-[#231F48]/85 backdrop-blur-md text-white text-[9px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-sm">
            {badgeLabel}
          </span>
        )}

        {/* Floating circular heart button at bottom-right of photo (Point 9 Discovery Spec) */}
        {!isSold && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFavorite(product.id);
            }}
            className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-[#231F48] absolute bottom-3 right-3 shadow-md border border-[#E0E1F6] hover:scale-110 active:scale-95 transition-all"
            aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart
              size={16}
              className={isFavorited ? 'text-[#BB3F95] fill-[#BB3F95]' : 'text-[#231F48]'}
            />
          </button>
        )}
      </div>

      {/* Info: Title & Price */}
      <div className="px-2 pt-2.5 pb-1">
        <p className="text-xs font-bold text-[#231F48] font-sans truncate">
          {product.name ?? product.category ?? 'Ethnic Wear'}
        </p>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs font-extrabold text-[#231F48] font-sans tabular-nums">
            {formatPriceRange(product.price_min, product.price_max)}
          </p>
          {product.rating_count > 0 && (
            <span className="flex items-center gap-0.5">
              <Star size={11} className="text-amber-400 fill-amber-400" />
              <span className="text-[10px] font-semibold text-[#6B4773]">
                {(product.avg_rating ?? 0).toFixed(1)}
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
