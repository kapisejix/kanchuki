'use client'

import { useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { X, Heart, MessageCircle, ChevronLeft, ChevronRight, Camera, Palette } from 'lucide-react'
import type { PublicProduct, PublicCollection } from '@kanchuki/shared'
import { formatPriceRange, buildWhatsAppEnquiryLink, buildEnquiryMessage } from '@kanchuki/shared'

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

  const goTo = useCallback((i: number) => {
    if (isTransitioning) return
    setIsTransitioning(true)
    const clamped = Math.max(0, Math.min(i, totalPhotos - 1))
    prevIndexRef.current = photoIndex // store previous before updating
    setPhotoIndex(clamped)
    setTimeout(() => setIsTransitioning(false), 300)
  }, [totalPhotos, isTransitioning, photoIndex])

  // Touch swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const delta = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current
    const SWIPE_THRESHOLD = 50
    if (Math.abs(delta) > SWIPE_THRESHOLD) {
      if (delta < 0 && photoIndex < totalPhotos - 1) {
        goTo(photoIndex + 1)
      } else if (delta > 0 && photoIndex > 0) {
        goTo(photoIndex - 1)
      }
    }
    touchStartX.current = null
  }, [photoIndex, totalPhotos, goTo])

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

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center z-10"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        {/* Photo carousel with crossfade transition */}
        <div
          className="relative aspect-square w-full bg-gray-50 overflow-hidden select-none"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Crossfade: two overlapping layers — outgoing fades out, incoming fades in */}
          {/* Previous photo fading out — uses ref-tracked previous index for correct animation in both directions */}
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

          {/* Keyframes injected once */}
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

          {/* Navigation arrows */}
          {totalPhotos > 1 && (
            <>
              {photoIndex > 0 && (
                <button
                  onClick={() => goTo(photoIndex - 1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow-sm flex items-center justify-center z-10 transition-all hover:scale-105 active:scale-95"
                  aria-label="Previous photo"
                >
                  <ChevronLeft size={18} className="text-gray-700" />
                </button>
              )}
              {photoIndex < totalPhotos - 1 && (
                <button
                  onClick={() => goTo(photoIndex + 1)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow-sm flex items-center justify-center z-10 transition-all hover:scale-105 active:scale-95"
                  aria-label="Next photo"
                >
                  <ChevronRight size={18} className="text-gray-700" />
                </button>
              )}

              {/* Dots */}
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
                {Array.from({ length: totalPhotos }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(i)}
                    className={`rounded-full transition-all duration-200 ${
                      i === photoIndex
                        ? 'w-5 h-2 bg-white shadow-sm'
                        : 'w-2 h-2 bg-white/60 hover:bg-white/80'
                    }`}
                    aria-label={`Photo ${i + 1}`}
                  />
                ))}
              </div>

              {/* Photo counter */}
              <div className="absolute top-3 right-3 z-10 bg-black/50 text-white text-xs font-medium px-2.5 py-1 rounded-full backdrop-blur-sm">
                {photoIndex + 1} / {totalPhotos}
              </div>
            </>
          )}
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

          {/* Price + favorite */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-xl font-bold ${isSold ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                {formatPriceRange(product.price_min, product.price_max)}
              </p>
              <p className="text-sm text-gray-500">
                {product.category}
                {product.occasions[0] ? ` · ${product.occasions[0]}` : ''}
              </p>
            </div>
            {!isSold && (
              <button
                onClick={() => onFavorite(product.id)}
                className="w-10 h-10 rounded-full border-2 border-gray-100 flex items-center justify-center flex-shrink-0 hover:border-rose-200 transition-colors"
                aria-label={isFavorited ? 'Remove from favorites' : 'Save to favorites'}
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
        {!isSold && (
          <div className="px-4 pt-2">
            <button
              onClick={onTryOn}
              className={`w-full font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                isReserved
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm hover:shadow-md'
              }`}
              disabled={isReserved}
            >
              <Camera size={18} />
              {isReserved ? 'Try On Unavailable' : 'Try This On'}
            </button>
            {isReserved && (
              <p className="text-center text-xs text-amber-500 mt-1">
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
            className={`w-full font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all text-base active:scale-[0.98] ${
              isSold
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-600 text-white shadow-sm hover:shadow-md'
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
    <span className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full font-medium">
      {label}
    </span>
  )
}
