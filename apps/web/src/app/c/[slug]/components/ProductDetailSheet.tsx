'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { X, ArrowLeft, Heart, MessageCircle, ChevronLeft, ChevronRight, Camera, Palette, MapPin, RotateCw, ShoppingCart, Share2, Sparkles, Info, Star } from 'lucide-react'
import type { PublicProduct, PublicProductDetail, PublicCollection } from '@kanchuki/shared'
import { formatPriceRange, buildWhatsAppEnquiryLink, buildEnquiryMessage, resolveFashionColor } from '@kanchuki/shared'
import { productToCartItem, saveCart, loadCart } from '../lib/cart'
import { Product360Viewer } from './Product360Viewer'
import { ReviewForm } from './StarPicker'
import { ReviewList } from './ReviewList'
import { FabricGlossary } from './FabricGlossary'
import { trackRecentlyViewed } from '../lib/recentlyViewed'
import { NotifyWhenAvailable } from './NotifyWhenAvailable'
import { SavedSize } from './SavedSize'
import { DesignGallery } from './DesignGallery'
import { FamilyProfiles } from './FamilyProfiles'
import { CustomerConsentModal } from './CustomerConsentModal'

// VTO hidden for launch — backend live but buttons removed per pre-launch checklist.
const TRY_ON_ENABLED = false

// Alias map lookup (shared with mobile) first; anything unmapped is checked
// against the browser's own color parser before falling back to neutral grey.
function swatchColor(name: string): string {
  const aliased = resolveFashionColor(name)
  if (aliased !== '#d1d5db') return aliased
  if (typeof window !== 'undefined') {
    const key = name.trim().toLowerCase()
    const probe = new Option().style
    probe.color = key
    if (probe.color !== '') return key
  }
  return '#d1d5db' // unresolvable color name — neutral grey rather than black
}

interface Props {
  product: PublicProduct
  retailer: PublicCollection['retailer']
  collectionTitle: string
  isFavorited: boolean
  checkoutEnabled: boolean
  slug: string
  // Store URL segment (public_slug). Null = legacy /c/{slug} URLs.
  store?: string | null
  onFavorite: (id: string) => void
  onTryOn: () => void
  onClose: () => void
}

