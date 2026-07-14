'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
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

export default function RetailerDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [retailer, setRetailer] = useState<RetailerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [extendDays, setExtendDays] = useState(14)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_URL}/v1/admin/retailers/${id}`, {
          headers: getHeaders(),
        })
        if (!res.ok) throw new Error('Retailer not found')
        const json = await res.json()
        setRetailer(json.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const extendTrial = async () => {
    if (!retailer) return
    setActionMsg('')
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
    }
  }

  const changePlan = async (plan: string) => {
    if (!retailer) return
    setActionMsg('')
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
      setActionMsg(`Plan changed to ${plan}`)
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Action failed')
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-64 bg-gray-200 rounded-2xl" />
          <div className="h-64 bg-gray-200 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (error || !retailer) {
    return (
      <div className="text-center py-16">
        <Store size={40} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500 text-sm">{error || 'Retailer not found'}</p>
        <Link href="/admin/retailers" className="text-cyan-600 text-sm mt-2 inline-block hover:underline">
          Back to retailers
        </Link>
      </div>
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
    <div className="space-y-6 max-w-5xl">
      {/* Back button + header */}
      <div className="flex items-center justify-between">
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
      </div>

      {/* Action feedback */}
      {actionMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3">
          {actionMsg}
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — Profile + Stats */}
        <div className="lg:col-span-2 space-y-6">
          {/* Profile card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
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

          {/* Usage stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniStat icon={Package} label="Products" value={retailer.product_count} max={retailer.max_products} />
            <MiniStat icon={Users} label="Customers" value={retailer.customer_count} max={retailer.max_customers} />
            <MiniStat icon={Share2} label="Collections" value={retailer.collection_count} />
            <MiniStat icon={UserCheck} label="Staff" value={retailer.staff_count} max={retailer.max_staff_seats} />
            <MiniStat icon={Shirt} label="Try-Ons (month)" value={retailer.try_on.this_month.count} />
            <MiniStat icon={DollarSign} label="GPU Cost" value={`$${retailer.try_on.total.cost_usd.toFixed(2)}`} />
            <MiniStat icon={Shield} label="Try-On Credits" value={retailer.try_on_credits} />
            <MiniStat icon={Clock} label="Trial Ends" value={trialEnd ? trialEnd.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'} />
          </div>

          {/* Recent products */}
          {retailer.recent_products.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Recent Products</h2>
              <div className="space-y-2">
                {retailer.recent_products.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-gray-300" />
                      <div>
                        <span className="text-sm text-gray-700">{p.name || 'Untitled'}</span>
                        <span className="text-xs text-gray-400 ml-2">
                          {p.category || '—'} {p.primary_color ? `· ${p.primary_color}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span>{p._count.photos} photo{p._count.photos !== 1 ? 's' : ''}</span>
                      <span>{p.price_min ? `₹${(p.price_min / 100).toLocaleString('en-IN')}` : '—'}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                        p.status === 'AVAILABLE' ? 'bg-green-50 text-green-600' :
                        p.status === 'SOLD' ? 'bg-red-50 text-red-600' :
                        'bg-gray-50 text-gray-500'
                      }`}>
                        {p.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column — Subscription + Actions */}
        <div className="space-y-6">
          {/* Subscription card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <IndianRupee size={16} className="text-gray-400" /> Subscription
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Plan</span>
                <span className="font-medium text-gray-900">{retailer.plan}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(retailer.plan_status)}`}>
                  {retailer.plan_status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Trial ends</span>
                <span className={`font-medium ${isExpiring ? 'text-red-600' : 'text-gray-900'}`}>
                  {trialEnd ? trialEnd.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <span className="text-gray-900">
                  {new Date(retailer.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>

            <hr className="my-4 border-gray-100" />

            {/* Extend trial */}
            <div className="space-y-3">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Extend Trial</label>
              <div className="flex gap-2">
                <select
                  value={extendDays}
                  onChange={(e) => setExtendDays(Number(e.target.value))}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </select>
                <button
                  onClick={extendTrial}
                  className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all active:scale-[0.98]"
                >
                  Extend
                </button>
              </div>
            </div>

            <hr className="my-4 border-gray-100" />

            {/* Change plan */}
            <div className="space-y-3">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Change Plan</label>
              <div className="flex flex-col gap-2">
                {['STARTER', 'GROWTH', 'PRO'].map((plan) => (
                  <button
                    key={plan}
                    onClick={() => changePlan(plan)}
                    disabled={retailer.plan === plan}
                    className={`text-left px-3 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      retailer.plan === plan
                        ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    {plan === 'STARTER' ? '₹999 Starter' : plan === 'GROWTH' ? '₹2,499 Growth' : '₹4,999 Pro'}
                    {retailer.plan === plan && <span className="ml-2 text-xs">(current)</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Limits card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BadgeCheck size={16} className="text-gray-400" /> Plan Limits
            </h2>
            <div className="space-y-3 text-sm">
              <LimitRow label="Max Products" current={retailer.product_count} max={retailer.max_products} />
              <LimitRow label="Max Customers" current={retailer.customer_count} max={retailer.max_customers} />
              <LimitRow label="Staff Seats" current={retailer.staff_count} max={retailer.max_staff_seats} />
              <LimitRow label="Try-On Credits" current={retailer.try_on_credits} max={1000} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────

function ProfileField({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div>
      <span className="text-xs text-gray-400 flex items-center gap-1">
        {Icon && <Icon size={12} />}
        {label}
      </span>
      <span className="text-gray-900 font-medium">{value}</span>
    </div>
  )
}

function MiniStat({ icon: Icon, label, value, max }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string | number; max?: number }) {
  const pct = max && typeof value === 'number' ? Math.min(Math.round((value / max) * 100), 100) : null
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={14} className="text-gray-400" />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="text-lg font-bold text-gray-900">{value.toLocaleString?.('en-IN') ?? value}</div>
      {pct !== null && (
        <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${pct > 80 ? 'bg-amber-500' : pct > 50 ? 'bg-cyan-500' : 'bg-green-500'}`}
            style={{ width: `${Math.max(pct, 3)}%` }}
          />
        </div>
      )}
    </div>
  )
}

function LimitRow({ label, current, max }: { label: string; current: number; max: number }) {
  const pct = max > 0 ? Math.min(Math.round((current / max) * 100), 100) : 0
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-700 font-medium">{current}/{max === 999999 ? '∞' : max.toLocaleString('en-IN')}</span>
      </div>
      {max < 999999 && (
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${pct > 80 ? 'bg-amber-500' : pct > 50 ? 'bg-cyan-500' : 'bg-green-500'}`}
            style={{ width: `${Math.max(pct, 2)}%` }}
          />
        </div>
      )}
    </div>
  )
}
