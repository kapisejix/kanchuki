'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Store,
  Package,
  IndianRupee,
  Users,
  Eye,
  MessageCircle,
  Shirt,
  TrendingUp,
  Activity,
  DollarSign,
  Shield,
  Sparkles,
  ArrowRight,
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

// ─── Animated Counter ──────────────────────────────────────────

function AnimatedCounter({
  value,
  prefix = '',
  suffix = '',
  duration = 1.5,
}: {
  value: number
  prefix?: string
  suffix?: string
  duration?: number
}) {
  const [display, setDisplay] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const counted = useRef(false)
  const frameRef = useRef<number>()

  useEffect(() => {
    if (counted.current) return
    counted.current = true

    const startTime = Date.now()
    const endTime = startTime + duration * 1000

    const tick = () => {
      const now = Date.now()
      const progress = Math.min((now - startTime) / (duration * 1000), 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(eased * value))

      if (now < endTime) {
        frameRef.current = requestAnimationFrame(tick)
      } else {
        setDisplay(value)
      }
    }

    frameRef.current = requestAnimationFrame(tick)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [value, duration])

  return (
    <span ref={ref}>
      {prefix}
      {display.toLocaleString('en-IN')}
      {suffix}
    </span>
  )
}

// ─── Container stagger variants ───────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 200, damping: 20 },
  },
}

