'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Clock } from 'lucide-react'
import {
  type RecentlyViewedProduct,
  loadRecentlyViewed,
} from '../lib/recentlyViewed'
import { formatPriceRange } from '@kanchuki/shared'

interface Props {
  storeSlug: string
  onProductTap: (product: { id: string; name: string | null; category: string | null; primary_color: string | null; primary_photo_url: string | null; price_min: number | null; price_max: number | null; status: string; avg_rating: number; rating_count: number; has_360: boolean }) => void
}

export function RecentlyViewed({ storeSlug, onProductTap }: Props) {
  const [items, setItems] = useState<RecentlyViewedProduct[]>([])

  useEffect(() => {
    setItems(loadRecentlyViewed(storeSlug))
  }, [storeSlug])

  // Refresh when localStorage changes (another tab or component updates it)
  useEffect(() => {
    const handler = () => setItems(loadRecentlyViewed(storeSlug))
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [storeSlug])

  if (items.length === 0) return null

  return (
    <section className="mb-4">
      <div className="flex items-center gap-2 mb-2 px-1">
        <Clock size={14} className="text-gray-400" />
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Recently Viewed</h2>
      </div>
      <div className="flex gap-2.5 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide snap-x snap-mandatory">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onProductTap({
              id: item.id,
              name: item.name,
              category: item.category,
              primary_color: item.primary_color,
              primary_photo_url: item.photo_url,
              price_min: item.price_min,
              price_max: item.price_max,
              status: 'AVAILABLE',
              avg_rating: 0,
              rating_count: 0,
              has_360: false,
            })}
            className="flex-shrink-0 w-20 snap-start group text-left"
          >
            <div className="relative w-20 h-24 rounded-xl overflow-hidden bg-gray-100 border border-gray-100 group-hover:border-cyan-200 transition-colors">
              {item.photo_url ? (
                <Image
                  src={item.photo_url}
                  alt={item.name ?? item.category ?? 'Product'}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  sizes="80px"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                  ✨
                </div>
              )}
            </div>
            <p className="text-[10px] font-medium text-gray-700 mt-1 truncate">
              {formatPriceRange(item.price_min, item.price_max)}
            </p>
          </button>
        ))}
      </div>
    </section>
  )
}
