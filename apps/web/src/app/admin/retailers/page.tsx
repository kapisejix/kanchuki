'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Store,
  Search,
  ChevronRight,
  ChevronLeft,
  Package,
  Users,
  Share2,
  Clock,
  Sparkles,
  Trash2,
} from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim',
  'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal', 'Delhi', 'Jammu & Kashmir', 'Ladakh',
]

type Retailer = {
  id: string
  shop_name: string
  city: string
  state: string | null
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

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
}

const rowVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', stiffness: 200, damping: 25 },
  },
}

type Filters = { search: string; city: string; plan: string; status: string; state: string }

function RetailersContent() {
  const searchParams = useSearchParams()
  const [retailers, setRetailers] = useState<Retailer[]>([])
  const [filters, setFilters] = useState<Filters>({ search: '', city: '', plan: '', status: '', state: '' })
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [cursorHistory, setCursorHistory] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const loadRetailers = useCallback(async (f: Filters, cursorVal?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (f.search) params.set('search', f.search)
      if (f.city) params.set('city', f.city)
      if (f.plan) params.set('plan', f.plan)
      if (f.status) params.set('status', f.status)
      if (f.state) params.set('state', f.state)
      if (cursorVal) params.set('cursor', cursorVal)
      params.set('limit', '20')

      const res = await fetch(`${API_URL}/v1/admin/retailers?${params}`, {
        headers: getHeaders(),
      })
      const json = await res.json()
      setRetailers(json.data)
      setHasMore(json.pagination.has_more)
      setCursor(json.pagination.cursor)
      setSelected(new Set())
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRetailers(filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadRetailers, searchParams])

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault()
    setCursorHistory([])
    loadRetailers(filters)
  }

  const handleNext = () => {
    if (cursor) {
      setCursorHistory((prev) => [...prev, cursor])
      loadRetailers(filters, cursor)
    }
  }

  const handlePrev = () => {
    const prev = cursorHistory[cursorHistory.length - 1]
    if (prev) {
      setCursorHistory((prevHistory) => prevHistory.slice(0, -1))
      loadRetailers(filters, prev)
    }
  }

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelected((prev) => (prev.size === retailers.length ? new Set() : new Set(retailers.map((r) => r.id))))
  }

  const bulkDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} retailer${selected.size !== 1 ? 's' : ''}? This cannot be undone.`)) return

    setDeleting(true)
    try {
      const res = await fetch(`${API_URL}/v1/admin/retailers`, {
        method: 'DELETE',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected) }),
      })
      if (!res.ok) throw new Error('Delete failed')
      loadRetailers(filters, undefined)
    } catch {
      // ignore
    } finally {
      setDeleting(false)
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-700'
      case 'TRIAL': return 'bg-amber-100 text-amber-700'
      case 'PAST_DUE': return 'bg-red-100 text-red-700'
      case 'CANCELLED': return 'bg-gray-100 text-gray-500'
      default: return 'bg-gray-100 text-gray-500'
    }
  }

  const selectClass = "border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 transition-all"

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Retailers</h1>
        <motion.div
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 5 }}
        >
          <Sparkles size={18} className="text-cyan-500" />
        </motion.div>
      </div>
      <p className="text-sm text-gray-500 -mt-4">
        {retailers.length > 0 ? `${retailers.length} retailers shown` : 'Browse all retailers on the platform'}
      </p>

      {/* Filters */}
      <form onSubmit={applyFilters} className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px] group">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-cyan-500 transition-colors" />
          <input
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search by shop name, city, or phone..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 transition-all"
          />
        </div>
        <input
          value={filters.city}
          onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
          placeholder="City"
          className="w-36 px-3 py-2.5 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 transition-all"
        />
        <select
          value={filters.state}
          onChange={(e) => setFilters((f) => ({ ...f, state: e.target.value }))}
          className={selectClass}
        >
          <option value="">All States</option>
          {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filters.plan}
          onChange={(e) => setFilters((f) => ({ ...f, plan: e.target.value }))}
          className={selectClass}
        >
          <option value="">All Plans</option>
          <option value="STARTER">Starter</option>
          <option value="GROWTH">Growth</option>
          <option value="PRO">Pro</option>
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className={selectClass}
        >
          <option value="">All Status</option>
          <option value="TRIAL">Trial</option>
          <option value="ACTIVE">Active</option>
          <option value="PAST_DUE">Past Due</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <motion.button
          type="submit"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:shadow-lg hover:shadow-cyan-500/25 transition-all"
        >
          Filter
        </motion.button>
      </form>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between bg-red-50/80 border border-red-200 rounded-xl px-4 py-2.5">
          <span className="text-sm text-red-700 font-medium">{selected.size} selected</span>
          <button
            onClick={bulkDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-60"
          >
            <Trash2 size={13} />
            {deleting ? 'Deleting...' : 'Delete selected'}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="px-4 py-3.5 text-left">
                  <input
                    type="checkbox"
                    checked={retailers.length > 0 && selected.size === retailers.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all retailers"
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Shop</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">City</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">State</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Plan</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider"><Package size={14} className="inline" /> Products</th>
                <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider"><Users size={14} className="inline" /> Customers</th>
                <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider"><Share2 size={14} className="inline" /> Collec.</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"><Clock size={14} className="inline" /> Joined</th>
                <th className="px-4 py-3.5" />
              </tr>
            </thead>
            <motion.tbody
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {[...Array(11)].map((_, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-4 bg-gray-200/60 rounded animate-pulse" style={{ width: `${40 + Math.random() * 40}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : retailers.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center text-gray-400">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                    >
                      <Store size={40} className="mx-auto mb-3 text-gray-300" />
                      <p className="text-sm font-medium">No retailers found</p>
                      {filters.search && <p className="text-xs mt-1 text-gray-400">Try a different search term</p>}
                    </motion.div>
                  </td>
                </tr>
              ) : (
                retailers.map((r, i) => {
                  const trialEnd = r.trial_ends_at ? new Date(r.trial_ends_at) : null
                  const isExpiring = trialEnd && trialEnd < new Date(Date.now() + 7 * 86400000) && r.plan_status === 'TRIAL'

                  return (
                    <motion.tr
                      key={r.id}
                      variants={rowVariants}
                      whileHover={{ backgroundColor: 'rgba(6,182,212,0.03)', transition: { duration: 0.2 } }}
                      className="border-b border-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleSelected(r.id)}
                          aria-label={`Select ${r.shop_name}`}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        <Link
                          href={`/admin/retailers/${r.id}`}
                          className="font-medium text-gray-900 hover:text-cyan-600 transition-colors"
                        >
                          {r.shop_name}
                          {!r.onboarding_completed && (
                            <span className="ml-2 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                              Setup
                            </span>
                          )}
                          {isExpiring && (
                            <span className="ml-1.5 text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
                              Expiring
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-gray-600">{r.city}</td>
                      <td className="px-4 py-3.5 text-gray-600">{r.state || '—'}</td>
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
                          day: '2-digit', month: 'short', year: 'numeric',
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
                    </motion.tr>
                  )
                })
              )}
            </motion.tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && retailers.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/80">
            <span className="text-xs text-gray-400">
              {retailers.length} retailer{retailers.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-2">
              <motion.button
                onClick={handlePrev}
                disabled={cursorHistory.length === 0}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </motion.button>
              <span className="text-xs text-gray-400 font-mono">
                Page {cursorHistory.length + 1}
              </span>
              <motion.button
                onClick={handleNext}
                disabled={!hasMore}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </motion.button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default function RetailersPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div className="h-8 bg-gray-200/60 rounded w-48 animate-pulse" />
        <div className="h-10 bg-gray-200/60 rounded-xl animate-pulse" />
        <div className="h-96 bg-gray-200/60 rounded-2xl animate-pulse" />
      </div>
    }>
      <RetailersContent />
    </Suspense>
  )
}
