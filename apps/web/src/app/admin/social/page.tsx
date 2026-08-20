'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw,
  Share2,
  Users,
  CheckCircle,
  XCircle,
  ExternalLink,
  X,
  Facebook,
  Instagram,
  type LucideIcon,
} from 'lucide-react'
import { adminGetOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

// ─── Types ─────────────────────────────────────────────────────────

type SocialAccount = {
  id: string
  retailer_id: string
  retailer_name: string
  retailer_city: string
  platform: string
  account_id: string
  account_name: string
  is_active: boolean
  post_count: number
  token_expires_at: string | null
  connected_at: string
}

type SocialStats = {
  total_accounts: number
  active_accounts: number
  inactive_accounts: number
  by_platform: { platform: string; count: number }[]
  total_posts: number
  posts_by_status: { status: string; count: number }[]
}

type SocialPost = {
  id: string
  retailer_id: string
  retailer_name: string
  platform: string
  post_type: string
  caption: string | null
  status: string
  external_post_url: string | null
  error_message: string | null
  product_ids: string[]
  collection_id: string | null
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────

const PLATFORM_EMOJI: Record<string, string> = {
  FACEBOOK: '📘',
  INSTAGRAM: '📸',
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  POSTED: { bg: 'bg-green-50 border-green-100', text: 'text-green-600', label: 'Posted' },
  FAILED: { bg: 'bg-red-50 border-red-100', text: 'text-red-600', label: 'Failed' },
}

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
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

export default function SocialPage() {
  const [accounts, setAccounts] = useState<SocialAccount[] | null>(null)
  const [stats, setStats] = useState<SocialStats | null>(null)
  const [posts, setPosts] = useState<SocialPost[] | null>(null)
  const [error, setError] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [selected, setSelected] = useState<SocialAccount | null>(null)
  const [tab, setTab] = useState<'accounts' | 'posts'>('accounts')
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  const load = async () => {
    try {
      const [accountsRes, statsRes, postsRes] = await Promise.all([
        fetch(`${API_URL}/v1/admin/social/accounts`, adminGetOptions()),
        fetch(`${API_URL}/v1/admin/social/stats`, adminGetOptions()),
        fetch(`${API_URL}/v1/admin/social/posts?limit=50`, adminGetOptions()),
      ])
      const accountsJson = await accountsRes.json()
      const statsJson = await statsRes.json()
      const postsJson = await postsRes.json()
      if (accountsJson?.data) setAccounts(accountsJson.data)
      if (statsJson?.data) setStats(statsJson.data)
      if (postsJson?.data) setPosts(postsJson.data.posts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load social data')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleDisconnect = async (id: string) => {
    try {
      setDisconnecting(id)
      const res = await fetch(`${API_URL}/v1/admin/social/accounts/${id}`, {
        method: 'DELETE',
        ...adminGetOptions(),
      })
      if (res.ok) {
        setAccounts((prev) => (prev ? prev.filter((a) => a.id !== id) : null))
        setDetailOpen(false)
        setSelected(null)
        void load()
      }
    } catch {
      // ignore
    } finally {
      setDisconnecting(null)
    }
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">Social Publishing</h1>
            <Share2 size={20} className="text-indigo-500" />
          </div>
          <p className="text-sm text-gray-500 max-w-2xl">
            Monitor retailer Facebook and Instagram connections, post history, and
            success rates. Manage connected accounts across the platform.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl px-4 py-2 transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
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
          <StatsCard icon={Users} label="Connected Accounts" value={String(stats.active_accounts)} color="indigo" />
          <StatsCard icon={CheckCircle} label="Total Posts" value={String(stats.total_posts)} color="green" />
          <StatsCard icon={XCircle} label="Failed Posts" value={String(stats.posts_by_status.find((s) => s.status === 'FAILED')?.count ?? 0)} color="red" />
          <StatsCard icon={Share2} label="Platforms" value={stats.by_platform.map((p) => `${p.platform} (${p.count})`).join(', ') || 'None'} color="blue" />
        </motion.div>
      )}

      {/* Tab bar */}
      <motion.div variants={itemVariants} className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(['accounts', 'posts'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'accounts' ? 'Connected Accounts' : 'Post History'}
          </button>
        ))}
      </motion.div>

      {/* Accounts table */}
      {tab === 'accounts' && accounts && (
        <motion.div variants={itemVariants} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Retailer</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Platform</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Account Name</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Posts</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Connected</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr
                    key={account.id}
                    className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer"
                    onClick={() => { setSelected(account); setDetailOpen(true) }}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{account.retailer_name}</div>
                      <div className="text-xs text-gray-400">{account.retailer_city}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1 text-xs font-medium">
                        {PLATFORM_EMOJI[account.platform] ?? '🔗'}
                        {account.platform}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{account.account_name}</td>
                    <td className="px-4 py-3 text-center font-medium text-gray-700">
                      {account.post_count}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold border ${
                          account.is_active
                            ? 'bg-green-50 border-green-100 text-green-600'
                            : 'bg-gray-50 border-gray-100 text-gray-400'
                        }`}
                      >
                        {account.is_active ? 'Active' : 'Disconnected'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {fmtDate(account.connected_at)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelected(account)
                          setDetailOpen(true)
                        }}
                        className="text-indigo-500 hover:text-indigo-700 text-xs font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {accounts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                      No connected social accounts yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Posts table */}
      {tab === 'posts' && posts && (
        <motion.div variants={itemVariants} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Retailer</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Platform</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Type</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Caption</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Link</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => {
                  const statusConf = STATUS_CONFIG[post.status] ?? STATUS_CONFIG.POSTED
                  return (
                    <tr key={post.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900">{post.retailer_name}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1 text-xs font-medium">
                          {PLATFORM_EMOJI[post.platform] ?? '🔗'}
                          {post.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {post.post_type === 'SINGLE_PRODUCT' ? '📸 Product' : '🔗 Collection'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs max-w-[200px] truncate">
                        {post.caption ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold border ${statusConf.bg} ${statusConf.text}`}
                        >
                          {statusConf.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(post.created_at)}</td>
                      <td className="px-4 py-3 text-center">
                        {post.external_post_url ? (
                          <a
                            href={post.external_post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-500 hover:text-indigo-700"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink size={14} />
                          </a>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {posts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                      No posts yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Detail modal */}
      <AnimatePresence>
        {detailOpen && selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            onClick={() => setDetailOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 border-b border-gray-100">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{selected.account_name}</h3>
                  <p className="text-sm text-gray-500">
                    {PLATFORM_EMOJI[selected.platform]} {selected.platform} — {selected.retailer_name}
                  </p>
                </div>
                <button
                  onClick={() => setDetailOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={18} className="text-gray-400" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <DetailRow label="Retailer" value={`${selected.retailer_name} (${selected.retailer_city})`} />
                <DetailRow label="Platform" value={selected.platform} />
                <DetailRow label="Account ID" value={selected.account_id} />
                <DetailRow label="Posts Published" value={String(selected.post_count)} />
                <DetailRow label="Connected" value={fmtDate(selected.connected_at)} />
                {selected.token_expires_at && (
                  <DetailRow
                    label="Token Expires"
                    value={fmtDate(selected.token_expires_at)}
                    warn={new Date(selected.token_expires_at) < new Date()}
                  />
                )}

                <div className="pt-3 border-t border-gray-100">
                  <button
                    onClick={() => void handleDisconnect(selected.id)}
                    disabled={disconnecting === selected.id}
                    className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-medium text-sm rounded-xl px-4 py-2.5 transition-colors disabled:opacity-50"
                  >
                    {disconnecting === selected.id ? 'Disconnecting…' : '🔌 Force Disconnect'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Components ───────────────────────────────────────────────────

function StatsCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: LucideIcon
  label: string
  value: string
  color: string
}) {
  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    blue: 'bg-blue-50 text-blue-600',
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${colorMap[color] ?? colorMap.indigo}`}>
          <Icon size={14} />
        </div>
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
    </div>
  )
}

function DetailRow({
  label,
  value,
  warn,
}: {
  label: string
  value: string
  warn?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm font-medium ${warn ? 'text-red-600' : 'text-gray-900'}`}>
        {value}
      </span>
    </div>
  )
}
