'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Database,
  Search,
  Shield,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Clock,
  Trash2,
  HardDrive,
  Archive,
  Filter,
  X,
} from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

// ─── Types ─────────────────────────────────────────────────────

type VaultEntry = {
  id: string
  source_table: string
  source_id: string
  retailer_id: string | null
  payload: Record<string, unknown>
  delete_reason: string | null
  deleted_by: string | null
  deleted_at: string
}

type VaultResponse = {
  data: {
    entries: VaultEntry[]
    total_count: number
    vault_configured: boolean
  }
  pagination?: {
    cursor: string | null
    has_more: boolean
  }
}

// ─── Helpers ───────────────────────────────────────────────────

function getAdminHeaders() {
  const key = sessionStorage.getItem('admin_key')
  return { 'x-admin-key': key ?? '', 'Content-Type': 'application/json' }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  if (diffHours < 1) {
    const mins = Math.round(diffMs / (1000 * 60))
    return `${mins}m ago`
  }
  if (diffHours < 24) {
    return `${Math.round(diffHours)}h ago`
  }
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

const SOURCE_TABLES = [
  { value: '', label: 'All tables' },
  { value: 'products', label: 'Products' },
  { value: 'customers', label: 'Customers' },
  { value: 'collections', label: 'Collections' },
  { value: 'retailers', label: 'Retailers' },
]

// ─── Animations ────────────────────────────────────────────────

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

// ─── Payload Preview ───────────────────────────────────────────

const TABLE_PREVIEW_KEYS: Record<string, string[]> = {
  products: ['name', 'category', 'primary_color', 'status', 'price_min', 'price_max'],
  customers: ['name', 'phone', 'city', 'gender'],
  collections: ['title', 'slug', 'status'],
  retailers: ['shop_name', 'owner_name', 'city', 'phone', 'plan', 'plan_status'],
}

function getPayloadPreview(entry: VaultEntry): Record<string, unknown> {
  const keys = TABLE_PREVIEW_KEYS[entry.source_table] ?? ['id']
  const preview: Record<string, unknown> = {}
  for (const key of keys) {
    if (key in entry.payload) {
      preview[key] = entry.payload[key]
    }
  }
  return preview
}

// ─── Table Badge Component ────────────────────────────────────

const TABLE_COLORS: Record<string, string> = {
  products: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  customers: 'bg-blue-50 text-blue-600 border-blue-200',
  collections: 'bg-purple-50 text-purple-600 border-purple-200',
  retailers: 'bg-amber-50 text-amber-600 border-amber-200',
}

function TableBadge({ table }: { table: string }) {
  const colorClass = TABLE_COLORS[table] ?? 'bg-gray-50 text-gray-600 border-gray-200'
  return (
    <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${colorClass}`}>
      {table}
    </span>
  )
}

// ─── Main Page ─────────────────────────────────────────────────

export default function DeletionVaultPage() {
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [vaultConfigured, setVaultConfigured] = useState(true)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  // Search / filter state
  const [sourceTable, setSourceTable] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [retailerId, setRetailerId] = useState('')

  // Pagination
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // Expanded payload rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // ── Fetch ────────────────────────────────────────────────────
  const fetchEntries = useCallback(
    async (isRefresh = false, append = false) => {
      if (append) setLoadingMore(true)
      else if (isRefresh) setRefreshing(true)
      else setLoading(true)
      setError('')

      try {
        const params = new URLSearchParams()
        if (append && cursor) params.set('cursor', cursor)
        if (sourceTable) params.set('source_table', sourceTable)
        if (sourceId) params.set('source_id', sourceId)
        if (retailerId) params.set('retailer_id', retailerId)

        const res = await fetch(`${API_URL}/v1/admin/deletion-vault?${params.toString()}`, {
          headers: getAdminHeaders(),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)

        const json = (await res.json()) as VaultResponse
        const newEntries = json.data.entries

        if (append) {
          setEntries((prev) => [...prev, ...newEntries])
        } else {
          setEntries(newEntries)
        }
        setTotalCount(json.data.total_count)
        setVaultConfigured(json.data.vault_configured)
        setHasMore(json.pagination?.has_more ?? false)
        setCursor(json.pagination?.cursor ?? null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load vault entries')
      } finally {
        setLoading(false)
        setRefreshing(false)
        setLoadingMore(false)
      }
    },
    [cursor, sourceTable, sourceId, retailerId],
  )

  useEffect(() => {
    setCursor(null)
  }, [sourceTable, sourceId, retailerId])

  useEffect(() => {
    fetchEntries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceTable, sourceId, retailerId])

  // ── Reset filters ────────────────────────────────────────────
  const resetFilters = () => {
    setSourceTable('')
    setSourceId('')
    setRetailerId('')
  }

  const hasFilters = sourceTable || sourceId || retailerId

  // ── Toggle payload expansion ─────────────────────────────────
  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* ── Page Header ────────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-500/20">
              <Archive size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Deletion Vault</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                F-016 — View-only snapshots of every soft-deleted record
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              onClick={() => fetchEntries(true)}
              disabled={refreshing}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* ── Filters ──────────────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={13} className="text-gray-400" />
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Filters</span>
            {totalCount > 0 && (
              <span className="text-[10px] text-gray-400 font-normal">
                ({totalCount.toLocaleString('en-IN')} total entries)
              </span>
            )}
            {hasFilters && (
              <motion.button
                onClick={resetFilters}
                whileHover={{ scale: 1.05 }}
                className="ml-auto flex items-center gap-1 text-[10px] text-red-500 hover:text-red-600"
              >
                <X size={11} />
                Clear filters
              </motion.button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Source table filter */}
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Source Table</label>
              <select
                value={sourceTable}
                onChange={(e) => setSourceTable(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-300"
              >
                {SOURCE_TABLES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Source ID search */}
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Source ID</label>
              <div className="relative">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  placeholder="Search by record ID..."
                  className="w-full text-xs pl-8 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-300"
                />
              </div>
            </div>

            {/* Retailer ID search */}
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Retailer ID</label>
              <div className="relative">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={retailerId}
                  onChange={(e) => setRetailerId(e.target.value)}
                  placeholder="Filter by retailer..."
                  className="w-full text-xs pl-8 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-300"
                />
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Vault Not Configured Warning ────────────────────────── */}
      {!loading && !vaultConfigured && (
        <motion.div variants={itemVariants}>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
            <HardDrive size={40} className="mx-auto text-amber-300 mb-3" />
            <h2 className="text-sm font-semibold text-amber-800 mb-1">Vault Database Not Configured</h2>
            <p className="text-xs text-amber-600 max-w-md mx-auto">
              The Deletion Vault requires a separate Postgres instance configured via{' '}
              <code className="font-mono text-amber-700">VAULT_DATABASE_URL</code>.
              Once set up, run <code className="font-mono text-amber-700">pnpm db:generate:vault</code> to generate the vault client.
            </p>
          </div>
        </motion.div>
      )}

      {/* ── Error ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading State ───────────────────────────────────────── */}
      {loading && vaultConfigured && (
        <motion.div variants={itemVariants} className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white/80 rounded-xl border border-gray-200/80 p-5">
              <div className="h-4 bg-gray-200/80 rounded w-3/4 mb-3 animate-pulse" />
              <div className="h-3 bg-gray-200/80 rounded w-1/2 animate-pulse" />
            </div>
          ))}
        </motion.div>
      )}

      {/* ── Empty State ─────────────────────────────────────────── */}
      {!loading && entries.length === 0 && vaultConfigured && !error && (
        <motion.div variants={itemVariants} className="text-center py-16">
          <Archive size={48} className="mx-auto text-gray-200 mb-4" />
          <p className="text-sm text-gray-500">No vault entries found</p>
          <p className="text-xs text-gray-400 mt-1">
            {hasFilters
              ? 'Try adjusting your filters to see more results.'
              : 'Soft-deleted records will appear here once the vault DB is configured and records are deleted.'}
          </p>
        </motion.div>
      )}

      {/* ── Vault Entries Table ─────────────────────────────────── */}
      {!loading && entries.length > 0 && vaultConfigured && (
        <motion.div variants={itemVariants} className="space-y-4">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden shadow-lg">
            {/* Table header */}
            <div className="flex items-center gap-4 px-5 py-3 bg-gray-50/80 border-b border-gray-200/80 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              <div className="w-24 shrink-0">Table</div>
              <div className="flex-1 min-w-0">Record</div>
              <div className="w-28 text-right shrink-0 hidden sm:block">Deleted By</div>
              <div className="w-24 text-right shrink-0 hidden sm:block">Reason</div>
              <div className="w-28 text-right shrink-0 hidden md:block">When</div>
              <div className="w-10 shrink-0" />
            </div>

            {/* Table body */}
            {entries.map((entry) => (
              <div key={entry.id}>
                <div
                  className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-100/60 hover:bg-gray-50/50 transition-colors cursor-pointer last:border-b-0"
                  onClick={() => toggleRow(entry.id)}
                >
                  <div className="w-24 shrink-0">
                    <TableBadge table={entry.source_table} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-700 truncate">
                        {entry.source_id}
                      </span>
                    </div>
                    {entry.retailer_id && (
                      <div className="text-[10px] text-gray-400 font-mono truncate mt-0.5">
                        retailer: {entry.retailer_id}
                      </div>
                    )}
                  </div>
                  <div className="w-28 text-right shrink-0 hidden sm:block">
                    <span className="text-xs text-gray-500">{entry.deleted_by ?? '—'}</span>
                  </div>
                  <div className="w-24 text-right shrink-0 hidden sm:block">
                    <span className="text-xs text-gray-400">{entry.delete_reason ?? '—'}</span>
                  </div>
                  <div className="w-28 text-right shrink-0 hidden md:block">
                    <span className="text-xs text-gray-400" title={formatDate(entry.deleted_at)}>
                      {formatDateShort(entry.deleted_at)}
                    </span>
                  </div>
                  <div className="w-10 shrink-0 text-right">
                    <button className="p-1 text-gray-300 hover:text-gray-500 transition-colors">
                      {expandedRows.has(entry.id) ? (
                        <ChevronUp size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded payload */}
                {expandedRows.has(entry.id) && (
                  <div className="bg-gray-50/80 border-b border-gray-100/60 px-5 py-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                      <div>
                        <span className="text-gray-400 block mb-0.5">Entry ID</span>
                        <code className="text-gray-700 font-mono text-[10px] break-all">{entry.id}</code>
                      </div>
                      <div>
                        <span className="text-gray-400 block mb-0.5">Source Table</span>
                        <span className="text-gray-700">{entry.source_table}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block mb-0.5">Source ID</span>
                        <code className="text-gray-700 font-mono text-[10px] break-all">{entry.source_id}</code>
                      </div>
                      <div>
                        <span className="text-gray-400 block mb-0.5">Deleted At</span>
                        <span className="text-gray-700">{formatDate(entry.deleted_at)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block mb-0.5">Deleted By</span>
                        <span className="text-gray-700">{entry.deleted_by ?? '—'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block mb-0.5">Delete Reason</span>
                        <span className="text-gray-700">{entry.delete_reason ?? '—'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block mb-0.5">Retailer ID</span>
                        <code className="text-gray-700 font-mono text-[10px] break-all">
                          {entry.retailer_id ?? '—'}
                        </code>
                      </div>
                    </div>

                    {/* Payload preview */}
                    <div className="mt-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Database size={12} className="text-gray-400" />
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                          Snapshot Preview
                        </span>
                      </div>
                      <div className="bg-white rounded-lg border border-gray-200 p-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                          {Object.entries(getPayloadPreview(entry)).map(([key, value]) => (
                            <div key={key} className="text-[11px]">
                              <span className="text-gray-400 block">{key}</span>
                              <span className="text-gray-700 font-medium">
                                {value === null || value === undefined
                                  ? '—'
                                  : typeof value === 'object'
                                    ? JSON.stringify(value).slice(0, 40)
                                    : String(value).slice(0, 40)}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Full payload JSON — collapsible */}
                        <details className="mt-3">
                          <summary className="text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer select-none">
                            Show full payload JSON
                          </summary>
                          <pre className="mt-2 bg-gray-50 rounded-lg border border-gray-200 p-3 text-[10px] text-gray-600 font-mono overflow-x-auto max-h-60 whitespace-pre-wrap">
                            {JSON.stringify(entry.payload, null, 2)}
                          </pre>
                        </details>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-[10px] text-gray-400 px-1">
            <span>
              Showing {entries.length} of {totalCount.toLocaleString('en-IN')} entries
            </span>
            {hasMore && (
              <motion.button
                onClick={() => fetchEntries(false, true)}
                disabled={loadingMore}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-all disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <ChevronDown size={11} />
                )}
                Load more
              </motion.button>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Footer Note ─────────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="text-center">
        <p className="text-[10px] text-gray-400 flex items-center justify-center gap-1">
          <Shield size={10} />
          The vault DB has INSERT-only credentials — entries cannot be modified or deleted by the application (F-016)
        </p>
      </motion.div>
    </motion.div>
  )
}
