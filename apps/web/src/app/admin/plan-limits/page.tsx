'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Gauge, Save, Loader2 } from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type Plan = 'STARTER' | 'GROWTH' | 'PRO'
type ResourceType =
  | 'PRODUCT_UPLOAD'
  | 'AI_TAGGING_CALL'
  | 'TRY_ON'
  | 'IMAGE_CROP'
  | 'BG_REMOVAL'
  | 'API_REQUEST'
type Period = 'DAY' | 'MONTH' | 'LIFETIME'

type PlanLimit = {
  id: string
  plan: Plan
  resource_type: ResourceType
  limit_per_period: number
  period: Period
}

const PLANS: Plan[] = ['STARTER', 'GROWTH', 'PRO']
const RESOURCE_TYPES: ResourceType[] = [
  'PRODUCT_UPLOAD',
  'AI_TAGGING_CALL',
  'TRY_ON',
  'IMAGE_CROP',
  'BG_REMOVAL',
  'API_REQUEST',
]
const PERIODS: Period[] = ['DAY', 'MONTH', 'LIFETIME']

function getHeaders() {
  const key = sessionStorage.getItem('admin_key')
  return { 'x-admin-key': key ?? '', 'Content-Type': 'application/json' }
}

// One editable cell per (plan, resource_type) pair. A missing row means
// "unlimited" (checkQuota fails open) — shown as blank, not zero.
type CellState = { limit_per_period: string; period: Period }

export default function PlanLimitsPage() {
  const [rows, setRows] = useState<PlanLimit[]>([])
  const [cells, setCells] = useState<Record<string, CellState>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const key = (plan: Plan, resourceType: ResourceType) => `${plan}:${resourceType}`

  useEffect(() => {
    async function load() {
      const res = await fetch(`${API_URL}/v1/admin/plan-limits`, { headers: getHeaders() })
      const json = await res.json()
      const data: PlanLimit[] = json.data ?? []
      setRows(data)

      const next: Record<string, CellState> = {}
      for (const row of data) {
        next[key(row.plan, row.resource_type)] = {
          limit_per_period: String(row.limit_per_period),
          period: row.period,
        }
      }
      setCells(next)
      setLoading(false)
    }
    load()
  }, [])

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
        method: 'PUT',
        headers: getHeaders(),
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
          <h1 className="text-2xl font-bold text-gray-900">Plan Limits</h1>
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
    </motion.div>
  )
}
