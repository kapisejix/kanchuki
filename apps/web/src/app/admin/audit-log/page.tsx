'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  History,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  Calendar,
  User,
  Monitor,
  FileText,
  Clock,
  ArrowLeft,
  ArrowRight,
  Loader2,
  AlertCircle,
} from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type AuditLogEntry = {
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

type Pagination = {
  cursor: string | null
  has_more: boolean
}

function getAdminHeaders() {
  const key = sessionStorage.getItem('admin_key')
  return { 'x-admin-key': key ?? '' }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateShort(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Color-code actions for visual scanning */
function actionColor(action: string): string {
  const lower = action.toLowerCase()
  if (lower.includes('delete') || lower.includes('cancel')) return 'text-red-600 bg-red-50 border-red-200'
  if (lower.includes('create') || lower.includes('connect')) return 'text-green-600 bg-green-50 border-green-200'
  if (lower.includes('update') || lower.includes('change') || lower.includes('extend')) return 'text-amber-600 bg-amber-50 border-amber-200'
  if (lower.includes('login') || lower.includes('logout')) return 'text-blue-600 bg-blue-50 border-blue-200'
  return 'text-gray-600 bg-gray-50 border-gray-200'
}

function actionBg(action: string): string {
  const lower = action.toLowerCase()
  if (lower.includes('delete') || lower.includes('cancel')) return 'bg-red-500'
  if (lower.includes('create') || lower.includes('connect')) return 'bg-green-500'
  if (lower.includes('update') || lower.includes('change') || lower.includes('extend')) return 'bg-amber-500'
  if (lower.includes('login') || lower.includes('logout')) return 'bg-blue-500'
  return 'bg-gray-500'
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 200, damping: 20 },
  },
}

// ─── Filter Bar ──────────────────────────────────────────────

function FilterBar({
  filters,
  onChange,
  onSearch,
  onClear,
  loading,
}: {
  filters: Record<string, string>
  onChange: (key: string, value: string) => void
  onSearch: () => void
  onClear: () => void
  loading: boolean
}) {
  return (
    <motion.div variants={itemVariants} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Filter size={15} className="text-gray-400" />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Filters</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <input
          placeholder="Action (contains)"
          value={filters.action ?? ''}
          onChange={(e) => onChange('action', e.target.value)}
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all"
        />
        <input
          placeholder="Actor type"
          value={filters.actor_type ?? ''}
          onChange={(e) => onChange('actor_type', e.target.value)}
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all"
        />
        <input
          placeholder="Resource type"
          value={filters.resource_type ?? ''}
          onChange={(e) => onChange('resource_type', e.target.value)}
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all"
        />
        <input
          placeholder="IP address"
          value={filters.ip_address ?? ''}
          onChange={(e) => onChange('ip_address', e.target.value)}
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all"
        />
        <input
          type="date"
          value={filters.date_from ?? ''}
          onChange={(e) => onChange('date_from', e.target.value)}
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all"
          title="From date"
        />
        <input
          type="date"
          value={filters.date_to ?? ''}
          onChange={(e) => onChange('date_to', e.target.value)}
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all"
          title="To date"
        />
      </div>
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-2">
          <motion.button
            onClick={onSearch}
            disabled={loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all disabled:opacity-60"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {loading ? 'Searching...' : 'Search'}
          </motion.button>
          <span className="text-[10px] text-gray-400 ml-2">Results limited to 200 entries</span>
        </div>
        <motion.button
          onClick={onClear}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Clear filters
        </motion.button>
      </div>
    </motion.div>
  )
}

// ─── Audit Log Row ───────────────────────────────────────────

function AuditLogRow({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <motion.div
      variants={itemVariants}
      className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/80 overflow-hidden transition-all hover:shadow-sm"
    >
      {/* Main row (always visible) */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 sm:gap-4 px-4 py-3.5 text-left hover:bg-gray-50/50 transition-colors"
      >
        {/* Timeline dot */}
        <div className={`w-2 h-2 rounded-full shrink-0 ${actionBg(entry.action)}`} />

        {/* Action badge */}
        <span className={`text-[10px] font-semibold px-2 py-1 rounded-md border whitespace-nowrap shrink-0 ${actionColor(entry.action)}`}>
          {entry.action.slice(0, 20)}
        </span>

        {/* Resource */}
        <div className="flex-1 min-w-0">
          <span className="text-xs text-gray-700 font-medium truncate block">
            {entry.resource_type}
            {entry.resource_id ? ` · ${entry.resource_id.slice(0, 12)}...` : ''}
          </span>
        </div>

        {/* Actor */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400 shrink-0">
          <User size={12} />
          <span>{entry.actor_type ?? 'system'}</span>
        </div>

        {/* IP */}
        <div className="hidden md:flex items-center gap-1.5 text-xs text-gray-400 shrink-0">
          <Monitor size={12} />
          <span>{entry.ip_address ?? '—'}</span>
        </div>

        {/* Time */}
        <div className="hidden lg:flex items-center gap-1.5 text-xs text-gray-400 shrink-0">
          <Clock size={12} />
          <span>{formatDateShort(entry.created_at)}</span>
        </div>

        {/* Expand */}
        <div className="text-gray-300 shrink-0">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Expanded metadata */}
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="border-t border-gray-100 bg-gray-50/50 px-4 py-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-gray-400 block mb-0.5">Entry ID</span>
              <span className="text-gray-700 font-mono">{entry.id}</span>
            </div>
            <div>
              <span className="text-gray-400 block mb-0.5">Timestamp</span>
              <span className="text-gray-700">{formatDate(entry.created_at)}</span>
            </div>
            {entry.actor_id && (
              <div>
                <span className="text-gray-400 block mb-0.5">Actor ID</span>
                <span className="text-gray-700 font-mono">{entry.actor_id}</span>
              </div>
            )}
            {entry.resource_id && (
              <div>
                <span className="text-gray-400 block mb-0.5">Resource ID</span>
                <span className="text-gray-700 font-mono">{entry.resource_id}</span>
              </div>
            )}
            {entry.ip_address && (
              <div>
                <span className="text-gray-400 block mb-0.5">IP Address</span>
                <span className="text-gray-700">{entry.ip_address}</span>
              </div>
            )}
            {entry.metadata && (
              <div className="sm:col-span-2 lg:col-span-3">
                <span className="text-gray-400 block mb-1">Metadata</span>
                <pre className="bg-white rounded-lg border border-gray-200 p-3 text-[11px] text-gray-600 font-mono overflow-x-auto max-h-40 whitespace-pre-wrap">
                  {JSON.stringify(entry.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}

// ─── Main Page ───────────────────────────────────────────────

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Filter inputs are local state (no side effects)
  const [filterInputs, setFilterInputs] = useState<Record<string, string>>({
    action: '',
    actor_type: '',
    resource_type: '',
    ip_address: '',
    date_from: '',
    date_to: '',
  })
  // Committed filters are only set when Search is clicked
  const [committedFilters, setCommittedFilters] = useState<Record<string, string>>({})
  const [cursorStack, setCursorStack] = useState<string[]>([])
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(undefined)

  const fetchLogs = useCallback(async (cursor?: string, appendStack?: boolean) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('limit', '50')
      if (cursor) params.set('cursor', cursor)
      // Use committedFilters — only set when Search is clicked
      for (const [key, val] of Object.entries(committedFilters)) {
        if (val) params.set(key, val)
      }

      const res = await fetch(`${API_URL}/v1/admin/audit-logs?${params.toString()}`, {
        headers: getAdminHeaders(),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)

      const json = await res.json()
      setLogs(json.data)
      setPagination(json.pagination)
      setCurrentCursor(cursor)

      if (appendStack && cursor) {
        setCursorStack((prev) => [...prev, cursor])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }, [committedFilters])

  // Load on mount — runs once because committedFilters is stable
  useEffect(() => {
    fetchLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = () => {
    // Commit the current filter inputs to trigger API call
    setCommittedFilters({ ...filterInputs })
    setCursorStack([])
    setCurrentCursor(undefined)
  }

  const handleClear = () => {
    setFilterInputs({ action: '', actor_type: '', resource_type: '', ip_address: '', date_from: '', date_to: '' })
    setCommittedFilters({})
    setCursorStack([])
    setCurrentCursor(undefined)
    fetchLogs(undefined)
  }

  // When committed filters change (after Search click), fetch with new filters
  useEffect(() => {
    if (Object.keys(committedFilters).length > 0 || logs.length > 0) {
      fetchLogs()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedFilters])

  const handleNext = () => {
    if (pagination?.cursor) {
      setCursorStack((prev) => currentCursor ? [...prev, currentCursor] : prev)
      fetchLogs(pagination.cursor!, true)
    }
  }

  const handlePrev = () => {
    const prev = cursorStack[cursorStack.length - 1]
    if (prev) {
      setCursorStack((prev) => prev.slice(0, -1))
      fetchLogs(prev)
    }
  }

  const exportToCsv = () => {
    const headers = ['ID', 'Timestamp', 'Action', 'Actor Type', 'Actor ID', 'Resource Type', 'Resource ID', 'IP Address', 'Metadata']
    const rows = logs.map((entry) => [
      entry.id,
      entry.created_at,
      entry.action,
      entry.actor_type ?? '',
      entry.actor_id ?? '',
      entry.resource_type,
      entry.resource_id ?? '',
      entry.ip_address ?? '',
      entry.metadata ? JSON.stringify(entry.metadata).replace(/"/g, '""') : '',
    ])

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Page header */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <History size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Audit Log</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                SECURITY §18 — All admin actions recorded with before/after state
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              onClick={() => fetchLogs(currentCursor)}
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </motion.button>
            <motion.button
              onClick={exportToCsv}
              disabled={logs.length === 0}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-40"
            >
              <Download size={13} />
              CSV
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <FilterBar
        filters={filterInputs}
        onChange={(key, value) => setFilterInputs((prev) => ({ ...prev, [key]: value }))}
        onSearch={handleSearch}
        onClear={handleClear}
        loading={loading}
      />

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3"
        >
          <AlertCircle size={15} />
          <span>{error}</span>
        </motion.div>
      )}

      {/* Loading skeleton */}
      {loading && logs.length === 0 && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white/80 rounded-xl border border-gray-200/80 p-4"
            >
              <div className="h-4 bg-gray-200/80 rounded w-3/4 mb-2 animate-pulse" />
              <div className="h-3 bg-gray-200/80 rounded w-1/2 animate-pulse" />
            </motion.div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && logs.length === 0 && !error && (
        <motion.div variants={itemVariants} className="text-center py-16">
          <History size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">No audit log entries found</p>
          <p className="text-xs text-gray-400 mt-1">Try adjusting your filters or creating an admin action</p>
        </motion.div>
      )}

      {/* Log entries */}
      {logs.length > 0 && (
        <motion.div variants={containerVariants} className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-gray-400">
              Showing {logs.length} entries
              {pagination?.has_more ? '+' : ''}
            </span>
          </div>
          {logs.map((entry) => (
            <AuditLogRow key={entry.id} entry={entry} />
          ))}
        </motion.div>
      )}

      {/* Pagination */}
      {(cursorStack.length > 0 || pagination?.has_more) && (
        <motion.div variants={itemVariants} className="flex items-center justify-center gap-3">
          <motion.button
            onClick={handlePrev}
            disabled={cursorStack.length === 0 || loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-40"
          >
            <ArrowLeft size={14} />
            Previous
          </motion.button>
          <motion.button
            onClick={handleNext}
            disabled={!pagination?.has_more || loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-40"
          >
            Next
            <ArrowRight size={14} />
          </motion.button>
        </motion.div>
      )}

      {/* Retention notice */}
      <motion.div variants={itemVariants} className="text-center">
        <p className="text-[10px] text-gray-400">
          Audit logs retained for 3 years per compliance requirements (SECURITY §18)
        </p>
      </motion.div>
    </motion.div>
  )
}
