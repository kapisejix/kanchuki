'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageCircle,
  RefreshCw,
  Store,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  ChevronRight,
  X,
  ScrollText,
  Package,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

// ─── Types ─────────────────────────────────────────────────────────

type Health = {
  retailers_total: number
  retailers_configured: number
  retailers_syncing: number
  items_synced: number
  items_failed: number
  items_pending: number
  failed_logs_7d: number
  error_rate_pct: number
  cron_last_run_at: string | null
  cron_failed_7d: number
  cron_timed_out_7d: number
}

type RetailerRow = {
  retailer_id: string
  shop_name: string
  city: string | null
  plan: string
  configured: boolean
  whatsapp_catalog_id: string | null
  sync_enabled: boolean
  sync_categories: string[]
  last_synced_at: string | null
  items_synced: number
  items_failed: number
  items_pending: number
}

type Overview = { health: Health; retailers: RetailerRow[] }

type SyncLog = {
  id: string
  operation: string
  product_id: string | null
  meta_item_id: string | null
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'IN_PROGRESS'
  error_message: string | null
  payload: { total?: number; created?: number; updated?: number; failed?: unknown[] } | null
  created_at: string
}

type CatalogItemRow = {
  product_id: string
  product_name: string
  sku: string | null
  price_paise: number
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'IN_PROGRESS'
  error_message: string | null
  whatsapp_catalog_item_id: string | null
  product_status: string
  hsn_code: string | null
  last_synced_at: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────

const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.08 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 200, damping: 22 } },
}

// ─── Main Page ────────────────────────────────────────────────────

