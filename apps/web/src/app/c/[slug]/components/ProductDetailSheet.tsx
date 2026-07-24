'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Image from 'next/image'
import { X, ArrowLeft, Heart, MessageCircle, ChevronLeft, ChevronRight, Camera, Palette, MapPin, RotateCw } from 'lucide-react'
import type { PublicProduct, PublicCollection } from '@kanchuki/shared'
import { formatPriceRange, buildWhatsAppEnquiryLink, buildEnquiryMessage } from '@kanchuki/shared'
import { Product360Viewer } from './Product360Viewer'

// ponytail: Try-On feature not finished yet — flip to true when ready.
const TRY_ON_ENABLED = false

interface Props {
  product: PublicProduct
  retailer: PublicCollection['retailer']
  collectionTitle: string
  isFavorited: boolean
  onFavorite: (id: string) => void
  onTryOn: () => void
  onClose: () => void
}

export function ProductDetailSheet({
  product,
  retailer,
  collectionTitle,
  isFavorited,
  onFavorite,
  onTryOn,
  onClose,
}: Props) {
  const [photoIndex, setPhotoIndex] = useState(0)
  const [variantPhotoUrl, setVariantPhotoUrl] = useState<string | null>(null)
  const [variantColor, setVariantColor] = useState<string | null>(null)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const prevIndexRef = useRef(photoIndex)

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

  const isSold = product.status === 'SOLD'
  const isReserved = product.status === 'RESERVED'

  // Build photos array: product photos + optionally a variant photo
  const photos = product.photos.length > 0
    ? (variantPhotoUrl && !product.photos.includes(variantPhotoUrl)
        ? [...product.photos, variantPhotoUrl]
        : product.photos)
    : [product.primary_photo_url]

  const currentPhoto = photos[photoIndex] ?? product.primary_photo_url
  const totalPhotos = photos.length
  const has360 = product.spin_frames.length > 0
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
          // Double-tap detected
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
  }, [photoIndex, totalSlides, goTo])

  // Variant click handler: show variant photo in carousel
  const handleVariantClick = useCallback((color: string, photoUrl: string | null) => {
    if (photoUrl) {
      setVariantPhotoUrl(photoUrl)
      setVariantColor(color)
      // Scroll to variant photo (last position)
      const targetIdx = product.photos.length // variant is appended after product photos
      goTo(targetIdx)
    }
  }, [product.photos.length, goTo])

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
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        className="relative mt-auto bg-white rounded-t-3xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Back button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white shadow-soft flex items-center justify-center z-10
                     transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          aria-label="Back to catalog"
        >
          <ArrowLeft size={17} className="text-gray-600" />
        </button>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white shadow-soft flex items-center justify-center z-10
                     transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          aria-label="Close"
        >
          <X size={17} className="text-gray-600" />
        </button>

        {/* Photo carousel with crossfade transition + pinch-to-zoom, or 360 viewer */}
        <div
          className="relative aspect-square w-full bg-gray-50 overflow-hidden select-none"
          onTouchStart={isSpinSlide ? undefined : handleTouchStart}
          onTouchMove={isSpinSlide ? undefined : handleTouchMove}
          onTouchEnd={isSpinSlide ? undefined : handleTouchEnd}
        >
          {isSpinSlide ? (
            <Product360Viewer
              frames={product.spin_frames}
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

              {/* Variant photo badge */}
              {variantColor && variantPhotoUrl && photos[photoIndex] === variantPhotoUrl && (
                <div className="absolute top-3 left-3 z-10 bg-cyan-600/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-sm">
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

          {/* 360 slide badge */}
          {isSpinSlide && (
            <div className="absolute top-3 left-3 z-10 bg-cyan-600/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-sm">
              <RotateCw size={12} />
              Drag to rotate
            </div>
          )}

          {/* Navigation arrows — spans photos + the 360 slide */}
          {totalSlides > 1 && !isZoomed && (
            <>
              {photoIndex > 0 && (
                <button
                  onClick={() => goTo(photoIndex - 1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow-soft flex items-center justify-center z-10 transition-all hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                  aria-label="Previous"
                >
                  <ChevronLeft size={18} className="text-gray-700" />
                </button>
              )}
              {photoIndex < totalSlides - 1 && (
                <button
                  onClick={() => goTo(photoIndex + 1)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow-soft flex items-center justify-center z-10 transition-all hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                  aria-label="Next"
                >
                  <ChevronRight size={18} className="text-gray-700" />
                </button>
              )}
            </>
          )}

          {/* Dots — last dot is the 360 slide when present */}
          {totalSlides > 1 && (
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
              {Array.from({ length: totalSlides }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className={`rounded-full transition-all duration-200 ${
                    i === photoIndex
                      ? 'w-5 h-2 bg-white shadow-sm'
                      : 'w-2 h-2 bg-white/60 hover:bg-white/80'
                  }`}
                  aria-label={has360 && i === totalPhotos ? '360° view' : `Photo ${i + 1}`}
                />
              ))}
            </div>
          )}

          {/* Counter */}
          <div className="absolute top-3 right-3 z-10 bg-black/50 text-white text-xs font-medium px-2.5 py-1 rounded-full backdrop-blur-sm">
            {isSpinSlide ? '360°' : `${photoIndex + 1} / ${totalPhotos}`}
          </div>
        </div>

        {/* Details */}
        <div className="p-4 space-y-3">
          {/* Status badge */}
          {product.status !== 'AVAILABLE' && (
            <div className={`px-3 py-2 rounded-xl text-sm font-semibold ${
              isSold ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
            }`}>
              {isSold ? '🛑 This item has been sold' : '⏳ This item is reserved'}
            </div>
          )}

          {/* Store location — tell staff where to find this item */}
          {product.location && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-100 rounded-xl px-3 py-2">
              <MapPin size={14} />
              {product.location}
            </div>
          )}

          {/* Price + favorite */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`font-display text-2xl font-bold tabular-nums tracking-tight ${isSold ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                {formatPriceRange(product.price_min, product.price_max)}
              </p>
              <p className="text-sm text-gray-500 mt-0.5">
                {product.category}
                {product.occasions[0] ? ` · ${product.occasions[0]}` : ''}
              </p>
            </div>
            {!isSold && (
              <button
                onClick={() => onFavorite(product.id)}
                className="w-11 h-11 rounded-full border border-gray-100 bg-gray-50 flex items-center justify-center flex-shrink-0
                           transition-all active:scale-90 hover:border-rose-200 hover:bg-rose-50
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                aria-label={isFavorited ? 'Remove from Selected' : 'Add to Selected'}
              >
                <Heart
                  size={20}
                  className={isFavorited ? 'text-rose-500 fill-rose-500' : 'text-gray-400'}
                />
              </button>
            )}
          </div>

          {/* Attribute chips */}
          <div className="flex flex-wrap gap-2">
            {product.primary_color && <Chip label={product.primary_color} />}
            {product.fabric_estimate && <Chip label={product.fabric_estimate} />}
            {product.occasions.slice(0, 2).map((o) => <Chip key={o} label={o} />)}
          </div>

          {/* Color variants — clickable to show in carousel */}
          {product.variants.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2 flex items-center gap-1.5">
                <Palette size={12} />
                Available Colors
              </p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => {
                  const isActive = variantColor === v.color && variantPhotoUrl === v.photo_url
                  return (
                    <button
                      key={v.color}
                      onClick={() => v.photo_url ? handleVariantClick(v.color, v.photo_url) : undefined}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all ${
                        isActive
                          ? 'bg-cyan-100 ring-2 ring-cyan-400 ring-offset-1'
                          : v.photo_url
                            ? 'bg-gray-50 hover:bg-gray-100 cursor-pointer'
                            : 'bg-gray-50 cursor-default'
                      }`}
                      title={v.photo_url ? `Click to see ${v.color} photo` : v.color}
                    >
                      <span
                        className="w-3 h-3 rounded-full border border-gray-200 flex-shrink-0"
                        style={{ backgroundColor: v.color.toLowerCase() }}
                      />
                      <span className={`text-xs ${isActive ? 'text-cyan-800 font-medium' : 'text-gray-700'}`}>
                        {v.color}
                      </span>
                      {v.photo_url && !isActive && (
                        <ChevronRight size={10} className="text-gray-300" />
                      )}
                      {v.status === 'SOLD' && (
                        <span className="text-xs text-red-400">(Sold)</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Tags */}
          {product.search_tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {product.search_tags.slice(0, 8).map((tag) => (
                <span
                  key={tag}
                  className="text-xs bg-cyan-50 text-cyan-700 px-2 py-1 rounded-full"
                >
                  {tag}
                </span>
              ))}
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

        {/* Enquire CTA — disabled for SOLD */}
        <div className={`px-4 pb-6 pt-2 ${isSold ? 'pt-4' : ''}`}>
          <button
            onClick={handleEnquire}
            disabled={isSold}
            className={`w-full font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all text-base active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
              isSold
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-600 text-white shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 focus-visible:ring-green-500'
            }`}
          >
            <MessageCircle size={20} />
            {isSold ? 'Sold Out' : isReserved ? 'Enquire About This Item' : 'Enquire on WhatsApp'}
          </button>
          <p className="text-center text-xs text-gray-400 mt-2">
            {isSold
              ? 'This item has been sold. Check other items in the collection.'
              : 'Opens WhatsApp with your enquiry pre-filled'}
          </p>
        </div>
      </div>
    </div>
  )
}

function Chip({ label }: { label: string }) {
  return (
    <span className="text-xs bg-gray-50 border border-gray-100 text-gray-700 px-3 py-1.5 rounded-full font-medium">
      {label}
    </span>
  )
}
