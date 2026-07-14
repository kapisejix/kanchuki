'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import { Heart, MessageCircle, Filter, Share2, ShoppingBag, Sparkles } from 'lucide-react'
import type { PublicCollection, PublicProduct } from '@kanchuki/shared'
import { formatPriceRange, buildWhatsAppEnquiryLink, buildEnquiryMessage } from '@kanchuki/shared'
import dynamic from 'next/dynamic'
import { FilterBar, priceMatchesBucket } from './FilterBar'

// Lazy-load sheet and modal — only fetched when user taps a product or try-on.
// The components include image carousels, forms, and heavy lucide icons that
// should not block the initial page render.
const ProductDetailSheet = dynamic(
  () => import('./ProductDetailSheet').then((m) => m.ProductDetailSheet),
  { ssr: false },
)
const TryOnModal = dynamic(
  () => import('./TryOnModal').then((m) => m.TryOnModal),
  { ssr: false },
)

interface Props {
  collection: PublicCollection
  slug: string
}

export function CollectionView({ collection, slug }: Props) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(null)
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [filterOccasion, setFilterOccasion] = useState<string | null>(null)
  const [filterPrice, setFilterPrice] = useState<string | null>(null)
  const [filterColor, setFilterColor] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [tryOnProduct, setTryOnProduct] = useState<PublicProduct | null>(null)

  const toggleFavorite = useCallback(
    (productId: string) => {
      setFavorites((prev) => {
        const next = new Set(prev)
        if (next.has(productId)) {
          next.delete(productId)
        } else {
          next.add(productId)
          // Fire-and-forget analytics ping
          void fetch(`/api/c/${slug}/favorite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: productId }),
          })
        }
        return next
      })
    },
    [slug],
  )

  const filteredProducts = collection.products.filter((p) => {
    if (filterCategory && p.category !== filterCategory) return false
    if (filterOccasion && !p.occasions.includes(filterOccasion)) return false
    if (!priceMatchesBucket(p.price_min, filterPrice)) return false
    if (filterColor && p.primary_color?.toLowerCase() !== filterColor.toLowerCase()) return false
    return true
  })

  const favoriteProducts = collection.products.filter((p) => favorites.has(p.id))

  const handleEnquireAll = useCallback(() => {
    const message = buildEnquiryMessage({
      shopName: collection.retailer.shop_name,
      collectionTitle: collection.title,
      products: favoriteProducts.length > 0 ? favoriteProducts : collection.products.slice(0, 3),
    })
    const url = buildWhatsAppEnquiryLink(collection.retailer.phone, message)
    window.open(url, '_blank')
  }, [collection, favoriteProducts])

  const handleShare = useCallback(async () => {
    const url = window.location.href
    if (navigator.share) {
      await navigator.share({ title: collection.title, url })
    } else {
      await navigator.clipboard.writeText(url)
    }
  }, [collection.title])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-md mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                {collection.retailer.shop_name} · {collection.retailer.city}
              </p>
              <h1 className="text-base font-bold text-gray-900 leading-tight">
                {collection.title}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters((v) => !v)}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
                aria-label="Toggle filters"
              >
                <Filter size={18} />
              </button>
              <button
                onClick={() => void handleShare()}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
                aria-label="Share collection"
              >
                <Share2 size={18} />
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          {showFilters && (
            <FilterBar
              products={collection.products}
              filterCategory={filterCategory}
              filterOccasion={filterOccasion}
              filterPrice={filterPrice}
              filterColor={filterColor}
              onCategoryChange={setFilterCategory}
              onOccasionChange={setFilterOccasion}
              onPriceChange={setFilterPrice}
              onColorChange={setFilterColor}
            />
          )}
        </div>
      </header>

      {/* ── Product Grid ── */}
      <main className="max-w-md mx-auto px-3 py-3">
        {collection.description && (
          <p className="text-sm text-gray-600 mb-3 px-1">{collection.description}</p>
        )}

        {filteredProducts.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <ShoppingBag size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No products match the filter</p>
            <button
              onClick={() => {
                setFilterCategory(null)
                setFilterOccasion(null)
                setFilterPrice(null)
                setFilterColor(null)
              }}
              className="mt-2 text-cyan-600 text-sm underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                isFavorited={favorites.has(product.id)}
                onFavorite={toggleFavorite}
                onTap={() => setSelectedProduct(product)}
                collectionSlug={slug}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── Sticky Bottom Bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 safe-area-inset-bottom">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 text-sm text-gray-600">
            <Heart size={16} className="text-rose-500 fill-rose-500" />
            <span>
              {favorites.size > 0
                ? `${favorites.size} saved`
                : `${collection.products.length} items`}
            </span>
          </div>
          <button
            onClick={handleEnquireAll}
            className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold
                       py-3 px-4 rounded-2xl flex items-center justify-center gap-2 transition-colors"
          >
            <MessageCircle size={18} />
            {favorites.size > 0 ? `Enquire about ${favorites.size} items` : 'Enquire on WhatsApp'}
          </button>
        </div>
      </div>

      {/* ── Product Detail Sheet ── */}
      {selectedProduct && (
        <ProductDetailSheet
          product={selectedProduct}
          retailer={collection.retailer}
          collectionTitle={collection.title}
          isFavorited={favorites.has(selectedProduct.id)}
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

      {/* Bottom padding for sticky bar */}
      <div className="h-20" />
    </div>
  )
}

// ─── Product Card ─────────────────────────────────────────────────

interface CardProps {
  product: PublicProduct
  isFavorited: boolean
  onFavorite: (id: string) => void
  onTap: () => void
  collectionSlug?: string
}

function ProductCard({ product, isFavorited, onFavorite, onTap, collectionSlug }: CardProps) {
  const [showTryOn, setShowTryOn] = useState(false)
  const isSold = product.status === 'SOLD'
  const isReserved = product.status === 'RESERVED'
  const isUnavailable = isSold || isReserved

  return (
    <div className={`bg-white rounded-2xl overflow-hidden shadow-sm border ${isSold ? 'border-red-100 opacity-80' : isReserved ? 'border-amber-100' : 'border-gray-100'}`}>
      {/* Photo */}
      <button onClick={onTap} className="relative w-full aspect-[3/4] block">
        {product.primary_photo_url ? (
          <Image
            src={product.primary_photo_url}
            alt={product.name ?? product.category ?? 'Product'}
            fill
            sizes="(max-width: 640px) 45vw, 200px"
            className={`object-cover ${isSold ? 'grayscale' : ''}`}
          />
        ) : (
          <div className="w-full h-full bg-gray-100 flex items-center justify-center">
            <ShoppingBag size={32} className="text-gray-300" />
          </div>
        )}

        {/* Status badge ribbon */}
        {isSold && (
          <div className="absolute top-0 left-0 bg-red-500 text-white text-[10px] font-bold px-3 py-1 rounded-br-lg shadow-sm">
            Sold Out
          </div>
        )}
        {isReserved && (
          <div className="absolute top-0 left-0 bg-amber-400 text-amber-900 text-[10px] font-bold px-3 py-1 rounded-br-lg shadow-sm">
            Reserved
          </div>
        )}

        {/* Favorite button — hide for SOLD */}
        {!isSold && (
          <button
            onClick={(e) => { e.stopPropagation(); onFavorite(product.id) }}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm
                       flex items-center justify-center shadow-sm"
            aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart
              size={16}
              className={isFavorited ? 'text-rose-500 fill-rose-500' : 'text-gray-400'}
            />
          </button>
        )}
      </button>

      {/* Try-On button — hide for SOLD, show as disabled for RESERVED */}
      {!isUnavailable && (
        <div className="px-2.5 pt-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); setShowTryOn(true) }}
            className="w-full bg-cyan-50 hover:bg-cyan-100 text-cyan-700 text-xs font-medium
                       py-2 rounded-xl flex items-center justify-center gap-1 transition-colors"
          >
            <Sparkles size={14} />
            Try On
          </button>
        </div>
      )}

      {/* Try-On Modal */}
      {showTryOn && collectionSlug && (
        <TryOnModal
          productName={product.category ?? 'Product'}
          productPhotoUrl={product.primary_photo_url ?? ''}
          collectionSlug={collectionSlug}
          productId={product.id}
          onClose={() => setShowTryOn(false)}
        />
      )}

      {/* Info */}
      <div className="p-2.5">
        <div className="flex items-center gap-1.5 mb-1">
          {product.primary_color && (
            <span
              className="w-3 h-3 rounded-full border border-gray-200 flex-shrink-0"
              style={{ backgroundColor: product.primary_color.toLowerCase() }}
              title={product.primary_color}
            />
          )}
          <p className="text-xs text-gray-500 truncate">
            {product.category ?? product.occasions[0] ?? 'Product'}
          </p>
          {isSold && (
            <span className="text-[10px] text-red-400 font-medium ml-auto">Sold</span>
          )}
          {isReserved && (
            <span className="text-[10px] text-amber-500 font-medium ml-auto">Reserved</span>
          )}
        </div>
        <p className={`text-sm font-semibold ${isSold ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
          {formatPriceRange(product.price_min, product.price_max)}
        </p>
        {product.fabric_estimate && (
          <p className="text-xs text-gray-400 mt-0.5">{product.fabric_estimate}</p>
        )}
      </div>
    </div>
  )
}
