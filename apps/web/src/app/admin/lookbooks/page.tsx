'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen,
  Eye,
  Share2,
  BarChart3,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

// ─── Types ─────────────────────────────────────────────────────────

type Retailer = { id: string; shop_name: string; city: string }

type Lookbook = {
  id: string
  retailer_id: string
  name: string
  description: string | null
  cover_url: string | null
  format: 'CAROUSEL' | 'GRID' | 'EDITORIAL' | 'PDF'
  status: 'DRAFT' | 'GENERATING' | 'READY' | 'FAILED'
  product_ids: string[]
  output_url: string | null
  thumbnail_url: string | null
  share_url: string | null
  view_count: number
  share_count: number
  created_at: string
  updated_at: string
  retailer: Retailer
}

type Stats = {
  total: number
  by_status: { status: string; count: number }[]
  by_format: { format: string; count: number }[]
  top_viewed: { id: string; name: string; view_count: number; share_count: number; status: string; cover_url: string | null }[]
  recent: { id: string; name: string; status: string; created_at: string; retailer: { shop_name: string } }[]
}

const STATUS_CONFIG: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  DRAFT: { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200' },
  GENERATING: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-50 border-blue-200' },
  READY: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50 border-green-200' },
  FAILED: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50 border-red-200' },
}

const FORMAT_LABELS: Record<string, string> = {
  CAROUSEL: 'Instagram Carousel',
  GRID: 'Grid Layout',
  EDITORIAL: 'Magazine',
  PDF: 'PDF Export',
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 220, damping: 24 } },
}

