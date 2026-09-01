'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  IndianRupee,
  CreditCard,
  TrendingUp,
  Users,
  Activity,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

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
}

type PlanLimit = { plan: 'STARTER' | 'GROWTH' | 'PRO'; resource_type: string; limit_per_period: number }
type PlanPricing = { plan: 'STARTER' | 'GROWTH' | 'PRO'; monthly_paise: number }

// Same fallback convention as billing.ts: a missing plan-pricing/plan-limit
// row means the DB hasn't been seeded for that plan yet, so show the
// documented default instead of blank.
const PRICING_FALLBACK: Record<'STARTER' | 'GROWTH' | 'PRO', { monthly: string; products: string }> = {
  STARTER: { monthly: '₹4,999/mo', products: '500' },
  GROWTH: { monthly: '₹9,999/mo', products: '2,000' },
  PRO: { monthly: '₹14,999/mo', products: '∞' },
}
const PLAN_LABEL: Record<'STARTER' | 'GROWTH' | 'PRO', string> = {
  STARTER: 'Starter',
  GROWTH: 'Growth',
  PRO: 'Pro',
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 200, damping: 20 } },
}

export default function BillingPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [planLimits, setPlanLimits] = useState<PlanLimit[]>([])
  const [planPricing, setPlanPricing] = useState<PlanPricing[]>([])
  const [setupStatus, setSetupStatus] = useState('')
  const [setupLoading, setSetupLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const opts = adminGetOptions()
      const [s, u, pl, pp] = await Promise.all([
        fetch(`${API_URL}/v1/admin/stats`, opts).then((r) => r.json()),
        fetch(`${API_URL}/v1/admin/usage`, opts).then((r) => r.json()),
        fetch(`${API_URL}/v1/admin/plan-limits`, opts).then((r) => r.json()),
        fetch(`${API_URL}/v1/admin/plan-pricing`, opts).then((r) => r.json()),
      ])
      setStats(s.data)
      setUsage(u.data)
      setPlanLimits(pl.data ?? [])
      setPlanPricing(pp.data ?? [])
    }
    load()
  }, [])

  const paise = (n: number) => `₹${(n / 100).toLocaleString('en-IN')}`
  const pricingRows = (['STARTER', 'GROWTH', 'PRO'] as const).map((plan) => {
    const pricing = planPricing.find((p) => p.plan === plan)
    const products = planLimits.find((l) => l.plan === plan && l.resource_type === 'PRODUCT_UPLOAD')
    const fallback = PRICING_FALLBACK[plan]
    return {
      plan: PLAN_LABEL[plan],
      monthly: pricing ? `${paise(pricing.monthly_paise)}/mo` : fallback.monthly,
      // -1 means unlimited (same convention as plan-limits.tsx) — no row also means unlimited.
      products: products ? (products.limit_per_period === -1 ? '∞' : products.limit_per_period.toLocaleString('en-IN')) : fallback.products,
    }
  })

  const setupRazorpayPlans = async () => {
    setSetupLoading(true)
    setSetupStatus('Creating Razorpay plans...')
    try {
      const res = await fetch(`${API_URL}/v1/admin/billing/setup-plans`, {
        ...(await adminMutateOptions()),
        method: 'POST',
      })
      if (!res.ok) throw new Error('Setup failed')
      const json = await res.json()
      setSetupStatus(`✅ Created ${json.data.created}/3 Razorpay plans successfully`)
    } catch (err) {
      setSetupStatus(`❌ ${err instanceof Error ? err.message : 'Setup failed'}`)
    } finally {
      setSetupLoading(false)
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
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8 max-w-4xl"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
          <CreditCard size={20} className="text-cyan-500" />
        </div>
        <p className="text-sm text-gray-500">Revenue, subscriptions, and billing configuration</p>
      </motion.div>

      {/* Revenue metrics */}
      <motion.div variants={containerVariants} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <RevenueCard
          icon={IndianRupee}
          label="MRR"
          value={usage ? `₹${(usage.mrr_inr / 100).toLocaleString('en-IN')}` : '—'}
          subtext="Monthly recurring revenue"
          color="green"
        />
        <RevenueCard
          icon={Users}
          label="Subscribers"
          value={stats?.active_subscriptions.toLocaleString('en-IN') ?? '—'}
          subtext="Active paid subscriptions"
          color="blue"
        />
        <RevenueCard
          icon={TrendingUp}
          label="Conversion"
          value={`${conversionRate}%`}
          subtext={`Trial → paid: ${trialConversion}%`}
          color="amber"
        />
        <RevenueCard
          icon={Activity}
          label="ARPU"
          value={stats?.active_subscriptions ? `₹${(avgRevenue / 100).toLocaleString('en-IN')}` : '—'}
          subtext="Avg revenue per user/mo"
          color="purple"
        />
      </motion.div>

      {/* Razorpay setup */}
      <motion.div variants={itemVariants} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 hover:shadow-lg transition-shadow">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Razorpay Plans</h2>
        <p className="text-xs text-gray-500 mb-4">
          Create the 3 Razorpay monthly billing plans after configuring RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.
        </p>

        <div className="flex items-center gap-3">
          <motion.button
            onClick={setupRazorpayPlans}
            disabled={setupLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-cyan-500/25 disabled:opacity-60 flex items-center gap-2"
          >
            {setupLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Create Razorpay Plans
              </>
            )}
          </motion.button>
        </div>

        {setupStatus && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-3 text-sm rounded-xl px-4 py-3 border ${
              setupStatus.startsWith('✅')
                ? 'bg-green-50/80 border-green-200 text-green-700'
                : setupStatus.startsWith('❌')
                ? 'bg-red-50/80 border-red-200 text-red-600'
                : 'bg-gray-50/80 border-gray-200 text-gray-600'
            }`}
          >
            {setupStatus}
          </motion.div>
        )}

      </motion.div>

      {/* Pricing reference */}
      <motion.div variants={itemVariants} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 hover:shadow-lg transition-shadow">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Pricing Reference</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Plan</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Monthly (base ex-GST)</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Products</th>
              </tr>
            </thead>
            <tbody>
              {pricingRows.map((row, i) => (
                <motion.tr
                  key={row.plan}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`border-b border-gray-50 ${i === 2 ? 'last:border-0' : ''}`}
                >
                  <td className="px-3 py-3 font-semibold text-gray-900">{row.plan}</td>
                  <td className="px-3 py-3 text-right text-gray-600">{row.monthly}</td>
                  <td className="px-3 py-3 text-right text-gray-600">{row.products}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function RevenueCard({
  icon: Icon,
  label,
  value,
  subtext,
  color,
}: {
  icon: LucideIcon
  label: string
  value: string
  subtext: string
  color: 'green' | 'blue' | 'amber' | 'purple'
}) {
  const colorMap = {
    green: 'from-green-500/20 via-green-500/5 to-transparent',
    blue: 'from-blue-500/20 via-blue-500/5 to-transparent',
    amber: 'from-amber-500/20 via-amber-500/5 to-transparent',
    purple: 'from-purple-500/20 via-purple-500/5 to-transparent',
  }

  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -3, boxShadow: '0 12px 24px -8px rgba(0,0,0,0.1)' }}
      className="relative bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/80 p-5 transition-all overflow-hidden"
    >
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${colorMap[color]}`} />
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className={`${color === 'green' ? 'text-green-500' : color === 'blue' ? 'text-blue-500' : color === 'amber' ? 'text-amber-500' : 'text-purple-500'}`} />
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-400 mt-1">{subtext}</div>
    </motion.div>
  )
}
