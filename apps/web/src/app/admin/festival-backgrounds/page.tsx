'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Image as ImageIcon,
  Plus,
  X,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Sparkles,
  BarChart3,
  Upload,
  Calendar,
  type LucideIcon,
} from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

// ─── Types ─────────────────────────────────────────────────────────

type Retailer = { id: string; shop_name: string; city: string }

type FestivalBackground = {
  id: string
  retailer_id: string
  name: string
  description: string | null
  image_url: string
  image_r2_key: string | null
  thumbnail_url: string | null
  occasion: string
  season: string | null
  region: string | null
  is_active: boolean
  valid_from: string | null
  valid_to: string | null
  priority: number
  usage_count: number
  created_at: string
  retailer: Retailer
}

type Stats = {
  total: number
  active: number
  inactive: number
  by_occasion: { occasion: string; count: number }[]
  top_used: { id: string; name: string; occasion: string; usage_count: number; image_url: string }[]
}

const OCCASIONS = ['Diwali', 'Wedding', 'Eid', 'Navratri', 'Pongal', 'Onam', 'Holi', 'Christmas', 'New Year', 'Baisakhi', 'Raksha Bandhan', 'Karva Chauth', 'Other']
const SEASONS = ['spring', 'summer', 'monsoon', 'autumn', 'winter']
const REGIONS = ['all', 'north_india', 'south_india', 'east_india', 'west_india', 'central_india']

// ─── Helpers ──────────────────────────────────────────────────────

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