// ─── Main Dashboard ───────────────────────────────────────────

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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center h-64"
      >
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl px-6 py-4">
          {error}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Page header */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <motion.div
            animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
          >
            <Sparkles size={20} className="text-cyan-500" />
          </motion.div>
        </div>
        <p className="text-sm text-gray-500">Platform overview and key metrics</p>
      </motion.div>

      {stats && usage && (
        <>
          {/* Primary metric cards */}
          <motion.div
            variants={containerVariants}
            className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          >
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
              subText={
                usage.mrr_inr > 0
                  ? `₹${(usage.mrr_inr / 100).toLocaleString('en-IN')} MRR`
                  : 'MRR pending'
              }
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
              value={usage.mrr_inr / 100}
              subText={
                usage.active_subscriptions > 0
                  ? `${usage.active_subscriptions} paying`
                  : 'No active subscriptions'
              }
              color="amber"
              formatCurrency
            />
          </motion.div>

          {/* Secondary metrics */}
          <motion.div
            variants={containerVariants}
            className="grid grid-cols-2 sm:grid-cols-4 gap-4"
          >
            <MiniMetricCard
              icon={Eye}
              label="Views (this month)"
              value={stats.views_this_month}
            />
            <MiniMetricCard
              icon={MessageCircle}
              label="Enquiries (this month)"
              value={stats.enquiries_this_month}
            />
            <MiniMetricCard
              icon={Shirt}
              label="Try-Ons (this month)"
              value={usage.try_on_this_month}
            />
            <MiniMetricCard
              icon={DollarSign}
              label="GPU Cost (month)"
              value={`$${usage.try_on_cost_usd.toFixed(2)}`}
            />
          </motion.div>

          {/* Quick actions row */}
          <motion.div
            variants={containerVariants}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
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
          </motion.div>

          {/* Conversion funnel */}
          <motion.div variants={itemVariants}>
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 hover:shadow-lg transition-shadow">
              <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Activity size={16} className="text-gray-400" />
                Platform Funnel
              </h2>
              <div className="space-y-4">
                <FunnelRow
                  label="Total Retailers"
                  value={stats.total_retailers}
                  pct={100}
                  color="from-gray-300 to-gray-400"
                />
                <FunnelRow
                  label="On Trial"
                  value={usage.trial_retailers}
                  pct={stats.total_retailers > 0 ? Math.round((usage.trial_retailers / stats.total_retailers) * 100) : 0}
                  color="from-amber-400 to-amber-500"
                />
                <FunnelRow
                  label="Active Subscriptions"
                  value={stats.active_subscriptions}
                  pct={stats.total_retailers > 0 ? Math.round((stats.active_subscriptions / stats.total_retailers) * 100) : 0}
                  color="from-green-400 to-green-500"
                />
              </div>
            </div>
          </motion.div>
        </>
      )}

      {/* Loading skeleton */}
      {!stats && !error && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white/80 rounded-2xl border border-gray-200/80 p-6"
            >
              <div className="h-3 bg-gray-200/80 rounded w-20 mb-3 animate-pulse" />
              <div className="h-8 bg-gray-200/80 rounded w-16 mb-2 animate-pulse" />
              <div className="h-3 bg-gray-200/80 rounded w-24 animate-pulse" />
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ── Components ─────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  label,
  value,
  subText,
  color,
  formatCurrency,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: number
  subText: string
  color: 'blue' | 'green' | 'cyan' | 'amber' | 'purple'
  formatCurrency?: boolean
}) {
  const colorMap = {
    blue: {
      bg: 'bg-blue-50 border-blue-100',
      text: 'text-blue-600',
      icon: 'text-blue-500',
      gradient: 'from-blue-500/20 to-transparent',
    },
    green: {
      bg: 'bg-green-50 border-green-100',
      text: 'text-green-600',
      icon: 'text-green-500',
      gradient: 'from-green-500/20 to-transparent',
    },
    cyan: {
      bg: 'bg-cyan-50 border-cyan-100',
      text: 'text-cyan-600',
      icon: 'text-cyan-500',
      gradient: 'from-cyan-500/20 to-transparent',
    },
    amber: {
      bg: 'bg-amber-50 border-amber-100',
      text: 'text-amber-600',
      icon: 'text-amber-500',
      gradient: 'from-amber-500/20 to-transparent',
    },
    purple: {
      bg: 'bg-purple-50 border-purple-100',
      text: 'text-purple-600',
      icon: 'text-purple-500',
      gradient: 'from-purple-500/20 to-transparent',
    },
  }

  const c = colorMap[color]

  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -4, boxShadow: '0 12px 24px -8px rgba(0,0,0,0.1)' }}
      className="relative bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/80 p-5 transition-all overflow-hidden group"
    >
      {/* Gradient accent */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${c.gradient} opacity-50`}
      />

      <div className="flex items-start justify-between mb-3 relative">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
          {label}
        </span>
        <motion.div
          whileHover={{ scale: 1.1, rotate: 5 }}
          className={`w-9 h-9 rounded-xl flex items-center justify-center border ${c.bg} ${c.icon}`}
        >
          <Icon size={17} />
        </motion.div>
      </div>
      <div className="text-2xl sm:text-3xl font-bold text-gray-900 relative">
        {formatCurrency ? (
          <>
            ₹<AnimatedCounter value={value} />
          </>
        ) : (
          <AnimatedCounter value={value} />
        )}
      </div>
      <div className="text-xs text-gray-400 mt-1.5 relative">{subText}</div>
    </motion.div>
  )
}

function MiniMetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string | number
}) {
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -2 }}
      className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/80 p-4 transition-all hover:shadow-md"
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className="text-gray-400" />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="text-lg font-bold text-gray-900">
        {typeof value === 'number' ? <AnimatedCounter value={value} /> : value}
      </div>
    </motion.div>
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
    cyan: 'from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500',
    amber: 'from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500',
    purple: 'from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500',
  }

  return (
    <motion.div variants={itemVariants} whileHover={{ y: -3, scale: 1.01 }}>
      <Link
        href={href}
        className={`group block bg-gradient-to-r ${colorMap[color]} rounded-2xl p-5 text-white hover:shadow-xl transition-all relative overflow-hidden`}
      >
        {/* Shimmer */}
        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <div className="flex items-start justify-between mb-3 relative">
          <Icon size={24} className="text-white/70" />
          <ArrowRight
            size={18}
            className="text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all"
          />
        </div>
        <h3 className="font-semibold text-sm mb-1 relative">{title}</h3>
        <p className="text-xs text-white/70 relative">{description}</p>
      </Link>
    </motion.div>
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
      <div className="flex-1 bg-gray-100/80 rounded-full h-3 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(pct, 2)}%` }}
          transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
          className={`h-full rounded-full bg-gradient-to-r ${color}`}
        />
      </div>
      <span className="text-sm font-semibold text-gray-900 w-16 text-right">
        {value.toLocaleString('en-IN')}
      </span>
      <span className="text-xs text-gray-400 w-10 text-right">{pct}%</span>
    </div>
  )
}
