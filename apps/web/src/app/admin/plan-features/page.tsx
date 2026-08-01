'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { CheckSquare, Square, Save, Loader2, Sparkles } from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type Plan = 'STARTER' | 'GROWTH' | 'PRO'
type FeatureKey =
  | 'BULK_ONBOARDING_IMPORT'
  | 'CUSTOM_BACKGROUND_LIBRARY'
  | 'SPIN_360'
  | 'VIRTUAL_TRY_ON'
  | 'WHATSAPP_BUSINESS_API'
  | 'CHECKOUT_CART'
  | 'DATA_EXPORT_CSV'
  | 'CUSTOM_BRANDING'
  | 'GHOST_MANNEQUIN_AI'
  | 'RAZORPAY_ROUTE'
  | 'API_ACCESS'
  | 'PRIORITY_AI_QUEUE'
  | 'MULTI_STORE'

type PlanFeature = {
  id: string
  plan: Plan
  feature_key: FeatureKey
  enabled: boolean
}

const PLANS: Plan[] = ['STARTER', 'GROWTH', 'PRO']

const FEATURES: { key: FeatureKey; label: string; description: string }[] = [
  { key: 'SPIN_360', label: '360° Product Spin', description: 'Full-screen 360° product view' },
  { key: 'BULK_ONBOARDING_IMPORT', label: 'Bulk Onboarding Import', description: 'Rack/shelf batch photo + PDF catalog import' },
  { key: 'CUSTOM_BACKGROUND_LIBRARY', label: 'Custom Background Library', description: 'Admin-curated product photo backdrops' },
  { key: 'VIRTUAL_TRY_ON', label: 'Virtual Try-On', description: 'AI-powered outfit preview on customer photos' },
  { key: 'WHATSAPP_BUSINESS_API', label: 'WhatsApp Business API', description: 'Bring-your-own Meta credentials for bulk-send' },
  { key: 'CHECKOUT_CART', label: 'Shopping Cart / Checkout', description: 'Online checkout with Razorpay payments' },
  { key: 'DATA_EXPORT_CSV', label: 'Data Export (CSV)', description: 'Export product/customer data to CSV' },
  { key: 'CUSTOM_BRANDING', label: 'Custom Branding', description: 'Custom logo/branding on collection pages' },
  { key: 'GHOST_MANNEQUIN_AI', label: 'Ghost Mannequin AI', description: 'AI-generated worn catalog images via Snappyit' },
  { key: 'RAZORPAY_ROUTE', label: 'Razorpay Route', description: 'Marketplace split-payment settlement' },
  { key: 'API_ACCESS', label: 'API Access', description: 'External API access for third-party integrations' },
  { key: 'PRIORITY_AI_QUEUE', label: 'Priority AI Queue', description: 'Faster AI tagging queue priority' },
  { key: 'MULTI_STORE', label: 'Multi-Store', description: 'Manage multiple store locations' },
]

const PLAN_LABELS: Record<Plan, { name: string; price: string; color: string }> = {
  STARTER: { name: 'Starter', price: '₹999/mo', color: 'border-gray-200 bg-gray-50/50' },
  GROWTH: { name: 'Growth', price: '₹2,499/mo', color: 'border-cyan-200 bg-cyan-50/30' },
  PRO: { name: 'Pro', price: '₹4,999/mo', color: 'border-purple-200 bg-purple-50/30' },
}

const PLAN_ACCENT: Record<Plan, string> = {
  STARTER: 'from-gray-500 to-gray-600',
  GROWTH: 'from-cyan-500 to-blue-500',
  PRO: 'from-purple-500 to-pink-500',
}

// ─── Page ──────────────────────────────────────────────────────────────

