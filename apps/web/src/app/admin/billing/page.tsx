'use client'

import { useState, useEffect } from 'react'
import { IndianRupee, CreditCard, TrendingUp, Users, Activity, DollarSign } from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type Stats = {
  total_retailers: number
  active_subscriptions: number
  trial_retailers: number
  total_products: number
  total_collections: number
  views_this_month: number
  enquiries_this_month: number
}

type Usage = {
  total_retailers: number
  trial_retailers: number
  active_subscriptions: number
  mrr_inr: number
  try_on_this_month: number
  try_on_cost_usd: number
}

function getHeaders() {
  const key = sessionStorage.getItem('admin_key')
  return { 'x-admin-key': key ?? '' }
}

export default function BillingPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [setupStatus, setSetupStatus] = useState('')

  useEffect(() => {
    async function load() {
      const headers = getHeaders()
      const [s, u] = await Promise.all([
        fetch(`${API_URL}/v1/admin/stats`, { headers }).then((r) => r.json()),
        fetch(`${API_URL}/v1/admin/usage`, { headers }).then((r) => r.json()),
      ])
      setStats(s.data)
      setUsage(u.data)
    }
    load()
  }, [])

  const setupRazorpayPlans = async () => {
    setSetupStatus('Creating plans...')
    try {
      const res = await fetch(`${API_URL}/v1/admin/billing/setup-plans`, {
        method: 'POST',
        headers: getHeaders(),
      })
      if (!res.ok) throw new Error('Setup failed')
      const json = await res.json()
      setSetupStatus(`✅ Created ${json.data.created}/6 Razorpay plans. Check server logs for plan IDs.`)
    } catch (err) {
      setSetupStatus(`❌ ${err instanceof Error ? err.message : 'Setup failed'}`)
    }
  }

  const conversionRate = stats && stats.total_retailers > 0
    ? ((stats.active_subscriptions / stats.total_retailers) * 100).toFixed(1)
    : '0'

  const trialConversion = usage && usage.trial_retailers > 0
    ? ((usage.active_subscriptions / (usage.active_subscriptions + usage.trial_retailers)) * 100).toFixed(1)
    : '—'

  const avgRevenue = stats && stats.active_subscriptions > 0
    ? (usage?.mrr_inr ?? 0) / stats.active_subscriptions
    : 0

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <p className="text-sm text-gray-500 mt-1">Revenue, subscriptions, and billing configuration</p>
      </div>

      {/* Revenue metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <IndianRupee size={16} className="text-green-500" />
            <span className="text-xs text-gray-500 uppercase tracking-wider">MRR</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {usage ? `₹${(usage.mrr_inr / 100).toLocaleString('en-IN')}` : '—'}
          </div>
          <div className="text-xs text-gray-400 mt-1">Monthly recurring revenue</div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Users size={16} className="text-blue-500" />
            <span className="text-xs text-gray-500 uppercase tracking-wider">Subscribers</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {stats?.active_subscriptions.toLocaleString('en-IN') ?? '—'}
          </div>
          <div className="text-xs text-gray-400 mt-1">Active paid subscriptions</div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-amber-500" />
            <span className="text-xs text-gray-500 uppercase tracking-wider">Conversion</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{conversionRate}%</div>
          <div className="text-xs text-gray-400 mt-1">Trial → paid conversion</div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={16} className="text-purple-500" />
            <span className="text-xs text-gray-500 uppercase tracking-wider">ARPU</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {stats?.active_subscriptions ? `₹${(avgRevenue / 100).toLocaleString('en-IN')}` : '—'}
          </div>
          <div className="text-xs text-gray-400 mt-1">Avg revenue per user/mo</div>
        </div>
      </div>

      {/* Cost analysis */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Cost Analysis</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between py-2 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <DollarSign size={16} className="text-gray-400" />
              <span className="text-sm text-gray-600">GPU cost (this month)</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">${usage?.try_on_cost_usd.toFixed(2) ?? '0.00'}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-gray-400" />
              <span className="text-sm text-gray-600">Try-ons processed (month)</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">{usage?.try_on_this_month.toLocaleString('en-IN') ?? '0'}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <IndianRupee size={16} className="text-gray-400" />
              <span className="text-sm text-gray-600">Avg cost per try-on</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">
              {usage && usage.try_on_this_month > 0
                ? `₹${((usage.try_on_cost_usd * 83) / usage.try_on_this_month).toFixed(2)}`
                : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Razorpay setup */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Razorpay Plans</h2>
        <p className="text-xs text-gray-500 mb-4">
          Create the 6 Razorpay billing plans (3 tiers × monthly/annual) if not already set up.
          Run this once after configuring RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.
        </p>

        <button
          onClick={setupRazorpayPlans}
          className="bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all active:scale-[0.98]"
        >
          Create Razorpay Plans
        </button>

        {setupStatus && (
          <div className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200 font-mono text-xs">
            {setupStatus}
          </div>
        )}
      </div>

      {/* Pricing reference */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Pricing Reference</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Plan</th>
                <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Monthly</th>
                <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Annual</th>
                <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Products</th>
                <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Try-Ons</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50">
                <td className="px-3 py-3 font-medium text-gray-900">Starter</td>
                <td className="px-3 py-3 text-right text-gray-600">₹999/mo</td>
                <td className="px-3 py-3 text-right text-gray-600">₹9,999/yr</td>
                <td className="px-3 py-3 text-right text-gray-600">500</td>
                <td className="px-3 py-3 text-right text-gray-600">0</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="px-3 py-3 font-medium text-gray-900">Growth</td>
                <td className="px-3 py-3 text-right text-gray-600">₹2,499/mo</td>
                <td className="px-3 py-3 text-right text-gray-600">₹24,999/yr</td>
                <td className="px-3 py-3 text-right text-gray-600">2,000</td>
                <td className="px-3 py-3 text-right text-gray-600">100</td>
              </tr>
              <tr>
                <td className="px-3 py-3 font-medium text-gray-900">Pro</td>
                <td className="px-3 py-3 text-right text-gray-600">₹4,999/mo</td>
                <td className="px-3 py-3 text-right text-gray-600">₹49,999/yr</td>
                <td className="px-3 py-3 text-right text-gray-600">∞</td>
                <td className="px-3 py-3 text-right text-gray-600">500</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
