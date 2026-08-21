'use client'

import { useState, useEffect } from 'react'
import { Star, MessageSquare } from 'lucide-react'

interface Review {
  id: string
  rating: number
  comment: string | null
  created_at: string
  customer_name: string
}

interface Props {
  productId: string
  avgRating: number
  ratingCount: number
}

export function ReviewList({ productId, avgRating, ratingCount }: Props) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/reviews/product/${productId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data: Review[] } | null) => {
        if (!cancelled && json?.data) setReviews(json.data)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [productId])

  if (ratingCount === 0 && !loading) return null

  const visibleReviews = showAll ? reviews : reviews.slice(0, 3)

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4">
      {/* Rating summary */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-1">
          <Star size={18} className="text-amber-400 fill-amber-400" />
          <span className="text-lg font-bold text-gray-900">{avgRating.toFixed(1)}</span>
        </div>
        <span className="text-xs text-gray-500">
          {ratingCount} review{ratingCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Rating distribution bar */}
      {ratingCount > 0 && (
        <div className="space-y-1 mb-3">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = reviews.filter((r) => r.rating === star).length
            const pct = ratingCount > 0 ? (count / ratingCount) * 100 : 0
            return (
              <div key={star} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 w-3 text-right">{star}</span>
                <Star size={10} className="text-amber-400 fill-amber-400" />
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-400 w-5 text-right">{count}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Individual reviews */}
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <div className="w-5 h-5 border-2 border-gray-200 border-t-cyan-600 rounded-full animate-spin" />
        </div>
      ) : visibleReviews.length > 0 ? (
        <div className="space-y-3">
          {visibleReviews.map((review) => (
            <div key={review.id} className="border-t border-gray-50 pt-3 first:border-0 first:pt-0">
              <div className="flex items-center gap-2 mb-1">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={11}
                      className={i < review.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}
                    />
                  ))}
                </div>
                <span className="text-xs font-medium text-gray-700">
                  {review.customer_name || 'Anonymous'}
                </span>
                <span className="text-[10px] text-gray-400 ml-auto">
                  {new Date(review.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                </span>
              </div>
              {review.comment && (
                <p className="text-xs text-gray-600 leading-relaxed">{review.comment}</p>
              )}
            </div>
          ))}
        </div>
      ) : ratingCount > 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">
          <MessageSquare size={12} className="inline mr-1" />
          Ratings only — no written reviews yet
        </p>
      ) : null}

      {/* Show more */}
      {reviews.length > 3 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3 text-xs font-medium text-cyan-600 hover:text-cyan-700 transition-colors"
        >
          Show all {reviews.length} reviews
        </button>
      )}
    </div>
  )
}
