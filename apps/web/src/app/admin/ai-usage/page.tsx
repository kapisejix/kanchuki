'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, Loader2 } from 'lucide-react'
import { adminGetOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type UsageRow = {
  retailer_id: string
  retailer_name: string | null
  city: string | null
  plan: 'STARTER' | 'GROWTH' | 'PRO' | null
  provider_type: 'ANTHROPIC' | 'OPENAI_COMPAT' | 'GEMINI'
  model_name: string
  resource_type: string
  calls: number
  credits_used: number
}

type PlanLimitRow = { plan: string; resource_type: string; limit_per_period: number; period: string }

// Estimated ₹ per call (decision sheet 3, 2026-10-24): spec unit costs, not invoices.
// Tagging uses the Claude figure; gpt-4o-mini is cheaper, so this over-estimates.
const COST_PER_TAG_INR = 0.33
const COST_PER_STUDIO_INR = 3.5
const TAGGING_RESOURCES = new Set(['AI_TAGGING_CALL', 'AI_COLOR_DETECT', 'AI_ITEM_DETECT'])

type RetailerRollup = {
  retailer_id: string
  retailer_name: string | null
  city: string | null
  plan: UsageRow['plan']
  tagging_calls: number
  studio_shoots: number
  est_cost_inr: number
}

function rollupByRetailer(rows: UsageRow[]): RetailerRollup[] {
  const map = new Map<string, RetailerRollup>()
  for (const r of rows) {
    const acc = map.get(r.retailer_id) ?? {
      retailer_id: r.retailer_id,
      retailer_name: r.retailer_name,
      city: r.city,
      plan: r.plan,
      tagging_calls: 0,
      studio_shoots: 0,
      est_cost_inr: 0,
    }
    if (TAGGING_RESOURCES.has(r.resource_type)) {
      acc.tagging_calls += r.calls
      acc.est_cost_inr += r.calls * COST_PER_TAG_INR
    } else if (r.resource_type.startsWith('STUDIO_SHOOT_')) {
      acc.studio_shoots += r.calls
      acc.est_cost_inr += r.calls * COST_PER_STUDIO_INR
    }
    map.set(r.retailer_id, acc)
  }
  return Array.from(map.values()).sort((a, b) => b.est_cost_inr - a.est_cost_inr)
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`

export default function AiUsagePage() {
  const [rows, setRows] = useState<UsageRow[]>([])
  const [limits, setLimits] = useState<PlanLimitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    const [res, limitsRes] = await Promise.all([
      fetch(`${API_URL}/v1/admin/ai-usage`, adminGetOptions()),
      fetch(`${API_URL}/v1/admin/plan-limits`, adminGetOptions()),
    ])
    const json = await res.json()
    setRows(json.data ?? [])
    // Limits are only for the "% used" column; the grid still renders without them.
    if (limitsRes.ok) setLimits((await limitsRes.json()).data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-cyan-500" />
      </div>
    )
  }

  const totalCredits = rows.reduce((sum, r) => sum + r.credits_used, 0)
  const totalCalls = rows.reduce((sum, r) => sum + r.calls, 0)
  const rollups = rollupByRetailer(rows)
  const totalCost = rollups.reduce((sum, r) => sum + r.est_cost_inr, 0)
  // AI_TAGGING_CALL is a LIFETIME limit, and this page reads all-time usage, so the
  // two compare directly. Studio limits are monthly, so no % is shown for Studio.
  const taggingLimit = (plan: UsageRow['plan']) =>
    limits.find((l) => l.plan === plan && l.resource_type === 'AI_TAGGING_CALL' && l.period === 'LIFETIME')
      ?.limit_per_period

  const filtered = search.trim()
    ? rows.filter((r) =>
        `${r.retailer_name ?? ''} ${r.city ?? ''} ${r.model_name} ${r.resource_type}`.toLowerCase().includes(search.toLowerCase()),
      )
    : rows

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">AI Usage</h1>
          <BarChart3 size={20} className="text-cyan-500" />
        </div>
        <p className="text-sm text-gray-500">
          Per-retailer × per-model AI consumption (weighted credits). Shows exactly which AI served
          each retailer&apos;s tagging, color-detection and item-detection calls — useful for spotting
          quota pressure and tuning the AI Providers list.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4">
          <p className="text-xs text-gray-500 font-medium">Total credits used</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalCredits.toLocaleString()}</p>
        </div>
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4">
          <p className="text-xs text-gray-500 font-medium">Total AI calls</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalCalls.toLocaleString()}</p>
        </div>
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4">
          <p className="text-xs text-gray-500 font-medium">Retailers with usage</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {new Set(rows.map((r) => r.retailer_id)).size}
          </p>
        </div>
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4">
          <p className="text-xs text-gray-500 font-medium">Estimated cost (all time)</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{inr(totalCost)}</p>
        </div>
      </div>

      {rollups.length > 0 && (
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Per retailer</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Estimated cost uses ₹{COST_PER_TAG_INR}/tagging call and ₹{COST_PER_STUDIO_INR}/Studio shoot
              (spec unit costs, not invoices). Tagging % is against the plan&apos;s lifetime limit.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-3 font-medium">Retailer</th>
                  <th className="px-4 py-3 font-medium text-right">Tagging calls</th>
                  <th className="px-4 py-3 font-medium text-right">Tagging limit used</th>
                  <th className="px-4 py-3 font-medium text-right">Studio shoots</th>
                  <th className="px-4 py-3 font-medium text-right">Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {rollups.map((r) => {
                  const limit = taggingLimit(r.plan)
                  const pct = limit && limit > 0 ? Math.round((r.tagging_calls / limit) * 100) : null
                  return (
                    <tr key={r.retailer_id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{r.retailer_name ?? r.retailer_id}</p>
                        <p className="text-[10px] text-gray-400">{[r.city, r.plan].filter(Boolean).join(' · ')}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{r.tagging_calls.toLocaleString()}</td>
                      <td className={`px-4 py-3 text-right ${pct !== null && pct >= 80 ? 'font-semibold text-amber-600' : 'text-gray-700'}`}>
                        {pct === null ? '—' : `${pct}% of ${limit!.toLocaleString()}`}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{r.studio_shoots.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{inr(r.est_cost_inr)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by retailer, city, model…"
            className="w-full sm:w-80 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">
            No AI usage recorded yet. Tagging and color-detection calls will appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-3 font-medium">Retailer</th>
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Resource</th>
                  <th className="px-4 py-3 font-medium text-right">Calls</th>
                  <th className="px-4 py-3 font-medium text-right">Credits</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={`${r.retailer_id}-${r.provider_type}-${r.model_name}-${r.resource_type}-${i}`} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{r.retailer_name ?? r.retailer_id}</p>
                      <p className="text-[10px] text-gray-400">
                        {[r.city, r.plan].filter(Boolean).join(' · ')}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.model_name}</td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                        {r.provider_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">{r.resource_type}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{r.calls.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {r.credits_used.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  )
}
