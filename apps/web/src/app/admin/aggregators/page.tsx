'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw,
  Store,
  ShoppingBag,
  Package,
  AlertTriangle,
  ExternalLink,
  Link2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { adminGetOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

// ─── Types ─────────────────────────────────────────────────────────

type ChannelSync = {
  id: string
  retailer_id: string
  channel: string
  status: string
  last_synced_at: string | null
  last_sync_error: string | null
  products_synced: number
  orders_synced: number
  channel_shop_id: string | null
  channel_shop_url: string | null
  is_active: boolean
  created_at: string
  retailer: { id: string; shop_name: string; phone: string }
}

type AggregatorStats = {
  total_connections: number
  active_connections: number
  sync_errors: number
  retailers_with_channels: number
  by_channel: {
    channel: string
    count: number
    total_products: number
    total_orders: number
  }[]
}

// ─── Helpers ──────────────────────────────────────────────────────

const CHANNEL_LABELS: Record<string, string> = {
  MEESHO: 'Meesho',
  INSTAMOJO: 'Instamojo',
  GLOAD: 'Glroad',
  CRAFTSVILLA: 'Craftsvilla',
  FLIPKART: 'Flipkart',
  AMAZON: 'Amazon',
  OTHER: 'Other',
}

const CHANNEL_EMOJI: Record<string, string> = {
  MEESHO: '🛍️',
  INSTAMOJO: '💰',
  GLOAD: '📦',
  CRAFTSVILLA: '🎨',
  FLIPKART: '🛒',
  AMAZON: '📦',
  OTHER: '🔗',
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  CONNECTED: { bg: 'bg-green-50 border-green-100', text: 'text-green-600' },
  SYNCING: { bg: 'bg-blue-50 border-blue-100', text: 'text-blue-600' },
  ERROR: { bg: 'bg-red-50 border-red-100', text: 'text-red-600' },
  DISCONNECTED: { bg: 'bg-gray-50 border-gray-100', text: 'text-gray-400' },
  CONNECTING: { bg: 'bg-amber-50 border-amber-100', text: 'text-amber-600' },
  SUSPENDED: { bg: 'bg-orange-50 border-orange-100', text: 'text-orange-600' },
}

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 220, damping: 24 } },
}

// ─── Main Page ────────────────────────────────────────────────────

