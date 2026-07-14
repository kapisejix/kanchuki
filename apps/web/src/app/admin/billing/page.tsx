'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  IndianRupee,
  CreditCard,
  TrendingUp,
  Users,
  Activity,
  DollarSign,
  Sparkles,
  BadgeCheck,
} from 'lucide-react'

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
  const [setupStatus, setSetupStatus] = useState('')
  const [setupLoading, setSetupLoading] = useState(false)

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
    setSetupLoading(true)
    setSetupStatus('Creating Razorpay plans...')
    try {
      const res = await fetch(`${API_URL}/v1/admin/billing/setup-plans`, {
        method: 'POST',
        headers: getHeaders(),
      })
      if (!res.ok) throw new Error('Setup failed')
      const json = await res.json()
      setSetupStatus(`✅ Created ${json.data.created}/6 Razorpay plans successfully`)
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

      {/* Cost analysis */}
      <motion.div variants={itemVariants} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 hover:shadow-lg transition-shadow">
        <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <DollarSign size={16} className="text-gray-400" />
          Cost Analysis
        </h2>
        <div className="space-y-4">
          <CostRow
            icon={DollarSign}
            label="GPU cost (this month)"
            value={`$${usage?.try_on_cost_usd.toFixed(2) ?? '0.00'}`}
          />
          <CostRow
            icon={Activity}
            label="Try-ons processed (month)"
            value={usage?.try_on_this_month.toLocaleString('en-IN') ?? '0'}
          />
          <CostRow
            icon={IndianRupee}
            label="Avg cost per try-on"
            value={usage && usage.try_on_this_month > 0
              ? `₹${((usage.try_on_cost_usd * 83) / usage.try_on_this_month).toFixed(2)}`
              : '—'
            }
            isLast
          />
        </div>
      </motion.div>

      {/* Razorpay setup */}
      <motion.div variants={itemVariants} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 hover:shadow-lg transition-shadow">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Razorpay Plans</h2>
        <p className="text-xs text-gray-500 mb-4">
          Create the 6 Razorpay billing plans (3 tiers × monthly/annual) after configuring RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.
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

        <p className="text-xs text-gray-400 mt-3 italic">
          ⏱ Razorpay webhook integration is deferred to production deployment.
        </p>
      </motion.div>

      {/* Pricing reference */}
      <motion.div variants={itemVariants} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 hover:shadow-lg transition-shadow">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Pricing Reference</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Plan</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Monthly</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Annual</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Products</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Try-Ons</th>
              </tr>
            </thead>
            <tbody>
              {[
                { plan: 'Starter', monthly: '₹999/mo', annual: '₹9,999/yr', products: '500', tryons: '0' },
                { plan: 'Growth', monthly: '₹2,499/mo', annual: '₹24,999/yr', products: '2,000', tryons: '100' },
                { plan: 'Pro', monthly: '₹4,999/mo', annual: '₹49,999/yr', products: '∞', tryons: '500' },
              ].map((row, i) => (
                <motion.tr
                  key={row.plan}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`border-b border-gray-50 ${i === 2 ? 'last:border-0' : ''}`}
                >
                  <td className="px-3 py-3 font-semibold text-gray-900">{row.plan}</td>
                  <td className="px-3 py-3 text-right text-gray-600">{row.monthly}</td>
                  <td className="px-3 py-3 text-right text-gray-600">{row.annual}</td>
                  <td className="px-3 py-3 text-right text-gray-600">{row.products}</td>
                  <td className="px-3 py-3 text-right text-gray-600">{row.tryons}</td>
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
  icon: React.ComponentType<{ size?: number; className?: string }>
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

function CostRow({ icon: Icon, label, value, isLast }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string; isLast?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 ${!isLast ? 'border-b border-gray-50' : ''}`}>
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-gray-400" />
        <span className="text-sm text-gray-600">{label}</span>
      </div>
      <span className="text-sm font-semibold text-gray-900">{value}</span>
    </div>
  )
}