export function ProductDetailSheet({
  product,
  retailer,
  collectionTitle,
  isFavorited,
  checkoutEnabled,
  slug,
  store,
  onFavorite,
  onTryOn,
  onClose,
}: Props) {
  const router = useRouter()
  const [photoIndex, setPhotoIndex] = useState(0)
  const [variantPhotoUrl, setVariantPhotoUrl] = useState<string | null>(null)
  const [variantColor, setVariantColor] = useState<string | null>(null)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [showSpinModal, setShowSpinModal] = useState(false)
  const [showConsentModal, setShowConsentModal] = useState(false)

  // Related products — same category, same retailer, excluding current
  const [relatedProducts, setRelatedProducts] = useState<PublicProduct[]>([])

  // Grid/card view only has the thin summary — photos, spin frames, variants,
  // fabric, and tags are fetched here on open instead of shipping with every
  // product in the list response.
  const [detail, setDetail] = useState<PublicProductDetail | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/products/${product.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data: PublicProductDetail } | null) => {
        if (!cancelled && json) setDetail(json.data)
      })
      .catch(() => undefined)
    // Fetch related products in parallel
    fetch(`/api/products/${product.id}/related`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data: PublicProduct[] } | null) => {
        if (!cancelled && json?.data) setRelatedProducts(json.data)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [product.id])
  const touchStartX = useRef<number | null>(null)
  const prevIndexRef = useRef(photoIndex)

  // Track this product as recently viewed
  useEffect(() => {
    trackRecentlyViewed(slug, {
      id: product.id,
      name: product.name,
      category: product.category,
      primary_color: product.primary_color,
      price_min: product.price_min,
      price_max: product.price_max,
      primary_photo_url: product.primary_photo_url,
    })
  }, [product, slug])

  // ── Pinch/Zoom state ─────────────────────────────────────────────
  const [isZoomed, setIsZoomed] = useState(false)
  const [scaleAnim, setScaleAnim] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const lastTapRef = useRef(0)
  const lastPinchDistRef = useRef(0)
  const lastPinchCenterRef = useRef({ x: 50, y: 50 })
  const isPinchingRef = useRef(false)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const panStartOffsetRef = useRef({ x: 0, y: 0 })
  const currentScaleRef = useRef(1)

  // ── Fullscreen image viewer ─────────────────────────────────────
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const fsTouchStartX = useRef<number | null>(null)
  const recentTouchRef = useRef(0)
  const singleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current)
    }
  }, [])

  // Opening this sheet is pure component state, not a route change — with no
  // history entry pushed, the phone/browser Back button skipped straight past
  // it to whatever page preceded the current one (e.g. the category grid)
  // instead of just closing the sheet. Push a history entry on mount and
  // close on popstate; the sheet's own close buttons trigger history.back()
  // so Back is always the single source of truth for closing.
  useEffect(() => {
    let poppedByUser = false
    window.history.pushState({ kanchukiProductSheet: true }, '')
    const handlePopState = () => {
      poppedByUser = true
      onClose()
    }
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      if (!poppedByUser) window.history.back()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closeSheet = useCallback(() => window.history.back(), [])

  const isSold = product.status === 'SOLD'
  const isReserved = product.status === 'RESERVED'

  const spinFrames = detail?.spin_frames ?? []
  const variants = detail?.variants ?? []
  const fabricEstimate = detail?.fabric_estimate ?? null
  const sizes = detail?.sizes ?? []

  // Build photos array: detail photos (once loaded) + optionally a variant
  // photo — falls back to just the grid thumbnail until detail arrives.
  const basePhotos = detail?.photos.length ? detail.photos : product.primary_photo_url ? [product.primary_photo_url] : []
  const photos = variantPhotoUrl && !basePhotos.includes(variantPhotoUrl)
    ? [...basePhotos, variantPhotoUrl]
    : basePhotos

  const currentPhoto = photos[photoIndex] ?? product.primary_photo_url
  const totalPhotos = photos.length
  // Before detail loads, trust the grid's has_360 flag so the slide dot/icon
  // don't pop in late; once loaded, the real frame count is authoritative.
  const has360 = detail ? spinFrames.length > 0 : product.has_360
  // 360 view is appended as one more slide after the photos, not a separate mode.
  const totalSlides = totalPhotos + (has360 ? 1 : 0)
  const isSpinSlide = has360 && photoIndex === totalPhotos

  const goTo = useCallback((i: number) => {
    if (isTransitioning) return
    // Reset zoom when navigating to a different photo
    setScaleAnim(1)
    setPanX(0)
    setPanY(0)
    setIsZoomed(false)
    currentScaleRef.current = 1
    setIsTransitioning(true)
    const clamped = Math.max(0, Math.min(i, totalSlides - 1))
    prevIndexRef.current = photoIndex // store previous before updating
    setPhotoIndex(clamped)
    setTimeout(() => setIsTransitioning(false), 300)
  }, [totalSlides, isTransitioning, photoIndex])

  // ── Touch handlers for swipe + pinch/zoom + double-tap ──────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Nav arrows/dots/counter live inside this same touch zone — don't let
    // their taps feed the swipe/double-tap-zoom detector below (two quick
    // arrow taps were being misread as a double-tap, zooming in and hiding
    // the arrows).
    if ((e.target as HTMLElement).closest('button')) return
    recentTouchRef.current = Date.now()
    if (e.touches.length === 2) {
      // Pinch start — store initial distance and center
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      lastPinchDistRef.current = Math.sqrt(dx * dx + dy * dy)
      const rect = e.currentTarget.getBoundingClientRect()
      lastPinchCenterRef.current = {
        x: ((e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left) / rect.width * 100,
        y: ((e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top) / rect.height * 100,
      }
      isPinchingRef.current = true
      setIsZoomed(true)
      touchStartX.current = null // prevent swipe
      return
    }
    if (e.touches.length === 1 && isZoomed && currentScaleRef.current > 1) {
      // Pan when zoomed — store start position
      isPanningRef.current = true
      panStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      panStartOffsetRef.current = { x: panX, y: panY }
      touchStartX.current = null // prevent swipe
      return
    }
    // Normal swipe start (not zoomed, not pinching)
    touchStartX.current = e.touches[0]?.clientX ?? null
  }, [isZoomed, panX, panY])

  // Handle touch move for pinch and pan
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isPinchingRef.current && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const ratio = dist / lastPinchDistRef.current
      const newScale = Math.max(1, Math.min(currentScaleRef.current * ratio, 6))
      currentScaleRef.current = newScale
      lastPinchDistRef.current = dist
      setScaleAnim(newScale)
      return
    }
    if (isPanningRef.current && e.touches.length === 1) {
      const dx = e.touches[0].clientX - panStartRef.current.x
      const dy = e.touches[0].clientY - panStartRef.current.y
      setPanX(panStartOffsetRef.current.x + dx)
      setPanY(panStartOffsetRef.current.y + dy)
    }
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    // End pinch
    if (isPinchingRef.current) {
      isPinchingRef.current = false
      // If scale is very close to 1, snap back
      if (currentScaleRef.current < 1.15) {
        setScaleAnim(1)
        setIsZoomed(false)
        currentScaleRef.current = 1
      }
      touchStartX.current = null
      return
    }
    // End pan
    if (isPanningRef.current) {
      isPanningRef.current = false
      touchStartX.current = null
      return
    }
    // Quick tap — detect double-tap
    if (touchStartX.current !== null) {
      const delta = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current
      if (Math.abs(delta) < 10) {
        const now = Date.now()
        if (now - lastTapRef.current < 300) {
          // Double-tap detected — cancel the pending single-tap fullscreen open
          if (singleTapTimeoutRef.current) {
            clearTimeout(singleTapTimeoutRef.current)
            singleTapTimeoutRef.current = null
          }
          lastTapRef.current = 0
          if (currentScaleRef.current > 1) {
            // Zoom out
            setScaleAnim(1)
            setPanX(0)
            setPanY(0)
            setIsZoomed(false)
            currentScaleRef.current = 1
          } else {
            // Zoom in to 2.5x at tap point
            const rect = e.currentTarget.getBoundingClientRect()
            const cx = ((e.changedTouches[0]?.clientX ?? rect.left) - rect.left) / rect.width * 100
            const cy = ((e.changedTouches[0]?.clientY ?? rect.top) - rect.top) / rect.height * 100
            lastPinchCenterRef.current = { x: cx, y: cy }
            setScaleAnim(2.5)
            setIsZoomed(true)
            currentScaleRef.current = 2.5
          }
          touchStartX.current = null
          return
        }
        lastTapRef.current = now
        // Single tap — wait to see if a second tap turns this into a
        // double-tap zoom before opening the fullscreen viewer.
        singleTapTimeoutRef.current = setTimeout(() => {
          singleTapTimeoutRef.current = null
          if (currentScaleRef.current <= 1 && !isSpinSlide) setFullscreenOpen(true)
        }, 300)
      }
    }
    // Regular swipe detection
    if (touchStartX.current === null) return
    const delta = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current
    const SWIPE_THRESHOLD = 50
    if (Math.abs(delta) > SWIPE_THRESHOLD) {
      if (delta < 0 && photoIndex < totalSlides - 1) {
        goTo(photoIndex + 1)
      } else if (delta > 0 && photoIndex > 0) {
        goTo(photoIndex - 1)
      }
    }
    touchStartX.current = null
  }, [photoIndex, totalSlides, goTo, isSpinSlide])

  // Variant click handler: show variant photo in carousel
  const handleVariantClick = useCallback((color: string, photoUrl: string | null) => {
    if (photoUrl) {
      setVariantPhotoUrl(photoUrl)
      setVariantColor(color)
      // Scroll to variant photo (last position)
      const targetIdx = basePhotos.length // variant is appended after product photos
      goTo(targetIdx)
    }
  }, [basePhotos.length, goTo])

  // Share THIS product, not the whole collection — the link lands on the
  // dedicated shared-product page (/{store}/{collection}/product/{id}) whose
  // OG image is the product's own photo, so WhatsApp link previews show the
  // product instead of a bare URL. Recipients get a "View Full Catalog" CTA
  // from that page back into the collection.
  const handleShare = useCallback(async () => {
    const basePath = store ? `/${store}/${slug}` : `/c/${slug}`
    const url = `${window.location.origin}${basePath}/product/${product.id}`
    const title = product.name ?? product.category ?? 'Product'
    const text = `Check out ${title} — ${formatPriceRange(product.price_min, product.price_max)} from ${retailer.shop_name}`
    if (navigator.share) {
      await navigator.share({ title, text, url })
    } else {
      await navigator.clipboard.writeText(url)
    }
  }, [product.id, product.name, product.category, product.price_min, product.price_max, slug, store, retailer.shop_name])

  const handleEnquire = () => {
    if (isSold) return
    const message = buildEnquiryMessage({
      shopName: retailer.shop_name,
      collectionTitle,
      products: [product],
    })
    const url = buildWhatsAppEnquiryLink(retailer.phone, message)
    window.open(url, '_blank')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      onClick={closeSheet}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        className="relative mt-auto bg-white rounded-t-3xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky top bar: drag handle + back/close buttons — stays fixed as
            the content below scrolls. */}
        <div className="sticky top-0 z-20 bg-white rounded-t-3xl">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-gray-200 rounded-full" />
          </div>
          <button
            onClick={closeSheet}
            className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white shadow-soft flex items-center justify-center z-10
                       transition-all active:scale-90 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            aria-label="Back to catalog"
          >
            <ArrowLeft size={17} className="text-gray-600" />
          </button>
          <button
            onClick={closeSheet}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white shadow-soft flex items-center justify-center z-10
                       transition-all active:scale-90 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            aria-label="Close"
          >
            <X size={17} className="text-gray-600" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

        {/* Photo carousel with crossfade transition + pinch-to-zoom, or 360 viewer */}
        <div
          className="relative aspect-square w-full bg-gray-50 overflow-hidden select-none"
          onTouchStart={isSpinSlide ? undefined : handleTouchStart}
          onTouchMove={isSpinSlide ? undefined : handleTouchMove}
          onTouchEnd={isSpinSlide ? undefined : handleTouchEnd}
          onClick={(e) => {
            if (isSpinSlide) return
            if ((e.target as HTMLElement).closest('button')) return
            // Touch taps are already handled by the single/double-tap timer
            // above — only act here for a genuine mouse click.
            if (Date.now() - recentTouchRef.current < 500) return
            if (!isZoomed) setFullscreenOpen(true)
          }}
        >
          {isSpinSlide ? (
            <Product360Viewer
              frames={spinFrames}
              alt={product.name ?? product.category ?? 'Product'}
            />
          ) : (
          /* Zoom container — wraps crossfade layers, transforms for zoom/pan */
          <div
            className="relative w-full h-full"
            style={{
              transform: isZoomed
                ? `scale(${scaleAnim}) translate(${panX}px, ${panY}px)`
                : 'scale(1) translate(0px, 0px)',
              transformOrigin: `${lastPinchCenterRef.current.x}% ${lastPinchCenterRef.current.y}%`,
              transition: isPinchingRef.current || isPanningRef.current
                ? 'none'
                : 'transform 0.2s ease-out',
              cursor: isZoomed ? (isPanningRef.current ? 'grabbing' : 'grab') : 'default',
              touchAction: isZoomed ? 'none' : 'pan-y',
            }}
          >
            {/* Previous photo fading out — uses ref-tracked previous index */}
            {prevIndexRef.current !== photoIndex && photos[prevIndexRef.current] && (
              <div
                key={`prev-${photoIndex}`}
                className="absolute inset-0 opacity-0 animate-fade-out pointer-events-none"
                style={{ animation: 'fadeOut 0.25s ease-in-out forwards' }}
              >
                <Image
                  src={photos[prevIndexRef.current]!}
                  alt=""
                  fill
                  sizes="100vw"
                  className="object-cover"
                />
              </div>
            )}
            {/* Current photo fading in */}
            <div
              key={`curr-${photoIndex}`}
              className="absolute inset-0 opacity-0"
              style={{ animation: 'fadeIn 0.25s ease-in-out forwards' }}
            >
              {currentPhoto && (
                <Image
                  src={currentPhoto}
                  alt={product.name ?? product.category ?? 'Product'}
                  fill
                  sizes="100vw"
                  className="object-cover"
                  priority
                />
              )}
            </div>
          </div>
          )}

          {/* Keyframes + photo-only chrome — hidden while the 360 slide is active */}
          {!isSpinSlide && (
            <>
              <style jsx>{`
                @keyframes fadeIn {
                  from { opacity: 0; }
                  to { opacity: 1; }
                }
                @keyframes fadeOut {
                  from { opacity: 1; }
                  to { opacity: 0; }
                }
              `}</style>

              {/* Variant photo badge — bottom-left so it can't collide with the
                  floating Back button (top-4 left-4) the way a top-left pill does */}
              {variantColor && variantPhotoUrl && photos[photoIndex] === variantPhotoUrl && (
                <div className="absolute bottom-3 left-3 z-10 bg-cyan-600/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-sm">
                  <Palette size={12} />
                  {variantColor}
                </div>
              )}

              {/* Zoom hint — shows briefly on first zoom */}
              {isZoomed && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 bg-black/60 text-white text-[10px] font-medium px-2.5 py-1 rounded-full backdrop-blur-sm pointer-events-none animate-fadeIn">
                  Pinch to zoom · Double-tap to reset
                </div>
              )}
            </>
          )}

          {/* 360 slide badge — bottom-left, mirroring the variant badge */}
          {isSpinSlide && (
            <div className="absolute bottom-3 left-3 z-10 bg-cyan-600/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-sm">
              <RotateCw size={12} />
              Drag to rotate
            </div>
          )}

          {/* Floating Left-side Thumbnail Strip Container (matches Spec #10 / #12 in HTML) */}
          {totalPhotos > 1 && !isSpinSlide && (
            <div className="absolute top-1/2 -translate-y-1/2 left-3 z-20 bg-white/85 backdrop-blur-md rounded-[20px] p-1.5 flex flex-col gap-2 shadow-lg border border-white/80">
              {photos.slice(0, 4).map((photoUrl, i) => (
                <button
                  key={photoUrl}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    goTo(i)
                  }}
                  className={`relative w-9 h-11 rounded-[12px] overflow-hidden border-2 transition-all duration-200 ${
                    i === photoIndex
                      ? 'border-[#BB3F95] scale-105 shadow-sm'
                      : 'border-transparent opacity-80 hover:opacity-100'
                  }`}
                >
                  <Image
                    src={photoUrl}
                    alt=""
                    fill
                    sizes="44px"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Navigation arrows — spans photos + the 360 slide */}
          {totalSlides > 1 && !isZoomed && (
            <button
              onClick={() => goTo(photoIndex < totalSlides - 1 ? photoIndex + 1 : 0)}
              className="w-8 h-8 rounded-full bg-white/90 backdrop-blur-md absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center shadow-md text-[#231F48] border border-white/40 hover:scale-105 transition"
              aria-label="Next"
            >
              <ChevronRight size={16} />
            </button>
          )}

          {/* Dots — last dot is the 360 slide when present */}
          {totalSlides > 1 && (
            <div className="absolute bottom-3.5 left-20 flex gap-1.5 items-center z-10">
              {Array.from({ length: totalSlides }).map((_, i) => (
                <span
                  key={i}
                  className={`transition-all duration-200 ${
                    i === photoIndex
                      ? 'w-4 h-1.5 rounded-full bg-[#BB3F95]'
                      : 'w-1.5 h-1.5 rounded-full bg-white/80'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Counter — bottom-right */}
          <div className="absolute bottom-3.5 right-3.5 bg-[#231F48]/85 backdrop-blur-md text-white text-[10px] font-extrabold px-3 py-1 rounded-full shadow-sm z-10">
            {isSpinSlide ? '360°' : `${totalPhotos} Photos`}
          </div>
        </div>

        {/* 360 spin icon — opens the same viewer fullscreen */}
        {has360 && (
          <div className="px-4 pt-3">
            <button
              onClick={() => setShowSpinModal(true)}
              className="w-full flex items-center justify-center gap-2 bg-[#FAF9FE] hover:bg-[#F2F1FA] text-[#231F48] border border-[#E0E1F6]
                         text-xs font-bold py-2.5 rounded-2xl transition-colors shadow-sm"
              aria-label="View 360° spin fullscreen"
            >
              <RotateCw size={14} className="text-[#BB3F95]" />
              View 360° Interactive Spin
            </button>
          </div>
        )}

        {/* Details Section (Spec #12) */}
        <div className="p-4 space-y-4">
          {/* Status badge */}
          {product.status !== 'AVAILABLE' && (
            <div className={`px-3 py-2 rounded-2xl text-xs font-bold ${
              isSold ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              {isSold ? '🛑 This item has been sold' : '⏳ This item is reserved'}
            </div>
          )}

          {/* Price + Actions Section */}
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-extrabold text-[#231F48] font-sans">
                {formatPriceRange(product.price_min, product.price_max)}/-
              </h2>
              <p className="text-xs text-[#6B4773] font-bold mt-0.5">
                {product.category ?? 'Salwar Suits'} • Festive Collection
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void handleShare()}
                className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-[#231F48] shadow-sm border border-[#E0E1F6] hover:border-[#BB3F95] transition"
                aria-label="Share product"
              >
                <Share2 size={16} />
              </button>
              <button
                onClick={() => !isSold && onFavorite(product.id)}
                disabled={isSold}
                className={`w-10 h-10 rounded-2xl border flex items-center justify-center transition shadow-sm ${
                  isFavorited ? 'bg-[#BB3F95]/15 border-[#BB3F95]/40 text-[#BB3F95]' : 'bg-white border-[#E0E1F6] text-[#231F48] hover:border-[#BB3F95]'
                }`}
                aria-label="Favorite"
              >
                <Heart size={16} className={isFavorited ? 'fill-current text-[#BB3F95]' : 'text-[#231F48]'} />
              </button>
            </div>
          </div>

          {/* AI Summary Card */}
          {detail?.description && (
            <div className="p-4 bg-gradient-to-br from-[#FAF9FE] to-[#F2F1FA] border border-[#E0E1F6] rounded-[24px] shadow-sm">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles size={14} className="text-[#BB3F95]" />
                <span className="text-xs font-bold text-[#BB3F95] uppercase tracking-wider">AI Summary</span>
              </div>
              <p className="text-xs text-[#231F48] leading-relaxed font-medium">
                {detail.description}
              </p>
            </div>
          )}

          {/* Product Specifications Card */}
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
            {fabricEstimate && (
              <div className="flex justify-between text-xs py-1 border-b border-[#E0E1F6]/60">
                <span className="text-[#6B4773] font-medium">Fabric</span>
                <span className="font-bold text-[#231F48]">{fabricEstimate}</span>
              </div>
            )}
            {product.subtype && (
              <div className="flex justify-between text-xs py-1">
                <span className="text-[#6B4773] font-medium">Type</span>
                <span className="font-bold text-[#231F48]">{product.subtype}</span>
              </div>
            )}
          </div>

          {/* Family Sizing Selector Card */}
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

          {/* Dual Action Buttons */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => !isSold && onFavorite(product.id)}
              disabled={isSold}
              className={`flex-1 py-3.5 rounded-2xl bg-white border font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98] ${
                isSold
                  ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                  : isFavorited
                    ? 'border-[#BB3F95] text-[#BB3F95] bg-[#BB3F95]/5'
                    : 'border-[#E0E1F6] text-[#231F48] hover:border-[#BB3F95]'
              }`}
            >
              <Heart size={16} className={isFavorited && !isSold ? 'fill-current text-[#BB3F95]' : 'text-amber-500 fill-amber-500'} />
              <span>{isFavorited ? 'Selected' : 'Select'}</span>
            </button>
            <button
              onClick={() => setShowConsentModal(true)}
              disabled={isSold}
              className={`flex-1 py-3.5 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98] ${
                isSold
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              <MessageCircle size={16} />
              <span>Enquire on WhatsApp</span>
            </button>
          </div>

          {/* Color variants — clickable to show in carousel */}
          {variants.length > 0 && (
            <div className="pt-2">
              <p className="text-xs text-[#6B4773] font-bold mb-2 flex items-center gap-1.5">
                <Palette size={12} />
                Available Colors
              </p>
              <div className="flex flex-wrap gap-2">
                {variants.map((v) => {
                  const isActive = variantColor === v.color && variantPhotoUrl === v.photo_url
                  return (
                    <button
                      key={v.color}
                      onClick={() => v.photo_url ? handleVariantClick(v.color, v.photo_url) : undefined}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all ${
                        isActive
                          ? 'bg-[#231F48] text-white'
                          : v.photo_url
                            ? 'bg-[#FAF9FE] border border-[#E0E1F6] text-[#231F48] hover:border-[#BB3F95]'
                            : 'bg-[#FAF9FE] text-[#6B4773]'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full border border-[#E0E1F6] flex-shrink-0"
                        style={{ backgroundColor: swatchColor(v.color) }}
                      />
                      <span className="text-xs font-semibold">{v.color}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

        </div>

        {/* Try-On CTA — disabled for SOLD */}
        {TRY_ON_ENABLED && !isSold && (
          <div className="px-4 pt-2">
            <button
              onClick={onTryOn}
              className={`w-full font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                isReserved
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 focus-visible:ring-cyan-500'
              }`}
              disabled={isReserved}
            >
              <Camera size={18} />
              {isReserved ? 'Try On Unavailable' : 'Try This On'}
            </button>
            {isReserved && (
              <p className="text-center text-xs text-amber-500 mt-1.5">
                Reserved items cannot be tried on
              </p>
            )}
          </div>
        )}

        {/* Notify When Available — only for SOLD items */}
        {isSold && (
          <div className="px-4 pt-2">
            <NotifyWhenAvailable
              productId={product.id}
              storeSlug={store ?? slug}
              productName={product.name ?? product.category ?? 'this product'}
            />
          </div>
        )}

        {/* Design Gallery — only for unstitched products */}
        {detail?.is_unstitched && (
          <div className="px-4 pt-2">
            <DesignGallery
              retailerPhone={retailer.phone}
              retailerName={retailer.shop_name}
            />
          </div>
        )}

        {/* Reviews — social proof + submission form */}
        <div className="px-4 pt-2 space-y-3">
          <ReviewList
            productId={product.id}
            avgRating={product.avg_rating}
            ratingCount={product.rating_count}
          />
          <ReviewForm
            productName={product.name ?? product.category ?? 'this product'}
            retailerId={retailer.id}
            productId={product.id}
            retailerName={retailer.shop_name}
          />
        </div>

        {/* Related Products — same category from same retailer */}
        {relatedProducts.length > 0 && (
          <div className="px-4 pb-2">
            <div className="border-t border-gray-100 pt-4 mb-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <ShoppingCart size={14} className="text-cyan-600" />
                Related suits
              </h3>
            </div>
            <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 scrollbar-hide snap-x snap-mandatory">
              {relatedProducts.map((rp) => (
                <button
                  key={rp.id}
                  onClick={() => {
                    // Close current sheet, open the related product — triggers
                    // a full re-render with the new product's data.
                    onClose()
                  }}
                  className="flex-shrink-0 w-28 snap-start group"
                >
                  <div className="relative w-28 h-36 rounded-xl overflow-hidden bg-gray-50 border border-gray-100 group-hover:border-cyan-200 group-hover:shadow-soft transition-all">
                    {rp.primary_photo_url ? (
                      <Image
                        src={rp.primary_photo_url}
                        alt={rp.name ?? rp.category ?? 'Product'}
                        fill
                        sizes="112px"
                        className="object-cover group-hover:scale-[1.05] transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ShoppingCart size={20} className="text-gray-300" />
                      </div>
                    )}
                    {rp.status === 'SOLD' && (
                      <div className="absolute top-1 left-1 bg-red-500 text-white text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full">
                        Sold
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-medium text-gray-900 mt-1.5 truncate">
                    {formatPriceRange(rp.price_min, rp.price_max)}
                  </p>
                  {rp.primary_color && (
                    <p className="text-[10px] text-gray-500 truncate">{rp.primary_color}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="pb-6" />
        </div>
      </div>

      {/* Fullscreen 360 spin popup */}
      {showSpinModal && has360 && (
        <div
          className="fixed inset-0 z-[60] bg-black flex items-center justify-center"
          onClick={() => setShowSpinModal(false)}
        >
          <button
            onClick={() => setShowSpinModal(false)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center z-10
                       transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            aria-label="Close 360° view"
          >
            <X size={20} className="text-white" />
          </button>
          <div
            className="relative w-full h-full max-w-lg max-h-[100vh] aspect-square"
            onClick={(e) => e.stopPropagation()}
          >
            <Product360Viewer
              frames={spinFrames}
              alt={product.name ?? product.category ?? 'Product'}
            />
          </div>
        </div>
      )}

      {/* Fullscreen image viewer — click/tap main photo to open, swipe
          left/right between photos (no arrow buttons), back arrow to close. */}
      {fullscreenOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black flex items-center justify-center"
          onClick={() => setFullscreenOpen(false)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              setFullscreenOpen(false)
            }}
            className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center z-10
                       transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            aria-label="Close fullscreen image"
          >
            <ArrowLeft size={20} className="text-white" />
          </button>
          <div
            className="relative w-full h-full"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              fsTouchStartX.current = e.touches[0]?.clientX ?? null
            }}
            onTouchEnd={(e) => {
              if (fsTouchStartX.current === null) return
              const delta = (e.changedTouches[0]?.clientX ?? fsTouchStartX.current) - fsTouchStartX.current
              const SWIPE_THRESHOLD = 50
              if (Math.abs(delta) > SWIPE_THRESHOLD) {
                if (delta < 0 && photoIndex < totalPhotos - 1) goTo(photoIndex + 1)
                else if (delta > 0 && photoIndex > 0) goTo(photoIndex - 1)
              }
              fsTouchStartX.current = null
            }}
          >
            {currentPhoto && (
              <Image
                src={currentPhoto}
                alt={product.name ?? product.category ?? 'Product'}
                fill
                sizes="100vw"
                className="object-contain"
                priority
              />
            )}
            {totalPhotos > 1 && (
              <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-1.5">
                {Array.from({ length: totalPhotos }).map((_, i) => (
                  <div
                    key={i}
                    className={`rounded-full transition-all ${
                      i === photoIndex ? 'w-5 h-2 bg-white' : 'w-2 h-2 bg-white/40'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Customer WhatsApp Lead & Consent Modal (Spec #13) */}
      {showConsentModal && (
        <CustomerConsentModal
          product={detail ?? product}
          retailer={retailer}
          collectionTitle={collectionTitle}
          onClose={() => setShowConsentModal(false)}
        />
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-gray-400 w-16 flex-shrink-0">{label}</span>
      <span className="text-gray-800 font-medium">{value}</span>
    </div>
  )
}
