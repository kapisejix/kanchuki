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
  AlertTriangle,
  Clock,
  ChevronRight,
  Shield,
  UserCheck,
  IndianRupee,
  Sparkles,
  Star,
  Sliders,
  Plus,
  X,
  Loader2,
  Hash,
  FileText,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type RetailerDetail = {
  id: string
  shop_name: string
  owner_name: string | null
  phone: string
  city: string
  state: string | null
  gstin: string | null
  address_line1: string | null
  address_line2: string | null
  pincode: string | null
  kyc_status: string
  kyc_gst_url: string | null
  kyc_aadhar_front_url: string | null
  kyc_aadhar_back_url: string | null
  kyc_submitted_at: string | null
  kyc_reviewed_at: string | null
  kyc_rejection_reason: string | null
  plan: string
  plan_status: string
  trial_ends_at: string | null
  plan_expires_at: string | null
  onboarding_completed: boolean
  onboarding_step: number
  public_slug: string | null
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
  is_suspended: boolean
  suspended_at: string | null
  suspended_reason: string | null
  is_featured: boolean
  featured_at: string | null
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
  // Whether actionMsg is an error (renders red) vs a success (renders green).
  const [actionErr, setActionErr] = useState(false)
  const [extendDays, setExtendDays] = useState(14)
  const [actionLoading, setActionLoading] = useState(false)
  // F-010: override state
  const [overrides, setOverrides] = useState<Array<{ id: string; resource_type: string; limit_per_period: number; period: string; reason: string | null }>>([])
  const [overridesLoading, setOverridesLoading] = useState(true)
  const [showOverrideForm, setShowOverrideForm] = useState(false)
  const [overrideForm, setOverrideForm] = useState({ resource_type: 'PRODUCT_UPLOAD', limit_per_period: '', period: 'MONTH', reason: '' })
  const [overrideSaving, setOverrideSaving] = useState(false)
  // F-015: suspension state
  const [isSuspended, setIsSuspended] = useState(false)
  const [suspendedReason, setSuspendedReason] = useState('')
  const [showSuspendDialog, setShowSuspendDialog] = useState(false)
  const [suspendReasonInput, setSuspendReasonInput] = useState('')
  // Hard-delete (Super Admin only). Requires typing the shop name to confirm.
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('')
  const isSuperAdmin =
    typeof window !== 'undefined' && sessionStorage.getItem('admin_role') === 'SUPER_ADMIN'
  // Store-directory pin: featured stores sort to the top of /stores
  const [isFeatured, setIsFeatured] = useState(false)
  // Admin-editable ₹/plan pricing (paise, monthly) — never hardcoded here.
  const [planMonthly, setPlanMonthly] = useState<Record<string, number>>({})

  useEffect(() => {
    async function load() {
      try {
        const [retailerRes, overridesRes, pricingRes] = await Promise.all([
          fetch(`${API_URL}/v1/admin/retailers/${id}`, adminGetOptions()),
          fetch(`${API_URL}/v1/admin/retailers/${id}/overrides`, adminGetOptions()),
          fetch(`${API_URL}/v1/admin/plan-pricing`, adminGetOptions()),
        ])
        if (!retailerRes.ok) throw new Error('Retailer not found')
        const retailerJson = await retailerRes.json()
        setRetailer(retailerJson.data)
        setIsSuspended(retailerJson.data.is_suspended ?? false)
        setSuspendedReason(retailerJson.data.suspended_reason ?? '')
        setIsFeatured(retailerJson.data.is_featured ?? false)
        if (pricingRes.ok) {
          const pricingJson = await pricingRes.json()
          setPlanMonthly(
            Object.fromEntries(
              (pricingJson.data ?? []).map((r: { plan: string; monthly_paise: number }) => [
                r.plan,
                r.monthly_paise,
              ]),
            ),
          )
        }
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
    setActionMsg(''); setActionErr(false)
    setActionLoading(true)
    try {
      const res = await fetch(`${API_URL}/v1/admin/retailers/${retailer.id}/extend-trial`, {
        ...(await adminMutateOptions()),
        method: 'POST',
        body: JSON.stringify({ days: extendDays }),
      })
      if (!res.ok) throw new Error('Failed to extend trial')
      const json = await res.json()
      setRetailer((prev) =>
        prev ? { ...prev, trial_ends_at: json.data.trial_ends_at, plan_status: 'TRIAL' } : prev
      )
      setActionMsg(`Trial extended by ${extendDays} days`)
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Action failed'); setActionErr(true)
    } finally {
      setActionLoading(false)
    }
  }

  // F-010: override CRUD handlers
  const saveOverride = async () => {
    setOverrideSaving(true)
    setActionMsg(''); setActionErr(false)
    try {
      const res = await fetch(`${API_URL}/v1/admin/retailers/${id}/overrides`, {
        ...(await adminMutateOptions()),
        method: 'POST',
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
      setActionMsg(err instanceof Error ? err.message : 'Save failed'); setActionErr(true)
    } finally {
      setOverrideSaving(false)
    }
  }

  const deleteOverride = async (overrideId: string) => {
    setActionMsg(''); setActionErr(false)
    try {
      const res = await fetch(`${API_URL}/v1/admin/retailers/${id}/overrides/${overrideId}`, {
        ...(await adminMutateOptions()),
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete override')
      setOverrides((prev) => prev.filter((o) => o.id !== overrideId))
      setActionMsg('Override removed — retailer falls back to plan default')
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Delete failed'); setActionErr(true)
    }
  }

  // "₹2,499 Growth" from the admin-editable price map; name-only until it loads.
  const planLabel = (plan: string): string => {
    const name = plan.charAt(0) + plan.slice(1).toLowerCase()
    const paise = planMonthly[plan]
    return paise != null ? `₹${(paise / 100).toLocaleString('en-IN')} ${name}` : name
  }

  const changePlan = async (plan: string) => {
    if (!retailer) return
    setActionMsg(''); setActionErr(false)
    setActionLoading(true)
    try {
      const res = await fetch(`${API_URL}/v1/admin/retailers/${retailer.id}/change-plan`, {
        ...(await adminMutateOptions()),
        method: 'POST',
        body: JSON.stringify({ plan, status: plan === retailer.plan ? retailer.plan_status : 'ACTIVE' }),
      })
      if (!res.ok) throw new Error('Failed to change plan')
      const json = await res.json()
      setRetailer((prev) =>
        prev ? { ...prev, plan: json.data.plan, plan_status: json.data.plan_status } : prev
      )
      setActionMsg(`Plan changed to ${planLabel(plan)}`)
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Action failed'); setActionErr(true)
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
              {isFeatured && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                  <Star size={10} className="fill-amber-400 text-amber-500" />
                  Featured
                </span>
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
            className={`${
              actionErr
                ? 'bg-red-50/80 border-red-200 text-red-700'
                : 'bg-green-50/80 border-green-200 text-green-700'
            } backdrop-blur border text-sm rounded-xl px-4 py-3 flex items-center gap-2`}
          >
            {actionErr ? <AlertTriangle size={16} /> : <BadgeCheck size={16} />}
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
              <ProfileField label="Retailer ID" value={retailer.id} icon={Hash} />
              <ProfileField label="Shop Name" value={retailer.shop_name} />
              <ProfileField label="Owner" value={retailer.owner_name || '—'} />
              <ProfileField label="Phone" value={retailer.phone} icon={Phone} />
              <ProfileField label="GSTIN" value={retailer.gstin || '—'} />
              <ProfileField
                label="Address"
                value={[retailer.address_line1, retailer.address_line2, retailer.pincode].filter(Boolean).join(', ') || '—'}
                icon={MapPin}
              />
              <ProfileField label="City" value={retailer.city} icon={MapPin} />
              <ProfileField label="State" value={retailer.state || '—'} />
              <ProfileField label="Onboarding" value={retailer.onboarding_completed ? '✅ Completed' : `Step ${retailer.onboarding_step}`} />
              <ProfileField label="Joined" value={new Date(retailer.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} icon={Calendar} />
            </div>
          </div>

          {/* KYC card */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Shield size={16} className="text-gray-400" /> KYC Verification
              </h2>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                retailer.kyc_status === 'VERIFIED' ? 'bg-green-100 text-green-700' :
                retailer.kyc_status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                retailer.kyc_status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                'bg-gray-100 text-gray-500'
              }`}>
                {retailer.kyc_status.replace('_', ' ')}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <KycDocLink label="GST Certificate" url={retailer.kyc_gst_url} />
              <KycDocLink label="Aadhar Front" url={retailer.kyc_aadhar_front_url} />
              <KycDocLink label="Aadhar Back" url={retailer.kyc_aadhar_back_url} />
            </div>
            {retailer.kyc_rejection_reason && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3">
                Rejection reason: {retailer.kyc_rejection_reason}
              </p>
            )}
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
              <div className="flex justify-between items-center py-1.5">
                <span className="text-gray-500">Status</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isSuspended ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                  {isSuspended ? 'Suspended' : 'Active'}
                </span>
              </div>
            </div>

            <hr className="my-4 border-gray-100" />

            {/* F-015: Suspend/Unsuspend */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Account</label>
              {isSuspended ? (
                <motion.button
                  onClick={async () => {
                    setActionMsg(''); setActionErr(false)
                    setActionLoading(true)
                    try {
                      const res = await fetch(`${API_URL}/v1/admin/retailers/${retailer.id}/unsuspend`, {
                        ...(await adminMutateOptions()),
                        method: 'POST',
                      })
                      if (!res.ok) {
                        const j = await res.json().catch(() => null)
                        throw new Error(j?.error?.message ?? 'Failed to unsuspend')
                      }
                      setIsSuspended(false)
                      setSuspendedReason('')
                      setActionMsg('Retailer unsuspended — they can now log in and their collection links are active again')
                    } catch (err) {
                      setActionMsg(err instanceof Error ? err.message : 'Action failed'); setActionErr(true)
                    } finally {
                      setActionLoading(false)
                    }
                  }}
                  disabled={actionLoading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full bg-green-500 hover:bg-green-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all disabled:opacity-60"
                >
                  {actionLoading ? 'Unsuspending...' : '🔓 Unsuspend Account'}
                </motion.button>
              ) : (
                <motion.button
                  onClick={() => { setShowSuspendDialog(true); setSuspendReasonInput('') }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full bg-red-500 hover:bg-red-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all"
                >
                  🚫 Suspend Account
                </motion.button>
              )}
              {suspendedReason && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  Reason: {suspendedReason}
                </p>
              )}

              {/* Hard delete — Super Admin only. Removes the row, phone number
                  and all data; the phone can then register fresh. Irreversible
                  (F-016 vault keeps a snapshot). */}
              {isSuperAdmin && (
                !showDeleteDialog ? (
                  <button
                    onClick={() => { setShowDeleteDialog(true); setDeleteConfirmInput(''); setActionMsg(''); setActionErr(false) }}
                    className="w-full mt-1 border border-red-300 text-red-700 hover:bg-red-50 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all"
                  >
                    🗑️ Delete Store Permanently
                  </button>
                ) : (
                  <div className="border border-red-200 rounded-xl p-3 bg-red-50/60 space-y-2">
                    <p className="text-xs text-red-700 leading-relaxed">
                      Permanently deletes <span className="font-semibold">{retailer.shop_name || 'this store'}</span> —
                      row, phone number and every product, customer, collection and order. Cannot be undone.
                      Type the shop name to confirm.
                    </p>
                    <input
                      value={deleteConfirmInput}
                      onChange={(e) => setDeleteConfirmInput(e.target.value)}
                      placeholder={retailer.shop_name || 'shop name'}
                      className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowDeleteDialog(false); setDeleteConfirmInput('') }}
                        className="flex-1 bg-white border border-gray-200 text-gray-600 text-sm font-semibold py-2 rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={actionLoading || deleteConfirmInput.trim() !== (retailer.shop_name || '').trim()}
                        onClick={async () => {
                          setActionMsg(''); setActionErr(false)
                          setActionLoading(true)
                          try {
                            const res = await fetch(`${API_URL}/v1/admin/retailers`, {
                              ...(await adminMutateOptions()),
                              method: 'DELETE',
                              body: JSON.stringify({ ids: [retailer.id] }),
                            })
                            if (!res.ok) {
                              const j = await res.json().catch(() => null)
                              throw new Error(j?.error?.message ?? 'Failed to delete')
                            }
                            window.location.href = '/admin/retailers'
                          } catch (err) {
                            setActionMsg(err instanceof Error ? err.message : 'Delete failed'); setActionErr(true)
                            setActionLoading(false)
                          }
                        }}
                        className="flex-1 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-40"
                      >
                        {actionLoading ? 'Deleting…' : 'Delete Forever'}
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>

            <hr className="my-4 border-gray-100" />

            {/* Store-directory pin — featured stores sort to the top of
                /stores and the homepage teaser (public-stores.ts orderBy). */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Store Directory</label>
              {isFeatured ? (
                <motion.button
                  onClick={async () => {
                    setActionMsg(''); setActionErr(false)
                    setActionLoading(true)
                    try {
                      const res = await fetch(`${API_URL}/v1/admin/retailers/${retailer.id}/unfeature`, {
                        ...(await adminMutateOptions()),
                        method: 'POST',
                      })
                      if (!res.ok) {
                        const j = await res.json().catch(() => null)
                        throw new Error(j?.error?.message ?? 'Failed to unfeature')
                      }
                      setIsFeatured(false)
                      setActionMsg('Store removed from the featured directory — it returns to normal ordering')
                    } catch (err) {
                      setActionMsg(err instanceof Error ? err.message : 'Action failed'); setActionErr(true)
                    } finally {
                      setActionLoading(false)
                    }
                  }}
                  disabled={actionLoading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full bg-amber-400 hover:bg-amber-300 text-amber-950 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <Star size={14} className="fill-amber-900/20" />
                  {actionLoading ? 'Unpinning...' : '★ Pinned — click to unpin'}
                </motion.button>
              ) : (
                <motion.button
                  onClick={async () => {
                    setActionMsg(''); setActionErr(false)
                    setActionLoading(true)
                    try {
                      const res = await fetch(`${API_URL}/v1/admin/retailers/${retailer.id}/feature`, {
                        ...(await adminMutateOptions()),
                        method: 'POST',
                      })
                      if (!res.ok) {
                        const j = await res.json().catch(() => null)
                        throw new Error(j?.error?.message ?? 'Failed to feature')
                      }
                      setIsFeatured(true)
                      setActionMsg('Store pinned to the top of the public directory and homepage teaser')
                    } catch (err) {
                      setActionMsg(err instanceof Error ? err.message : 'Action failed'); setActionErr(true)
                    } finally {
                      setActionLoading(false)
                    }
                  }}
                  disabled={actionLoading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full bg-gray-50 hover:bg-amber-50 text-gray-700 hover:text-amber-700 border border-gray-200 hover:border-amber-300 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <Star size={14} strokeWidth={1.5} className="text-gray-400" />
                  Pin to store directory
                </motion.button>
              )}
              {!isFeatured && (retailer.public_slug === null || retailer.product_count === 0) ? (
                <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2 leading-relaxed">
                  This store can&apos;t be listed in the directory yet — it needs a public store link
                  (generate the store QR in the retailer app) and at least one product before a pin
                  would be visible.
                </p>
              ) : (
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Pinned stores appear first in the public store directory (/stores) and the homepage teaser.
                </p>
              )}
            </div>

            {/* F-015: Suspend confirmation dialog */}
            {showSuspendDialog && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
                onClick={() => setShowSuspendDialog(false)}
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl border border-gray-200 space-y-4"
                >
                  <h3 className="text-lg font-bold text-gray-900">Suspend Account</h3>
                  <p className="text-sm text-gray-500">
                    This will prevent the retailer from logging in and hide their collection links.
                    This action is reversible.
                  </p>
                  <textarea
                    value={suspendReasonInput}
                    onChange={(e) => setSuspendReasonInput(e.target.value)}
                    placeholder="Reason for suspension (required)"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40 min-h-[80px]"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowSuspendDialog(false)}
                      className="flex-1 bg-gray-100 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-200 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!suspendReasonInput.trim()) return
                        setActionMsg(''); setActionErr(false)
                        setActionLoading(true)
                        try {
                          const res = await fetch(`${API_URL}/v1/admin/retailers/${retailer.id}/suspend`, {
                            ...(await adminMutateOptions()),
                            method: 'POST',
                            body: JSON.stringify({ reason: suspendReasonInput.trim() }),
                          })
                          if (!res.ok) throw new Error('Failed to suspend')
                          setIsSuspended(true)
                          setSuspendedReason(suspendReasonInput.trim())
                          setShowSuspendDialog(false)
                          setActionMsg('Retailer suspended — they can no longer log in and their collection links show as unavailable')
                        } catch (err) {
                          setActionMsg(err instanceof Error ? err.message : 'Action failed'); setActionErr(true)
                        } finally {
                          setActionLoading(false)
                        }
                      }}
                      disabled={actionLoading || !suspendReasonInput.trim()}
                      className="flex-1 bg-red-500 hover:bg-red-400 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50 transition-all"
                    >
                      {actionLoading ? 'Suspending...' : 'Confirm Suspension'}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}

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
                      <span>{planLabel(plan)}</span>
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

function ProfileField({ label, value, icon: Icon }: { label: string; value: string; icon?: LucideIcon }) {
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

function KycDocLink({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-gray-50/80 rounded-xl border border-gray-100">
      <span className="flex items-center gap-1.5 text-gray-600 text-xs">
        <FileText size={13} className="text-gray-400" /> {label}
      </span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-cyan-600 hover:text-cyan-700 text-xs font-medium"
        >
          View <ExternalLink size={12} />
        </a>
      ) : (
        <span className="text-xs text-gray-300">Not submitted</span>
      )}
    </div>
  )
}

function MiniStat({ icon: Icon, label, value, max }: { icon: LucideIcon; label: string; value: string | number; max?: number }) {
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