// ─── Stats Card ───────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: number | string; color: string }) {
  return (
    <motion.div variants={itemVariants} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </motion.div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// ─── Main Page ────────────────────────────────────────────────────

export default function LookbooksPage() {
  const [lookbooks, setLookbooks] = useState<Lookbook[] | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [detailBg, setDetailBg] = useState<Lookbook | null>(null)

  const load = async () => {
    try {
      const params = new URLSearchParams()
      if (filterStatus) params.set('status', filterStatus)

      const [lbRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/v1/admin/lookbooks?${params}`, adminGetOptions()),
        fetch(`${API_URL}/v1/admin/lookbooks/stats`, adminGetOptions()),
      ])

      if (!lbRes.ok) throw new Error(`Failed to load lookbooks (${lbRes.status})`)
      const lbJson = await lbRes.json()
      setLookbooks(lbJson.data ?? [])

      if (statsRes.ok) {
        const sJson = await statsRes.json()
        setStats(sJson.data ?? null)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => { load() }, [filterStatus])

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await fetch(
        `${API_URL}/v1/admin/lookbooks/${id}/status`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, ...adminMutateOptions(), body: JSON.stringify({ status }) }
      )
      if (!res.ok) throw new Error('Status update failed')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Status update failed')
    }
  }

  const handleDelete = async (lb: Lookbook) => {
    if (!confirm(`Delete lookbook "${lb.name}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`${API_URL}/v1/admin/lookbooks/${lb.id}`, { method: 'DELETE', ...adminMutateOptions() })
      if (!res.ok) throw new Error('Delete failed')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="text-indigo-500" size={28} />
            Lookbook Generator
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage retailer-created product lookbooks</p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {/* Stats */}
        {stats && (
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard icon={BookOpen} label="Total Lookbooks" value={stats.total} color="bg-indigo-50 text-indigo-600" />
            <StatCard icon={CheckCircle} label="Ready" value={stats.by_status.find((s) => s.status === 'READY')?.count ?? 0} color="bg-green-50 text-green-600" />
            <StatCard icon={Loader2} label="Generating" value={stats.by_status.find((s) => s.status === 'GENERATING')?.count ?? 0} color="bg-blue-50 text-blue-600" />
            <StatCard icon={Eye} label="Total Views" value={stats.top_viewed.reduce((sum, l) => sum + l.view_count, 0)} color="bg-amber-50 text-amber-600" />
          </motion.div>
        )}

        {/* Format breakdown */}
        {stats && stats.by_format.length > 0 && (
          <div className="flex gap-2 mb-6">
            {stats.by_format.map((f) => (
              <span key={f.format} className="px-3 py-1 rounded-full text-xs bg-indigo-50 text-indigo-600 border border-indigo-100">
                {FORMAT_LABELS[f.format] ?? f.format}: {f.count}
              </span>
            ))}
          </div>
        )}

        {/* Status filter */}
        <div className="flex gap-2 mb-6">
          {['', 'DRAFT', 'GENERATING', 'READY', 'FAILED'].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                filterStatus === s ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
              }`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>

        {/* Lookbooks table */}
        {!lookbooks ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : lookbooks.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <BookOpen size={48} className="mx-auto mb-3 opacity-30" />
            <p>No lookbooks yet.</p>
          </div>
        ) : (
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Lookbook</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Retailer</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Format</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Products</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Views</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Created</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lookbooks.map((lb) => {
                  const st = STATUS_CONFIG[lb.status] ?? STATUS_CONFIG.DRAFT
                  const StatusIcon = st.icon
                  return (
                    <motion.tr
                      key={lb.id}
                      variants={itemVariants}
                      className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer"
                      onClick={() => setDetailBg(lb)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {lb.cover_url ? (
                            <img src={lb.cover_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-400">
                              <BookOpen size={16} />
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-gray-900">{lb.name}</p>
                            {lb.description && <p className="text-xs text-gray-400 truncate max-w-[200px]">{lb.description}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-700">{lb.retailer.shop_name}</p>
                        <p className="text-xs text-gray-400">{lb.retailer.city}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500">{FORMAT_LABELS[lb.format] ?? lb.format}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${st.bg} ${st.color}`}>
                          <StatusIcon size={12} className={lb.status === 'GENERATING' ? 'animate-spin' : ''} />
                          {lb.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{lb.product_ids.length}</td>
                      <td className="px-4 py-3 text-gray-500">{lb.view_count.toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-400">{fmtDate(lb.created_at)}</td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {lb.status === 'READY' && (
                            <button
                              onClick={() => handleStatusChange(lb.id, 'DRAFT')}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                              title="Reset to draft"
                            >
                              <XCircle size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(lb)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </motion.div>
        )}

        {/* Top viewed */}
        {stats && stats.top_viewed.length > 0 && (
          <div className="mt-10">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Most Viewed Lookbooks</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {stats.top_viewed.map((lb, i) => (
                <div key={lb.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3">
                  <span className="text-lg font-bold text-indigo-500">#{i + 1}</span>
                  {lb.cover_url ? (
                    <img src={lb.cover_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-400">
                      <BookOpen size={16} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{lb.name}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-2">
                      <span className="flex items-center gap-0.5"><Eye size={10} />{lb.view_count}</span>
                      <span className="flex items-center gap-0.5"><Share2 size={10} />{lb.share_count}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detail Modal */}
        <AnimatePresence>
          {detailBg && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
              onClick={() => setDetailBg(null)}
            >
              <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">{detailBg.name}</h2>
                  <button onClick={() => setDetailBg(null)} className="p-1 rounded-lg hover:bg-gray-100"><X size={20} /></button>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Retailer</span>
                    <span className="text-gray-900">{detailBg.retailer.shop_name} · {detailBg.retailer.city}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Format</span>
                    <span className="text-gray-900">{FORMAT_LABELS[detailBg.format]}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_CONFIG[detailBg.status]?.bg} ${STATUS_CONFIG[detailBg.status]?.color}`}>
                      {detailBg.status}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Products</span>
                    <span className="text-gray-900">{detailBg.product_ids.length} items</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Views / Shares</span>
                    <span className="text-gray-900">{detailBg.view_count} / {detailBg.share_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Created</span>
                    <span className="text-gray-900">{fmtDateTime(detailBg.created_at)}</span>
                  </div>

                  {detailBg.description && (
                    <div>
                      <span className="text-gray-500">Description</span>
                      <p className="text-gray-900 mt-1">{detailBg.description}</p>
                    </div>
                  )}

                  {/* Status controls */}
                  <div className="flex gap-2 pt-3 border-t border-gray-100">
                    {detailBg.status !== 'READY' && (
                      <button
                        onClick={() => { handleStatusChange(detailBg.id, 'READY'); setDetailBg(null) }}
                        className="flex-1 bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 text-sm"
                      >
                        Mark Ready
                      </button>
                    )}
                    {detailBg.status !== 'FAILED' && (
                      <button
                        onClick={() => { handleStatusChange(detailBg.id, 'FAILED'); setDetailBg(null) }}
                        className="flex-1 bg-red-500 text-white py-2 rounded-lg hover:bg-red-600 text-sm"
                      >
                        Mark Failed
                      </button>
                    )}
                    {detailBg.status !== 'DRAFT' && (
                      <button
                        onClick={() => { handleStatusChange(detailBg.id, 'DRAFT'); setDetailBg(null) }}
                        className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg hover:bg-gray-50 text-sm"
                      >
                        Reset to Draft
                      </button>
                    )}
                  </div>

                  {detailBg.output_url && (
                    <a
                      href={detailBg.output_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-center bg-indigo-50 text-indigo-600 py-2 rounded-lg hover:bg-indigo-100 text-sm"
                    >
                      Open Lookbook Output ↗
                    </a>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
