'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Share2,
  Eye,
  EyeOff,
  BarChart3,
  Hash,
  Trash2,
  X,
  Instagram,
  MessageCircle,
  FileImage,
  type LucideIcon,
} from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

// ─── Types ─────────────────────────────────────────────────────────

type Retailer = { id: string; shop_name: string; city: string }

type SocialTemplate = {
  id: string
  retailer_id: string
  name: string
  description: string | null
  template_type: string
  occasion: string | null
  platform: string | null
  overlay_festival: string | null
  background_style: string | null
  image_url: string | null
  image_r2_key: string | null
  caption: string | null
  hashtags: string[]
  usage_count: number
  product_ids: string[]
  is_active: boolean
  created_at: string
  retailer: Retailer
}

type Stats = {
  total: number
  active: number
  inactive: number
  by_type: { type: string; count: number }[]
  by_occasion: { occasion: string; count: number }[]
  top_used: { id: string; name: string; template_type: string; usage_count: number; occasion: string | null }[]
}

const TYPE_LABELS: Record<string, string> = {
  INSTAGRAM_POST: 'IG Post',
  INSTAGRAM_REEL: 'IG Reel',
  INSTAGRAM_STORY: 'IG Story',
  WHATSAPP_STATUS: 'WA Status',
  WHATSAPP_CATALOG: 'WA Catalog',
  FACEBOOK_POST: 'FB Post',
  FACEBOOK_STORY: 'FB Story',
  PDF_FLYER: 'PDF Flyer',
}

const TYPE_ICONS: Record<string, string> = {
  INSTAGRAM_POST: 'bg-pink-50 text-pink-500',
  INSTAGRAM_REEL: 'bg-pink-50 text-pink-500',
  INSTAGRAM_STORY: 'bg-pink-50 text-pink-500',
  WHATSAPP_STATUS: 'bg-green-50 text-green-500',
  WHATSAPP_CATALOG: 'bg-green-50 text-green-500',
  FACEBOOK_POST: 'bg-blue-50 text-blue-500',
  FACEBOOK_STORY: 'bg-blue-50 text-blue-500',
  PDF_FLYER: 'bg-purple-50 text-purple-500',
}

const OCCASIONS = ['Diwali', 'Wedding', 'Eid', 'Navratri', 'Pongal', 'Onam', 'Holi', 'Christmas', 'New Year', 'General']

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

// ─── Main Page ────────────────────────────────────────────────────

