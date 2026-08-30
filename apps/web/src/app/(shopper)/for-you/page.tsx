// Task 21: For You feed page — personalized product discovery.
//
// Shows ranked products based on the shopper's Fashion DNA.
// When not authenticated, shows trending products (cold-start).

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Product {
  id: string
  name: string | null
  category: string | null
  primary_color: string | null
  price_min: number | null
  price_max: number | null
  photo_url: string | null
  retailer_id: string
  retailer_name: string
  retailer_slug: string | null
  score: number
}

function formatPrice(paise: number | null): string | null {
  if (paise == null) return null
  const rupees = paise / 100
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}K`
  return `₹${rupees.toLocaleString('en-IN')}`
}

export default function ForYouPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    loadProducts()
  }, [])

  async function loadProducts(nextCursor?: string) {
    if (nextCursor) setLoadingMore(true)
    else setLoading(true)

    try {
      const params = new URLSearchParams()
      if (nextCursor) params.set('cursor', nextCursor)
      params.set('limit', '20')

      const res = await fetch(`/api/for-you?${params}`, {
        credentials: 'include',
      })
      const data = await res.json()

      if (nextCursor) {
        setProducts((prev) => [...prev, ...(data.items ?? [])])
      } else {
        setProducts(data.items ?? [])
      }
      setCursor(data.next_cursor ?? null)
    } catch {
      // Failed to load — show empty state
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-stone-900 mb-6">For You</h1>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[3/4] bg-stone-200 rounded-lg" />
              <div className="h-4 bg-stone-200 rounded mt-2 w-3/4" />
              <div className="h-3 bg-stone-200 rounded mt-1 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-stone-900 mb-6">For You</h1>
        <div className="text-center py-16">
          <p className="text-stone-500 text-lg mb-2">No products to show yet</p>
          <p className="text-stone-400 text-sm">
            Browse some stores and we&apos;ll personalize your feed here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-stone-900 mb-6">For You</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {products.map((product) => (
          <Link
            key={product.id}
            href={product.retailer_slug ? `/c/${product.retailer_slug}` : '#'}
            className="group"
          >
            <div className="aspect-[3/4] bg-stone-100 rounded-lg overflow-hidden relative">
              {product.photo_url ? (
                <img
                  src={product.photo_url}
                  alt={product.name ?? 'Product'}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-stone-400 text-sm">
                  No photo
                </div>
              )}
              {product.primary_color && (
                <span className="absolute top-2 left-2 text-xs bg-white/80 backdrop-blur px-2 py-0.5 rounded-full text-stone-600">
                  {product.primary_color}
                </span>
              )}
            </div>
            <div className="mt-2">
              <p className="text-sm font-medium text-stone-800 truncate">
                {product.name ?? product.category ?? 'Product'}
              </p>
              <p className="text-xs text-stone-500 truncate">{product.retailer_name}</p>
              {product.price_min && (
                <p className="text-xs font-medium text-amber-700">
                  {formatPrice(product.price_min)}
                  {product.price_max && product.price_max !== product.price_min && (
                    <> – {formatPrice(product.price_max)}</>
                  )}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>

      {/* Load more */}
      {cursor && (
        <div className="text-center mt-8">
          <button
            onClick={() => loadProducts(cursor)}
            disabled={loadingMore}
            className="px-6 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm text-stone-600 disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
