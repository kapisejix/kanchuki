'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Activity,
  Store,
  Shield,
  User,
  Settings,
  CreditCard,
  Cpu,
  ChevronLeft,
  ChevronRight,
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

const ACTION_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  CREATE: User,
  UPDATE: Settings,
  DELETE: Store,
  BULK_DELETE: Store,
  EXTEND_TRIAL: CreditCard,
  CHANGE_PLAN: CreditCard,
  LOGIN: Shield,
  QUERY: Cpu,
}

function actionColor(action: string): string {
  if (action.includes('DELETE') || action.includes('BULK')) return 'text-red-600 bg-red-50 border-red-200'
  if (action.includes('CREATE')) return 'text-green-600 bg-green-50 border-green-200'
  if (action.includes('UPDATE') || action.includes('CHANGE') || action.includes('EXTEND')) return 'text-amber-600 bg-amber-50 border-amber-200'
  if (action === 'LOGIN') return 'text-blue-600 bg-blue-50 border-blue-200'
  return 'text-gray-600 bg-gray-50 border-gray-200'
}

function formatAction(action: string) {
  return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function RetailerActivityPage() {
  const params = useParams()
  const id = params.id as string
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [retailerName, setRetailerName] = useState('')
  const [cursorHistory, setCursorHistory] = useState<string[]>([])

  useEffect(() => {
    async function load() {
      try {
        // Load retailer name
        const retailerRes = await fetch(`${API_URL}/v1/admin/retailers/${id}`, adminGetOptions())
        if (retailerRes.ok) {
          const retailerJson = await retailerRes.json()
          setRetailerName(retailerJson.data.shop_name)
        }

        // Load activity
        const res = await fetch(`${API_URL}/v1/admin/retailers/${id}/activity?limit=30`, adminGetOptions())
        const json = await res.json()
        setLogs(json.data)
        setHasMore(json.pagination.has_more)
        setCursor(json.pagination.cursor)
        setTotal(json.pagination.total ?? 0)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const loadMore = async (cursorVal?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', '30')
      if (cursorVal) params.set('cursor', cursorVal)
      const res = await fetch(`${API_URL}/v1/admin/retailers/${id}/activity?${params}`, adminGetOptions())
      const json = await res.json()
      setLogs(json.data)
      setHasMore(json.pagination.has_more)
      setCursor(json.pagination.cursor)
    } finally {
      setLoading(false)
    }
  }

  const handleNext = () => {
    if (cursor) {
      setCursorHistory((prev) => [...prev, cursor])
      loadMore(cursor)
    }
  }

  const handlePrev = () => {
    const prev = cursorHistory[cursorHistory.length - 1]
    if (prev) {
      setCursorHistory((prevHistory) => prevHistory.slice(0, -1))
      loadMore(prev)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 max-w-4xl"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/admin/retailers/${id}`}
          className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="p-2.5 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl shadow-lg shadow-amber-500/20">
          <Activity size={20} className="text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">Activity Timeline</h1>
            <span className="text-xs text-gray-400 font-mono">#{total} entries</span>
          </div>
          <Link href={`/admin/retailers/${id}`} className="text-sm text-cyan-600 hover:text-cyan-700 font-medium">
            {retailerName || 'Retailer'} →
          </Link>
        </div>
      </div>

      {/* Activity list */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
        {loading && logs.length === 0 ? (
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
            <p className="text-sm font-medium text-gray-500">No activity logged yet</p>
            <p className="text-xs text-gray-400 mt-1">Activities will appear here as the retailer uses the platform</p>
          </div>
        ) : (
          <div>
            {logs.map((log, i) => {
              const Icon = ACTION_ICONS[log.action] ?? Activity
              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-start gap-3 px-5 py-4 border-b border-gray-50 hover:bg-gray-50/40 transition-colors"
                >
                  {/* Timeline dot */}
                  <div className="flex flex-col items-center gap-0.5">
                    <div className={`p-1.5 rounded-lg border ${actionColor(log.action)}`}>
                      <Icon size={12} />
                    </div>
                    {i < logs.length - 1 && <div className="w-px h-full bg-gray-100 min-h-[24px]" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md border ${actionColor(log.action)}`}>
                        {formatAction(log.action)}
                      </span>
                      <span className="text-xs text-gray-400">{log.resource_type}</span>
                      {log.resource_id && (
                        <span className="text-[10px] text-gray-300 font-mono">#{log.resource_id.slice(0, 8)}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {log.actor_id ? `by ${log.actor_id.slice(0, 8)}` : 'by system'}
                      {log.actor_type ? ` (${log.actor_type})` : ''}
                      {log.ip_address && <span className="ml-2 text-gray-300">· {log.ip_address}</span>}
                    </p>
                    {log.metadata && (
                      <details className="mt-1">
                        <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">Details</summary>
                        <pre className="mt-1 text-[10px] text-gray-500 bg-gray-50 rounded-lg p-2 overflow-x-auto">
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
                  </div>
                </motion.div>
              )
            })}
          </div>
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
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-gray-400 font-mono">Page {cursorHistory.length + 1}</span>
              <button
                onClick={handleNext}
                disabled={!hasMore}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white/80 disabled:opacity-30 transition-all"
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