export default function PlanFeaturesPage() {
  const [rows, setRows] = useState<PlanFeature[]>([])
  const [cells, setCells] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

  const key = (plan: Plan, featureKey: FeatureKey) => `${plan}:${featureKey}`

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_URL}/v1/admin/plan-features`, adminGetOptions())
        const json = await res.json()
        const data: PlanFeature[] = json.data ?? []
        setRows(data)

        const next: Record<string, boolean> = {}
        for (const row of data) {
          next[key(row.plan, row.feature_key as FeatureKey)] = row.enabled
        }
        setCells(next)
      } catch {
        setStatus('Failed to load plan features')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const isEnabled = (plan: Plan, featureKey: FeatureKey): boolean =>
    cells[key(plan, featureKey)] ?? false

  const toggle = (plan: Plan, featureKey: FeatureKey) => {
    setCells((prev) => ({
      ...prev,
      [key(plan, featureKey)]: !isEnabled(plan, featureKey),
    }))
  }

  const save = async (plan: Plan, featureKey: FeatureKey) => {
    const enabled = isEnabled(plan, featureKey)
    const k = key(plan, featureKey)
    setSaving(k)
    setStatus('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/plan-features`, {
        ...(await adminMutateOptions()),
        method: 'PUT',
        body: JSON.stringify({ plan, feature_key: featureKey, enabled }),
      })
      if (!res.ok) throw new Error('Save failed')
      const json = await res.json()
      setRows((prev) => {
        const others = prev.filter((r) => !(r.plan === plan && r.feature_key === featureKey))
        return [...others, json.data]
      })
      setStatus(`✅ ${FEATURES.find((f) => f.key === featureKey)?.label} — ${PLAN_LABELS[plan].name}: ${enabled ? 'ON' : 'OFF'}`)
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Save failed'}`)
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-cyan-500" />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Plan Features</h1>
          <motion.div
            animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
          >
            <Sparkles size={20} className="text-cyan-500" />
          </motion.div>
        </div>
        <p className="text-sm text-gray-500">
          Boolean feature flags per plan tier (F-013). <strong>Fails closed</strong> — a feature with no row is OFF by default.
          Unlike plan limits (F-010) where missing row = unlimited, a missing PlanFeature row = feature disabled.
          Toggle any cell to enable/disable a feature for a plan.
        </p>
      </div>

      {/* Status message */}
      {status && (
        <div
          className={`text-sm rounded-xl px-4 py-3 border ${
            status.startsWith('✅')
              ? 'bg-green-50/80 border-green-200 text-green-700'
              : status.startsWith('❌')
                ? 'bg-red-50/80 border-red-200 text-red-600'
                : 'bg-amber-50/80 border-amber-200 text-amber-700'
          }`}
        >
          {status}
        </div>
      )}

      {/* Feature grid */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-5 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[280px]">
                  Feature
                </th>
                {PLANS.map((plan) => (
                  <th
                    key={plan}
                    className={`text-center px-4 py-4 text-xs font-semibold uppercase tracking-wider border-l border-gray-100 ${
                      plan === 'GROWTH' ? 'text-cyan-600' : plan === 'PRO' ? 'text-purple-600' : 'text-gray-500'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span>{PLAN_LABELS[plan].name}</span>
                      <span className="text-[10px] font-normal opacity-70">{PLAN_LABELS[plan].price}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((feature, fi) => (
                <motion.tr
                  key={feature.key}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: fi * 0.03 }}
                  className="border-b border-gray-50 hover:bg-gray-50/40 transition-colors"
                >
                  <td className="px-5 py-4">
                    <div>
                      <span className="font-medium text-gray-900 text-sm">{feature.label}</span>
                      <p className="text-xs text-gray-400 mt-0.5">{feature.description}</p>
                    </div>
                  </td>
                  {PLANS.map((plan) => {
                    const enabled = isEnabled(plan, feature.key)
                    const k = key(plan, feature.key)
                    const isSaving = saving === k

                    return (
                      <td key={plan} className="px-4 py-4 text-center border-l border-gray-50">
                        <div className="flex items-center justify-center gap-2">
                          <motion.button
                            onClick={() => toggle(plan, feature.key)}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            className={`p-1.5 rounded-lg transition-all ${
                              enabled
                                ? 'text-cyan-600 hover:bg-cyan-50'
                                : 'text-gray-300 hover:text-gray-400 hover:bg-gray-100'
                            }`}
                            aria-label={`Toggle ${feature.label} for ${plan}`}
                          >
                            {enabled ? (
                              <CheckSquare size={20} className="text-cyan-600" />
                            ) : (
                              <Square size={20} />
                            )}
                          </motion.button>

                          <motion.button
                            onClick={() => save(plan, feature.key)}
                            disabled={isSaving}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className={`p-1.5 rounded-lg transition-all ${
                              enabled
                                ? 'text-cyan-600 hover:bg-cyan-50'
                                : 'text-gray-300 hover:text-gray-400 hover:bg-gray-100'
                            } disabled:opacity-50`}
                            aria-label={`Save ${feature.label} for ${plan}`}
                          >
                            {isSaving ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Save size={14} />
                            )}
                          </motion.button>
                        </div>

                        {/* Enabled indicator */}
                        {enabled && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="mt-1"
                          >
                            <div className={`inline-flex h-1.5 w-12 rounded-full bg-gradient-to-r ${PLAN_ACCENT[plan]}`} />
                          </motion.div>
                        )}
                        {!enabled && (
                          <div className="mt-1 text-[10px] text-gray-300 font-medium">OFF</div>
                        )}
                      </td>
                    )
                  })}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  )
}
