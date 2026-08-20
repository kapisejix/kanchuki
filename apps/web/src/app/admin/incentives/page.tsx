'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Gift,
  Plus,
  X,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Users,
  TrendingUp,
  Zap,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

// ─── Types ─────────────────────────────────────────────────────────

type IncentiveRule = {
  id: string
  retailer_id: string
  name: string
  description: string | null
  trigger_type: 'FIRST_VISIT' | 'BIRTHDAY' | 'ANNIVERSARY' | 'LOYALTY_TIER'
  discount_type: 'PERCENT' | 'FIXED_AMOUNT'
  discount_value: number
  conditions: Record<string, number> | null
  active: boolean
  starts_at: string | null
  ends_at: string | null
  created_at: string
  updated_at: string
}

type IncentiveStats = {
  total_rules: number
  active_rules: number
  total_visits: number
  visits_last_30d: number
}

// ─── Helpers ──────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  FIRST_VISIT: 'First Visit',
  BIRTHDAY: 'Birthday',
  ANNIVERSARY: 'Anniversary',
  LOYALTY_TIER: 'Loyalty Tier',
}

const TRIGGER_ICONS: Record<string, string> = {
  FIRST_VISIT: '👋',
  BIRTHDAY: '🎂',
  ANNIVERSARY: '💍',
  LOYALTY_TIER: '⭐',
}

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

const fmtDiscount = (rule: IncentiveRule) =>
  rule.discount_type === 'PERCENT' ? `${rule.discount_value}% off` : `₹${(rule.discount_value / 100).toFixed(0)} off`

const fmtPaise = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 220, damping: 24 } },
}

// ─── Main Page ────────────────────────────────────────────────────