function statusBadge(bg: FestivalBackground): { label: string; cls: string } {
  if (!bg.is_active) return { label: 'Inactive', cls: 'bg-gray-50 text-gray-400 border-gray-100' }
  const now = Date.now()
  if (bg.valid_from && new Date(bg.valid_from).getTime() > now) return { label: 'Scheduled', cls: 'bg-cyan-50 text-cyan-600 border-cyan-100' }
  if (bg.valid_to && new Date(bg.valid_to).getTime() < now) return { label: 'Expired', cls: 'bg-amber-50 text-amber-600 border-amber-100' }
  return { label: 'Active', cls: 'bg-green-50 text-green-600 border-green-100' }
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

// ─── Main Page ────────────────────────────────────────────────────

export default function FestivalBackgroundsPage() {
  const [backgrounds, setBackgrounds] = useState<FestivalBackground[] | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FestivalBackground | null>(null)
  const [previewBg, setPreviewBg] = useState<FestivalBackground | null>(null)
  const [filterOccasion, setFilterOccasion] = useState('')

  const load = async () => {
    try {
      const params = new URLSearchParams()
      if (filterOccasion) params.set('occasion', filterOccasion)

      const [bgRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/v1/admin/festival-backgrounds?${params}`, adminGetOptions()),
        fetch(`${API_URL}/v1/admin/festival-backgrounds/stats`, adminGetOptions()),
      ])

      if (!bgRes.ok) throw new Error(`Failed to load backgrounds (${bgRes.status})`)
      const bgJson = await bgRes.json()
      setBackgrounds(bgJson.data ?? [])

      if (statsRes.ok) {
        const sJson = await statsRes.json()
        setStats(sJson.data ?? null)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => { load() }, [filterOccasion])

  const handleToggle = async (bg: FestivalBackground) => {
    try {
      const res = await fetch(
        `${API_URL}/v1/admin/festival-backgrounds/${bg.id}/toggle`,
        { method: 'PUT', ...adminMutateOptions() }
      )
      if (!res.ok) throw new Error('Toggle failed')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Toggle failed')
    }
  }

  const handleDelete = async (bg: FestivalBackground) => {
    if (!confirm(`Delete "${bg.name}"? This cannot be undone.`)) return
    try {
      const res = await fetch(
        `${API_URL}/v1/admin/festival-backgrounds/${bg.id}`,
        { method: 'DELETE', ...adminMutateOptions() }
      )
      if (!res.ok) throw new Error('Delete failed')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const handleSave = async (formData: Record<string, unknown>) => {
    try {
      const url = editing
        ? `${API_URL}/v1/admin/festival-backgrounds/${editing.id}`
        : `${API_URL}/v1/admin/festival-backgrounds`
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...adminMutateOptions(),
        body: JSON.stringify(formData),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Save failed' }))
        throw new Error(err.error ?? 'Save failed')
      }
      setFormOpen(false)
      setEditing(null)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Sparkles className="text-amber-500" size={28} />
              Festival Background Library
            </h1>
            <p className="text-sm text-gray-500 mt-1">Manage seasonal backgrounds for AI Studio Shoots</p>
          </div>
          <button
            onClick={() => { setEditing(null); setFormOpen(true) }}
            className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600 transition-colors"
          >
            <Plus size={18} /> Add Background
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {/* Stats */}
        {stats && (
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard icon={ImageIcon} label="Total Backgrounds" value={stats.total} color="bg-amber-50 text-amber-600" />
            <StatCard icon={Eye} label="Active" value={stats.active} color="bg-green-50 text-green-600" />
            <StatCard icon={EyeOff} label="Inactive" value={stats.inactive} color="bg-gray-50 text-gray-500" />
            <StatCard icon={BarChart3} label="Occasions" value={stats.by_occasion.length} color="bg-purple-50 text-purple-600" />
          </motion.div>
        )}

        {/* Occasion filter */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setFilterOccasion('')}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              !filterOccasion ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
            }`}
          >
            All
          </button>
          {OCCASIONS.map((occ) => (
            <button
              key={occ}
              onClick={() => setFilterOccasion(occ)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                filterOccasion === occ ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
              }`}
            >
              {occ}
            </button>
          ))}
        </div>

        {/* Backgrounds grid */}
        {!backgrounds ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : backgrounds.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <ImageIcon size={48} className="mx-auto mb-3 opacity-30" />
            <p>No festival backgrounds yet. Add your first one!</p>
          </div>
        ) : (
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {backgrounds.map((bg) => {
              const badge = statusBadge(bg)
              return (
                <motion.div key={bg.id} variants={itemVariants} className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  {/* Image preview */}
                  <div className="relative h-48 bg-gray-100">
                    <img
                      src={bg.thumbnail_url ?? bg.image_url}
                      alt={bg.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-medium border ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <button
                      onClick={() => setPreviewBg(bg)}
                      className="absolute bottom-2 right-2 bg-black/50 text-white p-1.5 rounded-lg hover:bg-black/70 transition-colors"
                    >
                      <Eye size={16} />
                    </button>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-gray-900 text-sm">{bg.name}</h3>
                        <p className="text-xs text-gray-400">{bg.retailer.shop_name} · {bg.retailer.city}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-600 border border-purple-100">
                        {bg.occasion}
                      </span>
                    </div>

                    {bg.description && <p className="text-xs text-gray-500 mb-2 line-clamp-2">{bg.description}</p>}

                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                      {bg.season && <span>Season: {bg.season}</span>}
                      {bg.region && <span>· {bg.region}</span>}
                      {bg.valid_from && <span>· {fmtDate(bg.valid_from)} – {fmtDate(bg.valid_to)}</span>}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">Used {bg.usage_count}×</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggle(bg)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400"
                          title={bg.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {bg.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <button
                          onClick={() => { setEditing(bg); setFormOpen(true) }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(bg)}
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-red-400"
                        >
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
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Most Used Backgrounds</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {stats.top_used.map((bg, i) => (
                <div key={bg.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3">
                  <span className="text-lg font-bold text-amber-500">#{i + 1}</span>
                  <img src={bg.image_url} alt={bg.name} className="w-12 h-12 rounded-lg object-cover" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{bg.name}</p>
                    <p className="text-xs text-gray-400">{bg.usage_count}× · {bg.occasion}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create/Edit Modal */}
        <AnimatePresence>
          {formOpen && (
            <BackgroundForm
              editing={editing}
              onSave={handleSave}
              onClose={() => { setFormOpen(false); setEditing(null) }}
            />
          )}
        </AnimatePresence>

        {/* Preview Modal */}
        <AnimatePresence>
          {previewBg && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
              onClick={() => setPreviewBg(null)}
            >
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                className="bg-white rounded-2xl overflow-hidden max-w-2xl w-full"
                onClick={(e) => e.stopPropagation()}
              >
                <img src={previewBg.image_url} alt={previewBg.name} className="w-full max-h-[60vh] object-contain bg-gray-100" />
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900">{previewBg.name}</h3>
                  <p className="text-sm text-gray-500">{previewBg.occasion} · {previewBg.retailer.shop_name} · Used {previewBg.usage_count}×</p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Create/Edit Form Modal ───────────────────────────────────────

function BackgroundForm({
  editing,
  onSave,
  onClose,
}: {
  editing: FestivalBackground | null
  onSave: (data: Record<string, unknown>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    retailer_id: editing?.retailer_id ?? '',
    name: editing?.name ?? '',
    description: editing?.description ?? '',
    image_url: editing?.image_url ?? '',
    occasion: editing?.occasion ?? 'Diwali',
    season: editing?.season ?? '',
    region: editing?.region ?? 'all',
    is_active: editing?.is_active ?? true,
    valid_from: editing?.valid_from?.slice(0, 10) ?? '',
    valid_to: editing?.valid_to?.slice(0, 10) ?? '',
    priority: editing?.priority ?? 0,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      ...form,
      valid_from: form.valid_from || undefined,
      valid_to: form.valid_to || undefined,
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">
            {editing ? 'Edit Background' : 'Add Festival Background'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!editing && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Retailer ID *</label>
              <input
                type="text"
                required
                value={form.retailer_id}
                onChange={(e) => setForm({ ...form, retailer_id: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="clx..."
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="e.g. Diwali Gold Sparkle"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Image URL *</label>
            <input
              type="url"
              required
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Occasion *</label>
              <select
                value={form.occasion}
                onChange={(e) => setForm({ ...form, occasion: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {OCCASIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Season</label>
              <select
                value={form.season}
                onChange={(e) => setForm({ ...form, season: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
              <select
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valid From</label>
              <input
                type="date"
                value={form.valid_from}
                onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valid To</label>
              <input
                type="date"
                value={form.valid_to}
                onChange={(e) => setForm({ ...form, valid_to: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Active (visible to retailers)</span>
          </label>

          <div className="flex gap-3 pt-2">
            <button type="submit" className="flex-1 bg-amber-500 text-white py-2 rounded-lg hover:bg-amber-600 transition-colors font-medium">
              {editing ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
