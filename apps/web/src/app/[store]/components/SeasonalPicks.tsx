'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'

interface CollectionPreview {
  id: string
  title: string
  slug: string
  product_count: number
  preview_products: Array<{
    id: string
    name: string | null
    category: string | null
    primary_color: string | null
    price_min: number | null
    price_max: number | null
    photo_url: string | null
  }>
}

interface Props {
  storeSlug: string
}

export function SeasonalPicks({ storeSlug }: Props) {
  const [collections, setCollections] = useState<CollectionPreview[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/${storeSlug}/collections`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data: CollectionPreview[] } | null) => {
        if (!cancelled && json?.data) setCollections(json.data)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [storeSlug])

  if (loading || collections.length === 0) return null

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3 px-1">
        <Sparkles size={16} className="text-amber-500" />
        <h2 className="text-sm font-bold text-gray-900">Curated Collections</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 scrollbar-hide snap-x snap-mandatory">
        {collections.map((col) => (
          <Link
            key={col.id}
            href={`/${storeSlug}/${col.slug}`}
            className="flex-shrink-0 w-56 snap-start group"
          >
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm group-hover:shadow-md transition-shadow">
              {/* Preview grid — up to 4 product photos */}
              <div className="grid grid-cols-2 gap-0.5 aspect-[2/1]">
                {col.preview_products.slice(0, 4).map((p, i) => (
                  <div key={p.id} className="relative bg-gray-100 overflow-hidden">
                    {p.photo_url ? (
                      <Image
                        src={p.photo_url}
                        alt={p.name ?? p.category ?? 'Product'}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        sizes="112px"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                        ✨
                      </div>
                    )}
                  </div>
                ))}
                {/* Fill empty slots */}
                {Array.from({ length: Math.max(0, 4 - col.preview_products.length) }).map((_, i) => (
                  <div key={`empty-${i}`} className="bg-gray-50" />
                ))}
              </div>
              <div className="p-2.5">
                <p className="text-xs font-semibold text-gray-900 truncate">{col.title}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {col.product_count} item{col.product_count === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
