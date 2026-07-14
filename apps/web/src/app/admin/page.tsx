'use client'

import { useState, useEffect } from 'react'
import {
  Store,
  Package,
  IndianRupee,
  Users,
  Eye,
  MessageCircle,
  Shirt,
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  Shield,
} from 'lucide-react'
import Link from 'next/link'

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

function getAdminHeaders() {
  const key = sessionStorage.getItem('admin_key')
  return { 'x-admin-key': key ?? '' }
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const headers = getAdminHeaders()
        const [s, u] = await Promise.all([
          fetch(`${API_URL}/v1/admin/stats`, { headers }).then((r) => r.json()),
          fetch(`${API_URL}/v1/admin/usage`, { headers }).then((r) => r.json()),
        ])
        setStats(s.data)
        setUsage(u.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load stats')
      }
    }
    load()
  }, [])

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500 text-sm">{error}</div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Platform overview and key metrics</p>
      </div>

      {/* Primary metric cards */}
      {stats && usage && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              icon={Store}
              label="Total Retailers"
              value={stats.total_retailers}
              subText={`${usage.trial_retailers} on trial`}
              color="blue"
            />
            <MetricCard
              icon={Shield}
              label="Active Subscriptions"
              value={stats.active_subscriptions}
              subText={usage.mrr_inr > 0 ? `₹${(usage.mrr_inr / 100).toLocaleString('en-IN')} MRR` : 'MRR pending'}
              color="green"
            />
            <MetricCard
              icon={Package}
              label="Total Products"
              value={stats.total_products}
              subText="Across all stores"
              color="cyan"
            />
            <MetricCard
              icon={IndianRupee}
              label="Monthly Revenue"
              value={`₹${(usage.mrr_inr / 100).toLocaleString('en-IN')}`}
              subText={usage.active_subscriptions > 0 ? `${usage.active_subscriptions} paying` : 'No active subscriptions'}
              color="amber"
            />
          </div>

          {/* Secondary metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MiniMetricCard
              icon={Eye}
              label="Views (this month)"
              value={stats.views_this_month.toLocaleString('en-IN')}
            />
            <MiniMetricCard
              icon={MessageCircle}
              label="Enquiries (this month)"
              value={stats.enquiries_this_month.toLocaleString('en-IN')}
            />
            <MiniMetricCard
              icon={Shirt}
              label="Try-Ons (this month)"
              value={usage.try_on_this_month.toLocaleString('en-IN')}
            />
            <MiniMetricCard
              icon={DollarSign}
              label="GPU Cost (month)"
              value={`$${usage.try_on_cost_usd.toFixed(2)}`}
            />
          </div>

          {/* Quick actions row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <QuickActionCard
              title="Browse Retailers"
              description={`${stats.total_retailers} retailers on the platform`}
              href="/admin/retailers"
              icon={Store}
              color="cyan"
            />
            <QuickActionCard
              title="Trial Retailers"
              description={`${usage.trial_retailers} retailers in trial — may need follow-up`}
              href="/admin/retailers?filter=trial"
              icon={TrendingUp}
              color="amber"
            />
            <QuickActionCard
              title="Billing Overview"
              description={
                usage.active_subscriptions > 0
                  ? `${usage.active_subscriptions} active subscriptions, ₹${(usage.mrr_inr / 100).toLocaleString('en-IN')} MRR`
                  : 'No subscriptions active yet'
              }
              href="/admin/billing"
              icon={Activity}
              color="purple"
            />
          </div>

          {/* Conversion funnel */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Platform Funnel</h2>
            <div className="space-y-4">
              <FunnelRow
                label="Total Retailers"
                value={stats.total_retailers}
                pct={100}
                color="bg-gray-300"
              />
              <FunnelRow
                label="On Trial"
                value={usage.trial_retailers}
                pct={stats.total_retailers > 0 ? Math.round((usage.trial_retailers / stats.total_retailers) * 100) : 0}
                color="bg-amber-400"
              />
              <FunnelRow
                label="Active Subscriptions"
                value={stats.active_subscriptions}
                pct={stats.total_retailers > 0 ? Math.round((stats.active_subscriptions / stats.total_retailers) * 100) : 0}
                color="bg-green-500"
              />
            </div>
          </div>
        </>
      )}

      {/* Loading skeleton */}
      {!stats && !error && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-20 mb-3" />
              <div className="h-8 bg-gray-200 rounded w-16 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-24" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Components ─────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  label,
  value,
  subText,
  color,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string | number
  subText: string
  color: 'blue' | 'green' | 'cyan' | 'amber' | 'purple'
}) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    cyan: 'bg-cyan-50 text-cyan-600 border-cyan-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${colorMap[color]}`}>
          <Icon size={16} />
        </div>
      </div>
      <div className="text-2xl sm:text-3xl font-bold text-gray-900">
        {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
      </div>
      <div className="text-xs text-gray-400 mt-1">{subText}</div>
    </div>
  )
}

function MiniMetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className="text-gray-400" />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="text-lg font-bold text-gray-900">{value}</div>
    </div>
  )
}

function QuickActionCard({
  title,
  description,
  href,
  icon: Icon,
  color,
}: {
  title: string
  description: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  color: string
}) {
  const colorMap: Record<string, string> = {
    cyan: 'from-cyan-500 to-cyan-600',
    amber: 'from-amber-500 to-amber-600',
    purple: 'from-purple-500 to-purple-600',
  }

  return (
    <Link
      href={href}
      className={`block bg-gradient-to-r ${colorMap[color]} rounded-2xl p-5 text-white hover:shadow-lg transition-all active:scale-[0.99]`}
    >
      <div className="flex items-start justify-between mb-3">
        <Icon size={22} className="text-white/80" />
      </div>
      <h3 className="font-semibold text-sm mb-1">{title}</h3>
      <p className="text-xs text-white/70">{description}</p>
    </Link>
  )
}

function FunnelRow({
  label,
  value,
  pct,
  color,
}: {
  label: string
  value: number
  pct: number
  color: string
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-sm text-gray-600 w-36 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <span className="text-sm font-semibold text-gray-900 w-16 text-right">{value}</span>
      <span className="text-xs text-gray-400 w-10 text-right">{pct}%</span>
    </div>
  )
}