export default function AggregatorsPage() {
  const [syncs, setSyncs] = useState<ChannelSync[] | null>(null)
  const [stats, setStats] = useState<AggregatorStats | null>(null)
  const [error, setError] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [selected, setSelected] = useState<ChannelSync | null>(null)

  const load = async () => {
    try {
      const [syncsRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/v1/admin/aggregators`, adminGetOptions()),
        fetch(`${API_URL}/v1/admin/aggregators/stats`, adminGetOptions()),
      ])
      const syncsJson = await syncsRes.json()
      const statsJson = await statsRes.json()
      if (syncsJson?.data) setSyncs(syncsJson.data)
      if (statsJson?.data) setStats(statsJson.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load aggregator data')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">Aggregator / Marketplace Sync</h1>
            <RefreshCw size={20} className="text-indigo-500" />
          </div>
          <p className="text-sm text-gray-500 max-w-2xl">
            Monitor retailer connections to external marketplaces (Meesho, Instamojo, etc.).
            Track product sync health, order aggregation, and channel-specific stats.
          </p>
        </div>
      </motion.div>

      {error && (
        <motion.div
          variants={itemVariants}
          className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl px-6 py-4"
        >
          {error}
        </motion.div>
      )}

      {/* Stats cards */}
      {stats && (
        <motion.div variants={containerVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard icon={Link2} label="Total Connections" value={String(stats.total_connections)} color="indigo" />
          <StatsCard icon={Store} label="Active" value={String(stats.active_connections)} color="green" />
          <StatsCard icon={AlertTriangle} label="Errors" value={String(stats.sync_errors)} color="red" />
          <StatsCard icon={ShoppingBag} label="Retailers" value={String(stats.retailers_with_channels)} color="blue" />
        </motion.div>
      )}

      {/* Channel breakdown */}
      {stats && stats.by_channel.length > 0 && (
        <motion.div variants={itemVariants}>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">
            By Marketplace
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {stats.by_channel.map((ch) => (
              <div
                key={ch.channel}
                className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/80 p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{CHANNEL_EMOJI[ch.channel] ?? '🔗'}</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {CHANNEL_LABELS[ch.channel] ?? ch.channel}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-gray-400">Shops</p>
                    <p className="font-bold text-gray-900">{ch.count}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Products</p>
                    <p className="font-bold text-gray-900">{ch.total_products.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Orders</p>
                    <p className="font-bold text-gray-900">{ch.total_orders.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Connections table */}
      <motion.div
        variants={itemVariants}
        className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden"
      >
        {!syncs ? (
          <div className="p-12 text-center text-sm text-gray-400 animate-pulse">Loading…</div>
        ) : syncs.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-3">
              <RefreshCw size={22} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-600">No channel connections yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Retailers will connect their marketplace accounts from the mobile app.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">Retailer</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Channel</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Products</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Orders</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Last Sync</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {syncs.map((s, i) => {
                  const sc = STATUS_COLORS[s.status] ?? STATUS_COLORS.DISCONNECTED
                  return (
                    <motion.tr
                      key={s.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b border-gray-50 hover:bg-indigo-50/40 transition-colors"
                    >
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                            <Store size={16} className="text-indigo-500" />
                          </div>
                          <div>
                            <span className="font-semibold text-gray-900">{s.retailer.shop_name}</span>
                            <p className="text-xs text-gray-400">{s.retailer.phone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-gray-600 text-xs font-medium bg-gray-100 rounded-full px-2.5 py-1">
                          <span>{CHANNEL_EMOJI[s.channel] ?? '🔗'}</span>
                          {CHANNEL_LABELS[s.channel] ?? s.channel}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center text-[10px] font-semibold uppercase rounded-full px-2.5 py-1 border ${sc.bg} ${sc.text}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-gray-900">{s.products_synced.toLocaleString()}</td>
                      <td className="px-4 py-3.5 font-semibold text-gray-900">{s.orders_synced.toLocaleString()}</td>
                      <td className="px-4 py-3.5 text-gray-500 text-xs">{fmtDate(s.last_synced_at)}</td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          {s.channel_shop_url && (
                            <a
                              href={s.channel_shop_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              aria-label="Open shop"
                            >
                              <ExternalLink size={15} />
                            </a>
                          )}
                          <button
                            onClick={() => {
                              setSelected(s)
                              setDetailOpen(true)
                            }}
                            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            aria-label="View details"
                          >
                            <Package size={15} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Detail modal */}
      <AnimatePresence>
        {detailOpen && selected && (
          <DetailModal sync={selected} onClose={() => setDetailOpen(false)} />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Stats card ─────────────────────────────────────────────────────

function StatsCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: LucideIcon
  label: string
  value: string
  color: 'indigo' | 'green' | 'red' | 'blue'
}) {
  const colorMap = {
    indigo: { bg: 'bg-indigo-50 border-indigo-100', icon: 'text-indigo-500' },
    green: { bg: 'bg-green-50 border-green-100', icon: 'text-green-500' },
    red: { bg: 'bg-red-50 border-red-100', icon: 'text-red-500' },
    blue: { bg: 'bg-blue-50 border-blue-100', icon: 'text-blue-500' },
  }
  const c = colorMap[color]
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -2 }}
      className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/80 p-5"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-9 h-9 rounded-xl ${c.bg} border flex items-center justify-center`}>
          <Icon size={17} className={c.icon} />
        </div>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
    </motion.div>
  )
}

// ── Detail modal ───────────────────────────────────────────────────

function DetailModal({ sync, onClose }: { sync: ChannelSync; onClose: () => void }) {
  const sc = STATUS_COLORS[sync.status] ?? STATUS_COLORS.DISCONNECTED
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <span>{CHANNEL_EMOJI[sync.channel] ?? '🔗'}</span>
            {CHANNEL_LABELS[sync.channel] ?? sync.channel} Connection
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <DetailRow label="Retailer" value={`${sync.retailer.shop_name} (${sync.retailer.phone})`} />
          <DetailRow label="Status" value={<span className={`inline-flex items-center text-[10px] font-semibold uppercase rounded-full px-2.5 py-1 border ${sc.bg} ${sc.text}`}>{sync.status}</span>} />
          <DetailRow label="Shop ID" value={sync.channel_shop_id ?? '—'} />
          <DetailRow label="Shop URL" value={sync.channel_shop_url ? <a href={sync.channel_shop_url} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">{sync.channel_shop_url}</a> : '—'} />
          <DetailRow label="Products Synced" value={String(sync.products_synced)} />
          <DetailRow label="Orders Synced" value={String(sync.orders_synced)} />
          <DetailRow label="Last Sync" value={fmtDate(sync.last_synced_at)} />
          <DetailRow label="Error" value={sync.last_sync_error ? <span className="text-red-500">{sync.last_sync_error}</span> : '—'} />
          <DetailRow label="Connected Since" value={fmtDate(sync.created_at)} />
        </div>
      </motion.div>
    </motion.div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs font-semibold text-gray-500 uppercase">{label}</span>
      <span className="text-sm text-gray-900 text-right max-w-[60%]">{value}</span>
    </div>
  )
}
