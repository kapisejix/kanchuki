'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Store,
  ArrowLeft,
  Package,
  Users,
  Share2,
  Shirt,
  DollarSign,
  Calendar,
  Phone,
  MapPin,
  BadgeCheck,
  Clock,
  ChevronRight,
  Shield,
  UserCheck,
  IndianRupee,
  Sparkles,
  Sliders,
  Plus,
  X,
  Loader2,
} from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type RetailerDetail = {
  id: string
  shop_name: string
  owner_name: string | null
  phone: string
  city: string
  state: string | null
  gstin: string | null
  plan: string
  plan_status: string
  trial_ends_at: string | null
  plan_expires_at: string | null
  onboarding_completed: boolean
  onboarding_step: number
  created_at: string
  updated_at: string
  max_products: number
  max_customers: number
  try_on_credits: number
  max_staff_seats: number
  product_count: number
  customer_count: number
  collection_count: number
  staff_count: number
  try_on: {
    this_month: { count: number; cost_usd: number }
    total: { count: number; cost_usd: number }
  }
  recent_products: Array<{
    id: string
    name: string | null
    category: string | null
    primary_color: string | null
    price_min: number | null
    status: string
    created_at: string
    _count: { photos: number }
  }>
}

function getHeaders() {
  const key = sessionStorage.getItem('admin_key')
  return { 'x-admin-key': key ?? '' }
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 200, damping: 20 } },
}

