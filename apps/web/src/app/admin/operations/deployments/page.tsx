'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  GitBranch,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  RotateCcw,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type Deployment = {
  id: string
  action: string
  service: string
  commit_hash: string | null
  commit_message: string | null
  author: string | null
  status: string
  duration_seconds: number | null
  ip_address: string | null
  created_at: string
}

function getHeaders() {
  return { 'x-admin-key': sessionStorage.getItem('admin_key') ?? '' }
}

const STATUS_COLORS: Record<string, string> = {
  success: 'text-green-600 bg-green-50 border-green-200',
  failed: 'text-red-600 bg-red-50 border-red-200',
  running: 'text-blue-600 bg-blue-50 border-blue-200',
  pending: 'text-amber-600 bg-amber-50 border-amber-200',
  rolled_back: 'text-purple-600 bg-purple-50 border-purple-200',
}

const STATUS_ICONS: Record<string, LucideIcon> = {
  success: CheckCircle2,
  failed: XCircle,
  running: Loader2,
  pending: Clock,
  rolled_back: RotateCcw,
}

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('')

  const loadDeployments = useCallback(async (reset = false) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (!reset && cursor) params.set('cursor', cursor)
      if (filter) params.set('status', filter)
      params.set('limit', '50')

      const res = await fetch(`${API_URL}/v1/admin/deployments?${params}`, {
        headers: getHeaders(),
      })
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json()
      const data = json.data ?? []

      setDeployments((prev) => (reset ? data : [...prev, ...data]))
      setHasMore(json.pagination?.has_more ?? false)
      setCursor(json.pagination?.cursor ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [cursor, filter])

  useEffect(() => { loadDeployments(true) }, [filter])

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <GitBranch size={24} className="text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">Deployment Log</h1>
          </div>
          <p className="text-sm text-gray-500">History of platform deployments</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          >
            <option value="">All statuses</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
            <option value="pending">Pending</option>
            <option value="rolled_back">Rolled Back</option>
          </select>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => loadDeployments(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 hover:text-gray-800 hover:border-gray-300 transition-all"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </motion.button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl px-4 py-3">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-2">
        {deployments.map((d) => {
          const StatusIcon = STATUS_ICONS[d.status] ?? AlertCircle
          const statusColor = STATUS_COLORS[d.status] ?? 'text-gray-600 bg-gray-50 border-gray-200'

          return (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusColor}`}>
                      <StatusIcon size={10} className={d.status === 'running' ? 'animate-spin' : ''} />
                      {d.status}
                    </span>
                    <span className="text-xs font-medium text-gray-700">{d.service}</span>
                    {d.commit_hash && (
                      <span className="text-[10px] text-gray-400 font-mono">
                        {d.commit_hash.slice(0, 8)}
                      </span>
                    )}
                  </div>
                  {d.commit_message && (
                    <p className="text-sm text-gray-600 truncate">{d.commit_message}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                    <span>{d.author ?? 'Unknown'}</span>
                    <span>{new Date(d.created_at).toLocaleString('en-IN')}</span>
                    {d.duration_seconds != null && (
                      <span>{d.duration_seconds.toFixed(1)}s</span>
                    )}
                  </div>
                </div>
                {d.status === 'failed' && (
                  <button className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1 shrink-0">
                    <RotateCcw size={12} />
                    Rollback
                  </button>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>

      {hasMore && (
        <div className="text-center">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => loadDeployments(false)}
            disabled={loading}
            className="px-6 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 hover:border-gray-300 transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin inline mr-2" /> : null}
            Load more
          </motion.button>
        </div>
      )}

      {!loading && deployments.length === 0 && !error && (
        <div className="text-center py-16">
          <GitBranch size={40} className="text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900">No deployments yet</h3>
          <p className="text-sm text-gray-500">Deployment history will appear here after CI/CD runs</p>
        </div>
      )}
    </motion.div>
  )
}