export default function SocialTemplatesPage() {
  const [templates, setTemplates] = useState<SocialTemplate[] | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterOccasion, setFilterOccasion] = useState('')
  const [detailBg, setDetailBg] = useState<SocialTemplate | null>(null)

  const load = async () => {
    try {
      const params = new URLSearchParams()
      if (filterType) params.set('template_type', filterType)
      if (filterOccasion) params.set('occasion', filterOccasion)

      const [tRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/v1/admin/social-templates?${params}`, adminGetOptions()),
        fetch(`${API_URL}/v1/admin/social-templates/stats`, adminGetOptions()),
      ])

      if (!tRes.ok) throw new Error(`Failed to load templates (${tRes.status})`)
      const tJson = await tRes.json()
      setTemplates(tJson.data ?? [])

      if (statsRes.ok) {
        const sJson = await statsRes.json()
        setStats(sJson.data ?? null)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- load reads filterType/filterOccasion from closure; deps list covers every input
  useEffect(() => { load() }, [filterType, filterOccasion])

  const handleToggle = async (t: SocialTemplate) => {
    try {
      const res = await fetch(`${API_URL}/v1/admin/social-templates/${t.id}/toggle`, { method: 'PUT', ...adminMutateOptions() })
      if (!res.ok) throw new Error('Toggle failed')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Toggle failed')
    }
  }

  const handleDelete = async (t: SocialTemplate) => {
    if (!confirm(`Delete template "${t.name}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`${API_URL}/v1/admin/social-templates/${t.id}`, { method: 'DELETE', ...adminMutateOptions() })
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
            <Share2 className="text-pink-500" size={28} />
            AI Social Media Templates
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage retailer social media image generation templates</p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {/* Stats */}
        {stats && (
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard icon={Share2} label="Total Templates" value={stats.total} color="bg-pink-50 text-pink-600" />
            <StatCard icon={Eye} label="Active" value={stats.active} color="bg-green-50 text-green-600" />
            <StatCard icon={EyeOff} label="Inactive" value={stats.inactive} color="bg-gray-50 text-gray-500" />
            <StatCard icon={BarChart3} label="Occasions" value={stats.by_occasion.length} color="bg-purple-50 text-purple-600" />
          </motion.div>
        )}

        {/* Type breakdown */}
        {stats && stats.by_type.length > 0 && (
          <div className="flex gap-2 mb-4 flex-wrap">
            {stats.by_type.map((t) => (
              <span key={t.type} className="px-3 py-1 rounded-full text-xs bg-pink-50 text-pink-600 border border-pink-100">
                {TYPE_LABELS[t.type] ?? t.type}: {t.count}
              </span>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white"
          >
            <option value="">All Types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={filterOccasion}
            onChange={(e) => setFilterOccasion(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white"
          >
            <option value="">All Occasions</option>
            {OCCASIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        {/* Templates grid */}
        {!templates ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Share2 size={48} className="mx-auto mb-3 opacity-30" />
            <p>No social templates yet.</p>
          </div>
        ) : (
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {templates.map((t) => {
              const typeColor = TYPE_ICONS[t.template_type] ?? 'bg-gray-50 text-gray-500'
              return (
                <motion.div key={t.id} variants={itemVariants} className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  {/* Image preview */}
                  <div className="relative h-40 bg-gray-100">
                    {t.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- admin-internal template preview grid
                      <img src={t.image_url} alt={t.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <FileImage size={32} />
                      </div>
                    )}
                    <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium ${typeColor}`}>
                      {TYPE_LABELS[t.template_type] ?? t.template_type}
                    </span>
                    <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-medium border ${
                      t.is_active ? 'bg-green-50 text-green-600 border-green-100' : 'bg-gray-50 text-gray-400 border-gray-100'
                    }`}>
                      {t.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 text-sm truncate">{t.name}</h3>
                        <p className="text-xs text-gray-400">{t.retailer.shop_name} · {t.retailer.city}</p>
                      </div>
                      {t.occasion && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-600 border border-amber-100 flex-shrink-0">
                          {t.occasion}
                        </span>
                      )}
                    </div>

                    {t.caption && <p className="text-xs text-gray-500 mb-2 line-clamp-2">{t.caption}</p>}

                    {t.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {t.hashtags.slice(0, 4).map((h, i) => (
                          <span key={i} className="text-xs text-blue-500">#{h}</span>
                        ))}
                        {t.hashtags.length > 4 && <span className="text-xs text-gray-400">+{t.hashtags.length - 4}</span>}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">Used {t.usage_count}×</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleToggle(t)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400" title={t.is_active ? 'Deactivate' : 'Activate'}>
                          {t.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <button onClick={() => setDetailBg(t)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400" title="View details">
                          <Hash size={14} />
                        </button>
                        <button onClick={() => handleDelete(t)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-red-400">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        )}

        {/* Top used */}
        {stats && stats.top_used.length > 0 && (
          <div className="mt-10">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Most Used Templates</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {stats.top_used.map((t, i) => (
                <div key={t.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3">
                  <span className="text-lg font-bold text-pink-500">#{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.usage_count}× · {TYPE_LABELS[t.template_type] ?? t.template_type}</p>
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
                    <span className="text-gray-500">Type</span>
                    <span className="text-gray-900">{TYPE_LABELS[detailBg.template_type] ?? detailBg.template_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Occasion</span>
                    <span className="text-gray-900">{detailBg.occasion ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Platform</span>
                    <span className="text-gray-900">{detailBg.platform ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Background</span>
                    <span className="text-gray-900">{detailBg.background_style ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Usage</span>
                    <span className="text-gray-900">{detailBg.usage_count}× ({detailBg.product_ids.length} products)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                      detailBg.is_active ? 'bg-green-50 text-green-600 border-green-100' : 'bg-gray-50 text-gray-400 border-gray-100'
                    }`}>
                      {detailBg.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {detailBg.caption && (
                    <div>
                      <span className="text-gray-500">Caption</span>
                      <p className="text-gray-900 mt-1 bg-gray-50 p-3 rounded-lg text-xs">{detailBg.caption}</p>
                    </div>
                  )}

                  {detailBg.hashtags.length > 0 && (
                    <div>
                      <span className="text-gray-500">Hashtags</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {detailBg.hashtags.map((h, i) => (
                          <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">#{h}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {detailBg.image_url && (
                    <div>
                      <span className="text-gray-500">Preview</span>
                      {/* eslint-disable-next-line @next/next/no-img-element -- admin-internal template detail preview */}
                      <img src={detailBg.image_url} alt="" className="mt-1 w-full rounded-lg" />
                    </div>
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
