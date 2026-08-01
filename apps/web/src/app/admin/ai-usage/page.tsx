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

export default function AiUsagePage() {
  const [rows, setRows] = useState<UsageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`${API_URL}/v1/admin/ai-usage`, adminGetOptions())
    const json = await res.json()
    setRows(json.data ?? [])
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
          each retailer's tagging, color-detection and item-detection calls — useful for spotting
          quota pressure and tuning the AI Providers list.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
      </div>

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
