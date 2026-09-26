'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Gauge, IndianRupee, Save, Loader2, Users } from 'lucide-react'
import { PLAN_LIMIT_RESOURCE_TYPES, type PlanLimitResource } from '@kanchuki/shared'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type Plan = 'STARTER' | 'GROWTH' | 'PRO'
// From the shared constant — this page used to carry its own union AND array,
// which is how `TRY_ON_GENERATION` ended up settable nowhere (see the note on
// PLAN_LIMIT_RESOURCE_TYPES). Adding a resource is now one edit in one file.
type ResourceType = PlanLimitResource
type Period = 'DAY' | 'MONTH' | 'LIFETIME'

type PlanLimit = {
  id: string
  plan: Plan
  resource_type: ResourceType
  limit_per_period: number
  period: Period
}

type PlanPricing = {
  id: string
  plan: Plan
  monthly_paise: number
}

const PLANS: Plan[] = ['STARTER', 'GROWTH', 'PRO']
const RESOURCE_TYPES = PLAN_LIMIT_RESOURCE_TYPES
const PERIODS: Period[] = ['DAY', 'MONTH', 'LIFETIME']

// Customer-side rows come from the API, NOT from a list here: `GET
// /plan-limits/customer` returns one entry per resource with a customer-side
// writer (whether or not a row exists yet), so the screen can never offer a
// number the server would reject, nor hide one it would accept.
type CustomerLimitRow = {
  resource_type: string
  limit_per_period: number | null
  period: Period
  configured: boolean
}

// Blank while editing = "no row", which the server reads as unlimited — same
// convention as the plan cells above.
type CustomerCell = { limit_per_period: string; period: Period }

// One editable cell per (plan, resource_type) pair. A missing row means
// "unlimited" (checkQuota fails open) — shown as blank, not zero.
type CellState = { limit_per_period: string; period: Period }

// Rupees as strings while editing — paise only at the API boundary.
type PriceCellState = { monthly: string }
const paiseToRupees = (paise: number) => String(paise / 100)
const rupeesToPaise = (rupees: string) => Math.round(Number(rupees) * 100)

