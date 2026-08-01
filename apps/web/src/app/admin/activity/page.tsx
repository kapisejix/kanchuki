'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Search,
  Shield,
  Store,
  User,
  Cpu,
  Settings,
  CreditCard,
  HardDrive,
  Bell,
} from 'lucide-react'
import { adminGetOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type LogEntry = {
  id: string
  actor_id: string | null
  actor_type: string | null
  action: string
  resource_type: string
  resource_id: string | null
  metadata: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

type BurstAlert = {
  action: string
  resource_type: string
  actor_type: string
  count: number
  threshold: number
  flagged: boolean
}

const ACTION_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  CREATE: User,
  UPDATE: Settings,
  DELETE: Store,
  BULK_DELETE: Store,
  EXTEND_TRIAL: CreditCard,
  CHANGE_PLAN: CreditCard,
  LOGIN: Shield,
  QUERY: Cpu,
  QUERY_ERROR: Cpu,
  CONNECT_PAYMENT_ACCOUNT: CreditCard,
  DISCONNECT_PAYMENT_ACCOUNT: CreditCard,
}

function actionColor(action: string): string {
  if (action.includes('DELETE') || action.includes('BULK')) return 'text-red-600 bg-red-50 border-red-200'
  if (action.includes('CREATE')) return 'text-green-600 bg-green-50 border-green-200'
  if (action.includes('UPDATE') || action.includes('CHANGE') || action.includes('EXTEND')) return 'text-amber-600 bg-amber-50 border-amber-200'
  if (action.includes('ERROR') || action.includes('FAIL')) return 'text-red-600 bg-red-50 border-red-200'
  if (action === 'LOGIN') return 'text-blue-600 bg-blue-50 border-blue-200'
  if (action === 'QUERY') return 'text-purple-600 bg-purple-50 border-purple-200'
  return 'text-gray-600 bg-gray-50 border-gray-200'
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.1 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 200, damping: 25 } },
}

export default function ActivityFeedPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [bursts, setBursts] = useState<BurstAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState({ actor_type: '', action: '', resource_type: '' })
  const [cursorHistory, setCursorHistory] = useState<string[]>([])

  const load = useCallback(async (cursorVal?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', '30')
      if (filters.actor_type) params.set('actor_type', filters.actor_type)
      if (filters.action) params.set('action', filters.action)
      if (filters.resource_type) params.set('resource_type', filters.resource_type)
      if (cursorVal) params.set('cursor', cursorVal)

      const res = await fetch(`${API_URL}/v1/admin/activity?${params}`, adminGetOptions())
      const json = await res.json()
      setLogs(json.data.logs)
      setBursts(json.data.bursts ?? [])
      setHasMore(json.pagination.has_more)
      setCursor(json.pagination.cursor)
      setTotal(json.pagination.total ?? 0)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { load() }, [load])

  const handleNext = () => {
    if (cursor) {
      setCursorHistory((prev) => [...prev, cursor])
      load(cursor)
    }
  }

  const handlePrev = () => {
    const prev = cursorHistory[cursorHistory.length - 1]
    if (prev) {
      setCursorHistory((prevHistory) => prevHistory.slice(0, -1))
      load(prev)
    }
  }

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault()
    setCursorHistory([])
    load()
  }

  const formatAction = (action: string) => action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl shadow-lg shadow-cyan-500/20">
          <Activity size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Activity Feed</h1>
          <p className="text-sm text-gray-500">Platform-wide audit trail with burst detection</p>
        </div>
      </div>

      {/* Burst alerts */}
      {bursts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="bg-red-50/80 backdrop-blur border border-red-200 rounded-2xl p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-red-500" />
            <span className="text-sm font-semibold text-red-700">Burst Detected</span>
            <span className="text-xs text-red-500">(&gt;20/hr threshold)</span>
          </div>
          <div className="space-y-1.5">
            {bursts.map((b, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-md text-xs font-medium">
                  {b.count}x
                </span>
                <span className="font-medium text-red-800">{formatAction(b.action)}</span>
                <span className="text-red-600">on {b.resource_type}</span>
                <span className="text-red-500 text-xs">by {b.actor_type || 'unknown'}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <form onSubmit={applyFilters} className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] group">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-cyan-500 transition-colors" />
          <input
            value={filters.action}
            onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
            placeholder="Filter by action (e.g. CREATE, DELETE)..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          />
        </div>
        <select
          value={filters.resource_type}
          onChange={(e) => setFilters((f) => ({ ...f, resource_type: e.target.value }))}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
        >
          <option value="">All Resources</option>
          <option value="Retailer">Retailer</option>
          <option value="Customer">Customer</option>
          <option value="Product">Product</option>
          <option value="Collection">Collection</option>
          <option value="Order">Order</option>
          <option value="PlanLimit">Plan Limit</option>
          <option value="PlanFeature">Plan Feature</option>
          <option value="DatabaseQuery">Database Query</option>
          <option value="BackgroundImage">Background Image</option>
          <option value="IntegrationSetting">Integration</option>
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

      {/* Activity list */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
        {loading ? (
          <div className="space-y-1 p-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3 px-3">
                <div className="w-8 h-8 bg-gray-200/60 rounded-xl animate-pulse" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 bg-gray-200/60 rounded w-3/4 animate-pulse" />
                  <div className="h-3 bg-gray-200/60 rounded w-1/2 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16">
            <Activity size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">No activity found</p>
            <p className="text-xs text-gray-400 mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <motion.div variants={containerVariants} initial="hidden" animate="visible">
            {logs.map((log) => {
              const Icon = ACTION_ICONS[log.action] ?? Activity
              return (
                <motion.div
                  key={log.id}
                  variants={itemVariants}
                  className="flex items-start gap-3 px-5 py-4 border-b border-gray-50 hover:bg-gray-50/40 transition-colors"
                >
                  <div className={`p-2 rounded-xl border ${actionColor(log.action)}`}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-md border ${actionColor(log.action)}`}>
                        {formatAction(log.action)}
                      </span>
                      <span className="text-xs text-gray-400 font-medium">{log.resource_type}</span>
                      {log.resource_id && (
                        <span className="text-xs text-gray-300 font-mono truncate max-w-[120px]">
                          #{log.resource_id.slice(0, 8)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {log.actor_id ? `by ${log.actor_id.slice(0, 8)}` : 'by system'}
                      {log.actor_type ? ` (${log.actor_type})` : ''}
                    </p>
                    {log.metadata && (
                      <details className="mt-1">
                        <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">Metadata</summary>
                        <pre className="mt-1 text-[10px] text-gray-500 bg-gray-50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-gray-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short',
                      })}
                    </div>
                    <div className="text-[10px] text-gray-300">
                      {new Date(log.created_at).toLocaleTimeString('en-IN', {
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                    {log.ip_address && (
                      <div className="text-[10px] text-gray-300 font-mono">{log.ip_address}</div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        )}

        {/* Pagination */}
        {!loading && logs.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/80">
            <span className="text-xs text-gray-400">{total} total entries</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrev}
                disabled={cursorHistory.length === 0}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white/80 disabled:opacity-30 transition-all"
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-gray-400 font-mono">Page {cursorHistory.length + 1}</span>
              <button
                onClick={handleNext}
                disabled={!hasMore}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white/80 disabled:opacity-30 transition-all"
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