export default function WhatsAppCatalogPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<RetailerRow | null>(null)
  const [syncingId, setSyncingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/v1/admin/whatsapp-catalog/overview`, adminGetOptions())
      const json = await res.json()
      if (!json?.data) {
        setError('The API returned an error while loading catalog sync data.')
        return
      }
      setOverview(json.data)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog sync data')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const triggerSync = async (retailer: RetailerRow) => {
    setSyncingId(retailer.retailer_id)
    setError('')
    try {
      const res = await fetch(
        `${API_URL}/v1/admin/whatsapp-catalog/retailers/${retailer.retailer_id}/sync`,
        { ...(await adminMutateOptions()), method: 'POST' },
      )
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message ?? `Sync failed (HTTP ${res.status})`)
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger sync')
    } finally {
      setSyncingId(null)
    }
  }

  const health = overview?.health

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-8">
      {/* Header */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp Catalog</h1>
          <MessageCircle size={20} className="text-cyan-500" />
        </div>
        <p className="text-sm text-gray-500">
          Product catalog sync to WhatsApp Business native catalogs — per-retailer health, history and manual sync.
        </p>
      </motion.div>

      {error && (
        <motion.div
          variants={itemVariants}
          className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl px-6 py-4"
        >
          {error}
        </motion.div>
      )}

      {health && (
        <>
          {/* Health strip (G5) — incl. daily-cron card (C10/C11) */}
          <motion.div variants={containerVariants} className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <HealthCard
              icon={Store}
              label="Retailers Syncing"
              value={`${health.retailers_syncing} / ${health.retailers_total}`}
              subtext={`${health.retailers_configured} with Meta connected`}
              color="blue"
            />
            <HealthCard
              icon={CheckCircle2}
              label="Items Synced"
              value={health.items_synced.toLocaleString('en-IN')}
              subtext={`${health.items_pending} pending`}
              color="green"
            />
            <HealthCard
              icon={XCircle}
              label="Items Failed"
              value={health.items_failed.toLocaleString('en-IN')}
              subtext={`${health.failed_logs_7d} failed sync runs · 7d`}
              color={health.items_failed > 0 ? 'red' : 'amber'}
            />
            <HealthCard
              icon={Activity}
              label="Error Rate"
              value={`${health.error_rate_pct}%`}
              subtext="Failed / (synced + failed) items"
              color={health.error_rate_pct > 10 ? 'red' : 'purple'}
            />
            <HealthCard
              icon={Clock}
              label="Daily Cron"
              value={health.cron_last_run_at ? fmtDate(health.cron_last_run_at) : 'Never'}
              subtext={`${health.cron_failed_7d} failed · ${health.cron_timed_out_7d} timed out · 7d`}
              color={health.cron_failed_7d > 0 ? 'red' : 'green'}
            />
          </motion.div>

          {/* Retailer table (G1/G2) */}
          <motion.div
            variants={itemVariants}
            className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden"
          >
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <RefreshCw size={16} className="text-gray-400" />
                Retailers
              </h2>
              <button
                onClick={() => void load()}
                className="text-xs font-medium text-gray-400 hover:text-cyan-600 transition-colors flex items-center gap-1.5"
              >
                <RefreshCw size={13} />
                Refresh
              </button>
            </div>

            {overview!.retailers.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-3">
                  <Store size={22} className="text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-600">No retailers yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">Store</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Plan</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Catalog</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Synced</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Failed</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Last Sync</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview!.retailers.map((r, i) => (
                      <motion.tr
                        key={r.retailer_id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        onClick={() => setDetail(r)}
                        className="border-b border-gray-50 hover:bg-cyan-50/40 cursor-pointer transition-colors group"
                      >
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center shrink-0">
                              <Store size={16} className="text-cyan-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 truncate group-hover:text-cyan-700">
                                {r.shop_name}
                              </p>
                              <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5">
                                <span>{r.city ?? '—'}</span>
                                {!r.configured && (
                                  <span className="text-[10px] font-medium text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
                                    not configured
                                  </span>
                                )}
                                {r.configured && !r.sync_enabled && (
                                  <span className="text-[10px] font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                                    sync off
                                  </span>
                                )}
                                {r.configured && r.sync_enabled && (
                                  <span className="text-[10px] font-medium text-green-600 bg-green-50 rounded-full px-2 py-0.5">
                                    syncing
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-[11px] font-semibold text-gray-600 bg-gray-100 rounded-md px-2 py-1">
                            {r.plan}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {r.whatsapp_catalog_id ? (
                            <span className="font-mono text-xs text-gray-500">{r.whatsapp_catalog_id}</span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right text-green-600 font-semibold tabular-nums">
                          {r.items_synced.toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {r.items_failed > 0 ? (
                            <span className="text-red-600 font-semibold tabular-nums">{r.items_failed}</span>
                          ) : (
                            <span className="text-gray-300 tabular-nums">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-gray-500 whitespace-nowrap">
                          {fmtDate(r.last_synced_at)}
                        </td>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            <motion.button
                              onClick={() => void triggerSync(r)}
                              disabled={!r.configured || syncingId === r.retailer_id}
                              whileHover={r.configured ? { scale: 1.04 } : undefined}
                              whileTap={r.configured ? { scale: 0.96 } : undefined}
                              title={r.configured ? 'Force a full sync now' : 'Retailer has no WhatsApp API connection'}
                              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-cyan-200 text-cyan-700 hover:bg-cyan-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              {syncingId === r.retailer_id ? (
                                <div className="w-3.5 h-3.5 border-2 border-cyan-200 border-t-cyan-600 rounded-full animate-spin" />
                              ) : (
                                <Zap size={13} />
                              )}
                              Sync now
                            </motion.button>
                            <ChevronRight size={16} className="text-gray-300 group-hover:text-cyan-400 transition-colors" />
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        </>
      )}

      {!overview && !error && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white/80 rounded-2xl border border-gray-200/80 p-5 animate-pulse">
              <div className="h-3 bg-gray-200/80 rounded w-20 mb-3" />
              <div className="h-8 bg-gray-200/80 rounded w-24" />
            </div>
          ))}
        </div>
      )}

      {/* Drill-down modal (G3) */}
      <AnimatePresence>
        {detail && (
          <RetailerDetailModal
            retailer={detail}
            onClose={() => setDetail(null)}
            onSync={async () => {
              await triggerSync(detail)
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Health card ───────────────────────────────────────────────────

function HealthCard({
  icon: Icon,
  label,
  value,
  subtext,
  color,
}: {
  icon: LucideIcon
  label: string
  value: string
  subtext: string
  color: 'blue' | 'green' | 'amber' | 'purple' | 'red'
}) {
  const colorMap = {
    blue: { bg: 'bg-blue-50 border-blue-100', text: 'text-blue-600', icon: 'text-blue-500', top: 'from-blue-500/20 to-transparent' },
    green: { bg: 'bg-green-50 border-green-100', text: 'text-green-600', icon: 'text-green-500', top: 'from-green-500/20 to-transparent' },
    amber: { bg: 'bg-amber-50 border-amber-100', text: 'text-amber-600', icon: 'text-amber-500', top: 'from-amber-500/20 to-transparent' },
    purple: { bg: 'bg-purple-50 border-purple-100', text: 'text-purple-600', icon: 'text-purple-500', top: 'from-purple-500/20 to-transparent' },
    red: { bg: 'bg-red-50 border-red-100', text: 'text-red-600', icon: 'text-red-500', top: 'from-red-500/20 to-transparent' },
  }
  const c = colorMap[color]
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -3, boxShadow: '0 12px 24px -8px rgba(0,0,0,0.1)' }}
      className="relative bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/80 p-5 transition-all overflow-hidden"
    >
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${c.top}`} />
      <div className="flex items-start justify-between mb-2 relative">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">{label}</span>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${c.bg} ${c.icon}`}>
          <Icon size={17} />
        </div>
      </div>
      <div className={`text-2xl font-bold relative ${c.text}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1.5 relative">{subtext}</div>
    </motion.div>
  )
}

// ── Drill-down modal (G3) ─────────────────────────────────────────

function RetailerDetailModal({
  retailer,
  onClose,
  onSync,
}: {
  retailer: RetailerRow
  onClose: () => void
  onSync: () => Promise<void>
}) {
  const [tab, setTab] = useState<'logs' | 'items'>('logs')
  const [logs, setLogs] = useState<SyncLog[] | null>(null)
  const [items, setItems] = useState<CatalogItemRow[] | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (tab === 'logs') {
        if (logs === null) {
          const res = await fetch(
            `${API_URL}/v1/admin/whatsapp-catalog/retailers/${retailer.retailer_id}/logs`,
            adminGetOptions(),
          )
          const json = await res.json()
          if (!cancelled && json?.data) setLogs(json.data)
        }
      } else if (items === null) {
        const res = await fetch(
          `${API_URL}/v1/admin/whatsapp-catalog/retailers/${retailer.retailer_id}/items`,
          adminGetOptions(),
        )
        const json = await res.json()
        if (!cancelled && json?.data) setItems(json.data)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [tab, logs, items, retailer.retailer_id])

  const syncNow = async () => {
    setSyncing(true)
    try {
      await onSync()
      setLogs(null)
    } finally {
      setSyncing(false)
    }
  }

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
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center">
                <Store size={18} className="text-cyan-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">{retailer.shop_name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {retailer.city ?? '—'} · {retailer.plan}
                  {retailer.whatsapp_catalog_id ? ` · catalog ${retailer.whatsapp_catalog_id}` : ' · no catalog'}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Summary strip */}
        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-green-600 font-semibold">
            <CheckCircle2 size={14} />
            {retailer.items_synced} synced
          </span>
          <span className={`flex items-center gap-1.5 font-semibold ${retailer.items_failed > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            <XCircle size={14} />
            {retailer.items_failed} failed
          </span>
          <span className="flex items-center gap-1.5 text-gray-400">
            <Clock size={14} />
            last sync {fmtDate(retailer.last_synced_at)}
          </span>
          <motion.button
            onClick={() => void syncNow()}
            disabled={!retailer.configured || syncing}
            whileHover={retailer.configured ? { scale: 1.03 } : undefined}
            whileTap={retailer.configured ? { scale: 0.97 } : undefined}
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed shadow shadow-cyan-500/25"
          >
            {syncing ? (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Zap size={13} />
            )}
            Sync now
          </motion.button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-3 flex items-center gap-2">
          <TabButton active={tab === 'logs'} onClick={() => setTab('logs')} icon={ScrollText} label="Sync Logs" />
          <TabButton active={tab === 'items'} onClick={() => setTab('items')} icon={Package} label="Items" />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tab === 'logs' ? (
            logs === null ? (
              <div className="p-10 text-center text-sm text-gray-400 animate-pulse">Loading logs…</div>
            ) : logs.length === 0 ? (
              <EmptyState text="No sync runs yet — trigger a sync to see history." />
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3"
                  >
                    <StatusDot status={log.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 capitalize">{log.operation.replace('_', ' ')}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {fmtTime(log.created_at)}
                        {log.product_id ? ` · product ${log.product_id}` : ''}
                        {log.payload?.total != null ? ` · ${log.payload.total} products` : ''}
                        {log.payload?.created != null || log.payload?.updated != null
                          ? ` (${log.payload.created ?? 0} created / ${log.payload.updated ?? 0} updated)`
                          : ''}
                      </p>
                      {log.error_message && <p className="text-xs text-red-500 mt-1">{log.error_message}</p>}
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-1 ${
                        log.status === 'SUCCESS'
                          ? 'bg-green-50 text-green-600'
                          : log.status === 'FAILED'
                            ? 'bg-red-50 text-red-600'
                            : log.status === 'PARTIAL'
                              ? 'bg-amber-50 text-amber-600'
                              : 'bg-blue-50 text-blue-600'
                      }`}
                    >
                      {log.status}
                    </span>
                  </div>
                ))}
              </div>
            )
          ) : items === null ? (
            <div className="p-10 text-center text-sm text-gray-400 animate-pulse">Loading items…</div>
          ) : items.length === 0 ? (
            <EmptyState text="No synced items — run a full sync first." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500">
                    <th className="py-2 pr-3">Product</th>
                    <th className="py-2 pr-3 text-right">Price</th>
                    <th className="py-2 pr-3">Meta ID</th>
                    <th className="py-2 pr-3">HSN</th>
                    <th className="py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.product_id} className="border-b border-gray-50">
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-gray-800 truncate max-w-[220px]">{item.product_name}</p>
                        <p className="text-xs text-gray-400">{item.sku ?? item.product_id}</p>
                      </td>
                      <td className="py-2.5 pr-3 text-right text-gray-700 tabular-nums">{inr(item.price_paise)}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-gray-500 truncate max-w-[130px]">
                        {item.whatsapp_catalog_item_id ?? '—'}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-gray-500">{item.hsn_code ?? '—'}</td>
                      <td className="py-2.5 text-right">
                        {item.status === 'FAILED' ? (
                          <span className="text-[10px] font-bold text-red-600 bg-red-50 rounded-full px-2 py-1" title={item.error_message ?? ''}>
                            FAILED
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-green-600 bg-green-50 rounded-full px-2 py-1">
                            {item.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Small building blocks ─────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: LucideIcon
  label: string
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
        active ? 'text-cyan-700' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {active && (
        <motion.span
          layoutId="catalog-detail-tab"
          className="absolute inset-0 bg-cyan-50 border border-cyan-200 rounded-xl"
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        />
      )}
      <Icon size={15} className="relative z-10" />
      <span className="relative z-10">{label}</span>
    </motion.button>
  )
}

function StatusDot({ status }: { status: SyncLog['status'] }) {
  const color =
    status === 'SUCCESS'
      ? 'bg-green-500'
      : status === 'FAILED'
        ? 'bg-red-500'
        : status === 'PARTIAL'
          ? 'bg-amber-500'
          : 'bg-blue-500'
  return (
    <div className="mt-1.5 shrink-0">
      <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="p-10 text-center">
      <div className="w-12 h-12 mx-auto rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-3">
        <Clock size={20} className="text-gray-300" />
      </div>
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  )
}