export default function PlanLimitsPage() {
  const [rows, setRows] = useState<PlanLimit[]>([])
  const [cells, setCells] = useState<Record<string, CellState>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const [priceCells, setPriceCells] = useState<Record<Plan, PriceCellState>>({
    STARTER: { monthly: '' },
    GROWTH: { monthly: '' },
    PRO: { monthly: '' },
  })
  const [savingPrice, setSavingPrice] = useState<Plan | null>(null)

  const [customerRows, setCustomerRows] = useState<CustomerLimitRow[]>([])
  const [customerCells, setCustomerCells] = useState<Record<string, CustomerCell>>({})
  const [savingCustomer, setSavingCustomer] = useState<string | null>(null)

  const key = (plan: Plan, resourceType: ResourceType) => `${plan}:${resourceType}`

  useEffect(() => {
    async function load() {
      const [limitsRes, pricingRes, customerRes] = await Promise.all([
        fetch(`${API_URL}/v1/admin/plan-limits`, adminGetOptions()),
        fetch(`${API_URL}/v1/admin/plan-pricing`, adminGetOptions()),
        fetch(`${API_URL}/v1/admin/plan-limits/customer`, adminGetOptions()),
      ])
      const limitsJson = await limitsRes.json()
      const data: PlanLimit[] = limitsJson.data ?? []
      setRows(data)

      const next: Record<string, CellState> = {}
      for (const row of data) {
        next[key(row.plan, row.resource_type)] = {
          limit_per_period: String(row.limit_per_period),
          period: row.period,
        }
      }
      setCells(next)

      const pricingJson = await pricingRes.json()
      const pricingData: PlanPricing[] = pricingJson.data ?? []
      setPriceCells((prev) => {
        const next: Record<Plan, PriceCellState> = { ...prev }
        for (const row of pricingData) {
          next[row.plan] = {
            monthly: paiseToRupees(row.monthly_paise),
          }
        }
        return next
      })

      const customerJson = await customerRes.json()
      const customerData: CustomerLimitRow[] = customerJson.data ?? []
      setCustomerRows(customerData)
      const nextCustomer: Record<string, CustomerCell> = {}
      for (const row of customerData) {
        nextCustomer[row.resource_type] = {
          // An unconfigured row shows BLANK, not "0" — 0 would read as a cap of
          // zero generations, the opposite of what a missing row means.
          limit_per_period: row.limit_per_period === null ? '' : String(row.limit_per_period),
          period: row.period,
        }
      }
      setCustomerCells(nextCustomer)

      setLoading(false)
    }
    load()
  }, [])

  const savePrice = async (plan: Plan) => {
    const cell = priceCells[plan]
    if (cell.monthly.trim() === '') {
      setStatus('❌ Enter monthly price')
      return
    }
    setSavingPrice(plan)
    setStatus('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/plan-pricing`, {
        ...(await adminMutateOptions()),
        method: 'PUT',
        body: JSON.stringify({
          plan,
          monthly_paise: rupeesToPaise(cell.monthly),
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      setStatus(`✅ ${plan} pricing saved`)
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Save failed'}`)
    } finally {
      setSavingPrice(null)
    }
  }

  const saveCustomer = async (resourceType: string) => {
    const cell = customerCells[resourceType] ?? { limit_per_period: '', period: 'MONTH' as Period }
    const limit = cell.limit_per_period.trim()
    if (limit === '') {
      setStatus('❌ Enter a number, or -1 for unlimited')
      return
    }

    setSavingCustomer(resourceType)
    setStatus('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/plan-limits/customer`, {
        ...(await adminMutateOptions()),
        method: 'PUT',
        body: JSON.stringify({
          resource_type: resourceType,
          limit_per_period: Number(limit),
          period: cell.period,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      const json = await res.json()
      setCustomerRows((prev) =>
        prev.map((row) =>
          row.resource_type === resourceType
            ? {
                ...row,
                limit_per_period: json.data.limit_per_period,
                period: json.data.period,
                configured: true,
              }
            : row,
        ),
      )
      // Re-seed the editable cell from the response as well. The field renders
      // from `customerCells`, not from the row, so without this the stored value
      // never reaches the screen: a number the API normalises (or bounds) would
      // keep displaying exactly what was typed, which is a quiet misreport of
      // the cap actually in force.
      setCustomerCells((prev) => ({
        ...prev,
        [resourceType]: {
          limit_per_period:
            json.data.limit_per_period === null ? '' : String(json.data.limit_per_period),
          period: json.data.period as Period,
        },
      }))
      setStatus(`✅ Customer ${resourceType} saved`)
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Save failed'}`)
    } finally {
      setSavingCustomer(null)
    }
  }

  const cellFor = (plan: Plan, resourceType: ResourceType): CellState =>
    cells[key(plan, resourceType)] ?? { limit_per_period: '', period: 'MONTH' }

  const updateCell = (plan: Plan, resourceType: ResourceType, patch: Partial<CellState>) => {
    setCells((prev) => ({
      ...prev,
      [key(plan, resourceType)]: { ...cellFor(plan, resourceType), ...patch },
    }))
  }

  const save = async (plan: Plan, resourceType: ResourceType) => {
    const cell = cellFor(plan, resourceType)
    const limit = cell.limit_per_period.trim()
    if (limit === '') {
      setStatus('❌ Enter a number, or -1 for unlimited')
      return
    }

    const k = key(plan, resourceType)
    setSaving(k)
    setStatus('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/plan-limits`, {
        ...(await adminMutateOptions()),
        method: 'PUT',
        body: JSON.stringify({
          plan,
          resource_type: resourceType,
          limit_per_period: Number(limit),
          period: cell.period,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      const json = await res.json()
      setRows((prev) => {
        const others = prev.filter((r) => !(r.plan === plan && r.resource_type === resourceType))
        return [...others, json.data]
      })
      setStatus(`✅ ${plan} / ${resourceType} saved`)
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
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-5xl">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Plan Limits &amp; Pricing</h1>
          <Gauge size={20} className="text-cyan-500" />
        </div>
        <p className="text-sm text-gray-500">
          Quota per plan/resource (F-010). Blank = unlimited — no row means checkQuota() never blocks it.
          Set <span className="font-mono">-1</span> for explicit unlimited.
        </p>
      </div>

      {status && (
        <div
          className={`text-sm rounded-xl px-4 py-3 border ${
            status.startsWith('✅')
              ? 'bg-green-50/80 border-green-200 text-green-700'
              : 'bg-red-50/80 border-red-200 text-red-600'
          }`}
        >
          {status}
        </div>
      )}

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 overflow-x-auto">
        <div className="flex items-center gap-2 mb-4">
          <IndianRupee size={16} className="text-cyan-500" />
          <h2 className="text-sm font-semibold text-gray-900">Plan Pricing</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Base price per month (ex-GST). Razorpay charges base + 18% GST. Changing this does not re-price
          existing Razorpay subscription plans — re-run &quot;Setup Razorpay Plans&quot; and update the
          RAZORPAY_PLAN_* env vars after editing.
        </p>
        <table className="w-full text-sm mb-2">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Plan</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Monthly (₹, base ex-GST)</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {PLANS.map((plan) => (
              <tr key={plan} className="border-b border-gray-50">
                <td className="px-3 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{plan}</td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    value={priceCells[plan].monthly}
                    onChange={(e) =>
                      setPriceCells((prev) => ({ ...prev, [plan]: { ...prev[plan], monthly: e.target.value } }))
                    }
                    className="w-24 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                </td>

                <td className="px-3 py-2">
                  <button
                    onClick={() => savePrice(plan)}
                    disabled={savingPrice === plan}
                    className="p-1.5 text-gray-400 hover:text-cyan-600 disabled:opacity-50 transition-colors"
                    aria-label={`Save ${plan} pricing`}
                  >
                    {savingPrice === plan ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Resource</th>
              {PLANS.map((plan) => (
                <th key={plan} className="text-left px-3 py-2 text-xs font-semibold text-gray-500">
                  {plan}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RESOURCE_TYPES.map((resourceType) => (
              <tr key={resourceType} className="border-b border-gray-50">
                <td className="px-3 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{resourceType}</td>
                {PLANS.map((plan) => {
                  const cell = cellFor(plan, resourceType)
                  const k = key(plan, resourceType)
                  return (
                    <td key={plan} className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          value={cell.limit_per_period}
                          onChange={(e) => updateCell(plan, resourceType, { limit_per_period: e.target.value })}
                          placeholder="unlimited"
                          className="w-20 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                        />
                        <select
                          value={cell.period}
                          onChange={(e) => updateCell(plan, resourceType, { period: e.target.value as Period })}
                          className="px-1.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                        >
                          {PERIODS.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => save(plan, resourceType)}
                          disabled={saving === k}
                          className="p-1.5 text-gray-400 hover:text-cyan-600 disabled:opacity-50 transition-colors"
                          aria-label={`Save ${plan} ${resourceType}`}
                        >
                          {saving === k ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Save size={14} />
                          )}
                        </button>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 overflow-x-auto">
        <div className="flex items-center gap-2 mb-4">
          <Users size={16} className="text-cyan-500" />
          <h2 className="text-sm font-semibold text-gray-900">Customer Limits</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Per-SHOPPER caps (F-040). A shopper has no plan, so this is one number for the whole
          platform rather than a column per tier. A try-on counts against the shopper&apos;s cap AND the
          store&apos;s own TRY_ON_GENERATION limit above — the two are separate on purpose, and whichever
          runs out first is the one the shopper is told about. Blank = no row = unlimited.
        </p>
        {customerRows.length === 0 ? (
          <p className="text-xs text-gray-400">No customer-metered resources yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Resource</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Per shopper</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Period</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {customerRows.map((row) => {
                const cell = customerCells[row.resource_type] ?? {
                  limit_per_period: '',
                  period: 'MONTH' as Period,
                }
                return (
                  <tr key={row.resource_type} className="border-b border-gray-50">
                    <td className="px-3 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">
                      {row.resource_type}
                      {/* Says which rows are live vs merely listable — an
                          unseeded resource fails open, so "blank" here means
                          no cap in force, not a cap of zero. */}
                      {!row.configured && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600">
                          not set
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={cell.limit_per_period}
                        onChange={(e) =>
                          setCustomerCells((prev) => ({
                            ...prev,
                            [row.resource_type]: { ...cell, limit_per_period: e.target.value },
                          }))
                        }
                        placeholder="unlimited"
                        aria-label={`${row.resource_type} per-shopper limit`}
                        className="w-24 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={cell.period}
                        onChange={(e) =>
                          setCustomerCells((prev) => ({
                            ...prev,
                            [row.resource_type]: { ...cell, period: e.target.value as Period },
                          }))
                        }
                        aria-label={`${row.resource_type} period`}
                        className="px-1.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                      >
                        {PERIODS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => saveCustomer(row.resource_type)}
                        disabled={savingCustomer === row.resource_type}
                        className="p-1.5 text-gray-400 hover:text-cyan-600 disabled:opacity-50 transition-colors"
                        aria-label={`Save customer ${row.resource_type}`}
                      >
                        {savingCustomer === row.resource_type ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Save size={14} />
                        )}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  )
}