export default function RetailerDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [retailer, setRetailer] = useState<RetailerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [extendDays, setExtendDays] = useState(14)
  const [actionLoading, setActionLoading] = useState(false)
  // F-010: override state
  const [overrides, setOverrides] = useState<Array<{ id: string; resource_type: string; limit_per_period: number; period: string; reason: string | null }>>([])
  const [overridesLoading, setOverridesLoading] = useState(true)
  const [showOverrideForm, setShowOverrideForm] = useState(false)
  const [overrideForm, setOverrideForm] = useState({ resource_type: 'PRODUCT_UPLOAD', limit_per_period: '', period: 'MONTH', reason: '' })
  const [overrideSaving, setOverrideSaving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [retailerRes, overridesRes] = await Promise.all([
          fetch(`${API_URL}/v1/admin/retailers/${id}`, { headers: getHeaders() }),
          fetch(`${API_URL}/v1/admin/retailers/${id}/overrides`, { headers: getHeaders() }),
        ])
        if (!retailerRes.ok) throw new Error('Retailer not found')
        const retailerJson = await retailerRes.json()
        setRetailer(retailerJson.data)
        if (overridesRes.ok) {
          const overridesJson = await overridesRes.json()
          setOverrides(overridesJson.data ?? [])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
        setOverridesLoading(false)
      }
    }
    load()
  }, [id])

  const extendTrial = async () => {
    if (!retailer) return
    setActionMsg('')
    setActionLoading(true)
    try {
      const res = await fetch(`${API_URL}/v1/admin/retailers/${retailer.id}/extend-trial`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: extendDays }),
      })
      if (!res.ok) throw new Error('Failed to extend trial')
      const json = await res.json()
      setRetailer((prev) =>
        prev ? { ...prev, trial_ends_at: json.data.trial_ends_at, plan_status: 'TRIAL' } : prev
      )
      setActionMsg(`Trial extended by ${extendDays} days`)
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActionLoading(false)
    }
  }

  // F-010: override CRUD handlers
  const saveOverride = async () => {
    setOverrideSaving(true)
    setActionMsg('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/retailers/${id}/overrides`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_type: overrideForm.resource_type,
          limit_per_period: Number(overrideForm.limit_per_period),
          period: overrideForm.period,
          reason: overrideForm.reason || undefined,
        }),
      })
      if (!res.ok) throw new Error('Failed to save override')
      const json = await res.json()
      setOverrides((prev) => {
        const others = prev.filter((o) => o.resource_type !== json.data.resource_type)
        return [...others, json.data]
      })
      setShowOverrideForm(false)
      setOverrideForm({ resource_type: 'PRODUCT_UPLOAD', limit_per_period: '', period: 'MONTH', reason: '' })
      setActionMsg('Override saved')
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setOverrideSaving(false)
    }
  }

  const deleteOverride = async (overrideId: string) => {
    setActionMsg('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/retailers/${id}/overrides/${overrideId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      if (!res.ok) throw new Error('Failed to delete override')
      setOverrides((prev) => prev.filter((o) => o.id !== overrideId))
      setActionMsg('Override removed — retailer falls back to plan default')
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const changePlan = async (plan: string) => {
    if (!retailer) return
    setActionMsg('')
    setActionLoading(true)
    try {
      const res = await fetch(`${API_URL}/v1/admin/retailers/${retailer.id}/change-plan`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, status: plan === retailer.plan ? retailer.plan_status : 'ACTIVE' }),
      })
      if (!res.ok) throw new Error('Failed to change plan')
      const json = await res.json()
      setRetailer((prev) =>
        prev ? { ...prev, plan: json.data.plan, plan_status: json.data.plan_status } : prev
      )
      setActionMsg(`Plan changed to ${plan === 'STARTER' ? '₹999 Starter' : plan === 'GROWTH' ? '₹2,499 Growth' : '₹4,999 Pro'}`)
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200/60 rounded w-48 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-72 bg-gray-200/60 rounded-2xl animate-pulse" />
          <div className="h-72 bg-gray-200/60 rounded-2xl animate-pulse" />
        </div>
      </div>
    )
  }

  if (error || !retailer) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-16">
        <Store size={48} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500 text-sm">{error || 'Retailer not found'}</p>
        <Link href="/admin/retailers" className="text-cyan-600 text-sm mt-3 inline-block hover:underline font-medium">
          ← Back to retailers
        </Link>
      </motion.div>
    )
  }

  const trialEnd = retailer.trial_ends_at ? new Date(retailer.trial_ends_at) : null
  const isExpiring = trialEnd && trialEnd < new Date(Date.now() + 7 * 86400000) && retailer.plan_status === 'TRIAL'

  const statusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-700'
      case 'TRIAL': return 'bg-amber-100 text-amber-700'
      case 'PAST_DUE': return 'bg-red-100 text-red-700'
      case 'CANCELLED': return 'bg-gray-100 text-gray-500'
      default: return 'bg-gray-100 text-gray-500'
    }
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6 max-w-5xl"
    >
      {/* Back + header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/retailers"
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{retailer.shop_name}</h1>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(retailer.plan_status)}`}>
                {retailer.plan_status}
              </span>
              {isExpiring && (
                <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Expiring soon</span>
              )}
            </div>
            <p className="text-sm text-gray-500">{retailer.city}{retailer.state ? `, ${retailer.state}` : ''}</p>
          </div>
        </div>
      </motion.div>

      {/* Action feedback */}
      <AnimatePresence>
        {actionMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="bg-green-50/80 backdrop-blur border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2"
          >
            <BadgeCheck size={16} />
            {actionMsg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <motion.div variants={itemVariants} className="lg:col-span-2 space-y-6">
          {/* Profile card */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 hover:shadow-lg transition-shadow">
            <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Store size={16} className="text-gray-400" /> Profile
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <ProfileField label="Shop Name" value={retailer.shop_name} />
              <ProfileField label="Owner" value={retailer.owner_name || '—'} />
              <ProfileField label="Phone" value={retailer.phone} icon={Phone} />
              <ProfileField label="GSTIN" value={retailer.gstin || '—'} />
              <ProfileField label="City" value={retailer.city} icon={MapPin} />
              <ProfileField label="State" value={retailer.state || '—'} />
              <ProfileField label="Onboarding" value={retailer.onboarding_completed ? '✅ Completed' : `Step ${retailer.onboarding_step}`} />
              <ProfileField label="Joined" value={new Date(retailer.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} icon={Calendar} />
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniStat icon={Package} label="Products" value={retailer.product_count} max={retailer.max_products} />
            <MiniStat icon={Users} label="Customers" value={retailer.customer_count} max={retailer.max_customers} />
            <MiniStat icon={Share2} label="Collections" value={retailer.collection_count} />
            <MiniStat icon={UserCheck} label="Staff" value={retailer.staff_count} max={retailer.max_staff_seats} />
            <MiniStat icon={Shirt} label="Try-Ons (mth)" value={retailer.try_on.this_month.count} />
            <MiniStat icon={DollarSign} label="GPU Cost" value={`$${retailer.try_on.total.cost_usd.toFixed(2)}`} />
            <MiniStat icon={Shield} label="Credits" value={retailer.try_on_credits} />
            <MiniStat icon={Clock} label="Trial Ends" value={trialEnd ? trialEnd.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'} />
          </div>

          {/* Recent products */}
          {retailer.recent_products.length > 0 && (
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 hover:shadow-lg transition-shadow">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Recent Products</h2>
              <div className="space-y-1">
                {retailer.recent_products.map((p, i) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-gray-50/80 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500" />
                      <div>
                        <span className="text-sm text-gray-700 font-medium">{p.name || 'Untitled'}</span>
                        <span className="text-xs text-gray-400 ml-2">
                          {p.category || '—'} {p.primary_color ? `· ${p.primary_color}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span>{p._count.photos} photo{p._count.photos !== 1 ? 's' : ''}</span>
                      <span className="font-medium">{p.price_min ? `₹${(p.price_min / 100).toLocaleString('en-IN')}` : '—'}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                        p.status === 'AVAILABLE' ? 'bg-green-50 text-green-600' :
                        p.status === 'SOLD' ? 'bg-red-50 text-red-600' :
                        'bg-gray-50 text-gray-500'
                      }`}>
                        {p.status}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Right column */}
        <motion.div variants={itemVariants} className="space-y-6">
          {/* Subscription card */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 hover:shadow-lg transition-shadow">
            <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <IndianRupee size={16} className="text-gray-400" /> Subscription
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center py-1.5">
                <span className="text-gray-500">Plan</span>
                <span className="font-semibold text-gray-900">{retailer.plan}</span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-gray-500">Status</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(retailer.plan_status)}`}>
                  {retailer.plan_status}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-gray-500">Trial ends</span>
                <span className={`font-medium ${isExpiring ? 'text-red-600' : 'text-gray-900'}`}>
                  {trialEnd ? trialEnd.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-gray-500">Created</span>
                <span className="text-gray-900">
                  {new Date(retailer.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>

            <hr className="my-4 border-gray-100" />

            {/* Extend trial */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Extend Trial</label>
              <div className="flex gap-2">
                <select
                  value={extendDays}
                  onChange={(e) => setExtendDays(Number(e.target.value))}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </select>
                <motion.button
                  onClick={extendTrial}
                  disabled={actionLoading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-60"
                >
                  Extend
                </motion.button>
              </div>
            </div>

            <hr className="my-4 border-gray-100" />

            {/* Change plan */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Change Plan</label>
              <div className="flex flex-col gap-2">
                {(['STARTER', 'GROWTH', 'PRO'] as const).map((plan, i) => (
                  <motion.button
                    key={plan}
                    onClick={() => changePlan(plan)}
                    disabled={retailer.plan === plan || actionLoading}
                    whileHover={retailer.plan !== plan ? { scale: 1.01, x: 2 } : undefined}
                    whileTap={retailer.plan !== plan ? { scale: 0.99 } : undefined}
                    className={`text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      retailer.plan === plan
                        ? 'bg-gradient-to-r from-cyan-50 to-blue-50 text-cyan-700 border border-cyan-200'
                        : 'bg-gray-50/80 text-gray-700 hover:bg-gray-100/80 border border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>
                        {plan === 'STARTER' ? '₹999 Starter' : plan === 'GROWTH' ? '₹2,499 Growth' : '₹4,999 Pro'}
                      </span>
                      {retailer.plan === plan && (
                        <span className="text-[10px] font-medium text-cyan-600 bg-cyan-100/50 px-1.5 py-0.5 rounded-full">
                          Current
                        </span>
                      )}
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>

          {/* Limits card */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 hover:shadow-lg transition-shadow">
            <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BadgeCheck size={16} className="text-gray-400" /> Plan Limits
            </h2>
            <div className="space-y-4 text-sm">
              <LimitRow label="Max Products" current={retailer.product_count} max={retailer.max_products} />
              <LimitRow label="Max Customers" current={retailer.customer_count} max={retailer.max_customers} />
              <LimitRow label="Staff Seats" current={retailer.staff_count} max={retailer.max_staff_seats} />
              <LimitRow label="Try-On Credits" current={retailer.try_on_credits} max={1000} />
            </div>
          </div>

          {/* F-010: Overrides card */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Sliders size={16} className="text-gray-400" /> Overrides
              </h2>
              <motion.button
                onClick={() => setShowOverrideForm(true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-1.5 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-all"
                aria-label="Add override"
              >
                <Plus size={16} />
              </motion.button>
            </div>

            {overridesLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={16} className="animate-spin text-gray-400" />
              </div>
            ) : overrides.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-xs text-gray-400">No overrides. Retailer uses plan defaults.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {overrides.map((o) => (
                  <div key={o.id} className="flex items-center justify-between py-2 px-3 bg-amber-50/50 rounded-xl text-sm">
                    <div className="flex-1">
                      <span className="font-mono text-xs text-gray-700">{o.resource_type}</span>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {o.limit_per_period === -1 ? 'Unlimited' : o.limit_per_period} / {o.period}
                        {o.reason && <span className="ml-1">· {o.reason}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteOverride(o.id)}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                      aria-label={`Remove override for ${o.resource_type}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add override form */}
            {showOverrideForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-4 pt-4 border-t border-gray-100 space-y-3"
              >
                <select
                  value={overrideForm.resource_type}
                  onChange={(e) => setOverrideForm({ ...overrideForm, resource_type: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                >
                  {['PRODUCT_UPLOAD', 'AI_TAGGING_CALL', 'TRY_ON', 'IMAGE_CROP', 'BG_REMOVAL', 'API_REQUEST'].map((rt) => (
                    <option key={rt} value={rt}>{rt}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={overrideForm.limit_per_period}
                    onChange={(e) => setOverrideForm({ ...overrideForm, limit_per_period: e.target.value })}
                    placeholder="Limit (-1 = unlimited)"
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  />
                  <select
                    value={overrideForm.period}
                    onChange={(e) => setOverrideForm({ ...overrideForm, period: e.target.value })}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  >
                    {['DAY', 'MONTH', 'LIFETIME'].map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  value={overrideForm.reason}
                  onChange={(e) => setOverrideForm({ ...overrideForm, reason: e.target.value })}
                  placeholder="Reason (optional)"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowOverrideForm(false); setOverrideForm({ resource_type: 'PRODUCT_UPLOAD', limit_per_period: '', period: 'MONTH', reason: '' }) }}
                    className="flex-1 bg-gray-100 text-gray-600 text-sm font-medium py-2 rounded-xl hover:bg-gray-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveOverride}
                    disabled={overrideSaving || !overrideForm.limit_per_period}
                    className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-semibold py-2 rounded-xl hover:shadow-lg hover:shadow-cyan-500/20 disabled:opacity-60 transition-all"
                  >
                    {overrideSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}

// ── Sub-components ────────────────────────────────────────────────

function ProfileField({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div className="py-1">
      <span className="text-xs text-gray-400 flex items-center gap-1 mb-0.5">
        {Icon && <Icon size={12} />}
        {label}
      </span>
      <span className="text-gray-900 font-medium text-sm">{value}</span>
    </div>
  )
}

function MiniStat({ icon: Icon, label, value, max }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string | number; max?: number }) {
  const pct = max && typeof value === 'number' ? Math.min(Math.round((value / max) * 100), 100) : null
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/80 p-3.5 transition-all hover:shadow-md"
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={13} className="text-gray-400" />
        <span className="text-[10px] text-gray-500">{label}</span>
      </div>
      <div className="text-base font-bold text-gray-900">{typeof value === 'number' ? value.toLocaleString('en-IN') : value}</div>
      {pct !== null && (
        <div className="mt-1.5 h-1.5 bg-gray-100/80 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(pct, 3)}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={`h-full rounded-full ${pct > 80 ? 'bg-amber-500' : pct > 50 ? 'bg-cyan-500' : 'bg-green-500'}`}
          />
        </div>
      )}
    </motion.div>
  )
}

function LimitRow({ label, current, max }: { label: string; current: number; max: number }) {
  const pct = max > 0 ? Math.min(Math.round((current / max) * 100), 100) : 0
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-700 font-medium">{current}/{max === 999999 ? '∞' : max.toLocaleString('en-IN')}</span>
      </div>
      {max < 999999 && (
        <div className="h-1.5 bg-gray-100/80 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(pct, 2)}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={`h-full rounded-full ${pct > 80 ? 'bg-amber-500' : pct > 50 ? 'bg-cyan-500' : 'bg-green-500'}`}
          />
        </div>
      )}
    </div>
  )
}


