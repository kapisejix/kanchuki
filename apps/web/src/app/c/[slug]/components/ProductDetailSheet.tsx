'use client'

import { useState } from 'react'
import Image from 'next/image'
import { X, Heart, MessageCircle, ChevronLeft, ChevronRight, Camera } from 'lucide-react'
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

  const photos = product.photos.length > 0 ? product.photos : [product.primary_photo_url]
  const currentPhoto = photos[photoIndex] ?? product.primary_photo_url

  const handleEnquire = () => {
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

        {/* Photo carousel */}
        <div className="relative aspect-square w-full bg-gray-50">
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

          {photos.length > 1 && (
            <>
              <button
                onClick={() => setPhotoIndex((i) => Math.max(0, i - 1))}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center"
                disabled={photoIndex === 0}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPhotoIndex((i) => Math.min(photos.length - 1, i + 1))}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center"
                disabled={photoIndex === photos.length - 1}
              >
                <ChevronRight size={16} />
              </button>

              {/* Dots */}
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPhotoIndex(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      i === photoIndex ? 'bg-white' : 'bg-white/50'
                    }`}
                    aria-label={`Photo ${i + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Details */}
        <div className="p-4 space-y-3">
          {/* Price + favorite */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xl font-bold text-gray-900">
                {formatPriceRange(product.price_min, product.price_max)}
              </p>
              <p className="text-sm text-gray-500">
                {product.category}
                {product.occasions[0] ? ` · ${product.occasions[0]}` : ''}
              </p>
            </div>
            <button
              onClick={() => onFavorite(product.id)}
              className="w-10 h-10 rounded-full border-2 border-gray-100 flex items-center justify-center flex-shrink-0"
              aria-label={isFavorited ? 'Remove from favorites' : 'Save to favorites'}
            >
              <Heart
                size={20}
                className={isFavorited ? 'text-rose-500 fill-rose-500' : 'text-gray-400'}
              />
            </button>
          </div>

          {/* Attribute chips */}
          <div className="flex flex-wrap gap-2">
            {product.primary_color && <Chip label={product.primary_color} />}
            {product.fabric_estimate && <Chip label={product.fabric_estimate} />}
            {product.occasions.slice(0, 2).map((o) => <Chip key={o} label={o} />)}
          </div>

          {/* Color variants */}
          {product.variants.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">Available Colors</p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <div
                    key={v.color}
                    className="flex items-center gap-1.5 bg-gray-50 rounded-full px-3 py-1.5"
                  >
                    <span
                      className="w-3 h-3 rounded-full border border-gray-200"
                      style={{ backgroundColor: v.color.toLowerCase() }}
                    />
                    <span className="text-xs text-gray-700">{v.color}</span>
                    {v.status === 'SOLD' && (
                      <span className="text-xs text-red-400">(Sold)</span>
                    )}
                  </div>
                ))}
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

        {/* Try-On CTA */}
        <div className="px-4 pt-2">
          <button
            onClick={onTryOn}
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-semibold
                       py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-colors"
          >
            <Camera size={18} />
            Try This On
          </button>
        </div>

        {/* Enquire CTA */}
        <div className="px-4 pb-6 pt-2">
          <button
            onClick={handleEnquire}
            className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold
                       py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors text-base"
          >
            <MessageCircle size={20} />
            Enquire on WhatsApp
          </button>
          <p className="text-center text-xs text-gray-400 mt-2">
            Opens WhatsApp with your enquiry pre-filled
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
