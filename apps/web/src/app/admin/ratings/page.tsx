'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Star,
  Flag,
  EyeOff,
  Eye,
  AlertTriangle,
  Filter,
  ChevronLeft,
  ChevronRight,
  Store,
  ShoppingBag,
  MessageSquare,
} from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type ReviewStats = {
  total_reviews: number
  product_reviews: number
  store_reviews: number
  avg_product_rating: number
  avg_store_rating: number
  flagged: number
  hidden: number
}

type Review = {
  id: string
  rating: number
  comment: string | null
  is_flagged: boolean
  is_hidden: boolean
  created_at: string
  _type: 'product' | 'store'
  product?: { id: string; name: string | null }
  customer?: { id: string; name: string }
  retailer?: { id: string; shop_name: string }
}

type Pagination = {
  page: number
  limit: number
  total: number
  pages: number
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.1 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 200, damping: 25 } },
}

function StarDisplay({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={size}
          className={star <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}
        />
      ))}
    </div>
  )
}

export default function AdminRatingsPage() {
  const [stats, setStats] = useState<ReviewStats | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    type: 'all' as 'all' | 'product' | 'store',
    flagged: '' as string,
    hidden: '' as string,
    min_rating: '' as string,
    max_rating: '' as string,
  })
  const [page, setPage] = useState(1)

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/v1/admin/reviews/stats`, adminGetOptions())
      if (res.ok) {
        const json = await res.json()
        setStats(json.data)
      }
    } catch {
      // ignore
    }
  }, [])

  const loadReviews = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', '20')
      if (filters.type !== 'all') params.set('type', filters.type)
      if (filters.flagged) params.set('flagged', filters.flagged)
      if (filters.hidden) params.set('hidden', filters.hidden)
      if (filters.min_rating) params.set('min_rating', filters.min_rating)
      if (filters.max_rating) params.set('max_rating', filters.max_rating)

      const res = await fetch(`${API_URL}/v1/admin/reviews?${params}`, adminGetOptions())
      if (res.ok) {
        const json = await res.json()
        setReviews(json.data)
        setPagination(json.pagination)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [page, filters])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  useEffect(() => {
    void loadReviews()
  }, [loadReviews])

  const handleAction = async (type: string, id: string, action: 'flag' | 'hide' | 'unhide') => {
    try {
      const opts = await adminMutateOptions()
      const res = await fetch(`${API_URL}/v1/admin/reviews/${type}/${id}/${action}`, {
        ...opts,
        method: 'PATCH',
      })
      if (res.ok) {
        void loadReviews()
        void loadStats()
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <Star size={24} className="text-amber-400" />
          Ratings & Reviews
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Moderate customer reviews across all retailers
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={<MessageSquare size={18} className="text-blue-500" />}
            label="Total Reviews"
            value={stats.total_reviews}
            sub={`${stats.product_reviews} product · ${stats.store_reviews} store`}
          />
          <StatCard
            icon={<Star size={18} className="text-amber-500" />}
            label="Avg Product Rating"
            value={stats.avg_product_rating.toFixed(1)}
            sub="out of 5"
          />
          <StatCard
            icon={<AlertTriangle size={18} className="text-orange-500" />}
            label="Flagged"
            value={stats.flagged}
            sub="needs review"
            alert={stats.flagged > 0}
          />
          <StatCard
            icon={<EyeOff size={18} className="text-red-500" />}
            label="Hidden"
            value={stats.hidden}
            sub="soft-hidden"
          />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} className="text-gray-400" />
          <span className="text-sm font-semibold text-gray-700">Filters</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={filters.type}
            onChange={(e) => { setFilters((f) => ({ ...f, type: e.target.value as typeof f.type })); setPage(1) }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <option value="all">All Types</option>
            <option value="product">Product Reviews</option>
            <option value="store">Store Reviews</option>
          </select>

          <select
            value={filters.flagged}
            onChange={(e) => { setFilters((f) => ({ ...f, flagged: e.target.value })); setPage(1) }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <option value="">All Flags</option>
            <option value="true">Flagged Only</option>
            <option value="false">Not Flagged</option>
          </select>

          <select
            value={filters.hidden}
            onChange={(e) => { setFilters((f) => ({ ...f, hidden: e.target.value })); setPage(1) }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <option value="">All Visibility</option>
            <option value="true">Hidden Only</option>
            <option value="false">Visible Only</option>
          </select>

          <select
            value={filters.min_rating}
            onChange={(e) => { setFilters((f) => ({ ...f, min_rating: e.target.value })); setPage(1) }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <option value="">Min Rating</option>
            <option value="1">1+ Stars</option>
            <option value="2">2+ Stars</option>
            <option value="3">3+ Stars</option>
            <option value="4">4+ Stars</option>
            <option value="5">5 Stars</option>
          </select>

          <select
            value={filters.max_rating}
            onChange={(e) => { setFilters((f) => ({ ...f, max_rating: e.target.value })); setPage(1) }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <option value="">Max Rating</option>
            <option value="1">1 Star</option>
            <option value="2">2 or less</option>
            <option value="3">3 or less</option>
            <option value="4">4 or less</option>
            <option value="5">5 or less</option>
          </select>
        </div>
      </div>

      {/* Reviews List */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-500 mt-3">Loading reviews...</p>
          </div>
        ) : reviews.length === 0 ? (
          <div className="p-8 text-center">
            <Star size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No reviews match these filters</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {reviews.map((review) => (
              <ReviewRow
                key={review.id}
                review={review}
                onFlag={() => handleAction(review._type, review.id, 'flag')}
                onHide={() => handleAction(review._type, review.id, 'hide')}
                onUnhide={() => handleAction(review._type, review.id, 'unhide')}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-xs text-gray-500">
              Page {pagination.page} of {pagination.pages} · {pagination.total} reviews
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={page === pagination.pages}
                className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  sub,
  alert,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  sub: string
  alert?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        alert ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}

function ReviewRow({
  review,
  onFlag,
  onHide,
  onUnhide,
}: {
  review: Review
  onFlag: () => void
  onHide: () => void
  onUnhide: () => void
}) {
  const isProduct = review._type === 'product'

  return (
    <div className={`px-4 py-3 hover:bg-gray-50/50 transition-colors ${review.is_hidden ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 mb-1">
            <StarDisplay rating={review.rating} size={12} />
            <span
              className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                isProduct ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
              }`}
            >
              {isProduct ? (
                <span className="flex items-center gap-1"><ShoppingBag size={9} /> Product</span>
              ) : (
                <span className="flex items-center gap-1"><Store size={9} /> Store</span>
              )}
            </span>
            {review.is_flagged && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 flex items-center gap-1">
                <AlertTriangle size={9} /> Flagged
              </span>
            )}
            {review.is_hidden && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-50 text-red-600 flex items-center gap-1">
                <EyeOff size={9} /> Hidden
              </span>
            )}
          </div>

          {/* Comment */}
          {review.comment && (
            <p className="text-sm text-gray-700 line-clamp-2 mb-1">{review.comment}</p>
          )}

          {/* Meta */}
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {review.customer && <span>by {review.customer.name}</span>}
            {review.retailer && <span>· {review.retailer.shop_name}</span>}
            {isProduct && review.product && <span>· {review.product.name ?? 'Unnamed'}</span>}
            <span>· {new Date(review.created_at).toLocaleDateString('en-IN')}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!review.is_flagged && (
            <button
              onClick={onFlag}
              className="p-1.5 rounded-lg text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-colors"
              title="Flag for review"
            >
              <Flag size={14} />
            </button>
          )}
          {!review.is_hidden ? (
            <button
              onClick={onHide}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Hide review"
            >
              <EyeOff size={14} />
            </button>
          ) : (
            <button
              onClick={onUnhide}
              className="p-1.5 rounded-lg text-gray-400 hover:text-green-500 hover:bg-green-50 transition-colors"
              title="Restore review"
            >
              <Eye size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
