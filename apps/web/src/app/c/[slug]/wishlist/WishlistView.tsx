'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ShoppingBag, Heart, MapPin } from 'lucide-react'
import type { PublicCollection } from '@kanchuki/shared'
import { formatPriceRange } from '@kanchuki/shared'
import { loadWishlist } from '../lib/wishlist'

interface Props {
  collection: PublicCollection
  slug: string
}

export function WishlistView({ collection, slug }: Props) {
  const [savedIds, setSavedIds] = useState<Set<string> | null>(null)

  useEffect(() => {
    setSavedIds(loadWishlist(slug))
  }, [slug])

  if (savedIds === null) return null

  const savedProducts = collection.products.filter((p) => savedIds.has(p.id))

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-md mx-auto px-4 py-3.5 flex items-center gap-3">
          <Link
            href={`/c/${slug}`}
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

      <main className="max-w-md mx-auto px-3 py-4">
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
              href={`/c/${slug}`}
              className="inline-block text-cyan-700 bg-cyan-50 hover:bg-cyan-100 text-sm font-semibold px-4 py-2 rounded-full transition-colors"
            >
              Browse catalog
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {savedProducts.map((product) => (
              <div key={product.id} className="bg-white rounded-2xl overflow-hidden shadow-soft border border-gray-100">
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
    </div>
  )
}
