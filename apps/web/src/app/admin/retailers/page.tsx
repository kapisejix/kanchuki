'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Store,
  Search,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Package,
  Users,
  Share2,
  Clock,
} from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type Retailer = {
  id: string
  shop_name: string
  city: string
  phone: string
  plan: string
  plan_status: string
  trial_ends_at: string | null
  created_at: string
  onboarding_completed: boolean
  product_count: number
  customer_count: number
  collection_count: number
}

function getHeaders() {
  const key = sessionStorage.getItem('admin_key')
  return { 'x-admin-key': key ?? '' }
}

function RetailersContent() {
  const searchParams = useSearchParams()
  const [retailers, setRetailers] = useState<Retailer[]>([])
  const [search, setSearch] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [cursorHistory, setCursorHistory] = useState<string[]>([])

  const loadRetailers = useCallback(async (searchTerm: string, cursorVal?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchTerm) params.set('search', searchTerm)
      if (cursorVal) params.set('cursor', cursorVal)
      params.set('limit', '20')

      const res = await fetch(`${API_URL}/v1/admin/retailers?${params}`, {
        headers: getHeaders(),
      })
      const json = await res.json()
      setRetailers(json.data)
      setHasMore(json.pagination.has_more)
      setCursor(json.pagination.cursor)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Load initial data — respect ?filter=trial from dashboard link
    const filter = searchParams.get('filter')
    loadRetailers('')
  }, [loadRetailers, searchParams])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setCursorHistory([])
    loadRetailers(search)
  }

  const handleNext = () => {
    if (cursor) {
      setCursorHistory((prev) => [...prev, cursor])
      loadRetailers(search, cursor)
    }
  }

  const handlePrev = () => {
    const prev = cursorHistory[cursorHistory.length - 1]
    if (prev) {
      setCursorHistory((prevHistory) => prevHistory.slice(0, -1))
      loadRetailers(search, prev)
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-700'
      case 'TRIAL':
        return 'bg-amber-100 text-amber-700'
      case 'PAST_DUE':
        return 'bg-red-100 text-red-700'
      case 'CANCELLED':
        return 'bg-gray-100 text-gray-500'
      default:
        return 'bg-gray-100 text-gray-500'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Retailers</h1>
        <p className="text-sm text-gray-500 mt-1">
          {retailers.length > 0 ? `${retailers.length} retailers shown` : 'Browse all retailers on the platform'}
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by shop name, city, or phone..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          className="bg-cyan-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-cyan-700 transition-all active:scale-[0.98]"
        >
          Search
        </button>
      </form>

      {/* Retailer table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shop</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">City</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plan</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <Package size={14} className="inline" /> Products
                </th>
                <th className="px-4 py-3.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <Users size={14} className="inline" /> Customers
                </th>
                <th className="px-4 py-3.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <Share2 size={14} className="inline" /> Collec.
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <Clock size={14} className="inline" /> Joined
                </th>
                <th className="px-4 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-gray-50 animate-pulse">
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-32" /></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-20" /></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-16" /></td>
                    <td className="px-4 py-4"><div className="h-5 bg-gray-200 rounded-full w-14" /></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-8 mx-auto" /></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-8 mx-auto" /></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-8 mx-auto" /></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-16" /></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-4" /></td>
                  </tr>
                ))
              ) : retailers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                    <Store size={32} className="mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No retailers found</p>
                    {search && (
                      <p className="text-xs mt-1">Try a different search term</p>
                    )}
                  </td>
                </tr>
              ) : (
                retailers.map((r) => {
                  const trialEnd = r.trial_ends_at ? new Date(r.trial_ends_at) : null
                  const isExpiring = trialEnd && trialEnd < new Date(Date.now() + 7 * 86400000) && r.plan_status === 'TRIAL'

                  return (
                    <tr
                      key={r.id}
                      className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-4 py-3.5">
                        <Link
                          href={`/admin/retailers/${r.id}`}
                          className="font-medium text-gray-900 hover:text-cyan-600 transition-colors"
                        >
                          {r.shop_name}
                          {!r.onboarding_completed && (
                            <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                              Setup
                            </span>
                          )}
                          {isExpiring && (
                            <span className="ml-1.5 text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
                              Expiring
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-gray-600">{r.city}</td>
                      <td className="px-4 py-3.5">
                        <span className="text-gray-700 font-medium">{r.plan}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(r.plan_status)}`}>
                          {r.plan_status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center text-gray-600 font-medium">{r.product_count}</td>
                      <td className="px-4 py-3.5 text-center text-gray-600">{r.customer_count}</td>
                      <td className="px-4 py-3.5 text-center text-gray-600">{r.collection_count}</td>
                      <td className="px-4 py-3.5 text-gray-400 text-xs whitespace-nowrap">
                        {new Date(r.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3.5">
                        <Link
                          href={`/admin/retailers/${r.id}`}
                          className="text-gray-300 hover:text-gray-600 transition-colors"
                        >
                          <ChevronRight size={18} />
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {!loading && retailers.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
            <span className="text-xs text-gray-400">
              {retailers.length} retailer{retailers.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrev}
                disabled={cursorHistory.length === 0}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-gray-400">
                Page {cursorHistory.length + 1}
              </span>
              <button
                onClick={handleNext}
                disabled={!hasMore}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                aria-label="Next page"
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

export default function RetailersPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48 animate-pulse" />
        <div className="h-10 bg-gray-200 rounded-xl animate-pulse" />
        <div className="h-96 bg-gray-200 rounded-2xl animate-pulse" />
      </div>
    }>
      <RetailersContent />
    </Suspense>
  )
}
