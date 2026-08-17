'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarDays,
  Plus,
  X,
  Pencil,
  Trash2,
  MapPin,
  type LucideIcon,
} from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

// ─── Types ─────────────────────────────────────────────────────────

type Festival = {
  id: number
  name: string
  region: string
  starts_at: string
  ends_at: string
  created_at: string
}

// Common regions/states for the quick-pick — admins can also type any region.
const REGION_SUGGESTIONS = [
  'PAN_INDIA',
  'TAMIL_NADU',
  'MAHARASHTRA',
  'PUNJAB',
  'KERALA',
  'BENGAL',
  'GUJARAT',
  'RAJASTHAN',
  'UTTAR_PRADESH',
  'ANDHRA_PRADESH',
  'TELANGANA',
  'KARNATAKA',
  'ODISHA',
  'ASSAM',
]

// ─── Helpers ──────────────────────────────────────────────────────

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

function periodBadge(f: Festival): { label: string; cls: string } {
  const now = Date.now()
  const start = new Date(f.starts_at).getTime()
  const end = new Date(f.ends_at).getTime()
  if (now >= start && now <= end) return { label: 'Active now', cls: 'bg-green-50 text-green-600 border-green-100' }
  if (now < start) return { label: 'Upcoming', cls: 'bg-cyan-50 text-cyan-600 border-cyan-100' }
  return { label: 'Past', cls: 'bg-gray-50 text-gray-400 border-gray-100' }
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 220, damping: 24 } },
}

// ─── Main Page ────────────────────────────────────────────────────

export default function FestivalsPage() {
  const [festivals, setFestivals] = useState<Festival[] | null>(null)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Festival | null>(null)

  const load = async () => {
    try {
      const res = await fetch(`${API_URL}/v1/admin/festivals`, adminGetOptions())
      const json = await res.json()
      if (!json?.data) {
        setError('The API returned an error while loading festivals.')
        return
      }
      setFestivals(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load festivals')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const remove = async (f: Festival) => {
    if (!window.confirm(`Delete "${f.name}"? Campaigns already created for it keep their name.`)) return
    try {
      const res = await fetch(`${API_URL}/v1/admin/festivals/${f.id}`, {
        ...(await adminMutateOptions()),
        method: 'DELETE',
      })
      if (!res.ok && res.status !== 204) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message ?? `Delete failed (HTTP ${res.status})`)
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete festival')
    }
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">Festivals</h1>
            <CalendarDays size={20} className="text-cyan-500" />
          </div>
          <p className="text-sm text-gray-500 max-w-2xl">
            The campaign festival calendar — add state-wise / region-wise offers with exact
            start and end dates. Retailers see this read-only when building festival campaigns.
          </p>
        </div>
        <motion.button
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-cyan-500/25 flex items-center gap-2 shrink-0"
        >
          <Plus size={16} />
          Add Festival
        </motion.button>
      </motion.div>

      {error && (
        <motion.div
          variants={itemVariants}
          className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl px-6 py-4"
        >
          {error}
        </motion.div>
      )}

      {/* Festival table */}
      <motion.div
        variants={itemVariants}
        className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden"
      >
        {!festivals ? (
          <div className="p-12 text-center text-sm text-gray-400 animate-pulse">Loading…</div>
        ) : festivals.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-3">
              <CalendarDays size={22} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-600">No festivals yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Add the first festival so retailers can build campaigns around it.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">Festival</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Region</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Starts</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Ends</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {festivals.map((f, i) => {
                  const badge = periodBadge(f)
                  return (
                    <motion.tr
                      key={f.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b border-gray-50 hover:bg-cyan-50/40 transition-colors"
                    >
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center shrink-0">
                            <CalendarDays size={16} className="text-cyan-500" />
                          </div>
                          <span className="font-semibold text-gray-900">{f.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-gray-600">
                          <MapPin size={13} className="text-gray-400" />
                          {f.region.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 tabular-nums">{fmtDate(f.starts_at)}</td>
                      <td className="px-4 py-3.5 text-gray-600 tabular-nums">{fmtDate(f.ends_at)}</td>
                      <td className="px-4 py-3.5">
                        <span className={`text-[10px] font-semibold rounded-full px-2.5 py-1 border ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setEditing(f)
                              setFormOpen(true)
                            }}
                            className="p-2 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors"
                            aria-label={`Edit ${f.name}`}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => void remove(f)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            aria-label={`Delete ${f.name}`}
                          >
                            <Trash2 size={15} />
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

      {/* Add / edit modal */}
      <AnimatePresence>
        {formOpen && (
          <FestivalFormModal
            festival={editing}
            onClose={() => setFormOpen(false)}
            onSaved={async () => {
              setFormOpen(false)
              await load()
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Add / edit modal ──────────────────────────────────────────────

function FestivalFormModal({
  festival,
  onClose,
  onSaved,
}: {
  festival: Festival | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [name, setName] = useState(festival?.name ?? '')
  const [region, setRegion] = useState(festival?.region ?? 'PAN_INDIA')
  const [startsAt, setStartsAt] = useState(() => (festival ? festival.starts_at.slice(0, 10) : ''))
  const [endsAt, setEndsAt] = useState(() => (festival ? festival.ends_at.slice(0, 10) : ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = name.trim() && region.trim() && startsAt && endsAt && !saving

  const submit = async () => {
    if (!canSubmit) return
    if (new Date(endsAt) <= new Date(startsAt)) {
      setError('End date must be after the start date.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: name.trim(),
        region: region.trim().toUpperCase(),
        starts_at: `${startsAt}T00:00:00Z`,
        ends_at: `${endsAt}T23:59:59Z`,
      }
      const res = await fetch(
        festival ? `${API_URL}/v1/admin/festivals/${festival.id}` : `${API_URL}/v1/admin/festivals`,
        {
          ...(await adminMutateOptions()),
          method: festival ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        },
      )
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message ?? `Failed to save (HTTP ${res.status})`)
      }
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save festival')
      setSaving(false)
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
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays size={17} className="text-cyan-500" />
            {festival ? 'Edit Festival' : 'Add Festival'}
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Festival Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Diwali, Pongal, Wedding Season…"
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Region / State
            </label>
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="PAN_INDIA or a state, e.g. TAMIL_NADU"
              list="festival-regions"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-cyan-400"
            />
            <datalist id="festival-regions">
              {REGION_SUGGESTIONS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            <p className="text-[11px] text-gray-400 mt-1">
              {region === 'PAN_INDIA'
                ? 'PAN_INDIA = nationwide offer. Pick a state for a regional festival.'
                : `Regional offer for ${region.replace(/_/g, ' ')}`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                Starts
              </label>
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                Ends
              </label>
              <input
                type="date"
                value={endsAt}
                min={startsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl px-3 py-2.5">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <motion.button
              onClick={() => void submit()}
              disabled={!canSubmit}
              whileHover={canSubmit ? { scale: 1.02 } : undefined}
              whileTap={canSubmit ? { scale: 0.98 } : undefined}
              className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-xl shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Plus size={16} />
                  {festival ? 'Save Changes' : 'Add Festival'}
                </>
              )}
            </motion.button>
            <button
              onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold py-3 rounded-xl"
            >
              Cancel
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
