'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Users, Search, ChevronRight, ChevronLeft, Store, Ruler, Ban, CheckCircle } from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'
import { Sheet } from '@/components/Sheet'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type Customer = {
  id: string
  name: string
  phone: string
  gender: 'MALE' | 'FEMALE' | null
  consent_given: boolean
  is_blocked: boolean
  blocked_at: string | null
  blocked_reason: string | null
  created_at: string
  measurement_count: number
  retailer: { id: string; shop_name: string; city: string }
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.1 } },
}

const rowVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 200, damping: 25 } },
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [cursorHistory, setCursorHistory] = useState<string[]>([])
  const [actionMsg, setActionMsg] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [blockDialog, setBlockDialog] = useState<{ customer: Customer } | null>(null)
  const [blockReason, setBlockReason] = useState('')

  const load = useCallback(async (searchTerm: string, cursorVal?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchTerm) params.set('search', searchTerm)
      if (cursorVal) params.set('cursor', cursorVal)
      params.set('limit', '20')

      const res = await fetch(`${API_URL}/v1/admin/customers?${params}`, adminGetOptions())
      const json = await res.json()
      setCustomers(json.data)
      setHasMore(json.pagination.has_more)
      setCursor(json.pagination.cursor)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load('')
  }, [load])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setCursorHistory([])
    load(search)
  }

  const handleNext = () => {
    if (cursor) {
      setCursorHistory((prev) => [...prev, cursor])
      load(search, cursor)
    }
  }

  const handlePrev = () => {
    const prev = cursorHistory[cursorHistory.length - 1]
    if (prev) {
      setCursorHistory((prevHistory) => prevHistory.slice(0, -1))
      load(search, prev)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
      </div>
      <p className="text-sm text-gray-500 -mt-4">
        {customers.length > 0 ? `${customers.length} customers shown` : 'Browse all customers across every retailer'}
      </p>

      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1 group">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-ink-500 transition-colors" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ink-500/40 focus:border-ink-400 transition"
          />
        </div>
        <motion.button
          type="submit"
          whileTap={{ scale: 0.98 }}
          className="bg-ink-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:shadow-lg transition"
        >
          Search
        </motion.button>
      </form>

      <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500">Name</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500">Phone</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500">Gender</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500"><Store size={14} className="inline" /> Retailer</th>
                <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500"><Ruler size={14} className="inline" /> Measurements</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500">Consent</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500">Status</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500">Added</th>
                <th className="px-4 py-3.5" />
              </tr>
            </thead>
            <motion.tbody variants={containerVariants} initial="hidden" animate="visible">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-4 bg-gray-200/60 rounded animate-pulse" style={{ width: `${40 + Math.random() * 40}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-gray-400">
                    <Users size={40} className="mx-auto mb-3 text-gray-300" />
                    <p className="text-sm font-medium">No customers found</p>
                    {search && <p className="text-xs mt-1 text-gray-400">Try a different search term</p>}
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <motion.tr
                    key={c.id}
                    variants={rowVariants}
                    className="border-b border-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3.5 font-medium text-gray-900">
                      {c.name}
                      {c.is_blocked && (
                        <span className="ml-2 text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
                          Blocked
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">{c.phone}</td>
                    <td className="px-4 py-3.5 text-gray-600">{c.gender ?? '—'}</td>
                    <td className="px-4 py-3.5">
                      <Link href={`/admin/retailers/${c.retailer.id}`} className="text-gray-700 hover:text-ink-600 transition-colors">
                        {c.retailer.shop_name}
                      </Link>
                      <span className="block text-xs text-gray-400">{c.retailer.city}</span>
                    </td>
                    <td className="px-4 py-3.5 text-center text-gray-600">{c.measurement_count}</td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.consent_given ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {c.consent_given ? 'Given' : 'None'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.is_blocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {c.is_blocked ? 'Blocked' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3.5">
                      {c.is_blocked ? (
                        <motion.button
                          onClick={async () => {
                            setActionMsg('')
                            setActionLoading(true)
                            try {
                              const res = await fetch(`${API_URL}/v1/admin/customers/${c.id}/unblock`, {
                                ...(await adminMutateOptions()),
                                method: 'POST',
                              })
                              if (!res.ok) throw new Error('Failed to unblock')
                              setCustomers((prev) => prev.map((cc) => cc.id === c.id ? { ...cc, is_blocked: false, blocked_reason: null } : cc))
                              setActionMsg(`Unblocked ${c.name}`)
                              setTimeout(() => setActionMsg(''), 3000)
                            } catch (err) {
                              setActionMsg(err instanceof Error ? err.message : 'Action failed')
                            } finally {
                              setActionLoading(false)
                            }
                          }}
                          disabled={actionLoading}
                          className="flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-700 px-2 py-1 rounded-lg hover:bg-green-50 transition disabled:opacity-60"
                        >
                          <CheckCircle size={13} />
                          Unblock
                        </motion.button>
                      ) : (
                        <motion.button
                          onClick={() => { setBlockDialog({ customer: c }); setBlockReason('') }}
                          className="flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition"
                        >
                          <Ban size={13} />
                          Block
                        </motion.button>
                      )}
                    </td>
                  </motion.tr>
                ))
              )}
            </motion.tbody>
          </table>
        </div>

        {!loading && customers.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/80">
            <span className="text-xs text-gray-400">
              {customers.length} customer{customers.length !== 1 ? 's' : ''}{actionMsg && <span className="ml-2 text-green-600 font-medium">· {actionMsg}</span>}
            </span>
            <div className="flex items-center gap-2">
              <motion.button
                onClick={handlePrev}
                disabled={cursorHistory.length === 0}
                whileTap={{ scale: 0.95 }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white/80 disabled:opacity-30 disabled:cursor-not-allowed transition"
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </motion.button>
              <span className="text-xs text-gray-400 font-mono">Page {cursorHistory.length + 1}</span>
              <motion.button
                onClick={handleNext}
                disabled={!hasMore}
                whileTap={{ scale: 0.95 }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white/80 disabled:opacity-30 disabled:cursor-not-allowed transition"
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </motion.button>
            </div>
          </div>
        )}
      </div>

      {/* Block confirmation dialog */}
      {blockDialog && (
        <Sheet
          open
          onClose={() => setBlockDialog(null)}
          overlayClassName="z-50 flex items-center justify-center bg-black/30"
          panelClassName="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl border border-gray-200 space-y-4 max-h-full overflow-y-auto"
          overlayAnimation={{ initial: { opacity: 0 }, animate: { opacity: 1 } }}
          panelAnimation={{ initial: { scale: 0.95, opacity: 0 }, animate: { scale: 1, opacity: 1 } }}
          ariaLabel="Block Customer"
        >
            <h3 className="text-lg font-bold text-gray-900">Block Customer</h3>
            <p className="text-sm text-gray-500">
              This will prevent <strong>{blockDialog.customer.name}</strong> ({blockDialog.customer.phone})
              from submitting new enquiries or checking out. This action is reversible.
            </p>
            <textarea
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Reason for blocking (required)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40 min-h-[80px]"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setBlockDialog(null)}
                className="flex-1 bg-gray-100 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!blockReason.trim()) return
                  setActionMsg('')
                  setActionLoading(true)
                  try {
                    const res = await fetch(`${API_URL}/v1/admin/customers/${blockDialog.customer.id}/block`, {
                      ...(await adminMutateOptions()),
                      method: 'POST',
                      body: JSON.stringify({ reason: blockReason.trim() }),
                    })
                    if (!res.ok) throw new Error('Failed to block')
                    setCustomers((prev) => prev.map((cc) => cc.id === blockDialog.customer.id ? { ...cc, is_blocked: true, blocked_reason: blockReason.trim() } : cc))
                    setActionMsg(`Blocked ${blockDialog.customer.name}`)
                    setTimeout(() => setActionMsg(''), 3000)
                    setBlockDialog(null)
                  } catch (err) {
                    setActionMsg(err instanceof Error ? err.message : 'Action failed')
                  } finally {
                    setActionLoading(false)
                  }
                }}
                disabled={actionLoading || !blockReason.trim()}
                className="flex-1 bg-red-500 hover:bg-red-400 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50 transition"
              >
                {actionLoading ? 'Blocking...' : 'Confirm Block'}
              </button>
            </div>
        </Sheet>
      )}
    </motion.div>
  )
}