export default function IncentivesPage() {
  const [rules, setRules] = useState<IncentiveRule[] | null>(null)
  const [stats, setStats] = useState<IncentiveStats | null>(null)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<IncentiveRule | null>(null)

  const load = async () => {
    try {
      const [rulesRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/v1/admin/incentives/rules`, adminGetOptions()),
        fetch(`${API_URL}/v1/admin/incentives/stats`, adminGetOptions()),
      ])
      const rulesJson = await rulesRes.json()
      const statsJson = await statsRes.json()
      if (rulesJson?.data) setRules(rulesJson.data)
      if (statsJson?.data) setStats(statsJson.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load incentive data')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const toggleActive = async (rule: IncentiveRule) => {
    try {
      const res = await fetch(`${API_URL}/v1/admin/incentives/rules/${rule.id}`, {
        ...(await adminMutateOptions()),
        method: 'PUT',
        body: JSON.stringify({ active: !rule.active }),
      })
      if (!res.ok) throw new Error(`Toggle failed (HTTP ${res.status})`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle rule')
    }
  }

  const remove = async (rule: IncentiveRule) => {
    if (!window.confirm(`Delete incentive rule "${rule.name}"?`)) return
    try {
      const res = await fetch(`${API_URL}/v1/admin/incentives/rules/${rule.id}`, {
        ...(await adminMutateOptions()),
        method: 'DELETE',
      })
      if (!res.ok && res.status !== 204) throw new Error(`Delete failed (HTTP ${res.status})`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule')
    }
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">Smart Incentive Engine</h1>
            <Gift size={20} className="text-purple-500" />
          </div>
          <p className="text-sm text-gray-500 max-w-2xl">
            Configure automated incentives — first-visit discounts, birthday offers,
            loyalty rewards. Rules are evaluated in real-time when customers interact
            with the store.
          </p>
        </div>
        <motion.button
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-purple-500/25 flex items-center gap-2 shrink-0"
        >
          <Plus size={16} />
          Add Rule
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

      {/* Stats cards */}
      {stats && (
        <motion.div variants={containerVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard icon={Target} label="Total Rules" value={String(stats.total_rules)} color="purple" />
          <StatsCard icon={Zap} label="Active Rules" value={String(stats.active_rules)} color="green" />
          <StatsCard icon={Users} label="Total Visits" value={String(stats.total_visits)} color="blue" />
          <StatsCard icon={TrendingUp} label="Visits (30d)" value={String(stats.visits_last_30d)} color="amber" />
        </motion.div>
      )}

      {/* Rules table */}
      <motion.div
        variants={itemVariants}
        className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden"
      >
        {!rules ? (
          <div className="p-12 text-center text-sm text-gray-400 animate-pulse">Loading…</div>
        ) : rules.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-3">
              <Gift size={22} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-600">No incentive rules yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Create the first rule to start rewarding customers automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">Rule</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Trigger</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Discount</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Valid Period</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule, i) => (
                  <motion.tr
                    key={rule.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="border-b border-gray-50 hover:bg-purple-50/40 transition-colors"
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0 text-base">
                          {TRIGGER_ICONS[rule.trigger_type] ?? '🎁'}
                        </div>
                        <div>
                          <span className="font-semibold text-gray-900">{rule.name}</span>
                          {rule.description && (
                            <p className="text-xs text-gray-400 mt-0.5 max-w-[200px] truncate">{rule.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1.5 text-gray-600 text-xs font-medium bg-gray-100 rounded-full px-2.5 py-1">
                        {TRIGGER_LABELS[rule.trigger_type] ?? rule.trigger_type}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-gray-900">{fmtDiscount(rule)}</td>
                    <td className="px-4 py-3.5 text-gray-500 text-xs">
                      {rule.starts_at || rule.ends_at ? (
                        <span>
                          {fmtDate(rule.starts_at)} — {fmtDate(rule.ends_at)}
                        </span>
                      ) : (
                        <span className="text-gray-400">Always active</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => void toggleActive(rule)}
                        className="flex items-center gap-1.5"
                        aria-label={`Toggle ${rule.name}`}
                      >
                        {rule.active ? (
                          <>
                            <ToggleRight size={20} className="text-green-500" />
                            <span className="text-[10px] font-semibold text-green-600 bg-green-50 border border-green-100 rounded-full px-2 py-0.5">
                              Active
                            </span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft size={20} className="text-gray-300" />
                            <span className="text-[10px] font-semibold text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-2 py-0.5">
                              Inactive
                            </span>
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditing(rule)
                            setFormOpen(true)
                          }}
                          className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          aria-label={`Edit ${rule.name}`}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => void remove(rule)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          aria-label={`Delete ${rule.name}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Add / edit modal */}
      <AnimatePresence>
        {formOpen && (
          <RuleFormModal
            rule={editing}
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
  color: 'purple' | 'green' | 'blue' | 'amber'
}) {
  const colorMap = {
    purple: { bg: 'bg-purple-50 border-purple-100', icon: 'text-purple-500' },
    green: { bg: 'bg-green-50 border-green-100', icon: 'text-green-500' },
    blue: { bg: 'bg-blue-50 border-blue-100', icon: 'text-blue-500' },
    amber: { bg: 'bg-amber-50 border-amber-100', icon: 'text-amber-500' },
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

// ── Add / edit modal ──────────────────────────────────────────────

function RuleFormModal({
  rule,
  onClose,
  onSaved,
}: {
  rule: IncentiveRule | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [name, setName] = useState(rule?.name ?? '')
  const [description, setDescription] = useState(rule?.description ?? '')
  const [triggerType, setTriggerType] = useState<string>(rule?.trigger_type ?? 'FIRST_VISIT')
  const [discountType, setDiscountType] = useState<string>(rule?.discount_type ?? 'PERCENT')
  const [discountValue, setDiscountValue] = useState(String(rule?.discount_value ?? 10))
  const [minSpent, setMinSpent] = useState(String(rule?.conditions?.min_spent ?? ''))
  const [minVisits, setMinVisits] = useState(String(rule?.conditions?.min_visits ?? ''))
  const [startsAt, setStartsAt] = useState(() => (rule?.starts_at ? rule.starts_at.slice(0, 10) : ''))
  const [endsAt, setEndsAt] = useState(() => (rule?.ends_at ? rule.ends_at.slice(0, 10) : ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = name.trim() && discountValue && !saving

  const submit = async () => {
    if (!canSubmit) return
    setSaving(true)
    setError('')
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
        trigger_type: triggerType,
        discount_type: discountType,
        discount_value: parseInt(discountValue) || 0,
      }
      if (triggerType === 'LOYALTY_TIER') {
        const conditions: Record<string, number> = {}
        if (minSpent) conditions.min_spent = parseInt(minSpent) * 100 // ₹ → paise
        if (minVisits) conditions.min_visits = parseInt(minVisits)
        if (Object.keys(conditions).length > 0) payload.conditions = conditions
      }
      if (startsAt) payload.starts_at = `${startsAt}T00:00:00Z`
      if (endsAt) payload.ends_at = `${endsAt}T23:59:59Z`

      const res = await fetch(
        rule ? `${API_URL}/v1/admin/incentives/rules/${rule.id}` : `${API_URL}/v1/admin/incentives/rules`,
        {
          ...(await adminMutateOptions()),
          method: rule ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        },
      )
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message ?? `Failed to save (HTTP ${res.status})`)
      }
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule')
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
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Gift size={17} className="text-purple-500" />
            {rule ? 'Edit Incentive Rule' : 'New Incentive Rule'}
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Rule Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. First Visit Welcome, Diwali Special…"
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-purple-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — shown to the customer"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-purple-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Trigger</label>
              <select
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-white outline-none focus:border-purple-400"
              >
                <option value="FIRST_VISIT">First Visit</option>
                <option value="BIRTHDAY">Birthday</option>
                <option value="ANNIVERSARY">Anniversary</option>
                <option value="LOYALTY_TIER">Loyalty Tier</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Discount Type</label>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-white outline-none focus:border-purple-400"
              >
                <option value="PERCENT">% (Percentage)</option>
                <option value="FIXED_AMOUNT">₹ (Fixed Amount)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              {discountType === 'PERCENT' ? 'Discount (%)' : 'Discount (₹)'}
            </label>
            <input
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
              placeholder={discountType === 'PERCENT' ? '10' : '500'}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-purple-400 tabular-nums"
            />
          </div>

          {triggerType === 'LOYALTY_TIER' && (
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 space-y-3">
              <p className="text-xs font-semibold text-purple-700">Loyalty Conditions</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-purple-600 mb-1 block">Min Spent (₹)</label>
                  <input
                    value={minSpent}
                    onChange={(e) => setMinSpent(e.target.value.replace(/[^\d]/g, ''))}
                    inputMode="numeric"
                    placeholder="5000"
                    className="w-full border border-purple-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-purple-400 bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-purple-600 mb-1 block">Min Visits</label>
                  <input
                    value={minVisits}
                    onChange={(e) => setMinVisits(e.target.value.replace(/[^\d]/g, ''))}
                    inputMode="numeric"
                    placeholder="3"
                    className="w-full border border-purple-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-purple-400 bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Starts (optional)</label>
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-purple-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Ends (optional)</label>
              <input
                type="date"
                value={endsAt}
                min={startsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-purple-400"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl px-3 py-2.5">{error}</div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <motion.button
              onClick={() => void submit()}
              disabled={!canSubmit}
              whileHover={canSubmit ? { scale: 1.02 } : undefined}
              whileTap={canSubmit ? { scale: 0.98 } : undefined}
              className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-xl shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Plus size={16} />
                  {rule ? 'Save Changes' : 'Create Rule'}
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
